import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  OWNER_USER_ID: z.string().optional().default(''),
  DISCORD_GUILD_ALLOWLIST: z.string().transform((val) => val.split(',').map((id) => id.trim()).filter(Boolean)).default(''),
  DISCORD_USER_ALLOWLIST: z.string().transform((val) => val.split(',').map((id) => id.trim()).filter(Boolean)).default(''),
  ADMIN_WEBHOOK_URL: z.string().optional().default(''),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  LLM_PROVIDER: z.string().default('waterfall'),
  LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),

  // Groq API Configuration (Fast fallback)
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),

  // OpenRouter Configuration (Free tier backup)
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),

  STT_PROVIDER: z.string().default('gemini'),
  STT_MODEL: z.string().default('gemini-3.5-flash-lite'),
  TTS_PROVIDER: z.string().default('gemini'),
  TTS_MODEL: z.string().default('gemini-2.5-flash-preview-tts'),
  TTS_VOICE_ID: z.string().default('id-ID-GadisNeural'),
  TTS_SPEED: z.coerce.number().default(1.12),
  TTS_PITCH: z.coerce.number().default(18),
  LIVE_MODEL: z.string().default('gemini-2.0-flash-exp'),

  VOICEVOX_URL: z.string().url().default('http://127.0.0.1:50021'),
  VOICEVOX_DEFAULT_SPEAKER: z.coerce.number().default(46),
  VOICEVOX_SPEAKERS: z.string()
    .transform((val) => val.split(',').map((id) => parseInt(id.trim(), 10)).filter((n) => !isNaN(n)))
    .default('46,14'),

  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default('0CzBBZVHSe1kKQOUHVzq'),
  ELEVENLABS_VOICE_ID_2: z.string().default('N9pacNE5zbJ3p2Zw6iuD'),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_turbo_v2_5'),
  ELEVENLABS_OUTPUT_FORMAT: z.string().default('pcm_48000'),

  INTERACTION_MODE: z.enum(['wake', 'ptt', 'open']).default('wake'),
  WAKE_WORDS: z.string().transform((val) => val.split(',').map((w) => w.trim()).filter(Boolean)).default('Lyra,Lira,Airi,Bot,Halo'),
  VAD_HANGOVER_MS: z.coerce.number().default(1000),
  VOICE_MAX_OUTPUT_TOKENS: z.coerce.number().default(40),
  VOICE_MIN_WORDS_THRESHOLD: z.coerce.number().default(2),
  MAX_UTTERANCE_SEC: z.coerce.number().default(30),
  MAX_REPLY_SEC: z.coerce.number().default(20),
  BARGE_IN_THRESHOLD_MS: z.coerce.number().default(300),

  RATE_LIMIT_PER_MIN: z.coerce.number().default(6),
  DAILY_REQUEST_BUDGET: z.coerce.number().default(1000),
  DAILY_TOKEN_BUDGET: z.coerce.number().default(500000),
  TIMEOUT_STT_MS: z.coerce.number().default(5000),
  TIMEOUT_LLM_MS: z.coerce.number().default(8000),
  TIMEOUT_TTS_MS: z.coerce.number().default(5000),
  MAX_RETRIES: z.coerce.number().default(1),
  RETRY_BASE_DELAY_MS: z.coerce.number().default(300),
  VOICE_RECONNECT_MAX_ATTEMPTS: z.coerce.number().default(5),
  VOICE_RECONNECT_BASE_DELAY_MS: z.coerce.number().default(1000),
  CHAT_CHANNEL_NAMES: z.string().transform((val) => val.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)).default('chat-ai,bot-chat,lyra-chat,obrolan-ai,general-ai'),
  CHAT_CHANNEL_IDS: z.string().transform((val) => val.split(',').map((id) => id.trim()).filter(Boolean)).default(''),
  CHAT_COOLDOWN_MS: z.coerce.number().default(3000),
  BOT_ENABLED: z.coerce.boolean().default(true),

  MEMORY_DB_URL: z.string().default('file:./data/memory.sqlite'),
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().default(7),
  PERSONA_DIR: z.string().default('persona/'),

  LOG_LEVEL: z.string().default('info'),
  DEBUG_SAVE_AUDIO: z.coerce.boolean().default(false),
  HEALTH_PORT: z.coerce.number().default(8080),
  NODE_ENV: z.string().default('development'),
});

export type Config = z.infer<typeof envSchema>;

let parsedConfig: Config;

try {
  parsedConfig = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.warn('[Config] Running in unconfigured mode or missing required variables in .env:', error.format());
    // Provide safe defaults for offline testing / spike setup
    parsedConfig = envSchema.parse({
      ...process.env,
      DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'dummy_token_for_scaffold',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'dummy_key_for_scaffold',
    });
  } else {
    throw error;
  }
}

export const config = parsedConfig;
