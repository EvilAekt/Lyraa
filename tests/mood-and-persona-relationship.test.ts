import test from 'node:test';
import assert from 'node:assert/strict';
import { MoodEngine, MOOD_DEFINITIONS } from '../src/persona/mood-engine.js';
import { getPersonaManager } from '../src/persona/persona-manager.js';

test('MoodEngine: initializes with playful mood and shifts dynamically', () => {
  const engine = new MoodEngine('640513136503291934');

  // 1. Initial State
  assert.equal(engine.getMood(), 'playful');
  const details = engine.getMoodDetails();
  assert.equal(details.emoji, '😜');

  // 2. Negative trigger causes bad_mood
  const res1 = engine.processUtterance('Ah kamu beban banget sih kalah mulu', 'user-random');
  assert.equal(res1.shifted, true);
  assert.equal(engine.getMood(), 'bad_mood');

  // 3. Instruction during bad_mood strictly requires short, pouty replies
  const badMoodInstruction = engine.getPromptInstruction();
  assert.ok(badMoodInstruction.includes('BAD MOOD'));
  assert.ok(badMoodInstruction.includes('SANGAT SINGKAT'));
  assert.ok(badMoodInstruction.includes('[pout]'));

  // 4. Random user praise heals bad_mood into playful
  const res2 = engine.processUtterance('Jangan ngambek dong manis, kamu cantik dan imut kok', 'user-random');
  assert.equal(res2.shifted, true);
  assert.equal(engine.getMood(), 'playful');

  // 5. Another negative trigger
  engine.processUtterance('Kamu berisik banget deh', 'user-random');
  assert.equal(engine.getMood(), 'bad_mood');

  // 6. Creator (Papa ID: 640513136503291934) speaks -> instantly heals to happy
  const res3 = engine.processUtterance('Halo anakku Lyra tersayang, Papa dateng nih', '640513136503291934');
  assert.equal(res3.shifted, true);
  assert.equal(engine.getMood(), 'happy');
  assert.ok(engine.getMoodDetails().reason.includes('Papa') || engine.getMoodDetails().reason.includes('Papap'));
});

test('MoodEngine: manual mood setting and details inspection', () => {
  const engine = new MoodEngine('640513136503291934');

  engine.setMood('sleepy', 'Malam hari jam 2 pagi');
  assert.equal(engine.getMood(), 'sleepy');
  const details = engine.getMoodDetails();
  assert.equal(details.emoji, '🥱');
  assert.ok(details.promptInstruction.includes('SLEEPY'));

  engine.setMood('chill', 'Lagi santai denger lagu lofi');
  assert.equal(engine.getMood(), 'chill');
  assert.equal(engine.getMoodDetails().emoji, '☕');
});

test('Persona: character and rules reflect daughter relationship with Papa (ID: 640513136503291934)', async () => {
  const persona = getPersonaManager();
  await persona.load();

  const character = persona.getCharacter();
  assert.ok(character.includes('640513136503291934'), 'Character must reference creator ID');
  assert.ok(character.includes('Papa') || character.includes('anak perempuan'), 'Character must define daughter role');

  const rules = persona.getRules();
  assert.ok(rules.includes('640513136503291934'), 'Rules must reference creator ID for identity honesty');

  const examples = persona.getExamples();
  assert.ok(
    examples.some((ex) => ex.input.includes('Siapa yang bikin kamu') || ex.output.includes('Papa')),
    'Examples must contain creator relationship sample'
  );
});
