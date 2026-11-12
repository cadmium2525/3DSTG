// BLOOM DIVE — stage 3 mid-boss theme "Knight of the Night" (original).
// 影の騎士 ノクス — armour of darkness, a blade of shadow: martial and aggressive.
// A minor with a Phrygian Bb. Marching snare rolls + taiko, a 3-3-2 low brass riff in unison
// (trombones + horns), distorted bass, spiccato, then a "sword clash" section with a saw lead and
// violins, trumpets taking the turnaround.
// 160 bpm, 24 bars = 36 s seamless loop.
//   0-3 intro (march) · 4-11 brass riff · 12-19 clash · 20-23 turnaround (E → loop)
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Am: ['C4 E4 A4', 'A1'],
  F: ['C4 F4 A4', 'F1'],
  Bb: ['D4 F4 Bb4', 'Bb1'],
  E: ['B3 E4 G#4', 'E2'],
  E7: ['B3 D4 G#4', 'E2'],
  Esus: ['B3 E4 A4', 'E2'],
  Dm: ['D4 F4 A4', 'D2'],
  C: ['C4 E4 G4', 'C2'],
};
const sections = [
  ['intro', 'Am Am Bb Am'],
  ['riff', 'Am F Bb E Am F Dm E'],
  ['clash', 'Dm Bb C Am F Bb E E7'],
  ['turn', 'Dm Bb Esus E'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');

/* ---- lines ---- */
const introOst = seq(`
  A2/.75 A2/.75 A2/.5 C3/1 A2/1 | A2/.75 A2/.75 A2/.5 E3/1 D3/1 | A#2/.75 A#2/.75 A#2/.5 D3/1 F3/1 | A2/.75 A2/.75 A2/.5 E3/.5 E3/.5 G#3/1
`, { at: 0, vel: 0.8, gate: 0.75 });
const riff = seq(`
  A3/.75 A3/.75 C4/.5 E4/1 D4/.5 C4/.5 | A3/.75 A3/.75 C4/.5 F4/2 | A#3/.75 D4/.75 F4/.5 A#4/1 A4/.5 F4/.5 | G#4/1.5 E4/.5 B3/2
  A3/.75 A3/.75 C4/.5 E4/1 D4/.5 C4/.5 | C4/.75 F4/.75 A4/.5 C5/2 | D5/.75 C5/.75 A4/.5 F4/1 D4/1 | E4/1 G#4/1 B4/1 D5/1
`, { at: start('riff'), vel: 0.82, gate: 0.85 });
const clash = seq(`
  D5/.5 F5/.5 A5/.5 D6/.5 C6/1 A5/1 | A#5/.5 A5/.5 F5/.5 D5/.5 F5/1 A#5/1 | C6/.75 G5/.75 E5/.5 G5/1 C6/1 | A5/1.5 E5/.5 C6/2
  F5/.5 A5/.5 C6/.5 F6/.5 E6/1 C6/1 | D6/.5 A#5/.5 F5/.5 D5/.5 F5/1 D6/1 | B5/.75 G#5/.75 E5/.5 B5/1 E6/1 | D6/2 B5/1 G#5/1
`, { at: start('clash'), vel: 0.8, gate: 0.86 });
const turnLine = seq(`D5/1 F5/1 A5/2 | A#5/1 D6/1 F6/2 | E6/2 B5/2 | G#5/2 B5/1 E6/1`, { at: start('turn'), vel: 0.86, gate: 0.95 });

/* ---- harmony ---- */
const ost = arp(bars.map((b) => [b.t, B, V[b.c][0]]), [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 2, 1], 0.25, { vel: 0.52, accent: 0.2, gate: 0.55 });
const strings = blocks(inSec('clash', 'turn').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const pad = blocks(bars.map((b) => [b.t, B, up(V[b.c][0], -12)]), { vel: 0.5 });
const choir = blocks(inSec('riff', 'turn').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.5 });
const tromb = stabs(inSec('clash').map((b) => [b.t, B, up(V[b.c][0], -12)]), 'x..x..x.....x...', 0.25, { vel: 0.68, gate: 0.6 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'intro') return [0, 0.75, 1.5, 2, 3].map((x) => N(b.t + x, r, 0.5, 0.8));
  return [0, 0.75, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 4 ? shift(r, 12) : r, 0.4, k < 3 ? 0.88 : 0.7));
});
const timp = bars.flatMap((b) => {
  const r = shift(V[b.c][1], b.c.startsWith('E') || b.c === 'Dm' || b.c === 'C' ? 0 : 12);
  return b.sec === 'intro' ? [N(b.t, r, 0.7, 0.9), N(b.t + 0.75, r, 0.7, 0.75), N(b.t + 1.5, r, 0.5, 0.8)] : [N(b.t, r, 1, 0.75)];
});

/* ---- drums: march snare + kit + taiko ---- */
const march = bars.map((b, i) => {
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') g.snare = k === 3 ? 'x.gxx.gxXXXXXXXX' : 'x.gxx.gxx.gxXgXg';
  else if (b.sec === 'riff') g.snare = 'g.g.ggg.g.g.ggg.';
  else if (b.sec === 'turn' && k === 3) g.snare = 'XgxgXgxgXXXXXXXX';
  else g.snare = 'g.gg..g.g.gg..g.';
  return { at: b.t, len: B, grid: g };
});
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const g = {};
  if (b.sec === 'intro') {
    g.kick = 'x.....x.........';
  } else {
    g.kick = b.sec === 'clash' ? 'x..x..x.x..x..x.' : 'x...x...x...x...';
    g.snare = '....x.......x...';
    g.hat = b.sec === 'clash' ? 'xgxxxgxxxgxxxgxx' : 'x.x.x.x.x.x.x.x.';
    if (b.sec !== 'riff') g.ride = 'x...x...x...x...';
    if (first) g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
  }
  return { at: b.t, len: B, grid: g };
});
const taiko = bars.map((b) => {
  const g = {};
  if (b.sec === 'intro') { g.odaiko = 'x.....x.x.......'; g.shime = 'x.x.x.x.x.x.x.x.'; }
  else g.odaiko = b.sec === 'clash' ? 'x.....x...x.....' : 'x.......x.......';
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Knight of the Night (mid-boss 3)',
  bpm: 160,
  sig: [4, 4],
  bars: bars.length,
  key: 'A minor',
  tail: 4,
  sends: {
    reverb: { size: 1.7, decay: 2.5, damp: 5500, predelay: 0.02, volume: 0 },
    delay: { time: '1/8', feedback: 0.28, tone: 4000, volume: -5 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.1 }, humanize: { time: 0.003, vel: 0.05 }, clips: drumClips },
    { id: 'march', name: 'Marching snare', kit: 'acoustic', trim: -4, pan: -0.1, sends: { reverb: 0.15 }, humanize: { time: 0.004, vel: 0.08 }, clips: march },
    { id: 'taiko', name: 'Taiko', kit: 'taiko', trim: -4, sends: { reverb: 0.3 }, clips: taiko },
    { id: 'timp', name: 'Timpani', inst: 'timpani', trim: -3, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: timp }] },
    { id: 'bass', name: 'Distorted bass', inst: 'synthbass', trim: 0, fx: [{ type: 'dist', drive: 8, kind: 'tape', mix: 0.45 }], clips: [{ at: 0, notes: bass }] },
    { id: 'ost', name: 'Spiccato', inst: 'spiccato', trim: -1, pan: 0.2, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: ost }] },
    { id: 'pad', name: 'Dark pad', inst: 'darkpad', trim: -3, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: pad }] },
    { id: 'lowbrass', name: 'Low brass ostinato', inst: 'trombone', trim: 0, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: [...introOst, ...riff] }] },
    { id: 'horn', name: 'Horns (riff unison)', inst: 'horn', trim: -1, pan: -0.15, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: riff }] },
    { id: 'tpt', name: 'Trumpets', inst: 'trumpet', trim: 0.5, pan: 0.15, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: [...riff.filter(([t]) => t >= start('riff') + 16).map(([t, n, d, v]) => N(t, shift(n, 12), d, v)), ...turnLine] }] },
    { id: 'tromb', name: 'Trombone stabs', inst: 'trombone', trim: -2, sends: { reverb: 0.25 }, clips: [{ at: 0, notes: tromb }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -2, pan: 0.1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: strings }] },
    { id: 'lead', name: 'Blade lead', inst: 'sawlead', trim: 1, sends: { reverb: 0.15, delay: 0.15 }, fx: [{ type: 'dist', drive: 5, kind: 'soft', mix: 0.35 }], clips: [{ at: 0, notes: clash }] },
    { id: 'violin', name: 'Violins (clash)', inst: 'violin', trim: -2, pan: -0.25, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: clash.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -3, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: choir }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('riff'), sfx: { preset: 'katana', length: 1 }, gain: -10 },
      { at: start('clash') - 4, sfx: { preset: 'revcymbal', length: 1 }, gain: -3 },
      { at: start('clash'), sfx: { preset: 'katana', length: 1, pitch: -3 }, gain: -10 },
      { at: start('turn') + 8, sfx: { preset: 'riser', length: 0.6, tone: 0.1 }, gain: -3 },
    ] },
  ],
});
