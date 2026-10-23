/**
 * Seasonal decorations. Static parts (snow on the roof, flowers, the Christmas tree, hidden
 * eggs) are painted into the house's cached background; animated parts (falling snow and
 * leaves, blinking lights, flickering pumpkins, bats, the Easter bunny) are drawn every frame.
 * All art is original.
 */
import { col } from '../engine/palette.ts';
import { blit, drawSprite, makeSprite } from '../engine/sprite.ts';
import { DOOR, FEET, H, HOUSE, ROOF, roofY, STRIP_H, W } from './layout.ts';
import type { Theme } from './season.ts';

const rect = (ctx: CanvasRenderingContext2D, c: number, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col(c);
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

const roofTop = (x: number) => Math.round(roofY(x) - ROOF.thickness);
/** The soil strip in front of the house. */
const SOIL = { top: 192, bottom: H - 1 } as const;

/** Paints a band on both sides of the house only (the house covers the ground between). */
const besideHouse = (ctx: CanvasRenderingContext2D, c: number, y: number, h: number) => {
  rect(ctx, c, 0, y, HOUSE.left, h);
  rect(ctx, c, HOUSE.right, y, W - HOUSE.right, h);
};

/** Inside the house walls, where weather never falls. */
function indoors(x: number, y: number): boolean {
  return x >= HOUSE.left && x < HOUSE.right && y >= roofTop(x) && y < 190;
}

// ------------------------------------------------------------------ art (wide pixels)
/** Slots: s = star, l and m = the two groups of lights that blink in turn. */
const TREE = [
  '...s...',
  '..sss..',
  '...s...',
  '...5...',
  '..5l5..',
  '..555..',
  '.5m555.',
  '..55l..',
  '.l5555.',
  '.555m5.',
  '55l5555',
  '.5555m.',
  '5m55l55',
  '555m555',
  'l55555m',
  '...9...',
  '...9...',
  '..222..',
  '..272..',
  '..222..',
];
const TREE_X = 199;
const LIGHT_COLORS = [2, 7, 14, 10, 13];

const PUMPKIN = (eye: string) => [
  '..5..',
  '.888.',
  `8${eye}8${eye}8`,
  '88888',
  `8${eye}${eye}${eye}8`,
  '.888.',
];
const BAT = [
  ['0.....0', '00.0.00', '.00000.', '...0...'],
  ['...0...', '.00000.', '00.0.00', '0.....0'],
];
const BUNNY = ['.....1.', '....11.', '...1101', '.11111.', '111111.', '.1..11.'];
const BUNNY_HOP = ['......1', '.....11', '....1101', '.11111..', '11111...', '1....1..'];
/** Narrow pixels: an egg with two colours. */
const EGG = ['.aa.', 'abba', 'aaaa', 'abba', '.aa.'];
const BUTTERFLY = [
  ['a.a', '.0.', 'a.a'],
  ['...', 'a0a', '...'],
];

const EGGS: { x: number; y: number; a: number; b: number }[] = [
  { x: 76, y: FEET[0], a: 10, b: 7 },
  { x: 181, y: FEET[0], a: 14, b: 1 },
  { x: 43, y: FEET[1], a: 7, b: 4 },
  { x: 273, y: FEET[1], a: 13, b: 10 },
  { x: 114, y: FEET[2], a: 4, b: 7 },
  { x: 173, y: FEET[2], a: 3, b: 10 },
  { x: 256, y: FEET[2], a: 10, b: 14 },
  { x: 18, y: 198, a: 7, b: 2 },
  { x: 126, y: 197, a: 14, b: 7 },
  { x: 214, y: 198, a: 4, b: 13 },
  { x: 302, y: 197, a: 1, b: 10 },
];
const FLOWERS: [number, number][] = [
  [12, 7],
  [34, 10],
  [58, 4],
  [80, 1],
  [140, 7],
  [166, 10],
  [190, 4],
  [244, 7],
  [262, 1],
  [292, 10],
];

export class SeasonDecor {
  /** Painted once into the cached background. */
  paintStatic(ctx: CanvasRenderingContext2D, theme: Theme, day: boolean): void {
    const { season, holiday } = theme;
    if (!season) return;

    // ground and bush
    if (season === 'winter') {
      besideHouse(ctx, 1, 188, 4);
      rect(ctx, 1, 0, SOIL.top, W, 1);
      for (let x = 0; x < W; x += 5) rect(ctx, 15, x, SOIL.top + 1, 3, 1);
      rect(ctx, 1, 308, 181, 12, 2);
      rect(ctx, 1, 310, 179, 8, 2);
      rect(ctx, 1, HOUSE.right, 186, 14, 1); // porch
    } else if (season === 'autumn') {
      besideHouse(ctx, 8, 190, 2);
      rect(ctx, 8, 308, 182, 12, 8);
      rect(ctx, 7, 310, 180, 8, 3);
      for (const x of [311, 315, 318]) rect(ctx, 2, x, 184, 1, 1);
      for (let x = 6; x < W; x += 23) rect(ctx, [8, 2, 7][x % 3]!, x, 193 + (x % 4), 2, 1);
    } else {
      besideHouse(ctx, 13, 190, 1);
      const flowers = season === 'spring' ? FLOWERS : FLOWERS.filter((_, i) => i % 2 === 0);
      for (const [x, c] of flowers) {
        rect(ctx, 5, x + 1, 194, 1, 2);
        rect(ctx, season === 'summer' ? 7 : c, x, 193, 3, 1);
        rect(ctx, season === 'summer' ? 7 : c, x + 1, 192, 1, 1);
      }
      if (season === 'spring') for (const x of [309, 313, 317]) rect(ctx, 10, x, 181 + (x % 3), 1, 1);
      else for (const x of [311, 316]) rect(ctx, 2, x, 184, 1, 1);
    }
    if (season === 'summer' && day) {
      rect(ctx, 7, 296, 21, 8, 8);
      rect(ctx, 7, 294, 23, 12, 4);
      for (const [dx, dy] of [
        [3, -3],
        [3, 11],
        [-4, 4],
        [10, 4],
      ] as const)
        rect(ctx, 7, 296 + dx, 21 + dy, 2, 1);
    }

    // snow on the roof, the chimney cap and icicles under the eaves
    if (season === 'winter') {
      for (let x = ROOF.left; x <= ROOF.right; x++) rect(ctx, 1, x, roofTop(x) - 1, 1, x % 9 === 0 ? 1 : 2);
      rect(ctx, 1, 236, 18, 16, 2);
      for (const x of [1, 4, 8, 278, 281, 284]) rect(ctx, x % 2 ? 14 : 1, x, roofY(x) + 1, 1, 2 + (x % 3));
    }

    if (holiday === 'christmas') {
      // garland on the mantel
      rect(ctx, 5, 240, 173, 28, 1);
      for (let x = 242; x < 268; x += 5) rect(ctx, 2, x, 174, 1, 1);
    }
    if (holiday === 'halloween') {
      // a spider web in the attic's left corner
      const cx = HOUSE.left + HOUSE.wall;
      const cy = Math.ceil(roofY(cx)) + 1;
      for (let i = 0; i < 12; i++) {
        rect(ctx, 15, cx, cy + i, 1, 1); // down the wall
        rect(ctx, 15, cx + i, Math.ceil(roofY(cx + i)) + 1, 1, 1); // along the roof
        if (i < 9) rect(ctx, 15, cx + i, cy + i, 1, 1); // diagonal
      }
      for (const r of [4, 8]) {
        for (let k = 0; k <= r; k++) rect(ctx, 12, cx + k, cy + r - Math.round(k * 0.6), 1, 1);
      }
      rect(ctx, 0, cx + 6, cy + 9, 2, 2); // the spider
      rect(ctx, 15, cx + 7, cy + 5, 1, 4);
    }
    if (holiday === 'easter') {
      for (const e of EGGS) {
        const s = makeSprite(EGG, { a: e.a, b: e.b }, false);
        blit(ctx, s, e.x, e.y - s.h + 1);
      }
    }
  }

  /** Animated decorations behind the people. */
  drawBack(ctx: CanvasRenderingContext2D, theme: Theme, tick: number, ms: number, doorOpen: number): void {
    const t = ms / 1000;
    if (theme.holiday === 'christmas') {
      // blinking lights along the roof and on the tree
      let i = 0;
      for (let x = ROOF.left + 4; x <= ROOF.right - 4; x += 8, i++) {
        rect(ctx, LIGHT_COLORS[(i + (tick >> 2)) % LIGHT_COLORS.length]!, x, roofTop(x) + 1, 2, 2);
      }
      const phase = (tick >> 2) % LIGHT_COLORS.length;
      const tree = makeSprite(TREE, {
        s: (tick >> 2) % 2 ? 7 : 1,
        l: LIGHT_COLORS[phase]!,
        m: LIGHT_COLORS[(phase + 2) % LIGHT_COLORS.length]!,
      });
      blit(ctx, tree, TREE_X, FEET[0] - tree.h + 1);
      if (doorOpen < 0.5) {
        rect(ctx, 5, DOOR.x, 168, 4, 4);
        rect(ctx, 9, DOOR.x + 1, 169, 2, 2);
        rect(ctx, 2, DOOR.x + 1, 172, 2, 1);
      }
    }
    if (theme.holiday === 'halloween') {
      // jack-o'-lanterns flicker now and then
      const flicker = (k: number) => ((tick + k * 5) % 23 < 2 ? '8' : '7');
      // indoors they glow against the dark; one waits on the porch
      const pumpkins: [number, number][] = [
        [284, 186],
        [266, FEET[0]],
        [74, FEET[0]],
        [118, FEET[2]],
      ];
      pumpkins.forEach(([x, y], k) => {
        const s = makeSprite(PUMPKIN(flicker(k)));
        blit(ctx, s, x, y - s.h + 1);
      });
    }
    if (theme.holiday === 'easter') this.bunny(ctx, t);
    if ((theme.season === 'spring' || theme.season === 'summer') && theme.holiday !== 'halloween') {
      const x = 300 + Math.sin(t * 0.9) * 12;
      const y = 168 + Math.sin(t * 1.7) * 7;
      blit(ctx, makeSprite(BUTTERFLY[tick % 2]!, { a: theme.season === 'spring' ? 10 : 7 }, false), x, y);
    }
  }

  /** Weather and flying things, drawn in front of everything outside the house. */
  drawFront(ctx: CanvasRenderingContext2D, theme: Theme, tick: number, ms: number): void {
    const t = ms / 1000;
    if (theme.season === 'winter') this.fall(ctx, t, 70, [1], 7, 2, 1);
    if (theme.season === 'autumn') this.fall(ctx, t, 14, [8, 2, 7, 9], 11, 6, 2);
    if (theme.holiday === 'halloween') {
      for (let i = 0; i < 3; i++) {
        const span = W + 40;
        const x = ((t * (14 + i * 4) + i * 120) % span) - 20;
        const y = STRIP_H + 10 + i * 13 + Math.sin(t * 2 + i) * 5;
        blit(ctx, makeSprite(BAT[(tick + i) % 2]!), x, y);
      }
    }
  }

  /** Snowflakes or leaves: deterministic from time, skipping the inside of the house. */
  private fall(
    ctx: CanvasRenderingContext2D,
    t: number,
    count: number,
    colors: number[],
    speed: number,
    sway: number,
    size: number,
  ): void {
    const height = H - STRIP_H;
    for (let i = 0; i < count; i++) {
      const v = speed + ((i * 7) % 9);
      const y = STRIP_H + ((t * v + i * 37) % height);
      const x = (((i * 53 + t * 3 + Math.sin(t * 0.8 + i) * sway) % W) + W) % W;
      if (indoors(x, y)) continue;
      rect(ctx, colors[i % colors.length]!, x, y, size, 1);
    }
  }

  /** The Easter bunny hops along the garden, back and forth, pausing between hops. */
  private bunny(ctx: CanvasRenderingContext2D, t: number): void {
    const hopEvery = 0.8;
    const hopLen = 6;
    const span = W + 32;
    const hops = Math.floor(t / hopEvery);
    const frac = (t % hopEvery) / hopEvery;
    const moving = frac < 0.45;
    const travelled = (hops + (moving ? frac / 0.45 : 1)) * hopLen;
    const lap = Math.floor(travelled / span);
    const along = travelled % span;
    const right = lap % 2 === 0;
    const x = right ? along - 16 : W + 16 - along;
    const lift = moving ? Math.round(Math.sin((frac / 0.45) * Math.PI) * 3) : 0;
    drawSprite(ctx, makeSprite(moving ? BUNNY_HOP : BUNNY), x, SOIL.bottom - lift, !right);
  }
}

/** Little hats for the holidays, drawn on top of each person's head. */
const HATS = {
  christmas: { rows: ['.11.....', '..22....', '..222...', '..2222..', '.111111.'], overlap: 2 },
  halloween: { rows: ['....4...', '...44...', '...444..', '..4444..', '..4774..', '44444444'], overlap: 2 },
  easter: { rows: ['..1..1..', '..a..a..', '..1..1..'], overlap: 0 },
} as const;

export function drawHat(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  x: number,
  headTop: number,
  flip: boolean,
): void {
  if (!theme.holiday) return;
  const hat = HATS[theme.holiday];
  drawSprite(ctx, makeSprite(hat.rows, { a: 10 }), x, headTop + hat.overlap - 1, flip);
}
