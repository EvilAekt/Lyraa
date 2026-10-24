import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TextGatingEngine,
  sanitizeMentions,
  EMPTY_ALLOWED_MENTIONS,
  TextGatingContext,
} from '../src/chat/text-gating.js';

test('TC-14: Mention Safety sanitizes @everyone, @here, and role pings', () => {
  assert.deepEqual(EMPTY_ALLOWED_MENTIONS, { parse: [] });

  const textWithEveryone = 'Halo @everyone, ada kabar gembira!';
  const sanitizedEveryone = sanitizeMentions(textWithEveryone);
  assert.equal(sanitizedEveryone, 'Halo @\u200beveryone, ada kabar gembira!');
  assert.ok(!sanitizedEveryone.includes('@everyone'));

  const textWithHere = 'Pengumuman untuk @here sekarang.';
  const sanitizedHere = sanitizeMentions(textWithHere);
  assert.equal(sanitizedHere, 'Pengumuman untuk @\u200bhere sekarang.');
  assert.ok(!sanitizedHere.includes('@here'));

  const textWithRole = 'Panggilan untuk role <@&112233445566>!';
  const sanitizedRole = sanitizeMentions(textWithRole);
  assert.equal(sanitizedRole, 'Panggilan untuk role [@role-112233445566]!');
  assert.ok(!sanitizedRole.includes('<@&'));
});

test('TC-10: 20 mixed text chat messages evaluated against gating rules (FR-T1, FR-T2)', () => {
  const botUserId = '999999999';
  const dedicatedChannelId = 'ch-ai-chat-id';
  const generalChannelId = 'ch-general-id';

  const engine = new TextGatingEngine({
    botNames: ['Lyra', 'Lira', 'Airi', 'Bot'],
    dedicatedChannelNames: ['chat-ai', 'bot-chat'],
    dedicatedChannelIds: [dedicatedChannelId],
    cooldownMs: 3000,
    rateLimitPerMin: 6,
    botEnabled: true,
  });

  const baseTime = 1700000000000;

  // 20 realistic mixed messages (TC-10)
  const scenarios: Array<{
    name: string;
    context: TextGatingContext;
    expectedAllowed: boolean;
    expectedReason: string;
    expectedTrigger?: string;
  }> = [
    // 1. General channel: regular chit-chat between users
    {
      name: '1. Casual chatter between users in general channel',
      context: {
        authorId: 'user-1',
        authorIsBot: false,
        content: 'Halo bro lagi ngapain sekarang?',
        channelId: generalChannelId,
        channelName: 'general',
        botUserId,
        now: baseTime,
      },
      expectedAllowed: false,
      expectedReason: 'not_for_bot',
    },
    // 2. Message from another bot
    {
      name: '2. Message from another bot in dedicated channel',
      context: {
        authorId: 'github-bot',
        authorIsBot: true,
        content: 'New commit pushed to repository',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 100,
      },
      expectedAllowed: false,
      expectedReason: 'bot_sender',
    },
    // 3. Direct mention in general channel
    {
      name: '3. Direct mention in general channel',
      context: {
        authorId: 'user-2',
        authorIsBot: false,
        content: `<@${botUserId}> apa kabar hari ini?`,
        channelId: generalChannelId,
        channelName: 'general',
        botUserId,
        mentionedUsers: [botUserId],
        now: baseTime + 200,
      },
      expectedAllowed: true,
      expectedReason: 'matched_mention',
      expectedTrigger: 'mention',
    },
    // 4. Nickname mention in general channel (<@!botId>)
    {
      name: '4. Nickname mention in general channel',
      context: {
        authorId: 'user-3',
        authorIsBot: false,
        content: `<@!${botUserId}> siapa namamu?`,
        channelId: generalChannelId,
        channelName: 'general',
        botUserId,
        now: baseTime + 300,
      },
      expectedAllowed: true,
      expectedReason: 'matched_mention',
      expectedTrigger: 'mention',
    },
    // 5. Reply to bot's previous message
    {
      name: '5. Reply to bot message in general channel',
      context: {
        authorId: 'user-4',
        authorIsBot: false,
        content: 'Iya bener banget penjelasanmu tadi',
        channelId: generalChannelId,
        channelName: 'general',
        botUserId,
        isReplyToBot: true,
        now: baseTime + 400,
      },
      expectedAllowed: true,
      expectedReason: 'matched_reply',
      expectedTrigger: 'reply',
    },
    // 6. Explicit prefix command !chat
    {
      name: '6. Explicit !chat prefix in any channel',
      context: {
        authorId: 'user-5',
        authorIsBot: false,
        content: '!chat ceritakan lelucon singkat dong!',
        channelId: generalChannelId,
        channelName: 'general',
        botUserId,
        now: baseTime + 500,
      },
      expectedAllowed: true,
      expectedReason: 'matched_prefix',
      expectedTrigger: 'prefix',
    },
    // 7. General chatter in dedicated channel without invoking bot (FR-T2)
    {
      name: '7. Casual banter between friends in dedicated channel',
      context: {
        authorId: 'user-6',
        authorIsBot: false,
        content: 'nanti sore futsal yuk guys di lapangan biasa',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 600,
      },
      expectedAllowed: false,
      expectedReason: 'not_for_bot',
    },
    // 8. Bot name at start of sentence in dedicated channel
    {
      name: '8. Bot name at start of sentence in dedicated channel',
      context: {
        authorId: 'user-7',
        authorIsBot: false,
        content: 'Lyra, hari ini cuacanya gimana ya?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 700,
      },
      expectedAllowed: true,
      expectedReason: 'matched_wake_name',
      expectedTrigger: 'name',
    },
    // 9. Bot name in middle of sentence in dedicated channel
    {
      name: '9. Bot name in middle of sentence in dedicated channel',
      context: {
        authorId: 'user-8',
        authorIsBot: false,
        content: 'menurut kamu gimana Lyra tentang AI masa depan?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 800,
      },
      expectedAllowed: true,
      expectedReason: 'matched_wake_name',
      expectedTrigger: 'name',
    },
    // 10. Phonetic alias "Lira" in dedicated channel
    {
      name: '10. Bot alias Lira in dedicated channel',
      context: {
        authorId: 'user-9',
        authorIsBot: false,
        content: 'Lira, kamu suka main game RPG gak?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 900,
      },
      expectedAllowed: true,
      expectedReason: 'matched_wake_name',
      expectedTrigger: 'name',
    },
    // 11. Upstream alias "Airi" in dedicated channel
    {
      name: '11. Upstream alias Airi in dedicated channel',
      context: {
        authorId: 'user-10',
        authorIsBot: false,
        content: 'Airi, rekomendasi film anime bagus dong',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1000,
      },
      expectedAllowed: true,
      expectedReason: 'matched_wake_name',
      expectedTrigger: 'name',
    },
    // 12. Direct question in dedicated channel
    {
      name: '12. Direct question in dedicated channel',
      context: {
        authorId: 'user-11',
        authorIsBot: false,
        content: 'apa arti kata clutch dalam gaming?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1100,
      },
      expectedAllowed: true,
      expectedReason: 'matched_direct_question',
      expectedTrigger: 'question',
    },
    // 13. Laugh/interjection between users in dedicated channel
    {
      name: '13. Laugh interjection in dedicated channel',
      context: {
        authorId: 'user-12',
        authorIsBot: false,
        content: 'wkwkwk kocak banget anjir videonya',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1200,
      },
      expectedAllowed: false,
      expectedReason: 'not_for_bot',
    },
    // 14. Personal monologue in dedicated channel
    {
      name: '14. Personal monologue in dedicated channel',
      context: {
        authorId: 'user-13',
        authorIsBot: false,
        content: 'kemarin gua kalah ranked 5 kali berturut-turut parah',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1300,
      },
      expectedAllowed: false,
      expectedReason: 'not_for_bot',
    },
    // 15. Transactional question between humans in dedicated channel
    {
      name: '15. Human-to-human trade question in dedicated channel',
      context: {
        authorId: 'user-14',
        authorIsBot: false,
        content: 'ada yang mau beli akun steam bekas gak nih?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1400,
      },
      expectedAllowed: false,
      expectedReason: 'not_for_bot',
    },
    // 16. Technical direct question in dedicated channel
    {
      name: '16. Technical direct question in dedicated channel',
      context: {
        authorId: 'user-15',
        authorIsBot: false,
        content: 'gimana cara coding typescript dengan rapi?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 1500,
      },
      expectedAllowed: true,
      expectedReason: 'matched_direct_question',
      expectedTrigger: 'question',
    },
    // 17. Active conversation follow-up question (user-15 continues asking)
    {
      name: '17. Follow-up question in active conversation session',
      context: {
        authorId: 'user-15',
        authorIsBot: false,
        content: 'bisa tolong berikan contohnya?',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 5000, // 3.5s later (> cooldown 3s, within active session)
      },
      expectedAllowed: true,
      expectedReason: 'matched_direct_question',
      expectedTrigger: 'question',
    },
    // 18. Empty/whitespace message
    {
      name: '18. Empty or whitespace message',
      context: {
        authorId: 'user-16',
        authorIsBot: false,
        content: '   ',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 6000,
      },
      expectedAllowed: false,
      expectedReason: 'empty_content',
    },
    // 19. Kill switch disabled
    {
      name: '19. Message sent when bot is disabled',
      context: {
        authorId: 'user-17',
        authorIsBot: false,
        content: '!chat halo Lyra!',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 7000,
      },
      expectedAllowed: false,
      expectedReason: 'bot_disabled',
    },
    // 20. Rapid spam triggered cooldown
    {
      name: '20. Rapid message triggering cooldown rejection',
      context: {
        authorId: 'user-18',
        authorIsBot: false,
        content: 'Lyra, halo lagi!',
        channelId: dedicatedChannelId,
        channelName: 'chat-ai',
        botUserId,
        now: baseTime + 8000,
      },
      expectedAllowed: false,
      expectedReason: 'cooldown',
    },
  ];

  // Run scenario 1 to 18
  for (let i = 0; i < 18; i++) {
    const sc = scenarios[i];
    const result = engine.evaluate(sc.context);
    assert.equal(
      result.allowed,
      sc.expectedAllowed,
      `Scenario ${sc.name} - allowed mismatch`
    );
    assert.equal(
      result.reason,
      sc.expectedReason,
      `Scenario ${sc.name} - reason mismatch`
    );
    if (sc.expectedTrigger) {
      assert.equal(
        result.triggerType,
        sc.expectedTrigger,
        `Scenario ${sc.name} - trigger mismatch`
      );
    }
  }

  // Run scenario 19 (Kill switch disabled)
  engine.setBotEnabled(false);
  const sc19 = scenarios[18];
  const res19 = engine.evaluate(sc19.context);
  assert.equal(res19.allowed, false);
  assert.equal(res19.reason, 'bot_disabled');
  engine.setBotEnabled(true);

  // Run scenario 20 (Cooldown check)
  // First message from user-18: allowed
  const firstMsg = engine.evaluate({
    authorId: 'user-18',
    authorIsBot: false,
    content: 'Lyra, apa kabar?',
    channelId: dedicatedChannelId,
    botUserId,
    now: baseTime + 7500,
  });
  assert.equal(firstMsg.allowed, true);

  // Second message immediately after (500ms later, < 3000ms cooldown)
  const sc20 = scenarios[19];
  const res20 = engine.evaluate(sc20.context);
  assert.equal(res20.allowed, false);
  assert.equal(res20.reason, 'cooldown');
  assert.ok(
    (res20.retryAfterMs ?? 0) > 0,
    'Should inform retryAfterMs duration'
  );
});
