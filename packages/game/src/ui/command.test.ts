import { describe, expect, it } from 'vitest';
import { parseCommand, willing } from './command.ts';

const names = ['PIXEL', 'PIXEL-JR', 'LCP'];

describe('parseCommand', () => {
  it('understands polite requests and finds the target', () => {
    expect(parseCommand('PLEASE PLAY PIANO, pixel-jr', names)).toEqual({
      command: { kind: 'go', spot: 'piano', what: 'PLAY THE PIANO' },
      target: 'PIXEL-JR',
      pleases: 1,
    });
  });

  it('greets', () => {
    expect(parseCommand('hello lcp', names).command).toEqual({ kind: 'hello' });
  });

  it('knows letters, help and who', () => {
    expect(parseCommand('please type me a letter', names).command.kind).toBe('letter');
    expect(parseCommand('help', names).command.kind).toBe('help');
    expect(parseCommand('who is home', names).command.kind).toBe('who');
  });
});

describe('willing (the manners rule)', () => {
  it('does it now with one please and a happy mood', () => expect(willing(1, true)).toBe('now'));
  it('does it later with one please', () => expect(willing(1, false)).toBe('later'));
  it('refuses without manners', () => expect(willing(0, false)).toBe('refuse'));
  it('two pleases always work', () => expect(willing(2, false)).toBe('now'));
});
