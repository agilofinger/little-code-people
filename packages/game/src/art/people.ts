/**
 * Original pixel art for the little people (wide pixels, 8 art px = 16 screen px wide).
 * Slots: h hair, s skin, c shirt, d sleeve, p pants, f shoes, a accent (cap). 0/1 are black/white.
 * Side-view art faces right; the renderer mirrors it for walking left.
 */
import { fnv1a } from '@lcp/protocol';
import { makeSprite, type Slots, type Sprite } from '../engine/sprite.ts';

export type View = 'side' | 'front';
export type Mood = 'happy' | 'content' | 'sad' | 'sick';

/** Five head styles: ears, cap, cool glasses, balding, moustache. */
export const LOOKS = ['ears', 'cap', 'cool', 'bald', 'moustache'] as const;
export type Look = (typeof LOOKS)[number];

const HEADS: Record<Look, Record<View, string[]>> = {
  ears: {
    side: ['..hhhh..', '.hhhhhh.', '.hhhsss.', '.hsss0s.', '.hssssss', '..ssss..', '...ss...'],
    front: ['..hhhh..', '.hhhhhh.', '.hssssh.', 'ss0ss0ss', '.ssssss.', '..s00s..', '...ss...'],
  },
  cap: {
    side: ['..aaaa..', '.aaaaaa.', '.hhaaaaa', '.hsss0s.', '.hssssss', '..ssss..', '...ss...'],
    front: ['..aaaa..', '.aaaaaa.', 'aaaaaaaa', '.s0ss0s.', '.ssssss.', '..s00s..', '...ss...'],
  },
  cool: {
    side: ['..hhh...', '.hhhhhh.', '.hhhhhs.', '.hss0000', '.hssssss', '..ssss..', '...ss...'],
    front: ['.hhhhh..', 'hhhhhhh.', '.hssssh.', '.000000.', '.ssssss.', '..s00s..', '...ss...'],
  },
  bald: {
    side: ['..ssss..', '.ssssss.', '.hhssss.', '.hsss0s.', '.hssssss', '..ssss..', '...ss...'],
    front: ['..ssss..', '.ssssss.', 'hssssssh', 'hs0ss0sh', '.ssssss.', '..s00s..', '...ss...'],
  },
  moustache: {
    side: ['..hhhh..', '.hhhhhh.', '.hhhsss.', '.hsss0s.', '.hssssss', '..sshhh.', '...ss...'],
    front: ['..hhhh..', '.hhhhhh.', '.hssssh.', '.s0ss0s.', '.ssssss.', '.shhhhs.', '...ss...'],
  },
};

const BLANK = '........';
const pad = (n: number) => Array.from({ length: n }, () => BLANK);

// --- bodies (rows include the head area so arms can overlap it) ---------------------------------
const LEGS_STAND_SIDE = ['..pppp..', '..ppp...', '..ppp...', '..ppp...', '..ppp...', '..ffff..'];
const LEGS_STRIDE = ['..pppp..', '..pppp..', '.pp..pp.', '.pp..pp.', 'pp....pp', 'ff....ff'];
const LEGS_PASS = ['..pppp..', '..ppp...', '..ppp...', '...pp...', '...pp...', '...fff..'];
const LEGS_FRONT = ['.pppppp.', '.pppppp.', '.pp..pp.', '.pp..pp.', '.pp..pp.', 'fff..fff'];
const LEGS_JUMP = ['.pppppp.', '.pppppp.', '.pp..pp.', 'pp....pp', 'pp....pp', 'ff....ff'];

const TORSO_SIDE = ['..cccc..', '..cddc..', '..cddc..', '..cddc..', '..cssc..'];
const TORSO_FRONT = ['.cccccc.', 'dccccccd', 'dccccccd', 'dccccccd', 'sccccccs'];

export interface Frame {
  rows: string[];
  view: View;
  /** Row where the head's top is drawn. */
  headY: number;
  /** Mood face override for sleeping. */
  eyesClosed?: boolean;
  /** Rows duplicated when composing, for taller proportions. */
  stretch: number[];
}

const STRETCH_STAND = [9, 13, 15];
const STRETCH_SIT = [12, 16];

const f = (view: View, rows: string[], headY = 0, eyesClosed = false): Frame => ({
  rows,
  view,
  headY,
  eyesClosed,
  stretch: rows.length < 18 ? [] : headY >= 4 ? STRETCH_SIT : STRETCH_STAND,
});

export const FRAMES = {
  stand: f('side', [...pad(7), ...TORSO_SIDE, ...LEGS_STAND_SIDE]),
  walk1: f('side', [...pad(7), '..cccc..', '..cddc..', '..cddc..', '..ccds..', '..cccc..', ...LEGS_STRIDE]),
  walk2: f('side', [...pad(7), ...TORSO_SIDE, ...LEGS_PASS]),
  walk3: f('side', [...pad(7), '..cccc..', '..cddc..', '..cddc..', '..sdcc..', '..cccc..', ...LEGS_STRIDE]),
  sit: f(
    'side',
    [...pad(11), '..cccc..', '..cddc..', '..cdds..', '..cccc..', '..pppppp', '......pp', '......ff'],
    4,
  ),
  type1: f(
    'side',
    [...pad(11), '..cccc..', '..cdddss', '..cccc..', '..cccc..', '..pppppp', '......pp', '......ff'],
    4,
  ),
  type2: f(
    'side',
    [...pad(11), '..cccc..', '..cdddd.', '..ccccss', '..cccc..', '..pppppp', '......pp', '......ff'],
    4,
  ),
  read: f(
    'side',
    [
      ...pad(7),
      '....fff1',
      '....1cc1',
      '....1111',
      '....1cc1',
      '..cc1111',
      '..cddsc.',
      '..cdcc..',
      '..cccc..',
      '..pppppp',
      '......pp',
      '......ff',
    ],
    4,
  ),
  phone: f('side', [
    ...pad(2),
    '..00....',
    '..00....',
    '..s.....',
    '..d.....',
    '..d.....',
    '..dccc..',
    '..cddc..',
    '..cddc..',
    '..cddc..',
    '..cccc..',
    ...LEGS_STAND_SIDE,
  ]),
  drink: f('side', [
    ...pad(4),
    '......1.',
    '.....s1.',
    '.....d..',
    '..ccdc..',
    '..cdcc..',
    '..cccc..',
    '..cccc..',
    '..cccc..',
    ...LEGS_STAND_SIDE,
  ]),
  front: f('front', [...pad(7), ...TORSO_FRONT, ...LEGS_FRONT]),
  armsUp: f('front', [
    ...pad(2),
    's......s',
    'd......d',
    'd......d',
    'd......d',
    '.d....d.',
    '.cccccc.',
    '.cccccc.',
    '.cccccc.',
    '.cccccc.',
    '.cccccc.',
    ...LEGS_JUMP,
  ]),
  armsDown: f('front', [...pad(8), ...TORSO_FRONT, ...LEGS_FRONT.slice(1)], 1),
  hold1: f('front', [...pad(7), '.cccccc.', 'dccccccd', 'dccccccd', '.ssccss.', '.cccccc.', ...LEGS_FRONT]),
  hold2: f('front', [...pad(7), '.cccccc.', 'dccccccd', '.ssccss.', 'dccccccd', '.cccccc.', ...LEGS_FRONT]),
  knock1: f('front', [
    ...pad(3),
    's.......',
    'd.......',
    'd.......',
    'd.......',
    'dcccccc.',
    '.ccccccd',
    '.ccccccd',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  knock2: f('front', [
    ...pad(4),
    's.......',
    'd.......',
    'd.......',
    'dcccccc.',
    '.ccccccd',
    '.ccccccd',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  wave1: f('front', [
    ...pad(1),
    's.......',
    'd.......',
    'd.......',
    'd.......',
    '.d......',
    '.d......',
    '.cccccc.',
    '.ccccccd',
    '.ccccccd',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  wave2: f('front', [
    ...pad(1),
    '.s......',
    '.d......',
    '.d......',
    '.d......',
    '.d......',
    '.d......',
    '.cccccc.',
    '.ccccccd',
    '.ccccccd',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  think: f('front', [
    ...pad(6),
    '..s.....',
    '.dsccccc',
    'd.ccccc.',
    'dcccccd.',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  brush1: f('front', [
    ...pad(4),
    '..1.....',
    '..f.....',
    '..s.....',
    '.dcccc..',
    'd.ccccd.',
    'dcccccd.',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  brush2: f('front', [
    ...pad(4),
    '...1....',
    '...f....',
    '...s....',
    '.ddccc..',
    'd.ccccd.',
    'dcccccd.',
    '.ccccccd',
    '.ccccccs',
    ...LEGS_FRONT,
  ]),
  sitFront: f(
    'front',
    [...pad(11), '.cccccc.', 'dccccccd', 'dccccccd', 'sccccccs', '.pppppp.', '.pp..pp.', 'ff....ff'],
    4,
  ),
  sleep: f('front', [...pad(7)], 0, true),
} satisfies Record<string, Frame>;

export type FrameName = keyof typeof FRAMES;

// --- colours ---------------------------------------------------------------------------------------
const HAIR = [0, 9, 8, 7, 11, 2];
const SKIN = [10, 8, 9, 10, 10];
const SHIRT = [2, 3, 4, 5, 6, 7, 8, 14, 13, 1, 10];
const PANTS = [6, 9, 11, 0, 12, 4, 2];
const SHOES = [0, 9, 11];
const CAP = [2, 6, 5, 7, 8, 1];
const SHADE: Record<number, number> = {
  1: 15,
  2: 9,
  3: 12,
  4: 6,
  5: 11,
  6: 0,
  7: 8,
  8: 9,
  10: 2,
  13: 5,
  14: 6,
};

export interface Appearance {
  look: Look;
  slots: Slots;
}

const pick = (arr: number[], seed: number, salt: number) => arr[(seed >>> salt) % arr.length]!;

export function appearanceFor(seed: number): Appearance {
  const look = LOOKS[seed % LOOKS.length]!;
  const shirt = pick(SHIRT, seed, 3);
  let pants = pick(PANTS, seed, 7);
  if (pants === shirt) pants = 11;
  const slots: Slots = {
    h: look === 'moustache' ? pick([15, 12, 1], seed, 11) : pick(HAIR, seed, 11),
    s: pick(SKIN, seed, 15),
    c: shirt,
    d: SHADE[shirt] ?? 11,
    p: pants,
    f: pick(SHOES, seed, 19),
    a: pick(CAP, seed, 23),
  };
  return { look, slots };
}

/** A new shirt, e.g. after visiting the closet. */
export function withShirt(app: Appearance, salt: number): Appearance {
  const shirt = SHIRT[fnv1a(`${salt}`) % SHIRT.length]!;
  return { look: app.look, slots: { ...app.slots, c: shirt, d: SHADE[shirt] ?? 11 } };
}

function headRows(look: Look, view: View, mood: Mood, eyesClosed: boolean): string[] {
  const rows = [...HEADS[look][view]];
  if (view === 'front') {
    if (eyesClosed) rows[3] = look === 'cool' ? rows[3]! : '.00ss00.';
    if (look !== 'moustache') {
      if (mood === 'happy') rows[4] = '.2ssss2.'; // rosy cheeks
      if (mood === 'sad' || mood === 'sick') rows[5] = '...00...';
    }
    if (mood === 'sad') rows[4] = '.sessss.'; // a tear
  }
  return rows;
}

const composed = new Map<string, Sprite>();

/** Builds (and caches) the sprite of one frame for one appearance and mood. */
export function personSprite(app: Appearance, frame: FrameName, mood: Mood, dozing = false): Sprite {
  const key = `${app.look}|${JSON.stringify(app.slots)}|${frame}|${mood}|${dozing}`;
  const hit = composed.get(key);
  if (hit) return hit;
  const fr: Frame = FRAMES[frame];
  const head = headRows(app.look, fr.view, mood, fr.eyesClosed === true || dozing);
  if (dozing && fr.view === 'side') head[3] = head[3]!.replace('0', 's');
  const height = Math.max(fr.rows.length, fr.headY + head.length);
  const grid: string[][] = Array.from({ length: height }, () => BLANK.split(''));
  const put = (rows: string[], y0: number) =>
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch !== '.') grid[y0 + y]![x] = ch;
      }
    });
  put(head, fr.headY);
  put(fr.rows, 0);
  for (const row of [...fr.stretch].sort((a, b) => b - a)) grid.splice(row, 0, [...grid[row]!]);
  const slots = mood === 'sick' ? { ...app.slots, s: 13 } : app.slots;
  const sprite = makeSprite(
    grid.map((r) => r.join('')),
    { ...slots, e: 14 },
  );
  composed.set(key, sprite);
  return sprite;
}

// --- critters (helpers / subagents) --------------------------------------------------------------
export const CRITTER_FRAMES = {
  kid: {
    walk: [
      ['.hhhh.', 'hhhsss', 'hss0s.', '.ssss.', '.cccc.', '.cdcc.', '.cscc.', '.pppp.', '.p..p.', 'ff..ff'],
      ['.hhhh.', 'hhhsss', 'hss0s.', '.ssss.', '.cccc.', '.cdcc.', '.cscc.', '.pppp.', '..pp..', '..fff.'],
    ],
    sit: [
      ['......', '.hhhh.', 'hhhsss', 'hss0s.', '.ssss.', '.cccc.', '.cdcc.', '.csss.', '.ppppp', '....ff'],
    ],
  },
  cat: {
    walk: [
      ['h....h.h', 'h....hhh', '.h..hh0h', '.hhhhhh.', '.hhhhhh.', '.hh...hh'],
      ['h....h.h', 'h....hhh', '.h..hh0h', '.hhhhhh.', '.hhhhhh.', '..hh.hh.'],
    ],
    sit: [['.....h.h', '.....hhh', 'h...hh0h', 'h..hhhh.', '.hhhhhh.', '.hhhhhh.']],
  },
  dog: {
    walk: [
      ['.......hh.', '......hhh0', 'h.....h0hh', '.hhhhhhhh.', '.hhhhhhh..', '.hh...hh..', '.h.....h..'],
      ['.......hh.', '......hhh0', 'h.....h0hh', '.hhhhhhhh.', '.hhhhhhh..', '..hh.hh...', '..h...h...'],
    ],
    sit: [['.......hh.', '......hhh0', '......h0hh', '.....hhhh.', 'h...hhhhh.', '.hhhhhhhh.', '.hhhhh.hh.']],
  },
} as const;

export type CritterPose = 'walk' | 'sit';

const CRITTER_COLOURS: Record<'kid' | 'cat' | 'dog', number[]> = {
  kid: [2, 5, 7, 3, 4, 8, 14],
  cat: [8, 0, 12, 1, 15, 9],
  dog: [9, 8, 15, 12, 0, 7],
};

export function critterSlots(kind: 'kid' | 'cat' | 'dog', seed: number): Slots {
  const main = CRITTER_COLOURS[kind][seed % CRITTER_COLOURS[kind].length]!;
  if (kind === 'kid') {
    return {
      h: pick(HAIR, seed, 5),
      s: pick(SKIN, seed, 9),
      c: main,
      d: SHADE[main] ?? 11,
      p: pick(PANTS, seed, 13),
      f: 0,
    };
  }
  // Eyes must stay visible on dark fur.
  return { h: main, 0: main === 0 ? 7 : 0 } as Slots;
}

export function critterSprite(
  kind: 'kid' | 'cat' | 'dog',
  pose: CritterPose,
  frame: number,
  slots: Slots,
): Sprite {
  const frames = CRITTER_FRAMES[kind][pose];
  return makeSprite(frames[frame % frames.length]! as unknown as string[], slots);
}
