import { describe, expect, it } from 'vitest';
import { plain } from './plain.ts';

describe('plain', () => {
  it('removes markdown emphasis, code and links', () => {
    expect(plain('**Rate** = `a / b`, see [docs](https://x.y)')).toBe('Rate = a / b, see docs');
  });
  it('drops headings and replaces code blocks', () => {
    expect(plain('# Title\ndone')).toBe('Title\ndone');
    expect(plain('see ```ts\nconst a = 1\n``` here')).toBe('see [code] here');
  });
});
