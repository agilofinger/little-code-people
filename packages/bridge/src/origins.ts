/**
 * Which web pages may talk to the bridge. By default only the copy the bridge serves itself.
 * Hosted copies must be named exactly: https, no path, no wildcards.
 */
import { isLoopback, LOOPBACK_HOSTS } from '@lcp/game/security';

/** Port of the Vite dev server, which proxies /events to the bridge. */
const DEV_PORT = 5173;

export function localOrigins(port: number, dev: boolean): string[] {
  const ports = dev ? [port, DEV_PORT] : [port];
  return LOOPBACK_HOSTS.flatMap((h) => ports.map((p) => `http://${h}:${p}`));
}

export function parseOrigin(input: string): string {
  const fail = (why: string) =>
    new Error(`Cannot allow "${input}": ${why}. Write the exact address, e.g. https://lcp.example.com`);
  if (input.includes('*')) throw fail('wildcards are not allowed');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw fail('not a web address');
  }
  if (url.origin === 'null' || url.origin !== input.replace(/\/$/, ''))
    throw fail('only scheme and host, no path');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw fail('hosted pages must use https');
  }
  return url.origin;
}
