/**
 * Turn Manager & Barge-in Orchestrator
 * Implements PRD FR-V6, T1.5, and TC-05:
 * - Detects user speech while bot is speaking or generating.
 * - Stops audio playback within <= 300 ms.
 * - Cancels in-flight LLM streaming and TTS synthesis using AbortController.
 * - Purges the audio playback queue to prevent stale audio.
 */

import { VoicePlayer } from './voice-player.js';

export interface ActiveTurn {
  turnId: string;
  guildId: string;
  controller: AbortController;
  startedAt: number;
}

export interface BargeInResult {
  interrupted: boolean;
  turnId?: string;
  userId?: string;
  stopDurationMs: number;
  purgedQueueCount: number;
}

export class TurnManager {
  private activeTurns: Map<string, ActiveTurn> = new Map();

  /**
   * Starts a new turn for a guild, aborting any existing active turn.
   */
  public startTurn(guildId: string): { turnId: string; signal: AbortSignal } {
    this.abortTurn(guildId, 'new_turn_started');

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const controller = new AbortController();

    this.activeTurns.set(guildId, {
      turnId,
      guildId,
      controller,
      startedAt: Date.now(),
    });

    return { turnId, signal: controller.signal };
  }

  /**
   * Checks if an active turn is currently running for the guild.
   */
  public isTurnActive(guildId: string): boolean {
    const turn = this.activeTurns.get(guildId);
    return !!turn && !turn.controller.signal.aborted;
  }

  /**
   * Marks a turn as finished if it matches the current active turn.
   */
  public finishTurn(guildId: string, turnId: string) {
    const current = this.activeTurns.get(guildId);
    if (current && current.turnId === turnId) {
      this.activeTurns.delete(guildId);
    }
  }

  /**
   * Aborts an active turn.
   */
  public abortTurn(guildId: string, reason = 'barge_in'): boolean {
    const current = this.activeTurns.get(guildId);
    if (current && !current.controller.signal.aborted) {
      current.controller.abort(reason);
      this.activeTurns.delete(guildId);
      return true;
    }
    return false;
  }

  /**
   * Handles Barge-in interruption:
   * Stops playback, purges audio queue, and aborts generation.
   * Returns latency in milliseconds (must be <= 300ms for TC-05).
   */
  public handleBargeIn(
    guildId: string,
    userId: string,
    player?: VoicePlayer
  ): BargeInResult {
    const start = Date.now();
    const currentTurn = this.activeTurns.get(guildId);
    const isPlayerPlaying = player?.isPlaying() ?? false;
    const isTurnActive = this.isTurnActive(guildId);

    if (!isPlayerPlaying && !isTurnActive) {
      return {
        interrupted: false,
        stopDurationMs: 0,
        purgedQueueCount: 0,
      };
    }

    let purgedCount = 0;
    if (player) {
      purgedCount = player.clearQueue();
      player.stop();
    }

    let turnId: string | undefined;
    if (currentTurn) {
      turnId = currentTurn.turnId;
      currentTurn.controller.abort('barge_in');
      this.activeTurns.delete(guildId);
    }

    const stopDurationMs = Date.now() - start;

    return {
      interrupted: true,
      turnId,
      userId,
      stopDurationMs,
      purgedQueueCount: purgedCount,
    };
  }
}
