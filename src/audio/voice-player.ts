/**
 * Voice Player for Discord Voice Connection
 * Manages AudioPlayer lifecycle, queueing, buffering, volume normalization, and playback state.
 * Implements PRD §7, PRD §15 (Task T3.5), and TC-05:
 * - Volume normalization via inline volume transformer (default multiplier: 0.85 / -16 LUFS)
 * - Natural inter-sentence pause insertion (150–300 ms, default 200 ms)
 * - Buffer underrun detection and metric recording (> 400 ms gap threshold)
 * - Rapid interruption/barge-in (< 300 ms) via stop() and clearQueue()
 */

import { Readable } from 'node:stream';
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
} from '@discordjs/voice';
import { DEFAULT_AUDIO_CONFIG } from './audio-normalizer.js';

export interface QueueItem {
  id: string;
  buffer: Buffer;
  inputType: StreamType;
  resolve: () => void;
  reject: (err: any) => void;
}

export interface VoicePlayerOptions {
  volume?: number;
  inlineVolume?: boolean;
  interSentencePauseMs?: number;
  maxAllowedGapMs?: number;
  onUnderrun?: (gapMs: number) => void;
}

export interface PlaybackStats {
  totalItemsPlayed: number;
  underrunCount: number;
  maxGapMs: number;
  recordedGaps: number[];
}

export class VoicePlayer {
  private player: AudioPlayer;
  private connection: VoiceConnection | null = null;
  private currentPlayResolve: (() => void) | null = null;
  private queue: QueueItem[] = [];
  private isProcessingQueue = false;

  // Audio Quality & Inter-Sentence Settings (PRD §7)
  private volume: number;
  private inlineVolume: boolean;
  private interSentencePauseMs: number;
  private maxAllowedGapMs: number;
  private onUnderrun?: (gapMs: number) => void;

  // Underrun & Gap Monitoring Metrics
  private lastPlayEndTime: number | null = null;
  private totalItemsPlayed = 0;
  private underrunCount = 0;
  private recordedGaps: number[] = [];

  constructor(options: VoicePlayerOptions = {}) {
    this.volume = options.volume ?? DEFAULT_AUDIO_CONFIG.defaultVolumeMultiplier;
    this.inlineVolume = options.inlineVolume ?? false;
    this.interSentencePauseMs = options.interSentencePauseMs ?? DEFAULT_AUDIO_CONFIG.interSentencePauseMs;
    this.maxAllowedGapMs = options.maxAllowedGapMs ?? DEFAULT_AUDIO_CONFIG.maxUnderrunThresholdMs;
    this.onUnderrun = options.onUnderrun;

    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 50,
      },
    });

    let autoPausedTimer: NodeJS.Timeout | null = null;

    this.player.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        if (autoPausedTimer) {
          clearTimeout(autoPausedTimer);
          autoPausedTimer = null;
        }
        if (this.currentPlayResolve) {
          const resolve = this.currentPlayResolve;
          this.currentPlayResolve = null;
          resolve();
        }
      } else if (newState.status === AudioPlayerStatus.AutoPaused) {
        // Handle AutoPaused state: attempt unpause immediately to recover playback
        this.player.unpause();
        if (!autoPausedTimer) {
          autoPausedTimer = setTimeout(() => {
            autoPausedTimer = null;
            if (this.player.state.status === AudioPlayerStatus.AutoPaused && this.currentPlayResolve) {
              console.warn('[VoicePlayer] Player remained in AutoPaused. Resolving lock to prevent audio deadlock.');
              const resolve = this.currentPlayResolve;
              this.currentPlayResolve = null;
              resolve();
            }
          }, 1500);
        }
      } else {
        if (autoPausedTimer) {
          clearTimeout(autoPausedTimer);
          autoPausedTimer = null;
        }
      }
    });

    this.player.on('error', (error) => {
      console.error('[VoicePlayer] Audio player error:', error.message);
      if (this.currentPlayResolve) {
        const resolve = this.currentPlayResolve;
        this.currentPlayResolve = null;
        resolve();
      }
    });
  }

  /**
   * Attaches this player to an active Discord voice connection.
   */
  public attach(connection: VoiceConnection) {
    this.connection = connection;
    connection.subscribe(this.player);
  }

  /**
   * Sets the playback volume multiplier (e.g. 0.85 = -16 LUFS normalized).
   */
  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(2.0, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Sets natural inter-sentence pause duration (PRD §7 mandates 150-300 ms).
   */
  public setInterSentencePause(ms: number) {
    this.interSentencePauseMs = Math.max(0, ms);
  }

  public getInterSentencePause(): number {
    return this.interSentencePauseMs;
  }

  /**
   * Returns current playback & underrun statistics.
   */
  public getPlaybackStats(): PlaybackStats {
    const maxGapMs = this.recordedGaps.length > 0 ? Math.max(...this.recordedGaps) : 0;
    return {
      totalItemsPlayed: this.totalItemsPlayed,
      underrunCount: this.underrunCount,
      maxGapMs,
      recordedGaps: [...this.recordedGaps],
    };
  }

  /**
   * Resets recorded playback metrics.
   */
  public resetPlaybackStats() {
    this.totalItemsPlayed = 0;
    this.underrunCount = 0;
    this.recordedGaps = [];
    this.lastPlayEndTime = null;
  }

  /**
   * Returns true if audio is actively playing or queued.
   */
  public isPlaying(): boolean {
    return (
      this.player.state.status === AudioPlayerStatus.Playing ||
      this.player.state.status === AudioPlayerStatus.Buffering ||
      this.isProcessingQueue ||
      this.queue.length > 0
    );
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clears all pending audio items in the queue without playing.
   * Returns the number of purged items.
   */
  public clearQueue(): number {
    const count = this.queue.length;
    for (const item of this.queue) {
      item.resolve();
    }
    this.queue = [];
    this.lastPlayEndTime = null;
    return count;
  }

  /**
   * Stops any currently playing audio and purges queue immediately.
   * Returns latency in milliseconds (target: <= 300ms for TC-05).
   */
  public stop(): number {
    const start = Date.now();
    this.clearQueue();

    if (this.currentPlayResolve) {
      const resolve = this.currentPlayResolve;
      this.currentPlayResolve = null;
      resolve();
    }

    this.player.stop(true);
    this.isProcessingQueue = false;
    this.lastPlayEndTime = null;
    return Date.now() - start;
  }

  /**
   * Plays an audio buffer immediately, halting and purging any previous audio.
   */
  public async play(
    audioBuffer: Buffer,
    inputType: StreamType = StreamType.WebmOpus
  ): Promise<void> {
    this.stop();
    return this.enqueue(audioBuffer, inputType);
  }

  /**
   * Automatically detects audio stream format from buffer magic bytes.
   * - 0x4F, 0x67, 0x67, 0x53 ('OggS') -> StreamType.OggOpus
   * - 0x1A, 0x45, 0xDF, 0xA3 (EBML)   -> StreamType.WebmOpus
   * - Fallback to provided hintType or StreamType.Raw
   */
  public static detectStreamType(buffer: Buffer, hintType?: StreamType): StreamType {
    if (buffer && buffer.length >= 4) {
      if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
        return StreamType.OggOpus;
      }
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return StreamType.WebmOpus;
      }
    }
    return hintType ?? StreamType.Raw;
  }

  /**
   * Enqueues an audio buffer to be played sequentially.
   */
  public async enqueue(
    audioBuffer: Buffer,
    inputType: StreamType = StreamType.WebmOpus
  ): Promise<void> {
    if (audioBuffer.length === 0) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        id: Math.random().toString(36).slice(2),
        buffer: audioBuffer,
        inputType,
        resolve,
        reject,
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      // Check inter-sentence timing if previous item finished recently (< 1500ms = same response turn)
      if (this.lastPlayEndTime !== null) {
        const elapsedSinceLast = Date.now() - this.lastPlayEndTime;

        if (elapsedSinceLast < 1500) {
          // If natural inter-sentence pause is desired and elapsed time is less than target pause
          if (this.interSentencePauseMs > 0 && elapsedSinceLast < this.interSentencePauseMs) {
            const delayNeeded = this.interSentencePauseMs - elapsedSinceLast;
            await new Promise((r) => setTimeout(r, delayNeeded));
          }

          // Measure gap between sentence chunks
          const actualGap = Date.now() - this.lastPlayEndTime;
          this.recordedGaps.push(actualGap);

          // Buffer underrun detection (> 400ms per PRD §7)
          if (actualGap > this.maxAllowedGapMs) {
            this.underrunCount++;
            this.onUnderrun?.(actualGap);
            console.warn(
              `[VoicePlayer] Buffer underrun detected: ${actualGap}ms gap between chunks (limit: ${this.maxAllowedGapMs}ms)`
            );
          }
        }
      }

      try {
        const detectedType = VoicePlayer.detectStreamType(item.buffer, item.inputType);
        const stream = Readable.from(item.buffer);
        const useInlineVolume = this.inlineVolume && detectedType === StreamType.Raw;
        const resource = createAudioResource(stream, {
          inputType: detectedType,
          inlineVolume: useInlineVolume,
        });

        // Apply normalized volume level if inlineVolume is enabled on raw PCM
        if (useInlineVolume && resource.volume) {
          resource.volume.setVolume(this.volume);
        }

        // Calculate dynamic safety timeout based on buffer length
        let maxPlayMs = 12000;
        if (detectedType === StreamType.Raw) {
          maxPlayMs = Math.max(6000, Math.min(25000, Math.ceil((item.buffer.length / 192000) * 1000) + 4000));
        }

        await new Promise<void>((resolve) => {
          let hasFinished = false;
          let playTimeoutTimer: NodeJS.Timeout | null = null;

          const finishPlay = () => {
            if (!hasFinished) {
              hasFinished = true;
              if (playTimeoutTimer) {
                clearTimeout(playTimeoutTimer);
                playTimeoutTimer = null;
              }
              this.currentPlayResolve = null;
              resolve();
            }
          };

          this.currentPlayResolve = finishPlay;

          resource.playStream.once('error', (streamErr) => {
            console.warn(`[VoicePlayer] Resource playStream error: ${streamErr.message}`);
            finishPlay();
          });

          playTimeoutTimer = setTimeout(() => {
            console.warn(`[VoicePlayer] Safety timeout reached (${maxPlayMs}ms). Releasing playback lock.`);
            finishPlay();
          }, maxPlayMs);

          this.player.play(resource);
        });

        this.lastPlayEndTime = Date.now();
        this.totalItemsPlayed++;
        item.resolve();
      } catch (err: any) {
        console.error('[VoicePlayer] Playback item error:', err.message);
        this.lastPlayEndTime = Date.now();
        item.resolve();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Destroys the player and releases resources.
   */
  public destroy() {
    this.stop();
    this.connection = null;
  }
}
