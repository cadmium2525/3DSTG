/**
 * BLOOM DIVE — Web Audio engine for the pre-rendered BGM / SFX in public/audio/.
 *
 * The music and effects are authored as かなでる JSON in audio-src/ and rendered by
 * audio-src/build.mjs (`npm run audio`), which also writes ./manifest.ts.
 *
 * - Loading is lazy. createAudio() downloads the SFX, the title and the stage-1 tracks; the other
 *   stages' tracks are downloaded only when one of them is requested (playBgm) or when the track
 *   before them in the play flow starts (NEXT below: e.g. boss → stage2, boss2 → stage3).
 * - Decoding happens only after unlock() (AudioContext): SFX first, then BGM through a small
 *   priority queue — the requested track always jumps the queue, then the likely next tracks
 *   (NEXT) are pre-decoded so a mid-boss / boss switch is instant.
 * - Memory: a decoded 60 s stereo track is ~15–20 MB, so at most MAX_DECODED BGM buffers are kept;
 *   the least recently used one that is not playing, requested or a likely next track is dropped
 *   and re-decoded on demand from its compressed bytes (kept for at most MAX_RAW tracks; beyond
 *   that they are re-fetched, normally from the HTTP cache).
 * - BGM loops sample-accurately with AudioBufferSourceNode.loopStart/loopEnd (the files carry
 *   periodic padding around the loop, so MP3 encoder delay cannot open a gap), crossfades on
 *   track changes, and a playBgm() before unlock / before decoding is remembered.
 *   Tracks with `loop: false` in the manifest (the ending) play once and then stop.
 * - SFX have per-name voice limits and minimum gaps (shot is spammed ~8x/s).
 * - Everything is a silent no-op before unlock() or when Web Audio / decoding fails. Never throws.
 */
import type { AudioEngine, BgmTrack, SfxName } from '../core/types';
import { BGM_FILES, SFX_FILES, type BgmFile, type SfxFile } from './manifest';

// Compile-time check that the generated manifest covers every track / effect name.
const BGM: Record<BgmTrack, BgmFile> = BGM_FILES;
const SFX: Record<SfxName, SfxFile> = SFX_FILES;

/** Mix: BGM files are mastered to about -16 LUFS, SFX peaks are set per effect in audio-src/sfx. */
const BGM_LEVEL = 0.6;
const SFX_LEVEL = 0.85;
const CROSSFADE = 0.7;
const FADE_IN = 0.06;
const STOP_FADE = 0.45;

interface SfxRule {
  /** Max simultaneous voices of this effect (the oldest is cut when exceeded, unless `drop`). */
  max: number;
  /** Minimum seconds between two starts. */
  gap: number;
  /** Linear gain. */
  gain: number;
  /** Random pitch spread in cents (±). */
  detune: number;
  /** Duck the BGM by this factor for `duckFor` seconds. */
  duck?: number;
  duckFor?: number;
  /** When at the voice limit, skip the new one instead of cutting the oldest. */
  drop?: boolean;
}

const RULES: Record<SfxName, SfxRule> = {
  shot: { max: 2, gap: 0.05, gain: 1, detune: 25, drop: true },
  enemyHit: { max: 3, gap: 0.035, gain: 1, detune: 60, drop: true },
  enemyDown: { max: 4, gap: 0.04, gain: 1, detune: 50 },
  graze: { max: 3, gap: 0.045, gain: 1, detune: 90, drop: true },
  playerHit: { max: 1, gap: 0.25, gain: 1, detune: 0, duck: 0.45, duckFor: 0.5 },
  bossWarning: { max: 1, gap: 1.0, gain: 1, detune: 0, duck: 0.5, duckFor: 1.9 },
  midbossDown: { max: 1, gap: 0.5, gain: 1, detune: 0, duck: 0.5, duckFor: 1.2 },
  bossDown: { max: 1, gap: 0.8, gain: 1, detune: 0, duck: 0.35, duckFor: 2.0 },
  uiTap: { max: 2, gap: 0.05, gain: 1, detune: 0 },
  clear: { max: 1, gap: 1.0, gain: 1, detune: 0, duck: 0.4, duckFor: 3.0 },
  gameOver: { max: 1, gap: 1.0, gain: 1, detune: 0, duck: 0.3, duckFor: 2.4 },
  // Star pickups arrive in bursts (bomb / phase break): few voices, dropped when busy.
  itemScore: { max: 3, gap: 0.03, gain: 0.8, detune: 15, drop: true },
  itemPower: { max: 2, gap: 0.06, gain: 1, detune: 20, drop: true },
  powerUp: { max: 1, gap: 0.3, gain: 1, detune: 0, duck: 0.7, duckFor: 0.5 },
  bomb: { max: 1, gap: 0.5, gain: 1, detune: 0, duck: 0.45, duckFor: 1.4 },
};

/** Downloaded right away by createAudio() (title screen + the whole first stage). */
const BOOT_BGM: BgmTrack[] = ['title', 'stage', 'midboss', 'boss'];
/**
 * Likely next tracks in the play flow (stage → mid-boss → stage → boss → next stage …). When a
 * track is requested these are downloaded and pre-decoded, so the next switch has no delay.
 */
const NEXT: Record<BgmTrack, BgmTrack[]> = {
  title: ['stage'],
  stage: ['midboss', 'boss'],
  midboss: ['stage', 'boss'],
  boss: ['stage2'],
  stage2: ['midboss2', 'boss2'],
  midboss2: ['stage2', 'boss2'],
  boss2: ['stage3'],
  stage3: ['midboss3', 'boss3'],
  midboss3: ['stage3', 'boss3'],
  boss3: ['ending'],
  ending: ['title'],
};
/** Decoded BGM buffers kept in memory (~15–20 MB each). */
const MAX_DECODED = 4;
/** Compressed BGM files kept in memory for re-decoding (~0.6–1.3 MB each). */
const MAX_RAW = 6;
const MAX_SFX_VOICES = 14;

type Ctor = typeof AudioContext;

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function assetUrl(file: string): string {
  let base = './';
  try {
    base = import.meta.env.BASE_URL || './';
  } catch {
    /* not under Vite */
  }
  const rel = `${base.endsWith('/') ? base : `${base}/`}audio/${file}`;
  try {
    return new URL(rel, document.baseURI).href;
  } catch {
    return rel;
  }
}

/** decodeAudioData with the old callback form (Safari < 14.1) and the promise form. */
function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

/** Seconds of near-silence at the head of a buffer (MP3 decoders that keep encoder delay). */
function leadIn(buf: AudioBuffer): number {
  try {
    const x = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    const thr = Math.max(1e-4, peak * 0.01);
    const lim = Math.min(x.length, Math.round(buf.sampleRate * 0.06));
    for (let i = 0; i < lim; i++) if (Math.abs(x[i]) > thr) return Math.max(0, i - 8) / buf.sampleRate;
    return 0;
  } catch {
    return 0;
  }
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

interface Playing {
  track: BgmTrack;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** ctx time at which loopStart was (or will be) heard: the beat origin. */
  t0: number;
  bpm: number;
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bgmBus: GainNode | null = null;
  let duckBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let failed = false;
  let muted = false;
  let paused = false;
  let wanted: BgmTrack | null = null;
  let cur: Playing | null = null;

  /* ---------------- loading ---------------- */
  const raw = new Map<string, Promise<ArrayBuffer | null>>();
  const sfxBuf = new Map<SfxName, { buf: AudioBuffer; offset: number }>();
  const bgmBuf = new Map<BgmTrack, AudioBuffer>();
  /** last time (performance clock) a BGM was requested / played: LRU for both caches */
  const used = new Map<BgmTrack, number>();
  let clock = 0;
  const touch = (t: BgmTrack) => used.set(t, ++clock);

  function fetchFile(file: string): Promise<ArrayBuffer | null> {
    let p = raw.get(file);
    if (!p) {
      p = (typeof fetch === 'function'
        ? fetch(assetUrl(file)).then((r) => (r.ok ? r.arrayBuffer() : null))
        : Promise.resolve(null)
      ).catch(() => null);
      raw.set(file, p);
      // allow a retry later if the network failed
      p.then((b) => {
        if (!b) raw.delete(file);
      });
    }
    return p;
  }

  /** Download BGM files one after another (never competes with the requested track for bandwidth). */
  let fetchChain: Promise<unknown> = Promise.resolve();
  function prefetchBgm(tracks: BgmTrack[]) {
    for (const t of tracks) {
      if (raw.has(BGM[t].file)) continue;
      fetchChain = fetchChain.then(() => fetchFile(BGM[t].file)).catch(() => null);
    }
  }

  /** Protected from eviction: what is playing, what is wanted, and what comes next. */
  function keepSet(): Set<BgmTrack> {
    const keep = new Set<BgmTrack>();
    for (const t of [cur?.track, wanted]) {
      if (!t) continue;
      keep.add(t);
      for (const n of NEXT[t]) keep.add(n);
    }
    return keep;
  }

  function lru(tracks: BgmTrack[]): BgmTrack[] {
    return tracks.sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0));
  }

  function evict() {
    const keep = keepSet();
    const decoded = lru([...bgmBuf.keys()]);
    for (const t of decoded) {
      if (bgmBuf.size <= MAX_DECODED) break;
      if (!keep.has(t)) bgmBuf.delete(t);
    }
    const files = (Object.keys(BGM) as BgmTrack[]).filter((t) => raw.has(BGM[t].file));
    let n = files.length;
    for (const t of lru(files)) {
      if (n <= MAX_RAW) break;
      if (keep.has(t) || jobs.includes(t) || decoding === t) continue;
      raw.delete(BGM[t].file);
      n--;
    }
  }

  async function loadSfx(name: SfxName) {
    if (!ctx || sfxBuf.has(name)) return;
    const data = await fetchFile(SFX[name].file);
    if (!data || !ctx) return;
    try {
      const buf = await decode(ctx, data);
      sfxBuf.set(name, { buf, offset: leadIn(buf) });
    } catch {
      /* undecodable: stays silent */
    }
    raw.delete(SFX[name].file); // the compressed bytes are no longer needed
  }

  /*
   * BGM decode queue: one decode at a time (a big decode never stalls the effects); the wanted
   * track always goes first, then pre-decodes in request order.
   */
  const jobs: BgmTrack[] = [];
  const waiters = new Map<BgmTrack, ((b: AudioBuffer | null) => void)[]>();
  let decoding: BgmTrack | null = null;
  let sfxReady = false;

  function loadBgm(track: BgmTrack): Promise<AudioBuffer | null> {
    const have = bgmBuf.get(track);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      let w = waiters.get(track);
      if (!w) waiters.set(track, (w = []));
      w.push(resolve);
      if (decoding !== track && !jobs.includes(track)) jobs.push(track);
      pump();
    });
  }

  function pump() {
    if (decoding || !ctx || !sfxReady || !jobs.length) return;
    const i = wanted ? jobs.indexOf(wanted) : -1;
    const track = jobs.splice(i >= 0 ? i : 0, 1)[0];
    decoding = track;
    const finish = (buf: AudioBuffer | null) => {
      decoding = null;
      if (buf) {
        bgmBuf.set(track, buf);
        evict();
      }
      const w = waiters.get(track) ?? [];
      waiters.delete(track);
      for (const r of w) r(buf);
      pump();
    };
    const have = bgmBuf.get(track);
    if (have) {
      finish(have);
      return;
    }
    fetchFile(BGM[track].file)
      .then(async (data) => {
        if (!data || !ctx) return null;
        try {
          // decode a copy: decodeAudioData detaches its input, the bytes are kept for re-decoding
          return await decode(ctx, data.slice(0));
        } catch {
          raw.delete(BGM[track].file); // corrupt download? refetch next time
          return null;
        }
      })
      .catch(() => null)
      .then(finish);
  }

  /** Download + decode the likely next tracks after `track` (only those not decoded yet). */
  function warm(track: BgmTrack) {
    prefetchBgm(NEXT[track]);
    if (!ctx) return;
    for (const n of NEXT[track]) if (!bgmBuf.has(n)) loadBgm(n);
  }

  // Start downloading right away: SFX + title in parallel, then the rest of stage 1 one by one.
  if (typeof window !== 'undefined' && getCtor()) {
    for (const n of Object.keys(SFX) as SfxName[]) fetchFile(SFX[n].file);
    fetchChain = fetchFile(BGM.title.file);
    prefetchBgm(BOOT_BGM);
  }

  function startLoading() {
    const names = Object.keys(SFX) as SfxName[];
    Promise.all(names.map(loadSfx))
      .catch(() => {})
      .then(() => {
        sfxReady = true;
        // the requested track first (it may already be queued), then what comes after it
        if (wanted) {
          loadBgm(wanted);
          warm(wanted);
        }
        pump();
      });
  }

  /* ---------------- context ---------------- */
  function tryResume() {
    if (!ctx || paused) return;
    // 'interrupted' (iOS call / Siri) and 'suspended' both need resume(), ideally from a gesture.
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
      const c = ctx;
      master = c.createGain();
      master.gain.value = muted ? 0 : 1;
      // Gentle safety limiter so stacked explosions over the BGM never clip.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 6;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp);
      comp.connect(c.destination);
      duckBus = c.createGain();
      duckBus.connect(master);
      bgmBus = c.createGain();
      bgmBus.gain.value = BGM_LEVEL;
      bgmBus.connect(duckBus);
      sfxBus = c.createGain();
      sfxBus.gain.value = SFX_LEVEL;
      sfxBus.connect(master);
      const revive = () => tryResume();
      for (const ev of ['pointerdown', 'touchend', 'keydown']) {
        window.addEventListener(ev, revive, { capture: true, passive: true });
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) tryResume();
      });
      startLoading();
      return true;
    } catch {
      failed = true;
      ctx = null;
      return false;
    }
  }

  /* ---------------- BGM ---------------- */
  function fadeOutAndStop(p: Playing, dur: number) {
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const g = p.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + dur);
      p.src.stop(t + dur + 0.05);
    } catch {
      try {
        p.src.stop();
      } catch {
        /* already stopped */
      }
    }
    p.src.onended = () => {
      try {
        p.src.disconnect();
        p.gain.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  function startTrack(track: BgmTrack, buf: AudioBuffer) {
    if (!ctx || !bgmBus) return;
    const f = BGM[track];
    const now = ctx.currentTime;
    const crossfade = !!cur;
    if (cur) fadeOutAndStop(cur, CROSSFADE);
    cur = null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const once = f.loop === false;
    src.loop = !once;
    // keep the loop inside the buffer even if a decoder trimmed / padded differently
    const end = Math.min(f.loopEnd, buf.duration);
    src.loopStart = Math.min(f.loopStart, Math.max(0, end - 0.1));
    src.loopEnd = end;
    const gain = ctx.createGain();
    const t = now + 0.03;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, t + (crossfade ? CROSSFADE * 0.6 : FADE_IN));
    src.connect(gain);
    gain.connect(bgmBus);
    src.start(t, src.loopStart);
    const p: Playing = { track, src, gain, t0: t, bpm: f.bpm };
    cur = p;
    touch(track);
    if (once) {
      // a one-shot that ends by itself: forget it, so unlock() / playBgm() do not restart it
      src.onended = () => {
        if (cur !== p) return;
        cur = null;
        if (wanted === track) wanted = null;
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
    evict();
  }

  function requestTrack(track: BgmTrack) {
    touch(track);
    fetchFile(BGM[track].file); // the requested file downloads at once, not behind the prefetches
    if (!ctx) {
      warm(track); // downloads only
      return;
    }
    const have = bgmBuf.get(track);
    if (have) startTrack(track, have);
    else
      loadBgm(track).then((buf) => {
        try {
          if (buf && wanted === track && (!cur || cur.track !== track)) startTrack(track, buf);
        } catch {
          /* ignore */
        }
      });
    warm(track);
  }

  function duck(amount: number, dur: number) {
    if (!ctx || !duckBus) return;
    const g = duckBus.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(amount, t + 0.04);
    g.setValueAtTime(amount, t + dur);
    g.linearRampToValueAtTime(1, t + dur + 0.6);
  }

  /* ---------------- SFX ---------------- */
  const voices = new Map<SfxName, Voice[]>();
  const lastStart = new Map<SfxName, number>();
  let totalVoices = 0;

  function playSfx(name: SfxName, pitch = 0) {
    if (!ctx || !sfxBus) return;
    const entry = sfxBuf.get(name);
    if (!entry) return;
    const rule = RULES[name];
    const now = ctx.currentTime;
    if (now - (lastStart.get(name) ?? -1e9) < rule.gap) return;
    let list = voices.get(name);
    if (!list) voices.set(name, (list = []));
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= now) list.splice(i, 1);
    totalVoices = 0;
    for (const l of voices.values()) totalVoices += l.length;
    if (list.length >= rule.max || totalVoices >= MAX_SFX_VOICES) {
      if (rule.drop || list.length === 0) return;
      const old = list.shift()!;
      try {
        old.gain.gain.setTargetAtTime(0, now, 0.01);
        old.src.stop(now + 0.06);
      } catch {
        /* ignore */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = entry.buf;
    const cents = (rule.detune ? (Math.random() * 2 - 1) * rule.detune : 0) + pitch * 100;
    const rate = cents ? Math.pow(2, cents / 1200) : 1;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = rule.gain;
    src.connect(gain);
    gain.connect(sfxBus);
    src.start(now, entry.offset);
    const v: Voice = { src, gain, end: now + (entry.buf.duration - entry.offset) / rate };
    list.push(v);
    lastStart.set(name, now);
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    if (rule.duck != null && cur) duck(rule.duck, rule.duckFor ?? 0.5);
  }

  /* ---------------- public ---------------- */
  const engine: AudioEngine = {
    unlock() {
      try {
        if (!create() || !ctx) return;
        tryResume();
        // Classic iOS unlock: play a 1-sample silent buffer inside the gesture.
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
        src.onended = () => src.disconnect();
        if (wanted && (!cur || cur.track !== wanted)) requestTrack(wanted);
      } catch {
        /* ignore */
      }
    },
    setMuted(m) {
      muted = m;
      if (!ctx || !master) return;
      const p = master.gain;
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
      if (!BGM[track]) return;
      if (wanted === track && (!ctx || (cur && cur.track === track))) return;
      wanted = track;
      if (cur && cur.track === track) return;
      try {
        requestTrack(track);
      } catch {
        /* ignore */
      }
    },
    stopBgm() {
      wanted = null;
      if (!ctx || !cur) return;
      const old = cur;
      cur = null;
      try {
        fadeOutAndStop(old, STOP_FADE);
      } catch {
        /* ignore */
      }
    },
    sfx(name, pitch) {
      // Skip when muted (saves CPU) or not running (would burst on resume).
      if (!ctx || muted || paused || ctx.state !== 'running') return;
      try {
        playSfx(name, pitch);
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
      // Compensate output latency so the beat matches what is heard.
      const raw = (ctx as AudioContext & { outputLatency?: number }).outputLatency;
      const lat = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(0.2, Math.max(0, raw)) : 0;
      return Math.max(0, ((ctx.currentTime - lat - cur.t0) * cur.bpm) / 60);
    },
    get bpm() {
      if (cur) return cur.bpm;
      return wanted ? BGM[wanted].bpm : 120;
    },
  };
  // Introspection for dev harnesses / Playwright checks (not part of AudioEngine).
  Object.defineProperty(engine, '__debug', {
    value: () => ({
      decoded: [...bgmBuf.keys()],
      raw: (Object.keys(BGM) as BgmTrack[]).filter((t) => raw.has(BGM[t].file)),
      playing: cur?.track ?? null,
      wanted,
      queue: [...jobs],
      decoding,
    }),
  });
  return engine;
}
