/**
 * HTTP / HTTPS Keep-Alive & Connection Pooling Configuration
 * Implements PRD §5 & TDD §16:
 * Configures global Undici / Node.js agent to reuse TCP/TLS sockets for Gemini API and TTS,
 * eliminating the 150-300ms TLS handshake overhead on every conversational turn.
 */

import { setGlobalDispatcher, Agent } from 'undici';

let isHttpPoolConfigured = false;
let globalAgent: Agent | null = null;

export interface HttpPoolOptions {
  /** Maximum keep-alive idle time in ms (default: 60,000ms / 60s) */
  keepAliveTimeout?: number;
  /** Maximum concurrent sockets per host origin (default: 64) */
  maxSockets?: number;
  /** Keep-alive max free sockets (default: 16) */
  maxFreeSockets?: number;
}

/**
 * Initializes and installs the global HTTP connection pool for the entire process.
 */
export function setupHttpKeepAlivePool(options: HttpPoolOptions = {}): Agent {
  if (isHttpPoolConfigured && globalAgent) {
    return globalAgent;
  }

  const keepAliveTimeout = options.keepAliveTimeout ?? 60_000;
  const maxSockets = options.maxSockets ?? 64;

  globalAgent = new Agent({
    keepAliveTimeout,
    keepAliveMaxTimeout: 120_000,
    connections: maxSockets,
    pipelining: 1,
  });

  try {
    setGlobalDispatcher(globalAgent);
    isHttpPoolConfigured = true;
    console.log(
      `[HttpKeepAlive] Global Undici pool configured (keepAliveTimeout: ${keepAliveTimeout}ms, maxConnections: ${maxSockets}).`
    );
  } catch (err: any) {
    console.warn(`[HttpKeepAlive] Warning: Failed to set global dispatcher: ${err.message}`);
  }

  return globalAgent;
}

export function isKeepAliveActive(): boolean {
  return isHttpPoolConfigured;
}
