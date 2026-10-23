/**
 * The thought cloud: click a person to look into their head. On top, what they are thinking
 * right now. Most thinking blocks are stored without text; then the cloud cycles through funny
 * stand-ins. Below, the last thing they said, in full and scrollable, which is usually the most
 * useful part.
 */
import type { LogEntry } from '@lcp/protocol';
import { drawText, GLYPH_H, GLYPH_W, wrap } from '../engine/font.ts';
import { col } from '../engine/palette.ts';
import { plain } from '../engine/plain.ts';
import type { Person } from '../sim/person.ts';
import { STRIP_H, W } from '../world/layout.ts';

export const FUNNY_THOUGHTS = [
  'thinking cryptic ai stuff',
  'recycling thoughts',
  'burning tokens',
  'consulting the latent space',
  'reticulating splines',
  'asking the rubber duck',
  'counting attention heads',
  'defragmenting brain cells',
  'warming up the gpus',
  'rummaging through embeddings',
  'pondering the orb',
  'untangling spaghetti code',
  'brewing a fresh idea',
  'looking for a missing semicolon',
  'doing very important math',
  'staring into the context window',
  'shuffling tokens around',
  'polishing a clever plan',
  'humming the sid chip theme',
  'arguing with itself (politely)',
];

const COLS = 46;
const ROWS = 11;
const BOX_W = COLS * GLYPH_W + 10;
const BOX_H = (ROWS + 2) * GLYPH_H + 8;
const FUNNY_MS = 2600;

const INK = { thought: 6, funny: 4, label: 11, said: 0, none: 12 } as const;

export interface MindLine {
  text: string;
  color: number;
}

/** Wraps text but keeps its line breaks, collapsing runs of blank lines to one. */
function paragraphs(text: string, color: number): MindLine[] {
  const out: MindLine[] = [];
  for (const raw of plain(text).split('\n')) {
    if (!raw.trim()) {
      if (out.length && out.at(-1)!.text) out.push({ text: '', color });
      continue;
    }
    for (const line of wrap(raw, COLS)) out.push({ text: line, color });
  }
  while (out.length && !out.at(-1)!.text) out.pop();
  return out;
}

function lastSaid(p: Person): LogEntry | undefined {
  return p.log.findLast((e) => e.kind === 'speech' && e.text.trim());
}

export function headerFor(p: Person): string {
  if (p.isThinking) return `${p.name} IS THINKING...`;
  if (p.info.status === 'waiting') return `${p.name} IS WAITING FOR YOU`;
  if (p.busy) return `${p.name} IS WORKING...`;
  return `${p.name} IS RELAXING`;
}

/** Everything the cloud shows, top to bottom. `sinceOpen` drives the funny stand-in. */
export function mindLines(p: Person, sinceOpen: number): MindLine[] {
  const out: MindLine[] = [];
  const said = lastSaid(p);
  if (p.isThinking) {
    // A thought in progress is not written down yet; an older one would be misleading.
    const fresh = p.thinking && p.thinking.at >= (p.activity?.at ?? 0) - 500;
    const text = fresh ? p.thinking!.text.trim() : '';
    if (text) out.push(...paragraphs(text, INK.thought));
    else {
      const i = Math.floor(sinceOpen / FUNNY_MS);
      const phrase = `${FUNNY_THOUGHTS[(p.info.look + i) % FUNNY_THOUGHTS.length]}...`;
      const typed = Math.min(phrase.length, Math.floor((sinceOpen % FUNNY_MS) / 45));
      out.push({ text: phrase.slice(0, typed), color: INK.funny });
    }
    out.push({ text: '', color: INK.label });
  } else if (!said && p.thinking?.text.trim()) {
    out.push({ text: 'LAST THOUGHT:', color: INK.label });
    out.push(...paragraphs(p.thinking.text, INK.thought));
    return out;
  }
  if (said) {
    out.push({ text: said.final ? 'LAST ANSWER:' : 'LAST SAID:', color: INK.label });
    out.push(...paragraphs(said.text, INK.said));
  } else {
    out.push({ text: 'HAS NOT SAID ANYTHING YET.', color: INK.none });
  }
  return out;
}

export class ThoughtCloud {
  personId: string | null = null;
  /** First visible line. */
  private scroll = 0;
  private total = 0;
  private openedAt = 0;
  /** Screen rectangle of the open cloud (for clicks). */
  box = { x: 0, y: 0, w: BOX_W, h: BOX_H };

  open(p: Person, now: number): void {
    this.personId = p.id;
    this.scroll = 0;
    this.openedAt = now;
  }

  close(): void {
    this.personId = null;
  }

  /** Scrolls by lines; positive is down. */
  scrollBy(lines: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + lines));
  }

  private get maxScroll(): number {
    return Math.max(0, this.total - ROWS);
  }

  contains(x: number, y: number): boolean {
    return (
      this.personId !== null &&
      x >= this.box.x &&
      x < this.box.x + this.box.w &&
      y >= this.box.y &&
      y < this.box.y + this.box.h
    );
  }

  draw(ctx: CanvasRenderingContext2D, p: Person | undefined, now: number): void {
    if (!p || !this.personId) return;
    const lines = mindLines(p, now - this.openedAt);
    this.total = lines.length;
    this.scroll = Math.min(this.scroll, this.maxScroll);

    // place the cloud above the person, kept on screen
    const x = Math.round(Math.max(2, Math.min(W - BOX_W - 2, p.x - BOX_W / 2)));
    const above = p.headY - BOX_H - 14;
    const y = Math.round(above >= STRIP_H + 2 ? above : Math.min(p.y + 6, 200 - BOX_H - 2));
    this.box = { x, y, w: BOX_W, h: BOX_H };

    // puffy outline
    ctx.fillStyle = col(0);
    ctx.fillRect(x - 1, y + 2, BOX_W + 2, BOX_H - 4);
    ctx.fillRect(x + 2, y - 1, BOX_W - 4, BOX_H + 2);
    ctx.fillStyle = col(1);
    ctx.fillRect(x, y + 2, BOX_W, BOX_H - 4);
    ctx.fillRect(x + 2, y, BOX_W - 4, BOX_H);
    for (let bx = x + 6; bx < x + BOX_W - 6; bx += 10) {
      ctx.fillRect(bx, y - 2, 6, 2);
      ctx.fillRect(bx + 3, y + BOX_H, 6, 2);
    }
    // little bubbles towards the head
    const by = above >= STRIP_H + 2 ? y + BOX_H + 3 : y - 5;
    const dir = above >= STRIP_H + 2 ? 1 : -1;
    ctx.fillRect(Math.round(p.x - 2), by, 4, 3);
    ctx.fillRect(Math.round(p.x), by + dir * 5, 2, 2);

    drawText(ctx, headerFor(p), x + 4, y + 4, 6);
    drawText(ctx, 'X', x + BOX_W - 8, y + 4, 2);
    ctx.fillStyle = col(15);
    ctx.fillRect(x + 4, y + 4 + GLYPH_H, BOX_W - 8, 1);

    const top = y + 6 + GLYPH_H;
    lines.slice(this.scroll, this.scroll + ROWS).forEach((line, i) => {
      drawText(ctx, line.text, x + 4, top + i * GLYPH_H, line.color);
    });

    // scroll bar when the text is longer than the cloud
    if (this.total > ROWS) {
      const trackH = ROWS * GLYPH_H - 2;
      const thumbH = Math.max(4, Math.round((trackH * ROWS) / this.total));
      const thumbY = Math.round(((trackH - thumbH) * this.scroll) / this.maxScroll);
      ctx.fillStyle = col(15);
      ctx.fillRect(x + BOX_W - 4, top, 1, trackH);
      ctx.fillStyle = col(11);
      ctx.fillRect(x + BOX_W - 5, top + thumbY, 3, thumbH);
    }
  }
}
