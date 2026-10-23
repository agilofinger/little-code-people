/**
 * The "printer": a fan-fold paper log of everything the sessions say and do, with a tab per
 * person and a small profile card for the focused one.
 */
import type { LogEntry } from '@lcp/protocol';
import { h } from '../engine/dom.ts';
import { col } from '../engine/palette.ts';
import type { Person } from '../sim/person.ts';
import { SPOTS } from '../world/layout.ts';

const KEEP = 600;

const KIND_LABEL: Record<LogEntry['kind'], string> = {
  user: 'HEARS',
  speech: 'SAYS',
  thinking: 'THINKS',
  tool: 'DOES',
  error: 'OOPS',
  'message-out': 'WRITES',
  'message-in': 'GETS',
  helper: 'HELPER',
  system: 'NOTE',
};

export interface PanelActions {
  focus(id: string | null): void;
  openThought(id: string): void;
  hello(id: string): void;
  pat(id: string): void;
}

interface Line {
  entry: LogEntry | null;
  sessionId: string | null;
  name: string;
  color: string;
  text: string;
  kind: string;
  at: number;
}

export class Panel {
  private readonly tabs: HTMLElement;
  private readonly profile: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly paper: HTMLElement;
  private readonly lines: Line[] = [];
  focusId: string | null = null;
  private people: Person[] = [];
  private profileKey = '';

  constructor(
    root: HTMLElement,
    private readonly actions: PanelActions,
  ) {
    root.innerHTML = `
      <div class="printer-head" role="tablist" aria-label="Who to follow"></div>
      <div class="profile" hidden></div>
      <div class="paper" tabindex="0" aria-live="polite"><div class="feed"></div></div>`;
    this.tabs = root.querySelector('.printer-head')!;
    this.profile = root.querySelector('.profile')!;
    this.paper = root.querySelector('.paper')!;
    this.feed = root.querySelector('.feed')!;
    this.tabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
      if (btn) this.actions.focus(btn.dataset.id === 'all' ? null : btn.dataset.id!);
    });
    this.profile.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn || !this.focusId) return;
      if (btn.dataset.act === 'think') this.actions.openThought(this.focusId);
      if (btn.dataset.act === 'hello') this.actions.hello(this.focusId);
      if (btn.dataset.act === 'pat') this.actions.pat(this.focusId);
    });
    this.feed.addEventListener('click', (e) => {
      const line = (e.target as HTMLElement).closest('.ln');
      line?.classList.toggle('open');
    });
  }

  setPeople(people: Person[]): void {
    this.people = people;
    const btn = (id: string, label: string, color: string) =>
      h(
        'button',
        {
          attrs: { role: 'tab', 'aria-selected': String((this.focusId ?? 'all') === id) },
          data: { id },
          vars: { dot: color },
        },
        label,
      );
    this.tabs.replaceChildren(
      btn('all', 'EVERYONE', '#fff'),
      ...people.map((p) => {
        const state = p.mode === 'queued' ? ' ⌂' : p.info.status === 'waiting' ? ' !' : '';
        return btn(p.id, `${p.name}${state}`, col(p.app.slots.c ?? 1));
      }),
    );
    if (this.focusId && !people.some((p) => p.id === this.focusId)) this.setFocus(null);
    this.renderProfile();
  }

  setFocus(id: string | null): void {
    this.focusId = id;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
      b.setAttribute('aria-selected', String((id ?? 'all') === b.dataset.id));
    }
    this.renderProfile();
    this.feed.replaceChildren(...this.lines.filter((l) => this.visible(l)).map((l) => this.node(l)));
    this.scrollToEnd(true);
  }

  /** Refreshes the live parts of the profile card (status, activity). Cheap; call ~2×/s. */
  renderProfile(): void {
    const p = this.people.find((x) => x.id === this.focusId);
    if (!p) {
      this.profile.hidden = true;
      return;
    }
    this.profile.hidden = false;
    const where =
      p.mode === 'queued'
        ? 'waiting outside (house full)'
        : p.spot
          ? SPOTS[p.spot].label.toLowerCase()
          : p.moving
            ? 'walking'
            : 'standing around';
    const activity = p.activity ? `${p.activity.tool ?? p.activity.kind}: ${p.activity.label}` : '–';
    const color = col(p.app.slots.c ?? 1);
    const status = p.info.waitingFor ? `${p.info.status} – ${p.info.waitingFor}` : p.info.status;
    const rows: [string, string][] = [
      ['STATUS', status],
      ['DOING', activity],
      ['WHERE', where],
      ['MOOD', p.moodName],
    ];
    // Rebuild only when something changed, so the buttons don't flicker under the cursor.
    const key = JSON.stringify([p.id, p.name, p.info.project, color, rows]);
    if (this.profileKey === key) return;
    this.profileKey = key;
    const act = (name: string, label: string) => h('button', { data: { act: name } }, label);
    this.profile.replaceChildren(
      h(
        'div',
        { class: 'who', vars: { dot: color } },
        h('b', {}, p.name),
        ' ',
        h('span', {}, p.info.project),
      ),
      h('dl', {}, ...rows.flatMap(([dt, dd]) => [h('dt', {}, dt), h('dd', {}, dd)])),
      h('div', { class: 'acts' }, act('think', 'READ MIND'), act('hello', 'SAY HELLO'), act('pat', 'PAT')),
    );
  }

  append(entry: LogEntry, p: Person): void {
    if (entry.kind === 'thinking' && !entry.text.trim()) return;
    let text = entry.text;
    if (entry.kind === 'tool' && entry.tool && entry.tool !== entry.text)
      text = `${entry.tool}: ${entry.text}`;
    if (entry.kind === 'message-out') text = `to ${entry.peerName ?? '?'}: ${entry.text}`;
    if (entry.kind === 'message-in') text = `from ${entry.peerName ?? '?'}: ${entry.text}`;
    this.push({
      entry,
      sessionId: p.id,
      name: p.name,
      color: col(p.app.slots.c ?? 1),
      text,
      kind: entry.kind,
      at: entry.at,
    });
  }

  system(text: string): void {
    this.push({
      entry: null,
      sessionId: null,
      name: 'HOUSE',
      color: '#fff',
      text,
      kind: 'house',
      at: Date.now(),
    });
  }

  /** Drops the lines of these sessions (e.g. the demo's, once real sessions arrive). */
  forget(ids: ReadonlySet<string>): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const id = this.lines[i]!.sessionId;
      if (id && ids.has(id)) this.lines.splice(i, 1);
    }
    this.feed.replaceChildren(...this.lines.filter((l) => this.visible(l)).map((l) => this.node(l)));
    this.scrollToEnd(true);
  }

  private push(line: Line): void {
    this.lines.push(line);
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
    if (!this.visible(line)) return;
    const stick = this.atEnd();
    this.feed.append(this.node(line));
    while (this.feed.childElementCount > KEEP) this.feed.firstElementChild?.remove();
    if (stick) this.scrollToEnd(false);
  }

  private visible(l: Line): boolean {
    return this.focusId === null || l.sessionId === this.focusId || l.sessionId === null;
  }

  private node(l: Line): HTMLElement {
    const t = new Date(l.at);
    const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const label = l.entry ? KIND_LABEL[l.entry.kind] : 'HOUSE';
    return h(
      'div',
      { class: `ln k-${l.kind}` },
      h('span', { class: 't' }, time),
      ' ',
      h('span', { class: 'who', vars: { dot: l.color } }, l.name),
      ' ',
      h('span', { class: 'k' }, label),
      ' ',
      h('span', { class: 'txt' }, l.text),
    );
  }

  private atEnd(): boolean {
    return this.paper.scrollHeight - this.paper.scrollTop - this.paper.clientHeight < 40;
  }

  private scrollToEnd(force: boolean): void {
    if (force || this.atEnd()) this.paper.scrollTop = this.paper.scrollHeight;
  }
}
