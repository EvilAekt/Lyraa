import prism from 'prism-media';

export interface OpusDecoderOptions {
  rate?: number;
  channels?: number;
  frameSize?: number;
}

/**
 * Creates an Opus decoder Transform stream using prism-media.
 */
export function createOpusDecoder(options: OpusDecoderOptions = {}) {
  const { rate = 48000, channels = 1, frameSize = 960 } = options;
  const decoder = new prism.opus.Decoder({
    rate,
    channels,
    frameSize,
  });
  // Prevent unhandled error crashing process when invalid/corrupt UDP packets arrive from Discord
  decoder.on('error', (err) => {
    // Gracefully handle decode error without crashing process
  });
  return decoder;
}
