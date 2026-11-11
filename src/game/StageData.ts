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
  maxHp: 400,
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
  maxHp: 840,
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
  /** Per bullet removed when a phase breaks. */
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
  /** Volleys per second; each volley fires 2 shots. */
  rate: 14,
  speed: 115,
  damage: 1,
  /** Auto-aim: shots lock onto the target nearest the forward axis within this cone (tan of half-angle). */
  aimCone: 0.14,
  /** Homing turn rate (1/sec) toward a locked target. */
  homing: 5,
};
