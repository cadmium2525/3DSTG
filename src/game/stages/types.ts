/**
 * Data model of a stage. One `StageDef` per stage (src/game/stages/stageN/index.ts), listed in
 * the registry (src/game/stages/index.ts). Game.ts runs whatever the def says: background
 * preset, BGM, the event timeline, the mid-boss and boss factories and their configs.
 */
import type { BgmTrack, GameMode, PatternId } from '../../core/types';
import type { BackgroundPreset } from '../Background';
import type { BossSlot } from '../bosses/BossLike';
import type { SCORE } from '../StageData';

/* ------------------------------------------------------------------ */
/* Difficulty (normal = all 1; hard = docs/STAGES.md「ハードモード」)      */
/* ------------------------------------------------------------------ */

export type { GameMode };

export interface Difficulty {
  id: GameMode;
  /** Multiplies every pattern intensity (enemies, intros, bosses), clamped to 1. */
  bullet: number;
  /** Multiplies small-enemy HP. */
  enemyHp: number;
  /** Multiplies boss / mid-boss maxHp. */
  bossHp: number;
  /** Multiplies WaveEvent.fireEvery (< 1 = small enemies fire more often). */
  fireRate: number;
  /** Multiplies every boss / mid-boss phase timeout. */
  timeout: number;
  /** Multiplies every score gain (shots, grazes, items, bonuses). */
  scoreMul: number;
  /** 決死ボム window in real seconds (normal = BOMB.deathbombWindow). */
  deathbombSec: number;
  /** Multiplies the item attraction radius (normal and slow). */
  attract: number;
  /** Apply the hard-only content: `hard` blocks on phases / waves, `hardOnly` events. */
  extraLayers: boolean;
}

export const DIFFICULTY: Record<GameMode, Difficulty> = {
  normal: { id: 'normal', bullet: 1, enemyHp: 1, bossHp: 1, fireRate: 1, timeout: 1, scoreMul: 1, deathbombSec: 0.25, attract: 1, extraLayers: false },
  hard: { id: 'hard', bullet: 1.3, enemyHp: 1.2, bossHp: 1.3, fireRate: 0.75, timeout: 1.15, scoreMul: 1.5, deathbombSec: 0.15, attract: 0.85, extraLayers: true },
};

export function isGameMode(v: unknown): v is GameMode {
  return v === 'normal' || v === 'hard';
}

export function scaleIntensity(i: number, d: Difficulty): number {
  return Math.min(1, Math.max(0, i * d.bullet));
}

/** Hard-only additions shared by every event type. */
interface EventFlags {
  /** Only in modes with Difficulty.extraLayers (hard). */
  hardOnly?: boolean;
}

/**
 * The timeline as played at difficulty `d`: drops `hardOnly` events unless d.extraLayers, and
 * merges each wave's `hard` overrides (e.g. `hard: { count: 7 }`) when d.extraLayers.
 * fireEvery × d.fireRate is applied by Enemies at spawn time.
 */
export function eventsFor(events: readonly StageEvent[], d: Difficulty): StageEvent[] {
  if (!d.extraLayers) return events.filter((e) => !e.hardOnly);
  return events.map((e) => (e.type === 'wave' && e.hard ? { ...e, ...e.hard } : e));
}

/* ------------------------------------------------------------------ */
/* Timeline events (seconds from the start of the stage)               */
/* ------------------------------------------------------------------ */

export interface WaveEvent extends EventFlags {
  t: number;
  type: 'wave';
  /** A registered formation id (src/game/enemies/registry.ts: line, v, arc, columns, center, sides, diagonal, scatter, …). */
  formation: string;
  /** A registered enemy kind id. */
  kind: string;
  count: number;
  /** -1 = enter from the left, 1 = right, 0 = from the depths straight ahead. */
  side: -1 | 0 | 1;
  /** Seconds each enemy hovers at its station before leaving (path / streak kinds: flight time). */
  stay: number;
  /** Seconds between volleys while hovering (kinds with a `fire` script). */
  fireEvery: number;
  intensity: number;
  /** Seconds between members entering (default 0.14). */
  delayStep?: number;
  /** Never fire (decorative / lull waves). */
  quiet?: boolean;
  /** Formation offset / mirror (formation-specific; e.g. diagonal: 1 = from the right). */
  x?: number;
  y?: number;
  /** Hard mode overrides of this wave (merged when Difficulty.extraLayers), e.g. `{ count: 7 }`. */
  hard?: Partial<Omit<WaveEvent, 't' | 'type' | 'hard' | 'hardOnly'>>;
}

/** A lantern carrier that introduces one boss pattern at low intensity. */
export interface IntroEvent extends EventFlags {
  t: number;
  type: 'intro';
  pattern: PatternId;
  duration: number;
  intensity: number;
  sub: string;
  /** Carrier kind (default 'lantern'). */
  kind?: string;
}

export interface MarkerEvent extends EventFlags {
  t: number;
  /**
   * 'announce': centre banner. 'warning': enemies retreat, WARNING banner, boss BGM starts.
   * 'midboss': the stage timeline pauses until the mid-boss is defeated or escapes.
   * 'boss': the boss appears (the timeline ends here).
   */
  type: 'announce' | 'warning' | 'midboss' | 'boss';
  text?: string;
  sub?: string;
}

/** Pure decoration handled by the Background (e.g. a shower of shooting stars during a lull). */
export interface SceneryEvent extends EventFlags {
  t: number;
  type: 'scenery';
  /** 'starfall' is built in; presets may handle more through their layers. */
  name: string;
  duration: number;
}

export type StageEvent = WaveEvent | IntroEvent | MarkerEvent | SceneryEvent;

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

export type ScoreTable = typeof SCORE;

export interface StageDef {
  /** Stable id ('stage1', …). */
  id: string;
  /** 1-based stage number (shown as "STAGE N"). */
  number: number;
  /** Banner title / subtitle, e.g. '星海' / 'STAR SEA'. */
  title: string;
  subtitle: string;
  /** True while the stage only reuses another stage's content (shown in the tally). */
  placeholder?: boolean;
  bgm: { stage: BgmTrack; midboss: BgmTrack; boss: BgmTrack };
  background: BackgroundPreset;
  /** Timeline, sorted by t. Must contain one 'boss' event; at most one 'midboss'. */
  events: StageEvent[];
  /** Enemy kinds the timeline uses (checked against the registry in dev builds). */
  enemyKinds: string[];
  midBoss?: BossSlot;
  boss: BossSlot;
  /** WARNING banner subtitle. */
  warningText?: string;
  /** Overrides of the global SCORE table for this stage. */
  score?: Partial<ScoreTable>;
  /** Shot power level used when a run starts directly at this stage (?stage=N). */
  startPower?: number;
}
