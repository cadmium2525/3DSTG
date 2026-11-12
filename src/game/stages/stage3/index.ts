/**
 * Stage 3 「深淵」 THE ABYSS — the bottom of the dark; only the heroine's light remains.
 * Road ≈ 33 s (shadow shards → hands from the edges → shadow flowers, one swallowed-light lull)
 * → mid-boss 影の騎士 ノクス → road ≈ 23 s → WARNING → final boss 影の少女 (5 spells).
 * About 135–150 s when played well. A step up from stage 2 (denser mixes, dark bullets, the dark
 * itself), still fair: every pattern passes the fairness bot (dev/stage3.html?fair3=1).
 */
import '../../../danmaku/stage3';
import { defineBoss } from '../../bosses/BossLike';
import type { StageDef, StageEvent } from '../types';
import { BG_ABYSS } from './background';
import './enemies';
import { NoxMidBoss, type NoxConfig } from './NoxMidBoss';
import { ShadowGirlBoss, type ShadowGirlConfig } from './ShadowGirlBoss';

// HARD: shadow flowers stay at intensity 0.43 × 1.3 ≈ 0.56 (above that shadowBloom doubles its petals).
export const STAGE3_EVENTS: StageEvent[] = [
  // --- descent: shards out of the dark, then the first hands ---
  { t: 2.0, type: 'wave', formation: 'v', kind: 'shadowShard', count: 5, side: 0, stay: 4.0, fireEvery: 1.6, intensity: 0.4 },
  { t: 4.8, type: 'wave', formation: 'line', kind: 'shadowShard', count: 6, side: 1, stay: 3.6, fireEvery: 1.5, intensity: 0.42 },
  { t: 7.6, type: 'wave', formation: 'sides', kind: 'shadowHand', count: 2, side: 0, stay: 5.0, fireEvery: 2.5, intensity: 0.45, y: 1.6 },
  { t: 9.0, type: 'wave', formation: 'arc', kind: 'shadowShard', count: 6, side: 0, stay: 3.6, fireEvery: 1.5, intensity: 0.45, hard: { count: 7 } },
  { t: 12.2, type: 'intro', pattern: 'shadowMimic', duration: 4.2, intensity: 0.25, sub: '影の流れの隙間へ', kind: 'shadowLantern' },
  { t: 13.4, type: 'wave', formation: 'columns', kind: 'shadowFlower', count: 4, side: -1, stay: 4.0, fireEvery: 2.2, intensity: 0.45, hard: { intensity: 0.43 } },
  { t: 17.4, type: 'wave', formation: 'line', kind: 'shadowFlower', count: 4, side: 1, stay: 3.8, fireEvery: 2.2, intensity: 0.48, hard: { intensity: 0.43 } },
  { t: 18.2, type: 'wave', formation: 'sides', kind: 'shadowHand', count: 4, side: 0, stay: 4.6, fireEvery: 2.6, intensity: 0.48, y: 3.2, delayStep: 0.5 },
  { t: 22.0, type: 'wave', formation: 'scatter', kind: 'shadowShard', count: 6, side: 0, stay: 3.4, fireEvery: 1.4, intensity: 0.48, delayStep: 0.25, hard: { count: 8 } },
  // --- lull: distant lights are swallowed one by one; quiet shards drift past ---
  { t: 26.0, type: 'scenery', name: 'swallow', duration: 6 },
  { t: 26.4, type: 'wave', formation: 'low', kind: 'shadowShard', count: 4, side: 0, stay: 4.0, fireEvery: 99, intensity: 0.3, quiet: true, delayStep: 0.45 },
  { t: 32.0, type: 'midboss' },
  // --- second half: everything together ---
  { t: 33.2, type: 'wave', formation: 'v', kind: 'shadowFlower', count: 5, side: 0, stay: 3.6, fireEvery: 2.0, intensity: 0.5, hard: { intensity: 0.43 } },
  { t: 35.2, type: 'wave', formation: 'sides', kind: 'shadowHand', count: 2, side: 0, stay: 4.4, fireEvery: 2.3, intensity: 0.52, y: 0.4 },
  { t: 36.6, type: 'wave', formation: 'line', kind: 'shadowShard', count: 7, side: -1, stay: 3.2, fireEvery: 1.3, intensity: 0.52, hard: { count: 8 } },
  { t: 39.4, type: 'intro', pattern: 'shadowBarrier', duration: 5.0, intensity: 0.3, sub: '閉じる結界の道を辿れ', kind: 'shadowLantern' },
  { t: 41.0, type: 'wave', formation: 'columns', kind: 'shadowShard', count: 6, side: 1, stay: 3.0, fireEvery: 1.4, intensity: 0.5 },
  // HARD: a scatter of shards while the barrier preview closes.
  { t: 43.4, type: 'wave', formation: 'scatter', kind: 'shadowShard', count: 3, side: 0, stay: 3.0, fireEvery: 1.4, intensity: 0.48, delayStep: 0.3, hardOnly: true },
  { t: 45.2, type: 'wave', formation: 'arc', kind: 'shadowFlower', count: 5, side: 0, stay: 3.6, fireEvery: 2.1, intensity: 0.52, hard: { intensity: 0.43 } },
  { t: 47.0, type: 'wave', formation: 'sides', kind: 'shadowHand', count: 4, side: 0, stay: 4.0, fireEvery: 2.4, intensity: 0.52, y: 2.8, delayStep: 0.35 },
  // --- the last push before her ---
  { t: 50.6, type: 'wave', formation: 'line', kind: 'shadowShard', count: 6, side: -1, stay: 3.0, fireEvery: 1.3, intensity: 0.52, hard: { count: 7 } },
  { t: 51.2, type: 'wave', formation: 'line', kind: 'shadowShard', count: 6, side: 1, stay: 2.8, fireEvery: 1.3, intensity: 0.52, hard: { count: 7 } },
  { t: 52.2, type: 'wave', formation: 'v', kind: 'shadowFlower', count: 4, side: 0, stay: 2.8, fireEvery: 2.0, intensity: 0.5, hard: { intensity: 0.43 } },
  { t: 56.4, type: 'warning' },
  { t: 59.4, type: 'boss' },
];

export const STAGE3_MIDBOSS: NoxConfig = {
  name: '影の騎士 ノクス',
  sub: 'MID BOSS — 闇の鎧と影の剣',
  escapeText: 'ノクスは闇に溶けた',
  maxHp: 640,
  enterSec: 2.6,
  breatherSec: 1.2,
  deathSec: 1.6,
  position: { x: 0, y: 1.8, z: -50 },
  swayX: 3.0,
  swayY: 0.8,
  hitRadius: 4.6,
  hitFlash: 0.06,
  targetZ: 1,
  phases: [
    {
      name: '影の剣閃',
      patterns: [
        { id: 'shadowSlash', intensity: 0.42 },
        { id: 'shadowShot', intensity: 0.3 },
      ],
      // HARD: a thin ring of shield plates turns behind the blade arcs.
      hard: { patterns: [{ id: 'blackShield', intensity: 0.25 }] },
      hpEnd: 0.5,
      timeout: 12,
    },
    {
      name: '黒鎧の陣',
      patterns: [
        { id: 'blackShield', intensity: 0.55 },
        { id: 'shadowSlash', intensity: 0.6 },
      ],
      hpEnd: 0,
      timeout: 14,
    },
  ],
};

export const STAGE3_BOSS: ShadowGirlConfig = {
  name: '影の少女',
  sub: 'FINAL BOSS — 光が落とした影',
  escapeText: '影は闇の底へ還った',
  maxHp: 2200,
  enterSec: 3.4,
  breatherSec: 2.0,
  deathSec: 5.6,
  position: { x: 0, y: 1.6, z: -50 },
  size: 11,
  swayX: 2.4,
  swayY: 0.7,
  swayZ: 3,
  hitRadius: 4.8,
  hitFlash: 0.06,
  targetZ: 1,
  cancelOnTimeout: true,
  eaterPhase: 3,
  finalPhase: 4,
  eaterRadius: 0.62,
  finalRadius: 2.8,
  finalAmount: 0.4,
  phases: [
    { name: '影の模倣', patterns: [{ id: 'shadowMimic', intensity: 0.55 }, { id: 'shadowShot', intensity: 0.3 }], hpEnd: 0.82, timeout: 20 },
    // HARD: her shadow shots keep aiming at the heroine while the echoes replay.
    { name: '写し身の弾幕', patterns: [{ id: 'shadowEcho', intensity: 0.55 }], hard: { patterns: [{ id: 'shadowShot', intensity: 0.25 }] }, hpEnd: 0.62, timeout: 26 },
    { name: '影の結界', patterns: [{ id: 'shadowBarrier', intensity: 0.6 }], hpEnd: 0.42, timeout: 22 },
    { name: '光喰い', patterns: [{ id: 'lightEater', intensity: 0.55 }, { id: 'shadowShot', intensity: 0.3 }], hpEnd: 0.24, timeout: 20 },
    // HARD: the strengthened last spell 「光と影の螺旋・極」 — denser lattice (0.62 × 1.3) and aimed shadow shots.
    {
      name: '光と影の螺旋', patterns: [{ id: 'lightShadowHelix', intensity: 0.62 }], hpEnd: 0, timeout: 28,
      hard: { name: '光と影の螺旋・極', patterns: [{ id: 'shadowShot', intensity: 0.3 }] },
    },
  ],
};

export const STAGE3: StageDef = {
  id: 'stage3',
  number: 3,
  title: '深淵',
  subtitle: 'THE ABYSS',
  bgm: { stage: 'stage3', midboss: 'midboss3', boss: 'boss3' },
  background: BG_ABYSS,
  events: STAGE3_EVENTS,
  enemyKinds: ['shadowShard', 'shadowHand', 'shadowFlower', 'shadowLantern'],
  midBoss: defineBoss(STAGE3_MIDBOSS, (ctx) => new NoxMidBoss(ctx)),
  boss: defineBoss(STAGE3_BOSS, (ctx) => new ShadowGirlBoss(ctx)),
  warningText: '自分と同じ気配が近づいてくる',
  startPower: 3,
  score: { bossKill: 60000 },
};
