/**
 * Streaming Voice Pipeline
 * Implements PRD §5, §15 (Task T3.2) & TC-04:
 * - Direct sentence chunker pipelining into TTS without waiting for full LLM response
 * - Overlaps synthesis of sentence N+1 while sentence N is actively playing
 * - Instant phrase cache checking for common persona phrases (< 300ms, typically < 10ms)
 * - Immediate barge-in abort propagation
 */

import { StreamType } from '@discordjs/voice';
import { chunkSentences, ChunkerOptions } from '../providers/sentence-chunker.js';
import { TtsProvider } from '../providers/tts-provider.js';
import { VoicePlayer } from './voice-player.js';
import { phraseAudioCache } from './phrase-audio-cache.js';
import { withRetry, withTimeout } from './resilience.js';

export interface PipelineCallbacks {
  onSentenceChunk?: (sentence: string, index: number, isFirst: boolean) => void;
  onTtsStart?: (sentence: string, index: number) => void;
  onTtsFinish?: (sentence: string, index: number, durationMs: number) => void;
  onAudioEnqueued?: (index: number) => void;
  onError?: (err: any, sentence: string, index: number) => void;
}

export interface StreamingPipelineOptions {
  abortSignal?: AbortSignal;
  chunkerOptions?: ChunkerOptions;
  ttsTimeoutMs?: number;
  maxTtsRetries?: number;
  cleanForTts?: (raw: string) => string;
  enablePhraseCache?: boolean;
  callbacks?: PipelineCallbacks;
}

export interface PipelineExecutionResult {
  fullText: string;
  sentenceCount: number;
  audioChunksEnqueued: number;
  phraseCacheHits: number;
  isAborted: boolean;
  t3FirstSentenceReadyTime?: number;
  t4FirstTtsAudioReadyTime?: number;
}

export class StreamingVoicePipeline {
  private ttsProvider: TtsProvider;
  private voicePlayer: VoicePlayer;

  constructor(ttsProvider: TtsProvider, voicePlayer: VoicePlayer) {
    this.ttsProvider = ttsProvider;
    this.voicePlayer = voicePlayer;
  }

  /**
   * Processes streaming LLM tokens, chunks into sentences, synthesizes TTS in background,
   * and streams audio buffers into the VoicePlayer without blocking upstream generation.
   */
  public async execute(
    tokenStream: AsyncIterable<string>,
    options: StreamingPipelineOptions = {}
  ): Promise<PipelineExecutionResult> {
    const abortSignal = options.abortSignal;
    const ttsTimeoutMs = options.ttsTimeoutMs ?? 5000;
    const maxRetries = options.maxTtsRetries ?? 2;
    const enablePhraseCache = options.enablePhraseCache ?? true;
    const cleanFn = options.cleanForTts ?? ((t) => t.trim());

    let fullText = '';
    let sentenceIndex = 0;
    let audioChunksEnqueued = 0;
    let phraseCacheHits = 0;
    let t3FirstSentenceReadyTime: number | undefined;
    let t4FirstTtsAudioReadyTime: number | undefined;

    // Queue of synthesis promises to maintain strictly ordered sequential playback
    // while executing network synthesis concurrently
    const synthesisQueue: Array<Promise<{ index: number; buffer: Buffer; sentence: string } | null>> = [];

    // Chunker options: PRD mandates first chunk <= 8 words for low-latency TTFT -> TTS
    const chunker = chunkSentences(tokenStream, options.chunkerOptions ?? { maxFirstChunkWords: 8 });

    // Background player dispatcher that awaits synthesis in order and enqueues to VoicePlayer
    let playbackError: any = null;
    let isDispatcherRunning = true;

    const dispatchPlaybackLoop = (async () => {
      let dispatchIdx = 0;
      while (isDispatcherRunning || dispatchIdx < synthesisQueue.length) {
        if (abortSignal?.aborted) break;

        if (dispatchIdx < synthesisQueue.length) {
          const promise = synthesisQueue[dispatchIdx];
          dispatchIdx++;

          try {
            const item = await promise;
            if (abortSignal?.aborted) break;

            if (item && item.buffer.length > 0) {
              if (item.index === 0 && !t4FirstTtsAudioReadyTime) {
                t4FirstTtsAudioReadyTime = Date.now();
              }
              const inputType = this.ttsProvider.getStreamType() === 'raw' ? StreamType.Raw : StreamType.WebmOpus;
              await this.voicePlayer.enqueue(item.buffer, inputType);
              audioChunksEnqueued++;
              options.callbacks?.onAudioEnqueued?.(item.index);
            }
          } catch (err: any) {
            playbackError = err;
            console.error(`[StreamingVoicePipeline] Error in playback dispatch #${dispatchIdx - 1}:`, err.message);
          }
        } else {
          // Yield to event loop briefly while waiting for next sentence chunk
          await new Promise((r) => setTimeout(r, 10));
        }
      }
    })();

    try {
      for await (const rawChunk of chunker) {
        if (abortSignal?.aborted) {
          break;
        }

        const currentIdx = sentenceIndex++;
        const isFirst = currentIdx === 0;

        if (isFirst && !t3FirstSentenceReadyTime) {
          t3FirstSentenceReadyTime = Date.now();
        }

        fullText += (fullText ? ' ' : '') + rawChunk;
        options.callbacks?.onSentenceChunk?.(rawChunk, currentIdx, isFirst);

        const cleanSentence = cleanFn(rawChunk);
        if (!cleanSentence) {
          continue;
        }

        // Start synthesizing immediately in the background without awaiting here!
        const synthPromise = (async (): Promise<{ index: number; buffer: Buffer; sentence: string } | null> => {
          if (abortSignal?.aborted) return null;

          // Check Phrase Audio Cache first (instant hit)
          if (enablePhraseCache && phraseAudioCache.has(cleanSentence)) {
            const cachedBuffer = phraseAudioCache.get(cleanSentence);
            if (cachedBuffer) {
              phraseCacheHits++;
              if (isFirst && !t4FirstTtsAudioReadyTime) {
                t4FirstTtsAudioReadyTime = Date.now();
              }
              return { index: currentIdx, buffer: cachedBuffer, sentence: cleanSentence };
            }
          }

          const synthStart = Date.now();
          options.callbacks?.onTtsStart?.(cleanSentence, currentIdx);

          try {
            const buffer = await withRetry(
              async () => {
                return await withTimeout(
                  this.ttsProvider.synthesize(cleanSentence),
                  ttsTimeoutMs,
                  `TTS-Sentence-${currentIdx}`
                );
              },
              {
                maxRetries,
                baseDelayMs: 300,
                jitterMs: 100,
              }
            );

            if (abortSignal?.aborted) return null;

            options.callbacks?.onTtsFinish?.(cleanSentence, currentIdx, Date.now() - synthStart);
            return { index: currentIdx, buffer, sentence: cleanSentence };
          } catch (err: any) {
            options.callbacks?.onError?.(err, cleanSentence, currentIdx);
            return null;
          }
        })();

        synthesisQueue.push(synthPromise);
      }
    } finally {
      isDispatcherRunning = false;
      await dispatchPlaybackLoop;
    }

    if (playbackError) {
      throw playbackError;
    }

    return {
      fullText,
      sentenceCount: sentenceIndex,
      audioChunksEnqueued,
      phraseCacheHits,
      isAborted: Boolean(abortSignal?.aborted),
      t3FirstSentenceReadyTime,
      t4FirstTtsAudioReadyTime,
    };
  }
}
