import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

export interface AudioMonitorCallbacks {
  onStart?: () => void;
  onBuffer: (buffer: Buffer) => void;
  onStop?: () => void;
}

/**
 * Monitors incoming audio streams from a specific user, buffering audio
 * and notifying callbacks on speech start and completion.
 */
export class AudioMonitor {
  private readable: Readable;
  private buffers: Buffer[] = [];
  private maxSize: number;
  private lastFlagged: number = -1;
  private ended: boolean = false;

  constructor(
    readable: Readable,
    callbacks: AudioMonitorCallbacks,
    maxSize: number = 10_000_000 // ~10MB max buffer (~100s at 48kHz 16-bit mono)
  ) {
    this.readable = readable;
    this.maxSize = maxSize;

    this.readable.on('data', (chunk: Buffer) => {
      if (this.lastFlagged < 0) {
        this.lastFlagged = this.buffers.length;
      }
      this.buffers.push(chunk);

      let currentSize = this.buffers.reduce((acc, cur) => acc + cur.length, 0);
      while (currentSize > this.maxSize) {
        const removed = this.buffers.shift();
        if (removed) currentSize -= removed.length;
        this.lastFlagged--;
      }
    });

    this.readable.on('end', () => {
      this.ended = true;
      if (this.lastFlagged < 0) return;
      const fullBuffer = this.getBufferFromStart();
      if (fullBuffer.length > 0) {
        callbacks.onBuffer(fullBuffer);
      }
      this.lastFlagged = -1;
    });

    this.readable.on('speakingStopped', () => {
      if (this.ended) return;
      callbacks.onStop?.();
      if (this.lastFlagged < 0) return;
      const fullBuffer = this.getBufferFromStart();
      if (fullBuffer.length > 0) {
        callbacks.onBuffer(fullBuffer);
      }
      this.reset();
    });

    this.readable.on('speakingStarted', () => {
      if (this.ended) return;
      callbacks.onStart?.();
      this.reset();
    });
  }

  public getBufferFromStart(): Buffer {
    return Buffer.concat(this.buffers);
  }

  public reset(): void {
    this.buffers = [];
    this.lastFlagged = -1;
  }

  public stop(): void {
    this.readable.removeAllListeners('data');
    this.readable.removeAllListeners('end');
    this.readable.removeAllListeners('speakingStopped');
    this.readable.removeAllListeners('speakingStarted');
  }
}
