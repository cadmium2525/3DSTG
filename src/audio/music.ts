/**
 * BLOOM DIVE — procedurally sequenced original BGM.
 * Each track is a 16-step-per-bar sequencer driven by a look-ahead scheduler
 * (see TrackPlayer.scheduleUntil). All music is composed here as note data.
 */
import type { BgmTrack } from '../core/types';
import type { Graph } from './graph';
import { MUSIC_LEVEL } from './graph';
import { bell, chord, clap, hat, kick, mtof, noise, noteToMidi, pad, snare, tone, type Ch } from './synth';

type StepFn = (bar: number, s: number, t: number, sd: number) => void;
type MakeCh = (level: number, rev: number, dly: number) => Ch;

interface TrackDef {
  bpm: number;
  bars: number;
  /** Delay time in beats for the tempo-synced echo. */
  delayBeats: number;
  build(mk: MakeCh): StepFn;
}

type Melody = Array<Map<number, [number, number]>>;

/** Parse bars like "A5:4 -:2 C#6:2" (note:lengthInSteps, '-' = rest) into per-bar step maps. */
function melody(bars: string[]): Melody {
  return bars.map((bar) => {
    const m = new Map<number, [number, number]>();
    let s = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      const [n, l] = tok.split(':');
      const len = parseInt(l, 10);
      if (n !== '-') m.set(s, [noteToMidi(n), len]);
      s += len;
    }
    return m;
  });
}

/* ------------------------------------------------------------------ */
/* title — calm, dreamy, D major, 84 bpm                              */
/* ------------------------------------------------------------------ */
const TITLE: TrackDef = {
  bpm: 84,
  bars: 16,
  delayBeats: 0.75,
  build(mk) {
    const padCh = mk(0.55, 0.6, 0.1);
    const arpCh = mk(0.5, 0.35, 0.55);
    const bassCh = mk(0.7, 0.05, 0);
    const bellCh = mk(0.5, 0.6, 0.5);
    const hatCh = mk(0.25, 0.3, 0);
    const pads = ['D3 A3 C#4 E4 F#4', 'F#3 A3 C#4 E4', 'G3 B3 D4 F#4', 'A3 C#4 E4 B4', 'B2 F#3 A3 C#4 D4', 'G3 B3 D4 F#4 A4', 'E3 G3 B3 D4 F#4', 'A3 D4 E4 G4'].map(chord);
    const roots = ['D2', 'F#2', 'G2', 'A2', 'B1', 'G2', 'E2', 'A2'].map(noteToMidi);
    const arpTones = pads.map((c) => {
      const up = c.map((n) => n + 12);
      return [...up, ...up.map((n) => n + 12)];
    });
    const arpPat = [0, 2, 4, 6, 5, 3, 4, 2, 1, 3, 5, 7, 6, 4, 3, 1];
    const mel = melody([
      'A5:6 F#5:2 E5:8',
      'C#5:4 E5:4 F#5:8',
      'D5:6 B4:2 F#5:8',
      'E5:12 -:4',
      'F#5:6 A5:2 C#6:4 B5:4',
      'A5:8 F#5:4 D5:4',
      'G5:6 F#5:2 E5:4 B4:4',
      'C#5:4 D5:4 E5:8',
    ]);
    return (bar, s, t, sd) => {
      const ci = bar % 8;
      const barDur = sd * 16;
      if (s === 0) {
        pad(padCh, t, pads[ci], barDur, 0.32, 1500, 0.9, 1.6);
        tone(bassCh, t, mtof(roots[ci]), barDur * 0.92, { type: 'triangle', gain: 0.32, a: 0.06, d: 0.8, s: 0.6, r: 0.6, cutoff: 700 });
      }
      if (bar >= 2 || s >= 8) {
        const tones = arpTones[ci];
        const n = tones[arpPat[s] % tones.length];
        const acc = s % 4 === 0 ? 1 : 0.7;
        tone(arpCh, t, mtof(n), sd * 0.9, { type: 'triangle', gain: 0.11 * acc, a: 0.004, d: 0.3, s: 0.05, r: 0.2, cutoff: 3200, cutoffEnd: 900, pan: s % 2 ? 0.35 : -0.35 });
      }
      if (bar >= 4 && s % 4 === 2) hat(hatCh, t, 0.05, false, 0.2);
      if (bar >= 8) {
        const ev = mel[ci].get(s);
        if (ev) bell(bellCh, t, mtof(ev[0]), Math.max(1.4, ev[1] * sd * 1.6), 0.13, 3.5, 1.6, 0);
      } else if (bar >= 4 && s === 0 && ci % 2 === 0) {
        // Sparse glass notes before the melody enters.
        bell(bellCh, t + sd * 4, mtof(pads[ci][pads[ci].length - 1] + 12), 2.2, 0.06, 3.5, 1.2, 0.3);
      }
    };
  },
};

/* ------------------------------------------------------------------ */
/* stage — driving, bright trance, A minor, 150 bpm                   */
/* ------------------------------------------------------------------ */
const STAGE: TrackDef = {
  bpm: 150,
  bars: 16,
  delayBeats: 0.75,
  build(mk) {
    const drumCh = mk(0.9, 0.04, 0);
    const hatCh = mk(0.35, 0.05, 0);
    const bassCh = mk(0.65, 0, 0);
    const arpCh = mk(0.45, 0.2, 0.4);
    const padCh = mk(0.35, 0.5, 0);
    const leadCh = mk(0.42, 0.35, 0.45);
    const pads = ['A3 C4 E4 A4', 'F3 A3 C4 F4', 'G3 C4 E4 G4', 'G3 B3 D4 G4', 'A3 C4 E4 A4', 'F3 A3 C4 F4', 'G3 B3 D4 G4', 'G#3 B3 E4 G#4'].map(chord);
    const roots = ['A1', 'F1', 'C2', 'G1', 'A1', 'F1', 'G1', 'E1'].map(noteToMidi);
    const triads = ['A4 C5 E5', 'F4 A4 C5', 'G4 C5 E5', 'G4 B4 D5', 'A4 C5 E5', 'F4 A4 C5', 'G4 B4 D5', 'G#4 B4 E5'].map(chord);
    const arpTones = triads.map((c) => [...c, ...c.map((n) => n + 12), ...c.map((n) => n + 24)]);
    const arpPat = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2];
    const mel = melody([
      'E5:2 A5:2 B5:2 C6:4 B5:2 A5:2 E5:2',
      'F5:2 A5:2 C6:2 F6:4 E6:2 C6:2 A5:2',
      'G5:2 C6:2 D6:2 E6:4 D6:2 C6:2 G5:2',
      'D6:4 B5:4 G5:2 A5:2 B5:2 D6:2',
      'E6:6 D6:2 C6:4 B5:4',
      'A5:6 C6:2 F6:4 E6:4',
      'D6:6 E6:2 D6:2 B5:2 G5:4',
      'G#5:4 B5:4 E6:6 -:2',
    ]);
    return (bar, s, t, sd) => {
      const ci = bar % 8;
      const fill = ci === 7 && s >= 12;
      if (s === 0) {
        pad(padCh, t, pads[ci], sd * 16, 0.2, 1800, 0.25, 0.6);
        if (bar % 8 === 0) noise(drumCh, t, 1.6, { gain: 0.12, type: 'highpass', freq: 5000 }); // crash
      }
      // Drums.
      if (s % 4 === 0 && !fill) kick(drumCh, t, 0.85);
      if (s % 8 === 4 && !fill) clap(drumCh, t, 0.32);
      if (fill) snare(drumCh, t, 0.14 + (s - 12) * 0.06);
      if (s % 4 === 2) hat(hatCh, t, 0.16, true);
      else hat(hatCh, t, s % 2 ? 0.07 : 0.1, false, s % 4 === 1 ? -0.3 : 0.3);
      // Rolling off-beat bass.
      if (s % 4 !== 0) {
        const r = roots[ci] + 12;
        tone(bassCh, t, mtof(r), sd * 0.8, { type: 'sawtooth', gain: s % 4 === 2 ? 0.3 : 0.22, a: 0.003, d: 0.08, s: 0.4, r: 0.04, cutoff: 1100, cutoffEnd: 320, q: 2 });
      }
      // Arp.
      const tones = arpTones[ci];
      tone(arpCh, t, mtof(tones[arpPat[s] % tones.length]), sd * 0.8, { type: 'sawtooth', gain: 0.085, a: 0.002, d: 0.12, s: 0.05, r: 0.05, cutoff: 4200, cutoffEnd: 900, q: 3, pan: s % 2 ? 0.3 : -0.3 });
      // Lead from bar 9.
      if (bar >= 8) {
        const ev = mel[ci].get(s);
        if (ev) tone(leadCh, t, mtof(ev[0]), ev[1] * sd * 0.95, { type: 'sawtooth', gain: 0.16, a: 0.01, d: 0.2, s: 0.65, r: 0.12, cutoff: 3600, cutoffEnd: 2200, unison: 3, spread: 14, vibrato: 12 });
      }
    };
  },
};

/* ------------------------------------------------------------------ */
/* boss — intense, D harmonic minor, 168 bpm                           */
/* ------------------------------------------------------------------ */
const BOSS: TrackDef = {
  bpm: 168,
  bars: 16,
  delayBeats: 0.5,
  build(mk) {
    const drumCh = mk(0.9, 0.05, 0);
    const hatCh = mk(0.3, 0.04, 0);
    const bassCh = mk(0.6, 0, 0);
    const arpCh = mk(0.38, 0.2, 0.35);
    const stabCh = mk(0.4, 0.4, 0.2);
    const padCh = mk(0.3, 0.5, 0);
    const leadCh = mk(0.4, 0.3, 0.4);
    const triads = ['D4 F4 A4', 'D4 F4 Bb4', 'D4 G4 Bb4', 'C#4 E4 A4', 'D4 F4 A4', 'D4 F4 Bb4', 'C4 E4 G4', 'C#4 E4 A4'].map(chord);
    const roots = ['D2', 'Bb1', 'G1', 'A1', 'D2', 'Bb1', 'C2', 'A1'].map(noteToMidi);
    const arpTones = triads.map((c) => [...c.map((n) => n + 12), ...c.map((n) => n + 24)]);
    const arpPat = [0, 2, 1, 3, 2, 4, 3, 5, 4, 3, 5, 2, 4, 1, 3, 0];
    const mel = melody([
      'D5:2 F5:2 A5:2 D6:2 C#6:2 D6:2 E6:2 F6:2',
      'D6:4 C6:2 Bb5:2 A5:4 F5:4',
      'G5:2 Bb5:2 D6:2 G6:2 F6:2 E6:2 D6:2 Bb5:2',
      'C#6:4 E6:4 A6:6 -:2',
      'F6:3 E6:3 D6:2 A5:4 D6:4',
      'F6:3 E6:3 D6:2 Bb5:4 D6:4',
      'E6:3 D6:3 C6:2 G5:4 E6:4',
      'C#6:2 D6:2 E6:2 F6:2 G6:2 F6:2 E6:2 C#6:2',
    ]);
    return (bar, s, t, sd) => {
      const ci = bar % 8;
      const fill = ci === 7 && s >= 8;
      if (s === 0) {
        pad(padCh, t, triads[ci].map((n) => n - 12), sd * 16, 0.22, 1300, 0.15, 0.5);
        if (bar % 4 === 0) noise(drumCh, t, 1.4, { gain: 0.12, type: 'highpass', freq: 4500 });
      }
      // Drums: four-on-the-floor plus syncopated extra kick, fills on bar 8.
      if (!fill) {
        if (s % 4 === 0 || s === 14) kick(drumCh, t, s === 14 ? 0.6 : 0.9);
        if (s % 8 === 4) {
          snare(drumCh, t, 0.3);
          clap(drumCh, t, 0.15);
        }
      } else {
        const k = s - 8;
        if (k % 2 === 0) kick(drumCh, t, 0.55);
        // Descending tom roll.
        tone(drumCh, t, 260 - k * 18, 0.06, { type: 'sine', gain: 0.3, a: 0.001, d: 0.12, s: 0.01, r: 0.05, glide: 1.6, glideTime: 0.05 });
        snare(drumCh, t, 0.08 + k * 0.025);
      }
      hat(hatCh, t, s % 4 === 2 ? 0.14 : s % 2 ? 0.06 : 0.09, s % 4 === 2, s % 2 ? 0.25 : -0.25);
      // Driving 16th octave bass.
      const r = roots[ci] + (s % 2 === 1 && s % 4 === 3 ? 12 : 0);
      tone(bassCh, t, mtof(r), sd * 0.7, { type: 'sawtooth', gain: s % 4 === 0 ? 0.3 : 0.2, a: 0.002, d: 0.07, s: 0.3, r: 0.03, cutoff: 900, cutoffEnd: 260, q: 3 });
      // Arp (square).
      const tones = arpTones[ci];
      tone(arpCh, t, mtof(tones[arpPat[s] % tones.length]), sd * 0.6, { type: 'square', gain: 0.06, a: 0.002, d: 0.08, s: 0.1, r: 0.04, cutoff: 3600, cutoffEnd: 1100, pan: s % 2 ? 0.35 : -0.35 });
      // Chord stabs.
      if (s === 0 || s === 10) {
        for (const n of triads[ci]) tone(stabCh, t, mtof(n), sd * 1.5, { type: 'sawtooth', gain: 0.07, a: 0.003, d: 0.15, s: 0.2, r: 0.1, cutoff: 3000, cutoffEnd: 800, unison: 2, spread: 10 });
      }
      if (bar >= 8) {
        const ev = mel[ci].get(s);
        if (ev) tone(leadCh, t, mtof(ev[0]), ev[1] * sd * 0.95, { type: 'sawtooth', gain: 0.15, a: 0.008, d: 0.15, s: 0.7, r: 0.1, cutoff: 4200, cutoffEnd: 2400, unison: 3, spread: 16, vibrato: 14 });
      }
    };
  },
};

export const TRACKS: Record<BgmTrack, TrackDef> = { title: TITLE, stage: STAGE, boss: BOSS };

export interface TrackPlayer {
  readonly name: BgmTrack;
  readonly bpm: number;
  /** Context time of beat 0. */
  readonly startTime: number;
  /** Schedule every step that starts before `until`; steps already late vs `now` are skipped. */
  scheduleUntil(until: number, now?: number): void;
  /** Fade out starting at `at`, then stop scheduling. Returns when it's silent. */
  fadeOut(at: number, dur: number): number;
  /** Disconnect the track's buses. */
  dispose(): void;
}

export function createTrackPlayer(g: Graph, name: BgmTrack, startTime: number, fadeIn = 0.05, startStep = 0): TrackPlayer {
  const def = TRACKS[name];
  const { ctx } = g;
  const sd = 60 / def.bpm / 4;

  // Per-track fader for the dry signal and both sends, so crossfades affect everything.
  const fades = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
  const [dry, rev, dly] = fades;
  dry.connect(g.music);
  rev.connect(g.reverbIn);
  dly.connect(g.delayIn);
  const levels = [1, MUSIC_LEVEL, MUSIC_LEVEL];
  fades.forEach((f, i) => {
    f.gain.setValueAtTime(0, Math.max(0, startTime - 0.01));
    f.gain.linearRampToValueAtTime(levels[i], startTime + fadeIn);
  });
  g.delay.delayTime.setValueAtTime((60 / def.bpm) * def.delayBeats, Math.max(0, startTime));

  const extra: AudioNode[] = [];
  const mk: MakeCh = (level, revAmt, dlyAmt) => {
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(dry);
    extra.push(out);
    if (revAmt > 0) {
      const s = ctx.createGain();
      s.gain.value = revAmt;
      out.connect(s);
      s.connect(rev);
      extra.push(s);
    }
    if (dlyAmt > 0) {
      const s = ctx.createGain();
      s.gain.value = dlyAmt;
      out.connect(s);
      s.connect(dly);
      extra.push(s);
    }
    return { ctx, out, noise: g.noise };
  };
  const step = def.build(mk);

  let nextStep = startStep;
  let nextTime = startTime;
  let stopped = false;

  return {
    name,
    bpm: def.bpm,
    startTime,
    scheduleUntil(until, now) {
      if (stopped) return;
      // If the scheduler fell far behind (e.g. throttled timers), skip ahead instead of bursting.
      if (now !== undefined && now - nextTime > 0.25) {
        const skip = Math.ceil((now - nextTime) / sd);
        nextStep += skip;
        nextTime += skip * sd;
      }
      while (nextTime < until) {
        const total = def.bars * 16;
        const k = nextStep % total;
        step(Math.floor(k / 16), k % 16, nextTime, sd);
        nextStep++;
        nextTime = startTime + (nextStep - startStep) * sd;
      }
    },
    fadeOut(at, dur) {
      stopped = true;
      for (const f of fades) {
        const p = f.gain;
        p.cancelScheduledValues(at);
        p.setValueAtTime(p.value, at);
        p.linearRampToValueAtTime(0, at + dur);
      }
      return at + dur;
    },
    dispose() {
      for (const n of [...fades, ...extra]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
