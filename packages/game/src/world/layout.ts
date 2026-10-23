/**
 * Geometry of the house on the 320×200 C64 screen, the stairs, and every activity spot.
 * The floor plan: kitchen | stairs | living room (front door far right)
 * on the ground floor; bedroom | stairs | bathroom | computer corner in the middle; one wide
 * attic room under the gable. Black interiors, rust-red outlines, blue sky in the corners.
 * All coordinates are screen pixels. People stand with their feet on FEET[floor].
 */
import type { ActivityKind } from '@lcp/protocol';

export const W = 320;
export const H = 200;
/** Grey text strip at the top (typed requests, letters, announcements). */
export const STRIP_H = 10;

export type Floor = 0 | 1 | 2;
export const FEET: Record<Floor, number> = { 0: 189, 1: 141, 2: 93 };
/** First interior row of each floor (below the slab above it). */
export const CEILING: Record<Floor, number> = { 0: 146, 1: 98, 2: 14 };
export const SLAB_H = 4;

export const HOUSE = { left: 4, right: 282, wall: 4 } as const;
export const ROOF = { left: 0, right: 286, eaveY: 62, peakX: 143, peakY: 13, thickness: 5 } as const;
export const INSIDE = { left: 10, right: 276 } as const;
export const STAIRWELL = { left: 98, right: 130 } as const;
export const DOOR = { x: 278, top: 165, inside: 266, step: 290 } as const;
export const OUTSIDE_RIGHT = 344;
export const CHIMNEY = { left: 238, right: 250, top: 22 } as const;

/** Interior walls per floor (x of the 4-px wall). Doorways leave headroom below. */
export const WALLS: Record<Floor, number[]> = { 0: [94, 130], 1: [94, 130, 180], 2: [] };
export const DOORWAY_H = 26;

/** Stair flights connect floor n (bottom x) with floor n+1 (top x). They zig-zag. */
export const FLIGHTS: { from: Floor; bottomX: number; topX: number }[] = [
  { from: 0, bottomX: 103, topX: 126 },
  { from: 1, bottomX: 126, topX: 103 },
];

/** Roof underside y at x (attic headroom). */
export function roofY(x: number): number {
  const { left, right, eaveY, peakX, peakY, thickness } = ROOF;
  const t = x <= peakX ? (x - left) / (peakX - left) : (right - x) / (right - peakX);
  return eaveY - (eaveY - peakY) * Math.max(0, Math.min(1, t)) + thickness;
}

export type RoomId = 'kitchen' | 'living' | 'bedroom' | 'bath' | 'computer' | 'attic' | 'stairs';

export const ROOMS: { id: RoomId; floor: Floor; left: number; right: number; name: string }[] = [
  { id: 'kitchen', floor: 0, left: 8, right: 94, name: 'KITCHEN' },
  { id: 'living', floor: 0, left: 134, right: 278, name: 'LIVING ROOM' },
  { id: 'bedroom', floor: 1, left: 8, right: 94, name: 'BEDROOM' },
  { id: 'bath', floor: 1, left: 134, right: 180, name: 'BATHROOM' },
  { id: 'computer', floor: 1, left: 184, right: 278, name: 'COMPUTER CORNER' },
  { id: 'attic', floor: 2, left: 8, right: 278, name: 'ATTIC' },
];

export type Pose =
  | 'stand'
  | 'front'
  | 'sit'
  | 'sitFront'
  | 'type'
  | 'piano'
  | 'cards'
  | 'read'
  | 'phone'
  | 'drink'
  | 'hold'
  | 'dance'
  | 'exercise'
  | 'brush'
  | 'sleep'
  | 'knock'
  | 'wave'
  | 'think'
  | 'shower';

export type SpotId =
  | 'fridge'
  | 'stove'
  | 'sink'
  | 'cooler'
  | 'cardsL'
  | 'cardsR'
  | 'phone'
  | 'armchair'
  | 'fire'
  | 'bunkLow'
  | 'bunkHigh'
  | 'closet'
  | 'dresser'
  | 'basin'
  | 'shower'
  | 'shelf'
  | 'comp1'
  | 'comp2'
  | 'tv1'
  | 'tv2'
  | 'dance1'
  | 'dance2'
  | 'piano'
  | 'typewriter'
  | 'cabinet'
  | 'gym';

export interface Spot {
  id: SpotId;
  floor: Floor;
  x: number;
  /** Side-view facing while there: 1 right, -1 left. Front poses ignore it. */
  facing: 1 | -1;
  pose: Pose;
  /** Vertical offset of the person while there (upper bunk). */
  dy?: number;
  label: string;
}

const spot = (
  id: SpotId,
  floor: Floor,
  x: number,
  facing: 1 | -1,
  pose: Pose,
  label: string,
  dy?: number,
): Spot =>
  dy === undefined ? { id, floor, x, facing, pose, label } : { id, floor, x, facing, pose, label, dy };

export const SPOTS: Record<SpotId, Spot> = Object.fromEntries(
  [
    // ground floor: kitchen
    spot('fridge', 0, 17, 1, 'hold', 'RAIDING THE FRIDGE'),
    spot('stove', 0, 33, 1, 'hold', 'COOKING'),
    spot('sink', 0, 52, 1, 'hold', 'WASHING DISHES'),
    spot('cooler', 0, 79, 1, 'drink', 'DRINKING WATER'),
    // ground floor: living room
    spot('cardsL', 0, 144, 1, 'cards', 'PLAYING CARDS'),
    spot('cardsR', 0, 172, -1, 'cards', 'PLAYING CARDS'),
    spot('phone', 0, 203, -1, 'phone', 'ON THE PHONE'),
    spot('armchair', 0, 224, -1, 'read', 'READING THE PAPER'),
    spot('fire', 0, 254, 1, 'front', 'WARMING UP BY THE FIRE'),
    // middle floor: bedroom, bathroom, computer corner
    spot('bunkLow', 1, 17, 1, 'sleep', 'SLEEPING'),
    spot('bunkHigh', 1, 17, 1, 'sleep', 'SLEEPING', -14),
    spot('closet', 1, 56, 1, 'front', 'CHANGING CLOTHES'),
    spot('dresser', 1, 79, 1, 'hold', 'TIDYING THE DRESSER'),
    spot('basin', 1, 142, 1, 'brush', 'BRUSHING TEETH'),
    spot('shower', 1, 165, 1, 'shower', 'TAKING A SHOWER'),
    spot('shelf', 1, 195, 1, 'hold', 'READING A BOOK'),
    spot('comp1', 1, 232, -1, 'type', 'AT THE COMPUTER'),
    spot('comp2', 1, 266, -1, 'type', 'AT THE COMPUTER'),
    // attic
    spot('tv1', 2, 41, -1, 'sit', 'WATCHING TV'),
    spot('tv2', 2, 58, -1, 'sit', 'WATCHING TV'),
    spot('dance1', 2, 76, 1, 'dance', 'DANCING'),
    spot('dance2', 2, 90, 1, 'dance', 'DANCING'),
    spot('piano', 2, 165, -1, 'piano', 'PLAYING THE PIANO'),
    spot('typewriter', 2, 222, -1, 'type', 'TYPING'),
    spot('cabinet', 2, 241, 1, 'hold', 'SEARCHING THE FILES'),
    spot('gym', 2, 262, 1, 'exercise', 'EXERCISING'),
  ].map((s) => [s.id, s]),
) as Record<SpotId, Spot>;

/** Where a busy session goes for each kind of work, in order of preference. */
export const WORK_SPOTS: Partial<Record<ActivityKind, SpotId[]>> = {
  shell: ['comp1', 'comp2', 'typewriter'],
  edit: ['typewriter', 'comp2', 'comp1'],
  read: ['armchair', 'shelf'],
  search: ['cabinet', 'shelf'],
  web: ['phone', 'tv1', 'tv2'],
  tool: ['cabinet', 'phone', 'comp1'],
  message: ['phone'],
};

/** Where an idle little person likes to spend time during the day, with weights. */
export const IDLE_SPOTS: [SpotId, number][] = [
  ['piano', 3],
  ['tv1', 3],
  ['tv2', 2],
  ['dance1', 2],
  ['dance2', 1],
  ['fire', 2],
  ['armchair', 2],
  ['cardsL', 2],
  ['cardsR', 2],
  ['cooler', 2],
  ['fridge', 1],
  ['sink', 1],
  ['shelf', 1],
  ['gym', 2],
  ['closet', 1],
  ['dresser', 1],
  ['shower', 1],
  ['basin', 1],
  ['comp1', 1],
];

export const MEAL_SPOTS: [SpotId, number][] = [
  ['stove', 4],
  ['fridge', 3],
  ['cooler', 2],
  ['sink', 1],
];

export const NIGHT_SPOTS: [SpotId, number][] = [
  ['bunkLow', 8],
  ['bunkHigh', 8],
  ['armchair', 2],
  ['tv1', 2],
  ['tv2', 2],
];

/** Spots where a person dozes off at night instead of doing the activity. */
export const DOZE_SPOTS = new Set<SpotId>(['armchair', 'tv1', 'tv2']);

/** Where people wait outside when the house is full (feet x on floor 0). */
export const QUEUE_X = [292, 304, 316];

export function roomAt(floor: Floor, x: number): RoomId {
  if (x >= STAIRWELL.left && x <= STAIRWELL.right && floor < 2) return 'stairs';
  return ROOMS.find((r) => r.floor === floor && x >= r.left && x <= r.right)?.id ?? 'stairs';
}
