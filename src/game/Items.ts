/**
 * Item drops, pooled and drawn with ONE InstancedMesh of camera-facing quads:
 *  - star fragments (score): small spinning gold / cyan five-point stars;
 *  - orbs of light 光の玉 (shot power): white core, gold halo + ring, a rotating four-point
 *    light cross, a gentle bob and a sparkle trail — a different shape language from the
 *    round enemy bullets, and much slower.
 *
 * Motion (behind view): an item dropped by an enemy at z≈-40..-60 is tossed in an arc toward a
 * landing point on the play plane (z = 0, inside the field), easing out so it arrives — and
 * slows down where it can be read — within ~1–1.4 s. On the plane it drifts slowly down and
 * fades after a few seconds. It homes to the heroine when she is within the attraction radius
 * (bigger in slow mode), while she is above the collection line, or while a magnet is on
 * (bomb, boss / mid-boss phase break, stage clear). Homing items converge exponentially, so
 * even items still deep in the field reach her in well under a second.
 */
import * as THREE from 'three';
import { FIELD, PALETTE } from '../core/config';
import type { BulletClearedFn } from '../core/types';
import type { Effects } from './Effects';
import type { Rng } from './Rng';
import { ITEMS, SCORE } from './StageData';

export const MAX_ITEMS = 384;

export const enum ItemKind {
  Star = 0,
  Power = 1,
}

/** Called once per collected item (value = score for stars, orb count for power). */
export type ItemCollectFn = (kind: ItemKind, value: number) => void;

const enum Ph {
  Off = 0,
  Fly = 1,
  Float = 2,
  Home = 3,
}

/** Quad half-sizes (world units). */
const STAR_SIZE = 0.24;
const CANCEL_SIZE = 0.2;
const ORB_SIZE = 0.52;
/** Seconds an item lies on the plane before it vanishes (blinks during the last 1.4 s). */
const FLOAT_LIFE = 6.5;
const FALL_SPEED = 0.55;
/** Cap on the stars one clear produces; more bullets → each star carries several bullets' value. */
const CANCEL_STARS = 90;

const VERT = /* glsl */ `
attribute vec4 aPos;   // xyz, quad half-size
attribute vec4 aPar;   // kind (0 star / 1 orb), rotation, alpha, tint/phase 0..1
uniform float uPxWorld;
varying vec2 vUv;
varying float vKind;
varying float vRot;
varying float vAlpha;
varying float vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  float s = max(aPos.w, 2.5 * uPxWorld * -mv.z);
  mv.xy += position.xy * 2.0 * s;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vKind = aPar.x;
  vRot = aPar.y;
  vAlpha = aPar.z;
  vTint = aPar.w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vKind;
varying float vRot;
varying float vAlpha;
varying float vTint;
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  vec3 col;
  if (vKind < 0.5) {
    // Star fragment: five-point star, white centre, soft halo.
    vec2 q = rot2(p, vRot);
    float a = atan(q.y, q.x);
    float R = 0.26 + 0.34 * pow(0.5 + 0.5 * cos(5.0 * a), 2.6);
    float body = smoothstep(R + 0.05, R - 0.04, r);
    float core = smoothstep(0.22, 0.0, r);
    float halo = exp(-r * r * 6.0) * 0.4;
    vec3 tint = mix(vec3(1.0, 0.76, 0.3), vec3(0.32, 0.88, 1.0), step(0.5, vTint));
    float tw = 0.85 + 0.15 * sin(uTime * 9.0 + vTint * 40.0);
    col = tint * (body * 1.15 + halo) * tw + vec3(1.0) * core * 0.85;
  } else {
    // Orb of light: small white core, crisp gold ring, a rotating four-point light cross.
    float tw = 0.85 + 0.15 * sin(uTime * 6.0 + vTint * 25.0);
    float core = smoothstep(0.2, 0.08, r);
    float inner = exp(-r * r * 40.0) * 0.5;
    float halo = exp(-r * r * 5.0) * 0.22 * (1.0 - r);
    vec2 q = rot2(p, vRot);
    float flare = exp(-abs(q.x) * 36.0) * exp(-abs(q.y) * 2.4) + exp(-abs(q.y) * 36.0) * exp(-abs(q.x) * 2.4);
    vec2 q2 = rot2(p, 0.785 - vRot * 0.6);
    float flare2 = exp(-abs(q2.x) * 50.0) * exp(-abs(q2.y) * 6.0) + exp(-abs(q2.y) * 50.0) * exp(-abs(q2.x) * 6.0);
    float ring = exp(-pow((r - 0.46) * 26.0, 2.0)) * 0.7;
    vec3 gold = vec3(1.0, 0.78, 0.38);
    vec3 cyan = vec3(0.55, 0.95, 1.0);
    col = vec3(1.0) * (core + inner) + gold * (halo + ring) * tw + cyan * (flare * 1.1 + flare2 * 0.45) * tw;
  }
  col *= vAlpha * (1.0 - smoothstep(0.82, 1.0, r));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Items {
  readonly mesh: THREE.InstancedMesh;
  /** Items alive (debug / tests). */
  activeCount = 0;

  private kind = new Uint8Array(MAX_ITEMS);
  private ph = new Uint8Array(MAX_ITEMS);
  private magnet = new Uint8Array(MAX_ITEMS);
  private age = new Float32Array(MAX_ITEMS);
  private dur = new Float32Array(MAX_ITEMS);
  private arc = new Float32Array(MAX_ITEMS);
  private sx = new Float32Array(MAX_ITEMS);
  private sy = new Float32Array(MAX_ITEMS);
  private sz = new Float32Array(MAX_ITEMS);
  private lx = new Float32Array(MAX_ITEMS);
  private ly = new Float32Array(MAX_ITEMS);
  private x = new Float32Array(MAX_ITEMS);
  private y = new Float32Array(MAX_ITEMS);
  private z = new Float32Array(MAX_ITEMS);
  private vx = new Float32Array(MAX_ITEMS);
  private vy = new Float32Array(MAX_ITEMS);
  private value = new Float32Array(MAX_ITEMS);
  private rot = new Float32Array(MAX_ITEMS);
  private rotV = new Float32Array(MAX_ITEMS);
  private tint = new Float32Array(MAX_ITEMS);
  private size = new Float32Array(MAX_ITEMS);
  private life = new Float32Array(MAX_ITEMS);
  private homeT = new Float32Array(MAX_ITEMS);
  private noAttract = new Float32Array(MAX_ITEMS);
  private trailT = new Float32Array(MAX_ITEMS);
  private cursor = 0;

  private gPos: THREE.InstancedBufferAttribute;
  private gPar: THREE.InstancedBufferAttribute;
  private attrs: THREE.InstancedBufferAttribute[];
  private mat: THREE.ShaderMaterial;
  private sizeV = new THREE.Vector2();
  private time = 0;
  /** Seconds left of the global magnet (newly spawned items home too). */
  private magnetT = 0;

  // Bullet → star conversion (see beginFrame / cancelBullet).
  private stride = 1;
  private cancelN = 0;
  private bank = 0;

  constructor(private rng: Rng, private effects: Effects, private onCollect: ItemCollectFn) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.gPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ITEMS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.gPar = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ITEMS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.gPos);
    geo.setAttribute('aPar', this.gPar);
    this.attrs = [this.gPos, this.gPar];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPxWorld: { value: 0.001 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_ITEMS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12; // above the bullets
    const uPx = this.mat.uniforms.uPxWorld;
    const sv = this.sizeV;
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(sv);
      const cam = camera as THREE.PerspectiveCamera;
      const fov = cam.isPerspectiveCamera ? cam.fov : 60;
      uPx.value = (2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, sv.y);
    };
  }

  clear(): void {
    this.ph.fill(Ph.Off);
    this.magnetT = 0;
    this.bank = 0;
    this.cancelN = 0;
    this.activeCount = 0;
    this.mesh.count = 0;
  }

  /** Home every item now, and items spawned during the next `sec` seconds. */
  magnetAll(sec: number = ITEMS.magnetSec): void {
    this.magnetT = Math.max(this.magnetT, sec);
    for (let i = 0; i < MAX_ITEMS; i++) if (this.ph[i] !== Ph.Off) this.magnet[i] = 1;
  }

  private alloc(): number {
    for (let k = 0; k < MAX_ITEMS; k++) {
      const i = (this.cursor + k) % MAX_ITEMS;
      if (this.ph[i] === Ph.Off) {
        this.cursor = (i + 1) % MAX_ITEMS;
        return i;
      }
    }
    return -1;
  }

  private init(i: number, kind: ItemKind, x: number, y: number, z: number, value: number): void {
    const rng = this.rng;
    this.kind[i] = kind;
    this.value[i] = value;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.age[i] = 0;
    this.homeT[i] = 0;
    this.noAttract[i] = 0;
    this.trailT[i] = rng.next() * 0.06;
    this.life[i] = FLOAT_LIFE;
    this.tint[i] = rng.next();
    this.rot[i] = rng.next() * Math.PI * 2;
    this.rotV[i] = kind === ItemKind.Star ? (rng.next() < 0.5 ? -1 : 1) * (2.2 + rng.next() * 2.4) : 0.7;
    this.size[i] = kind === ItemKind.Star ? STAR_SIZE : ORB_SIZE;
    this.magnet[i] = this.magnetT > 0 ? 1 : 0;
  }

  /**
   * Drop `count` items from a destroyed enemy at (x, y, z): each is tossed toward a landing point
   * on the play plane inside the field. `spread` = scatter of the landing points (world units).
   */
  drop(kind: ItemKind, x: number, y: number, z: number, count: number, value: number, spread = 0.8): void {
    const rng = this.rng;
    const W = FIELD.halfW - 0.25;
    for (let k = 0; k < count; k++) {
      const i = this.alloc();
      if (i < 0) {
        this.onCollect(kind, value); // pool full: pay out directly
        continue;
      }
      const ox = (rng.next() - 0.5) * 1.6;
      const oy = (rng.next() - 0.5) * 1.6;
      this.init(i, kind, x + ox, y + oy, z, value);
      this.ph[i] = Ph.Fly;
      this.sx[i] = x + ox;
      this.sy[i] = y + oy;
      this.sz[i] = z;
      // Landing point: the enemy's position pulled into the field (≈ where it appears on screen).
      const lx = x * 0.4 + (rng.next() - 0.5) * spread * 2;
      // Kept around the middle of the field (below the enemy formation on screen); then falls.
      const ly = y * 0.1 + 0.1 + (rng.next() - 0.5) * spread * 1.4;
      this.lx[i] = Math.max(-W, Math.min(W, lx));
      this.ly[i] = Math.max(-FIELD.halfH + 0.6, Math.min(1.2, ly));
      this.dur[i] = 0.95 + rng.next() * 0.45;
      this.arc[i] = 0.5 + rng.next() * 0.7;
    }
  }

  /** Power orbs flying out of the heroine after a miss (re-collectable after a short delay). */
  scatter(x: number, y: number, z: number, count: number): void {
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const i = this.alloc();
      if (i < 0) return;
      this.init(i, ItemKind.Power, x, y, z, 1);
      this.magnet[i] = 0;
      this.ph[i] = Ph.Float;
      const a = ((k + rng.next() * 0.6) / count) * Math.PI * 2;
      const sp = 3.2 + rng.next() * 1.4;
      this.vx[i] = Math.cos(a) * sp;
      this.vy[i] = Math.sin(a) * sp + 1.6;
      this.noAttract[i] = 0.9;
    }
  }

  /** Call once per frame before anything may clear bullets: sets how many bullets make one star. */
  beginFrame(bulletCount: number): void {
    this.stride = Math.max(1, Math.ceil(bulletCount / CANCEL_STARS));
  }

  /** Danmaku.clear callback: removed bullets become star fragments that home to the heroine. */
  readonly cancelBullet: BulletClearedFn = (x, y, z) => {
    this.bank += SCORE.bulletCancel;
    if (++this.cancelN % this.stride !== 0) return;
    const v = this.bank;
    this.bank = 0;
    const i = this.alloc();
    if (i < 0) {
      this.onCollect(ItemKind.Star, v);
      return;
    }
    this.init(i, ItemKind.Star, x, y, z, v);
    this.size[i] = CANCEL_SIZE;
    this.ph[i] = Ph.Home;
    this.magnet[i] = 1;
    this.homeT[i] = -0.12 - this.rng.next() * 0.12; // hover a moment where the bullet was
  };

  /**
   * @param player heroine position; `collect` = she can pick items up (alive, playing)
   * @param slow slow mode (bigger attraction radius)
   */
  update(dt: number, player: THREE.Vector3, slow: boolean, collect: boolean): void {
    this.time += dt;
    if (this.magnetT > 0) this.magnetT = Math.max(0, this.magnetT - dt);
    const px = player.x;
    const py = player.y;
    const pz = player.z;
    const line = collect && py > ITEMS.collectLineY;
    const ar = slow ? ITEMS.attractRadiusSlow : ITEMS.attractRadius;
    const ar2 = ar * ar;
    const pr2 = ITEMS.pickupRadius * ITEMS.pickupRadius;
    const W = FIELD.halfW + 0.3;
    const pos = this.gPos.array as Float32Array;
    const par = this.gPar.array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX_ITEMS; i++) {
      const ph = this.ph[i];
      if (ph === Ph.Off) continue;
      const age = (this.age[i] += dt);
      this.rot[i] += this.rotV[i] * dt;
      let alpha = 1;

      if (ph === Ph.Fly) {
        const u = Math.min(1, age / this.dur[i]);
        const e = 1 - (1 - u) * (1 - u);
        this.x[i] = this.sx[i] + (this.lx[i] - this.sx[i]) * e;
        this.y[i] = this.sy[i] + (this.ly[i] - this.sy[i]) * e + Math.sin(Math.PI * u) * this.arc[i];
        this.z[i] = FIELD.planeZ + (this.sz[i] - FIELD.planeZ) * (1 - e);
        alpha = Math.min(1, u * 8);
        if (u >= 1) {
          this.ph[i] = Ph.Float;
          this.vx[i] = 0;
          this.vy[i] = 0;
        }
      } else if (ph === Ph.Float) {
        const d = Math.exp(-dt * 2.6);
        this.vx[i] *= d;
        this.vy[i] *= d;
        this.x[i] = Math.max(-W, Math.min(W, this.x[i] + this.vx[i] * dt));
        this.y[i] = Math.min(FIELD.halfH + 0.3, this.y[i] + (this.vy[i] - FALL_SPEED) * dt);
        this.z[i] += (FIELD.planeZ - this.z[i]) * (1 - Math.exp(-dt * 6));
        const l = (this.life[i] -= dt);
        if (l <= 0 || this.y[i] < -FIELD.halfH - 0.8) {
          this.ph[i] = Ph.Off;
          continue;
        }
        if (l < 1.4) alpha = Math.sin(age * 22) > -0.2 ? 1 : 0.25;
      } else {
        // Home: exponential approach that speeds up, plus a minimum speed.
        const ht = (this.homeT[i] += dt);
        if (ht > 0) {
          const k = (this.magnet[i] ? 2.6 : 7) + ht * (this.magnet[i] ? 9 : 16);
          const f = 1 - Math.exp(-dt * k);
          let dx = (px - this.x[i]) * f;
          let dy = (py - this.y[i]) * f;
          let dz = (pz - this.z[i]) * f;
          const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const minStep = 5 * dt;
          if (step > 1e-6 && step < minStep) {
            const rx = px - this.x[i], ry = py - this.y[i], rz = pz - this.z[i];
            const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
            const s = Math.min(rl, minStep) / Math.max(rl, 1e-6);
            dx = rx * s;
            dy = ry * s;
            dz = rz * s;
          }
          this.x[i] += dx;
          this.y[i] += dy;
          this.z[i] += dz;
        }
      }
      if (this.noAttract[i] > 0) this.noAttract[i] -= dt;

      // Pickup / attraction.
      if (collect) {
        const dx = this.x[i] - px;
        const dy = this.y[i] - py;
        const dz = this.z[i] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < pr2 && this.noAttract[i] <= 0 && (this.ph[i] !== Ph.Home || this.homeT[i] > 0)) {
          this.ph[i] = Ph.Off;
          this.onCollect(this.kind[i] as ItemKind, this.value[i]);
          continue;
        }
        if (this.ph[i] !== Ph.Home && this.noAttract[i] <= 0) {
          const near = Math.abs(dz) < 1.6 && d2 < ar2;
          if (this.magnet[i] || near || (line && this.z[i] > -30)) {
            this.ph[i] = Ph.Home;
            this.homeT[i] = 0;
          }
        }
      }

      // Sparkle trail behind the orbs of light.
      const orb = this.kind[i] === ItemKind.Power;
      if (orb && (this.trailT[i] -= dt) <= 0 && this.z[i] > -45) {
        this.trailT[i] = 0.07;
        this.effects.burst(this.x[i], this.y[i], this.z[i], this.tint[i] < 0.5 ? PALETTE.gold : PALETTE.white, 1, 0.6, 0.13, 0.42);
      }

      const o = n * 4;
      pos[o] = this.x[i];
      pos[o + 1] = this.y[i] + (orb ? Math.sin(age * 3.2 + this.tint[i] * 6.28) * 0.07 : 0);
      pos[o + 2] = this.z[i];
      pos[o + 3] = this.size[i];
      par[o] = this.kind[i];
      par[o + 1] = this.rot[i];
      par[o + 2] = alpha;
      par[o + 3] = this.tint[i];
      n++;
    }
    this.activeCount = n;
    this.mesh.count = n;
    this.mat.uniforms.uTime.value = this.time;
    if (n > 0) {
      for (const a of this.attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4);
        a.needsUpdate = true;
      }
    }
  }
}
