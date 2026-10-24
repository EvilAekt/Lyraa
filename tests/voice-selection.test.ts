/**
 * Task T3.3 Unit Tests: Tes Pemilihan Suara (PRD §7, PRD §15)
 * Tests:
 * 1. Completeness of 10 standard test scripts
 * 2. Integrity of 5 voice candidates metadata
 * 3. Weighted scoring algorithm and PRD quality gate (Overall Score >= 4.0/5.0)
 * 4. Verification of generated audio sample files in fixtures/voice-candidates/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VOICE_CANDIDATES,
  VOICE_TEST_SCRIPTS,
  VoiceCandidateEvaluator,
} from '../src/benchmarks/voice-candidate-evaluator.js';

test('T3.3: 10 standard voice test scripts match PRD §7 requirements', () => {
  assert.strictEqual(VOICE_TEST_SCRIPTS.length, 10, 'Must have exactly 10 test scripts');

  const requiredCategories = [
    'sapaan',
    'ekspresif_tertawa',
    'bingung_berpikir',
    'penjelasan_panjang',
    'angka_dan_nama',
    'campuran_inggris',
    'semangat_gaming',
    'bisik_pelan',
    'penolakan_ramah',
    'empati_hangat',
  ];

  for (const cat of requiredCategories) {
    const found = VOICE_TEST_SCRIPTS.find((s) => s.category === cat);
    assert.ok(found, `Category "${cat}" must be present in test scripts`);
    assert.ok(found.text.length > 20, `Script for "${cat}" must have substantial dialogue text`);
  }
});

test('T3.3: 5 voice candidates configured covering Indonesian neural and baselines', () => {
  assert.strictEqual(VOICE_CANDIDATES.length, 5, 'Must have 5 voice candidates');

  const winner = VOICE_CANDIDATES.find((c) => c.id === 'CANDIDATE-B');
  assert.ok(winner, 'Winner candidate (CANDIDATE-B) must exist');
  assert.strictEqual(winner.voiceId, 'id-ID-GadisNeural');
  assert.strictEqual(winner.speed, 1.05);
  assert.strictEqual(winner.pitch, 6);
});

test('T3.3: Panelist evaluation aggregates scores and meets PRD quality gate (>= 4.0/5.0)', () => {
  const evaluator = new VoiceCandidateEvaluator();
  const sampleScores = evaluator.getSamplePanelistScores();

  assert.strictEqual(sampleScores.length, 25, '5 panelists x 5 candidates = 25 evaluations');

  const results = evaluator.calculateResults(sampleScores);
  assert.strictEqual(results.length, 5);

  const topCandidate = results[0];
  assert.strictEqual(topCandidate.candidate.id, 'CANDIDATE-B');
  assert.strictEqual(topCandidate.recommendation, 'JUARA (WINNER)');

  // PRD §1 & §7 Quality Gate: Rata-rata >= 4.0/5.0
  assert.ok(
    topCandidate.overallScore >= 4.0,
    `Top candidate score (${topCandidate.overallScore}) must meet PRD threshold >= 4.0`
  );
  assert.strictEqual(topCandidate.fatigueCount, 0, 'Winner must not cause listener fatigue');

  // Verify markdown report generation
  const md = evaluator.generateDecisionMarkdown(results);
  assert.ok(md.includes('# Keputusan & Evaluasi Task T3.3'));
  assert.ok(md.includes('Gadis-Energetic-VTuber'));
  assert.ok(md.includes('4.80 / 5.0'));
});

test('T3.3: Generated audio sample files exist and contain valid audio payload', () => {
  const samplesDir = path.join(process.cwd(), 'fixtures', 'voice-candidates');
  assert.ok(fs.existsSync(samplesDir), 'Sample fixtures directory must exist');

  const files = fs.readdirSync(samplesDir);
  assert.ok(files.length >= 5, 'At least 5 audio candidate sample files must exist');

  // Check winner sample file
  const winnerSample = path.join(samplesDir, 'candidate-b-s01-sapaan.webm');
  assert.ok(fs.existsSync(winnerSample), 'Winner sample candidate-b-s01-sapaan.webm must exist');
  const stat = fs.statSync(winnerSample);
  assert.ok(stat.size > 10_000, `Audio file should have valid non-empty size (>10KB), got: ${stat.size} bytes`);
});
