export interface TurnTimestamps {
  /** t0: User speech finished (VAD endpoint) */
  t0: number;
  /** t1: STT transcript ready */
  t1?: number;
  /** t2: First LLM token received */
  t2?: number;
  /** t3: First sentence chunk ready for TTS */
  t3?: number;
  /** t4: First TTS audio chunk received */
  t4?: number;
  /** t5: First audio packet sent to Discord UDP socket */
  t5?: number;
}

export interface TurnLatency {
  turnId: string;
  userId: string;
  totalMs: number;
  sttMs?: number;
  llmTimeToFirstTokenMs?: number;
  chunkerMs?: number;
  ttsMs?: number;
  dispatchMs?: number;
  timestamp: string;
}

export interface PersonaConfig {
  character: string;
  voiceStyle: string;
  rules: string;
  examples: Array<{ input: string; output: string }>;
  lexicon: Record<string, string>;
  version: string;
}

export type InteractionMode = 'wake' | 'ptt' | 'open';
