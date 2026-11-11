/**
 * Dodge bot + headless fairness check. Not used by the game; the dev page uses it for
 * `auto=1` and for `?fairness=1`. The bot reads only what a player can read on screen: where
 * and when each bullet will cross the play plane (exactly what the approach markers show).
 */
import { BULLET, FIELD, PLAYER } from '../core/config';
import type { PatternId, Vec3Like } from '../core/types';
import type { BulletPool } from './pool';
import { DanmakuSim } from './sim';

const GRID = 0.3;
const NX = Math.floor((2 * FIELD.halfW) / GRID) + 1;
const NY = Math.floor((2 * FIELD.halfH) / GRID) + 1;

export class DodgeBot {
  x = 0;
  y = 0;
  private gx = 0;
  private gy = 0;
  private replan = 0;
  private readonly cand: Float32Array;
  private readonly bx: Float32Array;
  private readonly by: Float32Array;
  private readonly bt: Float32Array;
  private readonly br: Float32Array;

  constructor(
    public speed = 6,
    public horizon = 1.1,
    cap: number = BULLET.max,
  ) {
    this.cand = new Float32Array((NX * NY + 1) * 2);
    let k = 0;
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NY; j++) {
        this.cand[k++] = -FIELD.halfW + i * GRID;
        this.cand[k++] = -FIELD.halfH + j * GRID;
      }
    this.bx = new Float32Array(cap);
    this.by = new Float32Array(cap);
    this.bt = new Float32Array(cap);
    this.br = new Float32Array(cap);
  }

  reset(x = 0, y = 0): void {
    this.x = this.gx = x;
    this.y = this.gy = y;
    this.replan = 0;
  }

  update(dt: number, pool: BulletPool): void {
    this.replan -= dt;
    if (this.replan <= 0) {
      this.replan = 1 / 30;
      this.plan(pool);
    }
    const dx = this.gx - this.x, dy = this.gy - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = this.speed * dt;
    if (d <= step) { this.x = this.gx; this.y = this.gy; }
    else { this.x += (dx / d) * step; this.y += (dy / d) * step; }
  }

  private plan(pool: BulletPool): void {
    const H = this.horizon;
    let m = 0;
    for (let i = 0; i < pool.n; i++) {
      if (pool.isDead(i)) continue;
      const tc = pool.T[i] - pool.age[i];
      if (tc < -0.03 || tc > H) continue;
      this.bx[m] = pool.tx[i];
      this.by[m] = pool.ty[i];
      this.bt[m] = Math.max(0, tc);
      this.br[m] = PLAYER.hitRadius + BULLET.radius * BULLET.hitScale * pool.size[i] + 0.09;
      m++;
    }
    const c = this.cand;
    const nc = NX * NY + 1;
    c[(nc - 1) * 2] = this.x;
    c[(nc - 1) * 2 + 1] = this.y;
    let best = Infinity, bgx = this.x, bgy = this.y;
    for (let k = 0; k < nc; k++) {
      const gx = c[k * 2], gy = c[k * 2 + 1];
      const ddx = gx - this.x, ddy = gy - this.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const ux = dist > 1e-6 ? ddx / dist : 0, uy = dist > 1e-6 ? ddy / dist : 0;
      let cost = 0.12 * dist + 0.015 * (gx * gx + gy * gy);
      for (let b = 0; b < m && cost < best; b++) {
        const tc = this.bt[b];
        const s = Math.min(this.speed * tc * 0.9, dist);
        const qx = this.x + ux * s - this.bx[b], qy = this.y + uy * s - this.by[b];
        const d2 = qx * qx + qy * qy;
        const rr = this.br[b];
        if (d2 < rr * rr) cost += 1000 * (1 + H - tc);
        else if (d2 < 1) cost += (1 - d2) * 0.6 * (1 - tc / (H + 0.2));
      }
      if (cost < best) { best = cost; bgx = gx; bgy = gy; }
    }
    this.gx = bgx;
    this.gy = bgy;
  }
}

export interface FairnessRow {
  pattern: PatternId;
  seeds: number;
  botSurvived: number;
  botHits: number;
  stationaryHitRuns: number;
  stationaryFirstHit: number;
  peak: number;
  avgAlive: number;
}

/** Boss-like emitter: hovering ahead of the player with a slow sway. */
export function bossOrigin(t: number, out: Vec3Like): Vec3Like {
  out.x = 1.1 * Math.sin(t * 0.45);
  out.y = 1.2 + 0.5 * Math.sin(t * 0.31);
  out.z = FIELD.enemyZ;
  return out;
}

export function runFairness(
  pattern: PatternId,
  opts: { seeds?: number; duration?: number; intensity?: number; dt?: number; quality?: 0 | 1 | 2; botSpeed?: number } = {},
): FairnessRow {
  const seeds = opts.seeds ?? 10;
  const duration = opts.duration ?? 15;
  const dt = opts.dt ?? 1 / 30;
  const intensity = opts.intensity ?? 0.5;
  const row: FairnessRow = {
    pattern, seeds, botSurvived: 0, botHits: 0, stationaryHitRuns: 0, stationaryFirstHit: 0, peak: 0, avgAlive: 0,
  };
  let firstSum = 0, aliveSum = 0, aliveN = 0;
  for (let s = 1; s <= seeds; s++) {
    for (let mode = 0; mode < 2; mode++) {
      const sim = new DanmakuSim();
      sim.quality = opts.quality ?? 2;
      const bot = new DodgeBot(opts.botSpeed ?? 6);
      let t = 0;
      const o = { x: 0, y: 0, z: 0 };
      sim.startPattern(pattern, { origin: () => bossOrigin(t, o), duration, intensity, seed: s * 7 + 3 });
      const p = { x: 0, y: 0, z: 0 };
      let hits = 0, inv = 0, first = -1;
      // Run past the emitter end so the last bullets arrive.
      while (t < duration + 4.5) {
        if (mode === 0) { bot.update(dt, sim.pool); p.x = bot.x; p.y = bot.y; }
        const r = sim.update(dt, p, inv <= 0);
        t += dt;
        inv -= dt;
        if (r.hit) { hits++; inv = PLAYER.invincibleSec; if (first < 0) first = t; }
        if (mode === 0 && t > 5 && t < duration) { aliveSum += sim.pool.n; aliveN++; }
      }
      if (mode === 0) {
        row.botHits += hits;
        if (hits === 0) row.botSurvived++;
        row.peak = Math.max(row.peak, sim.peak);
      } else if (hits > 0) {
        row.stationaryHitRuns++;
        firstSum += first;
      }
    }
  }
  row.stationaryFirstHit = row.stationaryHitRuns ? firstSum / row.stationaryHitRuns : -1;
  row.avgAlive = aliveSum / Math.max(1, aliveN);
  return row;
}
