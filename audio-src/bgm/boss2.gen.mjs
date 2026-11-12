// BLOOM DIVE — stage 2 boss theme "Devoured Sun" (original).
// 蝕む日輪 エクリプス — a sun being swallowed by a black disc: grand, ominous, dramatic.
// F minor main theme on supersaw + strings, a broad trumpet "sun" theme in Db major that is
// itself eaten (Db → Dbm), a half-time "totality" section with choir chant and tubular bells,
// orchestral hits, timpani, trombone stabs, acid-tinged driving synths.
// 165 bpm, 40 bars ≈ 58.2 s seamless loop.
//   0-3 intro · 4-11 main · 12-19 sun theme · 20-27 main + horn counter · 28-35 totality (half-time) · 36-39 turnaround
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Fm: ['C4 F4 Ab4', 'F1'],
  Db: ['Db4 F4 Ab4', 'Db2'],
  Dbm: ['Db4 E4 Ab4', 'Db2'],
  Bbm: ['Db4 F4 Bb4', 'Bb1'],
  C: ['C4 E4 G4', 'C2'],
  C7: ['Bb3 E4 G4', 'C2'],
  Csus: ['C4 F4 G4', 'C2'],
  Gb: ['Db4 Gb4 Bb4', 'Gb1'],
  Eb: ['Eb4 G4 Bb4', 'Eb2'],
  Ebm: ['Eb4 Gb4 Bb4', 'Eb2'],
  Cm: ['C4 Eb4 G4', 'C2'],
  E: ['E4 G#4 B4', 'E2'],
};
const sections = [
  ['intro', 'Fm Db E C'],
  ['main', 'Fm Db Bbm C Fm Db Gb C'],
  ['sun', 'Db Eb Cm Fm Db Dbm C C7'],
  ['both', 'Fm Db Bbm C Fm Db Gb C'],
  ['total', 'Bbm Gb Db C Bbm Gb Ebm C'],
  ['turn', 'Db Eb Csus C'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');

/* ---- themes ---- */
const mainStr = `
  F5/1 C5/.5 F5/.5 G#5/1 G5/.5 F5/.5 | G#5/1.5 A#5/.5 G#5/1 F5/1 | C#6/1 C6/.5 A#5/.5 F5/1 C#5/1 | E5/1.5 F5/.5 G5/2
  F5/1 C5/.5 F5/.5 G#5/1 C6/1 | C#6/1.5 C6/.5 G#5/1 F5/1 | A#5/1 C#6/.5 A#5/.5 F#5/2 | E5/1 G5/1 C6/1 E6/1
`;
const main1 = seq(mainStr, { at: start('main'), vel: 0.8, gate: 0.88 });
const main2 = seq(mainStr, { at: start('both'), vel: 0.84, gate: 0.88 });
const sun = seq(`
  F5/2 G#5/2 | G5/1.5 A#5/.5 D#6/2 | D#6/2 C6/1 G5/1 | G#5/3 C6/1 | C#6/2 C6/1 G#5/1 | G#5/2 E5/2 | E5/2 G5/2 | A#5/2 C6/2
`, { at: start('sun'), vel: 0.82, gate: 0.97 });
const counter = seq(`
  C5/2 C#5/2 | F5/2 C#5/2 | C#5/2 F5/2 | E5/2 G5/2 | C5/2 G#4/2 | G#4/2 F5/2 | F#5/2 C#5/2 | E5/2 C5/2
`, { at: start('both'), vel: 0.8, gate: 0.97 });
const chant = seq(`F5/4 | F#5/4 | F5/4 | E5/4 | C#5/4 | A#4/4 | F#5/2 F5/2 | E5/4`, { at: start('total'), vel: 0.62, gate: 1 });
const turnLine = seq(`G#5/1 F5/1 C#6/2 | A#5/1 G5/1 D#6/2 | F6/4 | E6/2 C6/2`, { at: start('turn'), vel: 0.86, gate: 0.95 });

/* ---- orchestra / synths ---- */
const ost = arp(bars.filter((b) => b.sec !== 'total').map((b) => [b.t, B, V[b.c][0]]), [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1], 0.25, { vel: 0.5, accent: 0.2, gate: 0.55 });
const synthArp = arp(inSec('main', 'both', 'turn').map((b) => [b.t, B, up(V[b.c][0], 12)]), [0, 1, 2, 1, 2, 0, 2, 1], 0.25, { vel: 0.42, accent: 0.18, gate: 0.6 });
const strings = blocks(bars.map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const choir = blocks(bars.filter((b) => ['intro', 'sun', 'total', 'turn'].includes(b.sec)).map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const tromb = stabs(inSec('main', 'both', 'turn').map((b) => [b.t, B, up(V[b.c][0], -12)]), 'x.....x...x.....', 0.25, { vel: 0.65, gate: 0.7 });
const synthStab = stabs(inSec('main', 'sun', 'both').map((b) => [b.t, B, up(V[b.c][0], 12)]), '..x..x..x..x.x..', 0.25, { vel: 0.5, gate: 0.5 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'total') return [N(b.t, r, 2.8, 0.85), N(b.t + 3, r, 0.9, 0.6)];
  if (b.sec === 'intro') return [N(b.t, r, 1.4, 0.9), N(b.t + 1.5, r, 1, 0.7), N(b.t + 3, shift(r, 12), 0.9, 0.7)];
  return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 2 || k === 5 ? shift(r, 12) : r, 0.42, k % 2 ? 0.65 : 0.85));
});
const timp = bars.flatMap((b) => {
  const r = shift(V[b.c][1], b.c === 'E' || b.c === 'Eb' || b.c === 'Ebm' || b.c === 'Db' || b.c === 'Dbm' ? 0 : 12);
  if (b.sec === 'intro') return [N(b.t, r, 1, 0.95), N(b.t + 0.75, r, 0.5, 0.6), N(b.t + 1.5, r, 1, 0.8), N(b.t + 3, r, 0.5, 0.7), N(b.t + 3.5, r, 0.5, 0.85)];
  if (b.sec === 'total') return [N(b.t, r, 2, 0.85), N(b.t + 2.5, r, 1, 0.5)];
  return [N(b.t, r, 1, 0.75), N(b.t + 2, r, 1, 0.5)];
});
// orchestral hits: the intro "eclipse" rhythm + every section downbeat
const hits = [
  ...[0, 1.5, 3].flatMap((x) => [N(x, 'F4', 1, 0.85), N(4 + x, 'Db4', 1, 0.8), N(8 + x, 'E4', 1, 0.85)]), N(12, 'C4', 1, 0.9),
  ...[start('main'), start('sun'), start('both'), start('total'), start('turn')].map((t) => N(t, 'F4', 1, 0.85)),
];
const bells = inSec('total').map((b) => N(b.t, shift(tones(V[b.c][0])[2], 12), 3, 0.55));

/* ---- drums ---- */
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') {
    g.kick = 'x.....x.....x...';
    g.hat = 'x.x.x.x.x.x.x.x.';
    if (k === 3) g.snare = '....x...xxxxXXXX';
  } else if (b.sec === 'total') {
    g.kick = 'x.......x.......';
    g.snare = k < 6 ? '........x.......' : k === 6 ? '....x...x...x...' : 'x.x.x.x.xxxxXXXX';
    g.ride = 'x...x...x...x...';
    if (k === 0) g.crash = 'x...............';
  } else {
    g.kick = b.sec === 'sun' ? 'x...x...x...x...' : 'x.x...x.x.x...x.';
    g.snare = '....x.......x...';
    g.hat = 'xgxgxgxgxgxgxgxg';
    if (b.sec !== 'main') g.ride = 'o.o.o.o.o.o.o.o.';
    if (first) g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
    if (b.sec === 'turn' && k === 3) { g.snare = '....x...xxxxXXXX'; g.tom2 = '..........x.x...'; }
  }
  return { at: b.t, len: B, grid: g };
});
const bigDrums = bars.map((b) => {
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') { g.tom3 = 'x.....x.....x...'; g.tom2 = '...x.....x....x.'; }
  else if (b.sec === 'total') { g.tom3 = 'x.....x...x.....'; if (k % 2) g.tom1 = '............x.x.'; }
  else if (b.sec === 'sun' || b.sec === 'turn') g.tom3 = 'x.......x.......';
  else g.tom3 = 'x.....x.........';
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Devoured Sun (boss 2)',
  bpm: 165,
  sig: [4, 4],
  bars: bars.length,
  key: 'F minor',
  tail: 4,
  sends: {
    reverb: { size: 1.9, decay: 2.8, damp: 6000, predelay: 0.02, volume: 0 },
    delay: { time: '1/8d', feedback: 0.3, tone: 4200, volume: -4 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.08 }, humanize: { time: 0.003, vel: 0.05 }, clips: drumClips },
    { id: 'big', name: 'Cinematic toms', kit: 'cinematic', trim: -2, sends: { reverb: 0.3 }, clips: bigDrums },
    { id: 'timp', name: 'Timpani', inst: 'timpani', trim: -2, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: timp }] },
    { id: 'bass', name: 'Bass', inst: 'synthbass', trim: 0, fx: [{ type: 'pump', amount: 0.3, rate: '1/4', release: 0.35 }, { type: 'dist', drive: 6, kind: 'tape', mix: 0.4 }], clips: [{ at: 0, notes: bass }] },
    { id: 'ost', name: 'Spiccato', inst: 'spiccato', trim: -0.5, pan: -0.2, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: ost }] },
    { id: 'arp', name: 'Acid arp', inst: 'acid', trim: -5, pan: 0.25, sends: { reverb: 0.15, delay: 0.2 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 350 }] }], clips: [{ at: 0, notes: synthArp }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -1, pan: 0.1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: strings }] },
    { id: 'tromb', name: 'Trombone stabs', inst: 'trombone', trim: -2, pan: -0.1, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: tromb }] },
    { id: 'stab', name: 'Synth brass stabs', inst: 'synthbrass', trim: -4, pan: 0.2, sends: { reverb: 0.2, delay: 0.1 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: synthStab }] },
    { id: 'lead', name: 'Main theme lead', inst: 'supersaw', trim: 1.5, sends: { reverb: 0.2, delay: 0.18 }, clips: [{ at: 0, notes: [...main1, ...main2] }] },
    { id: 'violin', name: 'Violin double', inst: 'violin', trim: -3, pan: -0.25, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: [...main1, ...main2].map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'sun', name: 'Sun trumpets', inst: 'trumpet', trim: 1.5, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: [...sun, ...turnLine] }] },
    { id: 'horn', name: 'Horn counter', inst: 'horn', trim: 1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: [...sun.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)), ...counter] }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -2, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: [...choir, ...chant] }] },
    { id: 'bells', name: 'Tubular bells', inst: 'tubular', trim: -4, pan: 0.3, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: bells }] },
    { id: 'hit', name: 'Orch hits', inst: 'orchhit', trim: -3, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: hits }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('sun') - 4, sfx: { preset: 'revcymbal', length: 0.95 }, gain: -3 },
      { at: start('total'), sfx: { preset: 'braam', length: 1.2, space: 0.6 }, gain: -6 },
      { at: start('turn') - 8, sfx: { preset: 'riser', length: 1.16, tone: 0.2 }, gain: -2 },
      { at: start('turn'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
    ] },
  ],
});
