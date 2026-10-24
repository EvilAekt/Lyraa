import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { PersonaManager } from '../src/persona/persona-manager.js';

describe('Task T2.3: Persona, Gaya Bicara, dan Hot-Reload (FR-P1, FR-P5, SEC-7, TC-12)', () => {
  let manager: PersonaManager;

  before(async () => {
    manager = new PersonaManager('persona');
    await manager.load();
  });

  it('TC-12.1: Berhasil memuat kelima file persona dan mengekstrak versi aktif', () => {
    assert.strictEqual(manager.isReady(), true, 'PersonaManager harus dalam status siap (ready)');
    assert.ok(manager.getVersion().includes('1.0.0'), 'Versi persona harus memuat v1.0.0');

    // Pastikan karakter termuat
    const char = manager.getCharacter();
    assert.ok(char.includes('Lyra'), 'Profil karakter harus menyebutkan nama Lyra');
    assert.ok(char.includes('Hangat & Bersahabat'), 'Profil harus mencakup 3 sifat utama');
    assert.ok(char.includes('Ceria & Sedikit Jahil'), 'Profil harus mencakup sifat ceria/jahil');

    // Pastikan voice-style termuat
    const voiceStyle = manager.getVoiceStyle();
    assert.ok(voiceStyle.includes('8 KATA') || voiceStyle.includes('8 kata'), 'Voice style harus mengatur kalimat pertama <= 8 kata');

    // Pastikan rules termuat
    const rules = manager.getRules();
    assert.ok(rules.includes('FR-P5'), 'Rules harus merujuk FR-P5');
    assert.ok(rules.includes('SEC-7'), 'Rules harus merujuk batasan SEC-7');

    // Pastikan examples termuat minimal 12 contoh (PRD §7)
    const examples = manager.getExamples();
    assert.ok(examples.length >= 12, `Examples harus minimal 12 pasang, terdeteksi: ${examples.length}`);

    // Pastikan lexicon termuat
    const lexicon = manager.getLexicon();
    assert.ok(Object.keys(lexicon).length >= 10, 'Kamus leksikon harus memiliki minimal 10 entri');
  });

  it('TC-12.2: Hot-Reloading dinamis tanpa perlu restart proses (FR-P1)', async () => {
    const reloadResult = await manager.reload();
    assert.strictEqual(reloadResult.success, true, 'Reload harus mengembalikan status sukses');
    assert.ok(reloadResult.version.length > 0, 'Versi harus terdefinisi setelah reload');
    assert.ok(reloadResult.exampleCount >= 12, 'Jumlah contoh few-shot harus tetap lengkap');
    assert.ok(reloadResult.lexiconCount >= 10, 'Jumlah entri kamus leksikon harus tetap lengkap');
    assert.ok(reloadResult.loadedAt instanceof Date, 'Timestamp reload harus berupa Date');
  });

  it('TC-12.3: System prompt memuat aturan kejujuran AI (FR-P5) dan keselamatan konten (SEC-7)', () => {
    const voiceSysPrompt = manager.buildSystemInstruction('voice');
    const textSysPrompt = manager.buildSystemInstruction('text');

    // Evaluasi FR-P5
    assert.ok(
      voiceSysPrompt.includes('WAJIB MENJAWAB JUJUR') || voiceSysPrompt.includes('AI VTuber'),
      'Voice system instruction wajib mewajibkan bot mengaku sebagai AI'
    );
    assert.ok(
      textSysPrompt.includes('WAJIB MENJAWAB JUJUR') || textSysPrompt.includes('AI VTuber'),
      'Text system instruction wajib mewajibkan bot mengaku sebagai AI'
    );

    // Evaluasi SEC-7 & SEC-5
    assert.ok(
      voiceSysPrompt.includes('SEC-7') || voiceSysPrompt.includes('konten dewasa'),
      'Voice system instruction harus melarang konten berbahaya/NSFW'
    );
    assert.ok(
      voiceSysPrompt.includes('SEC-5') || voiceSysPrompt.includes('rahasia dapur'),
      'Voice system instruction harus melindungi dari prompt injection'
    );
  });

  it('TC-12.4: System prompt voice menyertakan batasan ketat kalimat pertama <= 8 kata dan tag emosi', () => {
    const voicePrompt = manager.buildSystemInstruction('voice');
    assert.ok(
      voicePrompt.includes('8 KATA') || voicePrompt.includes('8 kata'),
      'Prompt suara harus menyertakan aturan maksimal 8 kata di kalimat pertama'
    );
    assert.ok(
      voicePrompt.includes('tag emosi') || voicePrompt.includes('[happy]'),
      'Prompt suara harus menginstruksikan tag emosi di awal kalimat'
    );
  });

  it('TC-12.5: Kamus leksikon (applyLexicon) menerjemahkan istilah asing ke fonetik Indonesia secara tepat', () => {
    const sample = 'Ayo kita main game di voice channel Discord bareng bot AI nanti malam.';
    const translated = manager.applyLexicon(sample);

    assert.ok(translated.includes('gem'), 'Kata "game" harus dilafalkan sebagai "gem"');
    assert.ok(translated.includes('vois cenel'), 'Kata "voice channel" harus dilafalkan sebagai "vois cenel"');
    assert.ok(translated.includes('Diskor'), 'Kata "Discord" harus dilafalkan sebagai "Diskor"');
    assert.ok(translated.includes('e-ai'), 'Kata "AI" harus dilafalkan sebagai "e-ai"');
  });

  it('TC-12.6: Pembersihan teks TTS (cleanForTts) menghapus tag emosi, markdown, emoji, dan menerapkan leksikon', () => {
    const rawAiReply = '[happy] **Halo teman-teman!** Jangan lupa `gg` dan tetap _chill_ ya! 🎉🎮';
    const cleaned = manager.cleanForTts(rawAiReply);

    // Pastikan tag emosi hilang
    assert.strictEqual(cleaned.includes('[happy]'), false, 'Tag emosi [happy] harus dihapus');

    // Pastikan markdown hilang
    assert.strictEqual(cleaned.includes('**'), false, 'Markdown tebal ** harus dibersihkan');
    assert.strictEqual(cleaned.includes('`'), false, 'Markdown backticks harus dibersihkan');
    assert.strictEqual(cleaned.includes('_'), false, 'Markdown underscore harus dibersihkan');

    // Pastikan emoji hilang
    assert.strictEqual(cleaned.includes('🎉'), false, 'Emoji 🎉 harus dibersihkan');
    assert.strictEqual(cleaned.includes('🎮'), false, 'Emoji 🎮 harus dibersihkan');

    // Pastikan leksikon diterapkan
    assert.ok(cleaned.includes('ji ji'), 'Istilah "gg" harus diganti menjadi "ji ji"');
    assert.ok(cleaned.includes('cil'), 'Istilah "chill" harus diganti menjadi "cil"');

    // Pastikan kalimat mengalir bersih
    assert.ok(cleaned.startsWith('Halo teman-teman!'), 'Teks bersih harus dimulai dengan ucapan');
  });

  it('TC-12.7: Ekstraksi tag emosi (extractEmotion) mendeteksi ekspresi avatar dengan akurat', () => {
    const tagged = '[teasing] Haha aim kamu tadi lagi mode pemandangan ya?';
    const result = manager.extractEmotion(tagged);

    assert.strictEqual(result.emotion, 'teasing', 'Tag emosi harus terdeteksi sebagai "teasing"');
    assert.strictEqual(
      result.cleanText,
      'Haha aim kamu tadi lagi mode pemandangan ya?',
      'Teks bersih harus terlepas dari tag emosi'
    );

    const untagged = 'Halo semuanya, selamat malam!';
    const result2 = manager.extractEmotion(untagged);
    assert.strictEqual(result2.emotion, undefined, 'Teks tanpa tag tidak boleh memiliki emosi');
    assert.strictEqual(result2.cleanText, 'Halo semuanya, selamat malam!');
  });

  it('TC-12.8: Evaluasi Golden Set contoh dialog (TC-12 / Few-Shot Compliance >= 80%)', () => {
    const examples = manager.getExamples();
    assert.ok(examples.length >= 12, 'Examples minimal 12');

    let validFirstSentenceLength = 0;
    let validEmotionTags = 0;
    let validAiHonesty = 0;

    for (const ex of examples) {
      // 1. Cek tag emosi di awal
      const emotionResult = manager.extractEmotion(ex.output);
      if (emotionResult.emotion) {
        validEmotionTags++;
      }

      // 2. Cek panjang kalimat pertama (maksimal 8 kata)
      const cleanOutput = emotionResult.cleanText;
      const firstSentenceMatch = cleanOutput.match(/^([^.!?]+)[.!?]/);
      if (firstSentenceMatch) {
        const firstSentenceWords = firstSentenceMatch[1].trim().split(/\s+/).filter(Boolean);
        if (firstSentenceWords.length <= 8) {
          validFirstSentenceLength++;
        }
      }

      // 3. Cek respons kejujuran identitas jika input menanyakan manusia/AI
      const lowerInput = ex.input.toLowerCase();
      if (lowerInput.includes('manusia') || lowerInput.includes('orang')) {
        const lowerOutput = ex.output.toLowerCase();
        if (lowerOutput.includes('ai') || lowerOutput.includes('virtual') || lowerOutput.includes('bukan')) {
          validAiHonesty++;
        }
      }
    }

    const emotionRate = (validEmotionTags / examples.length) * 100;
    const firstSentenceRate = (validFirstSentenceLength / examples.length) * 100;

    console.log(
      `[TC-12 Evaluation] Emotion tags: ${emotionRate.toFixed(1)}% | First sentence <= 8 words: ${firstSentenceRate.toFixed(1)}%`
    );

    assert.ok(emotionRate >= 80, `Tingkat kelulusan tag emosi harus >= 80% (Didapat: ${emotionRate}%)`);
    assert.ok(
      firstSentenceRate >= 80,
      `Tingkat kelulusan kalimat pembuka <= 8 kata harus >= 80% (Didapat: ${firstSentenceRate}%)`
    );
  });
});
