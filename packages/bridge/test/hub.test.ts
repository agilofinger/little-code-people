import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerEvent } from '@lcp/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hub } from '../src/hub.ts';
import { projectSlug } from '../src/sources/claude-fs/paths.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await wait(25);
  }
}

describe('Hub with a fake ~/.claude', () => {
  let root: string;
  let hub: Hub;
  const events: ServerEvent[] = [];
  const cwd = '/work/my_repo';
  const pid = process.pid; // must be alive

  const registry = (extra: Record<string, unknown> = {}) =>
    writeFileSync(
      join(root, 'sessions', `${pid}.json`),
      JSON.stringify({
        pid,
        sessionId: 'sess-1',
        cwd,
        startedAt: 1,
        procStart: 'Mon Oct 19 10:52:55 2026',
        status: 'busy',
        name: 'alpha',
        kind: 'interactive',
        messagingSocketPath: `/tmp/cc-socks/${pid}.sock`,
        ...extra,
      }),
    );
  const transcript = () => join(root, 'projects', projectSlug(cwd), 'sess-1.jsonl');
  const line = (o: unknown) => appendFileSync(transcript(), `${JSON.stringify(o)}\n`);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lcp-hub-'));
    mkdirSync(join(root, 'sessions'));
    mkdirSync(join(root, 'projects', projectSlug(cwd)), { recursive: true });
    events.length = 0;
    hub = new Hub({ root, registryPollMs: 50, subagentPollMs: 50 });
    hub.subscribe((e) => events.push(e));
  });

  afterEach(() => {
    hub.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('announces a session with its backlog, streams live records, and says goodbye', async () => {
    line({
      type: 'assistant',
      timestamp: '2026-10-23T08:00:00Z',
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'old news' }] },
    });
    registry();
    hub.start();
    await until(() => events.some((e) => e.type === 'session.joined'));
    const joined = events.find((e) => e.type === 'session.joined');
    expect(joined?.type === 'session.joined' && joined.session.name).toBe('ALPHA');
    expect(joined?.type === 'session.joined' && joined.session.log.map((l) => l.text)).toEqual(['old news']);
    // backlog is not re-emitted as live events
    expect(events.some((e) => e.type === 'session.log')).toBe(false);

    line({
      type: 'assistant',
      timestamp: '2026-10-23T08:00:01Z',
      message: {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    await until(() => events.some((e) => e.type === 'session.activity'));

    registry({ status: 'waiting', waitingFor: 'permission' });
    await until(() => events.some((e) => e.type === 'session.updated' && e.session.status === 'waiting'));

    // subagent appears and finishes
    const subs = join(root, 'projects', projectSlug(cwd), 'sess-1', 'subagents');
    mkdirSync(subs, { recursive: true });
    writeFileSync(
      join(subs, 'agent-abc.meta.json'),
      JSON.stringify({ description: 'Look around', finished: false }),
    );
    await until(() => events.some((e) => e.type === 'subagent.started'));
    writeFileSync(
      join(subs, 'agent-abc.meta.json'),
      JSON.stringify({ description: 'Look around', finished: true }),
    );
    await until(() => events.some((e) => e.type === 'subagent.finished'));

    rmSync(join(root, 'sessions', `${pid}.json`));
    await until(() => events.some((e) => e.type === 'session.left'));
  });

  it('resolves SendMessage addresses to sessions', async () => {
    registry();
    hub.start();
    await until(() => events.some((e) => e.type === 'session.joined'));
    expect(hub.resolveAddress(`uds:/tmp/cc-socks/${pid}.sock`)?.info.name).toBe('ALPHA');
    expect(hub.resolveAddress('alpha')?.info.name).toBe('ALPHA');
    expect(hub.resolveAddress('uds:/tmp/cc-socks/1.sock')).toBeUndefined();
  });

  it('keeps the same person across /clear (new sessionId, same process)', async () => {
    registry();
    hub.start();
    await until(() => events.some((e) => e.type === 'session.joined'));
    registry({ sessionId: 'sess-2' });
    await wait(200);
    expect(events.filter((e) => e.type === 'session.joined')).toHaveLength(1);
    expect(events.some((e) => e.type === 'session.left')).toBe(false);
  });
});
