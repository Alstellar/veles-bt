import { dispatchSafe } from '../operations/dispatch';
import { clearMcpKeepaliveAlarms, startMcpKeepaliveAlarms } from './mcpKeepalive';
import { PROTOCOL_VERSION, type BridgeRequestMessage, type BridgeResponseMessage } from './protocol';
import { getMcpSettings, setMcpStatus, type McpSettings } from './mcpSettings';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
/** Keep under Firefox event-page idle (~30s) so poll churn also counts as activity */
const POLL_WAIT_MS = 15000;

function getExtensionVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function baseUrl(port: number): string {
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : 17321;
  return `http://127.0.0.1:${safePort}`;
}

class McpBridgeClientImpl {
  private desired = false;
  private running = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSettings: McpSettings | null = null;
  private loopGeneration = 0;

  async syncFromStorage(): Promise<void> {
    const settings = await getMcpSettings();
    this.currentSettings = settings;
    if (settings.enabled && settings.token.trim()) {
      this.desired = true;
      // Survive Firefox/Chrome background teardown (alarms re-wake the event page)
      void startMcpKeepaliveAlarms();
      this.startLoop();
    } else {
      this.desired = false;
      void clearMcpKeepaliveAlarms();
      this.stopLoop('disabled_or_missing_token');
      await setMcpStatus({
        connected: false,
        lastError: settings.enabled ? 'Token is required' : null,
        extensionVersion: getExtensionVersion()
      });
    }
  }

  /**
   * Called when an alarm wakes a cold event page, or after SW sleep.
   * In-memory flags are gone after terminate — treat as fresh start.
   */
  async ensureRunning(): Promise<void> {
    if (this.running && this.desired) {
      return;
    }
    await this.syncFromStorage();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.desired) return;
    this.clearReconnectTimer();
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt)
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.startLoop();
    }, delay);
  }

  private stopLoop(reason?: string): void {
    this.clearReconnectTimer();
    this.running = false;
    this.loopGeneration += 1;
    void setMcpStatus({
      connected: false,
      lastDisconnectedAt: Date.now(),
      lastError: reason ?? null,
      extensionVersion: getExtensionVersion()
    });
  }

  private authHeaders(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  private async hello(port: number, token: string): Promise<string> {
    const res = await fetch(`${baseUrl(port)}/v1/hello`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify({
        extensionVersion: getExtensionVersion(),
        protocolVersion: PROTOCOL_VERSION
      })
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sessionId?: string;
      message?: string;
      code?: string;
    };
    if (!res.ok || !data.sessionId) {
      const msg = data.message || `Hello failed (HTTP ${res.status})`;
      throw new Error(data.code ? `${data.code}: ${msg}` : msg);
    }
    return data.sessionId;
  }

  private async poll(
    port: number,
    token: string,
    sessionId: string
  ): Promise<BridgeRequestMessage | { type: 'idle' }> {
    const url = `${baseUrl(port)}/v1/poll?sessionId=${encodeURIComponent(sessionId)}&waitMs=${POLL_WAIT_MS}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = (await res.json().catch(() => ({}))) as BridgeRequestMessage | {
      type?: string;
      message?: string;
      code?: string;
    };
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'message' in data && data.message
          ? String(data.message)
          : `Poll failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    if (data && typeof data === 'object' && (data as { type?: string }).type === 'request') {
      return data as BridgeRequestMessage;
    }
    return { type: 'idle' };
  }

  private async reply(
    port: number,
    token: string,
    sessionId: string,
    response: BridgeResponseMessage
  ): Promise<void> {
    const url = `${baseUrl(port)}/v1/response?sessionId=${encodeURIComponent(sessionId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(response)
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message || `Response failed (HTTP ${res.status})`);
    }
  }

  private async handleRequest(
    port: number,
    token: string,
    sessionId: string,
    message: BridgeRequestMessage
  ): Promise<void> {
    const outcome = await dispatchSafe(message.method, message.params);
    const response: BridgeResponseMessage = outcome.ok
      ? { type: 'response', id: message.id, ok: true, result: outcome.result }
      : { type: 'response', id: message.id, ok: false, error: outcome.error };
    await this.reply(port, token, sessionId, response);
  }

  private startLoop(): void {
    if (!this.desired || this.running) return;
    const settings = this.currentSettings;
    if (!settings || !settings.token.trim()) return;

    this.running = true;
    this.clearReconnectTimer();
    const generation = ++this.loopGeneration;
    const port = settings.port;
    const token = settings.token.trim();

    void (async () => {
      try {
        // Quick health check so errors are clear when companion is down
        const health = await fetch(`${baseUrl(port)}/health`, { method: 'GET' }).catch(() => null);
        if (!health || !health.ok) {
          throw new Error('Companion not reachable on http://127.0.0.1 (is it running?)');
        }

        const sessionId = await this.hello(port, token);
        if (generation !== this.loopGeneration || !this.desired) return;

        this.reconnectAttempt = 0;
        await setMcpStatus({
          connected: true,
          lastError: null,
          lastConnectedAt: Date.now(),
          extensionVersion: getExtensionVersion()
        });

        while (this.desired && generation === this.loopGeneration) {
          const msg = await this.poll(port, token, sessionId);
          if (generation !== this.loopGeneration || !this.desired) return;

          if (msg && 'type' in msg && msg.type === 'request') {
            await this.handleRequest(port, token, sessionId, msg as BridgeRequestMessage);
          }
          // idle → loop again immediately for next long-poll
        }
      } catch (error) {
        if (generation !== this.loopGeneration) return;
        const message = error instanceof Error ? error.message : String(error);
        this.running = false;
        await setMcpStatus({
          connected: false,
          lastDisconnectedAt: Date.now(),
          lastError: message,
          extensionVersion: getExtensionVersion()
        });
        if (this.desired) {
          this.scheduleReconnect();
        }
        return;
      }

      this.running = false;
      if (this.desired && generation === this.loopGeneration) {
        this.scheduleReconnect();
      }
    })();
  }
}

export const McpBridgeClient = new McpBridgeClientImpl();
