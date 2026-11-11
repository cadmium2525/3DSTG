/**
 * Enemy bullet pool: fixed capacity, struct-of-arrays, dense packing (alive = 0..n-1,
 * swap-remove), zero per-frame allocation. Pure logic — no three.js — so it can run headless.
 *
 * Motion model (closed form in bullet age `a`, so prediction is exact and frame-rate independent):
 *   z(a)   = oz + v0·a + ½·az·a²                       (accelerating approach)
 *   u(a)   = (z - oz) / (planeZ - oz)                 (0 at spawn, 1 on the play plane)
 *   axis   = o + (c - o)·u                             (axis glides from the emitter to its target on the plane)
 *   r(a)   = r0 + (r1 - r0)·u^ep                       (radius blooms from r0 to r1)
 *   θ(a)   = th1 + om·(a - T)                          (rotation about the Z axis, θ = th1 on arrival)
 *   x,y    = axis + r·(cosθ, sinθ)
 * T is the arrival age; the play-plane crossing point (tx, ty) is known at spawn time.
 */
import { BULLET, FIELD, PLAYER } from '../core/config';

/** Reusable spawn description (patterns fill one scratch instance; nothing allocates per bullet). */
export interface SpawnParams {
  /** Emitter / axis start position. */
  ox: number;
  oy: number;
  oz: number;
  /** Axis end point on the play plane. */
  cx: number;
  cy: number;
  /** Radius at spawn and at arrival, exponent of the bloom curve. */
  r0: number;
  r1: number;
  ep: number;
  /** Angle at arrival (rad) and angular velocity about the axis (rad/s). */
  th1: number;
  om: number;
  /** Flight time to the play plane (s) and end/start speed ratio (>=1 = accelerate). */
  T: number;
  accel: number;
  /** Initial age (s) — late spawns are pre-advanced so emission is frame-rate independent. */
  age: number;
  /** Visual size multiplier (1 = BULLET.radius) and colour 0..1. */
  size: number;
  r: number;
  g: number;
  b: number;
}

export function makeSpawnParams(): SpawnParams {
  return {
    ox: 0, oy: 0, oz: FIELD.enemyZ, cx: 0, cy: 0, r0: 0, r1: 0, ep: 1, th1: 0, om: 0,
    T: 3.8, accel: 2, age: 0, size: 1, r: 1, g: 1, b: 1,
  };
}

const F_GRAZED = 1;
const F_DEAD = 2; // popping (cleared / hit): visual only, no collision
const POP_TIME = 0.22;
const MAX_SPEED = BULLET.speedMax;
const PLAYER_HIT = PLAYER.hitRadius;
const PLAYER_GRAZE = PLAYER.grazeRadius;
export { POP_TIME };

export interface CollideResult {
  hit: boolean;
  grazes: number;
}

export class BulletPool {
  readonly cap: number;
  n = 0;
  /** Spawns refused because the pool was full (diagnostics). */
  dropped = 0;
  // spawn parameters
  readonly ox: Float32Array; readonly oy: Float32Array; readonly oz: Float32Array;
  readonly cx: Float32Array; readonly cy: Float32Array;
  readonly r0: Float32Array; readonly r1: Float32Array; readonly ep: Float32Array;
  readonly th1: Float32Array; readonly om: Float32Array;
  readonly T: Float32Array; readonly v0: Float32Array; readonly az: Float32Array;
  readonly tx: Float32Array; readonly ty: Float32Array;
  // state
  readonly age: Float32Array; readonly pop: Float32Array;
  readonly size: Float32Array; readonly cr: Float32Array; readonly cg: Float32Array; readonly cb: Float32Array;
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly flags: Uint8Array;
  private readonly arrays: (Float32Array | Uint8Array)[];

  constructor(cap: number = BULLET.max) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.ox = f(); this.oy = f(); this.oz = f(); this.cx = f(); this.cy = f();
    this.r0 = f(); this.r1 = f(); this.ep = f(); this.th1 = f(); this.om = f();
    this.T = f(); this.v0 = f(); this.az = f(); this.tx = f(); this.ty = f();
    this.age = f(); this.pop = f(); this.size = f(); this.cr = f(); this.cg = f(); this.cb = f();
    this.x = f(); this.y = f(); this.z = f(); this.px = f(); this.py = f(); this.pz = f();
    this.flags = new Uint8Array(cap);
    this.arrays = [
      this.ox, this.oy, this.oz, this.cx, this.cy, this.r0, this.r1, this.ep, this.th1, this.om,
      this.T, this.v0, this.az, this.tx, this.ty, this.age, this.pop, this.size, this.cr, this.cg,
      this.cb, this.x, this.y, this.z, this.px, this.py, this.pz, this.flags,
    ];
  }

  /** Returns the slot index or -1 when the pool is full (spawn dropped). */
  spawn(p: SpawnParams): number {
    if (this.n >= this.cap) {
      this.dropped++;
      return -1;
    }
    const i = this.n++;
    const D = Math.max(0.5, FIELD.planeZ - p.oz);
    // Speed profile v(a) = v0 + az·a with v(T)/v0 = accel, covering D in T.
    const k = Math.max(1, p.accel);
    let T = Math.max(0.4, p.T);
    // Keep the arrival speed under the design cap.
    const tMin = (2 * D * k) / ((1 + k) * MAX_SPEED);
    if (T < tMin) T = tMin;
    const v0 = (2 * D) / ((1 + k) * T);
    this.ox[i] = p.ox; this.oy[i] = p.oy; this.oz[i] = FIELD.planeZ - D;
    this.cx[i] = p.cx; this.cy[i] = p.cy;
    this.r0[i] = p.r0; this.r1[i] = p.r1; this.ep[i] = p.ep;
    this.th1[i] = p.th1; this.om[i] = p.om;
    this.T[i] = T; this.v0[i] = v0; this.az[i] = ((k - 1) * v0) / T;
    this.tx[i] = p.cx + p.r1 * Math.cos(p.th1);
    this.ty[i] = p.cy + p.r1 * Math.sin(p.th1);
    this.age[i] = p.age; this.pop[i] = 0;
    this.size[i] = p.size; this.cr[i] = p.r; this.cg[i] = p.g; this.cb[i] = p.b;
    this.flags[i] = 0;
    this.evalPos(i);
    this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.pz[i] = this.z[i];
    return i;
  }

  /** Writes x/y/z of slot i from its age (closed form). */
  evalPos(i: number): void {
    const a = this.age[i];
    const oz = this.oz[i];
    const z = oz + this.v0[i] * a + 0.5 * this.az[i] * a * a;
    let u = (z - oz) / (FIELD.planeZ - oz);
    if (u < 0) u = 0;
    const axx = this.ox[i] + (this.cx[i] - this.ox[i]) * u;
    const axy = this.oy[i] + (this.cy[i] - this.oy[i]) * u;
    const e = this.ep[i];
    const ue = e === 1 ? u : Math.pow(u, e);
    const r = this.r0[i] + (this.r1[i] - this.r0[i]) * ue;
    const th = this.th1[i] + this.om[i] * (a - this.T[i]);
    this.x[i] = axx + r * Math.cos(th);
    this.y[i] = axy + r * Math.sin(th);
    this.z[i] = z;
  }

  /** Swap-remove. Callers iterating must go from high to low indices. */
  remove(i: number): void {
    const last = --this.n;
    if (i !== last) {
      const arrs = this.arrays;
      for (let k = 0; k < arrs.length; k++) arrs[k][i] = arrs[k][last];
    }
  }

  isDead(i: number): boolean {
    return (this.flags[i] & F_DEAD) !== 0;
  }

  /** Seconds since the bullet started popping (only meaningful when dead). */
  popAge(i: number): number {
    return this.pop[i];
  }

  /** Start the pop animation; the bullet stops colliding and is recycled after POP_TIME. */
  kill(i: number): void {
    if (this.flags[i] & F_DEAD) return;
    this.flags[i] |= F_DEAD;
    this.pop[i] = 0;
  }

  /**
   * Advance every bullet by dt, recycle out-of-range ones, and run the swept collision test
   * against the player moving from (qx0,qy0,qz0) to (qx1,qy1,qz1).
   */
  step(
    dt: number,
    qx0: number, qy0: number, qz0: number,
    qx1: number, qy1: number, qz1: number,
    collide: boolean,
    out: CollideResult,
  ): void {
    out.hit = false;
    out.grazes = 0;
    const baseHit = BULLET.radius * BULLET.hitScale;
    const grazeR = PLAYER_GRAZE;
    const g2 = grazeR * grazeR;
    for (let i = this.n - 1; i >= 0; i--) {
      this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.pz[i] = this.z[i];
      this.age[i] += dt;
      this.evalPos(i);
      const z = this.z[i];
      if (this.flags[i] & F_DEAD) {
        this.pop[i] += dt;
        if (this.pop[i] >= POP_TIME) this.remove(i);
        continue;
      }
      if (z > FIELD.despawnZ || z < FIELD.farZ || this.age[i] > this.T[i] + 6) {
        this.remove(i);
        continue;
      }
      if (!collide) continue;
      // Quick reject on depth: both endpoints far on the same side of the player.
      const pz = this.pz[i];
      if ((pz - qz0 > grazeR + 0.05 && z - qz1 > grazeR + 0.05) || (qz0 - pz > grazeR + 0.05 && qz1 - z > grazeR + 0.05)) continue;
      // Swept test in the player's frame: segment P0->P1 against a sphere at the origin.
      const p0x = this.px[i] - qx0, p0y = this.py[i] - qy0, p0z = pz - qz0;
      const dx = this.x[i] - qx1 - p0x, dy = this.y[i] - qy1 - p0y, dz = z - qz1 - p0z;
      const dd = dx * dx + dy * dy + dz * dz;
      let t = dd > 1e-9 ? -(p0x * dx + p0y * dy + p0z * dz) / dd : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const mx = p0x + dx * t, my = p0y + dy * t, mz = p0z + dz * t;
      const d2 = mx * mx + my * my + mz * mz;
      if (d2 > g2) continue;
      const hr = PLAYER_HIT + baseHit * this.size[i];
      if (d2 <= hr * hr) {
        out.hit = true;
        this.kill(i);
        continue;
      }
      if (!(this.flags[i] & F_GRAZED)) {
        this.flags[i] |= F_GRAZED;
        out.grazes++;
      }
    }
  }

  /** Pop all live bullets within radius of (x,y,z) (all when radius < 0). Returns count. */
  clear(x: number, y: number, z: number, radius: number, onCleared?: (x: number, y: number, z: number) => void): number {
    let c = 0;
    const r2 = radius * radius;
    for (let i = 0; i < this.n; i++) {
      if (this.flags[i] & F_DEAD) continue;
      if (radius >= 0) {
        const dx = this.x[i] - x, dy = this.y[i] - y, dz = this.z[i] - z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
      }
      this.kill(i);
      if (onCleared) onCleared(this.x[i], this.y[i], this.z[i]);
      c++;
    }
    return c;
  }

  /** Live (non-popping) bullet count. */
  liveCount(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (!(this.flags[i] & F_DEAD)) c++;
    return c;
  }

  reset(): void {
    this.n = 0;
  }
}
