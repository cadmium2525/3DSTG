// BLOOM DIVE — ending "Ribbon of Dawn" (original). Plays once (`loop: false`).
// The title motif ("Starlit Ribbon", title.gen.mjs) comes home: gentle, warm, hopeful.
// D major. Piano alone with harp, then strings, then "oo" choir and glock; the title's
// bittersweet Gm6 (the last shadow) resolves plagally into D, and the melody ends on a high D
// over a held DM9 that rings out.
// 78 bpm, 17 bars ≈ 52.3 s + reverb tail (≈ 56 s file).
//   0-3 piano + harp · 4-7 strings join · 8-11 choir, melody to the violins · 12-15 cadence · 16 final chord
import { N, seq, arp, blocks, at, shift } from '../lib.mjs';

const B = 4;
// [bar, beats, pad voicing, harp tones, bass]
const prog = [
  [0, 4, 'A3 D4 E4 F#4', 'D3 A3 E4 F#4 A4 D5', 'D2'], // Dadd9
  [1, 4, 'A3 D4 E4 F#4', 'B2 F#3 D4 E4 F#4 A4', 'B1'], // Bm7(11)
  [2, 4, 'B3 D4 F#4 A4', 'G2 D3 B3 D4 F#4 A4', 'G1'], // GM9
  [3, 2, 'A3 D4 E4', 'A2 E3 D4 E4 A4 B4', 'A1'], // Asus4
  [3.5, 2, 'A3 C#4 E4', 'A2 E3 C#4 E4 A4 C#5', 'A1'], // A
  [4, 4, 'A3 C#4 E4', 'F#2 C#3 A3 C#4 E4 A4', 'F#1'], // F#m7
  [5, 4, 'A3 C#4 D4 F#4', 'B2 F#3 C#4 D4 F#4 A4', 'B1'], // Bm9
  [6, 4, 'G3 B3 D4 F#4', 'E2 B2 G3 D4 F#4 G4', 'E2'], // Em9
  [7, 2, 'B3 D4 F#4', 'G2 D3 B3 D4 F#4 A4', 'G1'], // GM7
  [7.5, 2, 'Bb3 D4 E4', 'G2 D3 Bb3 D4 E4 G4', 'G1'], // Gm6
  [8, 4, 'A3 C#4 E4 F#4', 'D3 A3 E4 F#4 A4 C#5', 'D2'], // DM9
  [9, 4, 'A3 C#4 E4', 'C#3 A3 C#4 E4 A4 B4', 'C#2'], // A/C#
  [10, 4, 'A3 D4 F#4', 'B2 F#3 D4 E4 F#4 A4', 'B1'], // Bm7
  [11, 4, 'A3 C#4 E4', 'F#2 C#3 A3 C#4 E4 A4', 'F#1'], // F#m7
  [12, 4, 'B3 D4 F#4 A4', 'G2 D3 B3 D4 F#4 A4', 'G1'], // GM9
  [13, 4, 'G3 B3 D4 F#4', 'E2 B2 G3 D4 F#4 G4', 'E2'], // Em9
  [14, 2, 'G3 A3 D4 E4', 'A2 E3 G3 D4 E4 A4', 'A1'], // A7sus4
  [14.5, 2, 'G3 A3 C#4 E4', 'A2 E3 G3 C#4 E4 A4', 'A1'], // A7
  [15, 2, 'B3 D4 G4', 'G2 D3 B3 D4 G4 B4', 'G1'], // G
  [15.5, 2, 'Bb3 D4 G4', 'G2 D3 Bb3 D4 G4 Bb4', 'G1'], // Gm (plagal, the last shadow)
  [16, 4, 'A3 C#4 E4 F#4', 'D3 A3 E4 F#4 A4 C#5', 'D2'], // DM9 — held
].map(([bar, len, pad, harp, bass]) => ({ t: bar * B, len, pad, harp, bass }));
const last = prog[prog.length - 1];
const HOLD = 6; // final chord rings past the bar line (the tail is kept: this track does not loop)

const melA = seq(`
  F#5/1.5 E5/.5 A5/2 | F#5/1 D5 E5 B4 | D5/1.5 C#5/.5 D5/1 F#5 | E5/3 -/1
  C#5/1.5 E5/.5 A5/2 | B5/1 A5 F#5 E5 | G5/1.5 F#5/.5 E5/1 D5 | D5/2 A#4/2
`, { vel: 0.58, gate: 0.96 });
const melB = seq(`
  A5/1.5 F#5/.5 A5/1 D6 | C#6/1.5 B5/.5 A5/2 | B5/1.5 A5/.5 F#5/1 D5 | E5/1 F#5 A5/2
  B5/1.5 A5/.5 F#5/1 D5 | E5/1 F#5 G5 B5 | A5/3 G5/.5 E5/.5 | F#5/2 A5/1 A#5/1 | D6/${HOLD}
`, { at: 32, vel: 0.64, gate: 0.97 });

const harp = arp(prog.filter((c) => c !== last).map((c) => [c.t, c.len, c.harp]), [0, 1, 2, 3, 4, 5, 4, 2], 0.5, { vel: 0.4, accent: 0.12, gate: 1.6 });
const harpEnd = last.harp.split(' ').map((n, k) => N(last.t + k * 0.25, n, HOLD, 0.45)); // final rolled chord
const sustain = (c, len) => (c === last ? HOLD : len);
const pad = blocks(prog.map((c) => [c.t, sustain(c, c.len), c.pad]), { vel: 0.45 });
const strings = blocks(prog.filter((c) => c.t >= 16).map((c) => [c.t, sustain(c, c.len), c.pad]), { vel: 0.48 });
const choir = blocks(prog.filter((c) => c.t >= 32).map((c) => [c.t, sustain(c, c.len), c.pad.split(' ').map((n) => shift(n, 12)).slice(0, 3).join(' ')]), { vel: 0.4 });
const bass = prog.map((c) => N(c.t, c.bass, sustain(c, c.len) * 0.95, 0.5));
const box = [];
prog.forEach((c, i) => {
  if (c.t < 32 || c === last) return;
  const hi = c.harp.split(' ').slice(-3).map((n) => shift(n, 24));
  if (c.len === 4) box.push(N(c.t + 1.5, hi[2], 0.5, 0.36), N(c.t + 2.5, hi[1], 0.5, 0.3), N(c.t + 3.5, hi[0], 0.5, 0.26));
  else box.push(N(c.t + 1, hi[2], 0.5, 0.32));
  if (i % 4 === 3) box.push(N(c.t + c.len - 0.25, hi[1], 0.25, 0.22));
});
box.push(N(last.t + 0.5, 'A6', 2, 0.3), N(last.t + 1, 'C#7', 2, 0.26), N(last.t + 1.5, 'E7', 2, 0.24));
const glock = at(0, melB.filter(([t]) => t >= 48).map(([t, n, d, v]) => N(t, shift(n, 12), Math.min(d, 1.5), v * 0.55)));

export default () => ({
  name: 'BLOOM DIVE - Ribbon of Dawn (ending)',
  bpm: 78,
  sig: [4, 4],
  bars: 17,
  loop: false,
  key: 'D major',
  tail: 6,
  sends: {
    reverb: { size: 2.3, decay: 4.0, damp: 6500, predelay: 0.04, volume: 0 },
    delay: { time: '1/4d', feedback: 0.35, tone: 4200, volume: -3 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'piano', name: 'Piano melody', inst: 'softpiano', pan: 0.05, trim: 1.5, sends: { reverb: 0.32, delay: 0.12 }, humanize: { time: 0.008, vel: 0.05 }, clips: [{ at: 0, notes: [...melA, ...melB.filter(([t]) => t >= 48)] }] },
    { id: 'violin', name: 'Violins (melody)', inst: 'violin', pan: -0.15, trim: 0, sends: { reverb: 0.4 }, clips: [{ at: 0, notes: melB }] },
    { id: 'cello', name: 'Cello', inst: 'cello', pan: 0.2, trim: -3, sends: { reverb: 0.4 }, clips: [{ at: 0, notes: prog.filter((c) => c.t >= 16).map((c) => N(c.t, shift(c.bass, 12), sustain(c, c.len) * 0.95, 0.5)) }] },
    { id: 'harp', name: 'Harp', inst: 'harp', pan: -0.25, trim: 0, sends: { reverb: 0.35, delay: 0.05 }, humanize: { time: 0.006, vel: 0.06 }, clips: [{ at: 0, notes: [...harp, ...harpEnd] }] },
    { id: 'pad', name: 'Glass pad', inst: 'glasspad', trim: -1, sends: { reverb: 0.4 }, fx: [{ type: 'widen', amount: 0.4, lowmono: 200 }], clips: [{ at: 0, notes: pad }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -2, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: strings }] },
    { id: 'choir', name: 'Choir oo', inst: 'choiroo', trim: -2, sends: { reverb: 0.55 }, clips: [{ at: 0, notes: choir }] },
    { id: 'box', name: 'Music box', inst: 'musicbox', pan: 0.35, trim: -3, sends: { reverb: 0.45, delay: 0.35 }, clips: [{ at: 0, notes: box }] },
    { id: 'glock', name: 'Glock', inst: 'glock', pan: -0.3, trim: -5, sends: { reverb: 0.4, delay: 0.25 }, clips: [{ at: 0, notes: glock }] },
    { id: 'bass', name: 'Sub', inst: 'subbass', trim: -4, fx: [{ type: 'eq', bands: [{ type: 'lp', freq: 400 }] }], clips: [{ at: 0, notes: bass }] },
  ],
});
