import { homedir } from 'node:os';
import { join } from 'node:path';

/** Root of Claude Code's local state. Honors CLAUDE_CONFIG_DIR like Claude Code itself. */
export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

export const sessionsDir = (root = claudeDir()) => join(root, 'sessions');
export const projectsDir = (root = claudeDir()) => join(root, 'projects');

/**
 * Claude Code stores transcripts under a slug of the working directory in which every
 * non-alphanumeric character becomes "-": /Users/a/code_1 → -Users-a-code-1
 */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

export function transcriptPath(cwd: string, sessionId: string, root = claudeDir()): string {
  return join(projectsDir(root), projectSlug(cwd), `${sessionId}.jsonl`);
}

export function subagentsDir(transcript: string): string {
  return join(transcript.replace(/\.jsonl$/, ''), 'subagents');
}
