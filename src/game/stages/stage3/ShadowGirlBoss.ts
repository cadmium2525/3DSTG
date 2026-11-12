/**
 * Stage 3 final boss 「影の少女」: the heroine's own shadow (src/character/ShadowGirl.ts), shown
 * large and facing the player, floating in the abyss with a slow, menacing drift. Behind her a
 * dark corona (an eclipse of violet / crimson flame) makes the black silhouette readable; her
 * flames grow phase by phase. Everything is drawn above the darkness overlay.
 *
 * She also drives the darkness (Background DARK_MOD) and the abyss layer (ABYSS_LIGHT):
 *   光喰い          — the light around the heroine shrinks;
 *   光と影の螺旋    — the heroine's light grows as the boss HP falls (radius expands, the dark thins);
 *   defeat          — her flames turn to light, she dissolves into motes of light that flow into
 *                     the heroine, and the darkness lifts completely.
 */
import * as THREE from 'three';
import { ShadowGirl } from '../../../character/ShadowGirl';
import type { PatternHandle } from '../../../core/types';
import { SHADOW_TRACK } from '../../../danmaku/stage3';
import { DARK_MOD } from '../../Background';
import { PhasedBoss } from '../../bosses/PhasedBoss';
import { BossState, type BossConfig, type BossContext } from '../../bosses/BossLike';
import { ABYSS_LIGHT } from './background';

export interface ShadowGirlConfig extends BossConfig {
  /** World height of the figure. */
  size: number;
  swayX: number;
  swayY: number;
  swayZ: number;
  /** Index of the phase that eats the light (光喰い) and of the final spell; -1 = none. */
  eaterPhase: number;
  finalPhase: number;
  /** Lit-radius multiplier at the end of 光喰い, and at the end of the final spell. */
  eaterRadius: number;
  finalRadius: number;
  /** Darkness amount multiplier at the end of the final spell. */
  finalAmount: number;
}

const MOTES = 260;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Eclipse corona: a black core ringed by flickering flame tongues (shadow → light with uLight). */
const CORONA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlame;
uniform float uLight;
uniform float uFade;
uniform float uFlash;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.y *= 0.72;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime;
  float tongues = 0.55 + 0.25 * sin(a * 7.0 + t * 1.3) + 0.2 * sin(a * 13.0 - t * 2.1) + 0.12 * sin(a * 23.0 + t * 3.7);
  float edge = 0.36 + 0.07 * uFlame * tongues;
  float ring = exp(-pow((r - edge) * (9.0 - uFlame * 2.0), 2.0));
  float outer = exp(-max(0.0, r - edge) * 7.0) * smoothstep(edge - 0.08, edge, r) * 0.42;
  float inner = smoothstep(edge, 0.0, r) * 0.16;
  float clip = smoothstep(0.98, 0.62, r);
  vec3 shadowA = vec3(0.55, 0.16, 0.95);
  vec3 shadowB = vec3(1.0, 0.18, 0.42);
  vec3 sc = mix(shadowA, shadowB, 0.5 + 0.5 * sin(a * 3.0 + t * 0.7));
  vec3 lc = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.97, 0.85), 0.5 + 0.5 * sin(a * 3.0 + t));
  vec3 c = mix(sc, lc, uLight);
  vec3 col = c * (ring * (0.65 + 0.35 * uFlame) + outer * (0.5 + 0.4 * uFlame)) + c * inner * uLight * 3.0;
  col *= clip * uFade * (1.0 + uFlash * 0.4);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const MOTE_VERT = /* glsl */ `
attribute vec4 aStart; // xyz offset on her body (world units), w departure delay (s)
attribute vec4 aSeed;  // x flight time, y bulge, z phase, w size
uniform float uT;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uScale;
uniform float uOn;
varying float vAlpha;
varying float vHot;
void main() {
  float u = clamp((uT - aStart.w) / aSeed.x, 0.0, 1.0);
  float e = u * u * (3.0 - 2.0 * u);
  vec3 a = uFrom + aStart.xyz;
  vec3 b = uTo + vec3(sin(aSeed.z * 6.28) * 0.25, cos(aSeed.z * 6.28) * 0.25, 0.0);
  vec3 p = mix(a, b, e);
  // Curving streams (a spiral around the straight path).
  float s = sin(u * 3.14159);
  p.x += s * aSeed.y * cos(aSeed.z * 6.28 + u * 4.0) * 6.0;
  p.y += s * aSeed.y * sin(aSeed.z * 6.28 + u * 4.0) * 4.0 + s * 2.0;
  // Before departure the motes glimmer on her body.
  float shimmer = 0.6 + 0.4 * sin(uT * 9.0 + aSeed.z * 40.0);
  float pre = smoothstep(aStart.w - 1.2, aStart.w, uT) * step(uT, aStart.w);
  float fly = step(aStart.w, uT) * (1.0 - smoothstep(0.92, 1.0, u));
  vAlpha = uOn * max(pre * 0.6 * shimmer, fly);
  vHot = u;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSeed.w * (0.7 + s * 0.8) * uScale / max(0.5, -mv.z), 1.0, 36.0);
  if (vAlpha <= 0.001) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */ `
varying float vAlpha;
varying float vHot;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float g = pow(max(0.0, 1.0 - d), 2.0);
  float core = smoothstep(0.35, 0.0, d);
  vec3 c = mix(vec3(1.0, 0.8, 0.45), vec3(0.85, 0.97, 1.0), vHot) * g + vec3(1.0) * core * 0.8;
  gl_FragColor = vec4(c * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

export class ShadowGirlBoss extends PhasedBoss<ShadowGirlConfig> {
  private girl: ShadowGirl;
  private coronaMat: THREE.ShaderMaterial;
  private corona: THREE.Mesh;
  private moteMat: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private probe: PatternHandle | null = null;
  private vx = 0;
  private lastX = 0;
  private flameT = 1;
  private lightT = 0;
  /** Targets for DARK_MOD / ABYSS_LIGHT (eased in animate). */
  private darkR = 1;
  private darkA = 1;
  private abyss = 0;
  private sparkT = 0;
  private arrived = 0;
  private size = new THREE.Vector2();

  constructor(ctx: BossContext<ShadowGirlConfig>) {
    super(ctx);
    const S = this.config.size;
    this.girl = new ShadowGirl(S);
    this.girl.setRenderOrder(3.2);
    this.group.add(this.girl.group);

    this.coronaMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: CORONA_FRAG,
      uniforms: { uTime: { value: 0 }, uFlame: { value: 1 }, uLight: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(S * 1.6, S * 2.2), this.coronaMat);
    this.corona.position.set(0, S * 0.04, -S * 0.25);
    this.corona.renderOrder = 3;
    this.corona.frustumCulled = false;
    this.group.add(this.corona);

    // Light motes (her dissolution): start points inside her silhouette.
    const start = new Float32Array(MOTES * 4);
    const seed = new Float32Array(MOTES * 4);
    const r = this.rng;
    for (let i = 0; i < MOTES; i++) {
      // Rough figure: head / torso / skirt bands, from the flame tips (top) downward.
      const h = r.next();
      const y = (0.42 - h * 1.0) * S;
      const w = (h < 0.2 ? 0.12 : h < 0.55 ? 0.17 : 0.28) * S;
      start[i * 4] = (r.next() - 0.5) * 2 * w;
      start[i * 4 + 1] = y;
      start[i * 4 + 2] = (r.next() - 0.5) * 0.15 * S;
      start[i * 4 + 3] = 1.5 + h * 1.7 + r.next() * 0.9; // the top burns away first
      seed[i * 4] = 1.3 + r.next() * 0.8;
      seed[i * 4 + 1] = 0.2 + r.next() * 0.8;
      seed[i * 4 + 2] = r.next();
      seed[i * 4 + 3] = 0.25 + r.next() * 0.45;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 4));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      uniforms: {
        uT: { value: 0 }, uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() },
        uScale: { value: 600 }, uOn: { value: 0 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(g, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 12;
    this.motes.visible = false;
    this.motes.onBeforeRender = (renderer, _s, camera) => {
      renderer.getDrawingBufferSize(this.size);
      const cam = camera as THREE.PerspectiveCamera;
      this.moteMat.uniforms.uScale.value = this.size.y / (2 * Math.tan(((cam.fov ?? 60) * Math.PI) / 360));
    };
    // Motes live in world space (they leave her), so they are not under `group`'s transform.
    this.group.add(this.motes);
  }

  /** Point the darkness back at the preset (all modifiers 1, abyss unlit). */
  private resetLight(): void {
    DARK_MOD.amount = DARK_MOD.radius = 1;
    ABYSS_LIGHT.value = 0;
    this.darkA = this.darkR = 1;
    this.abyss = 0;
  }

  protected onReset(): void {
    this.resetLight();
    this.girl.fade = 0;
    this.girl.light = 0;
    this.girl.flash = 0;
    this.girl.group.visible = true;
    this.girl.group.scale.setScalar(1);
    this.flameT = 1;
    this.lightT = 0;
    this.motes.visible = false;
    this.moteMat.uniforms.uOn.value = 0;
    this.probe?.stop();
    this.probe = null;
  }

  protected onSpawn(): void {
    const P = this.config.position;
    this.position.set(P.x, P.y - 4, -120);
    this.lastX = this.position.x;
  }

  /** She drifts up out of the depths, fading in, flames rising. */
  protected moveEnter(u: number): void {
    const P = this.config.position;
    const e = 1 - Math.pow(1 - u, 2.4);
    this.position.set(P.x, P.y - 4 * (1 - e), -120 + (P.z + 120) * e);
    this.girl.fade = Math.min(1, u * 1.4);
  }

  private drift(dt: number): void {
    const C = this.config;
    const P = C.position;
    const k = 1 + Math.max(0, this.phaseIndex) * 0.08;
    const L = this.life * k;
    const tx = P.x + Math.sin(L * 0.31) * C.swayX + Math.sin(L * 0.83) * C.swayX * 0.25;
    const ty = P.y + Math.sin(L * 0.53) * C.swayY;
    const tz = P.z + Math.sin(L * 0.21) * C.swayZ;
    const f = 1 - Math.exp(-dt * 1.6);
    this.position.x += (tx - this.position.x) * f;
    this.position.y += (ty - this.position.y) * f;
    this.position.z += (tz - this.position.z) * f;
  }

  protected movePhase(dt: number): void {
    this.drift(dt);
  }

  protected onDeathStart(broken: boolean): void {
    if (!broken) return;
    this.motes.visible = true;
    this.moteMat.uniforms.uOn.value = 1;
    this.moteMat.uniforms.uFrom.value.copy(this.position);
    this.arrived = 0;
    this.sparkT = 0;
  }

  protected updateDying(dt: number): boolean {
    const D = this.config.deathSec;
    const t = this.t;
    // 0–1.6 s: the flames turn to light; 1.5–4.3 s: she dissolves into motes; the dark lifts.
    this.girl.light = Math.min(1, t / 1.6);
    this.girl.fade = 1 - smooth01((t - 2.0) / 2.4);
    this.girl.flash = Math.max(0, 0.6 - t * 0.5);
    this.flameT = 1.6 + t * 0.4;
    this.darkA = 1 - smooth01(t / (D * 0.8));
    this.darkR = this.darkR + (4 - this.darkR) * (1 - Math.exp(-dt * 1.2));
    this.abyss = Math.min(1, 0.6 + t / D);
    this.position.y += dt * 0.3;
    // Motes travel to the heroine (her last known position).
    const mu = this.moteMat.uniforms;
    mu.uT.value = t;
    mu.uTo.value.set(SHADOW_TRACK.x, SHADOW_TRACK.y, 0);
    // Sparkles where the light enters her.
    this.sparkT -= dt;
    if (t > 2.6 && t < D - 0.4 && this.sparkT <= 0) {
      this.sparkT = 0.12;
      this.effects.burst(SHADOW_TRACK.x, SHADOW_TRACK.y, 0, this.rng.next() < 0.5 ? 0xffe6a8 : 0xf4f6ff, 5, 1.6, 0.07, 0.5);
    }
    if (t > D - 0.6 && this.arrived === 0) {
      this.arrived = 1;
      this.effects.ring(SHADOW_TRACK.x, SHADOW_TRACK.y, 0, 0xfff0c8, 2.6, 0.8);
      this.effects.burst(SHADOW_TRACK.x, SHADOW_TRACK.y, 0, 0xfff4dc, 46, 4.2, 0.09, 1.0);
    }
    return t >= D;
  }

  protected updateEscape(dt: number): boolean {
    const u = Math.min(1, this.t / 2.5);
    this.position.z -= dt * 30 * u;
    this.position.y -= dt * 4 * u;
    this.girl.fade = 1 - u;
    this.darkA = 1;
    this.darkR = 1;
    this.abyss = 0;
    return u >= 1;
  }

  update(dt: number): void {
    // Keep the probe that reports the heroine's position alive (Game may stop all patterns).
    if (this.active && (!this.probe || this.probe.done)) {
      this.probe = this.danmaku.startPattern('shadowProbe', { origin: this.origin, duration: 1e6 });
    }
    super.update(dt);
  }

  protected animate(dt: number): void {
    this.group.position.copy(this.position);
    this.motes.position.set(-this.position.x, -this.position.y, -this.position.z); // world space
    this.flash = Math.max(0, this.flash - dt * 3);
    const C = this.config;
    const fighting = this.state === BossState.Phase || this.state === BossState.Breather;
    const pi = Math.max(0, this.phaseIndex);

    // Flames grow phase by phase.
    if (this.state !== BossState.Dying) this.flameT = 1 + pi * 0.32 + (this.state === BossState.Phase && pi === C.finalPhase ? 0.25 : 0);
    this.girl.flame += (this.flameT - this.girl.flame) * (1 - Math.exp(-dt * 2));
    if (this.state !== BossState.Dying) this.girl.flash = Math.min(0.14, this.flash * 0.3);

    // Darkness targets per phase.
    if (fighting) {
      const ph = C.phases[pi];
      const hpStart = pi > 0 ? C.phases[pi - 1].hpEnd : 1;
      const prog = Math.max(0, Math.min(1, (hpStart - this.hp) / Math.max(1e-3, hpStart - ph.hpEnd)));
      if (pi === C.eaterPhase && this.state === BossState.Phase) {
        this.darkR = 1 + (C.eaterRadius - 1) * Math.min(1, this.t / 3.5);
        this.darkA = 1.05;
        this.abyss = 0;
      } else if (pi === C.finalPhase && this.state === BossState.Phase) {
        // The heroine's light grows as the shadow weakens.
        this.darkR = 0.9 + (C.finalRadius - 0.9) * prog;
        this.darkA = 1 + (C.finalAmount - 1) * prog;
        this.abyss = prog * 0.65;
      } else {
        this.darkR = 1;
        this.darkA = 1;
        this.abyss = 0;
      }
    }
    const k = 1 - Math.exp(-dt * (this.state === BossState.Dying ? 3 : 1.6));
    DARK_MOD.radius += (this.darkR - DARK_MOD.radius) * k;
    DARK_MOD.amount += (Math.min(1.05, this.darkA) - DARK_MOD.amount) * k;
    ABYSS_LIGHT.value += (this.abyss - ABYSS_LIGHT.value) * k;
    this.lightT += (ABYSS_LIGHT.value - this.lightT) * k;

    // Lean with the drift.
    const vx = dt > 0 ? (this.position.x - this.lastX) / dt / 2.5 : 0;
    this.lastX = this.position.x;
    this.vx += (Math.max(-1, Math.min(1, vx)) - this.vx) * (1 - Math.exp(-dt * 3));
    this.girl.update(dt, this.vx);

    const cu = this.coronaMat.uniforms;
    cu.uTime.value = this.life;
    cu.uFlame.value = this.girl.flame;
    cu.uLight.value = Math.max(this.girl.light, this.lightT * 0.35);
    cu.uFade.value = this.girl.fade;
    cu.uFlash.value = this.flash;
  }

  dispose(): void {
    this.probe?.stop();
    this.girl.dispose();
    super.dispose();
  }
}

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
