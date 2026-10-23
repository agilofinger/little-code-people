/**
 * The grey strip above the house: shows what the player types, and
 * otherwise types out announcements, requests and letters character by character.
 */
import { drawText, fold, GLYPH_W } from '../engine/font.ts';
import { col } from '../engine/palette.ts';
import { STRIP_H, W } from '../world/layout.ts';

interface Message {
  text: string;
  priority: number;
}

const CHARS_PER_SEC = 32;
const HOLD_MS = 3500;
const SCROLL_PX_PER_SEC = 40;
const MAX_COLS = Math.floor((W - 4) / GLYPH_W);

export class Strip {
  private queue: Message[] = [];
  private current: Message | null = null;
  private startedAt = 0;
  /** Text the player is typing right now, or null. */
  input: string | null = null;

  push(text: string, priority = 1): void {
    const msg = { text: fold(text).replace(/\s+/g, ' ').trim(), priority };
    if (!msg.text) return;
    // Higher priority messages jump the queue; keep the queue short so news stays fresh.
    const idx = this.queue.findIndex((m) => m.priority < priority);
    if (idx === -1) this.queue.push(msg);
    else this.queue.splice(idx, 0, msg);
    if (this.queue.length > 6) this.queue.splice(6);
  }

  private duration(msg: Message): number {
    const typing = (msg.text.length / CHARS_PER_SEC) * 1000;
    const overflow = Math.max(0, msg.text.length - MAX_COLS) * GLYPH_W;
    return typing + (overflow / SCROLL_PX_PER_SEC) * 1000 + HOLD_MS;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.fillStyle = col(12);
    ctx.fillRect(0, 0, W, STRIP_H);
    ctx.fillStyle = col(11);
    ctx.fillRect(0, STRIP_H - 1, W, 1);

    if (this.input !== null) {
      const text = fold(this.input);
      const visible = text.slice(Math.max(0, text.length - (MAX_COLS - 2)));
      const w = drawText(ctx, `>${visible}`, 2, 2, 0);
      if (Math.floor(now / 400) % 2 === 0) {
        ctx.fillStyle = col(0);
        ctx.fillRect(2 + w, 2, 3, 5);
      }
      return;
    }

    if (!this.current || now - this.startedAt > this.duration(this.current)) {
      this.current = this.queue.shift() ?? null;
      this.startedAt = now;
    }
    if (!this.current) {
      drawText(ctx, 'LITTLE CODE PEOPLE', 2, 2, 11);
      return;
    }
    const elapsed = now - this.startedAt;
    const text = this.current.text;
    const typed = Math.min(text.length, Math.floor((elapsed / 1000) * CHARS_PER_SEC));
    const shown = text.slice(0, typed);
    // once typed, long messages scroll left to reveal the end
    const typingDone = (text.length / CHARS_PER_SEC) * 1000;
    const scroll =
      shown.length > MAX_COLS
        ? Math.min(
            (shown.length - MAX_COLS) * GLYPH_W,
            Math.max(0, ((elapsed - typingDone) / 1000) * SCROLL_PX_PER_SEC),
          )
        : 0;
    const start = typed < text.length ? Math.max(0, shown.length - MAX_COLS) : Math.floor(scroll / GLYPH_W);
    drawText(ctx, shown.slice(start, start + MAX_COLS), 2, 2, 0);
  }
}
