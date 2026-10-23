/**
 * Draws the house: a cached static background (sky, roof, walls, floors, stairs, furniture)
 * plus animated details that depend on who is doing what.
 */
import { ANIM, BLANKETS, PIECES } from '../art/furniture.ts';
import { col } from '../engine/palette.ts';
import { blit, makeSprite } from '../engine/sprite.ts';
import {
  CEILING,
  CHIMNEY,
  DOOR,
  DOORWAY_H,
  FEET,
  FLIGHTS,
  type Floor,
  H,
  HOUSE,
  ROOF,
  roofY,
  type SpotId,
  STRIP_H,
  W,
  WALLS,
} from './layout.ts';
import { type Theme, themeKey } from './season.ts';
import { SeasonDecor } from './season-render.ts';

export type SkyPhase = 'day' | 'dusk' | 'night';

export function skyPhase(date: Date): SkyPhase {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 18.5) return 'day';
  if ((h >= 18.5 && h < 20.5) || (h >= 5.5 && h < 7)) return 'dusk';
  return 'night';
}

const SKY: Record<SkyPhase, number> = { day: 14, dusk: 6, night: 6 };

export interface HouseState {
  now: Date;
  /** Animation frame counter at 8 fps. */
  tick: number;
  occupied: ReadonlySet<SpotId>;
  /** 0 closed … 1 open. */
  door: number;
  fireLit: boolean;
  unreadLetters: boolean;
  ringing: boolean;
  theme: Theme;
}

const rect = (ctx: CanvasRenderingContext2D, c: number, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col(c);
  ctx.fillRect(x, y, w, h);
};

/** Floor band patterns per room: [x0, x1, floor, a, b, pattern]. */
const FLOOR_BANDS: [number, number, Floor, number, number, 'check' | 'plain' | 'wood'][] = [
  [8, 94, 0, 5, 13, 'check'], // kitchen: green checks
  [98, 130, 0, 9, 9, 'plain'],
  [134, 278, 0, 2, 10, 'wood'], // living room carpet
  [8, 94, 1, 4, 4, 'plain'], // bedroom carpet
  [134, 180, 1, 6, 14, 'check'], // bathroom: blue checks
  [184, 278, 1, 5, 5, 'plain'], // computer corner: green
  [8, 278, 2, 8, 9, 'wood'], // attic boards
];

export class HouseRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgKey: string | null = null;
  private readonly decor = new SeasonDecor();
  private readonly stars: [number, number][] = [];

  constructor() {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 40; i++) this.stars.push([Math.floor(rnd() * W), STRIP_H + Math.floor(rnd() * 80)]);
  }

  private background(phase: SkyPhase, theme: Theme): HTMLCanvasElement {
    const key = `${phase}|${themeKey(theme)}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    this.paintStatic(ctx, phase);
    this.decor.paintStatic(ctx, theme, phase === 'day');
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  private paintStatic(ctx: CanvasRenderingContext2D, phase: SkyPhase): void {
    const sky = SKY[phase];
    rect(ctx, sky, 0, STRIP_H, W, 190 - STRIP_H);
    if (phase !== 'day') {
      for (const [x, y] of this.stars) {
        if (y < roofY(x) - 6 || x > HOUSE.right + 6) rect(ctx, phase === 'night' ? 1 : 15, x, y, 1, 1);
      }
      if (phase === 'night') {
        // moon
        rect(ctx, 7, 298, 22, 6, 6);
        rect(ctx, 7, 297, 23, 8, 4);
        rect(ctx, sky, 301, 21, 5, 5);
      }
    } else {
      for (const [cx, cy] of [
        [20, 24],
        [262, 20],
        [300, 46],
      ] as const) {
        rect(ctx, 1, cx, cy, 14, 3);
        rect(ctx, 1, cx + 3, cy - 2, 7, 2);
        rect(ctx, 15, cx + 1, cy + 3, 12, 1);
      }
    }

    // ground
    rect(ctx, 5, 0, 190, W, 2);
    rect(ctx, 9, 0, 192, W, 8);
    for (let x = 1; x < W; x += 7) rect(ctx, 8, x, 194 + (x % 3), 2, 1);

    // house body (black interior)
    for (let x = HOUSE.left; x < HOUSE.right; x++)
      rect(ctx, 0, x, Math.ceil(roofY(x)), 1, 192 - Math.ceil(roofY(x)));

    // chimney (behind the roof edge)
    const chimBottom = Math.ceil(roofY(CHIMNEY.left));
    rect(ctx, 2, CHIMNEY.left, CHIMNEY.top, CHIMNEY.right - CHIMNEY.left, chimBottom - CHIMNEY.top);
    for (let y = CHIMNEY.top + 2; y < chimBottom; y += 3)
      rect(ctx, 9, CHIMNEY.left, y, CHIMNEY.right - CHIMNEY.left, 1);
    rect(ctx, 12, CHIMNEY.left - 2, CHIMNEY.top - 2, CHIMNEY.right - CHIMNEY.left + 4, 2);

    // roof band with tiles
    for (let x = ROOF.left; x <= ROOF.right; x++) {
      const under = roofY(x);
      const top = Math.round(under - ROOF.thickness);
      rect(ctx, 2, x, top, 1, ROOF.thickness);
      if ((x >> 1) % 3 === 0) rect(ctx, 10, x, top + 1, 1, 1);
      if ((x >> 1) % 3 === 1) rect(ctx, 9, x, top + 3, 1, 1);
    }

    // outer walls
    for (const wx of [HOUSE.left, HOUSE.right - HOUSE.wall]) {
      const top = Math.ceil(roofY(wx + 2));
      rect(ctx, 2, wx, top, HOUSE.wall, 190 - top);
      rect(ctx, 9, wx + 1, top, 1, 190 - top);
    }

    // floor slabs
    for (const y of [FEET[2] + 1, FEET[1] + 1]) {
      rect(ctx, 9, HOUSE.left, y, HOUSE.right - HOUSE.left, 4);
      rect(ctx, 2, HOUSE.left, y + 3, HOUSE.right - HOUSE.left, 1);
    }
    rect(ctx, 9, HOUSE.left, FEET[0] + 1, HOUSE.right - HOUSE.left, 2);

    // floor bands
    for (const [x0, x1, floor, a, b, pattern] of FLOOR_BANDS) {
      const y = FEET[floor] - 2;
      for (let x = x0; x < x1; x += 2) {
        const alt = pattern === 'check' ? ((x >> 2) & 1) === 0 : pattern === 'wood' ? x % 12 === 0 : false;
        rect(ctx, alt ? b : a, x, y, 2, 3);
        if (pattern === 'check') rect(ctx, alt ? a : b, x, y + 1, 2, 1);
      }
    }
    // yellow rug under the record player
    // (part of furniture pieces)

    // interior walls with doorways
    for (const floor of [0, 1] as Floor[]) {
      for (const wx of WALLS[floor]) {
        const top = CEILING[floor];
        const bottom = FEET[floor] - DOORWAY_H;
        rect(ctx, 2, wx, top, 4, bottom - top);
        rect(ctx, 9, wx + 1, top, 2, bottom - top);
      }
    }

    // stairs
    for (const flight of FLIGHTS) {
      const steps = 9;
      const yb = FEET[flight.from];
      const yt = FEET[(flight.from + 1) as Floor];
      const dir = Math.sign(flight.topX - flight.bottomX);
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = flight.bottomX + (flight.topX - flight.bottomX) * t;
        const y = Math.round(yb + (yt - yb) * t);
        const sx = Math.round(dir > 0 ? x - 4 : x - 2);
        rect(ctx, 8, sx, y + 1, 6, 1);
        rect(ctx, 9, sx, y + 2, 6, 3);
      }
    }

    // furniture
    for (const p of PIECES) {
      if (p.layer === 'front') continue;
      const s = makeSprite(p.rows);
      blit(ctx, s, p.x, p.y - s.h + 1);
    }
    // windows show the sky
    this.tintWindows(ctx, sky);

    // outside: porch, path, mailbox post, bush
    rect(ctx, 12, HOUSE.right, 187, 14, 3);
    rect(ctx, 15, HOUSE.right, 187, 14, 1);
    rect(ctx, 9, 301, 158, 2, 32);
    rect(ctx, 5, 308, 182, 12, 8);
    rect(ctx, 13, 310, 180, 8, 3);
    // doorbell
    rect(ctx, 7, HOUSE.right + 1, 173, 2, 2);
  }

  private tintWindows(ctx: CanvasRenderingContext2D, sky: number): void {
    // Window glass is drawn in cyan (3); recolour it with the current sky.
    const img = ctx.getImageData(0, 0, W, H);
    const [r, g, b] = hex(col(3));
    const [sr, sg, sb] = hex(col(sky));
    for (const p of PIECES.filter((pc) => pc.id.includes('window'))) {
      const s = makeSprite(p.rows);
      for (let y = p.y - s.h + 1; y <= p.y; y++) {
        for (let x = p.x; x < p.x + s.w; x++) {
          const i = (y * W + x) * 4;
          if (img.data[i] === r && img.data[i + 1] === g && img.data[i + 2] === b) {
            img.data[i] = sr;
            img.data[i + 1] = sg;
            img.data[i + 2] = sb;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  drawBack(ctx: CanvasRenderingContext2D, s: HouseState): void {
    ctx.drawImage(this.background(skyPhase(s.now), s.theme), 0, 0);
    const t = s.tick;
    const occ = s.occupied;

    // fire + smoke
    const fire = s.fireLit ? ANIM.fire[t % 3]! : ANIM.embers;
    blit(ctx, makeSprite(fire), 246, FEET[0] - 2 - fire.length + 1);
    if (s.fireLit) {
      for (let i = 0; i < 3; i++) {
        const age = (t + i * 5) % 15;
        blit(
          ctx,
          makeSprite(ANIM.smoke[(t >> 2) % 2]!),
          CHIMNEY.left + 2 + (age >> 2),
          CHIMNEY.top - 5 - age * 1.5,
        );
      }
    }
    // steam over the pot
    if (occ.has('stove')) blit(ctx, makeSprite(ANIM.steam[(t >> 1) % 2]!), 34, FEET[0] - 17);
    // TV
    const tvOn = occ.has('tv1') || occ.has('tv2');
    blit(
      ctx,
      makeSprite(tvOn ? ANIM.tvShow[(t >> 3) % 3]! : ['0000', '0000', '0000', '0000']),
      16,
      FEET[2] - 7,
    );
    // monitors
    const monitors: [SpotId, number][] = [
      ['comp1', 212],
      ['comp2', 246],
    ];
    for (const [spot, x] of monitors) {
      const y = FEET[1] - 9 - 5;
      if (occ.has(spot)) blit(ctx, makeSprite(ANIM.monitorText[(t >> 1) % 3]!), x, y);
      else if (t % 8 < 4) rect(ctx, 14, x, y, 2, 1);
    }
    // record player
    if (occ.has('dance1') || occ.has('dance2')) {
      rect(ctx, 12, 66 + ((t % 4) << 1), FEET[2] - 10, 2, 1);
      const age = t % 16;
      blit(ctx, makeSprite(ANIM.note), 70 + (age >> 2), FEET[2] - 16 - age);
    }
    // cards on the table
    if (occ.has('cardsL') || occ.has('cardsR')) blit(ctx, makeSprite(ANIM.cards), 152, FEET[0] - 8);
    // closet open
    if (occ.has('closet')) blit(ctx, makeSprite(ANIM.closetOpen), 46, FEET[1] - 26);
    // wall clock with real time
    this.clock(ctx, 234, 104, s.now);
    // front door
    this.door(ctx, s.door);
    // mailbox
    rect(ctx, 12, 296, 151, 12, 7);
    rect(ctx, 11, 296, 157, 12, 1);
    rect(ctx, 0, 298, 153, 8, 1);
    if (s.unreadLetters) {
      rect(ctx, 9, 308, 147, 1, 6);
      rect(ctx, 2, 309, 147, 3, 3);
    } else {
      rect(ctx, 2, 308, 155, 4, 1);
    }
    if (s.ringing && t % 2 === 0) {
      rect(ctx, 7, HOUSE.right + 1, 170, 2, 1);
      rect(ctx, 7, HOUSE.right + 3, 172, 1, 4);
    }
    this.decor.drawBack(ctx, s.theme, t, s.now.getTime(), s.door);
  }

  drawFront(ctx: CanvasRenderingContext2D, s: HouseState): void {
    for (const p of PIECES) {
      if (p.layer !== 'front') continue;
      const sp = makeSprite(p.rows);
      blit(ctx, sp, p.x, p.y - sp.h + 1);
    }
    for (const b of Object.values(BLANKETS)) {
      const sp = makeSprite(b.rows);
      blit(ctx, sp, b.x, b.y - sp.h + 1);
    }
    if (s.occupied.has('shower')) {
      const water = makeSprite(ANIM.water[s.tick % 2]!);
      for (let y = FEET[1] - 24; y < FEET[1] - 6; y += 3) blit(ctx, water, 158, y);
    }
    this.decor.drawFront(ctx, s.theme, s.tick, s.now.getTime());
  }

  private clock(ctx: CanvasRenderingContext2D, x: number, y: number, now: Date): void {
    rect(ctx, 15, x + 1, y, 6, 8);
    rect(ctx, 15, x, y + 1, 8, 6);
    rect(ctx, 1, x + 1, y + 1, 6, 6);
    const cx = x + 3.5;
    const cy = y + 3.5;
    const hand = (angle: number, len: number, c: number) => {
      for (let r = 0; r <= len; r += 0.5) {
        rect(
          ctx,
          c,
          Math.round(cx + Math.sin(angle) * r - 0.5),
          Math.round(cy - Math.cos(angle) * r - 0.5),
          1,
          1,
        );
      }
    };
    const m = now.getMinutes();
    const h = (now.getHours() % 12) + m / 60;
    hand((m / 60) * Math.PI * 2, 3, 0);
    hand((h / 12) * Math.PI * 2, 2, 2);
  }

  private door(ctx: CanvasRenderingContext2D, open: number): void {
    const x = DOOR.x;
    const top = DOOR.top;
    const h = FEET[0] - top + 1;
    if (open < 0.5) {
      rect(ctx, 8, x, top, 4, h);
      rect(ctx, 9, x + 1, top + 2, 2, h - 4);
      rect(ctx, 7, x, top + 13, 1, 1);
    } else {
      rect(ctx, 0, x, top, 4, h);
      const leaf = Math.round(10 * open);
      rect(ctx, 8, x - leaf, top, leaf, h);
      rect(ctx, 9, x - leaf + 1, top + 2, Math.max(1, leaf - 2), h - 4);
    }
  }
}

function hex(c: string): [number, number, number] {
  return [
    Number.parseInt(c.slice(1, 3), 16),
    Number.parseInt(c.slice(3, 5), 16),
    Number.parseInt(c.slice(5, 7), 16),
  ];
}
