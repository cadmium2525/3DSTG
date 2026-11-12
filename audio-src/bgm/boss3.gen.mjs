// BLOOM DIVE — final boss theme "Shadow of the Light" (original).
// 影の少女 — the heroine's own shadow. Solemn, tragic and epic.
// Built on the title theme "Starlit Ribbon" (title.gen.mjs, D major):
//   title motif   F#5 E5 A5 | F#5 D5 E5 B4 | D5 C#5 D5 F#5 | E5      (scale steps 3 2 5 | 3 1 2 6 | 1 7 1 3 | 2)
//   shadow motif  = its diatonic inversion around the 3rd, in D (harmonic) minor:
//                 F5 G5 D5 | F5 A5 G5 C#6 | A5 A#5 A5 F5 | G5      (3 4 1 | 3 5 4 7 | 5 6 5 3 | 4)
//   the shadow also sings the title motif itself in minor ("mimic"), and in the second half the
//   light answers with the title motif in D major (trumpets, choir, harp), fights the shadow
//   motif (G Em A Gm — the title's own borrowed Gm6) and wins the climax, before the turnaround
//   drags the loop back into darkness.
// 170 bpm, 56 bars ≈ 79.1 s seamless loop.
//   0-3 intro (choir, shadow motif ×2 slow) · 4-11 shadow theme · 12-19 mimic (title motif in minor) ·
//   20-27 lament (half-time) · 28-35 light (title motif, D major) · 36-43 clash · 44-51 climax · 52-55 turnaround
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Dm: ['D4 F4 A4', 'D2'],
  A: ['C#4 E4 A4', 'A1'],
  A7: ['C#4 E4 G4', 'A1'],
  Bb: ['D4 F4 Bb4', 'Bb1'],
  Gm: ['D4 G4 Bb4', 'G1'],
  Eb: ['Eb4 G4 Bb4', 'Eb2'],
  F: ['C4 F4 A4', 'F1'],
  C: ['C4 E4 G4', 'C2'],
  D: ['D4 F#4 A4', 'D2'],
  Bm: ['D4 F#4 B4', 'B1'],
  G: ['D4 G4 B4', 'G1'],
  Em: ['E4 G4 B4', 'E2'],
};
const sections = [
  ['intro', 'Dm Bb Dm A7'],
  ['shadow', 'Dm A7 Dm Gm Dm Bb Eb A'],
  ['mimic', 'Dm Bb Gm A Dm A Bb A'],
  ['lament', 'Bb Gm F A7 Dm F Gm A'],
  ['light', 'D Bm G A D A G A'],
  ['clash', 'G Em A Gm Bb C Dm A'],
  ['climax', 'D Bm G A D A G A'],
  ['turn', 'Bb C A A7'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');
const oct = (notes, k, vm = 1) => notes.map(([t, n, d, v]) => N(t, shift(n, k), d, v * vm));
const dark = new Set(['intro', 'shadow', 'mimic', 'lament', 'turn']);

/* ---- themes ---- */
// shadow motif, slow (choir, intro) and in the lament
const shadowSlowA = `F5/3 G5/1 D5/4 | F5/2 A5/2 G5/2 C#6/2`;
const introChoir = seq(shadowSlowA, { at: 0, vel: 0.62, gate: 1 });
const lamentLine = seq(`${shadowSlowA} | A5/3 A#5/1 A5/2 F5/2 | G5/6 -/2`, { at: start('lament'), vel: 0.66, gate: 1 });
// shadow theme (title-time motif + its answer)
const shadowTheme = seq(`
  F5/1.5 G5/.5 D5/2 | F5/1 A5/1 G5/1 C#6/1 | A5/1.5 A#5/.5 A5/1 F5/1 | G5/3 -/1
  D6/1.5 C6/.5 A5/2 | A#5/1 A5/1 F5/1 D5/1 | D#5/1 G5/1 A#5/1 D#6/1 | C#6/2 A5/1 E5/1
`, { at: start('shadow'), vel: 0.8, gate: 0.9 });
// mimic: the title motif itself, in D minor
const mimic = seq(`
  F5/1.5 E5/.5 A5/2 | F5/1 D5/1 E5/1 A#4/1 | D5/1.5 C#5/.5 D5/1 F5/1 | E5/3 -/1
  A5/1.5 F5/.5 A5/1 D6/1 | C#6/1.5 A#5/.5 A5/2 | A#5/1.5 A5/.5 F5/1 D5/1 | E5/1 F5/1 A5/2
`, { at: start('mimic'), vel: 0.8, gate: 0.94 });
const mimicCounter = seq(`D4/2 F4/2 | D4/2 F4/2 | D4/2 A#3/2 | C#4/2 E4/2 | F4/2 A4/2 | E4/2 C#4/2 | D4/2 F4/2 | E4/4`, { at: start('mimic'), vel: 0.75, gate: 0.97 });
// light: the title motif in D major
const lightStr = `
  F#5/1.5 E5/.5 A5/2 | F#5/1 D5/1 E5/1 B4/1 | D5/1.5 C#5/.5 D5/1 F#5/1 | E5/3 -/1
  A5/1.5 F#5/.5 A5/1 D6/1 | C#6/1.5 B5/.5 A5/2 | B5/1.5 A5/.5 F#5/1 D5/1 | E5/1 F#5/1 A5/2
`;
const light = seq(lightStr, { at: start('light'), vel: 0.8, gate: 0.95 });
const climax = seq(lightStr, { at: start('climax'), vel: 0.86, gate: 0.95 });
// clash: the title's last phrase (G Em A Gm6), then the shadow motif rising against it
const clashLight = seq(`B5/1.5 A5/.5 F#5/1 D5/1 | E5/1 F#5/1 G5/1 B5/1 | A5/3 G5/.5 E5/.5 | D5/2 E5/1 -/1`, { at: start('clash'), vel: 0.84, gate: 0.95 });
const clashDark = seq(`F5/1.5 G5/.5 D5/2 | E5/1 G5/1 C6/2 | D6/1.5 E6/.5 F6/2 | E6/2 C#6/2`, { at: start('clash') + 16, vel: 0.84, gate: 0.9 });
const turnLine = seq(`D5/1 F5/1 A#5/2 | C6/1 E5/1 G5/2 | C#6/2 E6/2 | A5/2 C#6/1 E6/1`, { at: start('turn'), vel: 0.86, gate: 0.92 });
// climax counter: the shadow motif in the horns, now under D major (it has lost)
const climaxHorn = seq(`F#4/2 G4/2 | D4/4 | D4/2 E4/2 | C#4/4 | F#4/2 A4/2 | E4/2 C#4/2 | D4/2 B3/2 | C#4/4`, { at: start('climax'), vel: 0.78, gate: 0.97 });

/* ---- orchestra ---- */
const strings = blocks(bars.map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const choirChords = blocks(bars.filter((b) => ['lament', 'light', 'clash', 'climax', 'turn'].includes(b.sec)).map((b) => [b.t, B, V[b.c][0]]), { vel: 0.52 });
const ost = arp(bars.filter((b) => b.sec !== 'lament' && b.sec !== 'intro').map((b) => [b.t, B, V[b.c][0]]), [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2], 0.25, { vel: 0.5, accent: 0.2, gate: 0.55 });
const harp = arp(inSec('light', 'climax').map((b) => [b.t, B, up(V[b.c][0], 12)]), [0, 1, 2, 1, 2, 0, 1, 2], 0.25, { vel: 0.42, accent: 0.12, gate: 1.2 });
const lamentHarp = arp(inSec('lament').map((b) => [b.t, B, `${shift(V[b.c][1], 24)} ${up(V[b.c][0], 0)} ${shift(tones(V[b.c][0])[0], 12)}`]), [0, 1, 2, 3, 4, 3, 2, 1], 0.5, { vel: 0.45, accent: 0.1, gate: 1.6 });
const piano = blocks(inSec('lament').map((b) => [b.t, B, `${shift(V[b.c][1], 12)} ${V[b.c][0]}`]), { vel: 0.5 });
const box = inSec('lament').flatMap((b) => [N(b.t + 1.5, shift(tones(V[b.c][0])[2], 24), 0.5, 0.35), N(b.t + 3.5, shift(tones(V[b.c][0])[1], 24), 0.5, 0.28)]);
const stab = stabs(inSec('shadow', 'mimic', 'clash', 'turn').map((b) => [b.t, B, up(V[b.c][0], 12)]), 'x..x..x...x.x...', 0.25, { vel: 0.58, gate: 0.6 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'lament') return [N(b.t, r, 2.8, 0.8), N(b.t + 3, r, 0.9, 0.55)];
  if (b.sec === 'intro') return [N(b.t, r, 1.4, 0.9), N(b.t + 1.5, r, 1, 0.7), N(b.t + 3, shift(r, 12), 0.9, 0.7)];
  return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 3 || k === 7 ? shift(r, 12) : r, 0.42, k % 2 ? 0.65 : 0.85));
});
const timp = bars.flatMap((b) => {
  const r = shift(V[b.c][1], V[b.c][1].endsWith('1') ? 12 : 0);
  if (b.sec === 'intro') return [N(b.t, r, 1, 0.95), N(b.t + 1.5, r, 1, 0.6), N(b.t + 3, r, 0.5, 0.7), N(b.t + 3.5, r, 0.5, 0.85)];
  if (b.sec === 'lament') return [N(b.t, r, 2, 0.7)];
  return [N(b.t, r, 1, 0.75), N(b.t + 2, r, 1, 0.5)];
});
const hits = ['shadow', 'mimic', 'light', 'clash', 'climax', 'turn'].map((s) => N(start(s), s === 'light' || s === 'climax' ? 'D4' : 'D4', 1, 0.85));
const bells = [...inSec('intro'), ...inSec('turn')].map((b) => N(b.t, shift(tones(V[b.c][0])[0], 12), 3, 0.5));

/* ---- drums ---- */
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') {
    g.kick = 'x.........x.....';
    if (k === 3) g.snare = '....x...xxxxXXXX';
  } else if (b.sec === 'lament') {
    if (k >= 2) { g.kick = 'x.......x.......'; g.ride = 'x...x...x...x...'; }
    if (k >= 2) g.snare = '........x.......';
    if (k === 7) g.snare = 'x.x.x.x.xxxxXXXX';
  } else {
    g.kick = b.sec === 'light' || b.sec === 'climax' ? 'x...x...x...x...' : 'x..x..x.x.x...x.';
    g.snare = '....x.......x...';
    g.hat = 'xgxgxgxgxgxgxgxg';
    if (b.sec !== 'shadow') g.ride = 'o.o.o.o.o.o.o.o.';
    if (first) g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
    if (b.sec === 'turn' && k === 3) { g.snare = '....x...xxxxXXXX'; g.tom2 = '..........x.x...'; }
  }
  return { at: b.t, len: B, grid: g };
});
const bigDrums = bars.map((b) => {
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') { g.tom3 = 'x.....x...x.....'; g.tom2 = '...x.....x....x.'; }
  else if (b.sec === 'lament') { if (k >= 4) g.tom3 = 'x.........x.....'; }
  else if (b.sec === 'light' || b.sec === 'climax' || b.sec === 'turn') g.tom3 = 'x.......x.......';
  else g.tom3 = 'x...............';
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Shadow of the Light (final boss)',
  bpm: 170,
  sig: [4, 4],
  bars: bars.length,
  key: 'D minor / D major',
  tail: 5,
  sends: {
    reverb: { size: 2.0, decay: 2.9, damp: 6500, predelay: 0.025, volume: 0 },
    delay: { time: '1/8d', feedback: 0.3, tone: 4500, volume: -4 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.08 }, humanize: { time: 0.003, vel: 0.05 }, clips: drumClips },
    { id: 'big', name: 'Cinematic toms', kit: 'cinematic', trim: -2, sends: { reverb: 0.3 }, clips: bigDrums },
    { id: 'timp', name: 'Timpani', inst: 'timpani', trim: -2, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: timp }] },
    { id: 'bass', name: 'Bass', inst: 'synthbass', trim: 0, fx: [{ type: 'pump', amount: 0.3, rate: '1/4', release: 0.35 }, { type: 'dist', drive: 5, kind: 'tape', mix: 0.35 }], clips: [{ at: 0, notes: bass }] },
    { id: 'ost', name: 'Spiccato', inst: 'spiccato', trim: -0.5, pan: -0.2, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: ost }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -1, pan: 0.1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: strings }] },
    { id: 'piano', name: 'Piano (lament)', inst: 'softpiano', trim: -2, sends: { reverb: 0.4, delay: 0.1 }, clips: [{ at: 0, notes: piano }] },
    { id: 'harp', name: 'Harp', inst: 'harp', trim: -3, pan: 0.3, sends: { reverb: 0.35, delay: 0.1 }, clips: [{ at: 0, notes: [...harp, ...lamentHarp] }] },
    { id: 'box', name: 'Music box (lament)', inst: 'musicbox', trim: -5, pan: -0.35, sends: { reverb: 0.5, delay: 0.35 }, clips: [{ at: 0, notes: box }] },
    { id: 'stab', name: 'Saw stabs', inst: 'chordstab', trim: -5, pan: 0.2, sends: { reverb: 0.2, delay: 0.1 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: stab }] },
    { id: 'lead', name: 'Shadow lead', inst: 'supersaw', trim: 1.5, sends: { reverb: 0.2, delay: 0.18 }, clips: [{ at: 0, notes: [...shadowTheme, ...clashDark, ...turnLine] }] },
    { id: 'violin', name: 'Violins', inst: 'violin', trim: -1, pan: -0.25, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: [...oct(shadowTheme, -12), ...mimic, ...lamentLine, ...oct(climax, -12)] }] },
    { id: 'tpt', name: 'Trumpets (light)', inst: 'trumpet', trim: 1.5, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: [...light, ...clashLight, ...climax] }] },
    { id: 'horn', name: 'Horns', inst: 'horn', trim: 0.5, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: [...mimicCounter, ...oct(light, -12), ...oct(clashDark, -12), ...climaxHorn] }] },
    { id: 'choirmel', name: 'Choir (motif)', inst: 'choir', trim: -1, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: [...introChoir, ...oct(lamentLine, -12, 0.9), ...oct(climax, 0, 0.9)] }] },
    { id: 'choir', name: 'Choir (chords)', inst: 'choiroo', trim: -3, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: choirChords }] },
    { id: 'glock', name: 'Glock (light)', inst: 'glock', trim: -5, pan: -0.3, sends: { reverb: 0.4, delay: 0.25 }, clips: [{ at: 0, notes: oct(climax, 12, 0.6).map(([t, n, d, v]) => N(t, n, Math.min(d, 1), v)) }] },
    { id: 'bells', name: 'Tubular bells', inst: 'tubular', trim: -4, pan: 0.3, sends: { reverb: 0.55 }, clips: [{ at: 0, notes: bells }] },
    { id: 'hit', name: 'Orch hits', inst: 'orchhit', trim: -3, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: hits }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('lament'), sfx: { preset: 'braam', length: 1.2, space: 0.6 }, gain: -7 },
      { at: start('light') - 8, sfx: { preset: 'riser', length: 1.13, tone: 0.4 }, gain: -2 },
      { at: start('light'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
      { at: start('climax') - 4, sfx: { preset: 'revcymbal', length: 0.95 }, gain: -3 },
      { at: start('turn'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
    ] },
  ],
});
