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
  | 'aimedBurst' // simple aimed shots for small enemies
  | 'wingSweep' // 胡蝶の羽ばたき: mirrored wing-edge walls sweeping in/out, thread the drifting gap (mid-boss)
  | 'cometTrail' // 彗星の尾: slow single bullets landing along a streaking comet's on-screen path (stage 1 enemy)
  // --- stage 2 「黄昏の境界」 (src/danmaku/stage2.ts; warm + shadow bullets) ---
  | 'mothDust' // 光蛾の鱗粉: aimed 3-way + a straddling follow-up pair (moth)
  | 'wispSpread' // 鬼火の散弾: bowed aimed spread of shadow bullets (wisp)
  | 'shardRing' // 夕陽の欠片: small ring(s) where a sunset shard bursts
  | 'lanternDrift' // 灯籠流し: slow lanterns that burst mid-flight into slow rings (mid-boss ランテルナ)
  | 'flickerCurtain' // 揺らぐ灯: wavering curtains, lit / unlit waves land in each other's gaps (mid-boss)
  | 'coronaRays' // 日輪の光条: rotating corona spokes, rotation breathes and reverses (boss エクリプス)
  | 'twilightLattice' // 黄昏の格子: light lattice then shadow lattice on its holes (boss)
  | 'crescentSweep' // 蝕の三日月: filled crescents orbiting the field, waxing and waning (boss)
  | 'totalEclipse' // 皆既日蝕: moon disc on the player, then corona rings burst outward (boss final)
  // --- stage 3 「深淵」 (src/danmaku/stage3.ts; dark bullets) ---
  | 'shadowShot' // 影の礫: aimed fan of dark bullets (shadow shards)
  | 'shadowGrasp' // 影の手: claw of finger lines reaching in from the hand's edge, slip between fingers
  | 'shadowBloom' // 影の花: small dark petal bloom at the mirror image of the flower's position
  | 'shadowSlash' // 影の剣閃: blade arcs swept across the field, cross behind the blade (mid-boss ノクス)
  | 'blackShield' // 黒鎧の陣: rotating rings of shield plates (mid-boss ノクス)
  | 'shadowMimic' // 影の模倣: the heroine's shot fan as dark needle lanes that track her (boss)
  | 'shadowEcho' // 写し身の弾幕: stage-1 patterns replayed mirrored in shadow colours (boss)
  | 'shadowBarrier' // 影の結界: hexagon shells closing in, then a honeycomb seal (boss)
  | 'lightEater' // 光喰い: dark spiral arms turning around a hub that follows her (boss)
  | 'lightShadowHelix' // 光と影の螺旋: counter-curled light and shadow arms, a rotating lattice (final spell)
  | 'shadowProbe' // (internal) never fires; lets the shadow girl know where the heroine is
  | 'jellyRing'; // 星海月の輪: one small ring around the player (stage 1 enemy)

export const PATTERN_NAMES: Record<PatternId, string> = {
  spiralCorridor: '螺旋回廊',
  petalBloom: '花弁の開花',
  rippleRing: '波紋リング',
  constellationRain: '星座の雨',
  aimedBurst: '狙い弾',
  wingSweep: '胡蝶の羽ばたき',
  cometTrail: '彗星の尾',
  mothDust: '光蛾の鱗粉',
  wispSpread: '鬼火の散弾',
  shardRing: '夕陽の欠片',
  lanternDrift: '灯籠流し',
  flickerCurtain: '揺らぐ灯',
  coronaRays: '日輪の光条',
  twilightLattice: '黄昏の格子',
  crescentSweep: '蝕の三日月',
  totalEclipse: '皆既日蝕',
  shadowShot: '影の礫',
  shadowGrasp: '影の手',
  shadowBloom: '影の花',
  shadowSlash: '影の剣閃',
  blackShield: '黒鎧の陣',
  shadowMimic: '影の模倣',
  shadowEcho: '写し身の弾幕',
  shadowBarrier: '影の結界',
  lightEater: '光喰い',
  lightShadowHelix: '光と影の螺旋',
  shadowProbe: '',
  jellyRing: '星海月の輪',
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

export type BulletClearedFn = (x: number, y: number, z: number) => void;

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
  /**
   * Remove all bullets within `radius` of `center` (all bullets when omitted). Returns removed count.
   * `onCleared` is called with the position of every removed bullet (e.g. to turn it into an item).
   */
  clear(center?: Vec3Like, radius?: number, onCleared?: BulletClearedFn): number;
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
  /** Bombs (光の結界) in stock. */
  bombs: number;
  /** Shot power level 1..4 and progress toward the next level 0..1 (1 at max). */
  power: number;
  powerProgress: number;
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
  /** Every stage cleared (final result after the ending). */
  allClear?: boolean;
  /** Per-stage breakdown (cleared stages, plus the one the run ended in). */
  stages?: StageResult[];
}

export interface StageResult {
  number: number;
  title: string;
  /** Score earned in this stage (including its clear bonus). */
  score: number;
  cleared: boolean;
}

/** Stage-clear tally shown between stages. */
export interface StageClearData {
  stage: number;
  title: string;
  /** Score earned in the stage before the bonus. */
  stageScore: number;
  graze: number;
  /** Star fragments / orbs of light collected in the stage. */
  stars: number;
  orbs: number;
  /** Bonus lines (already added to `total`). */
  bonus: { label: string; value: number }[];
  /** Run score after the bonus. */
  total: number;
  /** True when the stage is a placeholder (reuses stage 1 content). */
  placeholder?: boolean;
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
  /** Bomb button pressed (during play). */
  onBomb(): void;
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
  /** Big stage title card ("STAGE 2" / 黄昏の境界 / TWILIGHT BORDER), fades by itself. */
  stageTitle(stage: number, title: string, subtitle: string): void;
  /** Stage-clear tally panel (non-modal; the game keeps running behind it). */
  showStageClear(d: StageClearData): void;
  hideStageClear(): void;
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
  | 'midbossDown'
  | 'bossDown'
  | 'uiTap'
  | 'clear'
  | 'gameOver'
  | 'itemScore'
  | 'itemPower'
  | 'powerUp'
  | 'bomb';

export type BgmTrack =
  | 'title'
  | 'stage'
  | 'midboss'
  | 'boss'
  | 'stage2'
  | 'midboss2'
  | 'boss2'
  | 'stage3'
  | 'midboss3'
  | 'boss3'
  | 'ending';

export interface AudioEngine {
  /** Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void;
  setMuted(muted: boolean): void;
  playBgm(track: BgmTrack): void;
  stopBgm(): void;
  /** @param pitch optional pitch offset in semitones (e.g. item pickups rising with the graze chain). */
  sfx(name: SfxName, pitch?: number): void;
  /** Suspend / resume with page visibility or pause. */
  setPaused(paused: boolean): void;
  /** Beats elapsed since the current BGM started (float), 0 when silent. For beat-synced patterns. */
  readonly beat: number;
  readonly bpm: number;
}
