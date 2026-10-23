import { describe, expect, it } from 'vitest';
import { FEET, FLIGHTS } from './layout.ts';
import { climbY, route } from './nav.ts';

describe('route', () => {
  it('walks straight on the same floor', () => {
    expect(route({ floor: 1, x: 20 }, { floor: 1, x: 200 })).toEqual([{ floor: 1, x: 200, climb: false }]);
  });

  it('climbs the zig-zag stairs to the attic', () => {
    const path = route({ floor: 0, x: 30 }, { floor: 2, x: 220 });
    expect(path).toEqual(
      [
        { floor: 0, x: FLIGHTS[0]!.bottomX, climb: false },
        { floor: 1, x: FLIGHTS[0]!.topX, climb: true },
        { floor: 1, x: FLIGHTS[1]!.bottomX, climb: false },
        { floor: 2, x: FLIGHTS[1]!.topX, climb: true },
        { floor: 2, x: 220, climb: false },
      ].filter(
        (wp, i, all) => i === 0 || wp.climb || wp.x !== all[i - 1]!.x || wp.floor !== all[i - 1]!.floor,
      ),
    );
  });

  it('comes back down', () => {
    const path = route({ floor: 2, x: 220 }, { floor: 0, x: 30 });
    expect(path.at(-1)).toEqual({ floor: 0, x: 30, climb: false });
    expect(path.filter((w) => w.climb).map((w) => w.floor)).toEqual([1, 0]);
  });

  it('interpolates height on the stairs', () => {
    const f = FLIGHTS[0]!;
    expect(climbY(0, f.bottomX, 1, f.topX, f.bottomX)).toBe(FEET[0]);
    expect(climbY(0, f.bottomX, 1, f.topX, f.topX)).toBe(FEET[1]);
  });
});
