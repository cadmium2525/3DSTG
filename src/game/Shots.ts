/**
 * Player auto-fire: pooled shots drawn with one InstancedMesh.
 * Shots lock onto the target nearest the forward axis (within a cone) and home
 * slightly, so hitting things never needs pixel-precise alignment.
 */
import * as THREE from 'three';
import { PALETTE } from '../core/config';
import { SHOT } from './StageData';

const MAX_SHOTS = 160;
export const MAX_TARGETS = 48;
/** Shots are recycled past this Z. */
const SHOT_FAR_Z = -90;

/** Per-frame list of things shots can hit, filled by Enemies / Boss. */
export class Targets {
  readonly x = new Float32Array(MAX_TARGETS);
  readonly y = new Float32Array(MAX_TARGETS);
  readonly z = new Float32Array(MAX_TARGETS);
  readonly r = new Float32Array(MAX_TARGETS);
  readonly id = new Int32Array(MAX_TARGETS);
  /** id -> index in this frame's list (or -1). */
  readonly lookup = new Int16Array(MAX_TARGETS);
  count = 0;

  begin(): void {
    this.count = 0;
    this.lookup.fill(-1);
  }

  add(id: number, x: number, y: number, z: number, r: number): void {
    const i = this.count;
    if (i >= MAX_TARGETS) return;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.r[i] = r;
    this.id[i] = id;
    this.lookup[id] = i;
    this.count++;
  }
}

export type ShotHitFn = (targetId: number, x: number, y: number, z: number) => void;

export class Shots {
  readonly mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX_SHOTS);
  private py = new Float32Array(MAX_SHOTS);
  private pz = new Float32Array(MAX_SHOTS);
  private vx = new Float32Array(MAX_SHOTS);
  private vy = new Float32Array(MAX_SHOTS);
  private vz = new Float32Array(MAX_SHOTS);
  private target = new Int32Array(MAX_SHOTS);
  private alive = new Uint8Array(MAX_SHOTS);
  private cursor = 0;
  private cooldown = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private dir = new THREE.Vector3();
  private fwd = new THREE.Vector3(0, 0, -1);
  private one = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  constructor() {
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.075, 0.075, 0.95);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.cyan).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SHOTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  clear(): void {
    this.alive.fill(0);
    this.mesh.count = 0;
  }

  /** Pick the target closest to the forward axis from (x, y, z), or -1. */
  private pickTarget(t: Targets, x: number, y: number, z: number): number {
    let best = -1;
    let bestScore = SHOT.aimCone;
    for (let i = 0; i < t.count; i++) {
      const dz = z - t.z[i];
      if (dz < 4) continue; // only things ahead
      const dx = t.x[i] - x;
      const dy = t.y[i] - y;
      // Angular offset, discounted by the target's size (big things are easier to lock).
      const lat = Math.max(0, Math.sqrt(dx * dx + dy * dy) - t.r[i] * 0.5);
      const s = lat / dz;
      if (s < bestScore) {
        bestScore = s;
        best = t.id[i];
      }
    }
    return best;
  }

  private spawn(x: number, y: number, z: number, t: Targets, spreadX: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_SHOTS;
    const id = this.pickTarget(t, x, y, z);
    this.dir.set(spreadX * 0.012, 0, -1);
    if (id >= 0) {
      const k = t.lookup[id];
      this.dir.set(t.x[k] - x + spreadX * 0.25, t.y[k] - y, t.z[k] - z);
    }
    this.dir.normalize().multiplyScalar(SHOT.speed);
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = this.dir.x;
    this.vy[i] = this.dir.y;
    this.vz[i] = this.dir.z;
    this.target[i] = id;
    this.alive[i] = 1;
  }

  /**
   * @param firing auto-fire on/off
   * @returns number of volleys fired this frame (for sfx throttling)
   */
  update(dt: number, firing: boolean, origin: THREE.Vector3, t: Targets, onHit: ShotHitFn): number {
    let volleys = 0;
    if (firing) {
      this.cooldown -= dt;
      while (this.cooldown <= 0) {
        this.cooldown += 1 / SHOT.rate;
        this.spawn(origin.x - 0.2, origin.y + 0.02, origin.z - 0.25, t, -1);
        this.spawn(origin.x + 0.2, origin.y + 0.02, origin.z - 0.25, t, 1);
        volleys++;
      }
    } else {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    const hom = 1 - Math.exp(-dt * SHOT.homing);
    let n = 0;
    for (let i = 0; i < MAX_SHOTS; i++) {
      if (!this.alive[i]) continue;
      // Homing toward the locked target (if still alive).
      const tid = this.target[i];
      if (tid >= 0) {
        const k = t.lookup[tid];
        if (k >= 0 && this.pz[i] - t.z[k] > 1) {
          this.dir.set(t.x[k] - this.px[i], t.y[k] - this.py[i], t.z[k] - this.pz[i]).normalize().multiplyScalar(SHOT.speed);
          this.vx[i] += (this.dir.x - this.vx[i]) * hom;
          this.vy[i] += (this.dir.y - this.vy[i]) * hom;
          this.vz[i] += (this.dir.z - this.vz[i]) * hom;
        } else if (k < 0) {
          this.target[i] = -1;
        }
      }
      const x0 = this.px[i];
      const y0 = this.py[i];
      const z0 = this.pz[i];
      const sx = this.vx[i] * dt;
      const sy = this.vy[i] * dt;
      const sz = this.vz[i] * dt;
      const x1 = x0 + sx;
      const y1 = y0 + sy;
      const z1 = z0 + sz;
      // Swept segment vs sphere test against every target.
      let hit = false;
      const segLen2 = sx * sx + sy * sy + sz * sz;
      for (let k = 0; k < t.count; k++) {
        const r = t.r[k];
        const tz = t.z[k];
        if (tz > z0 + r || tz < z1 - r) continue;
        const ox = t.x[k] - x0;
        const oy = t.y[k] - y0;
        const oz = tz - z0;
        let u = segLen2 > 0 ? (ox * sx + oy * sy + oz * sz) / segLen2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const cx = ox - sx * u;
        const cy = oy - sy * u;
        const cz = oz - sz * u;
        if (cx * cx + cy * cy + cz * cz <= r * r) {
          onHit(t.id[k], x0 + sx * u, y0 + sy * u, z0 + sz * u);
          hit = true;
          break;
        }
      }
      if (hit || z1 < SHOT_FAR_Z) {
        this.alive[i] = 0;
        continue;
      }
      this.px[i] = x1;
      this.py[i] = y1;
      this.pz[i] = z1;
      this.dir.set(this.vx[i], this.vy[i], this.vz[i]).normalize();
      this.q.setFromUnitVectors(this.fwd, this.dir);
      this.p.set(x1, y1, z1);
      this.m.compose(this.p, this.q, this.one);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
    return volleys;
  }
}
