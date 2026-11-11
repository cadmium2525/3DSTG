/**
 * Player: heroine model + glowing hitbox core, movement on the play plane,
 * lives and post-hit invincibility.
 */
import * as THREE from 'three';
import { FIELD, PALETTE, PLAYER } from '../core/config';
import { Heroine } from '../character/Heroine';

const CORE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CORE_FRAG = /* glsl */ `
uniform float uSlow;
uniform float uTime;
uniform float uAlpha;
uniform vec3 uRing;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0; // 1.0 = quad edge
  // Quad radius = 0.6 world; lethal radius 0.085 -> r ~ 0.14.
  float dot = 1.0 - smoothstep(0.08, 0.14, r);
  float halo = exp(-r * 9.0) * (0.6 + uSlow * 0.8);
  float ringR = 0.24 + 0.02 * sin(uTime * 6.0);
  float ring = (1.0 - smoothstep(0.0, 0.025, abs(r - ringR))) * (0.25 + uSlow * 0.75);
  float outer = (1.0 - smoothstep(0.0, 0.02, abs(r - 0.96))) * uSlow * 0.35; // graze range hint
  vec3 col = vec3(1.0) * dot + uRing * (halo + ring + outer);
  gl_FragColor = vec4(col * uAlpha, 1.0);
  #include <colorspace_fragment>
}`;

/** Lateral speed (units/s) that maps to |v| = 1 for the model's sway. */
const SWAY_SPEED = 7;
const KEY_SPEED = 6.5;

export class Player {
  readonly group = new THREE.Group();
  readonly heroine: Heroine;
  private pivot = new THREE.Group();
  readonly position: THREE.Vector3;
  private coreMat: THREE.ShaderMaterial;
  private core: THREE.Mesh;
  lives: number = PLAYER.lives;
  invincible = 0;
  /** Seconds of bomb (光の結界) protection: like `invincible`, but the model does not blink. */
  guard = 0;
  /** Debug: never take hits. */
  godMode = false;
  alive = true;
  /** Smoothed normalised velocity. */
  vx = 0;
  vy = 0;
  slow = false;
  private prevX = 0;
  private prevY = 0;
  private time = 0;
  /** Yaw: PI = facing camera (title), 0 = facing -Z (play). */
  private yaw = Math.PI;
  yawTarget = Math.PI;

  constructor() {
    this.heroine = new Heroine();
    // Own pivot so the model's internal rotations (banking) never fight our yaw.
    this.group.add(this.pivot);
    this.pivot.add(this.heroine.group);
    this.position = this.group.position;

    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: {
        uSlow: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uRing: { value: new THREE.Color(PALETTE.pink) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Diameter = 2 * grazeRadius so the outer hint ring shows the graze range.
    const size = PLAYER.grazeRadius * 2;
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.coreMat);
    this.core.renderOrder = 999;
    this.core.frustumCulled = false;
    this.group.add(this.core);
  }

  reset(): void {
    this.lives = PLAYER.lives;
    this.invincible = 0;
    this.guard = 0;
    this.alive = true;
    this.position.set(0, -1.2, FIELD.planeZ);
    this.prevX = this.position.x;
    this.prevY = this.position.y;
    this.vx = this.vy = 0;
    this.heroine.group.visible = true;
  }

  /** Title / result pose: at the origin facing the camera. */
  setTitlePose(): void {
    this.yawTarget = Math.PI;
  }

  setPlayPose(): void {
    this.yawTarget = 0;
  }

  /** Force the facing (title transformation drives the turn itself). */
  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.yawTarget = yaw;
  }

  /**
   * @param mdx, mdy world-space movement requested this frame (already scaled)
   * @param keyX, keyY keyboard axes
   * @param control whether input moves the player
   * @param coreVisible show the hitbox marker
   */
  update(dt: number, mdx: number, mdy: number, keyX: number, keyY: number, slow: boolean, control: boolean, coreVisible: boolean): void {
    this.time += dt;
    this.slow = slow;
    const p = this.position;
    if (control && this.alive) {
      const ks = KEY_SPEED * (slow ? PLAYER.slowFactor : 1) * dt;
      p.x += mdx + keyX * ks;
      p.y += mdy + keyY * ks;
      p.x = Math.max(-FIELD.halfW, Math.min(FIELD.halfW, p.x));
      p.y = Math.max(-FIELD.halfH, Math.min(FIELD.halfH, p.y));
    }
    p.z = FIELD.planeZ;
    // Normalised velocity for the model's sway.
    if (dt > 0) {
      const tvx = Math.max(-1, Math.min(1, (p.x - this.prevX) / dt / SWAY_SPEED));
      const tvy = Math.max(-1, Math.min(1, (p.y - this.prevY) / dt / SWAY_SPEED));
      const k = 1 - Math.exp(-dt * 10);
      this.vx += (tvx - this.vx) * k;
      this.vy += (tvy - this.vy) * k;
    }
    this.prevX = p.x;
    this.prevY = p.y;

    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);
    if (this.guard > 0) this.guard = Math.max(0, this.guard - dt);

    // Turn smoothly between title and play facing.
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 3));
    this.pivot.rotation.y = this.yaw;
    this.heroine.update(dt, { vx: this.vx, vy: this.vy, invincible: this.invincible });
    this.pivot.visible = this.alive;

    const u = this.coreMat.uniforms;
    u.uTime.value = this.time;
    u.uSlow.value += ((slow ? 1 : 0) - u.uSlow.value) * (1 - Math.exp(-dt * 10));
    const targetA = coreVisible && this.alive ? (slow ? 1 : 0.75) : 0;
    u.uAlpha.value += (targetA - u.uAlpha.value) * (1 - Math.exp(-dt * 8));
    this.core.visible = u.uAlpha.value > 0.01;
  }

  /** Title idle: slow turn around the facing direction. */
  titleIdle(t: number): void {
    this.yawTarget = Math.PI + Math.sin(t * 0.32) * 0.75;
  }

  /** Can bullets hurt us right now? */
  get vulnerable(): boolean {
    return this.alive && this.invincible <= 0 && this.guard <= 0 && !this.godMode;
  }

  /** Apply a hit; returns true if that was the last life. */
  hit(): boolean {
    this.lives = Math.max(0, this.lives - 1);
    if (this.lives <= 0) {
      this.alive = false;
      return true;
    }
    this.invincible = PLAYER.invincibleSec;
    return false;
  }
}
