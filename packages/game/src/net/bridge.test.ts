import { describe, expect, it } from 'vitest';
import { isLocalBridge, resolveBridge } from './bridge.ts';

const page = (href: string) => {
  const u = new URL(href);
  return { protocol: u.protocol, host: u.host, hostname: u.hostname, hash: u.hash };
};

describe('resolveBridge', () => {
  it('uses the same origin when the bridge serves the page', () => {
    const r = resolveBridge(page('http://127.0.0.1:6464/#token=k1'), null);
    expect(r.target).toEqual({ url: 'ws://127.0.0.1:6464/events', token: 'k1' });
    expect(r.store).toEqual({ token: 'k1' });
  });

  it('still connects locally without a key, so the bridge can say the key is missing', () => {
    expect(resolveBridge(page('http://localhost:5173/'), null).target).toEqual({
      url: 'ws://localhost:5173/events',
      token: null,
    });
  });

  it('keeps a hosted page away from this computer until it has a key', () => {
    expect(resolveBridge(page('https://lcp.example.com/'), null).target).toBeNull();
  });

  it('connects a hosted page to the local bridge with the key from the link', () => {
    const r = resolveBridge(page('https://lcp.example.com/#token=k2'), null);
    expect(r.target).toEqual({ url: 'ws://127.0.0.1:6464/events', token: 'k2' });
  });

  it('remembers the key and a custom port for later visits', () => {
    const first = resolveBridge(
      page('https://lcp.example.com/#token=k3&bridge=ws%3A%2F%2F127.0.0.1%3A7000%2Fevents'),
      null,
    );
    const later = resolveBridge(page('https://lcp.example.com/'), first.store);
    expect(later.target).toEqual({ url: 'ws://127.0.0.1:7000/events', token: 'k3' });
  });

  it('never sends the key to a bridge address that is not on this computer', () => {
    const r = resolveBridge(
      page('https://lcp.example.com/#token=k4&bridge=wss%3A%2F%2Fevil.example%2Fevents'),
      null,
    );
    expect(r.target?.url).toBe('ws://127.0.0.1:6464/events');
  });
});

describe('isLocalBridge', () => {
  it.each([
    ['ws://127.0.0.1:6464/events', true],
    ['ws://localhost:7000/events', true],
    ['wss://127.0.0.1:6464/events', false],
    ['ws://evil.example/events', false],
    ['ws://127.0.0.1.evil.example/events', false],
    ['ws://user:pw@127.0.0.1:6464/events', false],
    ['ws://127.0.0.1:6464/other', false],
    ['not a url', false],
  ])('%s → %s', (address, ok) => expect(isLocalBridge(address)).toBe(ok));
});
