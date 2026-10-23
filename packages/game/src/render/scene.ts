/**
 * Draws one frame of the world: house, people, helpers, and everything floating above them.
 */
import { critterSprite, personSprite } from '../art/people.ts';
import { drawText, GLYPH_H, GLYPH_W } from '../engine/font.ts';
import { col } from '../engine/palette.ts';
import { blit, drawSprite, makeSprite } from '../engine/sprite.ts';
import type { Person } from '../sim/person.ts';
import { CAPACITY, type World } from '../sim/world.ts';
import type { HouseRenderer } from '../world/house-render.ts';
import { HOUSE, QUEUE_X, STRIP_H, W } from '../world/layout.ts';
import type { Theme } from '../world/season.ts';
import { drawHat } from '../world/season-render.ts';

export interface SceneOptions {
  tick8: number;
  now: number;
  focusId: string | null;
  hoverId: string | null;
  showNames: boolean;
  showBalloons: boolean;
  theme: Theme;
}

const SUITCASE = ['.99.', '8888', '8998', '8888'];
const ENVELOPE = ['1111', '1001', '1111'];
const THINK = ['..11111..', '.1111111.', '111111111', '.1111111.', '..11111..', '.11......', '1........'];
const ZZZ = ['111', '..1', '.1.', '111'];

const rect = (ctx: CanvasRenderingContext2D, c: number, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col(c);
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

export function drawScene(
  ctx: CanvasRenderingContext2D,
  world: World,
  house: HouseRenderer,
  o: SceneOptions,
): void {
  const occupied = world.occupied();
  const state = {
    now: world.date(),
    tick: o.tick8,
    occupied,
    door: world.door,
    fireLit: occupied.has('fire') || isEvening(world.date()),
    unreadLetters: world.letters.some((l) => !l.read),
    ringing: o.now < world.ringingUntil,
    theme: o.theme,
  };
  house.drawBack(ctx, state);

  const people = [...world.people.values()].filter((p) => p.mode !== 'gone').sort((a, b) => a.y - b.y);
  for (const p of people) drawPerson(ctx, p, o);
  for (const c of world.visibleCritters()) {
    const pose = c.moving ? 'walk' : 'sit';
    drawSprite(ctx, critterSprite(c.kind, pose, c.moving ? o.tick8 : 0, c.slots), c.x, c.y, c.facing === -1);
  }
  house.drawFront(ctx, state);

  // the house is full: a sign on the door, and a count of extra people waiting
  if (world.residents.length >= CAPACITY) {
    rect(ctx, 2, HOUSE.right + 1, 156, 19, 8);
    drawText(ctx, 'FULL', HOUSE.right + 3, 157, 1);
  }
  const offscreen = world.queue.length - QUEUE_X.length;
  if (offscreen > 0) {
    rect(ctx, 0, W - 14, 176, 14, 8);
    drawText(ctx, `+${offscreen}`, W - 13, 177, 7);
  }
  // things above everyone; name labels dodge each other
  const labels: Rect[] = [];
  for (const p of people) drawOverhead(ctx, p, world, o, labels);
  for (const e of world.envelopes) drawEnvelope(ctx, world, e, o.now);
  for (const poof of world.poofs) drawPoof(ctx, poof.x, poof.y, (o.now - poof.start) / 600);
}

function isEvening(d: Date): boolean {
  const h = d.getHours();
  return h >= 19 || h < 6;
}

function drawPerson(ctx: CanvasRenderingContext2D, p: Person, o: SceneOptions): void {
  const { frame, flip } = p.frame(o.tick8);
  const sprite = personSprite(p.app, frame, p.moodName, p.dozing);
  if (p.pose === 'sleep' && !p.moving) {
    drawSprite(ctx, sprite, p.x, p.y - 2, false);
    return;
  }
  drawSprite(ctx, sprite, p.x, p.y + p.bob(o.tick8), flip);
  if (p.pose !== 'shower') drawHat(ctx, o.theme, p.x, p.headY + 1 + p.bob(o.tick8), flip);
  if (p.carrying) drawSprite(ctx, makeSprite(SUITCASE), p.x + p.facing * 7, p.y - 3, false);
  if (p.id === o.focusId) {
    // a little marker under the feet of the focused person
    rect(ctx, 7, p.x - 5, p.y + 1, 10, 1);
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function drawOverhead(
  ctx: CanvasRenderingContext2D,
  p: Person,
  world: World,
  o: SceneOptions,
  labels: Rect[],
): void {
  const headY = p.headY + p.bob(o.tick8);
  let top = headY - 2;

  const sleeping = (p.pose === 'sleep' || p.dozing) && !p.moving;
  if (sleeping) {
    const t = (o.tick8 % 12) / 12;
    blit(ctx, makeSprite(ZZZ, {}, false), p.x + 4 + t * 4, headY - 6 - t * 8);
  }

  if (p.balloon && o.showBalloons && p.mode !== 'gone') {
    top = drawBalloon(ctx, p.balloon.lines, p.balloon.color, p.x, headY - 2);
  } else if (p.isThinking && !sleeping) {
    const s = makeSprite(THINK, {}, false);
    blit(ctx, s, p.x - 2, headY - 9);
    // the three dots take turns
    const dot = o.tick8 % 4;
    rect(ctx, 1, p.x + 1 + dot * 2, headY - 7, 1, 1);
    top = headY - 10;
  } else if (p.emote) {
    top = drawEmote(ctx, p.emote.kind, p.x, headY - 2);
  }

  const showName = o.showNames || p.id === o.focusId || p.id === o.hoverId;
  if (showName && !(p.balloon && o.showBalloons)) {
    const name = p.name.slice(0, 14);
    const w = name.length * GLYPH_W;
    const x = Math.round(Math.max(1, Math.min(W - w - 1, p.x - w / 2)));
    let y = Math.max(STRIP_H + 1, top - GLYPH_H - 1);
    for (
      let tries = 0;
      tries < 3 && labels.some((r) => overlaps(r, { x: x - 1, y: y - 1, w: w + 1, h: GLYPH_H + 1 }));
      tries++
    ) {
      y = Math.max(STRIP_H + 1, y - GLYPH_H - 1);
    }
    labels.push({ x: x - 1, y: y - 1, w: w + 1, h: GLYPH_H + 1 });
    const focused = p.id === o.focusId;
    rect(ctx, 0, x - 1, y - 1, w + 1, GLYPH_H + 1);
    drawText(ctx, name, x, y, focused ? 7 : p.mode === 'queued' ? 12 : 15);
  }
  const hidden = world.hiddenCritterCount(p.id);
  if (hidden > 0 && p.mode === 'inside') {
    rect(ctx, 0, p.x + 6, headY + 3, 9, 7);
    drawText(ctx, `+${hidden}`, p.x + 7, headY + 4, 13);
  }
}

/** White speech balloon with a tail; returns its top y. */
export function drawBalloon(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  color: number,
  x: number,
  bottom: number,
): number {
  const cols = Math.max(...lines.map((l) => l.length));
  const w = cols * GLYPH_W + 3;
  const h = lines.length * GLYPH_H + 3;
  const left = Math.round(Math.max(1, Math.min(W - w - 1, x - w / 2)));
  const top = Math.round(Math.max(STRIP_H + 1, bottom - h - 3));
  const fill = color === 7 ? 7 : 1;
  rect(ctx, 0, left - 1, top - 1, w + 2, h + 2);
  rect(ctx, fill, left, top, w, h);
  // tail
  const tx = Math.round(Math.max(left + 2, Math.min(left + w - 3, x)));
  rect(ctx, fill, tx, top + h, 2, 1);
  rect(ctx, fill, tx, top + h + 1, 1, 1);
  const ink = color === 7 || color === 1 ? 0 : color;
  lines.forEach((line, i) => {
    drawText(ctx, line, left + 2, top + 2 + i * GLYPH_H, ink);
  });
  return top;
}

function drawEmote(ctx: CanvasRenderingContext2D, kind: string, x: number, bottom: number): number {
  const symbol = kind === 'zzz' ? 'Z' : kind === '...' ? '.' : kind;
  const left = Math.round(x - 3);
  const top = bottom - 9;
  rect(ctx, 0, left - 1, top - 1, 8, 9);
  rect(ctx, 1, left, top, 6, 7);
  drawText(ctx, symbol, left + 1, top + 1, kind === '♥' ? 2 : kind === '✉' ? 6 : 0);
  return top;
}

function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  world: World,
  e: World['envelopes'][number],
  now: number,
): void {
  const to = world.people.get(e.toId);
  if (!to) return;
  const t = Math.min(1, (now - e.start) / e.duration);
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const tx = to.x;
  const ty = to.headY;
  const x = e.fromX + (tx - e.fromX) * ease;
  const arc = Math.min(40, Math.abs(tx - e.fromX) * 0.3 + Math.abs(ty - e.fromY) * 0.5 + 12);
  const y = e.fromY + (ty - e.fromY) * ease - Math.sin(Math.PI * t) * arc;
  drawSprite(ctx, makeSprite(ENVELOPE), x, Math.max(STRIP_H + 4, y), false);
}

function drawPoof(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const r = 2 + t * 7;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    rect(ctx, t < 0.5 ? 1 : 15, x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.7, 1, 1);
  }
}
