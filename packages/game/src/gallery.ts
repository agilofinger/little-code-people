/** Dev-only art gallery (?gallery): the house plus every person frame and critter. */

import {
  appearanceFor,
  CRITTER_FRAMES,
  critterSlots,
  critterSprite,
  FRAMES,
  type FrameName,
  personSprite,
} from './art/people.ts';
import { drawText } from './engine/font.ts';
import { drawSprite } from './engine/sprite.ts';
import { HouseRenderer } from './world/house-render.ts';
import { FEET, H, SPOTS, W } from './world/layout.ts';
import { THEME_CHOICES, type ThemeChoice, themeFor } from './world/season.ts';

export function gallery(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H * 2;
  canvas.style.cssText = `width:${W * 4}px;height:${H * 8}px;image-rendering:pixelated;display:block;margin:auto;background:#000`;
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const house = new HouseRenderer();
  const now = new Date();
  now.setHours(12);
  // ?gallery&theme=christmas shows the house in that theme's decorations
  const choice = new URLSearchParams(location.search).get('theme') as ThemeChoice | null;
  const theme = themeFor(now, choice && THEME_CHOICES.includes(choice) ? choice : 'off');
  house.drawBack(ctx, {
    now,
    tick: 0,
    occupied: new Set(Object.keys(SPOTS) as never),
    door: 0,
    fireLit: true,
    unreadLetters: true,
    theme,
    ringing: false,
  });
  // a person at every spot
  let i = 0;
  for (const spot of Object.values(SPOTS)) {
    const app = appearanceFor(i * 2654435761);
    const frame: FrameName =
      spot.pose === 'type' || spot.pose === 'piano' || spot.pose === 'cards'
        ? 'type1'
        : spot.pose === 'sit'
          ? 'sit'
          : spot.pose === 'read'
            ? 'read'
            : spot.pose === 'phone'
              ? 'phone'
              : spot.pose === 'drink'
                ? 'drink'
                : spot.pose === 'hold'
                  ? 'hold1'
                  : spot.pose === 'dance'
                    ? 'armsUp'
                    : spot.pose === 'exercise'
                      ? 'armsUp'
                      : spot.pose === 'brush'
                        ? 'brush1'
                        : spot.pose === 'sleep'
                          ? 'sleep'
                          : 'front';
    const s = personSprite(app, frame, 'happy');
    const y = frame === 'sleep' ? FEET[spot.floor] - 6 + (spot.dy ?? 0) : FEET[spot.floor] + (spot.dy ?? 0);
    drawSprite(ctx, s, spot.x, y, spot.facing === -1);
    i++;
  }
  house.drawFront(ctx, {
    now,
    tick: 0,
    occupied: new Set(['shower'] as never),
    door: 0,
    fireLit: true,
    unreadLetters: true,
    theme,
    ringing: false,
  });

  // frames row below
  ctx.fillStyle = '#222';
  ctx.fillRect(0, H, W, H);
  const names = Object.keys(FRAMES) as FrameName[];
  names.forEach((name, n) => {
    const x = 12 + (n % 13) * 24;
    const y = H + 34 + Math.floor(n / 13) * 40;
    drawSprite(ctx, personSprite(appearanceFor(n * 7919 + 3), name, n % 4 === 3 ? 'sad' : 'happy'), x, y);
    drawText(ctx, name.slice(0, 6), x - 10, y + 2, 15);
  });
  for (let look = 0; look < 5; look++) {
    for (const mood of ['happy', 'content', 'sad', 'sick'] as const) {
      const x = 12 + (look * 4 + ['happy', 'content', 'sad', 'sick'].indexOf(mood)) * 15;
      drawSprite(ctx, personSprite(appearanceFor(look + 5 * 11), 'front', mood), x, H + 140);
    }
  }
  (['kid', 'cat', 'dog'] as const).forEach((kind, k) => {
    for (let fr = 0; fr < 2; fr++)
      drawSprite(
        ctx,
        critterSprite(kind, 'walk', fr, critterSlots(kind, k + 3)),
        30 + k * 60 + fr * 22,
        H + 180,
      );
    drawSprite(ctx, critterSprite(kind, 'sit', 0, critterSlots(kind, k + 3)), 74 + k * 60, H + 180);
  });
  drawText(ctx, 'LITTLE CODE PEOPLE - ART GALLERY', 4, H + 190, 7);
  void CRITTER_FRAMES;
}
