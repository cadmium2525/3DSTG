/**
 * Dev-only helpers: render BGM / SFX through the real mixing graph in an
 * OfflineAudioContext and report peak / RMS. Not imported by the game.
 */
import type { BgmTrack, SfxName } from '../core/types';
import { buildGraph } from './graph';
import { createTrackPlayer } from './music';
import { SFX } from './sfx';

export interface RenderStats {
  peak: number;
  rms: number;
  /** Fraction of samples with |x| >= 0.999. */
  clipped: number;
  seconds: number;
}

function stats(buf: AudioBuffer): RenderStats {
  let peak = 0;
  let sum = 0;
  let clip = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clip++;
      sum += d[i] * d[i];
      n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), clipped: clip / Math.max(1, n), seconds: buf.duration };
}

export async function renderBgm(track: BgmTrack, seconds = 8, startBar = 0, rate = 44100): Promise<RenderStats> {
  const ctx = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
  const g = buildGraph(ctx);
  const p = createTrackPlayer(g, track, 0.02, 0.05, startBar * 16);
  p.scheduleUntil(seconds);
  return stats(await ctx.startRendering());
}

export async function renderSfx(name: SfxName, seconds = 3, rate = 44100): Promise<RenderStats> {
  const ctx = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
  const g = buildGraph(ctx);
  SFX[name]({ ctx, out: g.sfx, noise: g.noise }, 0.01);
  return stats(await ctx.startRendering());
}
