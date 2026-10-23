/**
 * One little person = one Claude Code session. Movement, poses, moods and what they say.
 * Decisions about *where* to go live in brain.ts; choreography (arrive, leave) in world.ts.
 */
import type { Activity, ActivityKind, LogEntry, SessionInfo } from '@lcp/protocol';
import { type Appearance, appearanceFor, type FrameName, type Mood } from '../art/people.ts';
import { wrap } from '../engine/font.ts';
import { plain } from '../engine/plain.ts';
import { FEET, type Floor, type Pose, SPOTS, type SpotId } from '../world/layout.ts';
import { climbY, type Pos, route, type Waypoint } from '../world/nav.ts';

export type Mode = 'arriving' | 'inside' | 'leaving' | 'queued' | 'gone';

export type Step =
  | { kind: 'walk'; to: Pos }
  | { kind: 'wait'; seconds: number; pose?: Pose }
  | { kind: 'do'; fn: () => void };

export interface Balloon {
  lines: string[];
  color: number;
  until: number;
  shownAt: number;
}

export type Emote = '!' | '?' | '✉' | '♥' | '♪' | 'zzz' | '...';

const WALK_SPEED = 22; // px/s, calm and unhurried
const CLIMB_SPEED = 14;
const LOG_KEEP = 250;

export class Person {
  readonly id: string;
  info: SessionInfo;
  app: Appearance;
  /** Voice pitch for gibberish speech, stable per person. */
  readonly voice: number;
  /** Hour this person goes to bed (22, 23 or 0), rolled per person. */
  readonly bedtime: number;

  mode: Mode = 'inside';
  floor: Floor = 0;
  x = 0;
  y: number = FEET[0];
  facing: 1 | -1 = 1;
  /** Current pose when not walking. */
  pose: Pose = 'stand';
  carrying = false;
  dozing = false;

  path: Waypoint[] = [];
  private legStart: Pos | null = null;
  script: Step[] = [];
  private waitUntil = 0;
  private stepStarted = false;

  spot: SpotId | null = null;
  spotUntil = 0;
  spotReason: 'work' | 'idle' | 'letter' | 'request' | null = null;
  lastIdleSpot: SpotId | null = null;
  requested: { spot: SpotId; until: number } | null = null;

  mood = 1;
  private moodAt = 0;

  /** Latest raw activity from the bridge, and the debounced one the brain acts on. */
  rawActivity: Activity | null = null;
  activity: Activity | null = null;
  private activitySwitchAt = 0;

  balloon: Balloon | null = null;
  private balloonQueue: Omit<Balloon, 'until' | 'shownAt'>[] = [];
  emote: { kind: Emote; until: number } | null = null;
  nodUntil = 0;
  knockAt = 0;

  thinking: { text: string; at: number } | null = null;
  letterPending = false;
  log: LogEntry[] = [];

  constructor(info: SessionInfo) {
    this.id = info.id;
    this.info = info;
    this.app = appearanceFor(info.look);
    this.voice = 180 + (info.look % 7) * 30;
    this.bedtime = [22, 23, 0][info.look % 3]!;
  }

  get name(): string {
    return this.info.name;
  }

  get moodName(): Mood {
    if (this.mood >= 3) return 'happy';
    if (this.mood >= 0) return 'content';
    if (this.mood >= -3) return 'sad';
    return 'sick';
  }

  get sick(): boolean {
    return this.moodName === 'sick';
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  get busy(): boolean {
    return this.info.status === 'busy' || this.info.status === 'shell';
  }

  /** Effective activity kind for the brain; 'shell' status always means the computer. */
  get workKind(): ActivityKind | null {
    if (this.info.status === 'shell') return 'shell';
    if (!this.busy) return null;
    return this.activity?.kind ?? 'think';
  }

  get isThinking(): boolean {
    return this.busy && this.activity?.kind === 'think';
  }

  /** Head position (for balloons and clicks). */
  get headY(): number {
    const sitting =
      this.pose === 'sit' ||
      this.pose === 'type' ||
      this.pose === 'piano' ||
      this.pose === 'cards' ||
      this.pose === 'read' ||
      this.pose === 'sitFront';
    if (this.pose === 'sleep' && !this.moving) return this.y - 10;
    return this.y - (sitting && !this.moving ? 17 : 21);
  }

  place(pos: Pos): void {
    this.floor = pos.floor;
    this.x = pos.x;
    this.y = FEET[pos.floor];
    this.path = [];
    this.legStart = null;
  }

  walkTo(to: Pos): void {
    this.path = route({ floor: this.floor, x: this.x }, to);
    this.legStart = { floor: this.floor, x: this.x };
    this.dozing = false;
  }

  /** Teleports onto a spot (used when the house loads with people already home). */
  settleAt(spot: SpotId): void {
    const s = SPOTS[spot];
    this.place({ floor: s.floor, x: s.x });
    this.spot = spot;
    this.arriveAtSpot();
  }

  arriveAtSpot(): void {
    if (!this.spot) return;
    const s = SPOTS[this.spot];
    this.pose = s.pose;
    this.facing = s.facing;
    this.y = FEET[s.floor] + (s.dy ?? 0);
  }

  // ------------------------------------------------------------------ events from the bridge
  setActivity(a: Activity, now: number): void {
    this.rawActivity = a;
    // Promote immediately when not sitting at a work spot; otherwise debounce.
    if (!this.activity || this.spotReason !== 'work' || now - this.activitySwitchAt > 4000) {
      this.activity = a;
      this.activitySwitchAt = now;
    }
  }

  /** Called every frame: promotes a raw activity that has been stable for a while. */
  settleActivity(now: number): void {
    const raw = this.rawActivity;
    if (!raw || raw === this.activity) return;
    if (now - this.activitySwitchAt > 4000 && now - raw.at > 1200) {
      this.activity = raw;
      this.activitySwitchAt = now;
    }
  }

  addLog(entry: LogEntry): void {
    this.log.push(entry);
    if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
    if (entry.kind === 'thinking') this.thinking = { text: entry.text, at: entry.at };
  }

  changeMood(delta: number, now: number): void {
    this.mood = Math.max(-5, Math.min(5, this.mood + delta));
    this.moodAt = now;
  }

  say(text: string, color: number, now: number): void {
    const lines = wrap(plain(text), 26, 3);
    if (!lines.length) return;
    const b = { lines, color };
    if (!this.balloon || now - this.balloon.shownAt > 2500) this.showBalloon(b, now);
    else {
      this.balloonQueue.push(b);
      if (this.balloonQueue.length > 2) this.balloonQueue.shift();
    }
  }

  private showBalloon(b: Omit<Balloon, 'until' | 'shownAt'>, now: number): void {
    const chars = b.lines.join('').length;
    this.balloon = { ...b, shownAt: now, until: now + Math.min(9000, Math.max(3500, 2000 + chars * 60)) };
  }

  setEmote(kind: Emote, seconds: number, now: number): void {
    this.emote = { kind, until: now + seconds * 1000 };
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt: number, now: number): void {
    this.settleActivity(now);
    if (this.balloon && now > this.balloon.until) {
      this.balloon = null;
      const next = this.balloonQueue.shift();
      if (next) this.showBalloon(next, now);
    }
    if (this.emote && now > this.emote.until) this.emote = null;
    // mood drifts back to content over time
    if (now - this.moodAt > 90_000 && this.mood !== 1) {
      this.mood += Math.sign(1 - this.mood);
      this.moodAt = now;
    }
    this.move(dt);
    this.runScript(now);
  }

  private move(dt: number): void {
    const wp = this.path[0];
    if (!wp) return;
    const speed = (wp.climb ? CLIMB_SPEED : WALK_SPEED) * (this.sick ? 0.5 : 1);
    const dx = wp.x - this.x;
    const step = speed * dt;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    if (Math.abs(dx) <= step) {
      this.x = wp.x;
      this.floor = wp.floor;
      this.y = FEET[wp.floor];
      this.path.shift();
      this.legStart = { floor: this.floor, x: this.x };
      if (!this.path.length && this.spot && this.mode === 'inside') this.arriveAtSpot();
      return;
    }
    this.x += Math.sign(dx) * step;
    if (wp.climb && this.legStart)
      this.y = climbY(this.legStart.floor, this.legStart.x, wp.floor, wp.x, this.x);
    else this.y = FEET[this.floor];
  }

  private runScript(now: number): void {
    while (this.script.length) {
      const step = this.script[0]!;
      if (step.kind === 'walk') {
        if (!this.stepStarted) {
          this.stepStarted = true;
          this.walkTo(step.to);
        }
        if (this.path.length) return;
        this.stepStarted = false;
        this.script.shift();
      } else if (step.kind === 'wait') {
        if (this.waitUntil === 0) {
          this.waitUntil = now + step.seconds * 1000;
          if (step.pose) this.pose = step.pose;
        }
        if (now < this.waitUntil) return;
        this.waitUntil = 0;
        this.script.shift();
      } else {
        this.script.shift();
        step.fn();
      }
    }
  }

  // ------------------------------------------------------------------ rendering helpers
  frame(tick8: number): { frame: FrameName; flip: boolean } {
    const flip = this.facing === -1;
    if (this.moving) {
      const cycle: FrameName[] = ['walk1', 'walk2', 'walk3', 'walk2'];
      return { frame: cycle[tick8 % 4]!, flip };
    }
    if (tick8 < this.nodUntil) return { frame: tick8 % 2 ? 'armsDown' : 'front', flip: false };
    const alt = (a: FrameName, b: FrameName, rate = 1) => ((tick8 >> rate) % 2 ? b : a);
    switch (this.pose) {
      case 'stand':
        return { frame: 'stand', flip };
      case 'front':
        return { frame: 'front', flip: false };
      case 'sit':
        return { frame: 'sit', flip };
      case 'sitFront':
        return { frame: 'sitFront', flip: false };
      case 'type':
        return { frame: this.dozing ? 'sit' : alt('type1', 'type2', 0), flip };
      case 'piano':
        return { frame: (tick8 * 7) % 5 < 2 ? 'type2' : 'type1', flip };
      case 'cards':
        return { frame: tick8 % 16 < 3 ? 'type1' : 'sit', flip };
      case 'read':
        return { frame: this.dozing ? 'sit' : 'read', flip };
      case 'phone':
        return { frame: 'phone', flip };
      case 'drink':
        return { frame: tick8 % 24 < 8 ? 'drink' : 'stand', flip };
      case 'hold':
        return { frame: alt('hold1', 'hold2', 2), flip: false };
      case 'dance':
        return { frame: alt('armsUp', 'armsDown', 1), flip: false };
      case 'exercise':
        return { frame: alt('armsUp', 'front', 1), flip: false };
      case 'brush':
        return { frame: alt('brush1', 'brush2', 0), flip: false };
      case 'sleep':
        return { frame: 'sleep', flip: false };
      case 'knock':
        return { frame: tick8 % 12 < 6 ? alt('knock1', 'knock2', 0) : 'front', flip: false };
      case 'wave':
        return { frame: alt('wave1', 'wave2', 1), flip: false };
      case 'think':
        return { frame: 'think', flip: false };
      case 'shower':
        return { frame: 'front', flip: false };
    }
  }

  /** Bobbing offsets for lively poses (dance, exercise, nod). */
  bob(tick8: number): number {
    if (this.moving) return 0;
    if (this.pose === 'dance') return (tick8 >> 1) % 2;
    if (this.pose === 'exercise') return (tick8 >> 1) % 2 ? -1 : 0;
    return 0;
  }
}
