import { describe, expect, it } from 'vitest';
import { pageLink, readLink } from './link.ts';

describe('page links', () => {
  it('puts the key in the fragment, never in the path or query', () => {
    const link = new URL(pageLink('https://lcp.example.com/', 'abc_DEF-123'));
    expect(link.search).toBe('');
    expect(link.hash).toBe('#token=abc_DEF-123');
  });

  it('round-trips the key and the bridge address', () => {
    const link = pageLink('https://lcp.example.com/', 'k', 'ws://127.0.0.1:7000/events');
    expect(readLink(new URL(link).hash)).toEqual({ token: 'k', bridge: 'ws://127.0.0.1:7000/events' });
  });

  it('reads an empty fragment as nothing', () => {
    expect(readLink('')).toEqual({ token: null, bridge: null });
    expect(readLink('#token=')).toEqual({ token: null, bridge: null });
  });
});
