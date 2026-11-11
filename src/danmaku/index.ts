// STUB — replaced by the danmaku module owner.
import * as THREE from 'three';
import type { Danmaku, PatternHandle } from '../core/types';

export function createDanmaku(): Danmaku {
  const object3d = new THREE.Group();
  return {
    object3d,
    activeCount: 0,
    startPattern(): PatternHandle { return { stop() {}, done: true }; },
    stopAllPatterns() {},
    update() { return { hit: false, grazes: 0 }; },
    clear() { return 0; },
    setQuality() {},
    dispose() {},
  };
}
