// BLOOM DIVE — boss theme "Corolla of Night" (original).
// Epic and dramatic: C (harmonic) minor main theme on supersaw lead + strings,
// a heroic horn/trumpet counter-melody that lifts into Eb major (the heroine's motif),
// spiccato ostinato, choir, timpani, cinematic toms. 170 bpm, 40 bars ≈ 56.5 s loop.
//   0-3 intro · 4-11 main theme · 12-19 heroic theme · 20-27 both together ·
//   28-35 half-time bridge (build) · 36-39 turnaround
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Cm: ['C4 Eb4 G4', 'C2'],
  Ab: ['C4 Eb4 Ab4', 'Ab1'],
  Bb: ['D4 F4 Bb4', 'Bb1'],
  Eb: ['Eb4 G4 Bb4', 'Eb2'],
  Fm: ['C4 F4 Ab4', 'F1'],
  G: ['B3 D4 G4', 'G1'],
  Gsus: ['C4 D4 G4', 'G1'],
  Db: ['Db4 F4 Ab4', 'Db2'],
};
const sections = [
  ['intro', 'Cm Cm Ab G'],
  ['main', 'Cm Ab Bb Cm Cm Ab Fm G'],
  ['hero', 'Ab Bb Eb Cm Ab Bb Gsus G'],
  ['both', 'Cm Ab Bb Cm Cm Ab Fm G'],
  ['bridge', 'Fm Db Ab G Fm Db Bb G'],
  ['turn', 'Ab Bb Gsus G'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));

const mainStr = `
  G5/.5 G5/.5 D#5/.5 G5/.5 C6/1 A#5/.5 G5/.5 | G#5/1 G5/.5 F5/.5 D#5/1 C5/1 | D5/.75 D#5/.75 F5/.5 A#5/1 G#5/.5 G5/.5 | G5/3 -/1
  G5/.5 G5/.5 D#5/.5 G5/.5 C6/1 D6/.5 D#6/.5 | D#6/1 C6/.5 A#5/.5 G#5/1 F5/1 | G#5/.75 G5/.75 F5/.5 C5/1 F5/1 | G5/2 F5/.5 D#5/.5 D5/.5 B4/.5
`;
const main1 = seq(mainStr, { at: start('main'), vel: 0.78, gate: 0.88 });
const main2 = seq(mainStr, { at: start('both'), vel: 0.82, gate: 0.88 });
const hero = seq(`
  D#5/1.5 F5/.5 G5/2 | F5/1.5 G5/.5 G#5/1 A#5/1 | G5/3 A#5/1 | C6/2 A#5/1 G5/1
  G#5/1.5 G5/.5 F5/1 D#5/1 | D5/1.5 D#5/.5 F5/1 A#5/1 | C6/4 | B5/4
`, { at: start('hero'), vel: 0.8, gate: 0.97 });
const counter = seq(`
  C5/2 D5/2 | D#5/2 C5/2 | D5/2 F5/2 | D#5/4 | G4/2 C5/2 | D#5/2 F5/2 | C5/2 G#4/2 | B4/2 D5/2
`, { at: start('both'), vel: 0.8, gate: 0.97 });
const bridgeChoir = seq(`C5/4 | C#5/4 | D#5/4 | D5/4 | C5/4 | F5/4 | F5/2 D5/2 | B4/4`, { at: start('bridge'), vel: 0.6, gate: 1 });
const turnLine = seq(`C5/1 D#5/1 G#5/2 | D5/1 F5/1 A#5/2 | C6/4 | B5/2 D6/2`, { at: start('turn'), vel: 0.85, gate: 0.95 });

const ost = arp(bars.filter((b) => b.sec !== 'bridge').map((b) => [b.t, B, V[b.c][0]]), [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2], 0.25, { vel: 0.5, accent: 0.2, gate: 0.6 });
const bridgeArp = arp(inSec('bridge').map((b) => [b.t, B, tones(V[b.c][0]).map((n) => shift(n, 12)).join(' ')]), [0, 1, 2, 1], 0.5, { vel: 0.45 });
const strings = blocks(bars.map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'bridge') return [N(b.t, r, 2.8, 0.85), N(b.t + 3, r, 0.9, 0.6)];
  if (b.sec === 'intro') return [N(b.t, r, 1.4, 0.9), N(b.t + 1.5, r, 1, 0.7), N(b.t + 3, shift(r, 12), 0.9, 0.7)];
  return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 3 || k === 7 ? shift(r, 12) : r, 0.42, k % 2 ? 0.65 : 0.85));
});
const stab = stabs(inSec('main', 'both', 'turn').map((b) => [b.t, B, tones(V[b.c][0]).map((n) => shift(n, 12)).join(' ')]), 'x..x..x...x.x...', 0.25, { vel: 0.6, gate: 0.6 });
const choir = blocks(bars.filter((b) => ['intro', 'hero', 'both', 'turn'].includes(b.sec)).map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const timp = bars.flatMap((b) => {
  const r = shift(V[b.c][1], 12);
  if (b.sec === 'intro') return [N(b.t, r, 1, 0.95), N(b.t + 1.5, r, 1, 0.6), N(b.t + 3, r, 0.5, 0.7), N(b.t + 3.5, r, 0.5, 0.85)];
  if (b.sec === 'bridge') return [N(b.t, r, 2, 0.8), N(b.t + 2.5, r, 1, 0.5)];
  return [N(b.t, r, 1, 0.75), N(b.t + 2, r, 1, 0.5)];
});
const hits = [start('main'), start('hero'), start('both'), start('turn')].map((t) => N(t, 'C4', 1, 0.8));

const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') {
    g.hat = 'x.x.x.x.x.x.x.x.';
    g.kick = 'x.........x.....';
    if (k === 3) g.snare = '....x...xxxxXXXX';
  } else if (b.sec === 'bridge') {
    g.kick = 'x.......x.......';
    g.snare = k < 6 ? '........x.......' : k === 6 ? '....x...x...x...' : 'x.x.x.x.xxxxXXXX';
    g.ride = 'x...x...x...x...';
    if (k === 0) g.crash = 'x...............';
  } else {
    g.kick = b.sec === 'hero' ? 'x...x...x...x...' : 'x..x..x.x.x...x.';
    g.snare = '....x.......x...';
    g.hat = 'xgxgxgxgxgxgxgxg';
    if (b.sec !== 'main') g.ride = 'o.o.o.o.o.o.o.o.';
    if (first) g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
    if (b.sec === 'turn' && k === 3) { g.snare = '....x...xxxxXXXX'; g.tom2 = '..........x.x...'; }
  }
  return { at: b.t, len: B, grid: g };
});
const bigDrums = bars.map((b, i) => {
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') { g.tom3 = 'x.....x...x.....'; g.tom2 = '...x.....x....x.'; }
  else if (b.sec === 'bridge') { g.tom3 = 'x.....x...x.....'; if (k % 2) g.tom1 = '............x.x.'; }
  else if (b.sec === 'hero' || b.sec === 'turn') g.tom3 = 'x.......x.......';
  else g.tom3 = 'x...............';
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Corolla of Night (boss)',
  bpm: 170,
  sig: [4, 4],
  bars: bars.length,
  key: 'C minor',
  tail: 4,
  sends: {
    reverb: { size: 1.8, decay: 2.6, damp: 6500, predelay: 0.02, volume: 0 },
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
    { id: 'barp', name: 'Bridge harp', inst: 'harp', trim: -6, pan: 0.3, sends: { reverb: 0.4, delay: 0.2 }, clips: [{ at: 0, notes: bridgeArp }] },
    { id: 'stab', name: 'Saw stabs', inst: 'chordstab', trim: -4, pan: 0.2, sends: { reverb: 0.2, delay: 0.1 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: stab }] },
    { id: 'lead', name: 'Main theme lead', inst: 'supersaw', trim: 1.5, sends: { reverb: 0.2, delay: 0.18 }, clips: [{ at: 0, notes: [...main1, ...main2] }] },
    { id: 'violin', name: 'Violin double', inst: 'violin', trim: -3, pan: -0.25, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: [...main1, ...main2].map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'hero', name: 'Heroic trumpets', inst: 'trumpet', trim: 1.5, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: [...hero, ...turnLine] }] },
    { id: 'horn', name: 'Horn counter', inst: 'horn', trim: 1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: [...hero.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)), ...counter] }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -2, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: [...choir, ...bridgeChoir] }] },
    { id: 'hit', name: 'Orch hits', inst: 'orchhit', trim: -3, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: hits }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('hero') - 4, sfx: { preset: 'revcymbal', length: 0.95 }, gain: -3 },
      { at: start('turn') - 8, sfx: { preset: 'riser', length: 1.13, tone: 0.2 }, gain: -2 },
      { at: start('turn'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
    ] },
  ],
});
