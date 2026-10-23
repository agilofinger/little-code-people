/**
 * The bridge's access key. Every client must present it, so neither other websites nor other
 * users of this computer can read your sessions. It lives in a file only you can read and stays
 * the same across restarts, so a browser that opened the link once stays connected.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import envPaths from 'env-paths';

const TOKEN_RE = /^[\w-]{32,}$/;

/** Where the bridge keeps its own state. Never inside ~/.claude, which it only reads. */
export function configDir(): string {
  return process.env.LCP_CONFIG_DIR ?? envPaths('little-code-people', { suffix: '' }).config;
}

export function loadToken(dir: string, rotate = false): string {
  const file = join(dir, 'token');
  if (!rotate) {
    try {
      const token = readFileSync(file, 'utf8').trim();
      if (TOKEN_RE.test(token)) {
        if ((statSync(file).mode & 0o077) !== 0) chmodSync(file, 0o600);
        return token;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString('base64url');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  // writeFileSync keeps the mode of a file that already exists
  chmodSync(file, 0o600);
  return token;
}

export function tokenMatches(given: string | null, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
