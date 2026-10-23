/**
 * Sound effects, ambient sounds and music for the house. All tunes are original compositions
 * (except the public-domain Jingle Bells at Christmas).
 */
import type { SfxName, World } from '../sim/world.ts';
import { SPOTS, type SpotId, W } from '../world/layout.ts';
import type { Theme } from '../world/season.ts';
import { midi, Sid } from './sid.ts';

const panOf = (x = W / 2) => (x / W) * 1.6 - 0.8;

// ------------------------------------------------------------------ music
type Track = {
  wave: 'square' | 'triangle' | 'sawtooth' | 'noise';
  gain: number;
  notes: [number | null, number][];
};
interface Song {
  bpm: number;
  tracks: Track[];
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C5:1 E5:0.5 -:1" → [[72,1],[76,0.5],[null,1]] */
function seq(text: string): [number | null, number][] {
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [name, beats] = tok.split(':') as [string, string];
      if (name === '-') return [null, Number(beats)];
      const m = name.match(/^([A-G])([#b]?)(\d)$/);
      if (!m) throw new Error(`bad note ${tok}`);
      const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
      return [12 * (Number(m[3]) + 1) + NOTE[m[1]!]! + acc, Number(beats)];
    });
}

const PIANO_SONGS: Song[] = [
  {
    // "Minuet for a Little Person"
    bpm: 112,
    tracks: [
      {
        wave: 'square',
        gain: 0.07,
        notes: seq(
          'C5:1 E5:1 G5:1 E5:1 C5:1 G4:1 A4:1 C5:1 F5:1 E5:1 D5:1 C5:1 B4:1 D5:1 G5:1 F5:1 E5:1 D5:1 C5:1 E5:1 D5:1 C5:3',
        ),
      },
      { wave: 'triangle', gain: 0.12, notes: seq('C3:3 C3:3 F3:3 C3:3 G3:3 G3:3 G2:3 C3:3') },
    ],
  },
  {
    // "Boogie for a Busy Day"
    bpm: 132,
    tracks: [
      {
        wave: 'square',
        gain: 0.06,
        notes: seq(
          'G4:1 Bb4:0.5 C5:1.5 -:1 Eb5:0.5 E5:0.5 G5:1 E5:1 C5:1 ' +
            'G4:1 Bb4:0.5 C5:1.5 -:1 A4:0.5 C5:0.5 D5:1 C5:2 ' +
            'F5:1 Eb5:0.5 C5:1.5 -:1 G5:0.5 E5:0.5 D5:1 C5:1 -:1 ' +
            'B4:0.5 D5:0.5 F5:1 E5:1 D5:1 C5:3 -:1',
        ),
      },
      {
        wave: 'triangle',
        gain: 0.12,
        notes: seq(
          'C3:0.5 E3:0.5 G3:0.5 A3:0.5 Bb3:0.5 A3:0.5 G3:0.5 E3:0.5 '.repeat(2) +
            'F3:0.5 A3:0.5 C4:0.5 D4:0.5 Eb4:0.5 D4:0.5 C4:0.5 A3:0.5 ' +
            'C3:0.5 E3:0.5 G3:0.5 A3:0.5 Bb3:0.5 A3:0.5 G3:0.5 E3:0.5 ' +
            'G3:0.5 B3:0.5 D4:0.5 E4:0.5 F4:0.5 E4:0.5 D4:0.5 B3:0.5 ' +
            'F3:0.5 A3:0.5 C4:0.5 D4:0.5 Eb4:0.5 D4:0.5 C4:0.5 A3:0.5 ' +
            'C3:0.5 E3:0.5 G3:0.5 A3:0.5 Bb3:0.5 A3:0.5 G3:0.5 E3:0.5 '.repeat(2),
        ),
      },
    ],
  },
  {
    // "Rainy Waltz in A minor"
    bpm: 120,
    tracks: [
      {
        wave: 'square',
        gain: 0.07,
        notes: seq('A4:2 C5:1 E5:2 D5:1 C5:1 B4:1 A4:1 G#4:3 A4:2 B4:1 C5:2 D5:1 E5:2 C5:1 A4:3'),
      },
      { wave: 'triangle', gain: 0.12, notes: seq('A2:3 A2:3 E2:3 E2:3 A2:3 F2:3 E2:3 A2:3') },
    ],
  },
];

const GROOVE: Song = {
  // "Disk Drive Disco"
  bpm: 118,
  tracks: [
    {
      wave: 'square',
      gain: 0.05,
      notes: seq(
        'B4:1 D5:0.5 E5:1.5 -:1 G5:0.5 E5:0.5 D5:0.5 B4:0.5 -:2 A4:1 C5:0.5 D5:1.5 -:1 E5:0.5 D5:0.5 B4:0.5 A4:0.5 -:2',
      ),
    },
    {
      wave: 'sawtooth',
      gain: 0.05,
      notes: seq(
        'E2:0.5 E2:0.5 -:0.5 E3:0.5 D3:0.5 -:0.5 B2:0.5 -:0.5 '.repeat(2) +
          'A2:0.5 A2:0.5 -:0.5 A3:0.5 G3:0.5 -:0.5 E3:0.5 -:0.5 '.repeat(2),
      ),
    },
    { wave: 'noise', gain: 0.025, notes: seq('C8:0.5 '.repeat(32)) },
  ],
};

const JINGLE: Song = {
  bpm: 140,
  tracks: [
    { wave: 'square', gain: 0.06, notes: seq('E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4') },
    { wave: 'triangle', gain: 0.12, notes: seq('C3:2 G3:2 C3:2 G3:2 C3:2 G3:2 C3:4') },
  ],
};

const SPOOKY: Song = {
  // "Creaky Stairs", for Halloween
  bpm: 96,
  tracks: [
    {
      wave: 'square',
      gain: 0.05,
      notes: seq(
        'A4:1 C5:1 E5:1 D#5:1.5 -:0.5 E5:1 C5:1 A4:2 -:1 G#4:1 B4:1 D5:1 C#5:1.5 -:0.5 D5:1 B4:1 G#4:2 -:1',
      ),
    },
    { wave: 'triangle', gain: 0.12, notes: seq(`${'A2:1 E3:1 '.repeat(5)}${'E2:1 B2:1 '.repeat(5)}`) },
  ],
};

const RECORD: Record<NonNullable<Theme['holiday']> | 'none', Song> = {
  christmas: JINGLE,
  halloween: SPOOKY,
  easter: GROOVE,
  none: GROOVE,
};

class MusicPlayer {
  private song: Song | null = null;
  private start = 0;
  private cursors: { index: number; time: number }[] = [];

  constructor(
    private readonly sid: Sid,
    private readonly piano: boolean,
  ) {}

  get playing(): Song | null {
    return this.song;
  }

  play(song: Song): void {
    if (this.song === song) return;
    this.song = song;
    this.start = this.sid.time + 0.1;
    this.cursors = song.tracks.map(() => ({ index: 0, time: this.start }));
  }

  stop(): void {
    this.song = null;
  }

  schedule(pan: number): void {
    const song = this.song;
    if (!song || !this.sid.ready) return;
    const beat = 60 / song.bpm;
    const horizon = this.sid.time + 0.3;
    song.tracks.forEach((track, ti) => {
      const cur = this.cursors[ti]!;
      if (cur.time < this.sid.time - 1) cur.time = this.sid.time + 0.05; // tab was asleep
      while (cur.time < horizon) {
        const [note, beats] = track.notes[cur.index]!;
        const dur = beats * beat;
        if (note !== null) {
          const at = cur.time - this.sid.time;
          if (track.wave === 'noise') {
            this.sid.play({
              wave: 'noise',
              freq: 9000,
              at,
              dur: 0.04,
              gain: track.gain,
              pan,
              bus: 'music',
              filter: { type: 'highpass', from: 6000 },
            });
          } else {
            this.sid.play({
              wave: track.wave,
              freq: midi(note),
              at,
              dur: this.piano ? Math.min(dur, 0.6) : dur * 0.9,
              gain: track.gain,
              attack: 0.004,
              release: this.piano ? 0.25 : 0.06,
              pan,
              bus: 'music',
              filter: { type: 'lowpass', from: this.piano ? 2400 : 1800 },
            });
          }
        }
        cur.time += dur;
        cur.index = (cur.index + 1) % track.notes.length;
      }
    });
  }
}

// ------------------------------------------------------------------ the sound system
export class Sounds {
  readonly sid = new Sid();
  private readonly piano = new MusicPlayer(this.sid, true);
  private readonly record = new MusicPlayer(this.sid, false);
  private nextClick = 0;
  private nextBell = 0;
  private nextShower = 0;
  private nextSnore = 0;
  private lastVoice = 0;

  unlock(): void {
    this.sid.unlock();
  }

  setMuted(m: boolean): void {
    this.sid.setMuted(m);
  }

  sfx(name: SfxName, opts: { x?: number; pitch?: number } = {}): void {
    const pan = panOf(opts.x);
    const s = this.sid;
    switch (name) {
      case 'doorbell':
        // ding-dong with a little echo
        for (const [delay, g] of [
          [0, 0.22],
          [0.3, 0.08],
        ] as const) {
          s.play({ wave: 'triangle', freq: 659.25, at: delay, dur: 0.7, gain: g, release: 0.5, pan });
          s.play({ wave: 'triangle', freq: 523.25, at: delay + 0.42, dur: 1.0, gain: g, release: 0.8, pan });
        }
        return;
      case 'door':
        s.play({
          wave: 'noise',
          freq: 1200,
          dur: 0.12,
          gain: 0.08,
          pan,
          filter: { type: 'lowpass', from: 500 },
        });
        s.play({ wave: 'sine', freq: 90, dur: 0.1, gain: 0.15, slideTo: 50, pan });
        return;
      case 'knock':
        for (let i = 0; i < 3; i++) {
          s.play({ wave: 'sine', freq: 170, at: i * 0.19, dur: 0.07, gain: 0.35, slideTo: 70 });
          s.play({
            wave: 'noise',
            freq: 3000,
            at: i * 0.19,
            dur: 0.02,
            gain: 0.12,
            filter: { type: 'bandpass', from: 1800, q: 2 },
          });
        }
        return;
      case 'voice': {
        // gibberish "wah-wah" speech, pitched per person; never more than one at a time
        if (s.time - this.lastVoice < 0.9) return;
        this.lastVoice = s.time;
        const base = opts.pitch ?? 220;
        const syllables = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < syllables; i++) {
          const f = base * (0.85 + Math.random() * 0.4);
          s.play({
            wave: 'square',
            freq: f,
            slideTo: f * (Math.random() < 0.5 ? 0.8 : 1.15),
            at: i * 0.11,
            dur: 0.09,
            gain: 0.07,
            pan,
            filter: { type: 'lowpass', from: 500, to: 1800, q: 6 },
          });
        }
        return;
      }
      case 'whoosh':
        s.play({
          wave: 'noise',
          freq: 6000,
          dur: 0.5,
          gain: 0.07,
          pan,
          filter: { type: 'bandpass', from: 2500, to: 400, q: 3 },
        });
        return;
      case 'mail':
        s.play({ wave: 'square', freq: midi(79), dur: 0.08, gain: 0.06, pan });
        s.play({ wave: 'square', freq: midi(84), at: 0.09, dur: 0.12, gain: 0.06, pan });
        return;
      case 'poof':
        s.play({
          wave: 'noise',
          freq: 8000,
          dur: 0.12,
          gain: 0.06,
          pan,
          filter: { type: 'highpass', from: 2000 },
        });
        s.play({ wave: 'triangle', freq: 400, slideTo: 1200, dur: 0.12, gain: 0.08, pan });
        return;
      case 'phone':
        for (let r = 0; r < 2; r++) {
          for (let i = 0; i < 12; i++) {
            s.play({
              wave: 'square',
              freq: i % 2 ? 480 : 440,
              at: r * 0.9 + i * 0.045,
              dur: 0.04,
              gain: 0.04,
              pan,
            });
          }
        }
        return;
    }
  }

  /** Ambient sounds and music follow what people are doing. Call every frame. */
  update(world: World, theme: Theme): void {
    if (!this.sid.ready) return;
    const occ = world.occupied();
    const t = this.sid.time;
    const holder = (spot: SpotId) => world.people.get(world.holder(spot) ?? '');

    // piano
    const pianist = occ.has('piano') ? holder('piano') : undefined;
    if (pianist) this.piano.play(PIANO_SONGS[pianist.info.look % PIANO_SONGS.length]!);
    else this.piano.stop();
    this.piano.schedule(panOf(SPOTS.piano.x));

    // record player while someone dances
    if (occ.has('dance1') || occ.has('dance2')) this.record.play(RECORD[theme.holiday ?? 'none']);
    else this.record.stop();
    this.record.schedule(panOf(SPOTS.dance1.x));

    // typing at the typewriter and computers
    const typists = (['typewriter', 'comp1', 'comp2'] as SpotId[]).filter(
      (s) => occ.has(s) && !holder(s)?.dozing,
    );
    if (typists.length && t > this.nextClick) {
      const spot = typists[Math.floor(Math.random() * typists.length)]!;
      const tw = spot === 'typewriter';
      this.sid.play({
        wave: 'noise',
        freq: tw ? 5000 : 9000,
        dur: 0.025,
        gain: tw ? 0.07 : 0.03,
        pan: panOf(SPOTS[spot].x),
        filter: { type: 'bandpass', from: tw ? 2200 : 4000, q: 1.5 },
      });
      this.nextClick = t + 0.07 + (Math.random() * 0.18) / typists.length;
      if (tw && t > this.nextBell) {
        this.sid.play({
          wave: 'sine',
          freq: 1760,
          at: 0.1,
          dur: 0.4,
          gain: 0.05,
          release: 0.35,
          pan: panOf(SPOTS.typewriter.x),
        });
        this.nextBell = t + 4 + Math.random() * 4;
      }
    }
    // shower
    if (occ.has('shower') && t > this.nextShower) {
      this.sid.play({
        wave: 'noise',
        freq: 7000,
        dur: 0.35,
        gain: 0.025,
        attack: 0.1,
        release: 0.1,
        pan: panOf(SPOTS.shower.x),
        filter: { type: 'bandpass', from: 3500, q: 0.7 },
      });
      this.nextShower = t + 0.3;
    }
    // snoring
    const sleepers = [...world.people.values()].filter((p) => (p.pose === 'sleep' || p.dozing) && !p.moving);
    if (sleepers.length && t > this.nextSnore) {
      const p = sleepers[Math.floor(Math.random() * sleepers.length)]!;
      this.sid.play({
        wave: 'noise',
        freq: 600,
        dur: 0.8,
        gain: 0.03,
        attack: 0.3,
        release: 0.3,
        pan: panOf(p.x),
        filter: { type: 'lowpass', from: 300, to: 500 },
      });
      this.nextSnore = t + 3 + Math.random() * 3;
    }
  }
}
