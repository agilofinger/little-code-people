/**
 * Turns one raw Claude Code transcript record into zero or more normalized items.
 * Pure and synchronous: all format knowledge of transcript records lives here.
 * Verified against Claude Code 2.1.30x transcripts.
 */
import type { ActivityKind, LogKind } from '@lcp/protocol';
import { redact } from '../../redact.ts';

export type Normalized =
  | {
      t: 'log';
      kind: LogKind;
      text: string;
      final?: boolean;
      tool?: string;
      peerPid?: number;
      peerName?: string;
    }
  | { t: 'activity'; kind: ActivityKind; tool?: string; label: string }
  | { t: 'mood'; delta: number; reason: string }
  | { t: 'message'; toAddress: string; preview: string };

export interface NormalizedRecord {
  at: number;
  items: Normalized[];
}

const MAX_TEXT = 6000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function cleanText(raw: string): string {
  return redact(
    raw
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escapes
      .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
      .trim(),
  ).slice(0, MAX_TEXT);
}

/** "mcp__plugin_linear_linear__save_issue" → "linear: save issue" */
export function prettyTool(name: string): string {
  if (!name.startsWith('mcp__')) return name;
  const parts = name.slice(5).split('__');
  const server = (parts[0] ?? '')
    .replace(/^plugin_/, '')
    .replace(/^claude_ai_/, '')
    .split('_')[0];
  const tool = (parts[1] ?? '').replace(/_/g, ' ');
  return `${server}: ${tool}`;
}

export function activityKindFor(tool: string): ActivityKind {
  if (/^(Bash|BashOutput|KillShell|KillBash|Monitor|TaskStop)$/.test(tool)) return 'shell';
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return 'edit';
  if (tool === 'Read') return 'read';
  if (/^(Grep|Glob|LS|ToolSearch)$/.test(tool)) return 'search';
  if (
    /^(WebFetch|WebSearch)$/.test(tool) ||
    /^mcp__(claude-in-chrome|plugin_playwright|Claude_Browser)/.test(tool)
  )
    return 'web';
  if (/^(Agent|Task|Workflow)$/.test(tool)) return 'subagent';
  if (/^(SendMessage|ListAgents)$/.test(tool)) return 'message';
  return 'tool';
}

const basename = (p: string) => p.split('/').filter(Boolean).pop() ?? p;
const firstLine = (s: string, n = 90) => {
  const line = s.split('\n')[0] ?? '';
  return line.length > n ? `${line.slice(0, n - 1)}…` : line;
};

export function toolLabel(name: string, input: Obj): string {
  switch (name) {
    case 'Bash':
      return firstLine(str(input.description) || str(input.command));
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return basename(str(input.file_path) || str(input.notebook_path));
    case 'Grep':
    case 'Glob':
      return firstLine(str(input.pattern));
    case 'WebFetch':
      try {
        return new URL(str(input.url)).hostname;
      } catch {
        return firstLine(str(input.url));
      }
    case 'WebSearch':
      return firstLine(str(input.query));
    case 'Agent':
    case 'Task':
      return firstLine(str(input.description) || str(input.subagent_type) || 'helper');
    case 'SendMessage':
      return firstLine(str(input.summary) || str(input.message));
    case 'Skill':
      return str(input.skill);
    default:
      return prettyTool(name);
  }
}

const POSITIVE =
  /\b(thanks|thank you|thx|great|awesome|perfect|nice|good job|well done|love it|brilliant|excellent|danke|super|toll|klasse|geil|cool)\b/i;
const NEGATIVE =
  /\b(wrong|broken|doesn'?t work|not working|bad|terrible|useless|stop|undo|revert|falsch|kaputt|schlecht|nein)\b/i;

function moodFromPrompt(text: string): Normalized | null {
  if (POSITIVE.test(text)) return { t: 'mood', delta: 2, reason: 'praised' };
  if (NEGATIVE.test(text)) return { t: 'mood', delta: -1, reason: 'scolded' };
  return null;
}

/** Cleans a human prompt; returns '' for records that are not something the human said. */
export function cleanPrompt(raw: string): string {
  const text = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!text) return '';
  if (/^<local-command-(stdout|stderr|caveat)>/.test(text)) return '';
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd) {
    const args = text.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim();
    return cleanText(`${cmd[1]}${args ? ` ${args}` : ''}`);
  }
  if (text.startsWith('<') && /^<[a-z-]+[ >]/.test(text) && !text.startsWith('<pasted')) return '';
  return cleanText(text);
}

function userPrompt(text: string, items: Normalized[]): void {
  const t = cleanPrompt(text);
  if (!t) return;
  items.push({ t: 'log', kind: 'user', text: t });
  items.push({ t: 'activity', kind: 'think', label: 'reading your message' });
  const mood = moodFromPrompt(t);
  if (mood) items.push(mood);
}

function stripCrossSessionWrapper(prompt: string): string {
  return prompt
    .replace(/^<cross-session-message[^>]*>/, '')
    .replace(/<\/cross-session-message>\s*$/, '')
    .trim();
}

export function normalizeRecord(record: unknown): NormalizedRecord | null {
  if (!isObj(record)) return null;
  const at = Date.parse(str(record.timestamp)) || Date.now();
  const items: Normalized[] = [];
  const type = record.type;
  if (record.isSidechain === true) return null;

  if (type === 'assistant' && isObj(record.message)) {
    const msg = record.message;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const endTurn = msg.stop_reason === 'end_turn';
    for (const block of content) {
      if (!isObj(block)) continue;
      if (block.type === 'text') {
        const text = cleanText(str(block.text));
        if (text) items.push({ t: 'log', kind: 'speech', text, final: endTurn });
      } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        items.push({ t: 'log', kind: 'thinking', text: cleanText(str(block.thinking)) });
        items.push({ t: 'activity', kind: 'think', label: 'thinking' });
      } else if (block.type === 'tool_use') {
        const name = str(block.name);
        const input = isObj(block.input) ? block.input : {};
        const label = cleanText(toolLabel(name, input));
        const kind = activityKindFor(name);
        items.push({ t: 'activity', kind, tool: name, label });
        if (name === 'SendMessage') {
          const preview = cleanText(str(input.message) || str(input.summary));
          items.push({ t: 'message', toAddress: str(input.to), preview });
          items.push({ t: 'log', kind: 'message-out', text: preview, tool: name });
        } else {
          items.push({ t: 'log', kind: 'tool', text: label, tool: prettyTool(name) });
        }
      }
    }
    return { at, items };
  }

  if (type === 'user' && isObj(record.message) && record.isMeta !== true) {
    const content = record.message.content;
    if (typeof content === 'string') {
      userPrompt(content, items);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!isObj(block)) continue;
        if (block.type === 'tool_result') {
          if (block.is_error === true) {
            const raw = Array.isArray(block.content)
              ? block.content.map((c) => (isObj(c) ? str(c.text) : '')).join('\n')
              : str(block.content);
            const text = cleanText(raw).slice(0, 400);
            // A denied permission is not a failure of the little person.
            const denied = /user (doesn't want|denied|rejected)|permission/i.test(text);
            items.push({ t: 'log', kind: 'error', text: text || 'tool error' });
            if (!denied) items.push({ t: 'mood', delta: -1, reason: 'tool error' });
          }
          items.push({ t: 'activity', kind: 'think', label: 'pondering the result' });
        } else if (block.type === 'text') {
          userPrompt(str(block.text), items);
        }
      }
    }
    return items.length ? { at, items } : null;
  }

  if (type === 'attachment' && isObj(record.attachment)) {
    const att = record.attachment;
    if (att.type !== 'queued_command') return null;
    const origin = isObj(att.origin) ? att.origin : {};
    const body = cleanText(str(origin.body) || stripCrossSessionWrapper(str(att.prompt)));
    if (origin.kind === 'peer') {
      const pid = typeof origin.verifiedPeerPid === 'number' ? origin.verifiedPeerPid : undefined;
      if (pid !== undefined) {
        const entry: Normalized = { t: 'log', kind: 'message-in', text: body, peerPid: pid };
        if (str(origin.name)) entry.peerName = str(origin.name).toUpperCase();
        items.push(entry);
      } else {
        // A subagent handing back its report.
        items.push({
          t: 'log',
          kind: 'helper',
          text: `${str(origin.name) || 'a helper'} came back with a report`,
        });
      }
    } else if (origin.kind === 'human' || origin.kind === undefined) {
      userPrompt(str(att.prompt), items);
    }
    return items.length ? { at, items } : null;
  }

  if (type === 'system' && record.subtype === 'compact_boundary') {
    items.push({ t: 'log', kind: 'system', text: 'tidied up its memory (compacted)' });
    return { at, items };
  }

  return null;
}
