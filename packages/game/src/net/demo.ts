/**
 * Demo house: simulated sessions that produce the same protocol events as the bridge.
 * Used when no bridge is reachable (e.g. the hosted page) and to exercise every feature.
 */
import {
  type ActivityKind,
  critterFor,
  fnv1a,
  type LogEntry,
  PROTOCOL_VERSION,
  type ServerEvent,
  type SessionSnapshot,
  type SessionStatus,
} from '@lcp/protocol';

const NAMES = [
  'PIXEL',
  'BYTE',
  'NIBBLE',
  'SPRITE',
  'KERNAL',
  'BASIC',
  'PEEK',
  'POKE',
  'JIFFY',
  'SID',
  'VIC',
  'CIA',
  'DATASETTE',
  'JOYSTICK',
];
const PROJECTS = ['webshop', 'api-server', 'mobile-app', 'data-pipeline', 'docs', 'game-engine'];

const TOOLS: [ActivityKind, string, string[]][] = [
  ['shell', 'Bash', ['npm test', 'git status', 'npm run build', 'ls -la src', 'pytest -q', 'cargo check']],
  ['edit', 'Edit', ['App.tsx', 'server.ts', 'README.md', 'schema.sql', 'main.rs', 'styles.css']],
  ['read', 'Read', ['package.json', 'index.ts', 'config.yaml', 'CHANGELOG.md']],
  ['search', 'Grep', ['TODO', 'handleClick', 'useEffect', 'SELECT \\*']],
  ['web', 'WebFetch', ['docs.python.org', 'developer.mozilla.org', 'en.wikipedia.org']],
  ['tool', 'linear: get issue', ['ENG-1234', 'ENG-42']],
];

const SPEECH = [
  'Let me look at how the tests are set up first.',
  'Found it! The bug is an off-by-one in the loop.',
  "I'll run the test suite to make sure nothing else broke.",
  'That build error comes from a missing import.',
  'Good news: all 42 tests pass now.',
  "I'm checking the docs to confirm the API behaviour.",
  "This function is doing three things at once; I'll split it up.",
  'Hmm, the migration needs a default value for the new column.',
];
const LETTERS = [
  'Dear friend, I fixed the login bug today. The problem was a cookie that expired too early. All tests pass and I wrote a new one so it never comes back.',
  'Dear friend, the new page is ready! I added the form, the validation and a little animation. Please have a look when you have time.',
  'Dear friend, I could not finish the deploy because the server asked for a password I do not have. Could you help me with that?',
  'Dear friend, I cleaned up the old code in the basement. Three files were never used, so I removed them. The house feels tidier now.',
];
const THOUGHTS = [
  'The user wants the button to be blue, but the design system only has a primary colour token. I should check whether primary is blue in the current theme before hardcoding anything.',
  '',
  '',
  'Two options: patch the parser, or normalise the input before it reaches the parser. The second keeps the parser simple and is easier to test.',
];
const PROMPTS = [
  'please fix the failing test',
  'can you add a dark mode?',
  'thanks, that looks great!',
  'why is the build so slow?',
];

interface Sim {
  s: SessionSnapshot;
  nextAt: number;
  phase: 'idle' | 'work' | 'wait';
  steps: number;
}

export class DemoSource {
  private sims = new Map<string, Sim>();
  private timer: number | undefined;
  private uid = 0;
  private names = [...NAMES];
  private nextJoinAt = 0;
  private readonly created = new Set<string>();

  constructor(private readonly emit: (e: ServerEvent) => void) {}

  start(initial = 6): void {
    const now = Date.now();
    for (let i = 0; i < initial; i++) this.create(now - (initial - i) * 60_000);
    this.emit({
      type: 'hello',
      version: PROTOCOL_VERSION,
      host: 'demo',
      sessions: [...this.sims.values()].map((x) => x.s),
    });
    this.nextJoinAt = now + 25_000;
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  /** Stops making things up. The app removes the demo's people itself (World.forget). */
  stop(): void {
    clearInterval(this.timer);
    this.sims.clear();
  }

  /** Every session id the demo ever made up, including those that already left. */
  get ids(): ReadonlySet<string> {
    return this.created;
  }

  /** Adds a session right now (the demo's "ring the bell" button). */
  addVisitor(): void {
    const sim = this.create(Date.now());
    if (sim) this.emit({ type: 'session.joined', session: sim.s });
  }

  private create(startedAt: number): Sim | null {
    const name = this.names.shift();
    if (!name) return null;
    const id = `demo-${name.toLowerCase()}`;
    const project = PROJECTS[fnv1a(name) % PROJECTS.length]!;
    const s: SessionSnapshot = {
      id,
      pid: 1000 + (fnv1a(id) % 9000),
      name,
      cwd: `/home/demo/${project}`,
      project,
      kind: 'interactive',
      startedAt,
      status: 'idle',
      look: fnv1a(id),
      log: [],
      activity: null,
      subagents: [],
    };
    const sim: Sim = { s, nextAt: Date.now() + 2000 + Math.random() * 8000, phase: 'idle', steps: 0 };
    this.sims.set(id, sim);
    this.created.add(id);
    return sim;
  }

  private status(sim: Sim, status: SessionStatus, waitingFor?: string): void {
    sim.s.status = status;
    if (waitingFor) sim.s.waitingFor = waitingFor;
    else delete sim.s.waitingFor;
    const { log: _l, activity: _a, subagents: _s, ...info } = sim.s;
    this.emit({ type: 'session.updated', session: info });
  }

  private log(sim: Sim, partial: Omit<LogEntry, 'uid' | 'sessionId' | 'at'>): void {
    this.emit({
      type: 'session.log',
      entry: { uid: `d${++this.uid}`, sessionId: sim.s.id, at: Date.now(), ...partial },
    });
  }

  private activity(sim: Sim, kind: ActivityKind, label: string, tool?: string): void {
    this.emit({
      type: 'session.activity',
      id: sim.s.id,
      activity: { kind, label, at: Date.now(), ...(tool ? { tool } : {}) },
    });
  }

  private tick(): void {
    const now = Date.now();
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

    if (now > this.nextJoinAt) {
      this.nextJoinAt = now + 40_000 + Math.random() * 60_000;
      if (this.sims.size < 12) this.addVisitor();
      else {
        const leaver = pick([...this.sims.values()]);
        this.sims.delete(leaver.s.id);
        this.emit({ type: 'session.left', id: leaver.s.id, reason: 'closed' });
        this.names.push(leaver.s.name);
      }
    }

    for (const sim of this.sims.values()) {
      if (now < sim.nextAt) continue;
      if (sim.phase === 'idle') {
        sim.phase = 'work';
        sim.steps = 4 + Math.floor(Math.random() * 8);
        this.status(sim, 'busy');
        this.log(sim, { kind: 'user', text: pick(PROMPTS) });
        if (Math.random() < 0.3)
          this.emit({ type: 'session.mood', id: sim.s.id, delta: 2, reason: 'praised' });
        this.activity(sim, 'think', 'reading your message');
        sim.nextAt = now + 3000 + Math.random() * 4000;
        continue;
      }
      if (sim.phase === 'wait') {
        sim.phase = 'work';
        this.status(sim, 'busy');
        sim.nextAt = now + 2000;
        continue;
      }
      // working
      if (sim.steps-- <= 0) {
        this.log(sim, { kind: 'speech', text: pick(LETTERS), final: true });
        this.status(sim, 'idle');
        sim.phase = 'idle';
        sim.nextAt = now + 30_000 + Math.random() * 90_000;
        continue;
      }
      const r = Math.random();
      if (r < 0.06) {
        sim.phase = 'wait';
        this.status(sim, 'waiting', 'permission to run a command');
        sim.nextAt = now + 9000 + Math.random() * 6000;
      } else if (r < 0.2) {
        this.log(sim, { kind: 'thinking', text: pick(THOUGHTS) });
        this.activity(sim, 'think', 'thinking');
        sim.nextAt = now + 5000 + Math.random() * 5000;
      } else if (r < 0.3) {
        this.log(sim, { kind: 'speech', text: pick(SPEECH), final: false });
        sim.nextAt = now + 3000;
      } else if (r < 0.36 && this.sims.size > 1) {
        const other = pick([...this.sims.values()].filter((o) => o !== sim));
        const text = `Hi ${other.s.name}, are you touching the database right now? I want to run a migration.`;
        this.activity(sim, 'message', 'ask before migrating', 'SendMessage');
        this.log(sim, { kind: 'message-out', text, peer: other.s.id, peerName: other.s.name });
        this.emit({ type: 'session.message', from: sim.s.id, to: other.s.id, preview: text, at: now });
        this.log(other, { kind: 'message-in', text, peer: sim.s.id, peerName: sim.s.name });
        sim.nextAt = now + 6000;
      } else if (r < 0.42) {
        const subId = `${sim.s.id}-${this.uid++}`;
        const label = pick([
          'explore the codebase',
          'research the API',
          'review the diff',
          'find flaky tests',
        ]);
        this.activity(sim, 'subagent', label, 'Agent');
        this.emit({
          type: 'subagent.started',
          parentId: sim.s.id,
          subagent: { id: subId, label, critter: critterFor(subId), startedAt: now },
        });
        window.setTimeout(
          () =>
            this.sims.has(sim.s.id) &&
            this.emit({ type: 'subagent.finished', parentId: sim.s.id, subagentId: subId }),
          15_000 + Math.random() * 30_000,
        );
        sim.nextAt = now + 4000;
      } else if (r < 0.47) {
        this.log(sim, { kind: 'error', text: 'Exit code 1: 2 tests failed' });
        this.emit({ type: 'session.mood', id: sim.s.id, delta: -1, reason: 'tool error' });
        this.activity(sim, 'think', 'pondering the result');
        sim.nextAt = now + 4000;
      } else {
        const [kind, tool, labels] = pick(TOOLS);
        const label = pick(labels);
        this.activity(sim, kind, label, tool);
        this.log(sim, { kind: 'tool', text: label, tool });
        sim.nextAt = now + 5000 + Math.random() * 12_000;
      }
    }
  }
}
