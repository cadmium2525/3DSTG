/**
 * Stage 2 「黄昏の境界」 small enemies (registered at import time):
 *   光蛾 moth            — amber wings with shadow-eaten edges, flutters (pulse) and sinks slowly; 光蛾の鱗粉.
 *   影の鬼火 wisp        — dark core in a violet flame crown, erratic hops; 鬼火の散弾 (shadow bullets).
 *   夕陽の欠片 sunShard  — orange crystal that spins in, trembles and bursts into 夕陽の欠片 rings.
 *   夕灯籠 duskLantern   — the stage's intro carrier (a paper lantern) for boss-pattern previews.
 * Formations: 'circle' (a ring ahead, entering from the depths), 'flock' (a loose drifting cloud
 * that enters from one side).
 */
import * as THREE from 'three';
import { mergeParts } from '../../enemies/builtin';
import { defaultEntry, registerEnemyKind, registerEnemyShape, registerFormation } from '../../enemies/registry';

/* ---------------------------------------------------------------- shapes */

const oct = (sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rz = 0) => {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(sx, sy, sz);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

/** Wing layout shared by the moth's bright wings (crown) and their dark bitten edges (core). */
const FORE = { x: 0.62, y: 0.2, rz: 0.38, sx: 0.62, sy: 0.34 };
const HIND = { x: 0.45, y: -0.28, rz: -0.55, sx: 0.42, sy: 0.27 };

/** Moth: core = shadowed body + the dark "bites" along the wing edges; crown = four amber wings. */
registerEnemyShape('moth', {
  core: () => {
    const parts = [oct(0.13, 0.62, 0.13, 0, -0.05), oct(0.15, 0.15, 0.15, 0, 0.62)];
    for (const s of [-1, 1]) {
      // antennae
      parts.push(oct(0.03, 0.28, 0.03, s * 0.16, 0.92, 0, -s * 0.5));
      // shadow bites: outer forewing tip and trailing edge, hindwing tip
      const fx = s * (FORE.x + Math.cos(FORE.rz) * FORE.sx * 0.78);
      const fy = FORE.y + Math.sin(FORE.rz) * FORE.sx * 0.78;
      parts.push(oct(0.26, 0.2, 0.06, fx, fy, 0, s * 0.5));
      parts.push(oct(0.2, 0.13, 0.06, s * (FORE.x + 0.12), FORE.y - 0.22, 0, s * 0.2));
      parts.push(oct(0.2, 0.16, 0.06, s * (HIND.x + 0.3), HIND.y - 0.2, 0, -s * 0.6));
    }
    return mergeParts(parts);
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      parts.push(oct(FORE.sx, FORE.sy, 0.035, 0, 0, 0, 0).rotateZ(s * FORE.rz).translate(s * FORE.x, FORE.y, 0));
      parts.push(oct(HIND.sx, HIND.sy, 0.035, 0, 0, 0, 0).rotateZ(s * HIND.rz).translate(s * HIND.x, HIND.y, 0));
    }
    return mergeParts(parts);
  },
});

/** Wisp: a dark round core, a crown of violet flame tongues and a thin rim ring. */
registerEnemyShape('wisp', {
  core: () => {
    const g = new THREE.IcosahedronGeometry(0.46, 1);
    g.scale(1, 1.1, 1);
    return g;
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    const N = 6;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const tall = k % 2 === 0;
      const g = oct(0.13, tall ? 0.62 : 0.44, 0.13, 0, tall ? 0.5 : 0.36);
      g.rotateZ(Math.sin(a) * 0.55);
      g.rotateX(Math.cos(a) * 0.55);
      parts.push(g);
    }
    parts.push(oct(0.1, 0.85, 0.1, 0, 0.75));
    const ring = new THREE.TorusGeometry(0.58, 0.03, 4, 20);
    ring.rotateX(Math.PI / 2);
    parts.push(ring);
    return mergeParts(parts);
  },
});

/** Sunset shard: a long orange crystal and three small splinters around it. */
registerEnemyShape('sunShard', {
  core: () => mergeParts([oct(0.3, 0.95, 0.3), oct(0.16, 0.45, 0.16, 0.24, -0.3, 0, -0.6)]),
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      parts.push(oct(0.1, 0.32, 0.1, Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0, a));
    }
    return mergeParts(parts);
  },
});

/** Dusk lantern: a glowing hexagonal paper body (core) under a roof, base and frame (crown). */
registerEnemyShape('paperLantern', {
  core: () => {
    const body = new THREE.CylinderGeometry(0.42, 0.36, 0.9, 6);
    return mergeParts([body]);
  },
  crown: () => {
    const roof = new THREE.ConeGeometry(0.66, 0.42, 6);
    roof.translate(0, 0.66, 0);
    const knob = new THREE.OctahedronGeometry(0.12, 0);
    knob.translate(0, 0.95, 0);
    const base = new THREE.CylinderGeometry(0.46, 0.52, 0.14, 6);
    base.translate(0, -0.52, 0);
    const parts: THREE.BufferGeometry[] = [roof, knob, base];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const post = new THREE.BoxGeometry(0.05, 0.92, 0.05);
      post.translate(Math.cos(a) * 0.43, 0, Math.sin(a) * 0.43);
      parts.push(post);
    }
    const tassel = new THREE.OctahedronGeometry(1, 0);
    tassel.scale(0.06, 0.3, 0.06);
    tassel.translate(0, -0.85, 0);
    parts.push(tassel);
    return mergeParts(parts);
  },
});

/* ---------------------------------------------------------------- kinds */

/** 光蛾: flutters (crown pulse) and sinks slowly while it hovers; 光蛾の鱗粉 volleys. */
registerEnemyKind('moth', {
  shape: 'moth', hp: 16, score: 250, scale: 1.4, hitRadius: 2.0, color: 0xffa860, coreColor: 0x2c1440,
  spin: 0.9, spinAxis: 'y', pulse: { speed: 11, amount: 0.24 }, haloScale: 1.1, haloGain: 0.2,
  motion: { type: 'drift', vx: 0, vy: -0.42, sway: 1.3 },
  fire: { pattern: 'mothDust', duration: 0.6 },
  drops: { stars: 2, power: 0.5 },
});

/** Smooth pseudo-random hop target in -1..1 (deterministic per enemy and hop index). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
const WISP_ENTER = 1.4;
const WISP_EXIT = 1.1;
const WISP_HOP = 0.85;
const wispOffset = (ts: number, w: number, out: THREE.Vector3) => {
  const h = ts / WISP_HOP;
  const i = Math.floor(h);
  const f = h - i;
  const e = f * f * (3 - 2 * f);
  const k0 = i + w * 13.7, k1 = i + 1 + w * 13.7;
  out.set(
    (hash(k0) + (hash(k1) - hash(k0)) * e) * 2.3 + Math.sin(ts * 5.3 + w) * 0.18,
    (hash(k0 + 7.1) + (hash(k1 + 7.1) - hash(k0 + 7.1)) * e) * 1.4 + Math.sin(ts * 6.1 + w * 2) * 0.15,
    (hash(k0 + 3.3) + (hash(k1 + 3.3) - hash(k0 + 3.3)) * e) * 2.2,
  );
  // Ramp in from the station so the hop pattern starts without a jump.
  out.multiplyScalar(Math.min(1, ts / 0.6));
  return out;
};
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

/** 影の鬼火: erratic hopping wisp of shadow; aimed 鬼火の散弾 every fireEvery. */
registerEnemyKind('wisp', {
  shape: 'wisp', hp: 22, score: 350, scale: 1.45, hitRadius: 2.1, color: 0x9d6bff, coreColor: 0x1d0c36,
  spin: 2.2, spinAxis: 'y', pulse: { speed: 8, amount: 0.12 }, haloScale: 1.5, haloGain: 0.28,
  trail: { color: 0x8a5cff, every: 0.07, size: 0.5, life: 0.6 },
  motion: {
    type: 'custom',
    update(s) {
      if (s.t < WISP_ENTER) {
        const u = s.t / WISP_ENTER;
        s.pos.lerpVectors(s.start, s.station, 1 - Math.pow(1 - u, 3));
        return false;
      }
      const ts = s.t - WISP_ENTER;
      if (ts < s.stay) {
        s.pos.copy(s.station).add(wispOffset(ts, s.wobble, tmpV));
        return false;
      }
      const u = (ts - s.stay) / WISP_EXIT;
      if (u >= 1) return true;
      tmpW.copy(s.station).add(wispOffset(s.stay, s.wobble, tmpV));
      s.pos.lerpVectors(tmpW, s.exit, u * u);
      return false;
    },
  },
  fire: { pattern: 'wispSpread', duration: 0.4, firstDelay: 1.7 },
  drops: { stars: 3, power: 0.6 },
});

const SHARD_IN = 1.05;
const SHARD_BURST = 1.5;
/** 夕陽の欠片: spins in from the depths, trembles, and bursts into a ring (vanishes, no score). */
registerEnemyKind('sunShard', {
  shape: 'sunShard', hp: 10, score: 200, scale: 1.3, hitRadius: 1.9, color: 0xff8a3a, coreColor: 0xffd49a,
  spin: 7, haloScale: 1.1, haloGain: 0.6,
  trail: { color: 0xffb060, every: 0.05, size: 0.55, life: 0.5 },
  motion: {
    type: 'custom',
    update(s) {
      if (s.t >= SHARD_BURST) return true;
      if (s.t < SHARD_IN) {
        const u = s.t / SHARD_IN;
        s.pos.lerpVectors(s.start, s.station, 1 - Math.pow(1 - u, 2.4));
        return false;
      }
      const k = (s.t - SHARD_IN) / (SHARD_BURST - SHARD_IN);
      const j = 0.12 * k;
      s.pos.set(
        s.station.x + Math.sin(s.t * 71 + s.wobble) * j,
        s.station.y + Math.sin(s.t * 83 + s.wobble * 2) * j,
        s.station.z,
      );
      return false;
    },
  },
  fire: { pattern: 'shardRing', duration: 0.3, firstDelay: SHARD_BURST - 0.18 },
  drops: { stars: 2, power: 0.4 },
});

/** 夕灯籠: intro carrier (runs one boss pattern at low intensity). */
registerEnemyKind('duskLantern', {
  shape: 'paperLantern', hp: 170, score: 1500, scale: 2.4, hitRadius: 3.2, color: 0xff9a50, coreColor: 0xffe2a8,
  spin: 0.5, spinAxis: 'y', haloScale: 0.85, haloGain: 0.35, big: true,
  drops: { stars: 8, power: 4 },
});

/* ---------------------------------------------------------------- formations */

/** A ring ahead of the player, entering from the depths behind its centre (sunset shards). */
registerFormation('circle', (i, n, w, out) => {
  const a = (i / n) * Math.PI * 2 + Math.PI / 2 + (w.x ?? 0);
  const R = 4.6;
  out.station.set(Math.cos(a) * R, 2.4 + (w.y ?? 0) + Math.sin(a) * R * 0.75, -42);
  out.start.set(out.station.x * 0.25, out.station.y * 0.3 + 5, -105);
  out.exit.set(out.station.x * 2.2, out.station.y + 10, -60);
});

/** A loose drifting cloud entering from one side (moths). Deterministic per member. */
registerFormation('flock', (i, n, w, out) => {
  const u = n > 1 ? i / (n - 1) : 0.5;
  const sx = w.side !== 0 ? -w.side : 1;
  out.station.set(
    sx * (-5.5 + u * 9) + (w.x ?? 0),
    4.2 + Math.sin(i * 2.3) * 1.6 + (w.y ?? 0),
    -40 - Math.cos(i * 1.7) * 4,
  );
  defaultEntry(w, out);
});
