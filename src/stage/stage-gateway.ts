/**
 * Stage WebSocket Gateway & OBS Overlay Server (Task T6.1, FR-X1)
 * Bridges the Discord Voice Bot pipeline with OBS Studio Browser Source:
 * - Broadcasts real-time avatar state: speaking_start, speaking_end, lip_sync, emotion_change
 * - Serves the transparent stage client HTML for OBS Studio (/stage)
 * - Guarantees visual SLAs:
 *   - Mouth opening reaction < 150 ms from speech onset
 *   - Emotion change transition < 300 ms from tag detection
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { mapEmotionToVrm, VrmExpression, EmotionMappingResult } from './emotion-mapper.js';

export interface StageGatewayOptions {
  port?: number;
  server?: http.Server;
  clientHtmlPath?: string;
}

export interface StageEventPayload {
  type: 'speaking_start' | 'speaking_end' | 'lip_sync' | 'emotion_change';
  timestamp: number;
  [key: string]: unknown;
}

export class StageGateway {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private clientHtmlPath: string;
  private httpServer: http.Server | null = null;
  private ownsHttpServer = false;
  private port: number;

  constructor(options: StageGatewayOptions = {}) {
    this.port = options.port || 8081;
    this.clientHtmlPath = options.clientHtmlPath || path.join(process.cwd(), 'src', 'stage', 'stage-client.html');

    if (options.server) {
      this.attachToServer(options.server);
    }
  }

  /**
   * Attaches WebSocket server to an existing Node.js http.Server.
   */
  public attachToServer(server: http.Server): void {
    this.httpServer = server;
    this.ownsHttpServer = false;

    this.wss = new WebSocketServer({
      noServer: true,
    });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/stage/ws') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  /**
   * Starts a standalone HTTP & WebSocket server for OBS Stage.
   */
  public async startStandalone(port?: number): Promise<number> {
    const targetPort = port || this.port;

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (url.pathname === '/stage' || url.pathname === '/stage/') {
          this.serveStageHtml(res);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      this.attachToServer(server);
      this.ownsHttpServer = true;

      server.listen(targetPort, () => {
        const addr = server.address() as any;
        this.port = addr?.port || targetPort;
        console.log(`[StageGateway] Standalone OBS Stage server listening at http://localhost:${this.port}/stage`);
        resolve(this.port);
      });

      server.on('error', reject);
    });
  }

  /**
   * Serves the transparent stage client HTML file.
   */
  public serveStageHtml(res: http.ServerResponse): void {
    try {
      if (fs.existsSync(this.clientHtmlPath)) {
        const html = fs.readFileSync(this.clientHtmlPath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(html);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Stage HTML template not found.');
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error loading stage: ${err.message}`);
    }
  }

  /**
   * Broadcasts speech onset to avatar stage with initial emotion (SLA < 150ms).
   */
  public broadcastSpeakingStart(text?: string, rawEmotion?: string): EmotionMappingResult {
    const emotionResult = mapEmotionToVrm(rawEmotion);

    this.broadcast({
      type: 'speaking_start',
      timestamp: Date.now(),
      text,
      emotion: emotionResult.vrmExpression,
      transitionDurationMs: emotionResult.transitionDurationMs,
    });

    return emotionResult;
  }

  /**
   * Broadcasts speech completion.
   */
  public broadcastSpeakingEnd(): void {
    this.broadcast({
      type: 'speaking_end',
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcasts lip-sync mouth opening frame (SLA < 150ms).
   */
  public broadcastLipSync(viseme: 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'sil', value: number): void {
    this.broadcast({
      type: 'lip_sync',
      timestamp: Date.now(),
      viseme,
      value: Math.round(value * 100) / 100,
    });
  }

  /**
   * Broadcasts emotion change event (SLA < 300ms).
   */
  public broadcastEmotion(rawEmotion: string): EmotionMappingResult {
    const emotionResult = mapEmotionToVrm(rawEmotion);

    this.broadcast({
      type: 'emotion_change',
      timestamp: Date.now(),
      emotion: emotionResult.vrmExpression,
      transitionDurationMs: emotionResult.transitionDurationMs,
    });

    return emotionResult;
  }

  /**
   * Sends JSON payload to all connected OBS Studio / Browser clients.
   */
  public broadcast(payload: StageEventPayload): void {
    const serialized = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  /**
   * Returns count of currently connected OBS clients.
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shuts down the gateway and disconnects clients.
   */
  public async close(): Promise<void> {
    for (const client of this.clients) {
      client.terminate();
    }
    this.clients.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
      this.wss = null;
    }

    if (this.ownsHttpServer && this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
      this.httpServer = null;
    }
  }
}
