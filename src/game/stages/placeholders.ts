/**
 * PLACEHOLDER stages 2 and 3 — they reuse stage 1's timeline, enemies, mid-boss and boss so the
 * full 3-stage flow (tally → transition → next stage → ending → final result) can be played and
 * tested end to end. Only the titles, BGM ids and background presets are the real ones.
 *
 * The stage-2 / stage-3 workers replace these with src/game/stages/stage2/index.ts and
 * src/game/stages/stage3/index.ts (see docs/ADDING_A_STAGE.md) and swap the entry in
 * src/game/stages/index.ts. The background presets below are a starting point they may move.
 */
import { BG_STAR_SEA, type BackgroundPreset } from '../Background';
import { defineBoss } from '../bosses/BossLike';
import { AstrumBoss } from './stage1/AstrumBoss';
import { LuxiaMidBoss } from './stage1/LuxiaMidBoss';
import { STAGE1, STAGE1_BOSS, STAGE1_EVENTS, STAGE1_MIDBOSS } from './stage1';
import type { StageDef } from './types';

/** Stage 2 「黄昏の境界」: sunset orange sinking into indigo; a first hint of shadow at the edges. */
export const BG_TWILIGHT: BackgroundPreset = {
  ...BG_STAR_SEA,
  clear: 0x140a24,
  fog: 0x2a1430,
  fogNear: 60,
  fogFar: 175,
  stars: { colors: [0xffe6c8, 0xff9a4a, 0xff6f8a, 0x6a5be0, 0xffc36b], white: 0.45, density: 0.55, size: 0.5, speed: 7, gain: 0.9 },
  dust: { colors: [0xfff0dd, 0xffb070, 0xff7a90, 0x5a3a7a, 0xffd08a], white: 0.25, density: 0.85, size: 0.1, speed: 34, gain: 1 },
  nebula: { colors: [0xff8a3c, 0xff5f7a, 0x5a4bd0, 0x8a3c9a, 0xffb85a], glow: 0xffa860, glowAlpha: 0.42, intensity: 1.1, blobs: 52, seed: 2 },
  frame: { color: 0xff8a5a, opacity: 0.2 },
  light: {
    sky: 0xffb79a, ground: 0x1a1030, hemi: 1.0,
    key: 1.6, keyColor: 0xffe2c4,
    rimA: 1.2, rimAColor: 0xff9a4a,
    rimB: 0.9, rimBColor: 0x7a6bff,
  },
  darkness: 0.16,
  darkRadius: 0.42,
  darkColor: 0x0a0414,
  streakColor: 0xffd6a8,
};

/** Stage 3 「深淵」: no light at the bottom of the dark; only the heroine's surroundings are lit. */
export const BG_ABYSS: BackgroundPreset = {
  ...BG_STAR_SEA,
  clear: 0x020106,
  fog: 0x050310,
  fogNear: 40,
  fogFar: 140,
  stars: { colors: [0xb9b0ff, 0x6a4bd0, 0x3a2a7a, 0x8a3c9a, 0x4fe8ff], white: 0.3, density: 0.35, size: 0.45, speed: 6, gain: 0.6 },
  dust: { colors: [0xd8d0ff, 0x7a5bd0, 0x5a3a8a, 0xff6fb5, 0x9d6bff], white: 0.2, density: 0.6, size: 0.09, speed: 30, gain: 0.7 },
  nebula: { colors: [0x3a1a6a, 0x2a0a3a, 0x1a1a4a, 0x4a1a5a, 0x6a2a7a], glow: 0x5a3aa0, glowAlpha: 0.18, intensity: 0.55, blobs: 36, seed: 3 },
  frame: { color: 0x6a4bb0, opacity: 0.16 },
  light: {
    sky: 0x7a6bc0, ground: 0x05030a, hemi: 0.8,
    key: 1.5, keyColor: 0xf4f0ff,
    rimA: 1.0, rimAColor: 0x9d6bff,
    rimB: 0.6, rimBColor: 0xff6fb5,
  },
  darkness: 0.88,
  darkRadius: 0.19,
  darkColor: 0x020106,
  streakColor: 0xb9a8ff,
};

/** PLACEHOLDER — stage 1 content under the stage 2 title / BGM / background. */
export const STAGE2_PLACEHOLDER: StageDef = {
  ...STAGE1,
  id: 'stage2',
  number: 2,
  title: '黄昏の境界',
  subtitle: 'TWILIGHT BORDER',
  placeholder: true,
  bgm: { stage: 'stage2', midboss: 'midboss2', boss: 'boss2' },
  background: BG_TWILIGHT,
  events: STAGE1_EVENTS,
  midBoss: defineBoss({ ...STAGE1_MIDBOSS, name: '黄昏の灯守 ランテルナ（仮）', escapeText: 'ランテルナは夕闇へ消えた' }, (ctx) => new LuxiaMidBoss(ctx)),
  boss: defineBoss({ ...STAGE1_BOSS, name: '蝕む日輪 エクリプス（仮）', escapeText: '日輪は地平へ沈んだ' }, (ctx) => new AstrumBoss(ctx)),
  warningText: '沈む光の向こうから何かが来る',
  startPower: 2,
};

/** PLACEHOLDER — stage 1 content under the stage 3 title / BGM / background (with the darkness on). */
export const STAGE3_PLACEHOLDER: StageDef = {
  ...STAGE1,
  id: 'stage3',
  number: 3,
  title: '深淵',
  subtitle: 'THE ABYSS',
  placeholder: true,
  bgm: { stage: 'stage3', midboss: 'midboss3', boss: 'boss3' },
  background: BG_ABYSS,
  events: STAGE1_EVENTS,
  midBoss: defineBoss({ ...STAGE1_MIDBOSS, name: '影の騎士 ノクス（仮）', escapeText: 'ノクスは闇に溶けた' }, (ctx) => new LuxiaMidBoss(ctx)),
  boss: defineBoss({ ...STAGE1_BOSS, name: '影の少女（仮）', escapeText: '影は闇の底へ還った' }, (ctx) => new AstrumBoss(ctx)),
  warningText: '自分と同じ気配が近づいてくる',
  startPower: 3,
};
