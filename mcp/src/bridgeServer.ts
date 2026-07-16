import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  isBridgeMessage,
  PROTOCOL_VERSION,
  type BridgeHelloMessage,
  type BridgeRequestMessage,
  type BridgeResponseMessage
} from './protocol.js';

const REQUEST_TIMEOUT_MS = 30_000;
const SESSION_TTL_MS = 60_000;
const DEFAULT_POLL_WAIT_MS = 20_000;

export interface BridgeServerOptions {
  port: number;
  token: string;
  host?: string;
}

interface PendingCall {
  resolve: (value: BridgeResponseMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PollWaiter {
  resolve: (request: BridgeRequestMessage | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ExtensionSession {
  id: string;
  hello: BridgeHelloMessage | null;
  lastSeen: number;
}

export class BridgeServer {
  private server: Server | null = null;
  private session: ExtensionSession | null = null;
  private readonly pendingCalls = new Map<string, PendingCall>();
  private readonly requestQueue: BridgeRequestMessage[] = [];
  private readonly pollWaiters: PollWaiter[] = [];
  private readonly port: number;
  private readonly token: string;
  private readonly host: string;

  constructor(options: BridgeServerOptions) {
    this.port = options.port;
    this.token = options.token;
    this.host = options.host ?? '127.0.0.1';
  }

  get isExtensionConnected(): boolean {
    if (!this.session) return false;
    return Date.now() - this.session.lastSeen < SESSION_TTL_MS;
  }

  get extensionHello(): BridgeHelloMessage | null {
    return this.session?.hello ?? null;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handleHttp(req, res);
      });
      this.server = server;

      server.once('listening', () => resolve());
      server.once('error', (error) => reject(error));
      server.listen(this.port, this.host);
    });
  }

  async stop(): Promise<void> {
    this.failAllPending(new Error('Bridge server stopped'));
    while (this.pollWaiters.length > 0) {
      const waiter = this.pollWaiters.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.session = null;
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  call(method: string, params?: unknown): Promise<unknown> {
    if (!this.isExtensionConnected) {
      return Promise.reject(
        Object.assign(new Error('Extension bridge is offline'), { code: 'BRIDGE_OFFLINE' })
      );
    }

    const id = randomBytes(8).toString('hex');
    const request: BridgeRequestMessage = {
      type: 'request',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(
          Object.assign(new Error(`Bridge request timed out: ${method}`), { code: 'TIMEOUT' })
        );
      }, REQUEST_TIMEOUT_MS);

      this.pendingCalls.set(id, {
        resolve: (response) => {
          if (response.ok) {
            resolve(response.result);
          } else {
            reject(
              Object.assign(new Error(response.error?.message || 'Operation failed'), {
                code: response.error?.code || 'INTERNAL',
                details: response.error?.details
              })
            );
          }
        },
        reject,
        timer
      });

      this.enqueueRequest(request);
    });
  }

  private enqueueRequest(request: BridgeRequestMessage): void {
    const waiter = this.pollWaiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(request);
      return;
    }
    this.requestQueue.push(request);
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingCalls.delete(id);
    }
    this.requestQueue.length = 0;
  }

  private authorize(req: IncomingMessage, url: URL): boolean {
    const header = req.headers.authorization;
    const bearer =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : '';
    const queryToken = url.searchParams.get('token') ?? '';
    const token = bearer || queryToken;
    return Boolean(token && token === this.token);
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      // Firefox extension pages may treat this as CORS if ever needed
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end(payload);
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const host = req.headers.host ?? `${this.host}:${this.port}`;
      const url = new URL(req.url ?? '/', `http://${host}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        this.sendJson(res, 200, {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          extensionConnected: this.isExtensionConnected
        });
        return;
      }

      if (!this.authorize(req, url)) {
        this.sendJson(res, 401, { code: 'UNAUTHORIZED', message: 'Invalid or missing token' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/hello') {
        const raw = await this.readBody(req);
        let body: unknown = {};
        if (raw.trim()) {
          try {
            body = JSON.parse(raw);
          } catch {
            this.sendJson(res, 400, { code: 'VALIDATION', message: 'Invalid JSON body' });
            return;
          }
        }

        const extensionVersion =
          body && typeof body === 'object' && typeof (body as { extensionVersion?: unknown }).extensionVersion === 'string'
            ? (body as { extensionVersion: string }).extensionVersion
            : 'unknown';
        const protocolVersion =
          body && typeof body === 'object' && typeof (body as { protocolVersion?: unknown }).protocolVersion === 'number'
            ? (body as { protocolVersion: number }).protocolVersion
            : PROTOCOL_VERSION;

        if (protocolVersion !== PROTOCOL_VERSION) {
          this.sendJson(res, 400, {
            code: 'PROTOCOL',
            message: `Incompatible protocolVersion (expected ${PROTOCOL_VERSION})`
          });
          return;
        }

        // Replace previous session
        if (this.session) {
          this.failAllPending(new Error('Extension session replaced'));
        }

        const sessionId = randomBytes(12).toString('hex');
        this.session = {
          id: sessionId,
          hello: {
            type: 'hello',
            extensionVersion,
            protocolVersion
          },
          lastSeen: Date.now()
        };

        this.sendJson(res, 200, {
          ok: true,
          sessionId,
          protocolVersion: PROTOCOL_VERSION
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/poll') {
        const sessionId = url.searchParams.get('sessionId') ?? '';
        if (!this.session || this.session.id !== sessionId) {
          this.sendJson(res, 401, { code: 'NO_SESSION', message: 'Unknown or expired session' });
          return;
        }
        this.session.lastSeen = Date.now();

        const waitRaw = Number(url.searchParams.get('waitMs') ?? DEFAULT_POLL_WAIT_MS);
        const waitMs = Number.isFinite(waitRaw)
          ? Math.max(0, Math.min(25_000, Math.floor(waitRaw)))
          : DEFAULT_POLL_WAIT_MS;

        const queued = this.requestQueue.shift();
        if (queued) {
          this.sendJson(res, 200, queued);
          return;
        }

        const request = await new Promise<BridgeRequestMessage | null>((resolve) => {
          const timer = setTimeout(() => {
            const idx = this.pollWaiters.findIndex((w) => w.resolve === resolve);
            if (idx >= 0) this.pollWaiters.splice(idx, 1);
            resolve(null);
          }, waitMs);
          this.pollWaiters.push({ resolve, timer });
        });

        // session may have been replaced while waiting
        if (!this.session || this.session.id !== sessionId) {
          this.sendJson(res, 401, { code: 'NO_SESSION', message: 'Session ended' });
          return;
        }
        this.session.lastSeen = Date.now();

        if (!request) {
          this.sendJson(res, 200, { type: 'idle' });
          return;
        }
        this.sendJson(res, 200, request);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/response') {
        const sessionId = url.searchParams.get('sessionId') ?? '';
        if (!this.session || this.session.id !== sessionId) {
          this.sendJson(res, 401, { code: 'NO_SESSION', message: 'Unknown or expired session' });
          return;
        }
        this.session.lastSeen = Date.now();

        const raw = await this.readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.sendJson(res, 400, { code: 'VALIDATION', message: 'Invalid JSON body' });
          return;
        }
        if (!isBridgeMessage(parsed) || parsed.type !== 'response') {
          this.sendJson(res, 400, { code: 'VALIDATION', message: 'Expected response message' });
          return;
        }

        const pending = this.pendingCalls.get(parsed.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCalls.delete(parsed.id);
          pending.resolve(parsed);
        }

        this.sendJson(res, 200, { ok: true });
        return;
      }

      this.sendJson(res, 404, { code: 'NOT_FOUND', message: 'Unknown path' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendJson(res, 500, { code: 'INTERNAL', message });
    }
  }
}

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}
