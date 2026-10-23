import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { redact } from '../src/redact.ts';
import {
  activityKindFor,
  cleanPrompt,
  normalizeRecord,
  prettyTool,
} from '../src/sources/claude-fs/normalize.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('normalizeRecord (Claude Code 2.1.30x records)', () => {
  const records = fixture('cc-2.1.30x.jsonl');
  const items = records.flatMap((r) => normalizeRecord(r)?.items ?? []);

  it('turns a human prompt into a user log line and a think activity', () => {
    expect(items).toContainEqual({ t: 'log', kind: 'user', text: 'please fix the failing test, thanks!' });
    expect(items).toContainEqual({ t: 'mood', delta: 2, reason: 'praised' });
  });

  it('keeps slash commands short and drops local command output', () => {
    expect(items).toContainEqual({ t: 'log', kind: 'user', text: '/model opus' });
    expect(items.some((i) => i.t === 'log' && i.text.includes('Set model'))).toBe(false);
  });

  it('emits thinking with and without stored text', () => {
    const thinking = items.filter((i) => i.t === 'log' && i.kind === 'thinking');
    expect(thinking.map((i) => (i.t === 'log' ? i.text : ''))).toEqual([
      'The test fails because of a typo.',
      '',
    ]);
  });

  it('maps tool calls to activities with readable labels', () => {
    expect(items).toContainEqual({ t: 'activity', kind: 'shell', tool: 'Bash', label: 'Run the unit tests' });
    expect(items).toContainEqual({ t: 'activity', kind: 'edit', tool: 'Edit', label: 'math.ts' });
  });

  it('marks tool errors and lowers the mood', () => {
    expect(items).toContainEqual({ t: 'log', kind: 'error', text: 'Exit code 1: 1 test failed' });
    expect(items).toContainEqual({ t: 'mood', delta: -1, reason: 'tool error' });
  });

  it('marks end-of-turn text as final (a letter)', () => {
    expect(items).toContainEqual({
      t: 'log',
      kind: 'speech',
      text: 'Fixed the typo. All tests pass.',
      final: true,
    });
  });

  it('recognises outgoing and incoming cross-session messages', () => {
    expect(items).toContainEqual({
      t: 'message',
      toAddress: 'uds:/tmp/cc-socks/4242.sock',
      preview: 'Can I merge #12?',
    });
    expect(items).toContainEqual({
      t: 'log',
      kind: 'message-in',
      text: 'Go ahead, nothing in flight here.',
      peerPid: 4242,
      peerName: 'BRAVO',
    });
  });

  it('treats a subagent hand-back as helper news, not a peer message', () => {
    expect(items).toContainEqual({ t: 'log', kind: 'helper', text: 'web-fetch came back with a report' });
  });

  it('ignores records it does not know', () => {
    expect(normalizeRecord({ type: 'file-history-snapshot' })).toBeNull();
    expect(normalizeRecord('garbage')).toBeNull();
  });
});

describe('helpers', () => {
  it('prettifies MCP tool names', () => {
    expect(prettyTool('mcp__plugin_linear_linear__save_issue')).toBe('linear: save issue');
    expect(prettyTool('Bash')).toBe('Bash');
  });

  it('classifies tools', () => {
    expect(activityKindFor('Grep')).toBe('search');
    expect(activityKindFor('mcp__claude-in-chrome__navigate')).toBe('web');
    expect(activityKindFor('Workflow')).toBe('subagent');
    expect(activityKindFor('mcp__supabase__execute_sql')).toBe('tool');
  });

  it('drops wrapped system content from prompts', () => {
    expect(cleanPrompt('<system-reminder>x</system-reminder>')).toBe('');
    expect(cleanPrompt('<task-notification>done</task-notification>')).toBe('');
  });

  it('redacts secrets', () => {
    expect(redact('key sk-ant-api03-abcdefghijklmnop end')).toBe('key [secret] end'); // gitleaks:allow (fake key)
    expect(redact('OPENAI_API_KEY=abcd1234efgh')).toBe('OPENAI_API_KEY=[secret]'); // gitleaks:allow (fake key)
    expect(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toBe('Authorization: Bearer [secret]'); // gitleaks:allow
    expect(redact('postgres://user:hunter22@db:5432/x')).toBe('postgres://[secret]@db:5432/x'); // gitleaks:allow
    expect(redact('nothing to see')).toBe('nothing to see');
  });
});
