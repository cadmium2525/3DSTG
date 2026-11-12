/**
 * Rendering: one InstancedMesh of camera-facing glow orbs (bullets) and one InstancedMesh of
 * play-plane reticles (approach markers). Additive, depthWrite off, fake bloom in the shader.
 */
import * as THREE from 'three';
import { BULLET, FIELD } from '../core/config';
import { POP_TIME, type BulletPool } from './pool';

const BULLET_VS = /* glsl */ `
attribute vec4 aPos;   // xyz, world radius (negative = dark bullet)
attribute vec4 aCol;   // rgb, alpha
uniform float uPxWorld; // world size of one pixel at view distance 1
uniform float uHalo;
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
varying float vNear;
varying float vDark;
void main() {
  vDark = step(aPos.w, 0.0);
  float z = aPos.z;
  float near = smoothstep(-36.0, -1.0, z);           // 0 far .. 1 at the play plane
  float fogIn = smoothstep(${(FIELD.enemyZ - 22).toFixed(1)}, ${(FIELD.enemyZ + 12).toFixed(1)}, z);
  float behind = 1.0 - smoothstep(0.05, 1.1, z);      // fade once past the player
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  float r = abs(aPos.w) * (0.88 + 0.14 * near);
  float minR = 1.7 * uPxWorld * -mv.z;               // never smaller than ~1.7px
  float rr = max(r, minR);
  mv.xy += position.xy * 2.0 * rr * uHalo;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0 * uHalo;                   // in units of the orb radius
  vCol = aCol.rgb;
  float energy = (r * r) / (rr * rr);                // dim when clamped to min size
  vAlpha = aCol.a * fogIn * behind * mix(0.5, 1.0, near) * mix(1.0, energy, 0.6);
  vNear = near;
}`;

const BULLET_FS = /* glsl */ `
uniform float uHalo;
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
varying float vNear;
varying float vDark;
void main() {
  float d = length(vUv);
  if (d > uHalo) discard;
  if (vDark > 0.5) {
    // Dark bullet (stage 3): a near-black core (hides what is behind it) inside a thin glowing
    // ring in the bullet colour and a soft outer glow, so it reads on black and on bright fx.
    float disc = smoothstep(0.9, 0.74, d);
    float ring = exp(-pow((d - 0.86) * 9.0, 2.0));
    float glint = exp(-pow((d - 0.5) * 12.0, 2.0)) * 0.16;
    float outer = exp(-d * d * 1.3) * (1.0 - d / uHalo) * smoothstep(0.75, 1.05, d);
    vec3 add = vCol * (ring * (0.85 + 0.75 * vNear) + glint + outer * (0.45 + 0.4 * vNear))
             + vec3(1.0) * ring * ring * (0.08 + 0.4 * vNear * vNear);
    float a = disc * 0.92 * vAlpha;
    vec3 core = vCol * 0.05 + vec3(0.012, 0.004, 0.02);
    gl_FragColor = vec4(core * a + add * vAlpha, a);
    return;
  }
  float core = smoothstep(0.56, 0.26, d);             // white-hot core ~ hit radius
  float body = smoothstep(1.0, 0.72, d);              // coloured orb
  float rim = exp(-pow((d - 0.84) * 7.0, 2.0));       // thin bright rim
  float halo = exp(-d * d * 1.5) * (1.0 - d / uHalo);
  vec3 c = vCol * (body * 0.6 + rim * 0.5 + halo * (0.3 + 0.35 * vNear))
         + vec3(1.0) * core * (0.1 + 1.0 * vNear * vNear);
  // Premultiplied output with alpha 0 = exactly the old additive blend (dst + c·alpha).
  gl_FragColor = vec4(c * vAlpha, 0.0);
}`;

const MARK_VS = /* glsl */ `
attribute vec4 aPos;   // x, y, ring radius, alpha
attribute vec4 aCol;   // rgb, tightness 0..1
uniform float uPlaneZ;
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
varying float vK;
varying float vR;
void main() {
  vec3 wp = vec3(aPos.xy + position.xy * 2.4 * aPos.z, uPlaneZ);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
  vUv = position.xy * 2.4;                            // units of ring radius
  vCol = aCol.rgb;
  vAlpha = aPos.w;
  vK = aCol.a;
  vR = aPos.z;
}`;

const MARK_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
varying float vK;
varying float vR;
void main() {
  float d = length(vUv);
  float w = 0.045 / vR + 0.05;                        // ~constant line width in world units
  float ring = smoothstep(w, 0.0, abs(d - 1.0));
  // Four inward ticks (reticle), rotated 45 degrees.
  vec2 q = abs(vec2(vUv.x + vUv.y, vUv.x - vUv.y)) * 0.7071;
  float tick = smoothstep(w * 0.9, 0.0, min(q.x, q.y)) * step(0.62, d) * step(d, 0.9);
  // Faint fill that brightens as the bullet arrives.
  float fill = smoothstep(1.0, 0.0, d) * 0.12 * vK;
  float dotc = smoothstep(0.16, 0.0, d) * vK * 0.8;
  float a = (ring + tick * 0.8 + fill + dotc) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vCol, vec3(1.0), 0.35 + 0.4 * vK), a);
}`;

/** Seconds before crossing at which a marker appears. */
const MARK_LEAD = 0.5;
const MARK_CAP = [110, 220, 320] as const;
const HALO = [2.2, 2.6, 2.8] as const;

export class DanmakuRenderer {
  readonly group = new THREE.Group();
  private readonly bullets: THREE.InstancedMesh;
  private readonly markers: THREE.InstancedMesh;
  private readonly bPos: THREE.InstancedBufferAttribute;
  private readonly bCol: THREE.InstancedBufferAttribute;
  private readonly mPos: THREE.InstancedBufferAttribute;
  private readonly mCol: THREE.InstancedBufferAttribute;
  private readonly bMat: THREE.ShaderMaterial;
  private readonly mMat: THREE.ShaderMaterial;
  private readonly bGeo: THREE.PlaneGeometry;
  private readonly mGeo: THREE.PlaneGeometry;
  private readonly size = new THREE.Vector2();
  private quality: 0 | 1 | 2 = 2;
  /** Markers drawn in the last sync (diagnostics). */
  markerCount = 0;

  constructor(cap: number = BULLET.max) {
    this.bGeo = new THREE.PlaneGeometry(1, 1);
    this.bPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.bCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.bPos.setUsage(THREE.DynamicDrawUsage);
    this.bCol.setUsage(THREE.DynamicDrawUsage);
    this.bGeo.setAttribute('aPos', this.bPos);
    this.bGeo.setAttribute('aCol', this.bCol);
    this.bMat = new THREE.ShaderMaterial({
      vertexShader: BULLET_VS,
      fragmentShader: BULLET_FS,
      uniforms: { uPxWorld: { value: 0.001 }, uHalo: { value: HALO[2] } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Premultiplied "over": normal bullets write alpha 0 (= additive, unchanged look),
      // dark bullets write their core coverage as alpha (darken what is behind them).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.bullets = new THREE.InstancedMesh(this.bGeo, this.bMat, cap);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.bullets.renderOrder = 11;
    const uPx = this.bMat.uniforms.uPxWorld;
    const size = this.size;
    this.bullets.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(size);
      const cam = camera as THREE.PerspectiveCamera;
      const fov = cam.isPerspectiveCamera ? cam.fov : 60;
      uPx.value = (2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, size.y);
    };

    const mcap = MARK_CAP[2];
    this.mGeo = new THREE.PlaneGeometry(1, 1);
    this.mPos = new THREE.InstancedBufferAttribute(new Float32Array(mcap * 4), 4);
    this.mCol = new THREE.InstancedBufferAttribute(new Float32Array(mcap * 4), 4);
    this.mPos.setUsage(THREE.DynamicDrawUsage);
    this.mCol.setUsage(THREE.DynamicDrawUsage);
    this.mGeo.setAttribute('aPos', this.mPos);
    this.mGeo.setAttribute('aCol', this.mCol);
    this.mMat = new THREE.ShaderMaterial({
      vertexShader: MARK_VS,
      fragmentShader: MARK_FS,
      uniforms: { uPlaneZ: { value: FIELD.planeZ } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.markers = new THREE.InstancedMesh(this.mGeo, this.mMat, mcap);
    this.markers.frustumCulled = false;
    this.markers.count = 0;
    this.markers.renderOrder = 10;

    this.group.name = 'danmaku';
    this.group.add(this.markers, this.bullets);
  }

  setQuality(q: 0 | 1 | 2): void {
    this.quality = q;
    this.bMat.uniforms.uHalo.value = HALO[q];
  }

  /** Copy the pool into the GPU buffers. Zero allocation. */
  sync(pool: BulletPool, playerX: number, playerY: number): void {
    const n = pool.n;
    const bp = this.bPos.array as Float32Array;
    const bc = this.bCol.array as Float32Array;
    const mp = this.mPos.array as Float32Array;
    const mc = this.mCol.array as Float32Array;
    const mcap = MARK_CAP[this.quality];
    let m = 0;
    const R = BULLET.radius;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      let size = pool.size[i] * R;
      let alpha = Math.min(1, pool.age[i] / 0.35);
      const dead = pool.isDead(i);
      if (dead) {
        const k = pool.popAge(i) / POP_TIME;
        size *= 1 + 1.4 * k;
        alpha *= (1 - k) * (1 - k) * 1.4;
      }
      bp[o] = pool.x[i]; bp[o + 1] = pool.y[i]; bp[o + 2] = pool.z[i]; bp[o + 3] = pool.dark[i] ? -size : size;
      bc[o] = pool.cr[i]; bc[o + 1] = pool.cg[i]; bc[o + 2] = pool.cb[i]; bc[o + 3] = alpha;

      // Approach marker at the predicted crossing point.
      if (dead || m >= mcap) continue;
      const tc = pool.T[i] - pool.age[i];
      if (tc <= 0 || tc > MARK_LEAD) continue;
      const tx = pool.tx[i], ty = pool.ty[i];
      if (Math.abs(tx) > FIELD.halfW + 0.15 || Math.abs(ty) > FIELD.halfH + 0.15) continue;
      const k = 1 - tc / MARK_LEAD; // 0 -> 1 as the bullet arrives
      const dx = tx - playerX, dy = ty - playerY;
      const dp = Math.sqrt(dx * dx + dy * dy);
      const threat = dp < 1.6 ? 1 - dp / 1.6 : 0;
      const mo = m * 4;
      mp[mo] = tx; mp[mo + 1] = ty;
      mp[mo + 2] = 0.46 - 0.3 * k * k;
      mp[mo + 3] = Math.min(1, Math.sqrt(k) * (0.14 + 0.7 * threat * threat));
      mc[mo] = pool.cr[i]; mc[mo + 1] = pool.cg[i]; mc[mo + 2] = pool.cb[i]; mc[mo + 3] = k;
      m++;
    }
    this.bullets.count = n;
    this.markers.count = m;
    this.markerCount = m;
    if (n > 0) {
      this.bPos.clearUpdateRanges(); this.bPos.addUpdateRange(0, n * 4); this.bPos.needsUpdate = true;
      this.bCol.clearUpdateRanges(); this.bCol.addUpdateRange(0, n * 4); this.bCol.needsUpdate = true;
    }
    if (m > 0) {
      this.mPos.clearUpdateRanges(); this.mPos.addUpdateRange(0, m * 4); this.mPos.needsUpdate = true;
      this.mCol.clearUpdateRanges(); this.mCol.addUpdateRange(0, m * 4); this.mCol.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.bGeo.dispose();
    this.mGeo.dispose();
    this.bMat.dispose();
    this.mMat.dispose();
    this.bullets.dispose();
    this.markers.dispose();
  }
}
