/**
 * Stage 2 「黄昏の境界」 — twilight: the light is beginning to fade, shadow motes drift among the
 * warm ones. A clear step up from stage 1 (pattern intensities ≈ 0.4–0.6) but every new pattern
 * passes the fairness bot (dev/danmaku.html?fairness=1).
 *
 * Road ≈ 36 s (moths, sunset shards, shadow wisps; previews of 日輪の光条 / 黄昏の格子; a lull with
 * a shadow tide) → mid-boss 黄昏の灯守 ランテルナ → road ≈ 25 s (denser mixes, 蝕の三日月 preview,
 * a push before WARNING) → boss 蝕む日輪 エクリプス (4 phases, the eclipse deepens each phase).
 * About 115–130 s when played well.
 */
import '../../../danmaku/stage2';
import { defineBoss, type BossConfig } from '../../bosses/BossLike';
import type { StageDef, StageEvent } from '../types';
import { BG_TWILIGHT } from './background';
import { Eclipse } from './Eclipse';
import { Lanterna, type LanternaConfig } from './Lanterna';
import './enemies';

export const STAGE2_EVENTS: StageEvent[] = [
  // --- opening: moths flutter in from both sides, then the first sunset shards ---
  { t: 2.0, type: 'wave', formation: 'flock', kind: 'moth', count: 5, side: -1, stay: 4.0, fireEvery: 1.7, intensity: 0.36, hard: { count: 6 } },
  { t: 4.4, type: 'wave', formation: 'flock', kind: 'moth', count: 5, side: 1, stay: 3.8, fireEvery: 1.7, intensity: 0.38 },
  { t: 7.2, type: 'wave', formation: 'circle', kind: 'sunShard', count: 6, side: 0, stay: 1, fireEvery: 9, intensity: 0.4, delayStep: 0.2 },
  { t: 9.4, type: 'intro', pattern: 'coronaRays', duration: 4.6, intensity: 0.28, sub: '光条の隙間を回り込め', kind: 'duskLantern' },
  { t: 10.8, type: 'wave', formation: 'scatter', kind: 'wisp', count: 3, side: 1, stay: 4.5, fireEvery: 1.7, intensity: 0.4, delayStep: 0.35 },
  // HARD: a pair of wisps from the other side while the corona preview fades.
  { t: 13.0, type: 'wave', formation: 'scatter', kind: 'wisp', count: 2, side: -1, stay: 4.0, fireEvery: 1.7, intensity: 0.4, delayStep: 0.4, hardOnly: true },
  { t: 14.4, type: 'wave', formation: 'line', kind: 'moth', count: 6, side: -1, stay: 3.6, fireEvery: 1.6, intensity: 0.4 },
  { t: 16.2, type: 'wave', formation: 'circle', kind: 'sunShard', count: 8, side: 0, stay: 1, fireEvery: 9, intensity: 0.42, delayStep: 0.15, x: 0.4 },
  { t: 18.0, type: 'wave', formation: 'sides', kind: 'wisp', count: 2, side: 0, stay: 5.0, fireEvery: 1.6, intensity: 0.42, y: 2.4 },
  { t: 18.6, type: 'wave', formation: 'v', kind: 'moth', count: 7, side: 0, stay: 3.6, fireEvery: 1.6, intensity: 0.42, hard: { count: 9 } },
  { t: 22.4, type: 'intro', pattern: 'twilightLattice', duration: 5.0, intensity: 0.3, sub: '光と影の格子 — 辺の中点が安全', kind: 'duskLantern' },
  { t: 24.6, type: 'wave', formation: 'circle', kind: 'sunShard', count: 6, side: 0, stay: 1, fireEvery: 9, intensity: 0.42, delayStep: 0.22, x: 0.25, y: 0.6 },
  { t: 25.6, type: 'wave', formation: 'scatter', kind: 'wisp', count: 3, side: -1, stay: 4.0, fireEvery: 1.6, intensity: 0.44, delayStep: 0.3 },
  { t: 27.8, type: 'wave', formation: 'flock', kind: 'moth', count: 6, side: 1, stay: 2.8, fireEvery: 1.5, intensity: 0.44 },
  // --- lull: a tide of shadow motes rises; a few moths drift down without firing ---
  { t: 31.4, type: 'scenery', name: 'shadowtide', duration: 5.5 },
  { t: 31.8, type: 'wave', formation: 'low', kind: 'moth', count: 4, side: 0, stay: 3.6, fireEvery: 99, intensity: 0.3, quiet: true, delayStep: 0.45, y: 1.5 },
  // Mid-boss: stage time stops here until it is defeated or leaves.
  { t: 37.0, type: 'midboss' },
  // --- second half: denser mixes ---
  { t: 38.2, type: 'wave', formation: 'v', kind: 'moth', count: 7, side: 0, stay: 3.4, fireEvery: 1.4, intensity: 0.46, hard: { count: 8 } },
  { t: 39.8, type: 'wave', formation: 'circle', kind: 'sunShard', count: 8, side: 0, stay: 1, fireEvery: 9, intensity: 0.46, delayStep: 0.14 },
  { t: 41.6, type: 'wave', formation: 'sides', kind: 'wisp', count: 4, side: 0, stay: 4.6, fireEvery: 1.6, intensity: 0.44, y: 3.2, delayStep: 0.3 },
  { t: 44.4, type: 'wave', formation: 'columns', kind: 'moth', count: 6, side: -1, stay: 3.2, fireEvery: 1.4, intensity: 0.46 },
  { t: 46.4, type: 'wave', formation: 'circle', kind: 'sunShard', count: 6, side: 0, stay: 1, fireEvery: 9, intensity: 0.48, delayStep: 0.2, x: 0.5 },
  { t: 47.0, type: 'wave', formation: 'scatter', kind: 'wisp', count: 3, side: 1, stay: 3.8, fireEvery: 1.5, intensity: 0.46, delayStep: 0.3 },
  { t: 49.4, type: 'intro', pattern: 'crescentSweep', duration: 4.6, intensity: 0.3, sub: '三日月の内側へ逃げ込め', kind: 'duskLantern' },
  { t: 51.6, type: 'wave', formation: 'flock', kind: 'moth', count: 7, side: -1, stay: 3.4, fireEvery: 1.4, intensity: 0.48, hard: { count: 8 } },
  { t: 53.4, type: 'wave', formation: 'scatter', kind: 'wisp', count: 4, side: 0, stay: 3.6, fireEvery: 1.5, intensity: 0.46, delayStep: 0.3 },
  // --- the push before WARNING: moths from both sides, wisps at the edges, a big ring of shards ---
  { t: 56.0, type: 'wave', formation: 'line', kind: 'moth', count: 6, side: -1, stay: 3.2, fireEvery: 1.4, intensity: 0.46 },
  { t: 56.7, type: 'wave', formation: 'line', kind: 'moth', count: 6, side: 1, stay: 2.9, fireEvery: 1.4, intensity: 0.46 },
  { t: 57.4, type: 'wave', formation: 'sides', kind: 'wisp', count: 2, side: 0, stay: 3.4, fireEvery: 1.5, intensity: 0.44, y: 1.2 },
  { t: 59.6, type: 'wave', formation: 'circle', kind: 'sunShard', count: 10, side: 0, stay: 1, fireEvery: 9, intensity: 0.5, delayStep: 0.12, hard: { count: 12 } },
  { t: 63.0, type: 'warning' },
  { t: 66.0, type: 'boss' },
];

export const STAGE2_MIDBOSS: LanternaConfig = {
  name: '黄昏の灯守 ランテルナ',
  sub: 'MID BOSS — 影に蝕まれる灯籠の精',
  escapeText: 'ランテルナは夕闇の雲海へ沈んだ',
  maxHp: 520,
  enterSec: 2.4,
  breatherSec: 1.2,
  deathSec: 1.8,
  position: { x: 0, y: 1.4, z: -56 },
  swayX: 3.0,
  swayY: 0.7,
  swayZ: 3.0,
  hitRadius: 4.8,
  hitFlash: 0.12,
  targetZ: 1,
  phases: [
    {
      name: '灯籠流し',
      patterns: [
        { id: 'lanternDrift', intensity: 0.45 },
        { id: 'aimedBurst', intensity: 0.32 },
      ],
      hpEnd: 0.5,
      timeout: 11,
    },
    {
      name: '揺らぐ灯',
      patterns: [
        { id: 'flickerCurtain', intensity: 0.5 },
        { id: 'lanternDrift', intensity: 0.3 },
      ],
      // HARD: aimed shots through the curtains.
      hard: { patterns: [{ id: 'aimedBurst', intensity: 0.3 }] },
      hpEnd: 0,
      timeout: 12,
    },
  ],
};

export const STAGE2_BOSS: BossConfig = {
  name: '蝕む日輪 エクリプス',
  sub: 'BOSS — 喰われゆく黄昏の太陽',
  escapeText: '日輪は蝕まれたまま地平へ沈んだ',
  maxHp: 1500,
  enterSec: 3.2,
  breatherSec: 2.2,
  deathSec: 3.0,
  position: { x: 0, y: 1.2, z: -64 },
  hitRadius: 6.8,
  hitFlash: 0.3,
  targetZ: 1.5,
  cancelOnTimeout: true,
  phases: [
    // HARD: aimed volleys between the spokes.
    { name: '日輪の光条', patterns: [{ id: 'coronaRays', intensity: 0.5 }], hard: { patterns: [{ id: 'aimedBurst', intensity: 0.3 }] }, hpEnd: 0.75, timeout: 15 },
    {
      name: '黄昏の格子',
      patterns: [
        { id: 'twilightLattice', intensity: 0.55 },
        { id: 'aimedBurst', intensity: 0.35 },
      ],
      hpEnd: 0.5,
      timeout: 16,
    },
    {
      name: '蝕の三日月',
      patterns: [
        { id: 'crescentSweep', intensity: 0.5 },
        { id: 'coronaRays', intensity: 0.22 },
      ],
      // HARD: sunset-shard rings burst from the sun as the crescents orbit.
      hard: { patterns: [{ id: 'shardRing', intensity: 0.3 }] },
      hpEnd: 0.25,
      timeout: 17,
    },
    {
      name: '皆既日蝕',
      patterns: [
        { id: 'totalEclipse', intensity: 0.55 },
        { id: 'coronaRays', intensity: 0.28 },
      ],
      hpEnd: 0,
      timeout: 24,
    },
  ],
};

export const STAGE2: StageDef = {
  id: 'stage2',
  number: 2,
  title: '黄昏の境界',
  subtitle: 'TWILIGHT BORDER',
  bgm: { stage: 'stage2', midboss: 'midboss2', boss: 'boss2' },
  background: BG_TWILIGHT,
  events: STAGE2_EVENTS,
  enemyKinds: ['moth', 'wisp', 'sunShard', 'duskLantern'],
  midBoss: defineBoss(STAGE2_MIDBOSS, (ctx) => new Lanterna(ctx)),
  boss: defineBoss(STAGE2_BOSS, (ctx) => new Eclipse(ctx)),
  warningText: '沈む光の向こうから何かが来る',
  startPower: 2,
};
