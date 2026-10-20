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
  LLM_PROVIDER: z.string().default('gemini'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  STT_PROVIDER: z.string().default('gemini'),
  STT_MODEL: z.string().default('gemini-2.5-flash'),
  TTS_PROVIDER: z.string().default('gemini'),
  TTS_MODEL: z.string().default('gemini-2.5-flash'),
  TTS_VOICE_ID: z.string().default('Puck'),
  LIVE_MODEL: z.string().default('gemini-2.0-flash-exp'),

  INTERACTION_MODE: z.enum(['wake', 'ptt', 'open']).default('wake'),
  WAKE_WORDS: z.string().transform((val) => val.split(',').map((w) => w.trim()).filter(Boolean)).default('Airi,Bot'),
  VAD_HANGOVER_MS: z.coerce.number().default(500),
  MAX_UTTERANCE_SEC: z.coerce.number().default(30),
  MAX_REPLY_SEC: z.coerce.number().default(20),
  BARGE_IN_THRESHOLD_MS: z.coerce.number().default(300),

  RATE_LIMIT_PER_MIN: z.coerce.number().default(6),
  DAILY_REQUEST_BUDGET: z.coerce.number().default(1000),
  DAILY_TOKEN_BUDGET: z.coerce.number().default(500000),
  TIMEOUT_STT_MS: z.coerce.number().default(5000),
  TIMEOUT_LLM_MS: z.coerce.number().default(8000),
  TIMEOUT_TTS_MS: z.coerce.number().default(5000),
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
