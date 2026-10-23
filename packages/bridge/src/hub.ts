/**
 * The hub keeps the live picture of all sessions on this machine and emits protocol events.
 * Sources (currently the Claude Code filesystem) feed it; the server broadcasts its events.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type Activity,
  critterFor,
  fnv1a,
  type LogEntry,
  PROTOCOL_VERSION,
  type ServerEvent,
  type SessionInfo,
  type SessionSnapshot,
  type Subagent,
} from '@lcp/protocol';
import { type Normalized, normalizeRecord } from './sources/claude-fs/normalize.ts';
import {
  claudeDir,
  projectsDir,
  sessionsDir,
  subagentsDir,
  transcriptPath,
} from './sources/claude-fs/paths.ts';
import {
  displayName,
  isAlive,
  personId,
  type RegistryEntry,
  readRegistry,
} from './sources/claude-fs/registry.ts';
import { isActive, readSubagents } from './sources/claude-fs/subagents.ts';
import { JsonlTailer } from './sources/claude-fs/tailer.ts';

const LOG_KEEP = 80;

interface Tracked {
  info: SessionInfo;
  entry: RegistryEntry;
  log: LogEntry[];
  activity: Activity | null;
  subagents: Map<string, Subagent>;
  tailer: JsonlTailer | null;
  transcript: string | null;
  /** True once the backlog has been read; before that nothing is emitted. */
  live: boolean;
  /** Peer resolved from the latest SendMessage, attached to the message-out log line. */
  pendingPeer: { id: string; name: string } | undefined;
}

export type Listener = (event: ServerEvent) => void;

export interface HubOptions {
  root?: string;
  registryPollMs?: number;
  subagentPollMs?: number;
}

export class Hub {
  private readonly sessions = new Map<string, Tracked>();
  private readonly listeners = new Set<Listener>();
  private readonly root: string;
  private timers: NodeJS.Timeout[] = [];
  private uid = 0;
  private polling = false;

  constructor(private readonly opts: HubOptions = {}) {
    this.root = opts.root ?? claudeDir();
  }

  start(): void {
    void this.pollRegistry();
    this.timers.push(setInterval(() => void this.pollRegistry(), this.opts.registryPollMs ?? 1000));
    this.timers.push(setInterval(() => void this.pollSubagents(), this.opts.subagentPollMs ?? 1500));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    for (const s of this.sessions.values()) s.tailer?.stop();
    this.sessions.clear();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  hello(): ServerEvent {
    return {
      type: 'hello',
      version: PROTOCOL_VERSION,
      host: basename(process.env.HOME ?? 'home'),
      sessions: [...this.sessions.values()].map((s) => this.snapshot(s)),
    };
  }

  private emit(event: ServerEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  private snapshot(s: Tracked): SessionSnapshot {
    return { ...s.info, log: [...s.log], activity: s.activity, subagents: [...s.subagents.values()] };
  }

  /** Exposed for tests. */
  async pollRegistry(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const entries = await readRegistry(sessionsDir(this.root));
      const seen = new Set<string>();
      for (const entry of entries) {
        const id = personId(entry);
        seen.add(id);
        const existing = this.sessions.get(id);
        if (!existing) await this.join(id, entry);
        else this.update(existing, entry);
      }
      for (const [id, s] of this.sessions) {
        if (seen.has(id)) continue;
        s.tailer?.stop();
        this.sessions.delete(id);
        this.emit({ type: 'session.left', id, reason: isAlive(s.entry.pid) ? 'closed' : 'crashed' });
      }
    } finally {
      this.polling = false;
    }
  }

  private infoFor(id: string, entry: RegistryEntry): SessionInfo {
    const info: SessionInfo = {
      id,
      pid: entry.pid,
      name: displayName(entry),
      cwd: entry.cwd,
      project: basename(entry.cwd),
      kind: entry.kind,
      startedAt: entry.startedAt,
      status: entry.status,
      look: fnv1a(id),
    };
    if (entry.waitingFor) info.waitingFor = entry.waitingFor;
    return info;
  }

  private async join(id: string, entry: RegistryEntry): Promise<void> {
    const s: Tracked = {
      info: this.infoFor(id, entry),
      entry,
      log: [],
      activity: null,
      subagents: new Map(),
      tailer: null,
      transcript: null,
      live: false,
      pendingPeer: undefined,
    };
    this.sessions.set(id, s);
    await this.attachTranscript(s);
    await this.pollSubagentsFor(s, false);
    s.live = true;
    this.emit({ type: 'session.joined', session: this.snapshot(s) });
  }

  private update(s: Tracked, entry: RegistryEntry): void {
    const sessionChanged = entry.sessionId !== s.entry.sessionId;
    const prev = s.info;
    s.entry = entry;
    s.info = this.infoFor(s.info.id, entry);
    if (sessionChanged) {
      // /clear or /resume: same little person, new transcript.
      s.tailer?.stop();
      s.tailer = null;
      s.subagents.clear();
      this.pushLog(s, { kind: 'system', text: 'started a fresh conversation' }, Date.now());
      void this.attachTranscript(s);
    }
    if (
      prev.status !== s.info.status ||
      prev.name !== s.info.name ||
      prev.waitingFor !== s.info.waitingFor ||
      prev.cwd !== s.info.cwd
    ) {
      this.emit({ type: 'session.updated', session: s.info });
    }
  }

  private async findTranscript(entry: RegistryEntry): Promise<string | null> {
    const direct = transcriptPath(entry.cwd, entry.sessionId, this.root);
    if (existsSync(direct)) return direct;
    try {
      for (const dir of await readdir(projectsDir(this.root))) {
        const candidate = join(projectsDir(this.root), dir, `${entry.sessionId}.jsonl`);
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      // no projects dir yet
    }
    // Not written yet (fresh session without a prompt): follow the expected path.
    return direct;
  }

  private async attachTranscript(s: Tracked): Promise<void> {
    const path = await this.findTranscript(s.entry);
    if (!path) return;
    s.transcript = path;
    const tailer = new JsonlTailer(path, (record, live) => this.onRecord(s, record, live));
    s.tailer = tailer;
    await tailer.tick(); // read backlog synchronously before announcing the session
    tailer.start();
  }

  private onRecord(s: Tracked, record: unknown, live: boolean): void {
    if (!this.sessions.has(s.info.id)) return;
    const norm = normalizeRecord(record);
    if (!norm) return;
    const emit = live && s.live;
    for (const item of norm.items) this.apply(s, item, norm.at, emit);
  }

  private apply(s: Tracked, item: Normalized, at: number, emit: boolean): void {
    switch (item.t) {
      case 'log': {
        const extra: Partial<LogEntry> = {};
        if (item.final !== undefined) extra.final = item.final;
        if (item.tool) extra.tool = item.tool;
        if (item.peerPid !== undefined) {
          const peer = this.byPid(item.peerPid);
          extra.peer = peer?.info.id ?? `pid:${item.peerPid}`;
          extra.peerName = peer?.info.name ?? item.peerName ?? `PID ${item.peerPid}`;
        }
        this.pushLog(s, { kind: item.kind, text: item.text, ...extra }, at, emit);
        return;
      }
      case 'activity': {
        const activity: Activity = { kind: item.kind, label: item.label, at };
        if (item.tool) activity.tool = item.tool;
        s.activity = activity;
        if (emit) this.emit({ type: 'session.activity', id: s.info.id, activity });
        return;
      }
      case 'mood':
        if (emit) this.emit({ type: 'session.mood', id: s.info.id, delta: item.delta, reason: item.reason });
        return;
      case 'message': {
        const target = this.resolveAddress(item.toAddress);
        if (target && emit) {
          this.emit({
            type: 'session.message',
            from: s.info.id,
            to: target.info.id,
            preview: item.preview,
            at,
          });
        }
        // Annotate the message-out log line that follows with the peer.
        s.pendingPeer = target ? { id: target.info.id, name: target.info.name } : undefined;
        return;
      }
    }
  }

  private pushLog(
    s: Tracked,
    partial: Omit<LogEntry, 'uid' | 'sessionId' | 'at'>,
    at: number,
    emit = true,
  ): LogEntry {
    const entry: LogEntry = { uid: `${++this.uid}`, sessionId: s.info.id, at, ...partial };
    if (entry.kind === 'message-out' && s.pendingPeer) {
      entry.peer = s.pendingPeer.id;
      entry.peerName = s.pendingPeer.name;
      s.pendingPeer = undefined;
    }
    s.log.push(entry);
    if (s.log.length > LOG_KEEP) s.log.splice(0, s.log.length - LOG_KEEP);
    if (emit && s.live) this.emit({ type: 'session.log', entry });
    return entry;
  }

  private byPid(pid: number): Tracked | undefined {
    for (const s of this.sessions.values()) if (s.entry.pid === pid) return s;
    return undefined;
  }

  /** SendMessage addresses: "uds:/tmp/cc-socks/<pid>.sock", a socket path, or a session name. */
  resolveAddress(address: string): Tracked | undefined {
    const sock = address.replace(/^uds:/, '');
    for (const s of this.sessions.values()) if (s.entry.messagingSocketPath === sock) return s;
    const pid = sock.match(/(\d+)\.sock$/)?.[1];
    if (pid) return this.byPid(Number(pid));
    const name = address.trim().toUpperCase();
    for (const s of this.sessions.values()) if (s.info.name === name) return s;
    return undefined;
  }

  private async pollSubagents(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.pollSubagentsFor(s, true)));
  }

  private async pollSubagentsFor(s: Tracked, emit: boolean): Promise<void> {
    if (!s.transcript) return;
    const now = Date.now();
    const metas = await readSubagents(subagentsDir(s.transcript));
    const active = new Set<string>();
    for (const meta of metas) {
      if (!isActive(meta, now)) continue;
      active.add(meta.id);
      if (s.subagents.has(meta.id)) continue;
      const sub: Subagent = { id: meta.id, label: meta.label, critter: critterFor(meta.id), startedAt: now };
      s.subagents.set(meta.id, sub);
      if (emit) {
        this.emit({ type: 'subagent.started', parentId: s.info.id, subagent: sub });
        this.pushLog(s, { kind: 'helper', text: `sent a little ${sub.critter} off to: ${sub.label}` }, now);
      }
    }
    for (const id of [...s.subagents.keys()]) {
      if (active.has(id)) continue;
      s.subagents.delete(id);
      if (emit) this.emit({ type: 'subagent.finished', parentId: s.info.id, subagentId: id });
    }
  }
}
