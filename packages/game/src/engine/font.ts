/**
 * Tiny 3×5 pixel font (own design), uppercase like the C64. Cell is 4×6 including spacing.
 * Rendered from per-colour glyph atlases for speed.
 */
import { col } from './palette.ts';

export const GLYPH_W = 4;
export const GLYPH_H = 6;

const G: Record<string, string> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  ' ': '000000000000000',
  '.': '000000000000010',
  ',': '000000000010100',
  '!': '010010010000010',
  '?': '110001010000010',
  "'": '010010000000000',
  '"': '101101000000000',
  '-': '000000111000000',
  '+': '000010111010000',
  ':': '000010000010000',
  ';': '000010000010100',
  '/': '001001010100100',
  '\\': '100100010001001',
  '(': '001010010010001',
  ')': '100010010010100',
  '[': '011010010010011',
  ']': '110010010010110',
  '{': '011010110010011',
  '}': '110010011010110',
  '=': '000111000111000',
  _: '000000000000111',
  '#': '101111101111101',
  '%': '101001010100101',
  '&': '010101010101011',
  '*': '101010111010101',
  '<': '001010100010001',
  '>': '100010001010100',
  '@': '010101111100011',
  $: '011110010011110',
  '^': '010101000000000',
  '~': '000011110000000',
  '`': '100010000000000',
  '|': '010010010010010',
  '▶': '100110111110100',
  '♥': '000101111111010',
  '♪': '011010010110110',
  '✉': '000111111101111',
};

const MAP: Record<string, string> = {
  '…': '...',
  '→': '>',
  '←': '<',
  '—': '-',
  '–': '-',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '•': '*',
  ß: 'SS',
};

/** Uppercases and folds characters to the glyph set. */
export function fold(text: string): string {
  let out = '';
  for (const raw of text.normalize('NFD').replace(/[̀-ͯ]/g, '')) {
    const ch = MAP[raw] ?? raw.toUpperCase();
    for (const c of ch) out += c in G ? c : c === '\t' ? ' ' : c.charCodeAt(0) < 32 ? ' ' : '?';
  }
  return out;
}

const ORDER = Object.keys(G);
const INDEX = new Map(ORDER.map((c, i) => [c, i]));
const atlases = new Map<number, HTMLCanvasElement>();

function atlas(color: number): HTMLCanvasElement {
  let a = atlases.get(color);
  if (a) return a;
  a = document.createElement('canvas');
  a.width = ORDER.length * GLYPH_W;
  a.height = GLYPH_H;
  const ctx = a.getContext('2d')!;
  ctx.fillStyle = col(color);
  ORDER.forEach((c, i) => {
    const bits = G[c]!;
    for (let p = 0; p < 15; p++)
      if (bits[p] === '1') ctx.fillRect(i * GLYPH_W + (p % 3), Math.floor(p / 3), 1, 1);
  });
  atlases.set(color, a);
  return a;
}

/** Draws already-folded or raw text; returns the width drawn. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: number,
): number {
  const a = atlas(color);
  const s = fold(text);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const c of s) {
    const i = INDEX.get(c) ?? INDEX.get('?')!;
    ctx.drawImage(a, i * GLYPH_W, 0, GLYPH_W, GLYPH_H, cx, cy, GLYPH_W, GLYPH_H);
    cx += GLYPH_W;
  }
  return cx - x;
}

export const textWidth = (text: string): number => [...fold(text)].length * GLYPH_W;

/** Word-wraps folded text into lines of at most `cols` characters. */
export function wrap(text: string, cols: number, maxLines = Number.POSITIVE_INFINITY): string[] {
  const words = fold(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    while (word.length > cols) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, cols));
      word = word.slice(cols);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    const last = cut[maxLines - 1]!;
    cut[maxLines - 1] = `${last.slice(0, cols - 3)}...`;
    return cut;
  }
  return lines;
}
