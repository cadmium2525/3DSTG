// STUB — replaced by the integrator with the real procedural model.
import * as THREE from 'three';
import type { HeroineMotion } from '../core/types';
import { PLAYER } from '../core/config';

/**
 * The protagonist. `group` origin = chest = hitbox centre; she faces -Z
 * (her back is toward the gameplay camera). Total height = PLAYER.modelHeight.
 */
export class Heroine {
  readonly group = new THREE.Group();

  constructor() {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, PLAYER.modelHeight - 0.44, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    body.position.y = -0.15;
    this.group.add(body);
  }

  /** Call every frame. */
  update(dt: number, motion: HeroineMotion): void {
    this.group.rotation.z = -motion.vx * 0.3;
    this.group.visible = !(motion.invincible && motion.invincible > 0 && Math.floor(motion.invincible * 12) % 2 === 0);
  }

  dispose(): void {}
}
