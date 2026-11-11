// BLOOM DIVE — stage theme "Ribbon Stream" (original).
// Bright, driving trance / eurobeat flavoured shooter theme in F# minor / A major.
// 150 bpm, 36 bars = 57.6 s seamless loop.
//   bars 0-3 lift-off · 4-11 verse · 12-19 chorus · 20-23 break (build) · 24-31 chorus 2 (+ bell counter-line) · 32-35 turnaround
import { N, seq, arp, blocks, bassline, stabs, at, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  'F#m': ['A3 C#4 F#4', 'F#2'],
  D: ['A3 D4 F#4', 'D2'],
  A: ['A3 C#4 E4', 'A1'],
  E: ['G#3 B3 E4', 'E2'],
  'C#m': ['G#3 C#4 E4', 'C#2'],
  Esus: ['A3 B3 E4', 'E2'],
  Bm: ['A3 B3 D4 F#4', 'B1'],
};
const sections = [
  ['intro', 'F#m D A E'],
  ['verse', 'D E C#m F#m D E F#m Esus'],
  ['chorus', 'F#m D A E F#m D A E'],
  ['break', 'D E C#m Esus'],
  ['chorus2', 'F#m D A E F#m D A E'],
  ['turn', 'D E Bm Esus'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const BARS = bars.length; // 36
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const start = (s) => bars.find((b) => b.sec === s).t;

/* ---- melodies ---- */
const verse = seq(`
  F#5/1 E5/.5 D5/.5 E5/1 F#5/1 | G#5/1.5 F#5/.5 E5/2 | E5/1 C#5/.5 B4/.5 C#5/1 E5/1 | F#5/3 -/1
  A5/1 F#5/.5 E5/.5 F#5/1 A5/1 | B5/1.5 A5/.5 G#5/1 E5/1 | A5/1 G#5/.5 F#5/.5 E5/1 C#5/1 | E5/2 -/1 G#4/.5 B4/.5
`, { at: start('verse'), vel: 0.7, gate: 0.9 });
const hookStr = `
  C#5/.75 E5/.75 F#5/.5 F#5/1 E5/.5 F#5/.5 | A5/1.5 F#5/.5 E5/1 D5/1 | C#5/.75 E5/.75 A5/.5 G#5/1 A5/.5 B5/.5 | G#5/2 E5/1 B4/1
  C#5/.75 E5/.75 F#5/.5 F#5/1 A5/.5 B5/.5 | C#6/1.5 B5/.5 A5/1 F#5/1 | E5/.75 F#5/.75 A5/.5 B5/1 C#6/1 | B5/2.5 -/.5 G#5/.5 A5/.5
`;
const hook1 = seq(hookStr, { at: start('chorus'), vel: 0.78, gate: 0.88 });
const hook2 = seq(hookStr, { at: start('chorus2'), vel: 0.82, gate: 0.88 });
const breakBells = seq(`C#6/1.5 B5/.5 A5/2 | B5/1.5 A5/.5 G#5/2 | E5/1.5 G#5/.5 C#6/2 | B5/4`, { at: start('break'), vel: 0.6 });

/* ---- harmony ---- */
const chordList = (bs) => bs.map((b) => [b.t, B, V[b.c][0]]);
const pad = blocks(chordList(bars.filter((b) => b.sec !== 'intro')), { vel: 0.55 });
const stab = stabs(chordList(inSec('verse', 'chorus', 'chorus2', 'turn')).map(([t, l, ns]) => [t, l, tones(ns).map((n) => shift(n, 12)).join(' ')]), '..x...x...x..x.x', 0.25, { vel: 0.5, gate: 0.6 });
const arpTones = (c) => { const ts = tones(V[c][0]).map((n) => shift(n, 12)); return [...ts, shift(ts[0], 12), shift(ts[1], 12)].join(' '); };
const pluckArp = arp(bars.map((b) => [b.t, B, arpTones(b.c)]), [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 3, 1, 2, 3, 4], 0.25, { vel: 0.45, accent: 0.18, gate: 0.7 });
const counter = arp(inSec('chorus2').map((b) => [b.t, B, tones(V[b.c][0]).map((n) => shift(n, 24)).join(' ')]), [2, 1, 0, 1, 2, 0, 1, 2], 0.5, { vel: 0.45, accent: 0.1, gate: 0.6 });
const bass = bassline(bars.filter((b) => b.sec !== 'break').map((b) => [b.t, B, V[b.c][1]]), 'ROROROROROROROR5', 0.25 * 2, { vel: 0.78, gate: 0.7 });
const breakBass = bars.filter((b) => b.sec === 'break').map((b) => N(b.t, V[b.c][1], 3.9, 0.6));
const subs = bars.filter((b) => b.sec !== 'break').flatMap((b) => [0, 1, 2, 3].map((k) => N(b.t + k, shift(V[b.c][1], -12), 0.5, 0.7)));

/* ---- drums ---- */
const drumClips = [];
for (const b of bars) {
  const last = bars[bars.indexOf(b) + 1]?.sec !== b.sec;
  const g = {};
  if (b.sec === 'break') {
    const k = bars.indexOf(b) - bars.findIndex((x) => x.sec === 'break');
    g.hat = k < 2 ? '..o...o...o...o.' : 'o.o.o.o.o.o.o.o.';
    if (k === 2) g.snare = 'x.......x...x...';
    if (k === 3) g.snare = 'x...x...x.x.xxxx';
    if (k === 3) g.tom1 = '............x.x.';
    if (k === 0) g.crash = 'x...............';
  } else {
    g.kick = 'x...x...x...x...';
    g.clap = '....x.......x...';
    g.ohat = '..x...x...x...x.';
    g.hat = b.sec === 'intro' ? 'g.g.g.g.g.g.g.g.' : 'gogxgogxgogxgogx';
    if (b.sec.startsWith('chorus')) g.ride = 'o.o.o.o.o.o.o.o.';
    const first = bars[bars.indexOf(b) - 1]?.sec !== b.sec;
    if (first && b.sec !== 'intro') g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '............xxxx'; g.kick = 'x...x...x...x.x.'; }
    if (last && b.sec === 'turn') { g.snare = '........x.x.xxxx'; g.tom2 = '............x.x.'; }
  }
  drumClips.push({ at: b.t, len: B, grid: g });
}

export default () => ({
  name: 'BLOOM DIVE - Ribbon Stream (stage)',
  bpm: 150,
  sig: [4, 4],
  bars: BARS,
  key: 'F# minor',
  tail: 4,
  sends: {
    reverb: { size: 1.4, decay: 2.2, damp: 7000, predelay: 0.02, volume: 0 },
    delay: { time: '1/8d', feedback: 0.32, tone: 5000, volume: -3 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'house', trim: 0, sends: { reverb: 0.06 }, humanize: { time: 0.003 }, clips: drumClips },
    { id: 'bass', name: 'Octave bass', inst: 'synthbass', trim: -0.5, fx: [{ type: 'pump', amount: 0.35, rate: '1/4', release: 0.4 }], clips: [{ at: 0, notes: [...bass, ...breakBass] }] },
    { id: 'sub', name: 'Sub', inst: 'subbass', trim: -4, fx: [{ type: 'pump', amount: 0.8, rate: '1/4', release: 0.5 }], clips: [{ at: 0, notes: subs }] },
    { id: 'pad', name: 'Supersaw pad', inst: 'pad', trim: -1, sends: { reverb: 0.3 }, fx: [{ type: 'pump', amount: 0.55, rate: '1/4', release: 0.55 }, { type: 'widen', amount: 0.5, lowmono: 250 }], clips: [{ at: 0, notes: pad }] },
    { id: 'stab', name: 'Chord stabs', inst: 'chordstab', trim: -3, pan: 0.15, sends: { reverb: 0.2, delay: 0.12 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 250 }] }], clips: [{ at: 0, notes: stab }] },
    { id: 'arp', name: 'Pluck arp', inst: 'pluck', trim: -2.5, pan: -0.2, sends: { reverb: 0.15, delay: 0.25 }, fx: [{ type: 'pump', amount: 0.3, rate: '1/4' }, { type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: pluckArp }] },
    { id: 'lead', name: 'Lead (verse)', inst: 'sawlead', trim: 0.5, sends: { reverb: 0.2, delay: 0.2 }, clips: [{ at: 0, notes: verse }] },
    { id: 'hook', name: 'Hook lead', inst: 'edmlead', trim: 1.5, sends: { reverb: 0.22, delay: 0.22 }, clips: [{ at: 0, notes: [...hook1, ...hook2] }] },
    { id: 'hookoct', name: 'Hook bells', inst: 'bellkeys', trim: -4, pan: 0.25, sends: { reverb: 0.3, delay: 0.2 }, clips: [{ at: 0, notes: [...hook2, ...breakBells].map(([t, n, d, v]) => N(t, shift(n, 12), d, v * 0.8)) }] },
    { id: 'counter', name: 'Glock counter', inst: 'glock', trim: -4, pan: -0.35, sends: { reverb: 0.3, delay: 0.3 }, clips: [{ at: 0, notes: counter }] },
    { id: 'choir', name: 'Choir (break)', inst: 'choir', trim: -2, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: blocks(chordList(inSec('break')).map(([t, l, ns]) => [t, l, tones(ns).map((n) => shift(n, 12)).join(' ')]), { vel: 0.5 }) }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, sends: { reverb: 0.2 }, clips: [
      { at: start('chorus') - 4, sfx: { preset: 'revcymbal', length: 1.05 }, gain: -3 },
      { at: start('break') + 8, sfx: { preset: 'riser', length: 1.28, tone: 0.3 }, gain: -2 },
      { at: start('chorus2'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
    ] },
  ],
});
