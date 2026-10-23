/**
 * The page's security policy, in one place for every way the game is served: the Vite build
 * puts it in a meta tag and a `_headers` file (read by Cloudflare and Netlify), and the bridge
 * sends it as HTTP headers. Session text is untrusted. Even if a bug ever turned it into markup,
 * no script could run, and the page could not send anything anywhere except to a local bridge.
 *
 * Self-contained on purpose: vite.config.ts imports it before any workspace package is built.
 */

/** The only hosts a bridge can live on. The bridge binds to 127.0.0.1. */
export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const;

export function isLoopback(hostname: string): boolean {
  return (LOOPBACK_HOSTS as readonly string[]).includes(hostname);
}

const POLICY: Record<string, string> = {
  'default-src': "'none'",
  'script-src': "'self'",
  'style-src': "'self'",
  'font-src': "'self'",
  'img-src': "'self' data:",
  'connect-src': ["'self'", ...LOOPBACK_HOSTS.map((h) => `ws://${h}:*`)].join(' '),
  'base-uri': "'none'",
  'form-action': "'none'",
};

const serialize = (policy: Record<string, string>) =>
  Object.entries(policy)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');

/** For the meta tag. `frame-ancestors` only works as a header, so it is left out here. */
export const META_CSP = serialize(POLICY);

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': serialize({ ...POLICY, 'frame-ancestors': "'none'" }),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=()',
};

/** The `_headers` file format understood by Cloudflare (Pages and Workers) and Netlify. */
export function headersFile(): string {
  const lines = Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`);
  return `/*\n${lines.join('\n')}\n`;
}
