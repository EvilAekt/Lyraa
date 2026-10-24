/**
 * Resilience utilities: Timeout, Retry with Jitter, and Fallback Strategy
 * Strict PRD §6, §15 (Task T1.7), and TDD §6 (item 7) compliance.
 */

export class TimeoutError extends Error {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number, nextDelayMs: number) => void;
}

/**
 * Execute a promise with a hard timeout.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;

    timer = setTimeout(() => {
      timer = null;
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => {
        if (timer) {
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch((err) => {
        if (timer) {
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

/**
 * Calculate delay with exponential backoff and random jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs = 300,
  maxDelayMs = 2000,
  jitterMs = 150
): number {
  const exponential = baseDelayMs * Math.pow(1.5, attempt);
  const jitter = Math.floor(Math.random() * jitterMs);
  return Math.min(Math.floor(exponential + jitter), maxDelayMs);
}

/**
 * Execute an async operation with up to maxRetries attempts and jitter backoff.
 * Per TDD §6 item 7: default is 1 retry with jitter.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const jitterMs = options.jitterMs ?? 150;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = err;

      if (attempt < maxRetries) {
        if (options.shouldRetry && !options.shouldRetry(err)) {
          throw err;
        }

        const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs);
        if (options.onRetry) {
          options.onRetry(err, attempt + 1, delay);
        } else {
          console.warn(
            `[Resilience] [Retry ${attempt + 1}/${maxRetries}] Operation failed (${err.message}). Retrying in ${delay}ms...`
          );
        }
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Persona canned fallback phrases when LLM is unavailable or fails (TDD §6 item 7).
 */
export const FALLBACK_LLM_PHRASES: readonly string[] = [
  'Maaf ya, koneksiku lagi agak tersendat barusan.',
  'Aduh, sinyalku ngelag sebentar. Boleh tolong ulangi?',
  'Eh bentar, pikiranku agak loading nih. Coba tanya lagi ya!',
  'Waduh, suaramu tadi sempat terputus di tempatku, bisa diulang?',
];

/**
 * Get a random fallback phrase from the canned persona list.
 */
export function getRandomFallbackPhrase(): string {
  const index = Math.floor(Math.random() * FALLBACK_LLM_PHRASES.length);
  return FALLBACK_LLM_PHRASES[index];
}
