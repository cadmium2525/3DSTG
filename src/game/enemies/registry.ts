/**
 * Data-driven small enemies: shapes (instanced mesh variants), kinds (look + stats + motion +
 * fire script) and formations (where a wave's members enter / hover / leave).
 *
 * Stage files register what they need at import time:
 *   registerEnemyShape('moth', { core: () => geo, crown: () => geo });
 *   registerEnemyKind('moth', { shape: 'moth', hp: 14, score: 200, …, motion: { type: 'drift', vx: 1, vy: 0 } });
 *   registerFormation('spiral', (i, n, w, out, rng) => { out.station.set(…); defaultEntry(w, out); });
 *
 * Every shape is drawn as up to two InstancedMeshes (core + crown) shared by all kinds of that
 * shape, plus one shared halo InstancedMesh — so a new kind costs nothing, a new shape two draw
 * calls while it is on screen.
 */
import * as THREE from 'three';
import type { PatternId } from '../../core/types';
import type { Rng } from '../Rng';
import type { WaveEvent } from '../stages/types';

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface EnemyShapeDef {
  /** Lit, tinted body. Built once (at Enemies construction). Unit scale ≈ 1 world unit across. */
  core: () => THREE.BufferGeometry;
  /** Optional second part (petals, tentacles, orbiting shards) that "blooms" open on entry. */
  crown?: () => THREE.BufferGeometry;
}

const shapes = new Map<string, EnemyShapeDef>();

export function registerEnemyShape(id: string, def: EnemyShapeDef): void {
  shapes.set(id, def);
}

export function enemyShapes(): ReadonlyMap<string, EnemyShapeDef> {
  return shapes;
}

/* ------------------------------------------------------------------ */
/* Kinds                                                               */
/* ------------------------------------------------------------------ */

/** Snapshot handed to custom motion scripts (mutate `pos`; return true to remove the enemy). */
export interface EnemyMotionState {
  /** Seconds since this enemy became visible (after its stagger delay). */
  t: number;
  dt: number;
  /** Global enemy clock (for sway). */
  time: number;
  pos: THREE.Vector3;
  start: THREE.Vector3;
  station: THREE.Vector3;
  exit: THREE.Vector3;
  /** WaveEvent.stay. */
  stay: number;
  /** Per-enemy random phase 0..2π. */
  wobble: number;
}

export type EnemyMotion =
  /** Fly in to the formation station, hover (sway) for `stay` s, fly out. The default. */
  | { type: 'station' }
  /** Like station, but while "hovering" it drifts with this velocity (units/s) plus a sway. */
  | { type: 'drift'; vx: number; vy: number; vz?: number; sway?: number }
  /** No hover: fly start → exit in `stay` seconds (e.g. a comet streaking across); `arc` bulges the path upward. */
  | { type: 'path'; arc?: number }
  /** Anything else. Return true once the enemy should disappear (no score). */
  | { type: 'custom'; update(s: EnemyMotionState): boolean };

export interface EnemyFire {
  pattern: PatternId;
  /** Seconds each volley's emitter runs (default 0.5). Ignored for `continuous`. */
  duration?: number;
  /** Start one emitter when it becomes active (after `firstDelay`) and keep it for its whole life. */
  continuous?: boolean;
  firstDelay?: number;
  /** Multiplies the wave intensity (default 1). */
  intensityMul?: number;
}

export interface EnemyKindDef {
  hp: number;
  score: number;
  /** Generous shot hit radius (world units). */
  hitRadius: number;
  /** Stars (score) and power orbs dropped on kill; fractional power accumulates across kills. */
  drops: { stars: number; power: number };
  /** Big kill (bigger explosion, camera shake, wider drop spread). */
  big?: boolean;

  /* look */
  /** Registered shape id (default 'flower'). */
  shape?: string;
  /** Visual scale. */
  scale: number;
  /** Crown + halo tint (and explosion colour). */
  color: number;
  /** Core tint (default: `color` lifted toward white). */
  coreColor?: number;
  /** Halo size relative to `scale` (default 1) and brightness (default 0.45). */
  haloScale?: number;
  haloGain?: number;
  /** Spin speed (rad/s) and axis: 'z' = in the screen plane (default), 'y' = upright turn. */
  spin?: number;
  spinAxis?: 'z' | 'y';
  /** Orient the shape's +Y along its direction of travel (streaking kinds). */
  faceMotion?: boolean;
  /** Crown breathing (jellyfish swim): crown scale × (1 + amount·sin(speed·t)). */
  pulse?: { speed: number; amount: number };
  /** Particle trail behind it (Effects bursts). */
  trail?: { color: number; every: number; size: number; life: number };

  /* behaviour */
  motion?: EnemyMotion;
  /** Fire script; default aimedBurst volleys every WaveEvent.fireEvery. null = never fires. */
  fire?: EnemyFire | null;
}

const kinds = new Map<string, EnemyKindDef>();

export function registerEnemyKind(id: string, def: EnemyKindDef): void {
  kinds.set(id, def);
}

export function getEnemyKind(id: string): EnemyKindDef {
  const k = kinds.get(id);
  if (!k) throw new Error(`Unknown enemy kind "${id}" (register it with registerEnemyKind)`);
  return k;
}

export function hasEnemyKind(id: string): boolean {
  return kinds.has(id);
}

/* ------------------------------------------------------------------ */
/* Formations                                                          */
/* ------------------------------------------------------------------ */

export interface FormationSlot {
  station: THREE.Vector3;
  start: THREE.Vector3;
  exit: THREE.Vector3;
}

/** Fill `out` for member i of n. */
export type FormationFn = (i: number, n: number, w: WaveEvent, out: FormationSlot, rng: Rng) => void;

const formations = new Map<string, FormationFn>();

export function registerFormation(id: string, fn: FormationFn): void {
  formations.set(id, fn);
}

export function getFormation(id: string): FormationFn {
  return formations.get(id) ?? formations.get('center')!;
}

export function hasFormation(id: string): boolean {
  return formations.has(id);
}

/** The classic entry: from the side (side ≠ 0) or from the depths, leaving up and outward. */
export function defaultEntry(w: WaveEvent, out: FormationSlot): void {
  const st = out.station;
  const sgn = w.side !== 0 ? w.side : st.x >= 0 ? 1 : -1;
  if (w.side !== 0) out.start.set(st.x + w.side * 18, st.y + 3, st.z - 30);
  else out.start.set(st.x * 1.8, st.y + 7, st.z - 60);
  out.exit.set(st.x + sgn * 16, st.y + 9, st.z - 25);
}

registerFormation('line', (i, n, w, out) => {
  const x = n > 1 ? -6 + (12 * i) / (n - 1) : 0;
  out.station.set(x, 4.6 + Math.sin(i * 1.7) * 0.6, -40 - (w.side !== 0 ? (w.side > 0 ? n - i : i) * 0.6 : 0));
  defaultEntry(w, out);
});

registerFormation('v', (i, n, w, out) => {
  const c = (n - 1) / 2;
  const d = Math.abs(i - c);
  out.station.set((i - c) * 2.3, 6.2 - d * 1.1, -44 + d * 2.4);
  defaultEntry(w, out);
});

registerFormation('arc', (i, n, w, out) => {
  const a = (n > 1 ? i / (n - 1) : 0.5) * Math.PI * 0.8 + Math.PI * 0.1;
  out.station.set(-Math.cos(a) * 7, 1.6 + Math.sin(a) * 4.6, -42);
  defaultEntry(w, out);
});

registerFormation('columns', (i, _n, w, out) => {
  const row = Math.floor(i / 2);
  const sx = i % 2 === 0 ? -1 : 1;
  out.station.set(sx * 4.8, 6.4 - row * 2.2, -37 - row * 3);
  defaultEntry(w, out);
});

registerFormation('center', (_i, _n, w, out) => {
  out.station.set(0, 1.6, -50);
  defaultEntry(w, out);
});

/**
 * Pairs hugging the left and right edges of the corridor, close to the player (turrets).
 * Members alternate left / right; each pair sits lower than the previous. They slide in sideways.
 */
registerFormation('sides', (i, _n, w, out) => {
  const row = Math.floor(i / 2);
  const sx = i % 2 === 0 ? -1 : 1;
  const y = (w.y ?? 3.2) - row * 2.6;
  const z = -27 - row * 3;
  out.station.set(sx * 6.1, y, z);
  out.start.set(sx * 17, y + 1.5, z - 8);
  out.exit.set(sx * 17, y + 6, z - 14);
});

/**
 * Diagonal streak across the view (comets): from a high far corner to the opposite lower near
 * corner. w.x picks the direction (1 = from the upper right, -1 = upper left, 0 = alternate per member).
 */
registerFormation('diagonal', (i, _n, w, out) => {
  const dir = w.x ? Math.sign(w.x) : i % 2 === 0 ? -1 : 1;
  const dy = (w.y ?? 0) - (i % 3) * 1.4;
  out.start.set(dir * 15, 10 + dy, -74);
  out.exit.set(-dir * 14, -6 + dy, -22);
  out.station.lerpVectors(out.start, out.exit, 0.5);
});

/** Loose random cloud ahead (seeded by the run's RNG). */
registerFormation('scatter', (_i, _n, w, out, rng) => {
  out.station.set(rng.range(-6.2, 6.2), rng.range(0.4, 6.4), rng.range(-48, -38));
  defaultEntry(w, out);
});

/** Wide gentle arc low and far (drifting jellyfish rising through the view). */
registerFormation('low', (i, n, w, out) => {
  const u = n > 1 ? i / (n - 1) : 0.5;
  out.station.set((u - 0.5) * 11 + (w.x ?? 0), -1.2 + Math.sin(u * Math.PI) * 1.6 + (w.y ?? 0), -46 + Math.abs(u - 0.5) * 6);
  out.start.set(out.station.x * 1.4, out.station.y - 9, out.station.z - 30);
  out.exit.set(out.station.x * 1.3, out.station.y + 14, out.station.z - 20);
});
