/**
 * The world: everyone in (and in front of) the house. Applies bridge events, runs the
 * arrival / departure choreography, enforces the 10-person limit with a doorstep queue,
 * and keeps letters, envelopes and helper critters.
 */
import type { LogEntry, ServerEvent, SessionInfo, SessionSnapshot, Subagent } from '@lcp/protocol';
import { withShirt } from '../art/people.ts';
import { DOOR, OUTSIDE_RIGHT, QUEUE_X, SPOTS, type SpotId } from '../world/layout.ts';
import { decide, type Reservations } from './brain.ts';
import { Critter } from './critter.ts';
import { Person } from './person.ts';

export const CAPACITY = 10;
export const MAX_VISIBLE_CRITTERS = 6;

export type SfxName = 'doorbell' | 'door' | 'knock' | 'voice' | 'whoosh' | 'mail' | 'poof' | 'phone';

export interface Letter {
  id: string;
  from: string;
  fromId: string;
  text: string;
  at: number;
  read: boolean;
}

export interface WorldHooks {
  sfx(name: SfxName, opts?: { x?: number; pitch?: number }): void;
  /** Short text for the strip at the top of the screen. */
  announce(text: string): void;
  /** Important events: strip, printer log and (if allowed) a desktop notification. */
  notify(title: string, body: string): void;
  /** A user prompt to show in the strip, typed out like a command line. */
  typed(name: string, text: string): void;
  log(entry: LogEntry, person: Person): void;
  letter(letter: Letter): void;
  roster(): void;
}

export interface Envelope {
  fromX: number;
  fromY: number;
  toId: string;
  start: number;
  duration: number;
}

export interface Poof {
  x: number;
  y: number;
  start: number;
}

export class World implements Reservations {
  readonly people = new Map<string, Person>();
  readonly critters = new Map<string, Critter>();
  readonly queue: string[] = [];
  readonly letters: Letter[] = [];
  readonly envelopes: Envelope[] = [];
  readonly poofs: Poof[] = [];
  private readonly spots = new Map<SpotId, string>();
  private readonly decidedAt = new Map<string, number>();
  private readonly knocks = new Map<string, number>();
  door = 0;
  private doorWasOpen = false;
  ringingUntil = 0;
  private nextArrivalAt = 0;
  private full = false;
  private initialized = false;
  now = 0;
  random: () => number = Math.random;
  date: () => Date = () => new Date();

  constructor(private readonly hooks: WorldHooks) {}

  // ------------------------------------------------------------------ reservations
  holder(spot: SpotId): string | undefined {
    return this.spots.get(spot);
  }
  reserve(spot: SpotId, id: string): void {
    this.spots.set(spot, id);
  }
  release(spot: SpotId, id: string): void {
    if (this.spots.get(spot) === id) this.spots.delete(spot);
  }
  /** Spots whose person has actually arrived (for animations like the TV or the fire). */
  occupied(): Set<SpotId> {
    const out = new Set<SpotId>();
    for (const [spot, id] of this.spots) {
      const p = this.people.get(id);
      if (p && !p.moving && p.spot === spot && p.mode === 'inside') out.add(spot);
    }
    return out;
  }

  // ------------------------------------------------------------------ counts
  get residents(): Person[] {
    return [...this.people.values()].filter(
      (p) => p.mode === 'inside' || p.mode === 'arriving' || p.mode === 'leaving',
    );
  }

  private hasRoom(): boolean {
    return this.residents.length < CAPACITY;
  }

  // ------------------------------------------------------------------ events
  apply(event: ServerEvent): void {
    switch (event.type) {
      case 'hello':
        this.hello(event.sessions);
        return;
      case 'session.joined':
        if (this.people.has(event.session.id)) this.updateInfo(event.session);
        else this.join(event.session, false);
        return;
      case 'session.updated':
        this.updateInfo(event.session);
        return;
      case 'session.left':
        this.leave(event.id);
        return;
      case 'session.activity': {
        const p = this.people.get(event.id);
        if (!p) return;
        p.setActivity(event.activity, this.now);
        if (event.activity.kind === 'subagent') p.setEmote('♪', 1.5, this.now);
        return;
      }
      case 'session.log':
        this.logEntry(event.entry, true);
        return;
      case 'session.mood': {
        const p = this.people.get(event.id);
        if (!p) return;
        p.changeMood(event.delta, this.now);
        if (event.delta > 0) p.setEmote('♥', 2, this.now);
        return;
      }
      case 'session.message':
        this.sendEnvelope(event.from, event.to);
        return;
      case 'subagent.started':
        this.spawnCritter(event.parentId, event.subagent, true);
        return;
      case 'subagent.finished': {
        const c = this.critters.get(event.subagentId);
        if (c) c.state = 'return';
        return;
      }
    }
  }

  private hello(sessions: SessionSnapshot[]): void {
    const seen = new Set(sessions.map((s) => s.id));
    for (const p of this.people.values()) if (!seen.has(p.id)) this.leave(p.id);
    const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
    for (const s of sorted) {
      if (this.people.has(s.id)) {
        this.updateInfo(s);
        continue;
      }
      this.join(s, !this.initialized);
    }
    this.initialized = true;
    // print the recent history of everyone, oldest first, so the printer is not empty
    const history = sessions
      .flatMap((s) => s.log)
      .sort((a, b) => a.at - b.at)
      .slice(-200);
    for (const entry of history) {
      const p = this.people.get(entry.sessionId);
      if (p) this.hooks.log(entry, p);
    }
    this.hooks.roster();
  }

  /**
   * Removes these sessions at once, without the leaving choreography: people, their place in the
   * queue, helpers, envelopes and letters. Used when the demo makes way for real sessions.
   */
  forget(ids: ReadonlySet<string>): void {
    const drop = <T>(list: T[], hit: (item: T) => boolean) => {
      // in place: the mailbox shares the letters array
      for (let i = list.length - 1; i >= 0; i--) if (hit(list[i]!)) list.splice(i, 1);
    };
    for (const id of ids) this.people.delete(id);
    for (const c of this.critters.values()) if (ids.has(c.parentId)) this.critters.delete(c.id);
    drop(this.queue, (id) => ids.has(id));
    drop(this.envelopes, (e) => ids.has(e.toId));
    drop(this.letters, (l) => ids.has(l.fromId));
    this.hooks.roster();
  }

  private join(s: SessionSnapshot, alreadyHome: boolean): void {
    const room = this.hasRoom();
    const p = new Person(stripSnapshot(s));
    this.people.set(p.id, p);
    for (const entry of s.log) p.addLog(entry);
    // earlier letters go into the mailbox as already read
    for (const entry of s.log.filter((e) => e.kind === 'speech' && e.final).slice(-3)) {
      this.letters.push({
        id: entry.uid,
        from: p.name,
        fromId: p.id,
        text: entry.text,
        at: entry.at,
        read: true,
      });
    }
    this.letters.sort((a, b) => b.at - a.at);
    if (s.activity) {
      p.rawActivity = s.activity;
      p.activity = s.activity;
    }
    if (room) {
      if (alreadyHome) this.settle(p);
      else this.arrive(p);
    } else {
      this.enqueue(p, alreadyHome);
    }
    for (const sub of s.subagents) this.spawnCritter(p.id, sub, false);
    this.hooks.roster();
  }

  private settle(p: Person): void {
    p.mode = 'inside';
    decide(p, this, { ms: this.now, date: this.date(), random: this.random });
    if (p.spot) {
      p.settleAt(p.spot);
    } else {
      const spots = Object.values(SPOTS);
      const s = spots[Math.floor(this.random() * spots.length)]!;
      p.place({ floor: s.floor, x: s.x + 8 });
      p.pose = 'front';
    }
    this.decidedAt.set(p.id, this.now);
  }

  private ring(): void {
    this.ringingUntil = this.now + 1400;
    this.hooks.sfx('doorbell', { x: DOOR.x });
  }

  private arrive(p: Person): void {
    p.mode = 'arriving';
    p.place({ floor: 0, x: OUTSIDE_RIGHT });
    p.carrying = true;
    const delay = Math.max(0, this.nextArrivalAt - this.now) / 1000;
    this.nextArrivalAt = Math.max(this.now, this.nextArrivalAt) + 5000;
    p.script = [
      { kind: 'wait', seconds: delay, pose: 'stand' },
      { kind: 'walk', to: { floor: 0, x: DOOR.step } },
      ...this.entering(p, true),
    ];
  }

  /** Ring (twice on first arrival), door opens, step in, look around. */
  private entering(p: Person, twice: boolean): Person['script'] {
    return [
      {
        kind: 'do',
        fn: () => {
          p.facing = -1;
          this.ring();
          this.hooks.announce(`DING DONG! ${p.name} IS AT THE DOOR`);
        },
      },
      { kind: 'wait', seconds: 1.2, pose: 'stand' },
      ...(twice
        ? ([
            { kind: 'do', fn: () => this.ring() },
            { kind: 'wait', seconds: 1.2, pose: 'stand' },
          ] as Person['script'])
        : []),
      { kind: 'walk', to: { floor: 0, x: DOOR.inside } },
      {
        kind: 'do',
        fn: () => {
          p.carrying = false;
          p.setEmote('!', 1.5, this.now);
          this.hooks.announce(`${p.name} MOVED IN`);
        },
      },
      { kind: 'wait', seconds: 1.4, pose: 'front' },
      {
        kind: 'do',
        fn: () => {
          p.mode = 'inside';
          p.pose = 'stand';
          this.hooks.roster();
        },
      },
    ];
  }

  private enqueue(p: Person, quietly: boolean): void {
    p.mode = 'queued';
    p.carrying = true;
    this.queue.push(p.id);
    const slot = this.queue.length - 1;
    const x = QUEUE_X[slot] ?? OUTSIDE_RIGHT;
    if (quietly) {
      p.place({ floor: 0, x });
      p.facing = -1;
    } else {
      p.place({ floor: 0, x: OUTSIDE_RIGHT });
      p.script = [
        { kind: 'walk', to: { floor: 0, x: DOOR.step } },
        { kind: 'do', fn: () => this.ring() },
        { kind: 'wait', seconds: 1.6, pose: 'stand' },
        { kind: 'walk', to: { floor: 0, x } },
        { kind: 'do', fn: () => (p.facing = -1) },
      ];
    }
    this.hooks.notify(
      'Somebody is at the door',
      `${p.name} rang the bell, but the house is full (${CAPACITY}/${CAPACITY}). ${this.queue.length} waiting outside.`,
    );
  }

  private admitFromQueue(): void {
    while (this.queue.length && this.hasRoom()) {
      const id = this.queue.shift()!;
      const p = this.people.get(id);
      if (!p) continue;
      p.mode = 'arriving';
      p.script = [{ kind: 'walk', to: { floor: 0, x: DOOR.step } }, ...this.entering(p, false)];
      this.hooks.announce(`${p.name} CAN COME IN NOW`);
    }
    // the rest shuffle forward
    this.queue.forEach((id, i) => {
      const p = this.people.get(id);
      const x = QUEUE_X[i] ?? OUTSIDE_RIGHT;
      if (p && !p.script.length && Math.abs(p.x - x) > 1) {
        p.script = [
          { kind: 'walk', to: { floor: 0, x } },
          { kind: 'do', fn: () => (p.facing = -1) },
        ];
      }
    });
  }

  private leave(id: string): void {
    const p = this.people.get(id);
    if (!p || p.mode === 'leaving' || p.mode === 'gone') return;
    for (const c of this.critters.values()) if (c.parentId === id) c.state = 'return';
    if (p.spot) this.release(p.spot, p.id);
    p.spot = null;
    p.dozing = false;
    const wasQueued = p.mode === 'queued';
    const qi = this.queue.indexOf(id);
    if (qi >= 0) this.queue.splice(qi, 1);
    p.mode = 'leaving';
    p.balloon = null;
    if (wasQueued || p.x > DOOR.x) {
      p.script = [
        { kind: 'walk', to: { floor: 0, x: OUTSIDE_RIGHT + 10 } },
        { kind: 'do', fn: () => (p.mode = 'gone') },
      ];
      return;
    }
    p.script = [
      { kind: 'walk', to: { floor: 0, x: DOOR.inside } },
      { kind: 'do', fn: () => (p.carrying = true) },
      { kind: 'wait', seconds: 0.6, pose: 'stand' },
      { kind: 'walk', to: { floor: 0, x: DOOR.step + 4 } },
      {
        kind: 'do',
        fn: () => {
          this.hooks.sfx('voice', { x: p.x, pitch: p.voice });
          this.hooks.announce(`${p.name} PACKED UP AND LEFT. BYE BYE!`);
        },
      },
      { kind: 'wait', seconds: 2.2, pose: 'wave' },
      { kind: 'walk', to: { floor: 0, x: OUTSIDE_RIGHT + 10 } },
      { kind: 'do', fn: () => (p.mode = 'gone') },
    ];
  }

  private updateInfo(s: SessionInfo): void {
    const p = this.people.get(s.id);
    if (!p) return;
    const before = p.info.status;
    p.info = stripSnapshot(s);
    if (before !== s.status) {
      this.decidedAt.set(p.id, 0);
      if (s.status === 'waiting') {
        this.knocks.set(p.id, 0);
        this.hooks.announce(`${p.name} IS KNOCKING ON THE GLASS${s.waitingFor ? `: ${s.waitingFor}` : ''}`);
      }
    }
    this.hooks.roster();
  }

  private logEntry(entry: LogEntry, live: boolean): void {
    const p = this.people.get(entry.sessionId);
    if (!p) return;
    p.addLog(entry);
    this.hooks.log(entry, p);
    if (!live) return;
    const voice = () => this.hooks.sfx('voice', { x: p.x, pitch: p.voice });
    switch (entry.kind) {
      case 'speech':
        p.say(entry.text, 1, this.now);
        voice();
        if (entry.final) {
          const letter: Letter = {
            id: entry.uid,
            from: p.name,
            fromId: p.id,
            text: entry.text,
            at: entry.at,
            read: false,
          };
          this.letters.unshift(letter);
          if (this.letters.length > 100) this.letters.pop();
          p.letterPending = true;
          this.hooks.letter(letter);
        }
        return;
      case 'user':
        p.nodUntil = Math.floor(this.now / 125) + 6;
        p.setEmote('!', 2, this.now);
        this.hooks.typed(p.name, entry.text);
        return;
      case 'error':
        p.setEmote('?', 2.5, this.now);
        return;
      case 'message-out':
        p.say(`✉ TO ${entry.peerName ?? 'SOMEONE'}: ${entry.text}`, 7, this.now);
        voice();
        return;
      case 'message-in':
        p.setEmote('✉', 3, this.now);
        return;
      default:
        return;
    }
  }

  private sendEnvelope(fromId: string, toId: string): void {
    const from = this.people.get(fromId);
    const to = this.people.get(toId);
    if (!from || !to) return;
    this.envelopes.push({ fromX: from.x, fromY: from.headY, toId, start: this.now, duration: 2600 });
    this.hooks.sfx('whoosh', { x: from.x });
    if (from.spot === 'phone') this.hooks.sfx('phone', { x: from.x });
  }

  private spawnCritter(parentId: string, sub: Subagent, live: boolean): void {
    const parent = this.people.get(parentId);
    if (!parent || this.critters.has(sub.id)) return;
    const at =
      parent.mode === 'inside' ? { floor: parent.floor, x: parent.x } : { floor: 0 as const, x: DOOR.inside };
    const c = new Critter(sub.id, parentId, sub.critter, sub.label, at, this.now);
    if (!live) {
      // Already running when we loaded: scatter them around.
      c.restUntil = this.now + this.random() * 4000;
    }
    this.critters.set(sub.id, c);
    if (live && this.visibleCritters().includes(c)) {
      this.poofs.push({ x: c.x, y: c.y - 4, start: this.now });
      this.hooks.sfx('poof', { x: c.x });
    }
  }

  /** The first few critters are shown; the rest only count in a badge by their parent. */
  visibleCritters(): Critter[] {
    return [...this.critters.values()].sort((a, b) => a.bornAt - b.bornAt).slice(0, MAX_VISIBLE_CRITTERS);
  }

  hiddenCritterCount(parentId: string): number {
    const visible = new Set(this.visibleCritters());
    let n = 0;
    for (const c of this.critters.values()) if (c.parentId === parentId && !visible.has(c)) n++;
    return n;
  }

  // ------------------------------------------------------------------ commands from the player
  nod(p: Person): void {
    p.nodUntil = Math.floor(this.now / 125) + 6;
  }

  request(p: Person, spot: SpotId): void {
    p.requested = { spot, until: this.now + 60_000 };
    p.spotUntil = 0;
    this.decidedAt.set(p.id, 0);
  }

  changeClothes(p: Person): void {
    p.app = withShirt(p.app, this.now);
  }

  // ------------------------------------------------------------------ simulation step
  update(dt: number, now: number): void {
    this.now = now;
    const date = this.date();
    const clock = { ms: now, date, random: this.random };
    for (const p of this.people.values()) {
      const hadSpot = p.spot;
      p.update(dt, now);
      if (p.mode === 'inside' && !p.script.length && now - (this.decidedAt.get(p.id) ?? 0) > 500) {
        decide(p, this, clock);
        this.decidedAt.set(p.id, now);
      }
      // a visit to the closet ends with a new shirt
      if (hadSpot === 'closet' && p.spot !== 'closet') this.changeClothes(p);
      if (p.pose === 'knock' && p.mode === 'inside') this.knock(p);
    }

    // critters
    const visible = new Set(this.visibleCritters());
    for (const c of this.critters.values()) {
      const parent = this.people.get(c.parentId);
      const parentPos = parent && parent.mode !== 'gone' ? { floor: parent.floor, x: parent.x } : null;
      if (visible.has(c)) c.update(dt, now, this.random, parentPos);
      else if (c.state === 'return') c.state = 'gone';
      if (c.state === 'gone') {
        if (visible.has(c)) {
          this.poofs.push({ x: c.x, y: c.y - 4, start: now });
          this.hooks.sfx('poof', { x: c.x });
        }
        this.critters.delete(c.id);
      }
    }

    // envelopes
    for (let i = this.envelopes.length - 1; i >= 0; i--) {
      const e = this.envelopes[i]!;
      if (now - e.start >= e.duration) {
        this.envelopes.splice(i, 1);
        const to = this.people.get(e.toId);
        if (to) {
          to.setEmote('✉', 3, now);
          this.hooks.sfx('mail', { x: to.x });
        }
      }
    }
    for (let i = this.poofs.length - 1; i >= 0; i--)
      if (now - this.poofs[i]!.start > 600) this.poofs.splice(i, 1);

    // the front door opens for anyone passing through
    const passing =
      [...this.people.values()].some(
        (p) => p.floor === 0 && p.moving && p.x > DOOR.inside - 6 && p.x < DOOR.step + 8,
      ) || [...this.critters.values()].some((c) => c.floor === 0 && c.x > DOOR.inside && c.x < DOOR.step);
    this.door = Math.max(0, Math.min(1, this.door + (passing ? 4 : -3) * dt));
    const open = this.door > 0.5;
    if (open !== this.doorWasOpen) this.hooks.sfx('door', { x: DOOR.x });
    this.doorWasOpen = open;

    // goodbye and make room
    for (const p of [...this.people.values()]) {
      if (p.mode !== 'gone') continue;
      this.people.delete(p.id);
      this.decidedAt.delete(p.id);
      this.knocks.delete(p.id);
      this.hooks.roster();
    }
    this.admitFromQueue();

    // tell the human once when the house becomes full
    const full = this.residents.length >= CAPACITY;
    if (full && !this.full && this.initialized) {
      this.hooks.notify(
        'House full',
        `${CAPACITY} of ${CAPACITY} little Claudes live here now. Newcomers will wait outside.`,
      );
    }
    this.full = full;
  }

  private knock(p: Person): void {
    const count = this.knocks.get(p.id) ?? 0;
    if (this.now < p.knockAt) return;
    this.hooks.sfx('knock', { x: p.x });
    this.knocks.set(p.id, count + 1);
    // three insistent knocks, then only now and then
    p.knockAt = this.now + (count < 3 ? 2600 : 25_000);
  }

  /** Topmost person under a screen point. */
  personAt(x: number, y: number): Person | undefined {
    const hits = [...this.people.values()].filter(
      (p) => p.mode !== 'gone' && Math.abs(p.x - x) <= 8 && y <= p.y + 1 && y >= p.headY - 2,
    );
    return hits.sort((a, b) => b.y - a.y)[0];
  }

  critterAt(x: number, y: number): Critter | undefined {
    return this.visibleCritters().find((c) => Math.abs(c.x - x) <= 7 && y <= c.y + 1 && y >= c.y - 11);
  }
}

function stripSnapshot(s: SessionInfo | SessionSnapshot): SessionInfo {
  const info: SessionInfo = {
    id: s.id,
    pid: s.pid,
    name: s.name,
    cwd: s.cwd,
    project: s.project,
    kind: s.kind,
    startedAt: s.startedAt,
    status: s.status,
    look: s.look,
  };
  if (s.waitingFor) info.waitingFor = s.waitingFor;
  return info;
}
