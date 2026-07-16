import type { OpErrorPayload } from './errors';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_MCP_PORT = 17321;

export type BridgeMessageType = 'hello' | 'request' | 'response' | 'ping' | 'pong';

export interface BridgeHelloMessage {
  type: 'hello';
  extensionVersion: string;
  protocolVersion: number;
}

export interface BridgeRequestMessage {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
}

export interface BridgeResponseMessage {
  type: 'response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: OpErrorPayload;
}

export interface BridgePingMessage {
  type: 'ping';
  t: number;
}

export interface BridgePongMessage {
  type: 'pong';
  t: number;
}

export type BridgeMessage =
  | BridgeHelloMessage
  | BridgeRequestMessage
  | BridgeResponseMessage
  | BridgePingMessage
  | BridgePongMessage;

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'hello' ||
    type === 'request' ||
    type === 'response' ||
    type === 'ping' ||
    type === 'pong'
  );
}

/** @deprecated Prefer HTTP long-poll bridge (`http://127.0.0.1:<port>/v1/*`). */
export function buildWsUrl(port: number, token: string): string {
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_MCP_PORT;
  const encoded = encodeURIComponent(token);
  return `ws://127.0.0.1:${safePort}/?token=${encoded}`;
}

export function buildHttpBaseUrl(port: number): string {
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_MCP_PORT;
  return `http://127.0.0.1:${safePort}`;
}
