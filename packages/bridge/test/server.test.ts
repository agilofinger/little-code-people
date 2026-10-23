import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOSE_UNAUTHORIZED, PROTOCOL_VERSION, type ServerEvent } from '@lcp/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { loadToken, tokenMatches } from '../src/auth.ts';
import { localOrigins, parseOrigin } from '../src/origins.ts';
import { type EventFeed, startServer } from '../src/server.ts';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
const HOSTED = 'https://lcp.example.com';

const feed: EventFeed = {
  hello: (): ServerEvent => ({ type: 'hello', version: PROTOCOL_VERSION, host: 'test', sessions: [] }),
  subscribe: () => () => {},
};

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

type Outcome = { hello: true } | { closed: number } | { rejected: number };

function connect(port: number, opts: { token?: string; origin?: string; host?: string }): Promise<Outcome> {
  const url = `ws://127.0.0.1:${port}/events${opts.token ? `?token=${opts.token}` : ''}`;
  const headers: Record<string, string> = {};
  if (opts.host) headers.host = opts.host;
  const ws = new WebSocket(url, { headers, ...(opts.origin ? { origin: opts.origin } : {}) });
  return new Promise((resolve) => {
    ws.on('message', (data) => {
      if (JSON.parse(String(data)).type === 'hello') resolve({ hello: true });
      ws.close();
    });
    ws.on('close', (code) => resolve({ closed: code }));
    ws.on('unexpected-response', (_req, res) => resolve({ rejected: res.statusCode ?? 0 }));
    ws.on('error', () => {});
  });
}

describe('bridge server', () => {
  let port: number;
  let close: () => void;
  let staticDir: string;

  beforeAll(async () => {
    port = await freePort();
    staticDir = mkdtempSync(join(tmpdir(), 'lcp-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>t</title>');
    const server = startServer(feed, {
      port,
      host: '127.0.0.1',
      staticDir,
      origins: [...localOrigins(port, false), HOSTED],
      token: TOKEN,
    });
    await new Promise((r) => server.once('listening', r));
    close = () => server.close();
  });
  afterAll(() => close());

  it('streams to the page it serves itself, with the key', async () => {
    expect(await connect(port, { token: TOKEN, origin: `http://127.0.0.1:${port}` })).toEqual({
      hello: true,
    });
  });

  it('streams to an allowed hosted page, with the key', async () => {
    expect(await connect(port, { token: TOKEN, origin: HOSTED })).toEqual({ hello: true });
  });

  it('closes with a clear code when the key is missing or wrong', async () => {
    expect(await connect(port, { origin: HOSTED })).toEqual({ closed: CLOSE_UNAUTHORIZED });
    expect(await connect(port, { token: 'wrong', origin: HOSTED })).toEqual({ closed: CLOSE_UNAUTHORIZED });
  });

  it('needs the key from clients without an origin too (other users of this computer)', async () => {
    expect(await connect(port, {})).toEqual({ closed: CLOSE_UNAUTHORIZED });
    expect(await connect(port, { token: TOKEN })).toEqual({ hello: true });
  });

  it('rejects other websites even when they have the key', async () => {
    expect(await connect(port, { token: TOKEN, origin: 'https://evil.example' })).toEqual({ rejected: 403 });
    expect(await connect(port, { token: TOKEN, origin: 'https://sub.lcp.example.com' })).toEqual({
      rejected: 403,
    });
  });

  it('rejects DNS rebinding (a foreign Host header)', async () => {
    expect(await connect(port, { token: TOKEN, host: `evil.example:${port}` })).toEqual({ rejected: 403 });
  });

  it('serves the game with the security headers', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('access key', () => {
  it('is created once, private to the user, and reused', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'lcp-cfg-')), 'nested');
    const first = loadToken(dir);
    expect(first).toMatch(/^[\w-]{32}$/);
    expect(statSync(join(dir, 'token')).mode & 0o777).toBe(0o600);
    expect(loadToken(dir)).toBe(first);
    expect(loadToken(dir, true)).not.toBe(first);
  });

  it('tightens a key file that others can read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lcp-cfg-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'token'), `${TOKEN}\n`, { mode: 0o644 });
    expect(loadToken(dir)).toBe(TOKEN);
    expect(statSync(join(dir, 'token')).mode & 0o777).toBe(0o600);
  });

  it('compares keys exactly', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches(null, TOKEN)).toBe(false);
  });
});

describe('allowed origins', () => {
  it('allows only the bridge itself by default, and the dev server with --dev', () => {
    expect(localOrigins(6464, false)).toEqual(['http://127.0.0.1:6464', 'http://localhost:6464']);
    expect(localOrigins(6464, true)).toContain('http://localhost:5173');
  });

  it('accepts exact https origins', () => {
    expect(parseOrigin('https://lcp.example.com')).toBe('https://lcp.example.com');
    expect(parseOrigin('https://lcp.example.com/')).toBe('https://lcp.example.com');
  });

  it.each([
    'https://*.pages.dev',
    'http://lcp.example.com',
    'https://lcp.example.com/house',
    'lcp.example.com',
    'file:///tmp/x',
  ])('refuses %s', (origin) => expect(() => parseOrigin(origin)).toThrow(/Cannot allow/));
});
