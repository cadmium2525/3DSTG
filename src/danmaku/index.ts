/**
 * Enemy bullets ("danmaku"): pooled bullets, five patterns, swept collision + graze, and
 * play-plane approach markers. See pool.ts (motion model), patterns.ts, render.ts.
 */
import type { Danmaku, DanmakuFrameResult, PatternHandle, PatternId, PatternOptions, Vec3Like } from '../core/types';
import { DanmakuRenderer } from './render';
import { DanmakuSim } from './sim';

export function createDanmaku(): Danmaku {
  return createDanmakuWithSim().danmaku;
}

/** Same as createDanmaku, but also returns the headless sim (dev tools / bots). */
export function createDanmakuWithSim(): { danmaku: Danmaku; sim: DanmakuSim } {
  const sim = new DanmakuSim();
  const view = new DanmakuRenderer(sim.pool.cap);
  const danmaku: Danmaku = {
    object3d: view.group,
    get activeCount() {
      return sim.pool.n;
    },
    startPattern(id: PatternId, opts: PatternOptions): PatternHandle {
      return sim.startPattern(id, opts);
    },
    stopAllPatterns() {
      sim.stopAllPatterns();
    },
    update(dt: number, player: Vec3Like, collide: boolean): DanmakuFrameResult {
      const r = sim.update(dt, player, collide);
      view.sync(sim.pool, player.x, player.y);
      return r;
    },
    clear(center?: Vec3Like, radius?: number): number {
      return sim.clear(center, radius);
    },
    setQuality(level: 0 | 1 | 2) {
      sim.quality = level;
      view.setQuality(level);
    },
    dispose() {
      sim.reset();
      view.dispose();
    },
  };
  return { danmaku, sim };
}

export { DanmakuSim } from './sim';
