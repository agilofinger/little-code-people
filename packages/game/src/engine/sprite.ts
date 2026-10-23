/**
 * Pixel art is written as text grids. Hex digits 0-f are fixed C64 colours, '.' is transparent,
 * and letters are slots that a palette map fills in (e.g. a person's hair or shirt colour).
 * Grids are "wide" by default: each art pixel is 2×1 screen pixels, like C64 multicolor mode.
 */
import { col } from './palette.ts';

export type Slots = Record<string, number>;

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const cache = new Map<string, Sprite>();

export function makeSprite(rows: readonly string[], slots: Slots = {}, wide = true): Sprite {
  const key = `${wide ? 'w' : 'n'}|${JSON.stringify(slots)}|${rows.join('/')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pw = wide ? 2 : 1;
  const cols = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = cols * pw;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      let c: number | undefined = slots[ch];
      if (c === undefined) {
        const hex = Number.parseInt(ch, 16);
        if (Number.isNaN(hex)) continue;
        c = hex;
      }
      ctx.fillStyle = col(c);
      ctx.fillRect(x * pw, y, pw, 1);
    }
  });
  const sprite = { canvas, w: canvas.width, h: canvas.height };
  cache.set(key, sprite);
  return sprite;
}

/** Draws a sprite with its bottom-centre at (x, y); flip mirrors horizontally. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  flip = false,
): void {
  const left = Math.round(x - s.w / 2);
  const top = Math.round(y - s.h + 1);
  if (!flip) {
    ctx.drawImage(s.canvas, left, top);
    return;
  }
  ctx.save();
  ctx.translate(left + s.w, top);
  ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, 0, 0);
  ctx.restore();
}

/** Draws a sprite with its top-left at (x, y). */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number): void {
  ctx.drawImage(s.canvas, Math.round(x), Math.round(y));
}
