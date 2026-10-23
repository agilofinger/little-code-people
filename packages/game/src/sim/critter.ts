/**
 * Helpers (subagents) appear as little kids, cats and dogs that scamper around the house on
 * their errand and run back to their parent when it is done.
 */
import { type CritterKind, fnv1a } from '@lcp/protocol';
import { critterSlots } from '../art/people.ts';
import type { Slots } from '../engine/sprite.ts';
import { FEET, type Floor, INSIDE, STAIRWELL } from '../world/layout.ts';
import { climbY, type Pos, route, type Waypoint } from '../world/nav.ts';

const SPEED: Record<CritterKind, number> = { kid: 34, cat: 44, dog: 50 };

export class Critter {
  readonly slots: Slots;
  floor: Floor;
  x: number;
  y: number;
  facing: 1 | -1 = 1;
  path: Waypoint[] = [];
  private legStart: Pos;
  restUntil = 0;
  state: 'wander' | 'return' | 'gone' = 'wander';
  readonly bornAt: number;

  constructor(
    readonly id: string,
    readonly parentId: string,
    readonly kind: CritterKind,
    readonly label: string,
    at: Pos,
    now: number,
  ) {
    this.slots = critterSlots(kind, fnv1a(id));
    this.floor = at.floor;
    this.x = at.x;
    this.y = FEET[at.floor];
    this.legStart = at;
    this.bornAt = now;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  goTo(to: Pos): void {
    this.path = route({ floor: this.floor, x: this.x }, to);
    this.legStart = { floor: this.floor, x: this.x };
  }

  update(dt: number, now: number, random: () => number, parent: Pos | null): void {
    if (this.state === 'return') {
      if (!parent) {
        this.state = 'gone';
        return;
      }
      if (this.floor === parent.floor && Math.abs(this.x - parent.x) < 5) {
        this.state = 'gone';
        return;
      }
      const last = this.path.at(-1);
      if (!last || last.floor !== parent.floor || Math.abs(last.x - parent.x) > 6) this.goTo(parent);
    } else if (!this.moving && now > this.restUntil) {
      if (random() < 0.35) {
        this.restUntil = now + 1000 + random() * 2500;
      } else {
        const floor = Math.floor(random() * 3) as Floor;
        let x = INSIDE.left + random() * (INSIDE.right - INSIDE.left);
        if (x > STAIRWELL.left && x < STAIRWELL.right && floor < 2) x = STAIRWELL.right + 10;
        // stay mostly on the parent's floor
        this.goTo({ floor: random() < 0.6 && parent ? parent.floor : floor, x });
      }
    }
    this.move(dt * (this.state === 'return' ? 1.4 : 1));
  }

  private move(dt: number): void {
    const wp = this.path[0];
    if (!wp) return;
    const speed = SPEED[this.kind] * (wp.climb ? 0.7 : 1);
    const dx = wp.x - this.x;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    if (Math.abs(dx) <= speed * dt) {
      this.x = wp.x;
      this.floor = wp.floor;
      this.y = FEET[wp.floor];
      this.path.shift();
      this.legStart = { floor: this.floor, x: this.x };
      return;
    }
    this.x += Math.sign(dx) * speed * dt;
    this.y = wp.climb
      ? climbY(this.legStart.floor, this.legStart.x, wp.floor, wp.x, this.x)
      : FEET[this.floor];
  }
}
