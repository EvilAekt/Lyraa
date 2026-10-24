import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSentences } from '../src/providers/sentence-chunker.js';

test('SentenceChunker: splits stream at punctuation boundaries', async () => {
  async function* mockTokens() {
    yield 'Halo ';
    yield 'semuanya! ';
    yield 'Aku ';
    yield 'Lyra. ';
    yield 'Senang ';
    yield 'bertemu ';
    yield 'denganmu.';
  }

  const chunks: string[] = [];
  for await (const chunk of chunkSentences(mockTokens(), { maxFirstChunkWords: 8 })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0], 'Halo semuanya!');
  assert.equal(chunks[1], 'Aku Lyra.');
  assert.equal(chunks[2], 'Senang bertemu denganmu.');
});

test('SentenceChunker: breaks long sentences at clause boundaries', async () => {
  async function* mockTokens() {
    yield 'Saat ini ';
    yield 'kita sedang menguji ';
    yield 'sistem suara AI, ';
    yield 'dan memastikan ';
    yield 'bahwa respons suara dapat keluar dengan sangat cepat.';
  }

  const chunks: string[] = [];
  for await (const chunk of chunkSentences(mockTokens(), { maxFirstChunkWords: 5 })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0], 'Saat ini kita sedang menguji sistem suara AI,');
});
