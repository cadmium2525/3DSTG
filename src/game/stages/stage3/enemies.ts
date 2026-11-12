/**
 * Stage 3 「深淵」 small enemies — shadows of the light. Their bodies are dark (and under the
 * darkness overlay outside the heroine's light); their glow halos are drawn above the darkness
 * (Enemies halo renderOrder 3), so every threat shows as a pair of burning eyes in the dark.
 *
 *   影の欠片 shadowShard   — a cluster of black crystal shards; aimed dark fans (影の礫)
 *   影の手   shadowHand    — a clawed hand reaching in from the corridor edges (影の手)
 *   影の花   shadowFlower  — stage 1's flower, inverted; mirrored mini blooms (影の花)
 *   影の灯   shadowLantern — big carrier that previews a boss pattern (intro events)
 */
import * as THREE from 'three';
import { mergeParts } from '../../enemies/builtin';
import { registerEnemyKind, registerEnemyShape } from '../../enemies/registry';

/* ---------------------------------------------------------------- shapes */

/** Three long black shards fused at the base, with a small glowing slit between them. */
registerEnemyShape('shadowShard', {
  core: () => {
    const parts: THREE.BufferGeometry[] = [];
    const defs: [number, number, number][] = [[0, 1.0, 0], [2.1, 0.75, 0.5], [4.2, 0.8, -0.4]];
    for (const [a, len, tilt] of defs) {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.2, len * 0.75, 0.2);
      g.translate(0, len * 0.42, 0);
      g.rotateX(tilt * 0.4);
      g.rotateZ(a * 0.55 - 0.6);
      parts.push(g);
    }
    return mergeParts(parts);
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const g = new THREE.TetrahedronGeometry(0.16, 0);
      g.scale(0.8, 2.2, 0.8);
      const a = (k / 5) * Math.PI * 2;
      g.rotateZ(a);
      g.translate(Math.cos(a + 1.57) * 0.95, Math.sin(a + 1.57) * 0.95, (k % 2) * 0.2 - 0.1);
      parts.push(g);
    }
    return mergeParts(parts);
  },
});

/** A palm with five long clawed fingers curling toward the camera (reaching for you). */
registerEnemyShape('shadowHand', {
  core: () => {
    const palm = new THREE.IcosahedronGeometry(0.5, 0);
    palm.scale(1, 1.1, 0.45);
    const wrist = new THREE.OctahedronGeometry(1, 0);
    wrist.scale(0.22, 0.9, 0.2);
    wrist.translate(0, -0.95, -0.15);
    return mergeParts([palm, wrist]);
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    const N = 5;
    for (let k = 0; k < N; k++) {
      // Fingers fan over the upper half; each has two segments bending toward +Z (the player).
      const a = -1.1 + (k / (N - 1)) * 2.2 + (k === 0 ? -0.35 : 0);
      const len = k === 0 ? 0.55 : k === 2 ? 0.85 : 0.75;
      const seg1 = new THREE.OctahedronGeometry(1, 0);
      seg1.scale(0.09, len * 0.5, 0.09);
      seg1.translate(0, 0.45 + len * 0.45, 0.08);
      seg1.rotateX(0.35);
      seg1.rotateZ(a);
      parts.push(seg1);
      const seg2 = new THREE.OctahedronGeometry(1, 0);
      seg2.scale(0.07, len * 0.45, 0.07);
      seg2.translate(0, len * 0.4, 0);
      seg2.rotateX(1.0);
      seg2.translate(0, 0.45 + len * 0.9, 0.35);
      seg2.rotateZ(a);
      parts.push(seg2);
      const claw = new THREE.ConeGeometry(0.06, 0.32, 4);
      claw.rotateX(1.45);
      claw.translate(0, 0.45 + len * 1.1, 0.72);
      claw.rotateZ(a);
      parts.push(claw);
    }
    return mergeParts(parts);
  },
});

/** Stage 1's flower turned inside out: the petals fold back away from the camera, thorns between. */
registerEnemyShape('shadowFlower', {
  core: () => {
    const g = new THREE.IcosahedronGeometry(0.4, 0);
    g.scale(1, 1, 0.8);
    return g;
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.28, 0.7, 0.08);
      g.translate(0, 0.82, 0);
      g.rotateX(0.55); // bent backward (stage 1 cups them forward)
      g.rotateZ((k / 6) * Math.PI * 2 + Math.PI / 6);
      parts.push(g);
      const thorn = new THREE.ConeGeometry(0.06, 0.55, 3);
      thorn.translate(0, 0.62, 0);
      thorn.rotateX(-0.5);
      thorn.rotateZ((k / 6) * Math.PI * 2);
      parts.push(thorn);
    }
    return mergeParts(parts);
  },
});

/* ---------------------------------------------------------------- kinds */

registerEnemyKind('shadowShard', {
  shape: 'shadowShard', hp: 16, score: 200, scale: 1.45, hitRadius: 2.0,
  color: 0xa070ff, coreColor: 0x1a1030, haloScale: 0.8, haloGain: 0.6,
  spin: 1.4,
  fire: { pattern: 'shadowShot', duration: 0.5 },
  drops: { stars: 3, power: 0.5 },
});

registerEnemyKind('shadowHand', {
  shape: 'shadowHand', hp: 34, score: 500, scale: 1.9, hitRadius: 2.3,
  color: 0xff3a6a, coreColor: 0x1c0812, haloScale: 0.62, haloGain: 0.42,
  spin: 0.25, pulse: { speed: 2.2, amount: 0.1 },
  fire: { pattern: 'shadowGrasp', duration: 0.5, firstDelay: 0.5 },
  drops: { stars: 4, power: 0.9 },
});

registerEnemyKind('shadowFlower', {
  shape: 'shadowFlower', hp: 22, score: 300, scale: 1.4, hitRadius: 2.0,
  color: 0xd04a9a, coreColor: 0xffc8ec, haloScale: 0.75, haloGain: 0.55,
  spin: -1.0,
  fire: { pattern: 'shadowBloom', duration: 0.6 },
  drops: { stars: 3, power: 0.6 },
});

registerEnemyKind('shadowLantern', {
  shape: 'shadowShard', hp: 170, score: 1500, scale: 2.8, hitRadius: 3.2,
  color: 0xc08aff, coreColor: 0x241238, haloScale: 0.8, haloGain: 0.55, big: true, spin: 0.6,
  drops: { stars: 8, power: 4 },
});
