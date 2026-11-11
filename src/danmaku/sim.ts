/** Headless danmaku simulation: pool + emitters + collision. No rendering. */
import { BULLET } from '../core/config';
import type { BulletClearedFn, DanmakuFrameResult, PatternHandle, PatternId, PatternOptions, Vec3Like } from '../core/types';
import { createEmitter, type EmitCtx, type Emitter } from './patterns';
import { BulletPool, makeSpawnParams, type CollideResult } from './pool';

const DENSITY = [0.55, 0.8, 1] as const;

export class DanmakuSim {
  readonly pool: BulletPool;
  private emitters: Emitter[] = [];
  private readonly ctx: EmitCtx;
  private readonly res: CollideResult = { hit: false, grazes: 0 };
  private readonly frame: DanmakuFrameResult = { hit: false, grazes: 0 };
  private qx = 0;
  private qy = 0;
  private qz = 0;
  private hasPlayer = false;
  quality: 0 | 1 | 2 = 2;
  /** Highest simultaneous bullet count seen (diagnostics). */
  peak = 0;

  constructor(cap: number = BULLET.max) {
    this.pool = new BulletPool(cap);
    this.ctx = { pool: this.pool, sp: makeSpawnParams(), px: 0, py: 0, density: 1 };
  }

  get playerX(): number { return this.qx; }
  get playerY(): number { return this.qy; }

  startPattern(id: PatternId, opts: PatternOptions): PatternHandle {
    const e = createEmitter(id, opts);
    this.emitters.push(e);
    return e;
  }

  stopAllPatterns(): void {
    for (const e of this.emitters) e.stop();
    this.emitters.length = 0;
  }

  update(dt: number, player: Vec3Like, collide: boolean): DanmakuFrameResult {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    if (!this.hasPlayer) {
      this.qx = player.x; this.qy = player.y; this.qz = player.z;
      this.hasPlayer = true;
    }
    this.pool.step(dt, this.qx, this.qy, this.qz, player.x, player.y, player.z, collide, this.res);
    this.qx = player.x; this.qy = player.y; this.qz = player.z;
    const ctx = this.ctx;
    ctx.px = player.x;
    ctx.py = player.y;
    ctx.density = DENSITY[this.quality];
    // Advance emitters; drop finished ones in place (no allocation).
    let w = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      e.update(dt, ctx);
      if (!e.done) this.emitters[w++] = e;
    }
    this.emitters.length = w;
    if (this.pool.n > this.peak) this.peak = this.pool.n;
    this.frame.hit = this.res.hit && collide;
    this.frame.grazes = collide ? this.res.grazes : 0;
    return this.frame;
  }

  clear(center?: Vec3Like, radius?: number, onCleared?: BulletClearedFn): number {
    if (!center) return this.pool.clear(0, 0, 0, -1, onCleared);
    return this.pool.clear(center.x, center.y, center.z, radius ?? 1e9, onCleared);
  }

  /** Remove everything immediately (no pop) and stop emitters. */
  reset(): void {
    this.stopAllPatterns();
    this.pool.reset();
    this.peak = 0;
  }
}
