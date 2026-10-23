import type { ServerEvent, SessionSnapshot } from '@lcp/protocol';
import { describe, expect, it, vi } from 'vitest';
import { CAPACITY, World, type WorldHooks } from './world.ts';

const session = (n: number, status: SessionSnapshot['status'] = 'idle'): SessionSnapshot => ({
  id: `s${n}`,
  pid: 100 + n,
  name: `P${n}`,
  cwd: '/x',
  project: 'x',
  kind: 'interactive',
  startedAt: n,
  status,
  look: n * 7919,
  log: [],
  activity: null,
  subagents: [],
});

function makeWorld() {
  const hooks: WorldHooks = {
    sfx: vi.fn(),
    announce: vi.fn(),
    notify: vi.fn(),
    typed: vi.fn(),
    log: vi.fn(),
    letter: vi.fn(),
    roster: vi.fn(),
  };
  const world = new World(hooks);
  let seed = 1;
  world.random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  world.date = () => new Date(2026, 9, 23, 14, 0);
  let now = 1_000_000;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 50; i++) {
      now += 20;
      world.update(0.02, now);
    }
  };
  return { world, hooks, run, apply: (e: ServerEvent) => world.apply(e) };
}

const letterEntry = (sessionId: string, text: string) => ({
  uid: `${sessionId}-${text}`,
  sessionId,
  at: 1,
  kind: 'speech' as const,
  text,
  final: true,
});

describe('World', () => {
  it('signs each letter with its own session and can forget sessions at once', () => {
    const { world, apply } = makeWorld();
    const a = { ...session(1), log: [letterEntry('s1', 'from one')] };
    const b = { ...session(2), log: [letterEntry('s2', 'from two')] };
    apply({ type: 'hello', version: 1, host: 't', sessions: [a, b] });
    expect(world.letters.map((l) => [l.from, l.text]).sort()).toEqual([
      ['P1', 'from one'],
      ['P2', 'from two'],
    ]);
    const shared = world.letters;
    world.forget(new Set(['s1']));
    expect(shared.map((l) => l.from)).toEqual(['P2']);
    expect([...world.people.keys()]).toEqual(['s2']);
  });

  it('puts people who are already running straight into the house on load', () => {
    const { world, apply } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1), session(2)] });
    expect([...world.people.values()].map((p) => p.mode)).toEqual(['inside', 'inside']);
  });

  it('a new session rings, walks in and settles; a closed one leaves calmly', () => {
    const { world, apply, run, hooks } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [] });
    apply({ type: 'session.joined', session: session(1) });
    expect(world.people.get('s1')!.mode).toBe('arriving');
    run(30);
    expect(hooks.sfx).toHaveBeenCalledWith('doorbell', expect.anything());
    expect(world.people.get('s1')!.mode).toBe('inside');
    apply({ type: 'session.left', id: 's1', reason: 'closed' });
    expect(world.people.get('s1')!.mode).toBe('leaving');
    run(60);
    expect(world.people.has('s1')).toBe(false);
  });

  it(`keeps at most ${CAPACITY} inside; the rest wait outside and get in when someone leaves`, () => {
    const { world, apply, run, hooks } = makeWorld();
    const sessions = Array.from({ length: CAPACITY + 2 }, (_, i) => session(i + 1));
    apply({ type: 'hello', version: 1, host: 't', sessions });
    expect(world.residents).toHaveLength(CAPACITY);
    expect(world.queue).toEqual(['s11', 's12']);
    expect(hooks.notify).toHaveBeenCalledWith('Somebody is at the door', expect.stringContaining('P11'));
    apply({ type: 'session.left', id: 's1', reason: 'closed' });
    run(90);
    expect(world.people.has('s1')).toBe(false);
    expect(world.people.get('s11')!.mode).toBe('inside');
    expect(world.queue).toEqual(['s12']);
  });

  it('notifies once when the house becomes full', () => {
    const { world, apply, run, hooks } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [] });
    for (let i = 1; i <= CAPACITY; i++) apply({ type: 'session.joined', session: session(i) });
    run(120);
    const full = (hooks.notify as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'House full');
    expect(full).toHaveLength(1);
    expect(world.residents).toHaveLength(CAPACITY);
  });

  it('a waiting session knocks on the glass', () => {
    const { world, apply, run, hooks } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1, 'waiting')] });
    run(2);
    expect(world.people.get('s1')!.pose).toBe('knock');
    expect(hooks.sfx).toHaveBeenCalledWith('knock', expect.anything());
  });

  it('busy sessions go to the work spot for their tool', () => {
    const { world, apply, run } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1, 'busy')] });
    apply({
      type: 'session.activity',
      id: 's1',
      activity: { kind: 'shell', tool: 'Bash', label: 'npm test', at: Date.now() },
    });
    run(1);
    expect(['comp1', 'comp2']).toContain(world.people.get('s1')!.spot);
  });

  it('an end-of-turn message becomes a letter', () => {
    const { world, apply } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1)] });
    apply({
      type: 'session.log',
      entry: { uid: 'u1', sessionId: 's1', at: 1, kind: 'speech', text: 'All done!', final: true },
    });
    expect(world.letters[0]).toMatchObject({ from: 'P1', text: 'All done!', read: false });
  });

  it('messages between sessions fly as envelopes', () => {
    const { world, apply } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1), session(2)] });
    apply({ type: 'session.message', from: 's1', to: 's2', preview: 'hi', at: 1 });
    expect(world.envelopes).toHaveLength(1);
  });

  it('subagents become critters that run home when done', () => {
    const { world, apply, run } = makeWorld();
    apply({ type: 'hello', version: 1, host: 't', sessions: [session(1, 'busy')] });
    apply({
      type: 'subagent.started',
      parentId: 's1',
      subagent: { id: 'a1', label: 'look', critter: 'dog', startedAt: 1 },
    });
    expect(world.critters.get('a1')!.kind).toBe('dog');
    apply({ type: 'subagent.finished', parentId: 's1', subagentId: 'a1' });
    run(40);
    expect(world.critters.has('a1')).toBe(false);
  });
});
