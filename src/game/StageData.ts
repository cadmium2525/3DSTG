/**
 * Global gameplay tuning shared by every stage: scoring, shot / power levels, items, bomb.
 * Stage-specific data (timeline, enemy kinds, mid-boss / boss configs, background) lives in
 * src/game/stages/ (see docs/ADDING_A_STAGE.md).
 */
export type { WaveEvent, IntroEvent, MarkerEvent, SceneryEvent, StageEvent } from './stages/types';
export type { BossPhaseDef, BossConfig } from './bosses/BossLike';

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
  /** Stage-clear tally: bonus per remaining life, plus a bonus when the stage had no miss. */
  lifeBonus: 10000,
  noMissBonus: 20000,
  /** Stage-clear tally: flat clear bonus × stage number. */
  stageClearBonus: 10000,
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
  /* Small-enemy drops are per kind: EnemyKindDef.drops (src/game/enemies/registry.ts). */
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
