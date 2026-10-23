/**
 * Reads Claude Code's live session registry: one <pid>.json per running session in
 * ~/.claude/sessions. Undocumented format, verified against Claude Code 2.1.30x.
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fnv1a, type SessionStatus } from '@lcp/protocol';

export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart?: string;
  name?: string;
  status: SessionStatus;
  waitingFor?: string;
  kind: string;
  messagingSocketPath?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function mapStatus(raw: unknown): SessionStatus {
  switch (raw) {
    case 'busy':
    case 'shell':
    case 'idle':
    case 'waiting':
      return raw;
    default:
      // Unknown future values: treat as busy rather than hiding activity.
      return raw === undefined ? 'idle' : 'busy';
  }
}

export function parseRegistryEntry(json: unknown): RegistryEntry | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const pid = num(o.pid);
  const sessionId = str(o.sessionId);
  const cwd = str(o.cwd);
  if (pid === undefined || sessionId === undefined || cwd === undefined) return null;
  const entry: RegistryEntry = {
    pid,
    sessionId,
    cwd,
    startedAt: num(o.startedAt) ?? Date.now(),
    status: mapStatus(o.status),
    kind: str(o.kind) ?? 'interactive',
  };
  const procStart = str(o.procStart);
  if (procStart) entry.procStart = procStart;
  const name = str(o.name);
  if (name) entry.name = name;
  const waitingFor = str(o.waitingFor);
  if (waitingFor) entry.waitingFor = waitingFor;
  const sock = str(o.messagingSocketPath);
  if (sock) entry.messagingSocketPath = sock;
  return entry;
}

/** Identity of a little person: the Claude Code process, which survives /clear. */
export function personId(e: Pick<RegistryEntry, 'pid' | 'procStart' | 'startedAt'>): string {
  return `p${e.pid}-${fnv1a(e.procStart ?? String(e.startedAt)).toString(36)}`;
}

export function displayName(e: Pick<RegistryEntry, 'name' | 'cwd'>): string {
  return (e.name ?? basename(e.cwd)).toUpperCase();
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Reads every registry file. Files that are mid-write or malformed are skipped this round. */
export async function readRegistry(dir: string): Promise<RegistryEntry[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    files
      .filter((f) => /^\d+\.json$/.test(f))
      .map(async (f) => {
        try {
          return parseRegistryEntry(JSON.parse(await readFile(join(dir, f), 'utf8')));
        } catch {
          return null;
        }
      }),
  );
  return entries.filter((e): e is RegistryEntry => e !== null && isAlive(e.pid));
}
