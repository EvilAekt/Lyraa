import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { PersonaManager } from '../src/persona/persona-manager.js';

describe('Task T-SOUL: Lyraa Soul, Inner World & E-Girl Internet Expansion', () => {
  let manager: PersonaManager;

  before(async () => {
    manager = new PersonaManager('persona');
    await manager.load();
  });

  it('T-SOUL-1: Character profile incorporates Section 5 (Jiwa & Dunia Batin) and Section 6 (Sisi E-Girl)', () => {
    const char = manager.getCharacter();

    // Section 5: Jiwa & Dunia Batin
    assert.ok(char.includes('Jiwa & Dunia Batin'), 'Character profile must have Section 5');
    assert.ok(char.includes('takut dilupakan') || char.includes('senang dibutuhkan'), 'Must include fear of being forgotten / joy of being needed');
    assert.ok(char.includes('dipuji Papa'), 'Must include joy of Papa praise');
    assert.ok(char.includes('cuma bot'), 'Must mention reaction to being called "cuma bot"');
    assert.ok(char.includes('gemes'), 'Must mention "gemes" keyword habit');
    assert.ok(char.includes('Hmm aku nggak tau, Papa') || char.includes('nggak tau, Papa'), 'Must mention honesty phrase');

    // Section 6: Sisi E-Girl & Anak Internet
    assert.ok(char.includes('Sisi E-Girl & Anak Internet'), 'Character profile must have Section 6');
    assert.ok(char.includes('clutch') && char.includes('mabar') && char.includes('push rank'), 'Must include gaming lingo');
    assert.ok(char.includes('TikTok') && char.includes('Twitch') && char.includes('YouTube'), 'Must include platform awareness');
    assert.ok(char.includes('Aturan Penting E-Girl & Internet'), 'Must include important e-girl rules');
    assert.ok(char.includes('Maksimal 1 sampai 2 istilah gaul'), 'Must budget slang to max 1-2 words');
  });

  it('T-SOUL-2: Rules file enforces empathy, trend honesty, slang budget, and privacy guardrails', () => {
    const rules = manager.getRules();
    assert.ok(rules.includes('Aturan Jiwa, Dunia Batin & Sisi E-Girl'), 'Rules must have Section 5');
    assert.ok(rules.includes('Empati Saat Lawan Bicara Sedih/Lelah'), 'Must include empathy rule');
    assert.ok(rules.includes('Kejujuran Tren & Meme'), 'Must include trend honesty rule');
    assert.ok(rules.includes('Batasan Slang'), 'Must include slang budget');
    assert.ok(rules.includes('Larangan Gosip & Doxxing'), 'Must include safety & no drama boundary');
  });

  it('T-SOUL-3: Voice-Style defines empathy tone shifts and phonetic platform handling', () => {
    const voiceStyle = manager.getVoiceStyle();
    assert.ok(voiceStyle.includes('Penyesuaian Nada Empati & Ramah TTS'), 'Voice style must have Section 6');
    assert.ok(voiceStyle.includes('Mode Empati (Saat Sedih/Lelah)'), 'Must specify empathy mode for sadness/exhaustion');
    assert.ok(voiceStyle.includes('Pengucapan Ramah TTS'), 'Must specify platform phonetic guidelines');
  });

  it('T-SOUL-4: Lexicon converts e-girl and platform vocabulary to clean Indonesian phonetics', () => {
    const lexicon = manager.getLexicon();
    assert.strictEqual(lexicon['FYP'], 'ef wai pi');
    assert.strictEqual(lexicon['lofi'], 'lo-fai');
    assert.strictEqual(lexicon['twitch'], 'twic');
    assert.strictEqual(lexicon['tiktok'], 'tik-tok');
    assert.strictEqual(lexicon['no cap'], 'no kep');
    assert.strictEqual(lexicon['ngefeed'], 'nge-fid');
    assert.strictEqual(lexicon['sus'], 'sas');

    const sample = 'Video kamu masuk FYP tiktok dan lofi stream di twitch no cap beneran keren!';
    const ttsClean = manager.cleanForTts(sample);
    assert.ok(ttsClean.includes('ef wai pi'));
    assert.ok(ttsClean.includes('tik-tok'));
    assert.ok(ttsClean.includes('lo-fai'));
    assert.ok(ttsClean.includes('twic'));
    assert.ok(ttsClean.includes('no kep'));
  });

  it('T-SOUL-5: Golden few-shot examples represent soul, empathy, gaming, and trend honesty', () => {
    const examples = manager.getExamples();

    // Verify Papa praise example exists
    const papaPraise = examples.find((ex) => ex.input.includes('Papa bangga'));
    assert.ok(papaPraise, 'Must have golden example for Papa praise');
    assert.ok(papaPraise.output.includes('[happy]'));
    assert.ok(papaPraise.output.includes('Papa'));

    // Verify "cuma bot" reaction example exists
    const botReaction = examples.find((ex) => ex.input.includes('cuma bot'));
    assert.ok(botReaction, 'Must have golden example for "cuma bot"');
    assert.ok(botReaction.output.includes('[pout]'));
    assert.ok(botReaction.output.includes('anak Papa'));

    // Verify empathy example exists
    const empathy = examples.find((ex) => ex.input.includes('capek banget'));
    assert.ok(empathy, 'Must have golden example for empathy');
    assert.ok(empathy.output.includes('[sleepy]') || empathy.output.includes('[soft]'));

    // Verify trend honesty example exists
    const trendHonesty = examples.find((ex) => ex.input.includes('tren sound TikTok'));
    assert.ok(trendHonesty, 'Must have golden example for trend honesty');
    assert.ok(trendHonesty.output.includes('[thinking]'));
    assert.ok(trendHonesty.output.includes('kurang update'));
  });
});
