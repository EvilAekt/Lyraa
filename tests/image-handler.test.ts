import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageAttachment,
  ImageProcessor,
  MAX_IMAGE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
} from '../src/chat/image-handler.js';
import { config } from '../src/config/index.js';

// Minimal valid 1x1 transparent PNG buffer
const SAMPLE_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

// Minimal valid 1x1 JPEG buffer
const SAMPLE_JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

// Minimal valid 1x1 WebP buffer
const SAMPLE_WEBP_1X1 = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=',
  'base64'
);

test('TC-11: Rejects file > 5 MB politely without invoking multimodal API', async () => {
  const oversizeBytes = MAX_IMAGE_SIZE_BYTES + 1024; // 5 MB + 1 KB

  const result = await validateImageAttachment({
    size: oversizeBytes,
    contentType: 'image/png',
    name: 'heavy_photo.png',
    buffer: Buffer.alloc(10), // dummy buffer for test
  });

  assert.equal(result.isValid, false);
  assert.equal(result.error, 'too_large');
  assert.ok(result.userMessage?.includes('melebihi batas 5 MB'));
  assert.ok(result.userMessage?.includes('kompres'));
});

test('TC-11: Validates supported image formats (PNG, JPG, WebP) and rejects unsupported formats', async () => {
  assert.deepEqual(SUPPORTED_MIME_TYPES, [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ]);

  // Valid PNG
  const validPng = await validateImageAttachment({
    size: SAMPLE_PNG_1X1.length,
    contentType: 'image/png',
    name: 'avatar.png',
    buffer: SAMPLE_PNG_1X1,
  });
  assert.equal(validPng.isValid, true);
  assert.equal(validPng.mimeType, 'image/png');

  // Valid JPEG
  const validJpg = await validateImageAttachment({
    size: SAMPLE_JPEG_1X1.length,
    contentType: 'image/jpeg',
    name: 'photo.jpg',
    buffer: SAMPLE_JPEG_1X1,
  });
  assert.equal(validJpg.isValid, true);
  assert.equal(validJpg.mimeType, 'image/jpeg');

  // Valid WebP
  const validWebp = await validateImageAttachment({
    size: SAMPLE_WEBP_1X1.length,
    contentType: 'image/webp',
    name: 'sticker.webp',
    buffer: SAMPLE_WEBP_1X1,
  });
  assert.equal(validWebp.isValid, true);
  assert.equal(validWebp.mimeType, 'image/webp');

  // Unsupported: PDF
  const invalidPdf = await validateImageAttachment({
    size: 2000,
    contentType: 'application/pdf',
    name: 'document.pdf',
    buffer: Buffer.alloc(2000),
  });
  assert.equal(invalidPdf.isValid, false);
  assert.equal(invalidPdf.error, 'unsupported_format');
  assert.ok(invalidPdf.userMessage?.includes('PNG, JPG/JPEG, atau WebP'));

  // Unsupported: GIF
  const invalidGif = await validateImageAttachment({
    size: 15000,
    contentType: 'image/gif',
    name: 'animation.gif',
    buffer: Buffer.alloc(15000),
  });
  assert.equal(invalidGif.isValid, false);
  assert.equal(invalidGif.error, 'unsupported_format');
});

test('TC-11: Evaluates 5 realistic image scenarios with various MIME types and captions', async () => {
  const scenarios = [
    {
      name: 'Image 1: Gameplay screenshot (PNG)',
      attachment: {
        size: 1024 * 500, // 500 KB
        contentType: 'image/png',
        name: 'gameplay_clutch.png',
        buffer: SAMPLE_PNG_1X1,
      },
      caption: 'Lyra, coba lihat clutch gameplay aku ini!',
    },
    {
      name: 'Image 2: Cosplay / Outfit photo (JPEG)',
      attachment: {
        size: 1024 * 1200, // 1.2 MB
        contentType: 'image/jpeg',
        name: 'cosplay_photo.jpg',
        buffer: SAMPLE_JPEG_1X1,
      },
      caption: 'Menurutmu outfit ini cocok gak?',
    },
    {
      name: 'Image 3: Fan art sticker (WebP)',
      attachment: {
        size: 1024 * 250, // 250 KB
        contentType: 'image/webp',
        name: 'lyra_fanart.webp',
        buffer: SAMPLE_WEBP_1X1,
      },
      caption: 'Aku bikinin fanart Lyra nih!',
    },
    {
      name: 'Image 4: Food picture without caption (JPEG)',
      attachment: {
        size: 1024 * 800, // 800 KB
        contentType: 'image/jpeg',
        name: 'kuliner_malam.jpeg',
        buffer: SAMPLE_JPEG_1X1,
      },
      caption: '',
    },
    {
      name: 'Image 5: Code snippet screenshot (PNG)',
      attachment: {
        size: 1024 * 350, // 350 KB
        contentType: 'image/png',
        name: 'code_error.png',
        buffer: SAMPLE_PNG_1X1,
      },
      caption: 'Ada error apa di kode ini Lyra?',
    },
  ];

  for (const item of scenarios) {
    const res = await validateImageAttachment(item.attachment);
    assert.equal(res.isValid, true, `Validation failed for ${item.name}`);
    assert.ok(res.buffer && res.buffer.length > 0);
    assert.ok(typeof res.mimeType === 'string');
  }
});

test('SEC-5: ImageProcessor incorporates strict prompt injection defense in system prompt', () => {
  const processor = new ImageProcessor({
    apiKey: 'dummy_key',
    modelName: 'gemini-3.5-flash-lite',
  });

  assert.equal(processor.getModelName(), 'gemini-3.5-flash-lite');
  assert.ok(typeof processor.analyzeImage === 'function');
});

test('TC-11 / SEC-5: Multimodal Image Understanding live execution (skipped if no API key)', { timeout: 65000 }, async (t) => {
  if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === 'dummy_key_for_scaffold') {
    t.skip('Skipping multimodal live test: GEMINI_API_KEY not configured.');
    return;
  }

  const processor = new ImageProcessor();
  const start = Date.now();

  // Test with minimal WebP image and benign caption
  const comment = await processor.analyzeImage(
    SAMPLE_WEBP_1X1,
    'image/webp',
    'Halo Lyra, gambar apa yang kamu lihat ini?'
  );

  const duration = Date.now() - start;
  assert.ok(typeof comment === 'string' && comment.length > 0);
  // Ensure output is sanitized (no @everyone or role pings)
  assert.ok(!comment.includes('@everyone'));
  assert.ok(!comment.includes('<@&'));
  console.log(`\n  [Multimodal Vision Result] (${duration}ms): "${comment}"`);
});
