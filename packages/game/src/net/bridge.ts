/**
 * Connects to the local bridge over WebSocket, validates every event against the protocol,
 * and reconnects with backoff.
 *
 * Where the bridge is:
 * - Page served by the bridge itself (or the Vite dev server): same origin, /events.
 * - Hosted page: the bridge on this computer, but only once this browser was given the key
 *   through the link the bridge prints. Without it the page never knocks on your computer.
 */
import { CLOSE_UNAUTHORIZED, DEFAULT_PORT, EVENTS_PATH, readLink, ServerEvent } from '@lcp/protocol';
import { isLoopback } from '../../security.ts';

export type ConnectionState = 'connecting' | 'live' | 'offline' | 'locked';

export interface EventSink {
  event(e: ServerEvent): void;
  state(s: ConnectionState): void;
}

/** What this browser remembers about its bridge (localStorage). */
export interface StoredBridge {
  token: string;
  bridge?: string;
}

export interface BridgeTarget {
  url: string;
  token: string | null;
}

interface PageLocation {
  protocol: string;
  host: string;
  hostname: string;
  hash: string;
}

/** Only a bridge on this computer, at its events path, may receive the key. */
export function isLocalBridge(address: string): boolean {
  try {
    const url = new URL(address);
    return (
      url.protocol === 'ws:' &&
      isLoopback(url.hostname) &&
      url.pathname === EVENTS_PATH &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function resolveBridge(
  loc: PageLocation,
  stored: StoredBridge | null,
): { target: BridgeTarget | null; store: StoredBridge | null } {
  const link = readLink(loc.hash);
  const linkBridge = link.bridge && isLocalBridge(link.bridge) ? link.bridge : null;
  const store: StoredBridge | null = link.token
    ? { token: link.token, ...(linkBridge ? { bridge: linkBridge } : {}) }
    : stored;
  const token = store?.token ?? null;

  if (isLoopback(loc.hostname)) {
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return { target: { url: `${proto}//${loc.host}${EVENTS_PATH}`, token }, store };
  }
  if (!token) return { target: null, store };
  const url = store?.bridge ?? `ws://127.0.0.1:${DEFAULT_PORT}${EVENTS_PATH}`;
  return { target: { url, token }, store };
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: number | undefined;
  private stopped = false;

  constructor(
    private readonly target: BridgeTarget,
    private readonly sink: EventSink,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  private connect(): void {
    this.sink.state('connecting');
    const url = new URL(this.target.url);
    if (this.target.token) url.searchParams.set('token', this.target.token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
    };
    ws.onmessage = (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      const parsed = ServerEvent.safeParse(data);
      if (!parsed.success) {
        console.warn('[lcp] ignoring unknown event', parsed.error.issues[0]);
        return;
      }
      if (parsed.data.type === 'hello') this.sink.state('live');
      this.sink.event(parsed.data);
    };
    ws.onclose = (ev) => {
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === CLOSE_UNAUTHORIZED) {
        // Retrying cannot help: the user has to open the link with the right key.
        this.stopped = true;
        this.sink.state('locked');
        return;
      }
      this.sink.state('offline');
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = Math.min(15_000, 1000 * 2 ** this.retry);
    this.retry++;
    this.timer = window.setTimeout(() => this.connect(), delay);
  }
}
