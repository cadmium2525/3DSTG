/**
 * BLOOM DIVE — Web Audio engine (fully synthesised BGM + SFX).
 *
 * - The AudioContext is created lazily in unlock(), which must run inside a user gesture.
 * - Everything is a silent no-op before unlock() or when Web Audio is unavailable.
 * - BGM uses a look-ahead scheduler: a 25 ms setInterval schedules notes ~120 ms ahead
 *   on the audio clock, so timing stays tight even with janky frames.
 */
import type { AudioEngine, BgmTrack, SfxName } from '../core/types';
import { buildGraph, SFX_LEVEL, type Graph } from './graph';
import { createTrackPlayer, TRACKS, type TrackPlayer } from './music';
import { SFX, SFX_LIMITS } from './sfx';
import type { Ch } from './synth';

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const MAX_SFX_VOICES = 16;

type Ctor = typeof AudioContext;

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  let g: Graph | null = null;
  let failed = false;
  let muted = false;
  let paused = false;
  let wanted: BgmTrack | null = null;
  let cur: TrackPlayer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const sfxCh = new Map<SfxName, Ch>();
  const sfxEnds = new Map<SfxName, number[]>();
  const sfxLast = new Map<SfxName, number>();

  const running = () => !!ctx && ctx.state === 'running';

  function tick() {
    if (!ctx || !cur) return;
    try {
      cur.scheduleUntil(ctx.currentTime + LOOKAHEAD, ctx.currentTime);
    } catch {
      /* never let the scheduler throw out of the timer */
    }
  }

  function ensureTimer(on: boolean) {
    if (on && !timer) timer = setInterval(tick, TICK_MS);
    else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tryResume() {
    if (!ctx || paused) return;
    // 'interrupted' (iOS call / Siri) and 'suspended' both need resume() from a gesture.
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  function create(): boolean {
    if (ctx) return true;
    if (failed) return false;
    const C = getCtor();
    if (!C) {
      failed = true;
      return false;
    }
    try {
      try {
        ctx = new C({ latencyHint: 'interactive' });
      } catch {
        ctx = new C();
      }
      g = buildGraph(ctx);
      g.master.gain.value = muted ? 0 : 1;
      for (const name of Object.keys(SFX) as SfxName[]) {
        const out = ctx.createGain();
        out.connect(g.sfx);
        const rev = SFX_LIMITS[name].rev;
        if (rev > 0) {
          const s = ctx.createGain();
          s.gain.value = rev * SFX_LEVEL;
          out.connect(s);
          s.connect(g.reverbIn);
        }
        sfxCh.set(name, { ctx, out, noise: g.noise });
        sfxEnds.set(name, []);
      }
      // Any later gesture revives an interrupted / suspended context (iOS).
      const revive = () => tryResume();
      for (const ev of ['pointerdown', 'touchend', 'keydown']) {
        window.addEventListener(ev, revive, { capture: true, passive: true });
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) tryResume();
      });
      return true;
    } catch {
      failed = true;
      ctx = null;
      g = null;
      return false;
    }
  }

  function startTrack(track: BgmTrack) {
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    const crossfade = !!cur;
    if (cur) {
      const old = cur;
      const end = old.fadeOut(now, 0.6);
      setTimeout(() => old.dispose(), (end - now + 3) * 1000);
    }
    cur = createTrackPlayer(g, track, now + 0.08, crossfade ? 0.35 : 0.05);
    ensureTimer(true);
    tick();
  }

  const engine: AudioEngine = {
    unlock() {
      if (!create() || !ctx) return;
      try {
        if (!paused && ctx.state !== 'running') ctx.resume().catch(() => {});
        // Classic iOS unlock: play a 1-sample silent buffer inside the gesture.
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
        src.onended = () => src.disconnect();
        if (wanted && (!cur || cur.name !== wanted)) startTrack(wanted);
      } catch {
        /* ignore */
      }
    },
    setMuted(m) {
      muted = m;
      if (!ctx || !g) return;
      const p = g.master.gain;
      const t = ctx.currentTime;
      try {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(m ? 0 : 1, t + 0.15);
      } catch {
        p.value = m ? 0 : 1;
      }
    },
    playBgm(track) {
      wanted = track;
      if (!ctx || !g) return;
      if (cur && cur.name === track) return;
      try {
        startTrack(track);
      } catch {
        /* ignore */
      }
    },
    stopBgm() {
      wanted = null;
      if (!ctx || !cur) return;
      const old = cur;
      cur = null;
      ensureTimer(false);
      try {
        const now = ctx.currentTime;
        const end = old.fadeOut(now, 0.4);
        setTimeout(() => old.dispose(), (end - now + 3) * 1000);
      } catch {
        /* ignore */
      }
    },
    sfx(name) {
      // Skip when muted (saves CPU) or not running (would burst on resume).
      if (!ctx || muted || !running()) return;
      const fn = SFX[name];
      const ch = sfxCh.get(name);
      const ends = sfxEnds.get(name);
      if (!fn || !ch || !ends) return;
      const now = ctx.currentTime;
      const lim = SFX_LIMITS[name];
      if (now - (sfxLast.get(name) ?? -1) < lim.gap) return;
      // Drop finished voices, then enforce per-name and global caps.
      for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
      if (ends.length >= lim.max) return;
      let total = 0;
      for (const e of sfxEnds.values()) total += e.length;
      if (total >= MAX_SFX_VOICES) return;
      try {
        ends.push(fn(ch, now + 0.005));
        sfxLast.set(name, now);
      } catch {
        /* ignore */
      }
    },
    setPaused(p) {
      paused = p;
      if (!ctx) return;
      try {
        if (p) ctx.suspend().catch(() => {});
        else ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    get beat() {
      if (!ctx || !cur) return 0;
      // Compensate output latency so beat matches what is heard.
      const raw = (ctx as AudioContext & { outputLatency?: number }).outputLatency;
      const lat = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(0.2, Math.max(0, raw)) : 0;
      return Math.max(0, ((ctx.currentTime - lat - cur.startTime) * cur.bpm) / 60);
    },
    get bpm() {
      if (cur) return cur.bpm;
      return wanted ? TRACKS[wanted].bpm : 120;
    },
  };
  return engine;
}
