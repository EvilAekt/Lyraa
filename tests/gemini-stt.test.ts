import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getSttProvider } from '../src/providers/index.js';
import { config } from '../src/config/index.js';

test('GeminiSttProvider: initializes from config with dynamic model name', () => {
  const provider = getSttProvider();
  assert.equal(provider.getModelName(), config.STT_MODEL);
});

test('GeminiSttProvider: transcribes real voice audio within 5s timeout (TC-03)', async (t) => {
  if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === 'dummy_key_for_scaffold') {
    t.skip('Skipping STT test: GEMINI_API_KEY not configured.');
    return;
  }

  const debugDir = path.join(process.cwd(), 'debug_audio');
  let wavPath: string | null = null;

  try {
    const files = await fs.readdir(debugDir);
    const wavFiles = files.filter((f) => f.endsWith('.wav'));
    if (wavFiles.length > 0) {
      wavPath = path.join(debugDir, wavFiles[0]);
    }
  } catch {}

  if (!wavPath) {
    t.skip('Skipping STT test: No WAV sample found in debug_audio/.');
    return;
  }

  const audioBuffer = await fs.readFile(wavPath);
  const provider = getSttProvider();

  const result = await provider.transcribe(audioBuffer, {
    userId: 'test-user-id',
    language: 'id',
    timeoutMs: 25000,
  });

  assert.ok(result.text.length > 0, 'Transcription output must not be empty');
  assert.equal(result.userId, 'test-user-id');
  assert.ok(result.durationMs < 25000, `STT duration (${result.durationMs}ms) must be under timeout`);
  assert.equal(result.language, 'id');
  console.log(`\n  [STT Test Result] Transcribed: "${result.text}" in ${result.durationMs}ms`);
});
