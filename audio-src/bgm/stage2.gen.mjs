// BLOOM DIVE — stage 2 theme 「黄昏の境界」 "Twilight Border" (original).
// Dusk sky, the light fading: melancholic but driving. E minor with lifts into
// G major in the chorus and a Neapolitan F in the bridge (the sun sinking).
// Koto / harp arpeggios, warm string-machine pads, violin + soft-saw lead.
// 145 bpm, 36 bars ≈ 59.6 s seamless loop.
//   bars 0-3 intro · 4-11 verse · 12-15 pre-chorus · 16-23 chorus · 24-27 bridge · 28-35 chorus 2 (→ B7 back to the top)
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Em: ['G3 B3 E4', 'E2'],
  Em9: ['G3 B3 D4 F#4', 'E2'],
  C: ['G3 C4 E4', 'C2'],
  CM7: ['G3 B3 E4', 'C2'],
  G: ['G3 B3 D4', 'G1'],
  D: ['F#3 A3 D4', 'D2'],
  'D/F#': ['F#3 A3 D4', 'F#1'],
  Am: ['A3 C4 E4', 'A1'],
  Am7: ['G3 C4 E4', 'A1'],
  Bm: ['F#3 B3 D4', 'B1'],
  B7: ['F#3 A3 D#4', 'B1'],
  Bsus: ['F#3 B3 E4', 'B1'],
  F: ['F3 A3 C4', 'F1'],
};
const sections = [
  ['intro', 'Em9 CM7 Am7 Bsus'],
  ['verse', 'Em C G D Em C Am B7'],
  ['pre', 'Am Bm C D'],
  ['chorus', 'G D/F# Em C G D C D'],
  ['bridge', 'CM7 Am F B7'],
  ['chorus2', 'G D/F# Em C G D C B7'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));

/* ---- melodies ---- */
const verse = seq(`
  E5/1.5 F#5/.5 G5/1 B5/1 | G5/1.5 E5/.5 C5/2 | D5/1.5 E5/.5 G5/1 D6/1 | A5/3 -/1
  E5/1.5 F#5/.5 G5/1 B5/1 | C6/1.5 B5/.5 G5/1 E5/1 | A5/1 G5/.5 F#5/.5 E5/1 C5/1 | D#5/2 F#5/1 B4/1
`, { at: start('verse'), vel: 0.7, gate: 0.92 });
const pre = seq(`C5/1 E5/1 A5/2 | D5/1 F#5/1 B5/2 | E5/1 G5/1 C6/1 B5/1 | A5/1 B5/1 C6/1 D6/1`, { at: start('pre'), vel: 0.72, gate: 0.9 });
const chorusStr = (last) => `
  D6/1.5 B5/.5 G5/1 A5/1 | A5/1.5 F#5/.5 D5/2 | E5/1 G5/1 B5/1 D6/1 | C6/3 B5/.5 A5/.5
  B5/1.5 G5/.5 D6/1 E6/1 | F#6/1.5 E6/.5 D6/1 A5/1 | G5/1 A5/1 B5/1 C6/1 | ${last}
`;
const chorus1 = seq(chorusStr('D6/3 -/1'), { at: start('chorus'), vel: 0.8, gate: 0.92 });
const chorus2 = seq(chorusStr('D#6/2 B5/1 F#5/1'), { at: start('chorus2'), vel: 0.84, gate: 0.92 });
const bridgeKoto = seq(`G5/1 E5/1 B4/2 | A5/1 E5/1 C5/2 | A5/1 F5/1 C5/1 A4/1 | B4/1 D#5/1 F#5/1 A5/1`, { at: start('bridge'), vel: 0.62, gate: 1.4 });
const introBell = seq(`B5/2 E6/2 | G6/3 F#6/1 | E6/2 C6/2 | B5/4`, { at: 0, vel: 0.5, gate: 1 });

/* ---- harmony ---- */
const up = (ns, k) => tones(ns).map((n) => shift(n, k)).join(' ');
const chordList = (bs) => bs.map((b) => [b.t, B, V[b.c][0]]);
const pad = blocks(chordList(bars), { vel: 0.52 });
// koto: 8th-note arps over the chord (two octaves), harp 16ths only where the song lifts
const kotoTones = (c) => { const ts = tones(V[c][0]).map((n) => shift(n, 12)); return [shift(V[c][1], 24), ...ts, shift(ts[0], 12)].join(' '); };
const koto = arp(bars.filter((b) => b.sec !== 'bridge').map((b) => [b.t, B, kotoTones(b.c)]), [0, 2, 1, 3, 2, 4, 3, 1], 0.5, { vel: 0.5, accent: 0.14, gate: 1.3 });
const harp = arp(inSec('pre', 'chorus', 'chorus2').map((b) => [b.t, B, up(V[b.c][0], 24)]), [0, 1, 2, 1, 2, 0, 1, 2], 0.25, { vel: 0.38, accent: 0.12, gate: 1.2 });
const stab = stabs(chordList(inSec('chorus', 'chorus2')).map(([t, l, ns]) => [t, l, up(ns, 12)]), 'x..x..x...x.x...', 0.25, { vel: 0.45, gate: 0.6 });
const strings = blocks(chordList(inSec('chorus', 'bridge', 'chorus2')).map(([t, l, ns]) => [t, l, up(ns, 12)]), { vel: 0.5 });
const choir = blocks(chordList(inSec('bridge', 'chorus2')).map(([t, l, ns]) => [t, l, up(ns, 12)]), { vel: 0.48 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  if (b.sec === 'intro') return [N(b.t, r, 2.8, 0.7), N(b.t + 3, r, 0.9, 0.55)];
  if (b.sec === 'bridge') return [N(b.t, r, 1.4, 0.8), N(b.t + 1.5, r, 1, 0.6), N(b.t + 3, shift(r, 12), 0.9, 0.6)];
  return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((x, k) => N(b.t + x, k === 3 || k === 6 ? shift(r, 12) : r, 0.42, k % 2 ? 0.62 : 0.82));
});

const subs = bars.filter((b) => b.sec !== 'intro' && b.sec !== 'bridge').flatMap((b) => [0, 2].map((k) => N(b.t + k, V[b.c][1].endsWith('1') ? V[b.c][1] : shift(V[b.c][1], -12), 1.6, 0.7)));

/* ---- drums ---- */
const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const k = bars.filter((x) => x.sec === b.sec).indexOf(b);
  const g = {};
  if (b.sec === 'intro') {
    if (k >= 2) { g.kick = 'x.......x.......'; g.hat = '..x...x...x...x.'; }
    if (k === 3) g.snare = '........x.x.xxXX';
  } else if (b.sec === 'bridge') {
    g.kick = 'x.......x.......';
    g.snare = k < 3 ? '........x.......' : '....x...x.x.xxXX';
    g.ride = 'x...x...x...x...';
    if (k === 0) g.crash = 'x...............';
  } else {
    g.kick = b.sec === 'pre' ? 'x...x...x...x...' : 'x.....x.x.x.....';
    g.snare = '....x.......x...';
    g.hat = b.sec === 'verse' ? 'x.x.x.x.x.x.x.x.' : 'xgx.xgx.xgx.xgxg';
    if (b.sec.startsWith('chorus')) { g.ride = 'o.o.o.o.o.o.o.o.'; delete g.hat; g.hat = '..x...x...x...x.'; }
    if (first) g.crash = 'x...............';
    if (last) { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
  }
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Twilight Border (stage 2)',
  bpm: 145,
  sig: [4, 4],
  bars: bars.length,
  key: 'E minor',
  tail: 4,
  sends: {
    reverb: { size: 1.7, decay: 2.6, damp: 6000, predelay: 0.025, volume: 0 },
    delay: { time: '1/8d', feedback: 0.34, tone: 4200, volume: -3 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.08 }, humanize: { time: 0.004, vel: 0.05 }, clips: drumClips },
    { id: 'bass', name: 'Finger bass', inst: 'ebass', trim: -0.5, fx: [{ type: 'dist', drive: 3, kind: 'tape', mix: 0.3 }, { type: 'eq', bands: [{ type: 'peak', freq: 900, gain: 2, q: 1 }] }], clips: [{ at: 0, notes: bass }] },
    { id: 'sub', name: 'Sub', inst: 'subbass', trim: -7, fx: [{ type: 'eq', bands: [{ type: 'lp', freq: 300 }] }], clips: [{ at: 0, notes: subs }] },
    { id: 'pad', name: 'String machine', inst: 'stringmachine', trim: -1.5, sends: { reverb: 0.35 }, fx: [{ type: 'widen', amount: 0.45, lowmono: 250 }], clips: [{ at: 0, notes: pad }] },
    { id: 'strings', name: 'Strings', inst: 'strings', trim: -2, pan: 0.1, sends: { reverb: 0.4 }, clips: [{ at: 0, notes: strings }] },
    { id: 'koto', name: 'Koto arp', inst: 'koto', trim: -1, pan: -0.25, sends: { reverb: 0.25, delay: 0.22 }, humanize: { time: 0.004, vel: 0.05 }, clips: [{ at: 0, notes: [...koto, ...bridgeKoto] }] },
    { id: 'harp', name: 'Harp 16ths', inst: 'harp', trim: -4, pan: 0.3, sends: { reverb: 0.35, delay: 0.1 }, clips: [{ at: 0, notes: harp }] },
    { id: 'stab', name: 'Chord stabs', inst: 'chordstab', trim: -5, pan: 0.15, sends: { reverb: 0.2, delay: 0.1 }, fx: [{ type: 'eq', bands: [{ type: 'hp', freq: 300 }] }], clips: [{ at: 0, notes: stab }] },
    { id: 'lead', name: 'Soft lead', inst: 'softlead', trim: 1, sends: { reverb: 0.25, delay: 0.22 }, clips: [{ at: 0, notes: [...verse, ...pre, ...chorus1, ...chorus2] }] },
    { id: 'violin', name: 'Violin (chorus)', inst: 'violin', trim: -1, pan: -0.15, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: [...chorus1, ...chorus2].map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'bell', name: 'Dusk bells', inst: 'bellkeys', trim: -5, pan: 0.25, sends: { reverb: 0.45, delay: 0.3 }, clips: [{ at: 0, notes: [...introBell, ...chorus2.map(([t, n, d, v]) => N(t, shift(n, 12), Math.min(d, 1), v * 0.7))] }] },
    { id: 'choir', name: 'Choir', inst: 'choiroo', trim: -3, sends: { reverb: 0.5 }, clips: [{ at: 0, notes: choir }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, sends: { reverb: 0.2 }, clips: [
      { at: start('chorus') - 4, sfx: { preset: 'revcymbal', length: 1.1 }, gain: -3 },
      { at: start('chorus2') - 8, sfx: { preset: 'riser', length: 1.3, tone: 0.1 }, gain: -3 },
      { at: start('chorus2'), sfx: { preset: 'impact', length: 0.8, space: 0.5 }, gain: -6 },
    ] },
  ],
});
