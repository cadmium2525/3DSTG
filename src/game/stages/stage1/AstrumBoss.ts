/**
 * Stage 1 boss 「星環の花冠 アストルム」: a rotating magic-circle / flower construct (crystal
 * heart, gyroscope rings, petal crown, rune circle). The phase state machine lives in
 * PhasedBoss; this class only adds the visuals and motion.
 */
import * as THREE from 'three';
import { PALETTE } from '../../../core/config';
import { PhasedBoss } from '../../bosses/PhasedBoss';
import { BossState, type BossConfig, type BossContext } from '../../bosses/BossLike';

const BURST_COLS = [PALETTE.pink, PALETTE.gold, PALETTE.cyan, PALETTE.purple];

const CIRCLE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CIRCLE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
varying vec2 vUv;
float band(float x, float c, float w) { return 1.0 - smoothstep(0.0, w, abs(x - c)); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float TAU = 6.28318;
  // Concentric rings.
  float rings = band(r, 0.96, 0.012) + band(r, 0.885, 0.007) + band(r, 0.64, 0.009) * 0.9 + band(r, 0.42, 0.007) * 0.8;
  // Rotating dashes between the outer rings.
  float a1 = a + uTime * 0.22;
  float dash = smoothstep(0.18, 0.3, abs(fract(a1 * 48.0 / TAU) - 0.5)) * step(0.9, r) * step(r, 0.945);
  // Rune-like cells in the middle band (counter-rotating).
  float a2 = a - uTime * 0.13;
  float cell = fract(a2 * 20.0 / TAU);
  float id = floor(a2 * 20.0 / TAU);
  float h = fract(sin(id * 12.9898) * 43758.5453);
  float rr = (r - 0.67) / 0.19;
  float rune = 0.0;
  if (rr > 0.0 && rr < 1.0) {
    rune += band(cell, 0.5, 0.04) * step(0.35, h) * step(abs(rr - 0.5), 0.35);
    rune += band(rr, 0.3 + h * 0.4, 0.06) * step(abs(cell - 0.5), 0.28);
    rune += band(length(vec2(cell - 0.5, (rr - 0.5) * 0.5)), 0.18, 0.04) * step(h, 0.3);
  }
  // Hexagram from two rotating triangles inside r < 0.64.
  float a3 = a + uTime * 0.08;
  float t1 = r * cos(mod(a3, TAU / 3.0) - TAU / 6.0);
  float t2 = r * cos(mod(a3 + TAU / 6.0, TAU / 3.0) - TAU / 6.0);
  float hex = (band(t1, 0.32, 0.008) + band(t2, 0.32, 0.008)) * step(r, 0.645);
  // Inner rose (6 petals).
  float rose = band(r, 0.4 * abs(cos(3.0 * (a - uTime * 0.3))), 0.012) * step(r, 0.42);
  float glow = exp(-r * 4.0) * 0.18;
  vec3 col = uC1 * (rings + dash * 0.7) + uC2 * (rune * 0.8 + hex) + uC3 * rose + uC2 * glow;
  col *= (0.5 + uFlash * 1.2) * uFade; // kept dim so bullets stay readable in front of it
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = pow(max(0.0, 1.0 - r), 2.5);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

export class AstrumBoss extends PhasedBoss {
  private circleMat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshStandardMaterial;
  private rings: THREE.Mesh[] = [];
  private petals: THREE.InstancedMesh;
  private body = new THREE.Group();
  private open = 0.3;
  private burstT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(ctx: BossContext<BossConfig>) {
    super(ctx);
    this.group.add(this.body);
    this.circleMat = new THREE.ShaderMaterial({
      vertexShader: CIRCLE_VERT, fragmentShader: CIRCLE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 },
        uC1: { value: new THREE.Color(PALETTE.purple).multiplyScalar(1.3) },
        uC2: { value: new THREE.Color(PALETTE.gold) },
        uC3: { value: new THREE.Color(PALETTE.pink).multiplyScalar(1.2) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), this.circleMat);
    circle.position.z = -1.5;
    circle.renderOrder = 1;
    this.body.add(circle);

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: CIRCLE_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(PALETTE.pink) }, uIntensity: { value: 0.9 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), this.glowMat);
    glow.position.z = 0.5;
    glow.renderOrder = 2;
    this.body.add(glow);

    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffe6f4, emissive: PALETTE.pink, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.2, flatShading: true, fog: false,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), this.coreMat);
    this.core.scale.set(1, 1.3, 1);
    this.body.add(this.core);

    // Gyroscope rings.
    const ringCols = [PALETTE.cyan, PALETTE.gold, PALETTE.purple];
    const radii = [4.2, 5.4, 6.6];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ringCols[i]).multiplyScalar(1.2), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radii[i], 0.07 + i * 0.015, 6, 96), mat);
      this.rings.push(ring);
      this.body.add(ring);
    }

    // Petal crown.
    const pg = new THREE.OctahedronGeometry(1, 0);
    pg.scale(1.1, 3.0, 0.25);
    pg.translate(0, 3.2, 0);
    const pm = new THREE.MeshStandardMaterial({
      color: 0xd9c8ff, emissive: PALETTE.purple, emissiveIntensity: 0.75, metalness: 0.2, roughness: 0.35,
      flatShading: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide, fog: false,
    });
    this.petals = new THREE.InstancedMesh(pg, pm, 10);
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.petals.frustumCulled = false;
    this.body.add(this.petals);
  }

  protected onSpawn(): void {
    this.circleMat.uniforms.uFade.value = 1;
    this.position.set(this.config.position.x, this.config.position.y, -170);
  }

  protected moveEnter(u: number): void {
    const P = this.config.position;
    const e = 1 - Math.pow(1 - u, 3);
    this.position.set(P.x, P.y + (1 - e) * 8, -170 + (P.z + 170) * e);
  }

  protected movePhase(): void {
    // Gentle drift so the emitter feels alive.
    const P = this.config.position;
    this.position.set(P.x + Math.sin(this.life * 0.5) * 1.2, P.y + Math.sin(this.life * 0.8) * 0.5, P.z);
  }

  protected moveBreather(dt: number): void {
    this.position.x += (this.config.position.x - this.position.x) * (1 - Math.exp(-dt * 2));
  }

  protected onDeathStart(): void {
    this.burstT = 0;
  }

  protected updateDying(dt: number): boolean {
    const deathSec = this.config.deathSec;
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 0.12;
      const r = 6;
      this.effects.burst(
        this.position.x + (this.rng.next() - 0.5) * r * 2, this.position.y + (this.rng.next() - 0.5) * r * 2, this.position.z + 2,
        BURST_COLS[(this.rng.next() * 4) | 0], 26, 14, 1.4, 0.9,
      );
      this.effects.ring(this.position.x, this.position.y, this.position.z + 2, PALETTE.gold, 6 + this.rng.next() * 6, 0.6);
    }
    this.flash = 0.6 + Math.sin(this.t * 40) * 0.4;
    this.circleMat.uniforms.uFade.value = Math.max(0, 1 - this.t / deathSec);
    this.body.scale.setScalar(1 + this.t * 0.08);
    if (this.t < deathSec) return false;
    const p = this.position;
    this.effects.burst(p.x, p.y, p.z + 2, PALETTE.white, 140, 34, 2.2, 1.6);
    this.effects.burst(p.x, p.y, p.z + 2, PALETTE.pink, 90, 24, 1.8, 1.4);
    this.effects.ring(p.x, p.y, p.z + 3, PALETTE.white, 34, 1.0);
    this.effects.ring(p.x, p.y, p.z + 3, PALETTE.gold, 22, 0.8);
    this.body.scale.setScalar(1);
    return true;
  }

  protected updateEscape(dt: number): boolean {
    const u = Math.min(1, this.t / 2);
    this.position.y += dt * 10 * u;
    this.position.z -= dt * 40 * u;
    this.circleMat.uniforms.uFade.value = 1 - u;
    return u >= 1;
  }

  protected onReset(): void {
    this.body.scale.setScalar(1);
  }

  protected animate(dt: number): void {
    this.group.position.copy(this.position);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.circleMat.uniforms.uTime.value = this.life;
    this.circleMat.uniforms.uFlash.value = this.flash;
    this.glowMat.uniforms.uIntensity.value = 0.4 + this.flash * 0.4 + Math.sin(this.life * 2.2) * 0.08;
    this.coreMat.emissiveIntensity = 0.55 + this.flash * 1.0;
    this.core.rotation.set(this.life * 0.4, this.life * 0.9, 0);
    this.rings[0].rotation.set(this.life * 0.7, this.life * 0.3, 0);
    this.rings[1].rotation.set(-this.life * 0.4, 0.6 + this.life * 0.5, this.life * 0.2);
    this.rings[2].rotation.set(1.2 + this.life * 0.25, -this.life * 0.35, 0);
    const openTarget = this.state === BossState.Phase && this.phaseIndex === 1 ? 0.6 + Math.sin(this.life * 1.6) * 0.35 : 0.25;
    this.open += (openTarget - this.open) * (1 - Math.exp(-dt * 3));
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.life * 0.35;
      // Tilt petals toward the camera (+Z) when closed, flat when open.
      this.e.set(-(1 - this.open) * 0.9, 0, a, 'ZXY');
      this.q.setFromEuler(this.e);
      const sc = 0.85 + 0.15 * Math.sin(this.life * 2 + i);
      this.s.set(sc, sc * (0.8 + this.open * 0.4), sc);
      this.v.set(0, 0, 0);
      this.m.compose(this.v, this.q, this.s);
      this.petals.setMatrixAt(i, this.m);
    }
    this.petals.instanceMatrix.needsUpdate = true;
  }
}
