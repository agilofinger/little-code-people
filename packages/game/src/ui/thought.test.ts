import type { LogEntry, SessionInfo } from '@lcp/protocol';
import { describe, expect, it } from 'vitest';
import { fold } from '../engine/font.ts';
import { Person } from '../sim/person.ts';
import { FUNNY_THOUGHTS, headerFor, mindLines } from './thought.ts';

const info = (status: SessionInfo['status']): SessionInfo => ({
  id: 's1',
  pid: 1,
  name: 'PIXEL',
  cwd: '/demo',
  project: 'demo',
  kind: 'interactive',
  startedAt: 0,
  status,
  look: 0,
});

let uid = 0;
const entry = (kind: LogEntry['kind'], text: string, at: number, final?: boolean): LogEntry => ({
  uid: `u${++uid}`,
  sessionId: 's1',
  at,
  kind,
  text,
  ...(final === undefined ? {} : { final }),
});

// The pixel font folds text to its own character set (uppercase), as drawText does.
const texts = (p: Person, sinceOpen = 60_000) => mindLines(p, sinceOpen).map((l) => fold(l.text));

describe('thought cloud', () => {
  it('shows the last answer in full, keeping its line breaks', () => {
    const p = new Person(info('idle'));
    p.addLog(entry('speech', 'Old answer.', 1, true));
    p.addLog(entry('speech', 'All **42** tests pass.\n\nNext I would:\n- add a test\n- ship it', 2, true));
    expect(headerFor(p)).toBe('PIXEL IS RELAXING');
    expect(texts(p)).toEqual(
      ['LAST ANSWER:', 'All 42 tests pass.', '', 'Next I would:', '• add a test', '• ship it'].map(fold),
    );
  });

  it('puts a funny stand-in on top while thinking without readable text', () => {
    const p = new Person(info('busy'));
    p.addLog(entry('speech', 'Let me check the tests.', 1, false));
    p.setActivity({ kind: 'think', label: 'thinking', at: 5 }, 10_000);
    p.activity = p.rawActivity;
    expect(headerFor(p)).toBe('PIXEL IS THINKING...');
    const [funny, blank, label, said] = texts(p, 2500); // fully typed by now
    expect(FUNNY_THOUGHTS.map((t) => fold(`${t}...`))).toContain(funny);
    expect([blank, label, said]).toEqual(['', 'LAST SAID:', fold('Let me check the tests.')]);
  });

  it('shows the real thought when it is current', () => {
    const p = new Person(info('busy'));
    p.setActivity({ kind: 'think', label: 'thinking', at: 5 }, 10_000);
    p.activity = p.rawActivity;
    p.addLog(entry('thinking', 'Patch the parser or normalise the input first?', 6));
    expect(texts(p)[0]).toBe(fold('Patch the parser or normalise the input first?'));
  });

  it('wraps long answers into more lines than the cloud shows, for scrolling', () => {
    const p = new Person(info('idle'));
    p.addLog(entry('speech', 'word '.repeat(200), 1, true));
    expect(texts(p).length).toBeGreaterThan(11);
  });

  it('says so when there is nothing yet', () => {
    expect(texts(new Person(info('idle')))).toEqual(['HAS NOT SAID ANYTHING YET.']);
  });
});
