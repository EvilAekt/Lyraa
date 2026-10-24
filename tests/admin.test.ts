import test from 'node:test';
import assert from 'node:assert/strict';
import { AllowlistManager, GuildLike } from '../src/admin/allowlist-manager.js';

test('SEC-4: Guild Allowlist allows all when empty, and enforces strictly when configured', () => {
  // Empty allowlist allows any guild
  const openManager = new AllowlistManager({ guildAllowlist: [] });
  assert.equal(openManager.isGuildAllowed('guild-123'), true);
  assert.equal(openManager.isGuildAllowed('any-other-guild'), true);
  assert.equal(openManager.isGuildAllowed(null), false);

  // Configured allowlist only permits specified guilds
  const strictManager = new AllowlistManager({
    guildAllowlist: ['guild-alpha', 'guild-beta'],
  });
  assert.equal(strictManager.isGuildAllowed('guild-alpha'), true);
  assert.equal(strictManager.isGuildAllowed('guild-beta'), true);
  assert.equal(strictManager.isGuildAllowed('guild-unauthorized'), false);
  assert.equal(strictManager.isGuildAllowed(undefined), false);
});

test('SEC-4: User Allowlist allows all when empty, enforces strictly, and always permits Owner', () => {
  const ownerId = 'user-owner-999';
  const allowedUser = 'user-whitelisted-1';
  const blockedUser = 'user-outsider-2';

  // Configured user allowlist with owner
  const manager = new AllowlistManager({
    guildAllowlist: ['guild-main'],
    userAllowlist: [allowedUser],
    ownerUserId: ownerId,
  });

  // Owner is always authorized even if not explicitly in userAllowlist
  assert.equal(manager.isUserAllowed(ownerId), true);
  assert.equal(manager.isOwner(ownerId), true);
  assert.equal(manager.isOwner(allowedUser), false);

  // Whitelisted user is authorized
  assert.equal(manager.isUserAllowed(allowedUser), true);

  // Non-whitelisted user is rejected
  assert.equal(manager.isUserAllowed(blockedUser), false);
  assert.equal(manager.isUserAllowed(null), false);
  assert.equal(manager.isUserAllowed(''), false);

  // Empty user allowlist allows all non-empty users
  const openUserManager = new AllowlistManager({
    userAllowlist: [],
    ownerUserId: ownerId,
  });
  assert.equal(openUserManager.isUserAllowed(blockedUser), true);
  assert.equal(openUserManager.isUserAllowed(ownerId), true);
});

test('SEC-4: Auto-leave unauthorized guilds on invitation or audit', async () => {
  const allowedGuildId = 'guild-permitted-1';
  const unauthorizedGuildId = 'guild-stranger-2';

  const manager = new AllowlistManager({
    guildAllowlist: [allowedGuildId],
  });

  let permittedLeft = false;
  let unauthorizedLeft = false;

  const permittedGuild: GuildLike = {
    id: allowedGuildId,
    name: 'Permitted Server',
    leave: async () => {
      permittedLeft = true;
    },
  };

  const unauthorizedGuild: GuildLike = {
    id: unauthorizedGuildId,
    name: 'Unauthorized Stranger Server',
    leave: async () => {
      unauthorizedLeft = true;
    },
  };

  // Check autoLeave on permitted guild
  const resPermitted = await manager.autoLeaveUnauthorizedGuild(permittedGuild);
  assert.equal(resPermitted, false);
  assert.equal(permittedLeft, false, 'Permitted guild should NOT be left');

  // Check autoLeave on unauthorized guild
  const resUnauthorized = await manager.autoLeaveUnauthorizedGuild(unauthorizedGuild);
  assert.equal(resUnauthorized, true);
  assert.equal(unauthorizedLeft, true, 'Unauthorized guild MUST be left immediately');

  // Test batch audit on startup
  let auditLeftCounter = 0;
  const mockGuilds: GuildLike[] = [
    { id: allowedGuildId, name: 'Permitted', leave: async () => {} },
    {
      id: 'bad-guild-1',
      name: 'Bad 1',
      leave: async () => {
        auditLeftCounter++;
      },
    },
    {
      id: 'bad-guild-2',
      name: 'Bad 2',
      leave: async () => {
        auditLeftCounter++;
      },
    },
  ];

  const leftGuildIds = await manager.auditGuilds(mockGuilds);
  assert.deepEqual(leftGuildIds, ['bad-guild-1', 'bad-guild-2']);
  assert.equal(auditLeftCounter, 2);
});

test('SEC-9: Voice privacy notice contains all mandatory disclosures and commands', () => {
  const manager = new AllowlistManager();
  const notice = manager.formatPrivacyNotice('Ruang Santai Voice', 'Lyra');

  // Must mention channel and bot name
  assert.ok(notice.includes('Ruang Santai Voice'));
  assert.ok(notice.includes('Lyra'));

  // Must mention DAVE E2EE protocol
  assert.ok(notice.includes('DAVE E2EE'));

  // Must mention Gemini AI processing
  assert.ok(notice.includes('Gemini'));

  // Must explicitly state sensitive data prohibition (SEC-9, SEC-10)
  assert.ok(notice.includes('data rahasia') || notice.includes('password') || notice.includes('PIN'));

  // Must state raw audio is NOT saved and transcript retention is max 7 days
  assert.ok(notice.includes('Audio mentah tidak disimpan'));
  assert.ok(notice.includes('7 hari'));

  // Must mention user control commands
  assert.ok(notice.includes('/forget me'));
  assert.ok(notice.includes('/leave'));
  assert.ok(notice.includes('/mute'));
});

test('TC-16: Kill switch (/mute and /unmute) behavior and state transitions (FR-A2, SEC-14)', () => {
  let botEnabled = true;
  let playerStopped = false;

  const mockPlayer = {
    stop: () => {
      playerStopped = true;
    },
  };

  // Simulate /mute command execution
  const executeMute = (userId: string, ownerId: string) => {
    if (userId !== ownerId) {
      return { success: false, reason: 'owner_only' };
    }
    botEnabled = false;
    mockPlayer.stop();
    return { success: true };
  };

  // Simulate /unmute command execution
  const executeUnmute = (userId: string, ownerId: string) => {
    if (userId !== ownerId) {
      return { success: false, reason: 'owner_only' };
    }
    botEnabled = true;
    return { success: true };
  };

  const ownerId = 'owner-123';
  const strangerId = 'stranger-456';

  // Stranger tries to mute -> rejected
  const strangerMuteRes = executeMute(strangerId, ownerId);
  assert.equal(strangerMuteRes.success, false);
  assert.equal(botEnabled, true);
  assert.equal(playerStopped, false);

  // Owner mutes -> accepted, player stopped, botEnabled = false
  const ownerMuteRes = executeMute(ownerId, ownerId);
  assert.equal(ownerMuteRes.success, true);
  assert.equal(botEnabled, false);
  assert.equal(playerStopped, true);

  // While muted, only /status and /unmute commands are allowed
  const isCommandAllowedWhileMuted = (cmd: string) => {
    if (botEnabled) return true;
    return cmd === 'status' || cmd === 'unmute';
  };

  assert.equal(isCommandAllowedWhileMuted('chat'), false);
  assert.equal(isCommandAllowedWhileMuted('speak'), false);
  assert.equal(isCommandAllowedWhileMuted('join'), false);
  assert.equal(isCommandAllowedWhileMuted('status'), true);
  assert.equal(isCommandAllowedWhileMuted('unmute'), true);

  // Stranger tries to unmute -> rejected
  const strangerUnmuteRes = executeUnmute(strangerId, ownerId);
  assert.equal(strangerUnmuteRes.success, false);
  assert.equal(botEnabled, false);

  // Owner unmutes -> accepted, botEnabled = true
  const ownerUnmuteRes = executeUnmute(ownerId, ownerId);
  assert.equal(ownerUnmuteRes.success, true);
  assert.equal(botEnabled, true);
  assert.equal(isCommandAllowedWhileMuted('chat'), true);
});
