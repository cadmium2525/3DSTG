/**
 * Stage 1 timeline, boss phases and scoring — all gameplay tuning lives here.
 * Times are seconds from the start of play.
 */
import type { PatternId } from '../core/types';

export type EnemyKind = 'petal' | 'crystal' | 'lantern';
export type Formation = 'line' | 'v' | 'arc' | 'columns' | 'center';

export interface EnemyKindDef {
  hp: number;
  score: number;
  /** Visual scale and generous hit radius (world units). */
  scale: number;
  hitRadius: number;
  /** Instance tint (linear RGB-ish, multiplied into the emissive). */
  color: number;
}

export const ENEMY_KINDS: Record<EnemyKind, EnemyKindDef> = {
  petal: { hp: 12, score: 100, scale: 1.25, hitRadius: 1.9, color: 0xff6fb5 },
  crystal: { hp: 18, score: 200, scale: 1.45, hitRadius: 2.1, color: 0x4fe8ff },
  lantern: { hp: 170, score: 1500, scale: 2.6, hitRadius: 3.2, color: 0xffd166 },
};

export interface WaveEvent {
  t: number;
  type: 'wave';
  formation: Formation;
  kind: EnemyKind;
  count: number;
  /** -1 = enter from the left, 1 = right, 0 = from the depths straight ahead. */
  side: -1 | 0 | 1;
  /** Seconds each enemy hovers at its station before leaving. */
  stay: number;
  /** Seconds between aimedBurst volleys while hovering. */
  fireEvery: number;
  intensity: number;
}

/** A lantern carrier that introduces one boss pattern at low intensity. */
export interface IntroEvent {
  t: number;
  type: 'intro';
  pattern: PatternId;
  duration: number;
  intensity: number;
  sub: string;
}

export interface MarkerEvent {
  t: number;
  /** 'midboss': the stage timeline pauses until the mid-boss is defeated or escapes. */
  type: 'announce' | 'warning' | 'midboss' | 'boss';
  text?: string;
  sub?: string;
}

export type StageEvent = WaveEvent | IntroEvent | MarkerEvent;

export const STAGE_EVENTS: StageEvent[] = [
  { t: 0.4, type: 'announce', text: 'STAGE 1', sub: '星海ダイブ' },
  { t: 2.0, type: 'wave', formation: 'line', kind: 'petal', count: 5, side: -1, stay: 4.0, fireEvery: 1.8, intensity: 0.3 },
  { t: 5.0, type: 'wave', formation: 'v', kind: 'petal', count: 5, side: 0, stay: 4.0, fireEvery: 1.6, intensity: 0.32 },
  { t: 8.0, type: 'intro', pattern: 'rippleRing', duration: 4.5, intensity: 0.25, sub: 'リングの隙間をくぐれ' },
  { t: 9.5, type: 'wave', formation: 'columns', kind: 'crystal', count: 4, side: 1, stay: 3.5, fireEvery: 1.7, intensity: 0.32 },
  { t: 13.0, type: 'wave', formation: 'arc', kind: 'petal', count: 6, side: 0, stay: 4.0, fireEvery: 1.5, intensity: 0.36 },
  { t: 16.0, type: 'intro', pattern: 'constellationRain', duration: 5.0, intensity: 0.25, sub: '星の線を見切れ' },
  { t: 17.5, type: 'wave', formation: 'line', kind: 'crystal', count: 5, side: 1, stay: 3.5, fireEvery: 1.6, intensity: 0.36 },
  // Mid-boss: stage time stops here until it is defeated or flies away (see MIDBOSS).
  { t: 23.0, type: 'midboss' },
  { t: 24.2, type: 'wave', formation: 'v', kind: 'petal', count: 7, side: 0, stay: 3.5, fireEvery: 1.4, intensity: 0.4 },
  { t: 27.2, type: 'wave', formation: 'columns', kind: 'crystal', count: 6, side: -1, stay: 3.0, fireEvery: 1.4, intensity: 0.42 },
  { t: 30.2, type: 'wave', formation: 'arc', kind: 'crystal', count: 7, side: 0, stay: 3.0, fireEvery: 1.3, intensity: 0.44 },
  { t: 34.5, type: 'warning' },
  { t: 37.5, type: 'boss' },
];

/** Time to jump to when skipping to the boss (debug). */
export const BOSS_SKIP_T = 34.5;
/** Time to jump to when skipping to the mid-boss (debug). */
export const MIDBOSS_SKIP_T = 23.0;

export interface MidBossPhaseDef {
  patterns: { id: PatternId; intensity: number }[];
  /** Phase ends when hp (0..1) falls to this value… */
  hpEnd: number;
  /** …or after this many seconds (last phase: timeout = the mid-boss escapes, no bonus). */
  timeout: number;
  /** Spell name shown in the HUD bar / banner. */
  name: string;
}

export const MIDBOSS = {
  name: '硝子蝶 ルクシア',
  sub: 'MID BOSS — 夜をわたる硝子の翅',
  /** ×1.075 since shot power exists (Lv1 still just breaks each phase in time; Lv2–3, the usual, is a bit faster). */
  maxHp: 430,
  /** Fly-in (invulnerable for the first ~60%). */
  enterSec: 2.4,
  /** Pause between the two phases (bullets cleared). */
  breatherSec: 1.1,
  deathSec: 1.5,
  position: { x: 0, y: 1.6, z: -54 },
  /** Sway around `position` while fighting. */
  swayX: 3.2,
  swayY: 0.7,
  swayZ: 3.5,
  hitRadius: 4.6,
  phases: [
    {
      name: '胡蝶の羽ばたき',
      patterns: [
        { id: 'wingSweep', intensity: 0.3 },
        { id: 'aimedBurst', intensity: 0.28 },
      ],
      hpEnd: 0.5,
      timeout: 8,
    },
    {
      name: '胡蝶の羽ばたき・乱',
      patterns: [
        { id: 'wingSweep', intensity: 0.65 },
        { id: 'aimedBurst', intensity: 0.5 },
      ],
      hpEnd: 0,
      timeout: 9,
    },
  ] as MidBossPhaseDef[],
};

export interface BossPhaseDef {
  patterns: { id: PatternId; intensity: number }[];
  /** Phase ends when hp (0..1) falls to this value… */
  hpEnd: number;
  /** …or after this many seconds. */
  timeout: number;
}

export const BOSS = {
  name: '星環の花冠 アストルム',
  /** ×1.3 since shot power Lv1..4 exists (Lv1 = the old DPS, see SHOT_LEVELS). */
  maxHp: 1090,
  /** Seconds the boss takes to fly in (invulnerable). */
  enterSec: 3.0,
  /** Breather between phases (bullets cleared, invulnerable). */
  breatherSec: 2.2,
  /** Seconds of the death explosion before the result. */
  deathSec: 2.6,
  position: { x: 0, y: 1.0, z: -62 },
  hitRadius: 6.5,
  phases: [
    { patterns: [{ id: 'spiralCorridor', intensity: 0.5 }], hpEnd: 0.68, timeout: 14 },
    { patterns: [{ id: 'petalBloom', intensity: 0.55 }], hpEnd: 0.36, timeout: 15 },
    {
      patterns: [
        { id: 'rippleRing', intensity: 0.45 },
        { id: 'constellationRain', intensity: 0.45 },
      ],
      hpEnd: 0,
      timeout: 20,
    },
  ] as BossPhaseDef[],
};

export const SCORE = {
  /** Per shot that hits the boss. */
  bossHit: 10,
  /** Per bullet removed by a phase break / bomb (paid out through the star items it turns into). */
  bulletCancel: 10,
  phaseBreak: 5000,
  bossKill: 30000,
  /** Mid-boss: per shot that hits, phase break, kill bonus (no bonus when it escapes). */
  midBossHit: 10,
  midBossPhaseBreak: 2000,
  midBossKill: 10000,
  /** Clear bonus per remaining life, plus a no-miss bonus. */
  lifeBonus: 10000,
  noMissBonus: 20000,
  /** Graze: base + chain * step (chain = grazes within chainWindow, capped). */
  grazeBase: 30,
  grazeChainStep: 10,
  grazeChainCap: 20,
  grazeChainWindow: 1.5,
  /** Graze multiplier while the boss is active (denser = riskier). */
  grazeBossMul: 1.5,
  /** Graze multiplier when NOT in slow mode (moving fast near bullets = riskier). */
  grazeFastMul: 1.25,
};

export const SHOT = {
  /** Volleys per second; each volley fires one shot per stream of the current power level. */
  rate: 14,
  speed: 115,
  /** Auto-aim: shots lock onto the target nearest the forward axis within this cone (tan of half-angle). */
  aimCone: 0.14,
  /** Homing turn rate (1/sec) toward a locked target. */
  homing: 5,
};

/** One shot stream: muzzle x offset, lateral spread (fan / offset at the locked target), outer = gold tint. */
export interface ShotStream {
  x: number;
  spread: number;
  outer?: boolean;
}

/**
 * Shot power Lv1..4. DPS on one target = streams × damage × SHOT.rate:
 * Lv1 28 (the pre-power balance), Lv2 33.6 (×1.2), Lv3 39.2 (×1.4), Lv4 46.2 (×1.65).
 * Boss / mid-boss HP is ×1.3, so Lv3 ≈ the old fight length, Lv1 ≈ ×1.3, Lv4 ≈ ×0.8.
 */
export const SHOT_LEVELS: { damage: number; streams: ShotStream[] }[] = [
  { damage: 1, streams: [{ x: -0.2, spread: -1 }, { x: 0.2, spread: 1 }] },
  { damage: 0.8, streams: [{ x: -0.22, spread: -1 }, { x: 0, spread: 0 }, { x: 0.22, spread: 1 }] },
  { damage: 0.7, streams: [{ x: -0.16, spread: -0.6 }, { x: 0.16, spread: 0.6 }, { x: -0.42, spread: -2.4, outer: true }, { x: 0.42, spread: 2.4, outer: true }] },
  {
    damage: 0.66,
    streams: [
      { x: 0, spread: 0 }, { x: -0.22, spread: -0.9 }, { x: 0.22, spread: 0.9 },
      { x: -0.5, spread: -3.2, outer: true }, { x: 0.5, spread: 3.2, outer: true },
    ],
  },
];

export const POWER = {
  /** Orbs (光の玉) needed for Lv1→2, Lv2→3, Lv3→4 (36 in total). */
  perLevel: [8, 12, 16],
  /** On a miss: orbs lost (about one level, never below Lv1) and how many of them fly out to re-collect. */
  missLoss: 12,
  missScatter: 5,
  /** Score per orb collected at max power. */
  maxBonus: 1000,
};

/** Item drops (star fragments = score, orbs of light = power). */
export const ITEMS = {
  /** Star value at graze chain 0; × (1 + chain × chainBonus) at pickup (chain capped by SCORE.grazeChainCap → ×3). */
  starValue: 60,
  chainBonus: 0.1,
  /** Per enemy kind: stars dropped and power orbs (fractional = accumulated across kills). */
  drops: {
    petal: { stars: 2, power: 0.5 },
    crystal: { stars: 3, power: 0.6 },
    lantern: { stars: 8, power: 4 },
  } as Record<EnemyKind, { stars: number; power: number }>,
  bossPhase: { stars: 12, power: 4 },
  midBossPhase: { stars: 8, power: 3 },
  /** Mid-boss defeat: guaranteed big power burst. */
  midBossKill: { stars: 16, power: 10 },
  /** Seconds items spawned after a phase break / bomb keep homing to the player. */
  magnetSec: 1.2,
  /** Pickup / attraction radius on the play plane (attraction bigger in slow mode). */
  pickupRadius: 0.62,
  attractRadius: 1.9,
  attractRadiusSlow: 2.8,
  /** While the heroine is above this y every item homes to her (upper "collection line"). */
  collectLineY: 2.2,
};

export const BOMB = {
  /** Stock at the start, and the refill after every miss. */
  stock: 2,
  /** Player invincibility from the bomb (no blink). */
  invincibleSec: 2.5,
  /** Seconds the barrier keeps clearing bullets (its clear radius sweeps out to the enemies meanwhile). */
  clearSec: 1.5,
  /** Damage ticks (seconds after the start) to every small enemy and to the boss / mid-boss. */
  ticks: [0.12, 0.55],
  enemyDamage: 30,
  bossDamage: 22,
  /** 決死ボム: seconds after a hit during which the bomb cancels it (world runs in slow motion meanwhile). */
  deathbombWindow: 0.25,
  deathbombTimeScale: 0.3,
};
