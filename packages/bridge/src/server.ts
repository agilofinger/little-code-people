/**
 * Local-only HTTP + WebSocket server. Serves the built game and streams session events on /events.
 *
 * Three locks, all required:
 * - Host header must be 127.0.0.1 or localhost (stops DNS rebinding).
 * - Origin, when a browser sends one, must be on the allow-list (stops other websites).
 * - The access key must match (stops everyone else, including other users of this computer).
 */
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { SECURITY_HEADERS } from '@lcp/game/security';
import { CLOSE_UNAUTHORIZED, EVENTS_PATH, type ServerEvent } from '@lcp/protocol';
import sirv from 'sirv';
import { WebSocketServer } from 'ws';
import { tokenMatches } from './auth.ts';

/** What the server streams. The Hub in production, a stub in tests. */
export interface EventFeed {
  hello(): ServerEvent;
  subscribe(fn: (e: ServerEvent) => void): () => void;
}

export interface ServerOptions {
  port: number;
  host: string;
  /** Directory of the built game, served at /. */
  staticDir: string | null;
  /** Exact browser origins allowed to connect. */
  origins: string[];
  token: string;
}

export function isAllowed(req: IncomingMessage, port: number, origins: ReadonlySet<string>): boolean {
  const host = req.headers.host ?? '';
  const hostOk = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  const origin = req.headers.origin;
  // Non-browser clients send no Origin. They still need the key.
  const originOk = origin === undefined || origins.has(origin);
  return hostOk && originOk;
}

export function startServer(feed: EventFeed, opts: ServerOptions): Server {
  const origins = new Set(opts.origins);
  const serveStatic =
    opts.staticDir && existsSync(opts.staticDir)
      ? sirv(opts.staticDir, {
          single: true,
          etag: true,
          setHeaders: (res) => {
            for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
          },
        })
      : null;

  const server = createServer((req, res) => {
    if (!isAllowed(req, opts.port, origins)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (serveStatic) {
      serveStatic(req, res);
      return;
    }
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end('Bridge is running. The game is not built yet: run `npm run build` or use `npm run dev`.');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://bridge');
    if (url.pathname !== EVENTS_PATH || !isAllowed(req, opts.port, origins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // An allowed page with a wrong key gets a clear close code (and nothing else), so it can
      // tell the user to open the link the bridge printed.
      if (!tokenMatches(url.searchParams.get('token'), opts.token)) {
        ws.close(CLOSE_UNAUTHORIZED, 'missing or wrong key');
        return;
      }
      ws.send(JSON.stringify(feed.hello()));
      const unsubscribe = feed.subscribe((event) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
      });
      ws.on('close', unsubscribe);
      ws.on('error', unsubscribe);
      // The bridge is read-only: incoming messages are ignored.
    });
  });

  server.listen(opts.port, opts.host);
  return server;
}
