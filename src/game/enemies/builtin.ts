/** Built-in enemy shapes shared by every stage. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerEnemyShape } from './registry';

/** Crystal core + a six-petal crown cupped toward the camera (stage 1's petal / crystal / lantern). */
registerEnemyShape('flower', {
  core: () => {
    const g = new THREE.IcosahedronGeometry(0.42, 0);
    g.scale(1, 1.35, 1);
    return g;
  },
  crown: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.26, 0.62, 0.1);
      g.translate(0, 0.78, 0);
      g.rotateX(-0.35); // slightly cupped toward the camera
      g.rotateZ((k / 6) * Math.PI * 2);
      parts.push(g);
    }
    return mergeGeometries(parts)!;
  },
});

/** Helper for stage shape files: merge non-indexed parts and recompute flat normals. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
}
