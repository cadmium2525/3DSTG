/**
 * 光の結界 (bomb) visuals + timing: a hexagonal dome of light around the heroine (white rim,
 * cyan→gold hex lattice, shimmering cells), a short radiant flash at the start, and three rings
 * of light that sweep into the depths in step with the bullet-clearing radius. Also draws the
 * 決死ボム cue (a contracting ring) while a hit is pending. 4 draw calls, only while visible.
 * Gameplay (clearing, damage, invincibility) is driven by Game through `clearRadius` / ticks.
 */
import * as THREE from 'three';
import { BOMB } from './StageData';

/** Dome radius (world units) and total visual length (s). */
const DOME_R = 2.3;
const DOME_IN = 0.32;
const FADE_AT = 1.75;
const TOTAL = 2.35;
/** Clearing wave: distance from the heroine over WAVE_SEC (matches the rings). */
const WAVE_SEC = 1.15;
const WAVE_DIST = 74;
const RINGS = 3;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const DOME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uFlash;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Hex lattice: returns (distance to the cell edge, cell id).
vec3 hexCell(vec2 p) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = 0.5 - max(dot(q, normalize(r)), q.x);
  return vec3(d, p - g);
}
void main() {
  vec3 c = hexCell(vec2(vUv.x * 16.0, vUv.y * 9.0));
  float pole = smoothstep(0.0, 0.25, sin(vUv.y * 3.14159));
  // Anti-aliased hairline: constant pixel width, fades out where cells get too small to read.
  float fw = fwidth(c.x);
  float line = (1.0 - smoothstep(0.0, fw * 1.6 + 0.012, c.x)) * pole * (1.0 - smoothstep(0.06, 0.16, fw));
  float h = hash(c.yz);
  float cell = smoothstep(0.9, 1.0, sin(uTime * 2.6 + h * 40.0)) * 0.1 * pole;
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
  // Bright band sweeping up the dome.
  float sweep = exp(-pow((vUv.y - fract(uTime * 0.8)) * 8.0, 2.0)) * pole;
  vec3 cyan = vec3(0.42, 0.92, 1.0);
  vec3 gold = vec3(1.0, 0.8, 0.42);
  vec3 lat = mix(cyan, gold, smoothstep(0.25, 0.85, vUv.y));
  vec3 col = lat * (line * (0.32 + sweep * 0.55) + cell) + mix(gold, vec3(1.0), 0.5) * fres * (0.36 + uFlash * 0.3);
  col *= uFade * (gl_FrontFacing ? 1.0 : 0.22);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv * 2.0 - 1.0;
  vColor = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #endif
  #ifdef USE_INSTANCING
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif
}`;

/** Radiant flash: soft core + 12 rotating rays. */
const FLASH_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmt;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float rays = pow(0.5 + 0.5 * cos(a * 12.0 + uTime * 1.5), 10.0) * exp(-r * 2.2) * (1.0 - r);
  float rays2 = pow(0.5 + 0.5 * cos(a * 7.0 - uTime * 1.1), 14.0) * exp(-r * 1.6) * (1.0 - r) * 0.6;
  float core = exp(-r * r * 18.0);
  vec3 col = vec3(1.0, 0.9, 0.7) * (core * 0.5 + rays * 0.7) + vec3(0.5, 0.92, 1.0) * rays2 * 0.8;
  gl_FragColor = vec4(col * uAmt, 1.0);
  #include <colorspace_fragment>
}`;

/** Wave ring (instanced, tinted per instance): thin ring with radiant ticks. */
const RING_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float ring = exp(-pow((r - 0.9) * 40.0, 2.0));
  float inner = exp(-pow((r - 0.8) * 50.0, 2.0)) * 0.5;
  float ticks = smoothstep(0.75, 1.0, cos(a * 24.0)) * smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 0.9, r)) * 0.6;
  float fill = smoothstep(0.9, 0.2, r) * 0.05;
  gl_FragColor = vec4(vColor * (ring + inner + ticks + fill), 1.0);
  #include <colorspace_fragment>
}`;

/** 決死ボム cue: contracting pink-white ring with six inward ticks. */
const CUE_FRAG = /* glsl */ `
uniform float uAmt;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float ring = exp(-pow((r - 0.86) * 12.0, 2.0)) * 1.4;
  float ticks = smoothstep(0.9, 1.0, cos(a * 6.0 + uTime * 4.0)) * smoothstep(0.55, 0.75, r) * (1.0 - smoothstep(0.8, 0.86, r));
  vec3 col = mix(vec3(1.0, 0.45, 0.72), vec3(1.0), 0.35) * (ring + ticks * 0.8);
  gl_FragColor = vec4(col * uAmt, 1.0);
  #include <colorspace_fragment>
}`;

const additive = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending,
} as const;

export class Bomb {
  readonly group = new THREE.Group();
  /** Seconds since the bomb started (Infinity when idle). */
  t = Infinity;
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private flash: THREE.Mesh;
  private flashMat: THREE.ShaderMaterial;
  private rings: THREE.InstancedMesh;
  private cue: THREE.Mesh;
  private cueMat: THREE.ShaderMaterial;
  private origin = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private time = 0;

  constructor() {
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DOME_FRAG,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.domeMat);
    this.dome.renderOrder = 14;
    this.dome.frustumCulled = false;

    this.flashMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FLASH_FRAG,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
      ...additive,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat);
    this.flash.renderOrder = 15;
    this.flash.frustumCulled = false;

    const ringMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: RING_FRAG, ...additive });
    this.rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), ringMat, RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, this.c.setRGB(0, 0, 0));
    this.rings.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.rings.renderOrder = 13;
    this.rings.frustumCulled = false;

    this.cueMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: CUE_FRAG,
      uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
      ...additive,
    });
    this.cue = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cueMat);
    this.cue.renderOrder = 16;
    this.cue.frustumCulled = false;

    this.group.add(this.rings, this.dome, this.flash, this.cue);
    this.hideAll();
  }

  private hideAll(): void {
    this.dome.visible = false;
    this.flash.visible = false;
    this.rings.visible = false;
    this.cue.visible = false;
  }

  /** True while the bomb's visuals / effect are running. */
  get active(): boolean {
    return this.t < TOTAL;
  }

  /**
   * Radius (around the heroine) inside which bullets are cleared this frame, or -1 once the
   * barrier stops clearing. Sweeps out to the enemies in WAVE_SEC, then stays at "everything".
   */
  get clearRadius(): number {
    if (this.t > BOMB.clearSec) return -1;
    const u = Math.min(1, this.t / WAVE_SEC);
    return u >= 1 ? 1e9 : 2.2 + WAVE_DIST * (1 - (1 - u) * (1 - u));
  }

  start(p: THREE.Vector3): void {
    this.t = 0;
    this.origin.copy(p);
  }

  reset(): void {
    this.t = Infinity;
    this.hideAll();
  }

  /**
   * @param pending 0..1 progress of the 決死ボム window (-1 = no hit pending)
   * @returns number of damage ticks (BOMB.ticks) crossed this frame
   */
  update(dt: number, player: THREE.Vector3, pending: number): number {
    this.time += dt;
    // Deathbomb cue.
    if (pending >= 0) {
      const s = 1.9 - 1.3 * pending;
      this.cue.visible = true;
      this.cue.position.copy(player);
      this.cue.scale.setScalar(s);
      this.cueMat.uniforms.uAmt.value = 0.8 + 0.4 * Math.sin(this.time * 40);
      this.cueMat.uniforms.uTime.value = this.time;
    } else {
      this.cue.visible = false;
    }

    if (!this.active) {
      this.dome.visible = this.flash.visible = this.rings.visible = false;
      return 0;
    }
    const t0 = this.t;
    const t = (this.t += dt);
    let ticks = 0;
    for (let k = 0; k < BOMB.ticks.length; k++) if (t0 < BOMB.ticks[k] && t >= BOMB.ticks[k]) ticks++;
    if (t >= TOTAL) {
      this.dome.visible = this.flash.visible = this.rings.visible = false;
      return ticks;
    }

    // Dome: pops out with a slight overshoot, holds, then swells and fades.
    const ui = Math.min(1, t / DOME_IN);
    const back = 1 + 2.2 * Math.pow(ui - 1, 3) + 1.2 * Math.pow(ui - 1, 2);
    const out = t > FADE_AT ? (t - FADE_AT) / (TOTAL - FADE_AT) : 0;
    const r = DOME_R * back * (1 + out * 0.3);
    this.dome.visible = r > 0.01;
    this.dome.position.copy(player);
    this.dome.scale.setScalar(Math.max(0.01, r));
    this.dome.rotation.set(0.35, this.time * 0.35, 0.12);
    const u = this.domeMat.uniforms;
    u.uTime.value = this.time;
    u.uFade.value = Math.min(1, t / 0.08) * (1 - out) * (1 - out) * (0.85 + 0.15 * Math.sin(t * 9)) * 0.85;
    u.uFlash.value = Math.max(0, 1 - t / 0.4) * 0.6;

    // Start flash: grows fast, gone after ~0.7 s.
    const fu = t / 0.7;
    this.flash.visible = fu < 1;
    if (fu < 1) {
      this.flash.position.set(player.x, player.y, player.z + 0.3);
      this.flash.scale.setScalar(1.5 + 4.5 * Math.sqrt(fu));
      this.flashMat.uniforms.uAmt.value = (1 - fu) * (1 - fu) * 0.55;
      this.flashMat.uniforms.uTime.value = this.time;
    }

    // Rings of light sweeping into the depths (the clearing front).
    let n = 0;
    for (let k = 0; k < RINGS; k++) {
      const wu = (t - k * 0.12) / WAVE_SEC;
      if (wu <= 0 || wu >= 1) continue;
      const e = 1 - (1 - wu) * (1 - wu);
      const s = 2.4 + 26 * e;
      this.m.makeScale(s, s, 1);
      this.m.setPosition(this.origin.x, this.origin.y + e * 1.5, this.origin.z - WAVE_DIST * e);
      this.rings.setMatrixAt(n, this.m);
      // Fade in once the ring has left the camera's vicinity, fade out in the depths.
      const f = Math.pow(1 - wu, 1.4) * Math.min(1, wu / 0.22) * (k === 0 ? 0.5 : 0.32);
      if (k === 1) this.c.setRGB(1.0 * f, 0.82 * f, 0.45 * f);
      else this.c.setRGB(0.55 * f, 0.95 * f, 1.0 * f);
      this.rings.setColorAt(n, this.c);
      n++;
    }
    this.rings.count = n;
    this.rings.visible = n > 0;
    if (n > 0) {
      this.rings.instanceMatrix.needsUpdate = true;
      this.rings.instanceColor!.needsUpdate = true;
    }
    return ticks;
  }
}
