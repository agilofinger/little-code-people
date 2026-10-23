/**
 * The command line: type polite requests like PLEASE PLAY PIANO or
 * HELLO PIXEL. Politeness and mood decide whether the little person does it.
 * Requests only affect the little people, never the real sessions.
 */
import type { SpotId } from '../world/layout.ts';

export type Command =
  | { kind: 'hello' }
  | { kind: 'pat' }
  | { kind: 'go'; spot: SpotId; what: string }
  | { kind: 'letter' }
  | { kind: 'who' }
  | { kind: 'help' }
  | { kind: 'mail' }
  | { kind: 'unknown' };

export interface Parsed {
  command: Command;
  target: string | null;
  pleases: number;
}

const GO: [RegExp, SpotId, string][] = [
  [/\b(piano|organ|sonata|serenade)\b/, 'piano', 'PLAY THE PIANO'],
  [/\b(dance|record|music|stereo|turntable|disco)\b/, 'dance1', 'DANCE'],
  [/\b(tv|television|telly)\b/, 'tv1', 'WATCH TV'],
  [/\b(fire|fireplace)\b/, 'fire', 'LIGHT THE FIRE'],
  [/\b(bed|sleep|nap)\b/, 'bunkLow', 'GO TO BED'],
  [/\b(computer|code|c64)\b/, 'comp1', 'PLAY ON THE COMPUTER'],
  [/\b(cards?|poker|game)\b/, 'cardsL', 'PLAY CARDS'],
  [/\b(exercise|workout|gym|sport)\b/, 'gym', 'EXERCISE'],
  [/\b(shower|wash yourself|bath)\b/, 'shower', 'TAKE A SHOWER'],
  [/\b(brush|teeth)\b/, 'basin', 'BRUSH TEETH'],
  [/\b(drink|water|thirsty)\b/, 'cooler', 'DRINK WATER'],
  [/\b(cook|eat|food|hungry|dinner|lunch)\b/, 'stove', 'COOK'],
  [/\b(read|book|newspaper|paper)\b/, 'armchair', 'READ'],
  [/\b(clothes|dress|closet)\b/, 'closet', 'CHANGE CLOTHES'],
  [/\b(phone|call)\b/, 'phone', 'MAKE A CALL'],
];

export function parseCommand(input: string, names: string[]): Parsed {
  const text = input.toLowerCase().replace(/[^a-z0-9äöüß\s'-]/g, ' ');
  const pleases = (text.match(/\b(please|pls|plz|bitte)\b/g) ?? []).length;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const target = sorted.find((n) => new RegExp(`\\b${escapeRe(n.toLowerCase())}\\b`).test(text)) ?? null;

  let command: Command = { kind: 'unknown' };
  if (/\b(help|\?)\b/.test(text) || text.trim() === '?') command = { kind: 'help' };
  else if (/\b(who|list|look)\b/.test(text)) command = { kind: 'who' };
  else if (/\b(mail|mailbox|letters)\b/.test(text) && !/\b(type|write)\b/.test(text))
    command = { kind: 'mail' };
  else if (/\b(hello|hi|hey|hallo|howdy)\b/.test(text)) command = { kind: 'hello' };
  else if (/\b(pat|pet|hug)\b/.test(text)) command = { kind: 'pat' };
  else if (/\b(letter|write|type)\b/.test(text)) command = { kind: 'letter' };
  else {
    for (const [re, spot, what] of GO) {
      if (re.test(text)) {
        command = { kind: 'go', spot, what };
        break;
      }
    }
  }
  return { command, target, pleases };
}

/** The manners rule: each PLEASE adds 4, a happy mood adds 3; 8+ does it, 4–7 later. */
export function willing(pleases: number, happy: boolean): 'now' | 'later' | 'refuse' {
  const priority = 2 + 4 * pleases + (happy ? 3 : 0);
  if (priority >= 8) return 'now';
  if (priority >= 4) return 'later';
  return 'refuse';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const HELP_TEXT =
  'TRY: HELLO <NAME>, PAT <NAME>, PLEASE PLAY PIANO, PLEASE DANCE, PLEASE WATCH TV, PLEASE LIGHT THE FIRE, PLEASE GO TO BED, PLEASE TYPE A LETTER, WHO, MAIL';
