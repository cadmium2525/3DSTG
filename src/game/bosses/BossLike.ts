/**
 * Pluggable boss / mid-boss contract. A stage references a boss through a factory
 * (`StageDef.boss.create(ctx)`), so new boss classes live in their own files
 * (src/game/stages/stageN/*.ts) and Game.ts never needs to know them.
 *
 * Most bosses should extend `PhasedBoss` (src/game/bosses/PhasedBoss.ts), which already
 * implements the whole phase state machine below — a subclass only adds visuals and motion.
 */
import type * as THREE from 'three';
import type { BulletClearedFn, Danmaku, PatternId } from '../../core/types';
import type { Effects } from '../Effects';
import type { Rng } from '../Rng';
import type { Targets } from '../Shots';
import type { Difficulty } from '../stages/types';

export enum BossState { Off, Enter, Phase, Breather, Dying, Escape, Done }

export interface BossPhaseDef {
  /** Spell name for the HUD bar / banner. Defaults to the joined PATTERN_NAMES of `patterns`. */
  name?: string;
  /** Patterns run in parallel for the whole phase (re-armed if one finishes early). */
  patterns: { id: PatternId; intensity: number }[];
  /** Phase ends when hp (0..1) falls to this value… */
  hpEnd: number;
  /** …or after this many seconds (last phase: timeout = the boss escapes, no kill bonus). Scaled by Difficulty.timeout. */
  timeout: number;
  /**
   * Hard-only additions (used when Difficulty.extraLayers): extra pattern layers run in parallel
   * with `patterns` (their intensities are scaled by Difficulty.bullet like every other pattern),
   * and an optional spell-name override.
   */
  hard?: BossPhaseHard;
}

export interface BossPhaseHard {
  patterns?: { id: PatternId; intensity: number }[];
  name?: string;
  /**
   * Bullet multiplier for this phase's normal `patterns` instead of Difficulty.bullet (e.g. 1.1 for
   * a phase that already sits near the bullet-pool limit). The added `patterns` use Difficulty.bullet.
   */
  bullet?: number;
}

export interface BossConfig {
  name: string;
  /** Banner subtitle when it appears (default 'BOSS' / 'MID BOSS'). */
  sub?: string;
  /** Banner subtitle when the last phase times out and it leaves. */
  escapeText?: string;
  /** Shot damage to empty the whole bar (scaled by Difficulty.bossHp). */
  maxHp: number;
  /** Fly-in seconds (invulnerable; not targetable for the first 60 %). */
  enterSec: number;
  /** Pause between phases (bullets cleared, invulnerable). */
  breatherSec: number;
  /** Seconds of the death sequence before onDefeated. */
  deathSec: number;
  /** Home position while fighting. */
  position: { x: number; y: number; z: number };
  /** Generous shot hit radius (world units). */
  hitRadius: number;
  phases: BossPhaseDef[];
  /** Phase timed out: still turn its bullets into stars (boss: yes, mid-boss: no). Default false. */
  cancelOnTimeout?: boolean;
  /** Flash added per damaging shot (visual). Default 0.35. */
  hitFlash?: number;
  /** Z offset of the shot target point from `position`. Default 1. */
  targetZ?: number;
}

export interface BossEvents {
  onPhaseStart(index: number): void;
  /** broken = HP threshold reached (vs. timeout); cancelled = bullets removed. */
  onPhaseEnd(index: number, broken: boolean, cancelled: number): void;
  onDefeated(x: number, y: number, z: number): void;
  onEscaped(): void;
  onHit(x: number, y: number, z: number, damaged: boolean): void;
  /** Called for every bullet removed when a phase ends (bullets → star items). */
  onBulletCancel?: BulletClearedFn;
}

export interface BossContext<C extends BossConfig = BossConfig> {
  danmaku: Danmaku;
  effects: Effects;
  rng: Rng;
  events: BossEvents;
  config: C;
  difficulty: Difficulty;
  role: 'boss' | 'midboss';
}

export interface BossLike {
  /** Added to the scene by Game (hidden while Off/Done). */
  readonly group: THREE.Object3D;
  /** Current emitter / target position. */
  readonly position: THREE.Vector3;
  readonly config: BossConfig;
  readonly state: BossState;
  /** HP bar 0..1. */
  readonly hp: number;
  readonly phaseIndex: number;
  /** Not Off / Done. */
  readonly active: boolean;
  /** Start the fly-in (state → Enter). */
  spawn(): void;
  /** Back to Off, everything stopped and hidden. */
  reset(): void;
  update(dt: number): void;
  /** Push the shot target (id = slot given by Game) when targetable. */
  addTargets(t: Targets, id: number): void;
  /** Shot / bomb damage in shot units (ignored outside a phase, but onHit still fires). */
  damage(amount: number, x: number, y: number, z: number): void;
  /** Debug: drop HP to the current phase's threshold. Returns false when no phase is running. */
  forceBreak(): boolean;
  /** Player died: stop patterns, freeze the state machine (visuals keep animating). */
  freeze(): void;
  dispose(): void;
}

/**
 * The config a boss actually runs with at difficulty `d`: phase timeouts × d.timeout and, when
 * d.extraLayers, each phase's `hard` additions merged in (extra patterns appended after the
 * normal ones, so subclasses that look up a pattern by id keep working). Normal mode returns
 * `config` itself.
 */
export function resolveBossConfig<C extends BossConfig>(config: C, d: Difficulty): C {
  if (!d.extraLayers && d.timeout === 1) return config;
  return {
    ...config,
    phases: config.phases.map((p) => {
      const h = d.extraLayers ? p.hard : undefined;
      // scaleIntensity multiplies by d.bullet later; pre-scale so this phase ends up × h.bullet.
      const base = h?.bullet !== undefined ? p.patterns.map((x) => ({ ...x, intensity: (x.intensity * h.bullet!) / d.bullet })) : p.patterns;
      return {
        ...p,
        name: h?.name ?? p.name,
        patterns: h?.patterns ? [...base, ...h.patterns] : base,
        timeout: p.timeout * d.timeout,
      };
    }),
  };
}

export type BossFactory = (ctx: BossContext) => BossLike;

/** What a StageDef stores for its boss / mid-boss (build it with `defineBoss`). */
export interface BossSlot {
  config: BossConfig;
  create: BossFactory;
}

/** Typed helper: `defineBoss(MY_CONFIG, (ctx) => new MyBoss(ctx))` (ctx.config is typed as MY_CONFIG's type). */
export function defineBoss<C extends BossConfig>(config: C, create: (ctx: BossContext<C>) => BossLike): BossSlot {
  return { config, create: create as unknown as BossFactory };
}
