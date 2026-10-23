/**
 * Decides where a little person should be. A ladder of priorities: outside
 * events come first (a waiting session knocks on the glass), then work, then routines.
 */
import {
  DOZE_SPOTS,
  FEET,
  IDLE_SPOTS,
  MEAL_SPOTS,
  NIGHT_SPOTS,
  SPOTS,
  type SpotId,
  WORK_SPOTS,
} from '../world/layout.ts';
import type { Person } from './person.ts';

export interface Reservations {
  holder(spot: SpotId): string | undefined;
  reserve(spot: SpotId, id: string): void;
  release(spot: SpotId, id: string): void;
}

export interface Clock {
  ms: number;
  date: Date;
  random: () => number;
}

export function isBedtime(p: Person, date: Date): boolean {
  const h = date.getHours();
  const wake = (p.bedtime + 8) % 24;
  return p.bedtime > wake ? h >= p.bedtime || h < wake : h >= p.bedtime && h < wake;
}

function isMealtime(date: Date): boolean {
  const h = date.getHours();
  return (h >= 12 && h < 13) || (h >= 18 && h < 19);
}

function weighted(options: [SpotId, number][], random: () => number): SpotId | null {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let r = random() * total;
  for (const [id, w] of options) {
    r -= w;
    if (r <= 0) return id;
  }
  return options.at(-1)?.[0] ?? null;
}

function free(res: Reservations, spot: SpotId, id: string): boolean {
  const h = res.holder(spot);
  return h === undefined || h === id;
}

function goTo(
  p: Person,
  res: Reservations,
  spot: SpotId,
  reason: NonNullable<Person['spotReason']>,
  until: number,
): void {
  if (p.spot === spot) {
    p.spotReason = reason;
    p.spotUntil = until;
    return;
  }
  if (p.spot) res.release(p.spot, p.id);
  res.reserve(spot, p.id);
  p.spot = spot;
  p.spotReason = reason;
  p.spotUntil = until;
  p.dozing = false;
  const s = SPOTS[spot];
  p.walkTo({ floor: s.floor, x: s.x });
}

function leaveSpot(p: Person, res: Reservations): void {
  if (p.spot) res.release(p.spot, p.id);
  p.spot = null;
  p.spotReason = null;
  p.dozing = false;
  // stand up where we are
  if (!p.moving) p.y = FEET[p.floor];
}

/** Runs one decision for a person who is inside and not in a scripted sequence. */
export function decide(p: Person, res: Reservations, clock: Clock): void {
  if (p.mode !== 'inside' || p.script.length) return;
  const now = clock.ms;

  // 1. Waiting for the human: walk up to the glass and knock.
  if (p.info.status === 'waiting') {
    if (p.pose !== 'knock' || p.spot) {
      leaveSpot(p, res);
      p.path = [];
      p.pose = 'knock';
      p.knockAt = 0;
    }
    return;
  }
  if (p.pose === 'knock') p.pose = 'front';

  // 2. Working.
  const kind = p.workKind;
  if (kind) {
    const candidates = WORK_SPOTS[kind];
    if (candidates) {
      if (p.spot && candidates.includes(p.spot)) {
        p.spotReason = 'work';
        return;
      }
      const target = candidates.find((s) => free(res, s, p.id));
      if (target) {
        goTo(p, res, target, 'work', Number.POSITIVE_INFINITY);
        return;
      }
      // Everything taken: hover near the first spot and think.
      if (!p.moving && p.spotReason !== 'work') {
        leaveSpot(p, res);
        const s = SPOTS[candidates[0]!];
        const offset = (p.info.look % 2 ? 1 : -1) * (14 + (p.info.look % 9));
        p.walkTo({ floor: s.floor, x: s.x + offset });
        p.pose = 'think';
      }
      return;
    }
    // think / speak / subagent: stay where you are; if standing around, strike a thinking pose.
    // Nobody works from bed, though.
    if (p.spot && SPOTS[p.spot].pose === 'sleep') leaveSpot(p, res);
    if (!p.spot && !p.moving) p.pose = 'think';
    if (p.spot && p.spotReason !== 'work') p.spotReason = 'work';
    p.dozing = false;
    return;
  }

  // 3. Idle routines.
  if (p.moving) return;
  if (p.letterPending) {
    const desk = (['typewriter', 'comp2', 'comp1'] as SpotId[]).find((s) => free(res, s, p.id));
    p.letterPending = false;
    if (desk) {
      goTo(p, res, desk, 'letter', now + 9000 + travel(p, desk));
      return;
    }
  }
  if (p.requested && now < p.requested.until && free(res, p.requested.spot, p.id)) {
    const spot = p.requested.spot;
    p.requested = null;
    goTo(p, res, spot, 'request', now + 45_000 + travel(p, spot));
    return;
  }
  if (p.spot && p.spotReason !== 'work' && now < p.spotUntil) {
    if (isBedtime(p, clock.date) && DOZE_SPOTS.has(p.spot) && !p.moving) p.dozing = true;
    return;
  }

  const night = isBedtime(p, clock.date) || p.sick;
  let pool = night ? NIGHT_SPOTS : isMealtime(clock.date) && clock.random() < 0.5 ? MEAL_SPOTS : IDLE_SPOTS;
  pool = pool.filter(([s]) => s !== p.lastIdleSpot && free(res, s, p.id));
  if (!pool.length) pool = IDLE_SPOTS.filter(([s]) => free(res, s, p.id));
  const choice = weighted(pool, clock.random);
  if (!choice) {
    leaveSpot(p, res);
    p.pose = 'front';
    return;
  }
  const sleepy = SPOTS[choice].pose === 'sleep';
  const dwell = sleepy ? 4 * 60_000 + clock.random() * 4 * 60_000 : 18_000 + clock.random() * 32_000;
  p.lastIdleSpot = choice;
  goTo(p, res, choice, 'idle', now + dwell + travel(p, choice));
}

/** Rough walking time to a spot in ms, so dwell time starts on arrival. */
function travel(p: Person, spot: SpotId): number {
  const s = SPOTS[spot];
  const dist = Math.abs(s.x - p.x) + Math.abs(s.floor - p.floor) * 90;
  return (dist / 20) * 1000;
}
