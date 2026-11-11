/**
 * Camera: title framing (in front of the heroine) and the behind-the-player
 * gameplay framing, blended smoothly. Also handles fov for any aspect so the
 * player's reachable area always stays on screen, plus shake / roll.
 */
import * as THREE from 'three';
import { CAMERA, FIELD } from '../core/config';

/** Extra height so the player sits in the lower-middle of the screen. */
const FRAME_LIFT = 1.2;
/** Look slightly downward so the vanishing point sits a bit above centre. */
const LOOK_DROP = 0.035; // radians-ish (dy/dz of the look direction)
/** Screen margin around the player's reachable area (world units at z=0). */
const MARGIN_X = 0.75;
const MARGIN_Y = 1.0;

export type CameraMode = 'title' | 'play';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'title';
  /** 0 = title framing, 1 = play framing. */
  private blend = 0;
  private playPos = new THREE.Vector3(0, CAMERA.height + FRAME_LIFT, FIELD.planeZ + CAMERA.distance);
  private titlePos = new THREE.Vector3();
  private titleLook = new THREE.Vector3();
  private playLook = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private shakeAmp = 0;
  private shakeDecay = 4;
  private rollKick = 0;
  private roll = 0;
  private t = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 400);
  }

  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    const c = this.camera;
    c.aspect = aspect;
    // Default vertical fov; widen when the screen is too narrow (or too short)
    // for the area the player can reach relative to the following camera.
    const d = CAMERA.distance;
    const needX = (1 - CAMERA.followX) * FIELD.halfW + MARGIN_X;
    const needY = (1 - CAMERA.followY) * FIELD.halfH + CAMERA.height + FRAME_LIFT + MARGIN_Y;
    let tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    tanHalf = Math.max(tanHalf, needX / (d * aspect));
    // Below-centre extent: the look direction drops by LOOK_DROP, adding headroom.
    tanHalf = Math.max(tanHalf, needY / d - LOOK_DROP);
    c.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
    c.updateProjectionMatrix();
  }

  /** Visible half-height factor (tan of half fov) — for point sprite scaling. */
  get tanHalfFov(): number {
    return Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  shake(amp: number, decay = 4): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeDecay = decay;
    this.rollKick += (Math.random() < 0.5 ? -1 : 1) * amp * 0.08;
  }

  /** Jump instantly to the current mode's framing. */
  snap(): void {
    this.blend = this.mode === 'play' ? 1 : 0;
  }

  update(dt: number, player: THREE.Vector3, vx: number): void {
    this.t += dt;
    const target = this.mode === 'play' ? 1 : 0;
    const speed = this.mode === 'play' ? 1.1 : 0.7; // blend units per second
    if (this.blend < target) this.blend = Math.min(target, this.blend + dt * speed);
    else if (this.blend > target) this.blend = Math.max(target, this.blend - dt * speed);

    // Gameplay pose: partial follow, smoothed.
    const k = 1 - Math.exp(-dt * 9);
    const px = player.x * CAMERA.followX;
    const py = CAMERA.height + FRAME_LIFT + player.y * CAMERA.followY;
    this.playPos.x += (px - this.playPos.x) * k;
    this.playPos.y += (py - this.playPos.y) * k;
    this.playPos.z = FIELD.planeZ + CAMERA.distance;
    this.playLook.set(this.playPos.x * 0.9, this.playPos.y - LOOK_DROP * 60, this.playPos.z - 60);

    // Title pose: in front of the heroine (at the origin), slow gentle orbit.
    const orbit = Math.sin(this.t * 0.17) * 0.45;
    this.titlePos.set(Math.sin(orbit) * 2.75, -0.02 + Math.sin(this.t * 0.23) * 0.06, Math.cos(orbit) * 2.75);
    this.titleLook.set(0, -0.2, 0);

    const b = this.blend * this.blend * (3 - 2 * this.blend);
    this.tmpPos.lerpVectors(this.titlePos, this.playPos, b);
    this.tmpLook.lerpVectors(this.titleLook, this.playLook, b);
    // Swoop: arc over the heroine's head while switching sides.
    this.tmpPos.y += Math.sin(b * Math.PI) * 1.6;

    // Shake.
    if (this.shakeAmp > 0.0005) {
      const a = this.shakeAmp;
      this.tmpPos.x += Math.sin(this.t * 71.3) * a;
      this.tmpPos.y += Math.sin(this.t * 53.7 + 1.3) * a;
      this.shakeAmp *= Math.exp(-dt * this.shakeDecay);
    } else {
      this.shakeAmp = 0;
    }

    const c = this.camera;
    c.position.copy(this.tmpPos);
    c.lookAt(this.tmpLook);
    const targetRoll = -vx * 0.035 * b + this.rollKick;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 6));
    this.rollKick *= Math.exp(-dt * 5);
    c.rotateZ(this.roll);
  }
}
