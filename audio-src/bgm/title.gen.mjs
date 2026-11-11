// BLOOM DIVE — title theme "Starlit Ribbon" (original).
// Calm, dreamy, sparkling: harp arpeggios, soft piano melody, music box / glock
// glitter, glass + air pads and an "oo" choir. D major with a borrowed Gm6 that
// melts back into the top of the loop. 88 bpm, 16 bars = 43.6 s seamless loop.
import { N, seq, arp, blocks, at, shift } from '../lib.mjs';

const B = 4;
// [bar, beats, pad voicing, harp tones, bass]
const prog = [
  [0, 4, 'A3 C#4 E4 F#4', 'D3 A3 E4 F#4 A4 C#5', 'D2'], // DM9
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
  [14, 4, 'G3 A3 D4 E4', 'A2 E3 G3 D4 E4 A4', 'A1'], // A7sus4
  [15, 4, 'Bb3 D4 E4 G4', 'G2 D3 Bb3 D4 E4 G4', 'G1'], // Gm6 → back to DM9
].map(([bar, len, pad, harp, bass]) => ({ t: bar * B, len, pad, harp, bass }));

const melody = seq(`
  F#5/1.5 E5/.5 A5/2 | F#5/1 D5 E5 B4 | D5/1.5 C#5/.5 D5/1 F#5 | E5/3 -/1
  C#5/1.5 E5/.5 A5/2 | B5/1 A5 F#5 E5 | G5/1.5 F#5/.5 E5/1 D5 | D5/2 A#4/2
  A5/1.5 F#5/.5 A5/1 D6 | C#6/1.5 B5/.5 A5/2 | B5/1.5 A5/.5 F#5/1 D5 | E5/1 F#5 A5/2
  B5/1.5 A5/.5 F#5/1 D5 | E5/1 F#5 G5 B5 | A5/3 G5/.5 E5/.5 | D5/2 E5/1 -/1
`, { vel: 0.62, gate: 0.95 });

const harp = arp(prog.map((c) => [c.t, c.len, c.harp]), [0, 1, 2, 3, 4, 5, 4, 2], 0.5, { vel: 0.42, accent: 0.12, gate: 1.6 });
const pad = blocks(prog.map((c) => [c.t, c.len, c.pad]), { vel: 0.5 });
const choir = blocks(prog.filter((c) => c.t >= 32).map((c) => [c.t, c.len, c.pad.split(' ').map((n) => shift(n, 12)).slice(0, 3).join(' ')]), { vel: 0.4 });
const bass = prog.map((c) => N(c.t, c.bass, c.len * 0.95, 0.55));
// glitter: music box dots on the 9th / 5th of each chord, one octave over the melody
const box = [];
prog.forEach((c, i) => {
  const hi = c.harp.split(' ').slice(-3).map((n) => shift(n, 24));
  if (c.len === 4) box.push(N(c.t + 1.5, hi[2], 0.5, 0.4), N(c.t + 2.5, hi[1], 0.5, 0.32), N(c.t + 3.5, hi[0], 0.5, 0.28));
  else box.push(N(c.t + 1, hi[2], 0.5, 0.35));
  if (i % 4 === 3) box.push(N(c.t + c.len - 0.25, hi[1], 0.25, 0.25));
});
// glock doubles the second half of the tune an octave up
const glock = at(0, melody.filter(([t]) => t >= 32).map(([t, n, d, v]) => N(t, shift(n, 12), Math.min(d, 1), v * 0.6)));

export default () => ({
  name: 'BLOOM DIVE - Starlit Ribbon (title)',
  bpm: 88,
  sig: [4, 4],
  bars: 16,
  key: 'D major',
  tail: 6,
  sends: {
    reverb: { size: 2.2, decay: 4.2, damp: 6500, predelay: 0.04, volume: 0 },
    delay: { time: '1/4d', feedback: 0.38, tone: 4200, volume: -2 },
  },
  master: { loudness: -17, ceiling: -1.5 },
  tracks: [
    { id: 'mel', name: 'Piano melody', inst: 'softpiano', pan: 0.05, trim: 1.5, sends: { reverb: 0.32, delay: 0.16 }, humanize: { time: 0.008, vel: 0.05 }, clips: [{ at: 0, notes: melody }] },
    { id: 'harp', name: 'Harp', inst: 'harp', pan: -0.25, trim: 0, sends: { reverb: 0.35, delay: 0.05 }, humanize: { time: 0.006, vel: 0.06 }, clips: [{ at: 0, notes: harp }] },
    { id: 'pad', name: 'Glass pad', inst: 'glasspad', trim: 0, sends: { reverb: 0.4 }, fx: [{ type: 'widen', amount: 0.4, lowmono: 200 }], clips: [{ at: 0, notes: pad }] },
    { id: 'air', name: 'Air pad', inst: 'airpad', trim: -3, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: blocks(prog.filter((c) => c.t >= 16).map((c) => [c.t, c.len, c.pad.split(' ').map((n) => shift(n, 12)).join(' ')]), { vel: 0.4 }) }] },
    { id: 'choir', name: 'Choir oo', inst: 'choiroo', trim: -2, sends: { reverb: 0.55 }, clips: [{ at: 0, notes: choir }] },
    { id: 'box', name: 'Music box', inst: 'musicbox', pan: 0.35, trim: -2, sends: { reverb: 0.45, delay: 0.35 }, clips: [{ at: 0, notes: box }] },
    { id: 'glock', name: 'Glock', inst: 'glock', pan: -0.3, trim: -4, sends: { reverb: 0.4, delay: 0.25 }, clips: [{ at: 0, notes: glock }] },
    { id: 'bass', name: 'Sub', inst: 'subbass', trim: -3, fx: [{ type: 'eq', bands: [{ type: 'lp', freq: 400 }] }], clips: [{ at: 0, notes: bass }] },
  ],
});
