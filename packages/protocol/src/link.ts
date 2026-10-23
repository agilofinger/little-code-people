/**
 * How the bridge hands its address and access key to a page: in the link's fragment
 * (`#token=…&bridge=…`), which browsers never send to any server, so the key never shows up in
 * a host's logs. The page stores both and removes the fragment from the address bar.
 */

export const DEFAULT_PORT = 6464;
export const EVENTS_PATH = '/events';
/** WebSocket close code the bridge sends when the key is missing or wrong. */
export const CLOSE_UNAUTHORIZED = 4401;

export interface LinkParams {
  token: string | null;
  /** WebSocket address of the bridge, only needed by hosted pages on a non-default port. */
  bridge: string | null;
}

export function pageLink(page: string, token: string, bridge?: string): string {
  const params = new URLSearchParams({ token });
  if (bridge) params.set('bridge', bridge);
  const url = new URL(page);
  url.hash = params.toString();
  return url.toString();
}

export function readLink(hash: string): LinkParams {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return { token: params.get('token') || null, bridge: params.get('bridge') || null };
}
