import http from 'node:http';
import { AddressInfo } from 'node:net';

export interface HealthStatusProvider {
  isReady?: () => boolean;
  getPing?: () => number;
  isBotEnabled?: () => boolean;
  getUptime?: () => number;
  getCustomMetrics?: () => Record<string, unknown>;
}

export interface HealthServerOptions {
  port?: number;
  host?: string;
  statusProvider?: HealthStatusProvider;
}

export class HealthServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private statusProvider: HealthStatusProvider;
  private isListening = false;

  constructor(options: HealthServerOptions = {}) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '0.0.0.0';
    this.statusProvider = options.statusProvider ?? {};
  }

  /**
   * Starts the internal HTTP healthcheck server.
   */
  public async start(): Promise<number> {
    if (this.isListening && this.server) {
      const addr = this.server.address() as AddressInfo;
      return addr?.port ?? this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        console.error('[HealthServer] HTTP Server error:', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        this.isListening = true;
        const addr = this.server?.address() as AddressInfo;
        const assignedPort = addr?.port ?? this.port;
        this.port = assignedPort;
        console.log(`[HealthServer] Healthcheck endpoint listening at http://${this.host}:${assignedPort}/healthz`);
        resolve(assignedPort);
      });
    });
  }

  /**
   * Stops the HTTP healthcheck server gracefully.
   */
  public async stop(): Promise<void> {
    if (!this.server || !this.isListening) {
      return;
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.isListening = false;
        this.server = null;
        console.log('[HealthServer] Healthcheck server stopped.');
        resolve();
      });
    });
  }

  /**
   * Returns current port.
   */
  public getPort(): number {
    return this.port;
  }

  /**
   * Check if server is running.
   */
  public isRunning(): boolean {
    return this.isListening;
  }

  /**
   * Internal request handler conforming strictly to SEC-11 and SEC-12.
   * Only `/healthz` is permitted; all other routes return 404 Not Found.
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

    // SEC-12: HTTP endpoint strictly limited to /healthz
    if (url.pathname === '/healthz' && req.method === 'GET') {
      this.serveHealthz(res);
      return;
    }

    // All other endpoints rejected with 404 (No sensitive data or administrative routes over HTTP)
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', path: url.pathname }));
  }

  /**
   * Serves the /healthz JSON response without leaking secrets (SEC-12).
   */
  private serveHealthz(res: http.ServerResponse): void {
    const mem = process.memoryUsage();
    const isBotEnabled = this.statusProvider.isBotEnabled ? this.statusProvider.isBotEnabled() : true;
    const isReady = this.statusProvider.isReady ? this.statusProvider.isReady() : true;
    const ping = this.statusProvider.getPing ? this.statusProvider.getPing() : 0;
    const uptime = this.statusProvider.getUptime ? this.statusProvider.getUptime() : process.uptime();

    const statusCode = isReady && isBotEnabled ? 200 : 503;

    const payload = {
      status: isReady && isBotEnabled ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(uptime),
      botEnabled: isBotEnabled,
      discord: {
        ready: isReady,
        pingMs: Math.round(ping),
      },
      system: {
        nodeVersion: process.version,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      ...(this.statusProvider.getCustomMetrics ? this.statusProvider.getCustomMetrics() : {}),
    };

    const responseBody = JSON.stringify(payload, null, 2);

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Length': Buffer.byteLength(responseBody),
    });
    res.end(responseBody);
  }
}
