/**
 * Stage 2 boss 「蝕む日輪 エクリプス」: a radiant sun disc with rotating corona rays, being devoured
 * by a black moon disc that slides further over it with every phase (and the far setting sun in
 * the background is eclipsed in step, via DUSK_STATE). In the last phase (皆既日蝕) the moon covers
 * it completely: the screen dims as each moon volley lands and the corona flares as the rings burst.
 * Death: the sun flares back, the shadow disc shatters into dark shards.
 * ~7 draw calls.
 */
import * as THREE from 'three';
import { totalEclipseTiming } from '../../../danmaku/stage2';
import { PhasedBoss } from '../../bosses/PhasedBoss';
import { BossState, type BossConfig, type BossContext } from '../../bosses/BossLike';
import { scaleIntensity } from '../types';
import { DUSK_STATE } from './shared';

const SUN_R = 4.4;
const AMBER = 0xffa04a;
const GOLD = 0xffd166;
const ROSE = 0xff6f8a;
const VIOLET = 0x8a5cff;
const SHARDS = 26;
const FLARES = 8;
/** Moon coverage per phase (Enter / phases 0..3). */
const COVER = [0.28, 0.5, 0.72, 1.0];
/** Direction the moon slides in from (upper right). */
const MOON_DIR = new THREE.Vector2(0.82, 0.57).normalize();

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Sun + corona in one additive quad (units: p in sun radii). The moon (offset uMoon, radius 1)
 * cuts the disc; when it covers most of it the corona and a thin bright rim (Baily's beads at
 * the edge) take over. Kept moderate behind the bullets.
 */
const SUN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uCover;
uniform float uFlare;
uniform float uSpin;
uniform vec2 uMoon;
varying vec2 vUv;
#define S(c) pow(c, vec3(2.2))
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * 3.2;   // quad spans ±3.2 sun radii
  float r = length(p);
  float a = atan(p.y, p.x);
  float disc = smoothstep(1.0, 0.97, r);
  vec3 sunC = mix(S(vec3(1.0, 0.92, 0.7)), S(vec3(1.0, 0.5, 0.18)), smoothstep(0.0, 1.0, r * r));
  // Granulation shimmer.
  float gran = 0.9 + 0.1 * sin(p.x * 13.0 + uTime * 1.3) * sin(p.y * 11.0 - uTime * 1.1);
  float md = length(p - uMoon);
  float moon = smoothstep(0.98, 1.01, md);
  float beads = exp(-pow((md - 1.0) * 30.0, 2.0)) * disc * smoothstep(0.6, 1.0, uCover);
  // Corona rays: two counter-rotating sets, stronger as the eclipse deepens.
  float out1 = max(r - 1.0, 0.0);
  float rays = pow(0.5 + 0.5 * cos(a * 12.0 + uSpin), 6.0) * 0.7 + pow(0.5 + 0.5 * cos(a * 7.0 - uSpin * 0.6 + 1.0), 10.0) * 0.6;
  float fall = exp(-out1 * 1.6);
  float corona = (exp(-out1 * 4.5) * 0.9 + rays * fall * (0.25 + 0.75 * uCover)) * (1.0 - disc);
  float halo = exp(-out1 * 1.2) * (1.0 - disc) * 0.18;
  float lit = disc * moon;
  vec3 col = sunC * lit * gran * mix(0.75, 0.5, uCover)
           + S(vec3(1.0, 0.72, 0.4)) * corona * (0.45 + 0.35 * uCover)
           + S(vec3(1.0, 0.4, 0.3)) * halo
           + S(vec3(1.0, 0.95, 0.85)) * beads * 1.2;
  col *= (1.0 + uFlash * 0.7 + uFlare * 1.6) * uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Black moon disc with a faint violet rim (normal blending: hides what is behind it). */
const MOON_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uCrack;
varying vec2 vUv;
#define S(c) pow(c, vec3(2.2))
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float rim = smoothstep(0.86, 1.0, r);
  // Cracks of light before it shatters.
  float crack = uCrack * smoothstep(0.035, 0.0, abs(sin(a * 5.0 + r * 6.0) * r - 0.3 * sin(a * 3.0))) ;
  vec3 col = S(vec3(0.012, 0.006, 0.03)) + S(vec3(0.32, 0.18, 0.7)) * rim * (0.5 + 0.2 * sin(uTime * 2.0 + a * 3.0)) + S(vec3(1.0, 0.8, 0.5)) * crack;
  gl_FragColor = vec4(col, uFade * smoothstep(1.0, 0.97, r));
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = pow(max(0.0, 1.0 - r), 2.2);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

export class Eclipse extends PhasedBoss {
  private body = new THREE.Group();
  private sunMat: THREE.ShaderMaterial;
  private moonMat: THREE.ShaderMaterial;
  private moon: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private flares: THREE.InstancedMesh;
  private flareMat: THREE.MeshStandardMaterial;
  private shards: THREE.InstancedMesh;
  private shardMat: THREE.MeshStandardMaterial;
  private cover = 0;
  private spin = 0;
  private flare = 0;
  private dim = 0;
  private burstT = 0;
  private sparkT = 0;
  private readonly shardVel: THREE.Vector3[] = [];
  private readonly shardPos: THREE.Vector3[] = [];
  private readonly shardRot: THREE.Vector3[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(ctx: BossContext<BossConfig>) {
    super(ctx);
    this.group.add(this.body);

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0xff7a40) }, uIntensity: { value: 0.3 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), this.glowMat);
    glow.position.z = -2;
    glow.renderOrder = 0;
    this.body.add(glow);

    this.sunMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: SUN_FRAG,
      uniforms: {
        uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 }, uCover: { value: 0 }, uFlare: { value: 0 },
        uSpin: { value: 0 }, uMoon: { value: new THREE.Vector2(2.2, 0) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 6.4, SUN_R * 6.4), this.sunMat);
    sun.renderOrder = 1;
    this.body.add(sun);

    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: MOON_FRAG,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uCrack: { value: 0 } },
      transparent: true, depthWrite: false,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 2, SUN_R * 2), this.moonMat);
    this.moon.position.z = 0.4;
    this.moon.renderOrder = 1.5;
    this.body.add(this.moon);

    // Orbiting solar flares (gold crystals).
    const fg = new THREE.OctahedronGeometry(0.55, 0);
    fg.scale(0.6, 1.5, 0.6);
    this.flareMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d0, emissive: GOLD, emissiveIntensity: 0.85, metalness: 0.3, roughness: 0.25, flatShading: true, fog: false,
    });
    this.flares = new THREE.InstancedMesh(fg, this.flareMat, FLARES);
    this.flares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flares.frustumCulled = false;
    this.body.add(this.flares);

    // Shadow shards (hidden until the moon shatters).
    const sg = new THREE.TetrahedronGeometry(1, 0);
    sg.scale(1, 0.55, 0.18);
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0x14082a, emissive: VIOLET, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.5, flatShading: true, fog: false,
      transparent: true, opacity: 1,
    });
    this.shards = new THREE.InstancedMesh(sg, this.shardMat, SHARDS);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    this.shards.renderOrder = 2;
    this.body.add(this.shards);
    for (let i = 0; i < SHARDS; i++) {
      this.shardVel.push(new THREE.Vector3());
      this.shardPos.push(new THREE.Vector3());
      this.shardRot.push(new THREE.Vector3());
    }
  }

  protected onReset(): void {
    this.body.scale.setScalar(1);
    this.cover = COVER[0] * 0.5;
    this.flare = 0;
    this.dim = 0;
    this.moon.visible = true;
    this.shards.visible = false;
    this.moonMat.uniforms.uCrack.value = 0;
    this.moonMat.uniforms.uFade.value = 1;
    this.sunMat.uniforms.uFade.value = 1;
  }

  protected onSpawn(): void {
    // Rises from below the horizon, far away.
    this.position.set(this.config.position.x, this.config.position.y - 26, -185);
  }

  protected moveEnter(u: number): void {
    const P = this.config.position;
    const e = 1 - Math.pow(1 - u, 3);
    this.position.set(P.x, P.y - 26 * (1 - e), -185 + (P.z + 185) * e);
  }

  protected movePhase(): void {
    const P = this.config.position;
    const k = this.phaseIndex === 3 ? 0.4 : 1; // nearly still during the total eclipse
    this.position.set(P.x + Math.sin(this.life * 0.42) * 1.3 * k, P.y + Math.sin(this.life * 0.7) * 0.5 * k, P.z);
  }

  protected moveBreather(dt: number): void {
    this.position.x += (this.config.position.x - this.position.x) * (1 - Math.exp(-dt * 2));
  }

  protected onDeathStart(broken: boolean): void {
    this.burstT = 0;
    if (!broken) return;
    // Shatter the moon into shards flying outward.
    this.shards.visible = true;
    for (let i = 0; i < SHARDS; i++) {
      const a = (i / SHARDS) * Math.PI * 2 + this.rng.next() * 0.3;
      const r = Math.sqrt(this.rng.next()) * SUN_R * 0.9;
      this.shardPos[i].set(this.moon.position.x + Math.cos(a) * r, this.moon.position.y + Math.sin(a) * r, 0.6);
      const sp = 3 + this.rng.next() * 7;
      this.shardVel[i].set(Math.cos(a) * sp, Math.sin(a) * sp, 2 + this.rng.next() * 6);
      this.shardRot[i].set(this.rng.next() * 6, this.rng.next() * 6, this.rng.next() * 6);
    }
  }

  protected updateDying(dt: number): boolean {
    const D = this.config.deathSec;
    const u = this.t / D;
    const p = this.position;
    // 0..0.3: cracks of light across the moon; then it shatters and the sun flares back.
    const crackEnd = 0.3;
    if (u < crackEnd) {
      this.moonMat.uniforms.uCrack.value = u / crackEnd;
      this.flash = 0.4 + Math.sin(this.t * 40) * 0.3;
      this.shards.visible = false;
      return false;
    }
    if (this.moon.visible) {
      this.moon.visible = false;
      this.effects.burst(p.x, p.y, p.z + 2, 0x1a0a30, 60, 22, 1.6, 1.0);
      this.effects.burst(p.x, p.y, p.z + 2, VIOLET, 60, 26, 1.4, 1.0);
      this.effects.ring(p.x, p.y, p.z + 3, 0xfff0d8, 26, 0.8);
    }
    this.shards.visible = true;
    const k = (u - crackEnd) / (1 - crackEnd);
    this.cover = Math.max(0, 1 - k * 2.5);
    this.flare = Math.min(1, k * 4) * (1 - k * 0.6);
    this.body.scale.setScalar(1 + k * 0.25);
    this.shardMat.opacity = Math.max(0, 1 - k * 1.2);
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 0.1;
      const a = this.rng.next() * Math.PI * 2;
      const r = SUN_R * (1 + this.rng.next() * 1.6);
      this.effects.burst(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z + 2, this.rng.next() < 0.5 ? GOLD : AMBER, 22, 14, 1.3, 0.9);
    }
    if (this.t < D) return false;
    this.effects.burst(p.x, p.y, p.z + 2, 0xfff4e0, 150, 34, 2.2, 1.6);
    this.effects.burst(p.x, p.y, p.z + 2, AMBER, 90, 26, 1.8, 1.4);
    this.effects.burst(p.x, p.y, p.z + 2, ROSE, 50, 20, 1.5, 1.2);
    this.effects.ring(p.x, p.y, p.z + 3, 0xfff4e0, 36, 1.0);
    this.effects.ring(p.x, p.y, p.z + 3, GOLD, 24, 0.85);
    this.body.scale.setScalar(1);
    this.shards.visible = false;
    return true;
  }

  protected updateEscape(dt: number): boolean {
    // Sinks below the horizon, fully eclipsed.
    const u = Math.min(1, this.t / 2.4);
    this.position.y -= dt * 14 * u;
    this.position.z -= dt * 36 * u;
    this.sunMat.uniforms.uFade.value = 1 - u;
    this.moonMat.uniforms.uFade.value = 1 - u;
    this.cover += (1 - this.cover) * (1 - Math.exp(-dt * 2));
    return u >= 1;
  }

  /** 皆既日蝕 screen dim / corona flare, synced with the totalEclipse emitter's cycle. */
  private eclipseCycle(): { dim: number; flare: number } {
    const def = this.config.phases[this.phaseIndex];
    const pat = def?.patterns.find((x) => x.id === 'totalEclipse');
    if (!pat || this.state !== BossState.Phase) return { dim: 0, flare: 0 };
    const tm = totalEclipseTiming(scaleIntensity(pat.intensity, this.difficulty));
    const tau = this.t - tm.first;
    if (tau < 0) return { dim: 0, flare: 0 };
    let dd = (tau % tm.period) - tm.moonT;
    if (dd < -tm.period / 2) dd += tm.period;
    const sm = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const dim = sm(-1.1, -0.25, dd) * (1 - sm(0.45, 1.4, dd));
    const flare = Math.exp(-Math.pow((dd - 0.55) * 2.6, 2)) * 0.8;
    return { dim, flare };
  }

  protected animate(dt: number): void {
    this.group.position.copy(this.position);
    this.flash = Math.max(0, this.flash - dt * 3);
    const fl = this.flash;
    const L = this.life;
    const st = this.state;
    const dying = st === BossState.Dying;

    // Eclipse progress.
    if (!dying && st !== BossState.Escape) {
      const idx = st === BossState.Enter ? -1 : this.phaseIndex;
      let target = idx < 0 ? COVER[0] * 0.6 : COVER[Math.min(3, idx)];
      // Within a phase the moon creeps on toward the next stage as HP falls.
      if (st === BossState.Phase && idx < 3) {
        const top = idx === 0 ? 1 : this.config.phases[idx - 1].hpEnd;
        const end = this.config.phases[idx].hpEnd;
        target += (COVER[idx + 1] - COVER[idx]) * Math.min(1, (top - this.hp) / Math.max(1e-3, top - end)) * 0.3;
      }
      this.cover += (target - this.cover) * (1 - Math.exp(-dt * 1.2));
      const cyc = this.eclipseCycle();
      this.dim += (cyc.dim - this.dim) * (1 - Math.exp(-dt * 10));
      this.flare += (cyc.flare - this.flare) * (1 - Math.exp(-dt * 10));
    } else if (!dying) {
      this.dim *= Math.exp(-dt * 4);
      this.flare *= Math.exp(-dt * 4);
    } else {
      this.dim *= Math.exp(-dt * 6);
    }

    const mo = (1 - this.cover) * 2.15;
    this.moon.position.set(MOON_DIR.x * mo * SUN_R, MOON_DIR.y * mo * SUN_R, 0.4);
    this.spin += dt * (0.25 + this.cover * 0.35 + this.flare * 1.5);
    const U = this.sunMat.uniforms;
    U.uTime.value = L;
    U.uFlash.value = fl;
    U.uCover.value = this.cover;
    U.uFlare.value = this.flare;
    U.uSpin.value = this.spin;
    (U.uMoon.value as THREE.Vector2).set(MOON_DIR.x * mo, MOON_DIR.y * mo);
    this.moonMat.uniforms.uTime.value = L;
    this.glowMat.uniforms.uIntensity.value = (0.3 + fl * 0.2 + this.flare * 0.5) * (1 - this.cover * 0.45) + 0.05 * Math.sin(L * 1.7);
    this.flareMat.emissiveIntensity = 0.7 + fl * 0.8 + this.flare;

    // Orbiting flares: an inclined ring that tightens as the light is eaten.
    const orbit = SUN_R * (2.0 - this.cover * 0.35);
    for (let i = 0; i < FLARES; i++) {
      const a = (i / FLARES) * Math.PI * 2 + L * 0.5;
      this.v.set(Math.cos(a) * orbit, Math.sin(a) * orbit * 0.42, Math.sin(a) * orbit * 0.5);
      this.e.set(L * 1.1 + i, L * 0.7, a + Math.PI / 2);
      this.q.setFromEuler(this.e);
      const lit = i / FLARES >= this.cover * 0.6 ? 1 : 0.45;
      this.s.setScalar((0.9 + 0.25 * Math.sin(L * 3 + i * 1.3) + fl * 0.3) * lit);
      this.m.compose(this.v, this.q, this.s);
      this.flares.setMatrixAt(i, this.m);
    }
    this.flares.instanceMatrix.needsUpdate = true;

    // Shards of the shattered moon.
    if (this.shards.visible) {
      for (let i = 0; i < SHARDS; i++) {
        const P = this.shardPos[i];
        P.addScaledVector(this.shardVel[i], dt);
        const R = this.shardRot[i];
        this.e.set(R.x + L * 3, R.y + L * 2.4, R.z);
        this.q.setFromEuler(this.e);
        this.s.setScalar(0.6 + (i % 4) * 0.25);
        this.m.compose(P, this.q, this.s);
        this.shards.setMatrixAt(i, this.m);
      }
      this.shards.instanceMatrix.needsUpdate = true;
    }

    // Sparks shed from the sun's rim while it fights.
    if (st === BossState.Phase || st === BossState.Enter) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.1;
        const a = this.rng.next() * Math.PI * 2;
        const r = SUN_R * (1.05 + this.rng.next() * 0.5);
        const p = this.position;
        this.effects.burst(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z + 1, this.rng.next() < 0.7 ? AMBER : VIOLET, 1, 1.8, 0.45, 0.9);
      }
    }

    // Drive the background: far sun eclipse, screen dim, flare.
    const S = DUSK_STATE;
    S.eclipse = this.cover;
    S.dim = this.dim;
    S.flare = Math.max(this.flare * (dying ? 1 : 0.6), 0);
    S.fresh = true;
  }
}
