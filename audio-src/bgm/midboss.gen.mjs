// BLOOM DIVE — mid-boss theme "Thorn Gate" (original).
// Tense and fast: D (harmonic) minor with a Phrygian Eb, 16th spiccato ostinato,
// reese bass, rock drums with toms, synth-brass stabs, saw lead riff then a brass line.
// 160 bpm, 24 bars = 36 s seamless loop.
//   bars 0-3 intro · 4-11 riff · 12-19 brass section · 20-23 turnaround (dominant → loop)
import { N, seq, arp, blocks, stabs, shift, tones } from '../lib.mjs';

const B = 4;
const V = {
  Dm: ['D4 F4 A4', 'D2'],
  Bb: ['D4 F4 Bb4', 'Bb1'],
  Gm: ['D4 G4 Bb4', 'G1'],
  A: ['C#4 E4 A4', 'A1'],
  A7: ['C#4 E4 G4', 'A1'],
  Eb: ['Eb4 G4 Bb4', 'Eb2'],
  C: ['C4 E4 G4', 'C2'],
};
const sections = [
  ['intro', 'Dm Dm Eb Dm'],
  ['riff', 'Dm Bb Gm A Dm Bb Gm A'],
  ['brass', 'Dm Eb Dm Eb Bb C A A7'],
  ['turn', 'Gm A Bb A7'],
];
const bars = [];
for (const [sec, cs] of sections) for (const c of cs.split(' ')) bars.push({ sec, c, t: bars.length * B });
const start = (s) => bars.find((b) => b.sec === s).t;
const inSec = (...s) => bars.filter((b) => s.includes(b.sec));

const riff = seq(`
  D5/.5 A4/.5 D5/.5 E5/.5 F5/1 E5/.5 D5/.5 | F5/.75 G5/.75 F5/.5 D5/1 A#4/1 | G4/.5 A#4/.5 D5/.5 G5/.5 F5/1 E5/.5 D5/.5 | C#5/1.5 E5/.5 A5/2
  D5/.5 A4/.5 D5/.5 E5/.5 F5/1 G5/.5 A5/.5 | A#5/1 A5/.5 G5/.5 F5/1 D5/1 | E5/.75 F5/.75 G5/.5 A5/1 A#5/1 | A5/2 G5/.5 F5/.5 E5/.5 C#5/.5
`, { at: start('riff'), vel: 0.78, gate: 0.85 });
const brassLine = seq(`
  D5/2 F5/2 | D#5/2 G5/1 F5/1 | D5/2 A5/2 | G5/3 D#5/1 | F5/2 D5/2 | E5/2 G5/2 | A5/4 | C#5/2 E5/1 G5/1
`, { at: start('brass'), vel: 0.75, gate: 0.95 });
const turnLead = seq(`G5/.5 F5/.5 D5/.5 A#4/.5 D5/1 G5/1 | A5/.75 G5/.75 E5/.5 C#5/2 | A#5/.5 A5/.5 F5/.5 D5/.5 F5/1 A#5/1 | A5/1 C#6/1 E6/2`, { at: start('turn'), vel: 0.8, gate: 0.85 });

const ostTones = (c) => tones(V[c][0]).join(' ');
const ost = arp(bars.map((b) => [b.t, B, ostTones(b.c)]), [0, 0, 2, 0, 1, 0, 2, 1, 0, 0, 2, 0, 1, 2, 1, 2], 0.25, { vel: 0.5, accent: 0.2, gate: 0.6 });
const bass = bars.flatMap((b) => {
  const r = V[b.c][1];
  const pat = b.sec === 'intro' ? [0, 1.5, 2, 3.5] : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  return pat.map((x, k) => N(b.t + x, k % 4 === 3 ? shift(r, 12) : r, 0.4, k % 2 ? 0.65 : 0.85));
});
const brassStabs = stabs(inSec('riff', 'turn').map((b) => [b.t, B, tones(V[b.c][0]).map((n) => shift(n, 0)).join(' ')]), 'x..x..x.........', 0.25, { vel: 0.7, gate: 0.7 });
const pad = blocks(bars.map((b) => [b.t, B, V[b.c][0].split(' ').map((n) => shift(n, -12)).join(' ')]), { vel: 0.5 });
const choir = blocks(inSec('brass').map((b) => [b.t, B, V[b.c][0]]), { vel: 0.55 });
const timp = bars.flatMap((b) => {
  const r = shift(V[b.c][1], 12);
  if (b.sec === 'intro') return [N(b.t, r, 1, 0.9), N(b.t + 2.5, r, 1, 0.6), N(b.t + 3, r, 1, 0.7), N(b.t + 3.5, r, 0.5, 0.8)];
  return [N(b.t, r, 1, 0.8)];
});

const drumClips = bars.map((b, i) => {
  const first = bars[i - 1]?.sec !== b.sec;
  const last = bars[i + 1]?.sec !== b.sec;
  const g = {};
  if (b.sec === 'intro') {
    g.tom3 = 'x..x..x.x..x..x.';
    g.tom2 = '..........x.....';
    g.hat = 'x.x.x.x.x.x.x.x.';
    if (i === 3) { g.snare = '........xxxxXXXX'; }
  } else {
    g.kick = b.sec === 'brass' ? 'x.....x.x.....x.' : 'x..x..x.x..x..x.';
    g.snare = '....x.......x...';
    g.hat = b.sec === 'brass' ? 'x.x.x.x.x.x.x.x.' : 'xgxxxgxxxgxxxgxx';
    if (b.sec === 'brass') g.ride = 'x...x...x...x...';
    if (first) g.crash = 'x...............';
    if (last) { g.snare = '....x.......xxxx'; g.tom1 = '..........x.....'; }
  }
  return { at: b.t, len: B, grid: g };
});

export default () => ({
  name: 'BLOOM DIVE - Thorn Gate (mid-boss)',
  bpm: 160,
  sig: [4, 4],
  bars: bars.length,
  key: 'D minor',
  tail: 4,
  sends: {
    reverb: { size: 1.6, decay: 2.4, damp: 6000, predelay: 0.02, volume: 0 },
    delay: { time: '1/8', feedback: 0.3, tone: 4000, volume: -4 },
  },
  master: { loudness: -16, ceiling: -1.5 },
  tracks: [
    { id: 'drums', name: 'Drums', kit: 'rock', trim: 0, sends: { reverb: 0.1 }, humanize: { time: 0.004, vel: 0.05 }, clips: drumClips },
    { id: 'timp', name: 'Timpani', inst: 'timpani', trim: -2, sends: { reverb: 0.25 }, clips: [{ at: 0, notes: timp }] },
    { id: 'bass', name: 'Reese bass', inst: 'reese', trim: 0, fx: [{ type: 'dist', drive: 6, kind: 'tape', mix: 0.4 }], clips: [{ at: 0, notes: bass }] },
    { id: 'ost', name: 'Spiccato ostinato', inst: 'spiccato', trim: 0, pan: -0.15, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: ost }] },
    { id: 'pad', name: 'Dark pad', inst: 'darkpad', trim: -1, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: pad }] },
    { id: 'stab', name: 'Brass stabs', inst: 'synthbrass', trim: -2, pan: 0.2, sends: { reverb: 0.2 }, clips: [{ at: 0, notes: brassStabs }] },
    { id: 'lead', name: 'Riff lead', inst: 'sawlead', trim: 1, sends: { reverb: 0.15, delay: 0.18 }, fx: [{ type: 'dist', drive: 4, kind: 'soft', mix: 0.3 }], clips: [{ at: 0, notes: [...riff, ...turnLead] }] },
    { id: 'brass', name: 'Brass line', inst: 'trumpet', trim: 1, sends: { reverb: 0.3, delay: 0.1 }, clips: [{ at: 0, notes: brassLine }] },
    { id: 'horn', name: 'Horns (octave below)', inst: 'horn', trim: -2, sends: { reverb: 0.35 }, clips: [{ at: 0, notes: brassLine.map(([t, n, d, v]) => N(t, shift(n, -12), d, v)) }] },
    { id: 'choir', name: 'Choir', inst: 'choir', trim: -3, sends: { reverb: 0.45 }, clips: [{ at: 0, notes: choir }] },
    { id: 'fx', name: 'FX', type: 'sfx', trim: -4, clips: [
      { at: start('brass') - 4, sfx: { preset: 'revcymbal', length: 1 }, gain: -3 },
      { at: start('turn') + 8, sfx: { preset: 'riser', length: 0.6, tone: 0.2 }, gain: -3 },
    ] },
  ],
});
