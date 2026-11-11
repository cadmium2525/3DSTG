/**
 * BLOOM DIVE — module contracts.
 * Every module is written against these interfaces. Do not change this file
 * without telling the integrator; add module-private types in your own folder.
 */
import type * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Danmaku (enemy bullets)                    src/danmaku/index.ts     */
/* ------------------------------------------------------------------ */

export type PatternId =
  | 'spiralCorridor' // 螺旋回廊: rotating double helix, follow the rotating gap
  | 'petalBloom' // 花弁の開花: radial petals that open/close
  | 'rippleRing' // 波紋リング: concentric rings with a gap
  | 'constellationRain' // 星座の雨: bullets laid along curves
  | 'aimedBurst'; // simple aimed shots for small enemies

export const PATTERN_NAMES: Record<PatternId, string> = {
  spiralCorridor: '螺旋回廊',
  petalBloom: '花弁の開花',
  rippleRing: '波紋リング',
  constellationRain: '星座の雨',
  aimedBurst: '狙い弾',
};

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface PatternOptions {
  /** Emitter position, sampled every time bullets are emitted (so it can follow a moving enemy). */
  origin: () => Vec3Like;
  /** Seconds the emitter keeps firing. Bullets already in flight live on. */
  duration: number;
  /** 0..1 difficulty knob (density / speed). 0.5 = normal. */
  intensity?: number;
  /** Deterministic variation. */
  seed?: number;
}

export interface PatternHandle {
  /** Stop emitting (bullets in flight are kept). */
  stop(): void;
  /** True once the emitter finished or was stopped. */
  readonly done: boolean;
}

export interface DanmakuFrameResult {
  /** True if a bullet touched the lethal hit sphere this frame. */
  hit: boolean;
  /** Number of bullets that newly entered the graze sphere this frame (each bullet counts once). */
  grazes: number;
}

export interface Danmaku {
  /** Add this to the scene (bullets, glow, approach markers...). */
  readonly object3d: THREE.Object3D;
  readonly activeCount: number;
  startPattern(id: PatternId, opts: PatternOptions): PatternHandle;
  /** Stop every running emitter. */
  stopAllPatterns(): void;
  /**
   * Advance emitters + bullets and test against the player.
   * @param collide when false (invincible / dead) no hit is reported, grazes neither.
   */
  update(dt: number, player: Vec3Like, collide: boolean): DanmakuFrameResult;
  /** Remove all bullets within `radius` of `center` (all bullets when omitted). Returns removed count. */
  clear(center?: Vec3Like, radius?: number): number;
  /** 0 = low, 1 = mid, 2 = high. Lower quality = fewer bullets emitted / cheaper effects. */
  setQuality(level: 0 | 1 | 2): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Heroine model                              src/character/Heroine.ts */
/* ------------------------------------------------------------------ */

export interface HeroineMotion {
  /** Normalised lateral / vertical velocity, roughly -1..1. Drives banking, hair and skirt sway. */
  vx: number;
  vy: number;
  /** Seconds remaining of post-hit invincibility (model blinks while > 0). */
  invincible?: number;
}

/* ------------------------------------------------------------------ */
/* Save / settings                            src/save.ts              */
/* ------------------------------------------------------------------ */

export interface Settings {
  muted: boolean;
  /** 低速移動 toggle. */
  slowMode: boolean;
  /** Drag sensitivity multiplier, 0.5..2. */
  sensitivity: number;
  quality: 'auto' | 'low' | 'high';
}

export interface SaveStore {
  readonly settings: Settings;
  readonly hiScore: number;
  /** Returns true when it is a new record. */
  submitScore(score: number): boolean;
  /** Persist current settings (call after mutating `settings`). */
  saveSettings(): void;
}

/* ------------------------------------------------------------------ */
/* UI (DOM overlay)                           src/ui/index.ts          */
/* ------------------------------------------------------------------ */

export interface HudData {
  score: number;
  hiScore: number;
  lives: number;
  graze: number;
  /** null when no boss is present. hp is 0..1. */
  boss: null | { name: string; hp: number; pattern?: string };
}

export interface ResultData {
  cleared: boolean;
  score: number;
  hiScore: number;
  newRecord: boolean;
  graze: number;
  timeSec: number;
  livesLeft: number;
}

export interface UiCallbacks {
  /** Title "start" pressed. Always called inside a user gesture (so audio can be unlocked). */
  onStart(): void;
  onRetry(): void;
  onBackToTitle(): void;
  /** Pause button / resume button. */
  onPause(paused: boolean): void;
  /** Any setting changed (already written to SaveStore). */
  onSettingsChanged(): void;
}

export interface GameUI {
  showTitle(hiScore: number): void;
  /** Hide title/result, show the in-game HUD. */
  showHud(): void;
  updateHud(d: HudData): void;
  showResult(r: ResultData): void;
  setPaused(paused: boolean): void;
  /** Short centre banner, e.g. boss name / pattern name. */
  announce(text: string, sub?: string): void;
  /** Screen flash when the player is hit. */
  flashDamage(): void;
  /** Small floating feedback such as "GRAZE". */
  pulseGraze(): void;
}

/* ------------------------------------------------------------------ */
/* Audio (Web Audio, fully synthesised)       src/audio/index.ts       */
/* ------------------------------------------------------------------ */

export type SfxName =
  | 'shot'
  | 'enemyHit'
  | 'enemyDown'
  | 'graze'
  | 'playerHit'
  | 'bossWarning'
  | 'bossDown'
  | 'uiTap'
  | 'clear'
  | 'gameOver';

export type BgmTrack = 'title' | 'stage' | 'boss';

export interface AudioEngine {
  /** Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void;
  setMuted(muted: boolean): void;
  playBgm(track: BgmTrack): void;
  stopBgm(): void;
  sfx(name: SfxName): void;
  /** Suspend / resume with page visibility or pause. */
  setPaused(paused: boolean): void;
  /** Beats elapsed since the current BGM started (float), 0 when silent. For beat-synced patterns. */
  readonly beat: number;
  readonly bpm: number;
}
