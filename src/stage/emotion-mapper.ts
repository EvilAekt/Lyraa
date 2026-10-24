/**
 * Emotion Mapping Table for VRM Avatar (Task T6.1, FR-X1)
 * Maps natural conversational emotion tags from Persona system to standard VRM expressions:
 * - neutral, happy, angry, sad, relaxed, surprised
 */

export type VrmExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised';

export interface EmotionMappingResult {
  vrmExpression: VrmExpression;
  confidence: number;
  transitionDurationMs: number;
}

export const EMOTION_TO_VRM_TABLE: Record<string, VrmExpression> = {
  // Joy / Happiness
  happy: 'happy',
  senang: 'happy',
  gembira: 'happy',
  laugh: 'happy',
  tawa: 'happy',
  excited: 'happy',
  semangat: 'happy',
  smile: 'happy',
  senyum: 'happy',

  // Sadness / Grief
  sad: 'sad',
  sedih: 'sad',
  kecewa: 'sad',
  cry: 'sad',
  nangis: 'sad',
  terharu: 'sad',

  // Anger / Irritation
  angry: 'angry',
  marah: 'angry',
  kesal: 'angry',
  ngambek: 'angry',
  annoyed: 'angry',

  // Surprise / Shock
  surprised: 'surprised',
  kaget: 'surprised',
  terkejut: 'surprised',
  shock: 'surprised',
  bingung: 'surprised',
  confused: 'surprised',

  // Relaxed / Thinking / Calm
  relaxed: 'relaxed',
  santai: 'relaxed',
  calm: 'relaxed',
  thinking: 'relaxed',
  mikir: 'relaxed',
  shy: 'relaxed',
  malu: 'relaxed',

  // Default / Neutral
  neutral: 'neutral',
  netral: 'neutral',
  idle: 'neutral',
};

/**
 * Maps an emotion tag string (e.g. from persona output) to standard VRM expression.
 * Returns transition duration within the 300 ms SLA requirement.
 */
export function mapEmotionToVrm(rawEmotion?: string): EmotionMappingResult {
  if (!rawEmotion) {
    return {
      vrmExpression: 'neutral',
      confidence: 1.0,
      transitionDurationMs: 200,
    };
  }

  const cleaned = rawEmotion.toLowerCase().trim();
  const vrmExpression = EMOTION_TO_VRM_TABLE[cleaned] || 'neutral';

  return {
    vrmExpression,
    confidence: EMOTION_TO_VRM_TABLE[cleaned] ? 1.0 : 0.5,
    transitionDurationMs: 200, // Meets < 300ms SLA
  };
}
