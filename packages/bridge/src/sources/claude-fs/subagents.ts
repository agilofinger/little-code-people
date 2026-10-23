/**
 * Watches <transcript>/subagents/agent-<id>.meta.json files. A meta file appears when a
 * session spawns a subagent and gets "finished": true when the subagent is done.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface SubagentMeta {
  id: string;
  label: string;
  finished: boolean;
  /** Last write to the subagent's own transcript (ms). */
  lastWrite: number;
}

/** A subagent that never reports "finished" is considered gone after this much silence. */
export const SUBAGENT_STALE_MS = 10 * 60 * 1000;

export async function readSubagents(dir: string): Promise<SubagentMeta[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    files
      .filter((f) => /^agent-[A-Za-z0-9_-]+\.meta\.json$/.test(f))
      .map(async (f): Promise<SubagentMeta | null> => {
        const id = f.slice('agent-'.length, -'.meta.json'.length);
        try {
          const meta = JSON.parse(await readFile(join(dir, f), 'utf8')) as Record<string, unknown>;
          let lastWrite = 0;
          try {
            lastWrite = (await stat(join(dir, `agent-${id}.jsonl`))).mtimeMs;
          } catch {
            lastWrite = (await stat(join(dir, f))).mtimeMs;
          }
          const label =
            (typeof meta.description === 'string' && meta.description) ||
            (typeof meta.agentType === 'string' && meta.agentType) ||
            'helper';
          return { id, label, finished: meta.finished === true, lastWrite };
        } catch {
          return null;
        }
      }),
  );
  return metas.filter((m): m is SubagentMeta => m !== null);
}

export function isActive(meta: SubagentMeta, now: number): boolean {
  return !meta.finished && now - meta.lastWrite < SUBAGENT_STALE_MS;
}
