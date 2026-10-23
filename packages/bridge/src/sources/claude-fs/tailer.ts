/**
 * Follows an append-only JSONL file by byte offset. Handles a file that does not exist yet,
 * partial trailing lines and truncation. Polling keeps it portable and predictable.
 */
import { open, stat } from 'node:fs/promises';

export interface TailerOptions {
  /** How many bytes of history to read on start (records delivered with live=false). */
  backlogBytes: number;
  pollMs: number;
}

export type RecordHandler = (record: unknown, live: boolean) => void;

export class JsonlTailer {
  private offset = -1;
  private remainder = '';
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  private stopped = false;

  constructor(
    readonly path: string,
    private readonly onRecord: RecordHandler,
    private readonly opts: TailerOptions = { backlogBytes: 512 * 1024, pollMs: 400 },
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.pollMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for tests: one poll step. */
  async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      let size: number;
      try {
        size = (await stat(this.path)).size;
      } catch {
        return; // not created yet
      }
      if (this.offset === -1) {
        const from = Math.max(0, size - this.opts.backlogBytes);
        await this.readRange(from, size, false, from > 0);
        return;
      }
      if (size < this.offset) {
        // Truncated or replaced: start over from the beginning, as live data.
        this.offset = 0;
        this.remainder = '';
      }
      if (size > this.offset) await this.readRange(this.offset, size, true, false);
    } finally {
      this.busy = false;
    }
  }

  private async readRange(from: number, to: number, live: boolean, dropFirstLine: boolean): Promise<void> {
    const fh = await open(this.path, 'r');
    try {
      const buf = Buffer.alloc(to - from);
      await fh.read(buf, 0, buf.length, from);
      this.offset = to;
      let text = this.remainder + buf.toString('utf8');
      if (dropFirstLine) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n');
      this.remainder = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.onRecord(JSON.parse(line), live);
        } catch {
          // A malformed line is skipped; the rest of the stream stays usable.
        }
      }
    } finally {
      await fh.close();
    }
  }
}
