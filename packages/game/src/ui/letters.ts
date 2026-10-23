/**
 * The mailbox: letters the little people type at the end of their work, read on paper,
 * typed out character by character and signed "Your friend, …".
 */
import { h } from '../engine/dom.ts';
import { plain } from '../engine/plain.ts';
import type { Letter } from '../sim/world.ts';

export class Letters {
  private readonly dialog: HTMLDialogElement;
  private readonly list: HTMLElement;
  private readonly reader: HTMLElement;
  private typing: number | undefined;

  constructor(
    private readonly letters: Letter[],
    private readonly onChange: () => void,
  ) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'letters';
    this.dialog.innerHTML = `
      <div class="letters-inner">
        <header><h2>MAILBOX</h2><button class="close" aria-label="Close">X</button></header>
        <div class="letters-body"><ul class="list"></ul><article class="reader" hidden></article></div>
      </div>`;
    document.body.append(this.dialog);
    this.list = this.dialog.querySelector('.list')!;
    this.reader = this.dialog.querySelector('.reader')!;
    this.dialog.querySelector('.close')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]');
      if (li) this.read(li.dataset.id!);
    });
    this.dialog.addEventListener('close', () => clearInterval(this.typing));
  }

  get open(): boolean {
    return this.dialog.open;
  }

  show(id?: string): void {
    this.renderList();
    if (!this.dialog.open) this.dialog.showModal();
    const first = id ?? this.letters.find((l) => !l.read)?.id ?? this.letters[0]?.id;
    if (first) this.read(first);
    else {
      this.reader.hidden = false;
      this.reader.textContent =
        'No letters yet. When a little person finishes a piece of work, they type you a letter.';
    }
  }

  renderList(): void {
    this.list.replaceChildren(
      ...this.letters.map((l) => {
        const t = new Date(l.at);
        const when = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
        return h(
          'li',
          { class: l.read ? 'read' : 'unread', data: { id: l.id } },
          h('b', {}, l.from),
          ' ',
          h('span', {}, when),
          h('br'),
          `${plain(l.text).slice(0, 60)}…`,
        );
      }),
    );
  }

  private read(id: string): void {
    const letter = this.letters.find((l) => l.id === id);
    if (!letter) return;
    letter.read = true;
    this.onChange();
    this.renderList();
    clearInterval(this.typing);
    this.reader.hidden = false;
    const body = `Dear friend,\n\n${plain(letter.text).replace(/^dear friend,?\s*/i, '')}\n\nYour friend,\n${letter.from}`;
    let i = 0;
    const step = Math.max(2, Math.ceil(body.length / 300));
    this.reader.textContent = '';
    this.typing = window.setInterval(() => {
      i = Math.min(body.length, i + step);
      this.reader.textContent = body.slice(0, i);
      if (i >= body.length) clearInterval(this.typing);
    }, 16);
  }
}
