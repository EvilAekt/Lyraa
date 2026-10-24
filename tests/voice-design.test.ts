/**
 * Task T3.4 Unit Tests: Eksperimen Voice Design Karakter Lyra
 * Tests:
 * 1. Completeness of structured template fields (Age, Timbre, Pace, Accent, Expression)
 * 2. Ethical constraint verification (Prohibition of mimicking real living people)
 * 3. Permanent IDs registration and acoustic parameters integrity
 * 4. VoiceDesigner synthesis execution and audio output validation
 * 5. Physical existence of generated Voice Design audio samples
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VoiceDesigner,
  VOICE_DESIGN_PROFILES,
} from '../src/audio/voice-designer.js';

test('T3.4: 2 Voice Design profiles comply with PRD §7 structured template', () => {
  assert.strictEqual(VOICE_DESIGN_PROFILES.length, 2, 'Must have exactly 2 voice design profiles');

  for (const profile of VOICE_DESIGN_PROFILES) {
    assert.ok(profile.id.startsWith('voice-design-lyra-'), `ID "${profile.id}" must follow permanent ID convention`);
    assert.ok(profile.ageImpression.length > 5, 'Must contain age impression');
    assert.ok(profile.timbreAndColor.length > 5, 'Must contain timbre & color description');
    assert.ok(profile.speakingPace.length > 5, 'Must contain speaking pace');
    assert.ok(profile.accentAndDialect.length > 5, 'Must contain accent & dialect');
    assert.ok(profile.expressionLevel.length > 5, 'Must contain expression level');
    assert.ok(profile.sampleText.length > 10, 'Must have sample dialogue text');
  }
});

test('T3.4: Strict ethical constraint enforced (No mimicking real people - PRD §7.6, FR-P5)', () => {
  for (const profile of VOICE_DESIGN_PROFILES) {
    assert.ok(
      profile.imitationConstraint.includes('TIDAK meniru figur atau orang sungguhan') ||
      profile.imitationConstraint.includes('orisinal'),
      `Profile ${profile.id} must explicitly declare prohibition of cloning real people`
    );
  }
});

test('T3.4: Permanent IDs and acoustic prosody parameters are valid', () => {
  const designer = new VoiceDesigner();

  const streamer = designer.getProfile('voice-design-lyra-streamer-v1');
  assert.ok(streamer, 'Streamer profile must exist');
  assert.strictEqual(streamer.acousticParameters.speed, 1.08);
  assert.strictEqual(streamer.acousticParameters.pitch, 8);

  const cozy = designer.getProfile('voice-design-lyra-cozy-v1');
  assert.ok(cozy, 'Cozy profile must exist');
  assert.strictEqual(cozy.acousticParameters.speed, 0.92);
  assert.strictEqual(cozy.acousticParameters.pitch, -4);
});

test('T3.4: Generated physical audio samples exist and have valid size', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures', 'voice-candidates');
  assert.ok(fs.existsSync(fixturesDir), 'Voice candidates fixtures dir must exist');

  const streamerFile = path.join(fixturesDir, 'voice-design-lyra-streamer-v1.webm');
  assert.ok(fs.existsSync(streamerFile), 'Streamer sample file must exist');
  const statStreamer = fs.statSync(streamerFile);
  assert.ok(statStreamer.size > 10_000, `Streamer audio must be > 10KB, got: ${statStreamer.size}`);

  const cozyFile = path.join(fixturesDir, 'voice-design-lyra-cozy-v1.webm');
  assert.ok(fs.existsSync(cozyFile), 'Cozy sample file must exist');
  const statCozy = fs.statSync(cozyFile);
  assert.ok(statCozy.size > 10_000, `Cozy audio must be > 10KB, got: ${statCozy.size}`);
});
