/**
 * Stage 1 「星海」 small enemies: the original petal / crystal / lantern (flower shape) and three
 * star-sea kinds — 彗星 comet (streaks diagonally, leaves a short trail of slow bullets),
 * 星海月 star-jellyfish (drifts, pulses, fires a small ring) and 水晶砲台 crystal turret
 * (pairs at the corridor edges, aimed 3-way).
 */
import * as THREE from 'three';
import { PALETTE } from '../../../core/config';
import { mergeParts } from '../../enemies/builtin';
import { registerEnemyKind, registerEnemyShape } from '../../enemies/registry';

/* ---------------------------------------------------------------- shapes */

/** Comet: a bright crystal head (+Y = direction of travel) and three trailing blades. */
registerEnemyShape('comet', {
  core: () => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.62, 1.15, 0.62);
    return g;
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.16, 1.15, 0.06);
      g.translate(0, -1.35, 0);
      g.rotateZ((k - 1) * 0.22);
      g.rotateY((k / 3) * Math.PI * 2);
      parts.push(g);
    }
    const tail = new THREE.OctahedronGeometry(1, 0);
    tail.scale(0.1, 2.1, 0.1);
    tail.translate(0, -2.2, 0);
    parts.push(tail);
    return mergeParts(parts);
  },
});

/** Star-jellyfish: a faceted bell and a frill of hanging tentacles. */
registerEnemyShape('jelly', {
  core: () => {
    const bell = new THREE.IcosahedronGeometry(0.62, 1);
    bell.scale(1, 0.62, 1);
    bell.translate(0, 0.2, 0);
    const star = new THREE.OctahedronGeometry(0.26, 0);
    star.scale(1, 1, 1);
    star.translate(0, 0.12, 0.42);
    return mergeParts([bell, star]);
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    const N = 7;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const g = new THREE.OctahedronGeometry(1, 0);
      const long = k % 2 === 0;
      g.scale(0.07, long ? 0.95 : 0.65, 0.07);
      g.translate(Math.cos(a) * 0.4, long ? -0.95 : -0.7, Math.sin(a) * 0.4);
      parts.push(g);
    }
    // Rim frill.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const g = new THREE.OctahedronGeometry(0.11, 0);
      g.scale(1.4, 0.7, 1.4);
      g.translate(Math.cos(a) * 0.6, -0.05, Math.sin(a) * 0.6);
      parts.push(g);
    }
    return mergeParts(parts);
  },
});

/** Crystal turret: a hexagonal pillar with pointed ends and four shards orbiting it. */
registerEnemyShape('turret', {
  core: () => {
    const body = new THREE.CylinderGeometry(0.34, 0.34, 1.1, 6);
    const top = new THREE.ConeGeometry(0.34, 0.62, 6);
    top.translate(0, 0.86, 0);
    const bot = new THREE.ConeGeometry(0.34, 0.5, 6);
    bot.rotateX(Math.PI);
    bot.translate(0, -0.8, 0);
    return mergeParts([body, top, bot]);
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.12, 0.34, 0.12);
      g.translate(Math.cos(a) * 0.95, (k % 2 ? 0.25 : -0.25), Math.sin(a) * 0.95);
      parts.push(g);
    }
    const ring = new THREE.TorusGeometry(0.95, 0.025, 4, 24);
    ring.rotateX(Math.PI / 2);
    parts.push(ring);
    return mergeParts(parts);
  },
});

/* ---------------------------------------------------------------- kinds */

registerEnemyKind('petal', {
  hp: 12, score: 100, scale: 1.25, hitRadius: 1.9, color: PALETTE.pink,
  drops: { stars: 2, power: 0.5 },
});

registerEnemyKind('crystal', {
  hp: 18, score: 200, scale: 1.45, hitRadius: 2.1, color: PALETTE.cyan, spin: -1.6,
  drops: { stars: 3, power: 0.6 },
});

registerEnemyKind('lantern', {
  hp: 170, score: 1500, scale: 2.6, hitRadius: 3.2, color: PALETTE.gold, haloScale: 0.7, haloGain: 0.3, big: true,
  drops: { stars: 8, power: 4 },
});

/** 彗星: streaks across in `stay` seconds; its slow trail bullets land along its path. */
registerEnemyKind('comet', {
  shape: 'comet', hp: 20, score: 300, scale: 1.8, hitRadius: 2.2, color: 0x9ff4ff, coreColor: 0xf4fbff,
  spin: 5, faceMotion: true, haloScale: 1.0, haloGain: 0.7,
  trail: { color: 0xbff6ff, every: 0.025, size: 0.8, life: 0.9 },
  motion: { type: 'path', arc: 1.2 },
  fire: { pattern: 'cometTrail', continuous: true, firstDelay: 0.55 },
  drops: { stars: 3, power: 0.4 },
});

/** 星海月: drifts up slowly with a swimming pulse; each volley is one small ring. */
registerEnemyKind('jelly', {
  shape: 'jelly', hp: 24, score: 400, scale: 1.55, hitRadius: 2.2, color: 0xc59bff, coreColor: 0xffd9f4,
  spin: 0.6, spinAxis: 'y', pulse: { speed: 3.1, amount: 0.16 }, haloScale: 1.15, haloGain: 0.5,
  motion: { type: 'drift', vx: 0, vy: 0.55, sway: 0.9 },
  fire: { pattern: 'jellyRing', duration: 0.8 },
  drops: { stars: 3, power: 0.8 },
});

/** 水晶砲台: sturdy edge turrets, aimed 3-way volleys. */
registerEnemyKind('turret', {
  shape: 'turret', hp: 38, score: 600, scale: 1.5, hitRadius: 2.2, color: 0x8fb4ff, coreColor: 0xe6f7ff,
  spin: 0.9, spinAxis: 'y', haloScale: 1.0, haloGain: 0.4,
  fire: { pattern: 'aimedBurst', duration: 0.4, intensityMul: 0.9 },
  drops: { stars: 4, power: 1 },
});
