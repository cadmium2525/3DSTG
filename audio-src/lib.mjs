/*
 * Small authoring helpers for the かなでる song JSON (time unit = beats, 4/4).
 * The generators in bgm/*.gen.mjs use these to write bgm/*.json, which is the
 * canonical source rendered by build.mjs.
 */

/** One note: [startBeat, note, lengthBeats, velocity 0..1] */
export const N = (t, n, d, v = 0.75) => [round(t), n, round(d), round(v)];
const round = (x) => Math.round(x * 10000) / 10000;

/**
 * Melody / riff from a compact string.
 *   "A4/1 B4/.5 C#5/.5 -/1 E5+A5/2 D5/1!"
 * token = note[/beats][!|?]   note "-" = rest, "+" joins notes into a chord,
 * "!" accent (+0.15 vel), "?" soft (-0.2 vel). Default length = previous one.
 * opts: { at, vel, gate (0..1 portion of the slot that sounds), tr (semitones) }
 */
export function seq(str, opts = {}) {
  const { at = 0, vel = 0.75, gate = 0.92, tr = 0 } = opts;
  const out = [];
  let t = at, d = 1;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    let s = tok, v = vel;
    if (s.endsWith('!')) { v = Math.min(1, vel + 0.15); s = s.slice(0, -1); }
    else if (s.endsWith('?')) { v = Math.max(0.05, vel - 0.2); s = s.slice(0, -1); }
    const [name, len] = s.split('/');
    if (len) d = Number(len);
    if (name !== '-') for (const n of name.split('+')) out.push(N(t, tr ? shift(n, tr) : n, d * gate, v));
    t += d;
  }
  return out;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])([#b]*)(-?\d+)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  let v = BASE[m[1]];
  for (const c of m[2]) v += c === '#' ? 1 : -1;
  return v + (Number(m[3]) + 1) * 12;
}
export const name = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const shift = (n, k) => name(midi(n) + k);

/** Notes of a chord spelled as a list ("D4 F#4 A4") */
export const tones = (s) => s.trim().split(/\s+/);

/**
 * Arpeggio over a list of [startBeat, lengthBeats, "n1 n2 n3 ..."] chords.
 * order: index list into the tone list (cycled), rate in beats.
 */
export function arp(chords, order, rate = 0.25, opts = {}) {
  const { vel = 0.6, accent = 0.15, gate = 0.9, every = 4 } = opts;
  const out = [];
  for (const [t0, len, ns] of chords) {
    const ts = tones(ns);
    const steps = Math.round(len / rate);
    for (let k = 0; k < steps; k++) {
      const n = ts[order[k % order.length] % ts.length];
      out.push(N(t0 + k * rate, n, rate * gate, vel + (k % every === 0 ? accent : 0)));
    }
  }
  return out;
}

/** Block chords: each [t, len, "notes"] held for len*gate */
export function blocks(chords, opts = {}) {
  const { vel = 0.6, gate = 0.98 } = opts;
  const out = [];
  for (const [t, len, ns] of chords) for (const n of tones(ns)) out.push(N(t, n, len * gate, vel));
  return out;
}

/** Repeated rhythmic hits of each chord: pattern string of "x"/"." per step */
export function stabs(chords, pattern, rate = 0.25, opts = {}) {
  const { vel = 0.65, gate = 0.8 } = opts;
  const out = [];
  const p = pattern.replace(/\|/g, '');
  for (const [t0, len, ns] of chords) {
    const steps = Math.round(len / rate);
    for (let k = 0; k < steps; k++) {
      const c = p[k % p.length];
      if (c === '.' || c === '-') continue;
      const v = c === 'X' ? Math.min(1, vel + 0.2) : c === 'o' ? vel - 0.2 : vel;
      for (const n of tones(ns)) out.push(N(t0 + k * rate, n, rate * gate, v));
    }
  }
  return out;
}

/** Bass line: per chord [t, len, root]; pattern of steps: "R" root, "O" octave up, "5" fifth, "." rest */
export function bassline(chords, pattern, rate = 0.5, opts = {}) {
  const { vel = 0.8, gate = 0.85 } = opts;
  const out = [];
  const p = pattern.replace(/\|/g, '');
  for (const [t0, len, root] of chords) {
    const steps = Math.round(len / rate);
    for (let k = 0; k < steps; k++) {
      const c = p[k % p.length];
      if (c === '.') continue;
      const n = c === 'O' ? shift(root, 12) : c === '5' ? shift(root, 7) : c === '4' ? shift(root, 5) : c === 'b' ? shift(root, -2) : root;
      out.push(N(t0 + k * rate, n, rate * gate, vel + (k % 2 === 0 ? 0.05 : -0.08)));
    }
  }
  return out;
}

/** Shift a list of notes in time */
export const at = (t, notes) => notes.map(([a, n, d, v]) => N(a + t, n, d, v));

/** Drum grid clip helper: one bar per string group, "|" separated bars are concatenated */
export const grid = (at, lines, len) => ({ at, len, grid: lines });
