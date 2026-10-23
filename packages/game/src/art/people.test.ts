import { describe, expect, it } from 'vitest';
import { FRAMES } from './people.ts';

describe('person frames', () => {
  it('standing and sitting frames are 18 rows so feet stay on the floor', () => {
    for (const [name, frame] of Object.entries(FRAMES)) {
      if (name === 'sleep') continue;
      expect(frame.rows.length, name).toBe(18);
      for (const row of frame.rows) expect(row.length, name).toBe(8);
    }
  });
});
