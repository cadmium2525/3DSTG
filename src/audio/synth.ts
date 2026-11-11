/**
 * Low-level synth voices for BLOOM DIVE. Every voice is a short-lived node chain
 * that stops itself and disconnects on 'ended', so nothing leaks.
 * All envelope automation uses explicit times (no setTargetAtTime chains) to stay
 * consistent across Chrome / Safari.
 */

/** A destination a voice plays into, plus shared resources. */
export interface Ch {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" / "A5" -> MIDI number. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note ${name}`);
  let n = NOTE_BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  n += (parseInt(m[3], 10) + 1) * 12;
  return n;
}

export const chord = (s: string): number[] => s.trim().split(/\s+/).map(noteToMidi);

/** Disconnect every node once `src` has ended. */
function autoClean(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  };
}

export function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Simple synthetic stereo reverb impulse (exponentially decaying noise). */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // Short pre-delay fade-in avoids a harsh first reflection.
      const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.01));
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * fadeIn;
    }
  }
  return buf;
}

export interface ToneOpts {
  type?: OscillatorType;
  gain: number;
  /** Attack / decay / release seconds, sustain level 0..1. */
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  /** Lowpass cutoff (Hz). Omit for no filter. */
  cutoff?: number;
  /** Cutoff after the decay phase (filter envelope). */
  cutoffEnd?: number;
  q?: number;
  /** Number of detuned oscillators (1..3) and their spread in cents. */
  unison?: number;
  spread?: number;
  /** Pitch glide: start at freq * glide and slide to freq over glideTime. */
  glide?: number;
  glideTime?: number;
  /** Vibrato depth in cents (adds an LFO). */
  vibrato?: number;
  pan?: number;
}

/** General subtractive voice. Returns the time at which it is silent. */
export function tone(ch: Ch, t: number, freq: number, dur: number, o: ToneOpts): number {
  const { ctx } = ch;
  const a = o.a ?? 0.005;
  const d = o.d ?? 0.1;
  const s = o.s ?? 0.6;
  const r = o.r ?? 0.08;
  const end = t + Math.max(dur, a) + r;
  const nodes: AudioNode[] = [];

  const g = ctx.createGain();
  nodes.push(g);
  const peak = o.gain;
  const gp = g.gain;
  gp.setValueAtTime(0, t);
  gp.linearRampToValueAtTime(peak, t + a);
  const sus = Math.max(0.0001, peak * s);
  const holdEnd = t + Math.max(dur, a + 0.001);
  const decEnd = Math.min(t + a + d, holdEnd);
  gp.exponentialRampToValueAtTime(sus, Math.max(decEnd, t + a + 0.001));
  gp.setValueAtTime(sus, holdEnd);
  gp.exponentialRampToValueAtTime(0.0001, end);

  let head: AudioNode = g;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    nodes.push(f);
    f.type = 'lowpass';
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.cutoff, t);
    if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, Math.max(decEnd, t + 0.01));
    f.connect(g);
    head = f;
  }

  let out: AudioNode = g;
  if (o.pan && (ctx as AudioContext).createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    nodes.push(p);
    g.connect(p);
    out = p;
  }
  out.connect(ch.out);

  const n = Math.max(1, Math.min(3, o.unison ?? 1));
  const spread = o.spread ?? 12;
  let last: OscillatorNode | null = null;
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (o.vibrato) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(o.vibrato, t + Math.min(0.25, dur));
    lfo.connect(lfoGain);
    nodes.push(lfo, lfoGain);
    lfo.start(t);
    lfo.stop(end);
  }
  const voiceGain = n > 1 ? 1 / Math.sqrt(n) : 1;
  let vg: AudioNode = head;
  if (n > 1) {
    const mix = ctx.createGain();
    mix.gain.value = voiceGain;
    mix.connect(head);
    nodes.push(mix);
    vg = mix;
  }
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sawtooth';
    if (o.glide) {
      osc.frequency.setValueAtTime(freq * o.glide, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + (o.glideTime ?? 0.05));
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    osc.detune.value = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
    if (lfoGain) lfoGain.connect(osc.detune);
    osc.connect(vg);
    osc.start(t);
    osc.stop(end);
    nodes.push(osc);
    last = osc;
  }
  if (last) autoClean(last, nodes);
  return end;
}

/** Two-operator FM bell / glass tone. */
export function bell(ch: Ch, t: number, freq: number, dur: number, gain: number, ratio = 3.5, index = 2, pan = 0): number {
  const { ctx } = ch;
  const end = t + dur;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modG = ctx.createGain();
  const g = ctx.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  modG.gain.setValueAtTime(freq * index, t);
  modG.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  mod.connect(modG);
  modG.connect(car.frequency);
  car.connect(g);
  const nodes: AudioNode[] = [car, mod, modG, g];
  let out: AudioNode = g;
  if (pan && (ctx as AudioContext).createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    nodes.push(p);
    out = p;
  }
  out.connect(ch.out);
  car.start(t);
  mod.start(t);
  car.stop(end);
  mod.stop(end);
  autoClean(car, nodes);
  return end;
}

/** Pad chord: two detuned saws per note through one shared lowpass. */
export function pad(ch: Ch, t: number, notes: number[], dur: number, gain: number, cutoff = 1400, attack = 0.6, release = 1.2): number {
  const { ctx } = ch;
  const end = t + dur + release;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff * 0.6, t);
  f.frequency.linearRampToValueAtTime(cutoff, t + attack + 0.4);
  f.Q.value = 0.5;
  const g = ctx.createGain();
  const per = gain / Math.sqrt(notes.length * 2);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(per, t + attack);
  g.gain.setValueAtTime(per, t + dur);
  g.gain.linearRampToValueAtTime(0, end);
  f.connect(g);
  g.connect(ch.out);
  const nodes: AudioNode[] = [f, g];
  let last: OscillatorNode | null = null;
  for (const m of notes) {
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(end);
      nodes.push(o);
      last = o;
    }
  }
  if (last) autoClean(last, nodes);
  return end;
}

export interface NoiseOpts {
  gain: number;
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  a?: number;
  pan?: number;
}

/** Filtered noise burst with exponential decay over `dur`. */
export function noise(ch: Ch, t: number, dur: number, o: NoiseOpts): number {
  const { ctx } = ch;
  const a = o.a ?? 0.001;
  const end = t + a + dur;
  const src = ctx.createBufferSource();
  src.buffer = ch.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'highpass';
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(f);
  f.connect(g);
  const nodes: AudioNode[] = [src, f, g];
  let out: AudioNode = g;
  if (o.pan && (ctx as AudioContext).createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    nodes.push(p);
    out = p;
  }
  out.connect(ch.out);
  // Random offset so consecutive hits don't sound identical.
  src.start(t, Math.random() * Math.max(0, ch.noise.duration - 0.5));
  src.stop(end + 0.01);
  autoClean(src, nodes);
  return end;
}

/** Sine kick with pitch drop. */
export function kick(ch: Ch, t: number, gain: number, punch = 1): number {
  const { ctx } = ch;
  const end = t + 0.32;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160 * punch, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  o.frequency.exponentialRampToValueAtTime(40, end);
  g.gain.setValueAtTime(gain, t);
  g.gain.setValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  o.connect(g);
  g.connect(ch.out);
  o.start(t);
  o.stop(end);
  autoClean(o, [o, g]);
  // Click transient.
  noise(ch, t, 0.012, { gain: gain * 0.25, type: 'highpass', freq: 3000 });
  return end;
}

export function snare(ch: Ch, t: number, gain: number): number {
  tone(ch, t, 190, 0.04, { type: 'triangle', gain: gain * 0.6, a: 0.001, d: 0.08, s: 0.01, r: 0.03, glide: 1.4, glideTime: 0.04 });
  return noise(ch, t, 0.18, { gain, type: 'bandpass', freq: 3200, freqEnd: 1800, q: 0.6 });
}

export function clap(ch: Ch, t: number, gain: number): number {
  // Three quick bursts then a tail.
  for (let i = 0; i < 3; i++) noise(ch, t + i * 0.009, 0.02, { gain: gain * 0.7, type: 'bandpass', freq: 1500, q: 1.2 });
  return noise(ch, t + 0.027, 0.16, { gain, type: 'bandpass', freq: 1300, q: 1 });
}

export function hat(ch: Ch, t: number, gain: number, open = false, pan = 0): number {
  return noise(ch, t, open ? 0.14 : 0.035, { gain, type: 'highpass', freq: open ? 7000 : 8500, q: 0.7, pan });
}
