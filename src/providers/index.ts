import { config } from '../config/index.js';
import { LlmProvider } from './llm-provider.js';
import { GeminiLlmProvider } from './gemini/gemini-llm.js';
import { SttProvider } from './stt-provider.js';
import { GeminiSttProvider } from './gemini/gemini-stt.js';
import { TtsProvider } from './tts-provider.js';
import { EdgeTtsProvider } from './edge/edge-tts.js';
import { VoicevoxTtsProvider } from './voicevox/voicevox-tts.js';
import { ElevenLabsTtsProvider } from './elevenlabs/elevenlabs-tts.js';

export * from './llm-provider.js';
export * from './gemini/gemini-llm.js';
export * from './stt-provider.js';
export * from './gemini/gemini-stt.js';
export * from './tts-provider.js';
export * from './edge/edge-tts.js';
export * from './voicevox/voicevox-tts.js';
export * from './elevenlabs/elevenlabs-tts.js';
export * from './sentence-chunker.js';
export * from './gemini/context-cache.js';

let defaultLlmProvider: LlmProvider | null = null;
let defaultSttProvider: SttProvider | null = null;
let defaultTtsProvider: TtsProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (defaultLlmProvider) {
    return defaultLlmProvider;
  }

  const providerType = config.LLM_PROVIDER.toLowerCase();

  switch (providerType) {
    case 'gemini':
      defaultLlmProvider = new GeminiLlmProvider({
        apiKey: config.GEMINI_API_KEY,
        model: config.LLM_MODEL,
      });
      return defaultLlmProvider;

    default:
      throw new Error(`[Providers] Unsupported LLM provider: "${providerType}". Supported: "gemini".`);
  }
}

export function getSttProvider(): SttProvider {
  if (defaultSttProvider) {
    return defaultSttProvider;
  }

  const providerType = config.STT_PROVIDER.toLowerCase();

  switch (providerType) {
    case 'gemini':
      defaultSttProvider = new GeminiSttProvider({
        apiKey: config.GEMINI_API_KEY,
        model: config.STT_MODEL,
      });
      return defaultSttProvider;

    default:
      throw new Error(`[Providers] Unsupported STT provider: "${providerType}". Supported: "gemini".`);
  }
}

export function getTtsProvider(): TtsProvider {
  if (defaultTtsProvider) {
    return defaultTtsProvider;
  }

  const providerType = config.TTS_PROVIDER.toLowerCase();

  switch (providerType) {
    case 'elevenlabs':
      defaultTtsProvider = getElevenLabsProvider();
      return defaultTtsProvider;

    case 'voicevox':
      defaultTtsProvider = new VoicevoxTtsProvider({
        baseUrl: config.VOICEVOX_URL,
        speakerId: config.VOICEVOX_DEFAULT_SPEAKER,
        availableSpeakers: config.VOICEVOX_SPEAKERS,
        timeoutMs: config.TIMEOUT_TTS_MS,
      });
      return defaultTtsProvider;

    case 'edge':
    case 'microsoft':
    case 'gemini': // Fallback to ultra-fast Edge-TTS for real-time Discord voice
      defaultTtsProvider = new EdgeTtsProvider({
        voice: config.TTS_VOICE_ID && config.TTS_VOICE_ID !== 'Puck' ? config.TTS_VOICE_ID : 'id-ID-GadisNeural',
        speed: config.TTS_SPEED,
        pitch: config.TTS_PITCH,
      });
      return defaultTtsProvider;

    default:
      defaultTtsProvider = new EdgeTtsProvider({
        speed: config.TTS_SPEED,
        pitch: config.TTS_PITCH,
      });
      return defaultTtsProvider;
  }
}

let voicevoxInstance: VoicevoxTtsProvider | null = null;

export function getVoicevoxProvider(): VoicevoxTtsProvider {
  if (!voicevoxInstance) {
    voicevoxInstance = new VoicevoxTtsProvider({
      baseUrl: config.VOICEVOX_URL,
      speakerId: config.VOICEVOX_DEFAULT_SPEAKER,
      availableSpeakers: config.VOICEVOX_SPEAKERS,
      timeoutMs: config.TIMEOUT_TTS_MS,
    });
  }
  return voicevoxInstance;
}

export function activateVoicevoxProvider(speakerId?: number): VoicevoxTtsProvider {
  const provider = getVoicevoxProvider();
  if (speakerId !== undefined) {
    provider.switchSpeaker(speakerId);
  }
  defaultTtsProvider = provider;
  return provider;
}

export function activateEdgeProvider(options?: { speed?: number; pitch?: number; voice?: string }): EdgeTtsProvider {
  const provider = new EdgeTtsProvider({
    voice: options?.voice || (config.TTS_VOICE_ID && config.TTS_VOICE_ID !== 'Puck' ? config.TTS_VOICE_ID : 'id-ID-GadisNeural'),
    speed: options?.speed ?? config.TTS_SPEED,
    pitch: options?.pitch ?? config.TTS_PITCH,
  });
  defaultTtsProvider = provider;
  return provider;
}

export function setCustomTtsTuning(options: { speed?: number; pitch?: number; voice?: string }): TtsProvider {
  return activateEdgeProvider(options);
}

let elevenLabsInstance: ElevenLabsTtsProvider | null = null;

export function getElevenLabsProvider(): ElevenLabsTtsProvider {
  if (!elevenLabsInstance) {
    elevenLabsInstance = new ElevenLabsTtsProvider({
      apiKey: config.ELEVENLABS_API_KEY,
      voiceId: config.ELEVENLABS_VOICE_ID,
      modelId: config.ELEVENLABS_MODEL_ID,
      outputFormat: config.ELEVENLABS_OUTPUT_FORMAT,
      timeoutMs: config.TIMEOUT_TTS_MS,
    });
  }
  return elevenLabsInstance;
}

export function activateElevenLabsProvider(voiceId?: string): ElevenLabsTtsProvider {
  const provider = getElevenLabsProvider();
  if (voiceId) {
    provider.setVoiceId(voiceId);
  }
  defaultTtsProvider = provider;
  return provider;
}

