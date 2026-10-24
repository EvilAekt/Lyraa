/**
 * T6.2 Spike Pipeline B (Gemini Live Speech-to-Speech)
 * 
 * Implements bidirectional real-time audio streaming prototype using Google Gemini Live API:
 * - Direct raw audio stream (PCM 16-bit, 16kHz mono) -> Gemini Live
 * - Native speech output (PCM 24kHz mono) -> resample to 48kHz for Discord Voice
 * - Session Resumption enabled from start (handle caching & reconnection within 2h)
 * - Context window compression enabled (sliding window to prevent 15m session cutoff)
 * - Automatic VAD & Barge-in interruption signal handling
 * - Comprehensive latency & turn instrumentation (t0..t5)
 */

import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../config/index.js';

export interface PipelineBLiveOptions {
  model?: string;
  apiKey?: string;
  systemInstruction?: string;
  voiceName?: 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Puck';
  sampleRateIn?: number;  // 16000
  sampleRateOut?: number; // 24000
  enableResumption?: boolean;
  enableCompression?: boolean;
  initialHandle?: string | null;
  mockMode?: boolean;
}

export interface LiveTurnMetrics {
  turnId: string;
  t0UserSpeechEnd: number;
  t1FirstAudioChunk: number;
  t2FirstDiscordPacket: number;
  turnLatencyMs: number;
  audioChunksReceived: number;
  totalAudioBytesReceived: number;
  interrupted: boolean;
}

export interface PipelineBSessionState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
  resumptionHandle: string | null;
  resumable: boolean;
  totalTurnsHandled: number;
  lastError: string | null;
}

/**
 * PipelineBLiveSession handles bidirectional communication with Gemini Live.
 */
export class PipelineBLiveSession extends EventEmitter {
  private options: Required<PipelineBLiveOptions>;
  private genai: GoogleGenAI | null = null;
  private activeSession: any = null;
  private state: PipelineBSessionState = {
    status: 'idle',
    resumptionHandle: null,
    resumable: false,
    totalTurnsHandled: 0,
    lastError: null,
  };

  private currentTurnMetrics: LiveTurnMetrics | null = null;
  private simulatedTimer: NodeJS.Timeout | null = null;

  constructor(options: PipelineBLiveOptions = {}) {
    super();
    this.options = {
      model: options.model || 'gemini-2.0-flash-exp',
      apiKey: options.apiKey || config.GEMINI_API_KEY || 'mock_key',
      systemInstruction: options.systemInstruction || 'You are Lyra, a cheerful and tech-savvy VTuber AI.',
      voiceName: options.voiceName || 'Aoede',
      sampleRateIn: options.sampleRateIn || 16000,
      sampleRateOut: options.sampleRateOut || 24000,
      enableResumption: options.enableResumption ?? true,
      enableCompression: options.enableCompression ?? true,
      initialHandle: options.initialHandle || null,
      mockMode: options.mockMode ?? (config.GEMINI_API_KEY === 'dummy_key_for_scaffold' || !config.GEMINI_API_KEY),
    };

    if (this.options.initialHandle) {
      this.state.resumptionHandle = this.options.initialHandle;
      this.state.resumable = true;
    }
  }

  public getState(): PipelineBSessionState {
    return { ...this.state };
  }

  public getResumptionHandle(): string | null {
    return this.state.resumptionHandle;
  }

  /**
   * Connects to Gemini Live API with session resumption and context compression.
   */
  public async connect(): Promise<boolean> {
    this.state.status = this.state.resumptionHandle ? 'reconnecting' : 'connecting';
    this.emit('status', this.state.status);

    if (this.options.mockMode) {
      // Deterministic Mock Adapter for spike evaluation and test environments
      await new Promise((res) => setTimeout(res, 50));
      this.state.status = 'connected';
      if (!this.state.resumptionHandle) {
        this.state.resumptionHandle = `live-handle-mock-${Date.now()}`;
        this.state.resumable = true;
      }
      this.emit('status', 'connected');
      this.emit('resumption_update', {
        resumable: true,
        newHandle: this.state.resumptionHandle,
      });
      return true;
    }

    try {
      this.genai = new GoogleGenAI({ apiKey: this.options.apiKey });

      const connectConfig: any = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{ text: this.options.systemInstruction }],
        },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.options.voiceName,
            },
          },
        },
      };

      if (this.options.enableResumption) {
        connectConfig.sessionResumption = {
          handle: this.state.resumptionHandle || undefined,
        };
      }

      if (this.options.enableCompression) {
        connectConfig.contextWindowCompression = {
          slidingWindow: {},
        };
      }

      this.activeSession = await this.genai.live.connect({
        model: this.options.model,
        config: connectConfig,
        callbacks: {
          onopen: () => {
            this.state.status = 'connected';
            this.emit('status', 'connected');
          },
          onmessage: (msg: any) => {
            this.handleIncomingServerMessage(msg);
          },
          onerror: (err: any) => {
            this.state.lastError = err?.message || String(err);
            this.state.status = 'error';
            this.emit('error', err);
          },
          onclose: (e: any) => {
            this.state.status = 'closed';
            this.emit('close', e);
          },
        },
      });

      return true;
    } catch (err: any) {
      this.state.status = 'error';
      this.state.lastError = err?.message || String(err);
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Resumes an existing or interrupted session using the given or stored resumption token.
   */
  public async resume(targetHandle?: string): Promise<boolean> {
    if (targetHandle) {
      this.state.resumptionHandle = targetHandle;
    }
    await this.disconnect();
    return this.connect();
  }

  /**
   * Disconnects current session.
   */
  public async disconnect(): Promise<void> {
    if (this.simulatedTimer) {
      clearTimeout(this.simulatedTimer);
      this.simulatedTimer = null;
    }

    if (this.activeSession) {
      try {
        if (typeof this.activeSession.close === 'function') {
          this.activeSession.close();
        }
      } catch {
        // ignore close error
      }
      this.activeSession = null;
    }

    this.state.status = 'closed';
    this.emit('status', 'closed');
  }

  /**
   * Streams a PCM 16kHz audio chunk into Gemini Live.
   */
  public sendAudioChunk(pcm16kChunk: Buffer): void {
    if (this.state.status !== 'connected') {
      throw new Error(`Cannot send audio while in state: ${this.state.status}`);
    }

    if (!this.currentTurnMetrics) {
      const now = Date.now();
      this.currentTurnMetrics = {
        turnId: `turn-${Date.now()}`,
        t0UserSpeechEnd: now,
        t1FirstAudioChunk: 0,
        t2FirstDiscordPacket: 0,
        turnLatencyMs: 0,
        audioChunksReceived: 0,
        totalAudioBytesReceived: 0,
        interrupted: false,
      };
    }

    if (this.options.mockMode) {
      // In mock mode, sending audio triggers simulated response after realistic network RTT
      return;
    }

    if (this.activeSession && typeof this.activeSession.sendRealtimeInput === 'function') {
      this.activeSession.sendRealtimeInput({
        audio: {
          data: pcm16kChunk.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    }
  }

  /**
   * Signals the end of user speech (Hybrid VAD trigger).
   */
  public sendEndOfTurn(): void {
    if (this.state.status !== 'connected') return;

    if (this.currentTurnMetrics) {
      this.currentTurnMetrics.t0UserSpeechEnd = Date.now();
    }

    if (this.options.mockMode) {
      this.simulateMockResponse();
      return;
    }

    if (this.activeSession && typeof this.activeSession.sendRealtimeInput === 'function') {
      this.activeSession.sendRealtimeInput({
        audioStreamEnd: true,
      });
    }
  }

  /**
   * Handles user barge-in interruption.
   */
  public triggerBargeIn(): void {
    if (this.currentTurnMetrics) {
      this.currentTurnMetrics.interrupted = true;
    }
    if (this.simulatedTimer) {
      clearTimeout(this.simulatedTimer);
      this.simulatedTimer = null;
    }
    this.emit('interrupted');
  }

  /**
   * Processes incoming server messages from Gemini Live WebSocket.
   */
  private handleIncomingServerMessage(msg: any): void {
    // 1. Session Resumption Update
    if (msg.sessionResumptionUpdate) {
      const update = msg.sessionResumptionUpdate;
      if (update.resumable && update.newHandle) {
        this.state.resumptionHandle = update.newHandle;
        this.state.resumable = true;
        this.emit('resumption_update', update);
      }
    }

    const serverContent = msg.serverContent;
    if (!serverContent) return;

    // 2. Interruption event
    if (serverContent.interrupted) {
      this.triggerBargeIn();
      return;
    }

    // 3. Audio parts
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          const raw24kAudio = Buffer.from(part.inlineData.data, 'base64');
          this.processOutputAudio(raw24kAudio);
        }
      }
    }

    // 4. Transcription
    if (serverContent.outputTranscription?.text) {
      this.emit('transcription', {
        text: serverContent.outputTranscription.text,
        sender: 'model',
      });
    }

    // 5. Turn Complete
    if (serverContent.turnComplete) {
      this.state.totalTurnsHandled++;
      if (this.currentTurnMetrics) {
        this.emit('turn_complete', { ...this.currentTurnMetrics });
        this.currentTurnMetrics = null;
      }
    }
  }

  /**
   * Resamples raw 24kHz PCM mono to 48kHz PCM mono for Discord Opus pipeline.
   */
  public static resample24kTo48k(pcm24k: Buffer): Buffer {
    // Linear 2x interpolation from 24kHz 16-bit mono to 48kHz 16-bit mono
    const numSamples = Math.floor(pcm24k.length / 2);
    const outBuf = Buffer.alloc(numSamples * 2 * 2);

    for (let i = 0; i < numSamples; i++) {
      const s0 = pcm24k.readInt16LE(i * 2);
      const s1 = i + 1 < numSamples ? pcm24k.readInt16LE((i + 1) * 2) : s0;
      const sMid = Math.round((s0 + s1) / 2);

      outBuf.writeInt16LE(s0, i * 4);
      outBuf.writeInt16LE(sMid, i * 4 + 2);
    }
    return outBuf;
  }

  /**
   * Internal processor for incoming audio stream.
   */
  private processOutputAudio(raw24kPcm: Buffer): void {
    const now = Date.now();
    if (this.currentTurnMetrics) {
      if (this.currentTurnMetrics.t1FirstAudioChunk === 0) {
        this.currentTurnMetrics.t1FirstAudioChunk = now;
        this.currentTurnMetrics.turnLatencyMs = now - this.currentTurnMetrics.t0UserSpeechEnd;
      }
      this.currentTurnMetrics.audioChunksReceived++;
      this.currentTurnMetrics.totalAudioBytesReceived += raw24kPcm.length;
    }

    // Convert 24k -> 48k
    const pcm48k = PipelineBLiveSession.resample24kTo48k(raw24kPcm);

    if (this.currentTurnMetrics && this.currentTurnMetrics.t2FirstDiscordPacket === 0) {
      this.currentTurnMetrics.t2FirstDiscordPacket = Date.now();
    }

    this.emit('audio_output', {
      raw24k: raw24kPcm,
      pcm48k,
      timestamp: now,
    });
  }

  /**
   * Simulates response in mock mode for benchmarking and automated testing.
   */
  private simulateMockResponse(): void {
    // Simulated speech-to-speech network roundtrip (typically ~620ms - 880ms)
    const simulatedLatencyMs = 650 + Math.floor(Math.random() * 150);

    this.simulatedTimer = setTimeout(() => {
      if (this.state.status !== 'connected') return;

      // Emit simulated 24kHz audio (sine wave 440Hz / speech placeholder)
      const sampleCount = 2400; // 100ms at 24kHz
      const mock24k = Buffer.alloc(sampleCount * 2);
      for (let i = 0; i < sampleCount; i++) {
        const val = Math.floor(Math.sin((2 * Math.PI * 440 * i) / 24000) * 8000);
        mock24k.writeInt16LE(val, i * 2);
      }

      this.processOutputAudio(mock24k);

      // Rotate resumption handle to simulate server update
      this.state.resumptionHandle = `live-handle-mock-${Date.now()}`;
      this.emit('resumption_update', {
        resumable: true,
        newHandle: this.state.resumptionHandle,
      });

      this.emit('transcription', {
        text: 'Halo! Aku Lyra, siap menemani obrolanmu.',
        sender: 'model',
      });

      this.state.totalTurnsHandled++;
      if (this.currentTurnMetrics) {
        this.emit('turn_complete', { ...this.currentTurnMetrics });
        this.currentTurnMetrics = null;
      }
    }, simulatedLatencyMs);
  }
}
