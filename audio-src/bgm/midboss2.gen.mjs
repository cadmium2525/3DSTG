// BLOOM DIVE — stage 2 mid-boss theme "Lantern in the Gloaming" (original).
// 黄昏の灯守 ランテルナ — a lantern spirit being eaten by shadow: tense and flickering.
// G minor with a Neapolitan Ab and a diminished F#; celesta / music-box ostinato chopped by a
// trance gate (the flame flickering), tremolo strings, FM bass, staccato saw riff with octave
// leaps, then a brass + choir section where the shadow closes in.
// 155 bpm, 24 bars ≈ 37.2 s seamless loop.
//   bars 0-3 intro · 4-11 riff · 12-19 shadow (brass) · 20-23 turnaround (D → loop)
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Gm: ['D4 G4 Bb4', 'G1'],
  Eb: ['Eb4 G4 Bb4', 'Eb2'],
  Cm: ['C4 Eb4 G4', 'C2'],
  D: ['D4 F#4 A4', 'D2'],
  D7: ['C4 F#4 A4', 'D2'],
  Ab: ['C4 Eb4 Ab4', 'Ab1'],
  F: ['C4 F4 A4', 'F1'],
  Dm: ['D4 F4 A4', 'D2'],
  'F#dim': ['C4 F#4 A4', 'F#1'],
};
const sections = [
  ['intro', 'Gm Gm Eb D'],
  ['riff', 'Gm Eb Cm D Gm Eb Ab D'],
  ['shadow', 'Eb F Dm Gm Cm Ab F#dim D7'],
  ['turn', 'Cm Ab Eb D'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');

/* ---- melodies ---- */
const riff = seq(`
  G4/.25 G4/.25 G5/.5 F5/.5 D5/.5 A#4/1 A4/.5 G4/.5 | A#4/.25 A#4/.25 D#5/.5 D5/.5 A#4/.5 G4/2 | C5/.25 C5/.25 D#5/.5 D5/.5 C5/.5 G4/1 D#4/1 | F#4/1 G4/.5 A4/.5 D4/2
  G4/.25 G4/.25 G5/.5 F5/.5 D5/.5 A#4/1 C5/.5 D5/.5 | D#5/1 D5/.5 C5/.5 A#4/1 G4/1 | G#4/.25 G#4/.25 C5/.5 D#5/.5 C5/.5 G#4/1 G4/.5 F4/.5 | F#4/2 A4/1 D5/1
`, { at: start('riff'), vel: 0.8, gate: 0.7 });
const brassLine = seq(`
  G5/2 A#5/2 | A5/2 C6/1 A#5/1 | A5/2 F5/2 | G5/3 D5/1 | D#5/2 G5/2 | C6/2 D#6/1 C6/1 | A5/2 C6/2 | F#5/2 A5/1 C6/1
`, { at: start('shadow'), vel: 0.76, gate: 0.96 });
const turnLead = seq(`
  C5/.5 D#5/.5 G5/.5 C6/.5 A#5/1 G5/1 | G#5/.5 C6/.5 D#6/.5 C6/.5 G#5/2 | G5/.5 A#5/.5 D#6/.5 D6/.5 A#5/1 G5/1 | F#5/1 A5/1 D6/2
`, { at: start('turn'), vel: 0.84, gate: 0.85 });

/* ---- the lantern: celesta ostinato, gated so it flickers ---- */
const flameTones = (c) => { const ts = tones(V[c][0]).map((n) => shift(n, 12)); return [...ts, shift(ts[0], 12)].join(' '); };
const flame = arp(bars.map((b) => [b.t, B, flameTones(b.c)]), [0, 2, 1, 3, 2, 1, 0, 2, 3, 1, 2, 0, 3, 2, 1, 3], 0.25, { vel: 0.5, accent: 0.18, gate: 0.8 });
const box = bars.filter((b, i) => i % 2 === 0).map((b) => N(b.t + 3.5, shift(tones(V[b.c][0])[2], 24), 0.5, 0.35));

/* ---- harmony / bass ---- */
const pad = blocks(bars.map((b) => [b.t, B, up(V[b.c][0], -12)]), { vel: 0.5 });
const trem = blocks(inSec('intro', 'shadow', 'turn').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const choir = blocks(inSec('shadow').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.5 });
const stab = stabs(inSec('riff', 'turn').map((b) => [b.t, B, V[b.c][0]]), 'x..x..x...x..x..', 0.25, { vel: 0.62, gate: 0.55 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'intro') return [N(b.t, r, 1.8, 0.8), N(b.t + 2.5, r, 0.4, 0.6), N(b.t + 3, shift(r, 12), 0.4, 0.6), N(b.t + 3.5, r, 0.4, 0.7)];
  return [0, 0.5, 0.75, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 2 || k === 6 ? shift(r, 12) : r, 0.32, k % 2 ? 0.62 : 0.85));
});
const subs = bars.flatMap((b) => [N(b.t, V[b.c][1].endsWith('1') ? V[b.c][1] : shift(V[b.c][1], -12), 1.5, 0.7)]);
const pizz = arp(inSec('shadow').map((b) => [b.t, B, up(V[b.c][0], 0)]), [0, 2, 1, 2], 0.5, { vel: 0.55, accent: 0.1, gate: 0.5 });

/* ---- drums ---- */
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') {
    g.hat = 'x.gxx.gxx.gxx.gx';
    g.rim = '....x.......x...';
    if (k === 1 || k === 3) g.kick = 'x.........x.....';
    if (k === 3) { g.snare = '........x.xxXXXX'; g.tom2 = '....x.x.........'; }
  } else {
    g.kick = b.sec === 'shadow' ? 'x.......x.x.....' : 'x..x...x..x.....';
    g.snare = '....x.......x...';
    g.hat = b.sec === 'shadow' ? 'x.x.x.x.x.x.x.x.' : 'xgxxxgxxxgxxxgxg';
    g.tamb = '..x...x...x...x.';
    if (b.sec === 'shadow') g.ride = 'x...x...x...x...';
    if (first) g.crash = 'x...............';
    if (last && b.sec !== 'turn') { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
    if (b.sec === 'turn' && k === 3) { g.snare = '....x...xxxxXXXX'; g.tom2 = '..........x.x...'; }
  }
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Lantern in the Gloaming (mid-boss 2)',
  bpm: 155,
  sig: [4, 4],
  bars: bars.length,
  key: 'G minor',
  tail: 4,
  sends: {
    reverb: { size: 1.6, decay: 2.4, damp: 5500, predelay: 0.02, volume: 0 },
    delay: { time: '1/8d', feedback: 0.3, tone: 4000, volume: -4 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.1 }, humanize: { time: 0.004, vel: 0.06 }, clips: drumClips },
    { id: 'bass', name: 'FM bass', inst: 'fmbass', trim: 0, fx: [{ type: 'dist', drive: 5, kind: 'tape', mix: 0.35 }], clips: [{ at: 0, notes: bass }] },
    { id: 'sub', name: 'Sub', inst: 'subbass', trim: -7, fx: [{ type: 'eq', bands: [{ type: 'lp', freq: 300 }] }], clips: [{ at: 0, notes: subs }] },
    { id: 'flame', name: 'Celesta flicker', inst: 'celesta', trim: 0, pan: -0.2, sends: { reverb: 0.3, delay: 0.2 }, fx: [{ type: 'gate', pattern: 'x.xxx.x.xx.xxx.xx.x.xxx.xx.x.xxx', rate: '1/16', depth: 0.75, duty: 0.85 }], clips: [{ at: 0, notes: flame }] },
    { id: 'box', name: 'Music box', inst: 'musicbox', trim: -5, pan: 0.35, sends: { reverb: 0.5, delay: 0.35 }, clips: [{ at: 0, notes: box }] },
    { id: 'pad', name: 'Dark pad', inst: 'darkpad', trim: -1.5, sends: { reverb: 0.35 }, fx: [{ type: 'tremolo', rate: '1/8', depth: 0.35, stereo: 0.5 }], clips: [{ at: 0, notes: pad }] },
    { id: 'trem', name: 'Tremolo strings', inst: 'strings', trim: -2, pan: 0.15, sends: { reverb: 0.35 }, fx: [{ type: 'tremolo', rate: '1/16', depth: 0.6 }], clips: [{ at: 0, notes: trem }] },
    { id: 'pizz', name: 'Pizzicato', inst: 'pizz', trim: -4, pan: -0.3, sends: { reverb: 0.25 }, clips: [{ at: 0, notes: pizz }] },
    { id: 'stab', name: 'Brass stabs', inst: 'synthbrass', trim: -3, pan: 0.2, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: stab }] },
    { id: 'lead', name: 'Staccato saw riff', inst: 'sawlead', trim: 1, sends: { reverb: 0.15, delay: 0.2 }, fx: [{ type: 'dist', drive: 4, kind: 'soft', mix: 0.3 }], clips: [{ at: 0, notes: [...riff, ...turnLead] }] },
    { id: 'riffhi', name: 'Riff sparkle (celesta 8va)', inst: 'glock', trim: -6, pan: 0.3, sends: { reverb: 0.3, delay: 0.25 }, clips: [{ at: 0, notes: riff.map(([t, n, d, v]) => N(t, shift(n, 24), d, v * 0.7)) }] },
    { id: 'brass', name: 'Brass', inst: 'brass', trim: 1, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: brassLine }] },
    { id: 'horn', name: 'Horns (8vb)', inst: 'horn', trim: -2, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: brassLine.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -3, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: choir }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('shadow') - 4, sfx: { preset: 'revcymbal', length: 1 }, gain: -3 },
      { at: start('turn') + 8, sfx: { preset: 'riser', length: 0.62, tone: 0.2 }, gain: -3 },
    ] },
  ],
});
