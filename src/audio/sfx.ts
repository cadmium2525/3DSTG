/**
 * Synthesised sound effects. Each returns the time it ends (used for voice limiting).
 */
import type { SfxName } from '../core/types';
import { bell, kick, mtof, noise, tone, type Ch } from './synth';

type SfxFn = (ch: Ch, t: number) => number;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const SFX: Record<SfxName, SfxFn> = {
  // Plays ~8x/sec: very soft, short and slightly varied so it doesn't fatigue.
  shot(ch, t) {
    return tone(ch, t, rnd(1150, 1300), 0.02, { type: 'triangle', gain: 0.16, a: 0.002, d: 0.03, s: 0.2, r: 0.025, cutoff: 2600, glide: 1.25, glideTime: 0.03 });
  },
  enemyHit(ch, t) {
    return noise(ch, t, 0.035, { gain: 0.45, type: 'bandpass', freq: rnd(2600, 3400), q: 2 });
  },
  enemyDown(ch, t) {
    tone(ch, t, 420, 0.12, { type: 'square', gain: 0.1, a: 0.002, d: 0.15, s: 0.1, r: 0.1, cutoff: 2000, cutoffEnd: 300, glide: 1, glideTime: 0.01 });
    tone(ch, t, 90, 0.1, { type: 'sine', gain: 0.25, a: 0.002, d: 0.2, s: 0.05, r: 0.1, glide: 4, glideTime: 0.12 });
    return noise(ch, t, 0.35, { gain: 0.4, type: 'lowpass', freq: 5000, freqEnd: 300, q: 0.7 });
  },
  // Bright, crisp tick.
  graze(ch, t) {
    const f = rnd(2500, 2800);
    tone(ch, t, f * 1.5, 0.015, { type: 'sine', gain: 0.18, a: 0.001, d: 0.03, s: 0.1, r: 0.03 });
    return tone(ch, t, f, 0.02, { type: 'sine', gain: 0.36, a: 0.001, d: 0.04, s: 0.1, r: 0.04 });
  },
  playerHit(ch, t) {
    tone(ch, t, 330, 0.3, { type: 'square', gain: 0.22, a: 0.002, d: 0.3, s: 0.3, r: 0.2, cutoff: 2400, cutoffEnd: 400, glide: 1, unison: 2, spread: 40 });
    tone(ch, t, 55, 0.35, { type: 'sine', gain: 0.5, a: 0.002, d: 0.3, s: 0.3, r: 0.2, glide: 4, glideTime: 0.25 });
    noise(ch, t, 0.5, { gain: 0.35, type: 'lowpass', freq: 6000, freqEnd: 200, q: 1 });
    return t + 0.6;
  },
  // Two-tone alarm, four pulses.
  bossWarning(ch, t) {
    let end = t;
    for (let i = 0; i < 4; i++) {
      const t0 = t + i * 0.42;
      tone(ch, t0, 880, 0.17, { type: 'sawtooth', gain: 0.13, a: 0.01, d: 0.05, s: 0.9, r: 0.03, cutoff: 2600, unison: 2, spread: 20 });
      end = tone(ch, t0 + 0.2, 660, 0.17, { type: 'sawtooth', gain: 0.13, a: 0.01, d: 0.05, s: 0.9, r: 0.03, cutoff: 2200, unison: 2, spread: 20 });
    }
    return end;
  },
  bossDown(ch, t) {
    kick(ch, t, 1, 0.8);
    tone(ch, t, 32, 1.2, { type: 'sine', gain: 0.55, a: 0.005, d: 0.8, s: 0.3, r: 0.6, glide: 4, glideTime: 0.6 });
    noise(ch, t, 2.2, { gain: 0.4, type: 'lowpass', freq: 8000, freqEnd: 120, q: 0.7 });
    noise(ch, t + 0.15, 1.6, { gain: 0.16, type: 'bandpass', freq: 1200, freqEnd: 300, q: 1.5 });
    // Rising shimmer (D major-ish bloom).
    const notes = [74, 78, 81, 86, 90, 93, 98];
    notes.forEach((m, i) => bell(ch, t + 0.25 + i * 0.07, mtof(m), 1.6, 0.07, 3.5, 1.5, (i % 2 ? 1 : -1) * 0.4));
    return t + 2.6;
  },
  uiTap(ch, t) {
    return tone(ch, t, 1400, 0.02, { type: 'sine', gain: 0.3, a: 0.002, d: 0.04, s: 0.1, r: 0.04, glide: 0.7, glideTime: 0.03 });
  },
  // Major fanfare: arpeggio up, then a bright held chord.
  clear(ch, t) {
    const arp = [72, 76, 79, 84];
    arp.forEach((m, i) => tone(ch, t + i * 0.11, mtof(m), 0.12, { type: 'sawtooth', gain: 0.12, a: 0.005, d: 0.1, s: 0.6, r: 0.08, cutoff: 3500, unison: 2, spread: 10 }));
    const t1 = t + 0.48;
    for (const m of [72, 76, 79, 84, 88]) tone(ch, t1, mtof(m), 1.1, { type: 'sawtooth', gain: 0.07, a: 0.02, d: 0.3, s: 0.7, r: 0.8, cutoff: 3000, cutoffEnd: 1800, unison: 2, spread: 12, vibrato: 8 });
    [96, 100, 103, 108].forEach((m, i) => bell(ch, t1 + i * 0.08, mtof(m), 1.8, 0.05));
    return t1 + 2;
  },
  // Slow descending minor line.
  gameOver(ch, t) {
    const line = [67, 65, 63, 62, 58];
    line.forEach((m, i) => tone(ch, t + i * 0.32, mtof(m), 0.28, { type: 'triangle', gain: 0.2, a: 0.01, d: 0.2, s: 0.6, r: 0.2, cutoff: 2000 }));
    const t1 = t + line.length * 0.32;
    for (const m of [43, 50, 55, 58]) tone(ch, t1, mtof(m), 1.4, { type: 'sawtooth', gain: 0.07, a: 0.05, d: 0.6, s: 0.6, r: 1, cutoff: 900, cutoffEnd: 300, unison: 2, spread: 12 });
    return t1 + 2.4;
  },
};

/** Concurrency + rate limits per effect. */
export const SFX_LIMITS: Record<SfxName, { max: number; gap: number; rev: number }> = {
  shot: { max: 3, gap: 0.05, rev: 0 },
  enemyHit: { max: 4, gap: 0.035, rev: 0 },
  enemyDown: { max: 4, gap: 0.05, rev: 0.2 },
  graze: { max: 4, gap: 0.03, rev: 0.15 },
  playerHit: { max: 1, gap: 0.3, rev: 0.3 },
  bossWarning: { max: 1, gap: 1, rev: 0.3 },
  bossDown: { max: 1, gap: 1, rev: 0.5 },
  uiTap: { max: 2, gap: 0.03, rev: 0.1 },
  clear: { max: 1, gap: 1, rev: 0.4 },
  gameOver: { max: 1, gap: 1, rev: 0.4 },
};
