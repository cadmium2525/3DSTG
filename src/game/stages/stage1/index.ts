/**
 * Stage 1 「星海」 — bright star sea, gentle difficulty (the user is happy with an easy first stage).
 * Road ≈ 36 s (with a short lull) → mid-boss 硝子蝶 ルクシア → road ≈ 23 s → WARNING → boss 星環の花冠 アストルム.
 * About 100–120 s when played well.
 */
import { BG_STAR_SEA } from '../../Background';
import { defineBoss, type BossConfig } from '../../bosses/BossLike';
import type { StageDef, StageEvent } from '../types';
import { AstrumBoss } from './AstrumBoss';
import { LuxiaMidBoss, type LuxiaConfig } from './LuxiaMidBoss';
import './enemies';

export const STAGE1_EVENTS: StageEvent[] = [
  // --- opening: petals, then the new star-sea kinds one by one ---
  { t: 2.0, type: 'wave', formation: 'line', kind: 'petal', count: 5, side: -1, stay: 4.0, fireEvery: 1.8, intensity: 0.3 },
  { t: 4.6, type: 'wave', formation: 'v', kind: 'petal', count: 5, side: 0, stay: 4.0, fireEvery: 1.6, intensity: 0.32, hard: { count: 7 } },
  { t: 7.4, type: 'wave', formation: 'diagonal', kind: 'comet', count: 2, side: 0, stay: 3.3, fireEvery: 0, intensity: 0.3, x: 1, delayStep: 0.8 },
  { t: 9.2, type: 'intro', pattern: 'rippleRing', duration: 4.5, intensity: 0.25, sub: 'リングの隙間をくぐれ' },
  { t: 10.8, type: 'wave', formation: 'columns', kind: 'crystal', count: 4, side: 1, stay: 3.5, fireEvery: 1.7, intensity: 0.32 },
  { t: 14.0, type: 'wave', formation: 'sides', kind: 'turret', count: 2, side: 0, stay: 5.5, fireEvery: 2.0, intensity: 0.28, y: 2.6 },
  { t: 14.6, type: 'wave', formation: 'arc', kind: 'petal', count: 6, side: 0, stay: 4.0, fireEvery: 1.5, intensity: 0.36, hard: { count: 7 } },
  { t: 18.6, type: 'wave', formation: 'low', kind: 'jelly', count: 3, side: 0, stay: 5.0, fireEvery: 2.8, intensity: 0.3 },
  { t: 20.8, type: 'wave', formation: 'diagonal', kind: 'comet', count: 3, side: 0, stay: 3.1, fireEvery: 0, intensity: 0.32, x: -1, delayStep: 0.55 },
  { t: 22.6, type: 'intro', pattern: 'constellationRain', duration: 5.0, intensity: 0.25, sub: '星の線を見切れ' },
  { t: 24.0, type: 'wave', formation: 'line', kind: 'crystal', count: 5, side: 1, stay: 3.5, fireEvery: 1.6, intensity: 0.36, hard: { count: 6 } },
  // HARD: one more comet pair crossing before the lull.
  { t: 27.0, type: 'wave', formation: 'diagonal', kind: 'comet', count: 2, side: 0, stay: 3.1, fireEvery: 0, intensity: 0.34, x: 1, delayStep: 0.6, hardOnly: true },
  // --- lull: a shower of shooting stars, peaceful jellyfish drifting up (they never fire) ---
  { t: 30.6, type: 'scenery', name: 'starfall', duration: 5.5 },
  { t: 31.0, type: 'wave', formation: 'low', kind: 'jelly', count: 4, side: 0, stay: 4.2, fireEvery: 99, intensity: 0.3, quiet: true, delayStep: 0.4 },
  // Mid-boss: stage time stops here until it is defeated or flies away.
  { t: 36.0, type: 'midboss' },
  // --- second half: denser mixes ---
  { t: 37.2, type: 'wave', formation: 'v', kind: 'petal', count: 7, side: 0, stay: 3.5, fireEvery: 1.4, intensity: 0.4, hard: { count: 9 } },
  { t: 39.0, type: 'wave', formation: 'diagonal', kind: 'comet', count: 2, side: 0, stay: 3.0, fireEvery: 0, intensity: 0.36, delayStep: 0.9 },
  { t: 40.6, type: 'wave', formation: 'sides', kind: 'turret', count: 4, side: 0, stay: 5.0, fireEvery: 1.9, intensity: 0.32, y: 3.4, delayStep: 0.3 },
  { t: 43.6, type: 'wave', formation: 'columns', kind: 'crystal', count: 6, side: -1, stay: 3.0, fireEvery: 1.4, intensity: 0.42 },
  { t: 46.4, type: 'wave', formation: 'low', kind: 'jelly', count: 3, side: 0, stay: 4.5, fireEvery: 2.4, intensity: 0.38, x: 1.5 },
  { t: 47.6, type: 'wave', formation: 'diagonal', kind: 'comet', count: 3, side: 0, stay: 3.0, fireEvery: 0, intensity: 0.38, x: 1, delayStep: 0.5 },
  { t: 49.8, type: 'wave', formation: 'arc', kind: 'crystal', count: 7, side: 0, stay: 3.0, fireEvery: 1.3, intensity: 0.44, hard: { count: 8 } },
  // --- the push right before WARNING: petals from both sides, a turret pair, a comet pair ---
  { t: 53.2, type: 'wave', formation: 'line', kind: 'petal', count: 6, side: -1, stay: 3.4, fireEvery: 1.5, intensity: 0.4, hard: { count: 7 } },
  { t: 53.9, type: 'wave', formation: 'line', kind: 'petal', count: 6, side: 1, stay: 3.0, fireEvery: 1.5, intensity: 0.4, hard: { count: 7 } },
  { t: 54.6, type: 'wave', formation: 'sides', kind: 'turret', count: 2, side: 0, stay: 3.6, fireEvery: 1.7, intensity: 0.34, y: 1.2 },
  { t: 55.6, type: 'wave', formation: 'diagonal', kind: 'comet', count: 2, side: 0, stay: 2.9, fireEvery: 0, intensity: 0.4, delayStep: 0.35 },
  { t: 60.0, type: 'warning' },
  { t: 63.0, type: 'boss' },
];

export const STAGE1_MIDBOSS: LuxiaConfig = {
  name: '硝子蝶 ルクシア',
  sub: 'MID BOSS — 夜をわたる硝子の翅',
  escapeText: 'ルクシアは夜空の彼方へ',
  /** ×1.075 since shot power exists (Lv1 still just breaks each phase in time; Lv2–3, the usual, is a bit faster). */
  maxHp: 430,
  enterSec: 2.4,
  breatherSec: 1.1,
  deathSec: 1.5,
  position: { x: 0, y: 1.6, z: -54 },
  swayX: 3.2,
  swayY: 0.7,
  swayZ: 3.5,
  hitRadius: 4.6,
  hitFlash: 0.12,
  targetZ: 1,
  phases: [
    {
      name: '胡蝶の羽ばたき',
      patterns: [
        { id: 'wingSweep', intensity: 0.3 },
        { id: 'aimedBurst', intensity: 0.28 },
      ],
      // HARD: small rings close around the heroine between the wing walls.
      hard: { patterns: [{ id: 'jellyRing', intensity: 0.3 }] },
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
  ],
};

export const STAGE1_BOSS: BossConfig = {
  name: '星環の花冠 アストルム',
  sub: 'BOSS',
  escapeText: 'ボスは星の彼方へ去った',
  /** ×1.3 since shot power Lv1..4 exists (Lv1 = the old DPS, see SHOT_LEVELS). */
  maxHp: 1090,
  enterSec: 3.0,
  breatherSec: 2.2,
  deathSec: 2.6,
  position: { x: 0, y: 1.0, z: -62 },
  hitRadius: 6.5,
  hitFlash: 0.35,
  targetZ: 1.5,
  cancelOnTimeout: true,
  phases: [
    // HARD: aimed volleys on top of the corridor / the bloom.
    { patterns: [{ id: 'spiralCorridor', intensity: 0.5 }], hard: { patterns: [{ id: 'aimedBurst', intensity: 0.3 }] }, hpEnd: 0.68, timeout: 14 },
    { patterns: [{ id: 'petalBloom', intensity: 0.55 }], hard: { patterns: [{ id: 'aimedBurst', intensity: 0.3 }] }, hpEnd: 0.36, timeout: 15 },
    {
      patterns: [
        { id: 'rippleRing', intensity: 0.45 },
        { id: 'constellationRain', intensity: 0.45 },
      ],
      // HARD: this pair is already near the bullet pool limit — only ×1.1 here.
      hard: { bullet: 1.05 },
      hpEnd: 0,
      timeout: 20,
    },
  ],
};

export const STAGE1: StageDef = {
  id: 'stage1',
  number: 1,
  title: '星海',
  subtitle: 'STAR SEA DIVE',
  bgm: { stage: 'stage', midboss: 'midboss', boss: 'boss' },
  background: BG_STAR_SEA,
  events: STAGE1_EVENTS,
  enemyKinds: ['petal', 'crystal', 'lantern', 'comet', 'jelly', 'turret'],
  midBoss: defineBoss(STAGE1_MIDBOSS, (ctx) => new LuxiaMidBoss(ctx)),
  boss: defineBoss(STAGE1_BOSS, (ctx) => new AstrumBoss(ctx)),
  warningText: '強大な魔力反応が接近中',
  startPower: 1,
};
