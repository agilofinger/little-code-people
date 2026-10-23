/**
 * Event protocol between the bridge (reads Claude Code sessions) and the game (renders the house).
 * The game never sees raw Claude Code records — only these normalized events.
 */
import { z } from 'zod';

export * from './link.ts';

export const PROTOCOL_VERSION = 1;

/** Registry status values found in Claude Code 2.1.30x. Unknown values are mapped by the bridge. */
export const SessionStatus = z.enum(['busy', 'shell', 'idle', 'waiting']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const ActivityKind = z.enum([
  'shell', // Bash, running commands, tests, builds
  'edit', // Edit, Write, NotebookEdit
  'read', // Read
  'search', // Grep, Glob, ToolSearch
  'web', // WebFetch, WebSearch, browser tools
  'tool', // MCP and any other tool
  'think', // model is generating or a thinking block landed
  'subagent', // Agent / Workflow
  'message', // SendMessage
  'speak', // assistant text
]);
export type ActivityKind = z.infer<typeof ActivityKind>;

export const CritterKind = z.enum(['kid', 'cat', 'dog']);
export type CritterKind = z.infer<typeof CritterKind>;

export const SessionInfo = z.object({
  /** Stable per Claude Code process (survives /clear): derived from pid + process start. */
  id: z.string(),
  pid: z.number(),
  name: z.string(),
  cwd: z.string(),
  project: z.string(),
  kind: z.string(),
  startedAt: z.number(),
  status: SessionStatus,
  waitingFor: z.string().optional(),
  /** Seed for the person's appearance. */
  look: z.number(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const Activity = z.object({
  kind: ActivityKind,
  /** Tool name or short description, e.g. "Bash". */
  tool: z.string().optional(),
  /** Human-readable detail, e.g. the command or file. Already redacted. */
  label: z.string(),
  at: z.number(),
});
export type Activity = z.infer<typeof Activity>;

export const LogKind = z.enum([
  'user', // the human typed a prompt
  'speech', // assistant text
  'thinking', // a thinking block (text may be empty when not stored)
  'tool', // a tool call
  'error', // a tool result marked as error
  'message-out', // SendMessage to another session
  'message-in', // a message from another session
  'helper', // subagent started / finished
  'system', // anything else worth showing
]);
export type LogKind = z.infer<typeof LogKind>;

export const LogEntry = z.object({
  /** Unique within the bridge run. */
  uid: z.string(),
  sessionId: z.string(),
  at: z.number(),
  kind: LogKind,
  text: z.string(),
  /** speech: end of turn — becomes a letter. */
  final: z.boolean().optional(),
  tool: z.string().optional(),
  /** message-in / message-out: the other session's id when known, else its display name. */
  peer: z.string().optional(),
  peerName: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const Subagent = z.object({
  id: z.string(),
  label: z.string(),
  critter: CritterKind,
  startedAt: z.number(),
});
export type Subagent = z.infer<typeof Subagent>;

export const SessionSnapshot = SessionInfo.extend({
  log: z.array(LogEntry),
  activity: Activity.nullable(),
  subagents: z.array(Subagent),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

export const ServerEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    version: z.number(),
    host: z.string(),
    sessions: z.array(SessionSnapshot),
  }),
  z.object({ type: z.literal('session.joined'), session: SessionSnapshot }),
  z.object({ type: z.literal('session.updated'), session: SessionInfo }),
  z.object({
    type: z.literal('session.left'),
    id: z.string(),
    reason: z.enum(['closed', 'crashed']),
  }),
  z.object({ type: z.literal('session.activity'), id: z.string(), activity: Activity }),
  z.object({ type: z.literal('session.log'), entry: LogEntry }),
  z.object({
    type: z.literal('session.mood'),
    id: z.string(),
    delta: z.number(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('session.message'),
    from: z.string(),
    to: z.string(),
    preview: z.string(),
    at: z.number(),
  }),
  z.object({ type: z.literal('subagent.started'), parentId: z.string(), subagent: Subagent }),
  z.object({ type: z.literal('subagent.finished'), parentId: z.string(), subagentId: z.string() }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

/** Stable, cheap 32-bit FNV-1a hash used for looks and critter kinds on both sides. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function critterFor(id: string): CritterKind {
  const kinds: CritterKind[] = ['kid', 'cat', 'dog'];
  return kinds[fnv1a(id) % kinds.length]!;
}
