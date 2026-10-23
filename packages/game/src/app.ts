/**
 * Wires everything together: the world, the renderer, sound, the event source (bridge or demo),
 * the printer panel, the mailbox, the command line and notifications.
 */
import type { ServerEvent } from '@lcp/protocol';
import { isLoopback } from '../security.ts';
import { Sounds } from './audio/sounds.ts';
import { plain } from './engine/plain.ts';
import {
  BridgeClient,
  type ConnectionState,
  isLocalBridge,
  resolveBridge,
  type StoredBridge,
} from './net/bridge.ts';
import { DemoSource } from './net/demo.ts';
import { drawScene } from './render/scene.ts';
import type { Person } from './sim/person.ts';
import { CAPACITY, World } from './sim/world.ts';
import { HELP_TEXT, parseCommand, willing } from './ui/command.ts';
import { Letters } from './ui/letters.ts';
import { Panel } from './ui/panel.ts';
import { Strip } from './ui/strip.ts';
import { ThoughtCloud } from './ui/thought.ts';
import { HouseRenderer } from './world/house-render.ts';
import { H, W } from './world/layout.ts';
import { type Holiday, THEME_CHOICES, type Theme, type ThemeChoice, themeFor } from './world/season.ts';

const DT = 1 / 50; // PAL frame rate, like the C64
const PREFS_KEY = 'lcp.prefs.v1';
const BRIDGE_KEY = 'lcp.bridge.v1';
/** Keys that scroll an open thought cloud, in lines. */
const CLOUD_KEYS: Record<string, number> = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: 10,
  PageUp: -10,
  End: 1e6,
  Home: -1e6,
};

const DEMO_TEXT = {
  asked: 'WELCOME TO THE DEMO HOUSE.',
  local: 'NOBODY HOME YET... THIS IS THE DEMO HOUSE. RUN "NPM START" TO SEE YOUR OWN CLAUDE CODE SESSIONS.',
  hosted:
    'WELCOME TO THE DEMO HOUSE. TO SEE YOUR OWN CLAUDE CODE SESSIONS, RUN LITTLE CODE PEOPLE ON YOUR COMPUTER AND OPEN THE LINK IT PRINTS.',
  away: 'NOBODY HOME YET... START LITTLE CODE PEOPLE ON THIS COMPUTER TO SEE YOUR OWN CLAUDE CODE SESSIONS.',
  locked: 'THE BRIDGE IS RUNNING BUT NEEDS YOUR KEY. OPEN THE LINK IT PRINTED IN THE TERMINAL.',
};

interface Prefs {
  sound: boolean;
  names: boolean;
  balloons: boolean;
  crt: boolean;
  notify: boolean;
  theme: ThemeChoice;
}
type Toggle = Exclude<keyof Prefs, 'theme'>;

const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: 'AUTO',
  christmas: 'XMAS',
  halloween: 'HALLOWEEN',
  easter: 'EASTER',
  spring: 'SPRING',
  summer: 'SUMMER',
  autumn: 'AUTUMN',
  winter: 'WINTER',
  off: 'OFF',
};
const GREETING: Record<Holiday, string> = {
  christmas: 'MERRY CHRISTMAS FROM ALL THE LITTLE PEOPLE!',
  halloween: 'HAPPY HALLOWEEN! WATCH OUT FOR BATS.',
  easter: 'HAPPY EASTER! THE BUNNY HID SOME EGGS AROUND THE HOUSE.',
};

function loadPrefs(): Prefs {
  const defaults: Prefs = {
    sound: true,
    names: true,
    balloons: true,
    crt: true,
    notify: false,
    theme: 'auto',
  };
  try {
    const stored = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    if (!(THEME_CHOICES as readonly string[]).includes(stored.theme)) stored.theme = 'auto';
    return stored;
  } catch {
    return defaults;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // private mode: preferences just don't persist
  }
}

function loadStoredBridge(): StoredBridge | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(BRIDGE_KEY) ?? 'null');
    if (typeof v !== 'object' || v === null) return null;
    const { token, bridge } = v as Record<string, unknown>;
    if (typeof token !== 'string' || !token) return null;
    return typeof bridge === 'string' && isLocalBridge(bridge) ? { token, bridge } : { token };
  } catch {
    return null;
  }
}

function saveStoredBridge(s: StoredBridge | null): void {
  try {
    if (s) localStorage.setItem(BRIDGE_KEY, JSON.stringify(s));
  } catch {
    // private mode: the link has to be opened again next time
  }
}

export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly house = new HouseRenderer();
  private readonly sounds = new Sounds();
  private readonly strip = new Strip();
  private readonly thought = new ThoughtCloud();
  private readonly world: World;
  private readonly panel: Panel;
  private readonly letters: Letters;
  private readonly input: HTMLInputElement;
  private readonly prefs = loadPrefs();
  private focusId: string | null = null;
  private hoverId: string | null = null;
  private bridge: BridgeClient | null = null;
  private demo: DemoSource | null = null;
  private connection: ConnectionState = 'connecting';
  private lastFrame = performance.now();
  private acc = 0;
  private profileAt = 0;
  private holiday: Holiday | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <main class="desk">
        <section class="monitor" aria-label="The house">
          <div class="bezel">
            <div class="screen"><canvas width="${W}" height="${H}" aria-label="Little Code People house"></canvas><div class="crt"></div></div>
          </div>
          <div class="badge"><span>LITTLE CODE PEOPLE</span><span class="conn" aria-live="polite"></span><span class="led"></span></div>
          <div class="controls">
            <button data-pref="sound"></button>
            <button data-pref="names"></button>
            <button data-pref="balloons"></button>
            <button data-pref="crt"></button>
            <button data-pref="notify"></button>
            <button data-act="theme"></button>
            <button data-act="mail">MAILBOX</button>
            <button data-act="visitor" hidden>RING THE BELL</button>
          </div>
          <p class="hint">Click a person to follow them and look into their head: thoughts and the last answer. Type to talk: <kbd>HELLO NAME</kbd>, <kbd>PLEASE PLAY PIANO</kbd>.</p>
        </section>
        <section class="printer" aria-label="Session log"></section>
      </main>
      <input class="cmd-input" aria-label="Command line" autocomplete="off" spellcheck="false" maxlength="120">`;

    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.input = root.querySelector('.cmd-input')!;

    this.world = new World({
      sfx: (name, opts) => this.sounds.sfx(name, opts),
      announce: (text) => this.strip.push(text, 1),
      notify: (title, body) => this.notify(title, body),
      typed: (name, text) => this.strip.push(`${name}, ${plain(text)}`, 0),
      log: (entry, p) => this.panel.append(entry, p),
      letter: (letter) => {
        this.strip.push(`${letter.from} TYPED YOU A LETTER. CLICK THE MAILBOX.`, 1);
        this.updateMailButton();
      },
      roster: () => this.panel.setPeople(this.roster()),
    });
    this.panel = new Panel(root.querySelector('.printer')!, {
      focus: (id) => this.setFocus(id),
      openThought: (id) => {
        const p = this.world.people.get(id);
        if (p) this.thought.open(p, Date.now());
      },
      hello: (id) => this.command(`hello ${this.world.people.get(id)?.name ?? ''}`),
      pat: (id) => this.command(`please pat ${this.world.people.get(id)?.name ?? ''}`),
    });
    this.letters = new Letters(this.world.letters, () => this.updateMailButton());

    this.bindControls(root);
    this.bindInput();
    this.applyPrefs();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.panel.system(
      'Little Code People started. The printer logs everything the little people say and do.',
    );
  }

  start(): void {
    if (import.meta.env.DEV) Object.assign(window, { __lcp: { world: this.world, app: this } });
    if (new URLSearchParams(location.search).has('demo')) this.startDemo(DEMO_TEXT.asked);
    else {
      this.connect();
      // Opening a new link (with a new key) in the same tab reconnects.
      window.addEventListener('hashchange', () => this.connect());
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ sources
  private connect(): void {
    const { target, store } = resolveBridge(location, loadStoredBridge());
    saveStoredBridge(store);
    // The key is stored now; keep it out of the address bar, screenshots and shared links.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    this.bridge?.stop();
    this.bridge = null;
    if (!target) {
      this.startDemo(DEMO_TEXT.hosted);
      return;
    }
    this.bridge = new BridgeClient(target, {
      event: (e) => this.onBridgeEvent(e),
      state: (s) => this.onConnection(s),
    });
    this.bridge.start();
    // No bridge after a few seconds: show the demo house while we keep trying.
    window.setTimeout(() => {
      if (this.connection === 'live' || this.demo) return;
      this.startDemo(isLoopback(location.hostname) ? DEMO_TEXT.local : DEMO_TEXT.away);
    }, 3000);
  }

  private startDemo(text: string): void {
    this.strip.push(text, 2);
    if (this.demo) return;
    this.demo = new DemoSource((e) => this.world.apply(e));
    this.demo.start();
    this.root.querySelector<HTMLButtonElement>('[data-act="visitor"]')!.hidden = false;
    this.renderConnection();
  }

  private onBridgeEvent(e: ServerEvent): void {
    if (e.type === 'hello' && this.demo) {
      // The demo's people, letters and printer lines go at once, so only real ones remain and
      // nobody has to wait outside behind made-up residents.
      const ids = this.demo.ids;
      this.demo.stop();
      this.demo = null;
      this.world.forget(ids);
      this.panel.forget(ids);
      this.letters.renderList();
      this.updateMailButton();
      this.root.querySelector<HTMLButtonElement>('[data-act="visitor"]')!.hidden = true;
      this.strip.push('CONNECTED! YOUR CLAUDE CODE SESSIONS ARE MOVING IN.', 2);
      this.renderConnection();
    }
    this.world.apply(e);
  }

  private onConnection(s: ConnectionState): void {
    const was = this.connection;
    this.connection = s;
    if (s === 'live' && was !== 'live') this.panel.system('Connected to the bridge.');
    if (s === 'offline' && was === 'live') {
      this.panel.system('Lost the bridge. Retrying…');
      this.strip.push('LOST CONTACT WITH THE BRIDGE. TRYING AGAIN...', 2);
    }
    if (s === 'locked') {
      this.panel.system(
        'The bridge is running but needs your key. Open the link it printed in the terminal.',
      );
      this.startDemo(DEMO_TEXT.locked);
    }
    this.renderConnection();
  }

  private renderConnection(): void {
    const el = this.root.querySelector('.conn')!;
    el.textContent =
      this.connection === 'locked'
        ? 'KEY?'
        : this.demo
          ? 'DEMO'
          : this.connection === 'live'
            ? 'LIVE'
            : this.connection === 'connecting'
              ? '…'
              : 'OFFLINE';
    const led = this.connection === 'locked' ? 'offline' : this.demo ? 'demo' : this.connection;
    this.root.querySelector('.led')!.className = `led ${led}`;
  }

  private get root(): HTMLElement {
    return this.canvas.closest('.desk')!.parentElement!;
  }

  // ------------------------------------------------------------------ loop
  private frame(t: number): void {
    this.acc += Math.min(0.25, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    const now = Date.now();
    while (this.acc >= DT) {
      this.world.update(DT, now);
      this.acc -= DT;
    }
    const theme = this.theme();
    this.sounds.update(this.world, theme);
    const tick8 = Math.floor(now / 125); // 8 fps animation, the 8-bit way
    drawScene(this.ctx, this.world, this.house, {
      tick8,
      now,
      focusId: this.focusId,
      hoverId: this.hoverId,
      showNames: this.prefs.names,
      showBalloons: this.prefs.balloons,
      theme,
    });
    if (this.thought.personId) {
      const p = this.world.people.get(this.thought.personId);
      if (!p || p.mode === 'gone') this.thought.close();
      else this.thought.draw(this.ctx, p, now);
    }
    this.strip.draw(this.ctx, now);
    if (now - this.profileAt > 500) {
      this.panel.renderProfile();
      this.profileAt = now;
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  /** Largest scale that fits, snapped to whole device pixels so the pixels stay crisp. */
  private resize(): void {
    const column = this.canvas.closest('.monitor')!.getBoundingClientRect().width;
    const sideBySide = window.innerWidth > 1100;
    const availW = column - 92; // bezel + screen padding
    const availH = sideBySide ? window.innerHeight - 190 : window.innerHeight * 0.8;
    const dpr = window.devicePixelRatio || 1;
    const device = Math.max(1, Math.floor(Math.min((availW * dpr) / W, (availH * dpr) / H)));
    this.canvas.style.width = `${(W * device) / dpr}px`;
    this.canvas.style.height = `${(H * device) / dpr}px`;
  }

  // ------------------------------------------------------------------ input
  private toScreen(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  private bindInput(): void {
    const unlock = () => this.sounds.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.canvas.addEventListener('click', (e) => {
      const { x, y } = this.toScreen(e);
      if (this.thought.personId) {
        const b = this.thought.box;
        const onClose = x >= b.x + b.w - 10 && y <= b.y + 10;
        if (!this.thought.contains(x, y) || onClose) this.thought.close();
        return;
      }
      if (x >= 294 && x <= 310 && y >= 145 && y <= 160) {
        this.letters.show();
        return;
      }
      const p = this.world.personAt(x, y);
      if (p) {
        this.setFocus(p.id);
        this.thought.open(p, Date.now());
        return;
      }
      const c = this.world.critterAt(x, y);
      if (c) {
        const parent = this.world.people.get(c.parentId);
        this.strip.push(
          `A LITTLE ${c.kind.toUpperCase()} RUNNING AN ERRAND FOR ${parent?.name ?? 'SOMEONE'}: ${c.label}`,
          2,
        );
        return;
      }
      this.setFocus(null);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      const { x, y } = this.toScreen(e);
      const id = this.world.personAt(x, y)?.id ?? null;
      const overMail = x >= 294 && x <= 310 && y >= 145 && y <= 160;
      this.canvas.style.cursor = id || overMail || this.world.critterAt(x, y) ? 'pointer' : 'default';
      this.hoverId = id;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        const { x, y } = this.toScreen(e);
        if (this.thought.contains(x, y)) {
          e.preventDefault();
          this.thought.scrollBy(Math.sign(e.deltaY) * 2);
        }
      },
      { passive: false },
    );

    // Typing anywhere (outside form fields) goes to the command line.
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (e.key === 'Escape') {
        this.thought.close();
        this.input.blur();
        this.strip.input = null;
        this.input.value = '';
        return;
      }
      if (
        target !== this.input &&
        (target.closest('input, textarea, button, dialog') || e.metaKey || e.ctrlKey || e.altKey)
      )
        return;
      const scroll = this.thought.personId && target !== this.input ? CLOUD_KEYS[e.key] : undefined;
      if (scroll !== undefined) {
        e.preventDefault();
        this.thought.scrollBy(scroll);
        return;
      }
      if (target !== this.input && e.key.length === 1) {
        this.input.focus();
      }
    });
    this.input.addEventListener('input', () => {
      this.strip.input = this.input.value;
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        this.input.value = '';
        this.strip.input = null;
        this.input.blur();
        if (text) this.command(text);
      }
    });
    this.input.addEventListener('blur', () => {
      if (!this.input.value) this.strip.input = null;
    });
  }

  private bindControls(root: HTMLElement): void {
    root.querySelector('.controls')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn) return;
      const pref = btn.dataset.pref as Toggle | undefined;
      if (pref) {
        if (pref === 'notify' && !this.prefs.notify) {
          if (!('Notification' in window)) {
            this.strip.push('THIS BROWSER CANNOT SHOW NOTIFICATIONS.', 2);
            return;
          }
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            this.strip.push('NOTIFICATIONS ARE BLOCKED IN THIS BROWSER.', 2);
            return;
          }
        }
        this.prefs[pref] = !this.prefs[pref];
        savePrefs(this.prefs);
        this.applyPrefs();
        return;
      }
      if (btn.dataset.act === 'theme') {
        const next = (THEME_CHOICES.indexOf(this.prefs.theme) + 1) % THEME_CHOICES.length;
        this.prefs.theme = THEME_CHOICES[next]!;
        savePrefs(this.prefs);
        this.applyPrefs();
      }
      if (btn.dataset.act === 'mail') this.letters.show();
      if (btn.dataset.act === 'visitor') this.demo?.addVisitor();
    });
  }

  private applyPrefs(): void {
    const labels: Record<Toggle, string> = {
      sound: 'SOUND',
      names: 'NAMES',
      balloons: 'BALLOONS',
      crt: 'CRT',
      notify: 'NOTIFY',
    };
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-pref]')) {
      const key = btn.dataset.pref as Toggle;
      btn.textContent = `${labels[key]} ${this.prefs[key] ? 'ON' : 'OFF'}`;
      btn.setAttribute('aria-pressed', String(this.prefs[key]));
    }
    this.sounds.setMuted(!this.prefs.sound);
    this.root.querySelector('.screen')!.classList.toggle('crt-on', this.prefs.crt);
    this.root.querySelector('[data-act="theme"]')!.textContent = `THEME ${THEME_LABEL[this.prefs.theme]}`;
  }

  /** The decorations for right now. Greets on the strip when a holiday starts (or is picked). */
  private theme(): Theme {
    const theme = themeFor(this.world.date(), this.prefs.theme);
    if (theme.holiday !== this.holiday) {
      this.holiday = theme.holiday;
      if (theme.holiday) this.strip.push(GREETING[theme.holiday], 1);
    }
    return theme;
  }

  private updateMailButton(): void {
    const unread = this.world.letters.filter((l) => !l.read).length;
    this.root.querySelector('[data-act="mail"]')!.textContent = unread ? `MAILBOX (${unread})` : 'MAILBOX';
  }

  // ------------------------------------------------------------------ helpers
  private roster(): Person[] {
    return [...this.world.people.values()]
      .filter((p) => p.mode !== 'gone')
      .sort((a, b) => a.info.startedAt - b.info.startedAt);
  }

  private setFocus(id: string | null): void {
    this.focusId = id;
    this.panel.setFocus(id);
  }

  private notify(title: string, body: string): void {
    this.strip.push(body, 3);
    this.panel.system(`${title}: ${body}`);
    if (this.prefs.notify && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Little Code People – ${title}`, { body, tag: title, silent: false });
      } catch {
        // some platforms only allow notifications from a service worker
      }
    }
  }

  private command(text: string): void {
    const reply = this.respond(text);
    if (reply) this.strip.push(reply, 3);
  }

  /** Carries out a typed request and returns what the strip should say. */
  private respond(text: string): string | null {
    const people = this.roster();
    const parsed = parseCommand(
      text,
      people.map((p) => p.name),
    );
    const cmd = parsed.command;
    if (cmd.kind === 'help') return HELP_TEXT;
    if (cmd.kind === 'mail') {
      this.letters.show();
      return null;
    }
    if (cmd.kind === 'who') {
      const inside = this.world.residents.map((p) => p.name).join(', ') || 'NOBODY';
      const waiting = this.world.queue.length ? ` - WAITING OUTSIDE: ${this.world.queue.length}` : '';
      return `${this.world.residents.length}/${CAPACITY} AT HOME: ${inside}${waiting}`;
    }
    const target =
      people.find((p) => p.name.toLowerCase() === parsed.target?.toLowerCase()) ??
      people.find((p) => p.id === this.focusId) ??
      people.find((p) => p.mode === 'inside' && !p.busy) ??
      people[0];
    if (!target) return 'NOBODY IS HOME.';
    if (target.mode !== 'inside') return `${target.name} CANNOT HEAR YOU FROM OUT THERE.`;

    if (cmd.kind === 'hello') {
      this.world.nod(target);
      target.changeMood(1, Date.now());
      target.setEmote('♥', 2, Date.now());
      this.sounds.sfx('voice', { x: target.x, pitch: target.voice });
      return `${target.name} TURNS AND NODS AT YOU.`;
    }
    if (cmd.kind === 'unknown') return `${target.name} DOES NOT UNDERSTAND. TYPE HELP.`;
    if (target.busy) return `${target.name} IS BUSY WORKING. ASK AGAIN LATER.`;

    const mood = willing(parsed.pleases, target.moodName === 'happy');
    if (mood === 'refuse') return `${target.name} IGNORES YOU. TRY SAYING PLEASE.`;
    const run = () => {
      if (cmd.kind === 'pat') {
        this.world.request(target, 'armchair');
        target.changeMood(2, Date.now());
        target.setEmote('♥', 3, Date.now());
      } else if (cmd.kind === 'letter') {
        target.letterPending = true;
      } else if (cmd.kind === 'go') {
        this.world.request(target, cmd.spot);
      }
    };
    if (mood === 'later') {
      window.setTimeout(run, 8000);
      return `${target.name}: IN A MINUTE...`;
    }
    run();
    return `${target.name}: OKAY!`;
  }
}
