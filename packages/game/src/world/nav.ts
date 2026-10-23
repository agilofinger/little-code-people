/**
 * Navigation: a position is (floor, x). Floors are linked by stair flights, so routes are a
 * short list of waypoints — walk to the flight, climb, continue.
 */
import { FEET, FLIGHTS, type Floor } from './layout.ts';

export interface Pos {
  floor: Floor;
  x: number;
}

export interface Waypoint extends Pos {
  /** True when this leg is a climb from the previous floor. */
  climb: boolean;
}

export function route(from: Pos, to: Pos): Waypoint[] {
  const path: Waypoint[] = [];
  let floor = from.floor;
  while (floor !== to.floor) {
    if (to.floor > floor) {
      const flight = FLIGHTS.find((f) => f.from === floor)!;
      path.push({ floor, x: flight.bottomX, climb: false });
      floor = (floor + 1) as Floor;
      path.push({ floor, x: flight.topX, climb: true });
    } else {
      const flight = FLIGHTS.find((f) => f.from === floor - 1)!;
      path.push({ floor, x: flight.topX, climb: false });
      floor = (floor - 1) as Floor;
      path.push({ floor, x: flight.bottomX, climb: true });
    }
  }
  path.push({ floor: to.floor, x: to.x, climb: false });
  // Drop zero-length legs.
  return path.filter((wp, i) => {
    const prev = i === 0 ? from : path[i - 1]!;
    return wp.climb || wp.floor !== prev.floor || Math.abs(wp.x - prev.x) > 0.5;
  });
}

/** y of the feet while climbing from floor `a` (at xa) to floor `b` (at xb), at position x. */
export function climbY(a: Floor, xa: number, b: Floor, xb: number, x: number): number {
  const t = xa === xb ? 1 : Math.min(1, Math.max(0, (x - xa) / (xb - xa)));
  return FEET[a] + (FEET[b] - FEET[a]) * t;
}

/** Total walking distance of a route (for estimating travel time). */
export function routeLength(from: Pos, path: Waypoint[]): number {
  let len = 0;
  let prev: Pos = from;
  for (const wp of path) {
    len += Math.abs(wp.x - prev.x) + (wp.climb ? 48 : 0);
    prev = wp;
  }
  return len;
}
