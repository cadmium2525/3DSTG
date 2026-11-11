/**
 * Shared mixing graph: music / sfx buses, reverb + tempo delay sends,
 * master gain -> glue compressor -> limiter -> destination.
 * Works with both AudioContext and OfflineAudioContext (used by the dev render check).
 */
import { makeImpulse, makeNoiseBuffer } from './synth';

export interface Graph {
  ctx: BaseAudioContext;
  /** User volume / mute stage. */
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  /** Send inputs (post-fader sends feed these). */
  reverbIn: GainNode;
  delayIn: GainNode;
  delay: DelayNode;
  noise: AudioBuffer;
}

export const MUSIC_LEVEL = 0.55;
export const SFX_LEVEL = 0.85;

export function buildGraph(ctx: BaseAudioContext): Graph {
  const master = ctx.createGain();
  master.gain.value = 1;

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 10;
  glue.ratio.value = 3;
  glue.attack.value = 0.005;
  glue.release.value = 0.2;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  const outTrim = ctx.createGain();
  outTrim.gain.value = 0.92;

  master.connect(glue);
  glue.connect(limiter);
  limiter.connect(outTrim);
  outTrim.connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = MUSIC_LEVEL;
  music.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = SFX_LEVEL;
  sfx.connect(master);

  // Reverb send.
  const reverbIn = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.2, 3);
  const revOut = ctx.createGain();
  revOut.gain.value = 0.5;
  reverbIn.connect(conv);
  conv.connect(revOut);
  revOut.connect(master);

  // Feedback delay with darkening filter; also feeds the reverb a little.
  const delayIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.3;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 3200;
  delayIn.connect(delay);
  delay.connect(dlp);
  dlp.connect(fb);
  fb.connect(delay);
  const dOut = ctx.createGain();
  dOut.gain.value = 0.45;
  dlp.connect(dOut);
  dOut.connect(master);
  const dRev = ctx.createGain();
  dRev.gain.value = 0.3;
  dlp.connect(dRev);
  dRev.connect(reverbIn);

  return { ctx, master, music, sfx, reverbIn, delayIn, delay, noise: makeNoiseBuffer(ctx, 1.5) };
}
