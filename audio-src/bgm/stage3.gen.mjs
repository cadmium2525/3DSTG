// BLOOM DIVE — stage 3 theme 「深淵」 "The Abyss" (original).
// No light left: sparse and heavy at first, then building. C# minor with a Neapolitan D.
// Low reese drone, ō-daiko heartbeat, eerie celesta / tubular bells over the void; then a
// half-time descent (low piano octaves, "oo" choir), a driving pulse section with a vocal lead,
// and a brass + choir climax that falls back into the void at the loop point.
// 136 bpm, 32 bars ≈ 56.5 s seamless loop.
//   0-7 void · 8-15 descent (half-time) · 16-23 pulse · 24-31 rise
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  'C#m': ['C#4 E4 G#4', 'C#2'],
  A: ['C#4 E4 A4', 'A1'],
  AM7: ['C#4 E4 G#4 A4', 'A1'],
  'F#m': ['C#4 F#4 A4', 'F#1'],
  'G#sus': ['C#4 D#4 G#4', 'G#1'],
  'G#': ['C4 D#4 G#4', 'G#1'],
  D: ['D4 F#4 A4', 'D2'],
  E: ['B3 E4 G#4', 'E2'],
  B: ['B3 D#4 F#4', 'B1'],
  'G#m': ['B3 D#4 G#4', 'G#1'],
};
const sections = [
  ['void', 'C#m C#m AM7 AM7 F#m F#m G#sus G#'],
  ['descent', 'C#m A F#m G# C#m A D G#'],
  ['pulse', 'C#m A E B C#m A F#m G#'],
  ['rise', 'A B G#m C#m A B D G#'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');

/* ---- lines ---- */
const bellMotif = seq(`
  C#6/1 G#5/1 E5/2 | D#5/3 -/1 | E6/1 C#6/1 A5/2 | G#5/4 | F#5/1 A5/1 C#6/2 | B5/3 A5/1 | C#6/2 D#6/2 | C6/2 D#6/2
`, { at: start('void'), vel: 0.55, gate: 1.2 });
const piano = seq(`
  C#4/1.5 E4/.5 G#4/2 | A4/1.5 G#4/.5 E4/2 | F#4/1.5 A4/.5 C#5/2 | C5/4 | C#4/1.5 E4/.5 G#4/2 | A4/1 C#5/1 E5/2 | D5/1.5 C#5/.5 A4/2 | G#4/4
`, { at: start('descent'), vel: 0.62, gate: 0.98 });
const vox = seq(`
  G#5/1.5 E5/.5 C#5/1 G#5/1 | A5/1.5 G#5/.5 E5/2 | G#5/1 B5/1 E6/2 | D#6/1.5 C#6/.5 B5/2
  E6/1.5 D#6/.5 C#6/1 G#5/1 | A5/1 C#6/1 E6/2 | F#6/1.5 E6/.5 C#6/1 A5/1 | C6/2 D#6/2
`, { at: start('pulse'), vel: 0.74, gate: 0.94 });
const rise = seq(`
  C#5/2 E5/2 | D#5/2 F#5/2 | D#5/3 B4/1 | E5/3 G#5/1 | E5/2 C#5/2 | D#5/2 F#5/1 B5/1 | A5/2 F#5/2 | G#5/4
`, { at: start('rise'), vel: 0.82, gate: 0.97 });

/* ---- harmony ---- */
const drone = bars.map((b) => N(b.t, b.sec === 'void' ? 'C#1' : V[b.c][1].endsWith('2') ? shift(V[b.c][1], -12) : V[b.c][1], 3.95, 0.7));
const pad = blocks(bars.map((b) => [b.t, B, up(V[b.c][0], -12)]), { vel: 0.5 });
const ooh = blocks(inSec('descent').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.45 });
const choir = blocks(inSec('rise').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const strings = blocks(inSec('pulse', 'rise').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.5 });
const tubular = bars.filter((b) => b.sec === 'void' && (b.t / B) % 2 === 0).map((b) => N(b.t, shift(V[b.c][1], 24), 3, 0.5));
const pulseBass = bars.filter((b) => b.sec !== 'void').flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'descent') return [N(b.t, r, 1.4, 0.85), N(b.t + 1.5, r, 0.4, 0.6), N(b.t + 2.5, r, 0.4, 0.65), N(b.t + 3, shift(r, 12), 0.4, 0.6)];
  return [0, 0.5, 0.75, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 6 ? shift(r, 12) : r, 0.35, k % 2 ? 0.62 : 0.85));
});
const arpLine = arp(inSec('pulse', 'rise').map((b) => [b.t, B, up(V[b.c][0], 12)]), [0, 1, 2, 1, 0, 2, 1, 2], 0.25, { vel: 0.42, accent: 0.18, gate: 0.6 });
const brassStab = stabs(inSec('rise').map((b) => [b.t, B, up(V[b.c][0], -12)]), 'x.....x...x.....', 0.25, { vel: 0.65, gate: 0.7 });

/* ---- drums ---- */
const taiko = bars.map((b) => {
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'void') { g.odaiko = 'x..x............'; if (k === 7) g.shime = '........x.x.xxxx'; }
  else if (b.sec === 'descent') g.odaiko = 'x..x......x.....';
  else g.odaiko = 'x.....x...x.....';
  return { at: b.t, len: B, grid: g };
});
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'void') {
    if (k >= 4) g.hat = '....o.......o...';
    if (k === 7) g.snare = '............xxXX';
  } else if (b.sec === 'descent') {
    g.kick = 'x.........x.....';
    g.snare = '........x.......';
    g.hat = 'x.o.x.o.x.o.x.o.';
    if (first) g.crash = 'x...............';
    if (last) g.snare = '........x...xxXX';
  } else {
    g.kick = 'x..x..x...x..x..';
    g.snare = '....x.......x...';
    g.hat = 'xgxgxgxgxgxgxgxg';
    if (b.sec === 'rise') g.ride = 'o.o.o.o.o.o.o.o.';
    if (first) g.crash = 'x...............';
    if (last && b.sec === 'pulse') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
    if (last && b.sec === 'rise') { g.kick = 'x.....x.x.......'; g.snare = '....x...x.x.x...'; g.tom2 = '..........x.x...'; g.tom3 = '............x...'; delete g.hat; }
  }
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - The Abyss (stage 3)',
  bpm: 136,
  sig: [4, 4],
  bars: bars.length,
  key: 'C# minor',
  tail: 5,
  sends: {
    reverb: { size: 2.2, decay: 3.4, damp: 5000, predelay: 0.03, volume: 0 },
    delay: { time: '1/4d', feedback: 0.42, tone: 3500, volume: -3 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.12 }, humanize: { time: 0.004, vel: 0.05 }, clips: drumClips },
    { id: 'taiko', name: 'O-daiko', kit: 'taiko', trim: -1, sends: { reverb: 0.35 }, clips: taiko },
    { id: 'drone', name: 'Reese drone', inst: 'reese', trim: -3, fx: [{ type: 'eq', bands: [{ type: 'lp', freq: 900 }] }, { type: 'dist', drive: 4, kind: 'tape', mix: 0.3 }], clips: [{ at: 0, notes: drone }] },
    { id: 'bass', name: 'Pulse bass', inst: 'synthbass', trim: -1, fx: [{ type: 'dist', drive: 5, kind: 'tape', mix: 0.35 }], clips: [{ at: 0, notes: pulseBass }] },
    { id: 'pad', name: 'Dark pad', inst: 'darkpad', trim: -1, sends: { reverb: 0.45 }, auto: { volume: [[0, -5], [28, -5], [32, 0]] }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 120 }] }, { type: 'widen', amount: 0.5, lowmono: 250 }], clips: [{ at: 0, notes: pad }] },
    { id: 'bells', name: 'Celesta (void)', inst: 'celesta', trim: 0, pan: -0.2, sends: { reverb: 0.5, delay: 0.45 }, clips: [{ at: 0, notes: bellMotif }] },
    { id: 'tubular', name: 'Tubular bells', inst: 'tubular', trim: -3, pan: 0.25, sends: { reverb: 0.6 }, clips: [{ at: 0, notes: tubular }] },
    { id: 'piano', name: 'Low piano', inst: 'piano', trim: 0, sends: { reverb: 0.4, delay: 0.15 }, clips: [{ at: 0, notes: [...piano, ...piano.map(([t, n, d, v]) => N(t, shift(n, -12), d, v * 0.8))] }] },
    { id: 'ooh', name: 'Choir oo', inst: 'choiroo', trim: -2, sends: { reverb: 0.55 }, clips: [{ at: 0, notes: ooh }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -2, pan: 0.1, sends: { reverb: 0.4 }, clips: [{ at: 0, notes: strings }] },
    { id: 'arp', name: 'Pluck arp', inst: 'pluck', trim: -4, pan: -0.25, sends: { reverb: 0.2, delay: 0.25 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: arpLine }] },
    { id: 'vox', name: 'Vox lead', inst: 'voxlead', trim: 1, sends: { reverb: 0.35, delay: 0.25 }, clips: [{ at: 0, notes: vox }] },
    { id: 'brass', name: 'Brass (rise)', inst: 'trumpet', trim: 1, sends: { reverb: 0.35, delay: 0.1 }, clips: [{ at: 0, notes: rise }] },
    { id: 'horn', name: 'Horns (rise, 8vb)', inst: 'horn', trim: -1, sends: { reverb: 0.4 }, clips: [{ at: 0, notes: rise.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'tromb', name: 'Trombone stabs', inst: 'trombone', trim: -3, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: brassStab }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -2, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: choir }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, sends: { reverb: 0.3 }, clips: [
      { at: start('descent') - 4, sfx: { preset: 'revswell', length: 1.0 }, gain: -4 },
      { at: start('pulse') - 4, sfx: { preset: 'riser', length: 1.0, tone: -0.2 }, gain: -3 },
      { at: start('rise'), sfx: { preset: 'impact', length: 0.9, space: 0.6 }, gain: -6 },
    ] },
  ],
});
