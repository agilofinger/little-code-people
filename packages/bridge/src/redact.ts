/**
 * Masks secrets before any text leaves the bridge. Conservative: better to mask a harmless
 * string than to show a key on screen.
 */
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\b(?:sbp|sbs|sb_secret)_[A-Za-z0-9_-]{16,}/g, // Supabase
  /\blin_(?:api|oauth)_[A-Za-z0-9]{20,}/g, // Linear
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** KEY=value / "key": "value" where the key name looks secret. */
const KEY_VALUE =
  /\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)[A-Za-z0-9_]*)(["']?\s*[:=]\s*["']?)([^\s"',;]{4,})/gi;

const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g;

/** user:password@ in URLs */
const URL_CREDS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

export function redact(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, '[secret]');
  out = out.replace(KEY_VALUE, (_m, key: string, sep: string) => `${key}${sep}[secret]`);
  out = out.replace(BEARER, (_m, scheme: string) => `${scheme} [secret]`);
  out = out.replace(URL_CREDS, (_m, scheme: string) => `${scheme}[secret]@`);
  return out;
}
