/**
 * The mid-boss 「硝子蝶 ルクシア」: a crystal butterfly — four shader-drawn glass wings on
 * hinges (flapping about the body axis), a gold crystal body with antennae, an orrery of
 * orbiting crystal shards and a soft glow. 8 draw calls. Runs the phase list from
 * StageData.MIDBOSS (HP threshold or timeout per phase); after the last phase times out it
 * flies away (no bonus).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../core/config';
import type { Danmaku, PatternHandle, Vec3Like } from '../core/types';
import { MIDBOSS } from './StageData';
import type { Targets } from './Shots';
import type { Effects } from './Effects';
import type { Rng } from './Rng';

export enum MidBossState { Off, Enter, Phase, Breather, Dying, Escape, Done }

export interface MidBossEvents {
  onPhaseStart(index: number): void;
  /** broken = HP threshold reached (vs. timeout); cancelled = bullets removed. */
  onPhaseEnd(index: number, broken: boolean, cancelled: number): void;
  onDefeated(x: number, y: number, z: number): void;
  onEscaped(): void;
  onHit(x: number, y: number, z: number, damaged: boolean): void;
}

const BURST_COLS = [PALETTE.cyan, PALETTE.purple, PALETTE.pink, PALETTE.gold];
const SHARDS = 7;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Wing in polar coordinates around the hinge (uv.x = 0, uv.y = 0.5): a lobe
 * R(θ) = Rmax·cos(k(θ-θc))^0.55, radial veins + two cross veins, an eye spot on the
 * forewing, iridescent cells and a gold rim. Additive and kept dim for bullet readability.
 */
const WING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uCenter;
uniform float uWidth;
uniform float uEye;
uniform float uScallop;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uGold;
varying vec2 vUv;
float band(float x, float c, float w) { return 1.0 - smoothstep(0.0, w, abs(x - c)); }
void main() {
  vec2 p = vec2(vUv.x, vUv.y * 2.0 - 1.0);
  float r = length(p);
  float th = atan(p.y, p.x);
  float d = (th - uCenter) * uWidth;
  if (abs(d) > 1.5707) discard;
  float R = 0.97 * pow(cos(d), 0.45);
  // Scalloped outer margin.
  R *= 1.0 - uScallop * abs(sin(d * 7.0));
  float s = r / max(R, 1e-3);
  if (s > 1.0) discard;
  // Radial veins fanning from the hinge, and two cross veins.
  float vn = (d / 1.5707) * 3.5;
  float vein = band(fract(vn + 0.5), 0.5, 0.06 + 0.05 * (1.0 - s)) * step(0.08, s);
  vein += band(s, 0.48, 0.02) + band(s, 0.78, 0.018);
  vein = min(vein, 1.0);
  // Iridescent cells: hue drifts along the wing and over time.
  float sh = 0.5 + 0.5 * sin(s * 5.0 - uTime * 1.3 + d * 2.0);
  vec3 cell = mix(uC1, uC2, smoothstep(0.15, 0.95, s));
  cell = mix(cell, uC3, sh * 0.35 * smoothstep(0.5, 1.0, s));
  float facet = 0.75 + 0.25 * sin(floor(vn + 0.5) * 7.1 + floor(s * 4.0) * 3.3 + uTime * 0.6);
  float fill = (0.05 + 0.2 * s * s) * facet;
  // Gold rim and an eye spot.
  float rim = band(s, 0.985, 0.03);
  vec2 e = p - vec2(cos(uCenter), sin(uCenter)) * R * 0.66;
  float er = length(e);
  float eye = uEye * (band(er, 0.11, 0.025) + 0.6 * band(er, 0.05, 0.03));
  // Darker, saturated wing membrane (the hinge area stays nearly black so bullets read).
  vec3 col = cell * fill + uC2 * vein * (0.22 + 0.3 * s) + uGold * (rim * 0.75 + eye * 0.7) + uC3 * eye * 0.35;
  col *= (0.75 + uFlash * 0.6) * uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = pow(max(0.0, 1.0 - r), 2.4);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

export class MidBoss {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3(MIDBOSS.position.x, MIDBOSS.position.y, MIDBOSS.position.z);
  state = MidBossState.Off;
  hp = 1;
  phaseIndex = -1;
  private t = 0;
  private life = 0;
  private handles: (PatternHandle | null)[] = [null, null, null];
  private origin: () => Vec3Like;
  private body = new THREE.Group();
  private hinges: THREE.Group[] = []; // [foreR, foreL, hindR, hindL]
  private wingUniforms: Record<string, THREE.IUniform>;
  private wingMats: THREE.ShaderMaterial[] = [];
  private bodyMat: THREE.MeshStandardMaterial;
  private bodyMesh: THREE.Mesh;
  private shards: THREE.InstancedMesh;
  private shardMat: THREE.MeshStandardMaterial;
  private glowMat: THREE.ShaderMaterial;
  private flash = 0;
  private frozen = false;
  private flapPhase = 0;
  private burstT = 0;
  private dustT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(private danmaku: Danmaku, private effects: Effects, private rng: Rng, private ev: MidBossEvents) {
    this.origin = () => this.position;
    this.group.visible = false;
    this.group.add(this.body);

    // Shared animated uniforms (time / flash / fade); per-wing shape uniforms.
    this.wingUniforms = {
      uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 },
      uC1: { value: new THREE.Color(PALETTE.cyan).multiplyScalar(0.9) },
      uC2: { value: new THREE.Color(PALETTE.purple).multiplyScalar(1.15) },
      uC3: { value: new THREE.Color(PALETTE.pink) },
      uGold: { value: new THREE.Color(PALETTE.gold) },
    };
    const mkWingMat = (center: number, width: number, eye: number, scallop: number) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: WING_FRAG,
      uniforms: {
        ...this.wingUniforms,
        uCenter: { value: center }, uWidth: { value: width }, uEye: { value: eye }, uScallop: { value: scallop },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const foreMat = mkWingMat(0.62, 1.15, 1, 0.025);
    const hindMat = mkWingMat(-0.78, 1.3, 0, 0.06);
    this.wingMats.push(foreMat, hindMat);
    // Plane spans uv.x 0..1 from the hinge outward, uv.y 0..1 (hinge at 0.5).
    const foreGeo = new THREE.PlaneGeometry(9.6, 19.2);
    foreGeo.translate(4.8, 0, 0);
    const hindGeo = new THREE.PlaneGeometry(6.6, 13.2);
    hindGeo.translate(3.3, 0, 0);
    const wingDefs: [THREE.BufferGeometry, THREE.ShaderMaterial, number, number][] = [
      [foreGeo, foreMat, 1, 0.45], [foreGeo, foreMat, -1, 0.45],
      [hindGeo, hindMat, 1, -0.3], [hindGeo, hindMat, -1, -0.3],
    ];
    for (const [g, mat, side, y] of wingDefs) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.25, y, -0.3);
      const w = new THREE.Mesh(g, mat);
      w.scale.x = side;
      w.renderOrder = 1;
      hinge.add(w);
      this.hinges.push(hinge);
      this.body.add(hinge);
    }

    // Body: thorax + abdomen + head + two antennae, one merged geometry.
    const parts: THREE.BufferGeometry[] = [];
    const thorax = new THREE.OctahedronGeometry(1, 0);
    thorax.scale(0.55, 1.1, 0.55);
    thorax.translate(0, 0.5, 0);
    parts.push(thorax);
    const abdomen = new THREE.OctahedronGeometry(1, 0);
    abdomen.scale(0.38, 2.0, 0.38);
    abdomen.translate(0, -2.0, 0);
    parts.push(abdomen);
    const head = new THREE.IcosahedronGeometry(0.42, 0);
    head.translate(0, 1.95, 0);
    parts.push(head);
    for (const side of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(side * 0.15, 2.2, 0),
        new THREE.Vector3(side * 0.5, 3.6, 0.2),
        new THREE.Vector3(side * 1.4, 4.4, 0),
      );
      parts.push(new THREE.TubeGeometry(curve, 8, 0.05, 4, false));
      const tip = new THREE.OctahedronGeometry(0.2, 0);
      tip.translate(side * 1.4, 4.4, 0);
      parts.push(tip);
    }
    const bodyGeo = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g))!;
    bodyGeo.computeVertexNormals();
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xfff1d6, emissive: PALETTE.gold, emissiveIntensity: 0.7, metalness: 0.35, roughness: 0.25, flatShading: true, fog: false,
    });
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.bodyMesh.scale.setScalar(1.25);
    this.bodyMesh.renderOrder = 3;
    this.body.add(this.bodyMesh);

    // Orrery of crystal shards on a tilted ellipse.
    const sg = new THREE.OctahedronGeometry(0.5, 0);
    sg.scale(0.55, 1.2, 0.55);
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0xdff8ff, emissive: PALETTE.cyan, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.2, flatShading: true, fog: false,
    });
    this.shards = new THREE.InstancedMesh(sg, this.shardMat, SHARDS);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.body.add(this.shards);

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(PALETTE.purple) }, uIntensity: { value: 0.6 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.glowMat);
    glow.position.z = -0.8;
    glow.renderOrder = 0;
    this.body.add(glow);
  }

  get active(): boolean {
    return this.state !== MidBossState.Off && this.state !== MidBossState.Done;
  }

  get vulnerable(): boolean {
    return this.state === MidBossState.Phase;
  }

  reset(): void {
    this.stopPatterns();
    this.state = MidBossState.Off;
    this.group.visible = false;
    this.hp = 1;
    this.phaseIndex = -1;
    this.frozen = false;
    this.body.scale.setScalar(1);
  }

  spawn(): void {
    this.reset();
    this.state = MidBossState.Enter;
    this.t = 0;
    this.life = 0;
    this.group.visible = true;
    this.wingUniforms.uFade.value = 1;
    this.position.set(MIDBOSS.position.x - 14, MIDBOSS.position.y + 12, -150);
  }

  private stopPatterns(): void {
    for (let i = 0; i < this.handles.length; i++) {
      const h = this.handles[i];
      if (h) h.stop();
      this.handles[i] = null;
    }
  }

  private startPhase(i: number): void {
    this.phaseIndex = i;
    this.state = MidBossState.Phase;
    this.t = 0;
    const def = MIDBOSS.phases[i];
    for (let k = 0; k < def.patterns.length; k++) {
      const p = def.patterns[k];
      this.handles[k] = this.danmaku.startPattern(p.id, {
        origin: this.origin, duration: def.timeout, intensity: p.intensity, seed: this.rng.int(),
      });
    }
    this.ev.onPhaseStart(i);
  }

  private endPhase(broken: boolean): void {
    this.stopPatterns();
    const cancelled = this.danmaku.clear();
    this.ev.onPhaseEnd(this.phaseIndex, broken, cancelled);
    this.t = 0;
    if (this.phaseIndex >= MIDBOSS.phases.length - 1) {
      if (broken) {
        this.state = MidBossState.Dying;
        this.burstT = 0;
      } else {
        this.state = MidBossState.Escape;
      }
    } else {
      this.state = MidBossState.Breather;
    }
  }

  damage(amount: number, x: number, y: number, z: number): void {
    const ok = this.vulnerable;
    if (ok) {
      const floor = MIDBOSS.phases[this.phaseIndex].hpEnd;
      this.hp = Math.max(floor, this.hp - amount / MIDBOSS.maxHp);
      this.flash = Math.min(1, this.flash + 0.12);
    }
    this.ev.onHit(x, y, z, ok);
  }

  addTargets(t: Targets, id: number): void {
    if (!this.active || this.state === MidBossState.Dying || this.state === MidBossState.Escape) return;
    if (this.state === MidBossState.Enter && this.t < MIDBOSS.enterSec * 0.6) return;
    t.add(id, this.position.x, this.position.y, this.position.z + 1, MIDBOSS.hitRadius);
  }

  /** Debug: drop HP to the current phase's threshold. */
  forceBreak(): boolean {
    if (this.state !== MidBossState.Phase) return false;
    this.hp = MIDBOSS.phases[this.phaseIndex].hpEnd;
    return true;
  }

  /** Stop patterns and freeze the state machine (player died); visuals keep animating. */
  freeze(): void {
    this.stopPatterns();
    this.frozen = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.life += dt;
    if (!this.frozen) this.t += dt;
    const P = MIDBOSS.position;
    let flapSpeed = 4.2;
    let flapAmp = 0.42;

    switch (this.frozen ? MidBossState.Off : this.state) {
      case MidBossState.Enter: {
        // Swoop in on a curve from the upper left.
        const u = Math.min(1, this.t / MIDBOSS.enterSec);
        const e = 1 - Math.pow(1 - u, 3);
        this.position.set(P.x + (1 - e) * -14 + Math.sin(e * Math.PI) * 6, P.y + (1 - e) * 12, -150 + (P.z + 150) * e);
        flapSpeed = 7;
        flapAmp = 0.55;
        if (u >= 1) this.startPhase(0);
        break;
      }
      case MidBossState.Phase:
      case MidBossState.Breather: {
        // Lazy figure-eight drift; a little faster and wider in the second phase.
        const k = this.phaseIndex >= 1 ? 1.25 : 1;
        const L = this.life * k;
        const tx = P.x + Math.sin(L * 0.55) * MIDBOSS.swayX;
        const ty = P.y + Math.sin(L * 1.1) * MIDBOSS.swayY;
        const tz = P.z + Math.sin(L * 0.37) * MIDBOSS.swayZ;
        const f = 1 - Math.exp(-dt * 3);
        this.position.x += (tx - this.position.x) * f;
        this.position.y += (ty - this.position.y) * f;
        this.position.z += (tz - this.position.z) * f;
        if (this.state === MidBossState.Phase) {
          const def = MIDBOSS.phases[this.phaseIndex];
          flapSpeed = this.phaseIndex >= 1 ? 5.4 : 4.2;
          for (let i = 0; i < def.patterns.length; i++) {
            const h = this.handles[i];
            if (h && h.done && this.t < def.timeout - 1) {
              this.handles[i] = this.danmaku.startPattern(def.patterns[i].id, {
                origin: this.origin, duration: def.timeout - this.t, intensity: def.patterns[i].intensity, seed: this.rng.int(),
              });
            }
          }
          if (this.hp <= def.hpEnd + 1e-6) this.endPhase(true);
          else if (this.t >= def.timeout) this.endPhase(false);
        } else {
          flapSpeed = 2.4;
          flapAmp = 0.25;
          if (this.t >= MIDBOSS.breatherSec) this.startPhase(this.phaseIndex + 1);
        }
        break;
      }
      case MidBossState.Dying: {
        flapSpeed = 16;
        flapAmp = 0.6 * (1 - this.t / MIDBOSS.deathSec);
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstT = 0.1;
          const side = this.rng.next() < 0.5 ? -1 : 1;
          this.effects.burst(
            this.position.x + side * (1 + this.rng.next() * 6), this.position.y + (this.rng.next() - 0.4) * 7, this.position.z + 1.5,
            BURST_COLS[(this.rng.next() * 4) | 0], 20, 11, 1.1, 0.8,
          );
        }
        this.flash = 0.6 + Math.sin(this.t * 38) * 0.4;
        this.wingUniforms.uFade.value = Math.max(0, 1 - this.t / MIDBOSS.deathSec);
        this.position.y -= dt * 1.2;
        this.body.scale.setScalar(1 + this.t * 0.12);
        if (this.t >= MIDBOSS.deathSec) {
          const p = this.position;
          this.effects.burst(p.x, p.y, p.z + 2, PALETTE.white, 90, 26, 1.8, 1.3);
          this.effects.burst(p.x - 4, p.y + 1, p.z + 2, PALETTE.cyan, 50, 18, 1.4, 1.1);
          this.effects.burst(p.x + 4, p.y + 1, p.z + 2, PALETTE.purple, 50, 18, 1.4, 1.1);
          this.effects.burst(p.x, p.y, p.z + 2, PALETTE.gold, 40, 14, 1.2, 1.2);
          this.effects.ring(p.x, p.y, p.z + 3, PALETTE.white, 24, 0.8);
          this.effects.ring(p.x, p.y, p.z + 3, PALETTE.pink, 15, 0.65);
          this.state = MidBossState.Done;
          this.group.visible = false;
          this.body.scale.setScalar(1);
          this.ev.onDefeated(p.x, p.y, p.z);
        }
        break;
      }
      case MidBossState.Escape: {
        const u = Math.min(1, this.t / 1.8);
        this.position.x += dt * 8 * u;
        this.position.y += dt * 12 * u;
        this.position.z -= dt * 45 * u;
        flapSpeed = 9;
        flapAmp = 0.6;
        this.wingUniforms.uFade.value = 1 - u;
        if (u >= 1) {
          this.state = MidBossState.Done;
          this.group.visible = false;
          this.ev.onEscaped();
        }
        break;
      }
    }

    if (this.state === MidBossState.Done) return;

    // Visual animation.
    this.group.position.copy(this.position);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash;
    this.wingUniforms.uTime.value = this.life;
    this.wingUniforms.uFlash.value = fl;
    this.bodyMat.emissiveIntensity = 0.6 + fl * 1.1;
    this.shardMat.emissiveIntensity = 0.7 + fl * 0.8;
    this.glowMat.uniforms.uIntensity.value = 0.35 + fl * 0.25 + Math.sin(this.life * 2.6) * 0.05;

    // Wingbeat: hinges fold toward -Z (away from the player); the hind wings lag a little.
    this.flapPhase += dt * flapSpeed;
    const base = 0.35;
    const fore = base + flapAmp * (0.5 + 0.5 * Math.sin(this.flapPhase));
    const hind = base * 0.8 + flapAmp * 0.9 * (0.5 + 0.5 * Math.sin(this.flapPhase - 0.5));
    this.hinges[0].rotation.set(0, fore, 0.04 * Math.sin(this.flapPhase));
    this.hinges[1].rotation.set(0, -fore, -0.04 * Math.sin(this.flapPhase));
    this.hinges[2].rotation.set(0, hind, 0);
    this.hinges[3].rotation.set(0, -hind, 0);
    // Body bobs against the wingbeat and banks with its drift.
    this.body.position.y = -Math.sin(this.flapPhase) * 0.18;
    this.body.rotation.z = Math.cos(this.life * 0.55) * -0.12;
    this.bodyMesh.rotation.y = Math.sin(this.life * 0.8) * 0.35;

    // Orrery: shards on a tilted ellipse, each spinning.
    for (let i = 0; i < SHARDS; i++) {
      const a = (i / SHARDS) * Math.PI * 2 + this.life * 0.7;
      const rx = 8.2, ry = 3;
      this.v.set(Math.cos(a) * rx, Math.sin(a) * ry * 0.5 - 0.6, Math.sin(a) * ry);
      this.e.set(this.life * 1.3 + i, this.life * 0.9, 0.3);
      this.q.setFromEuler(this.e);
      const sc = 0.85 + 0.25 * Math.sin(this.life * 3 + i * 1.7) + fl * 0.3;
      this.s.setScalar(sc);
      this.m.compose(this.v, this.q, this.s);
      this.shards.setMatrixAt(i, this.m);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    // Glitter dust shed from the wingtips while fighting.
    if (this.state === MidBossState.Phase || this.state === MidBossState.Enter) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.09;
        const side = this.rng.next() < 0.5 ? -1 : 1;
        const reach = 3 + this.rng.next() * 4;
        const cf = Math.cos(fore);
        this.effects.burst(
          this.position.x + side * reach * cf, this.position.y + 0.8 + reach * 0.6 * this.rng.next(), this.position.z - reach * Math.sin(fore),
          this.rng.next() < 0.5 ? PALETTE.cyan : PALETTE.pink, 1, 1.5, 0.35, 0.9,
        );
      }
    }
  }
}
