/**
 * Stage 3 mid-boss 「影の騎士 ノクス」: a knight of black armour plates with a glowing violet visor,
 * a cape of shards, a long shadow sword (violet edge glow) and six hexagonal shield plates
 * orbiting it (黒鎧の陣). Everything is drawn above the darkness overlay (renderOrder ≥ 3) so the
 * whole knight is visible in the abyss. Phase state machine: PhasedBoss.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PhasedBoss } from '../../bosses/PhasedBoss';
import { BossState, type BossConfig, type BossContext } from '../../bosses/BossLike';

export interface NoxConfig extends BossConfig {
  swayX: number;
  swayY: number;
}

const VIOLET = 0xa070ff;
const CRIMSON = 0xff3a6a;
const SHIELDS = 6;
/** The knight is modelled ~8 units tall; shown larger so it reads at z ≈ -50. */
const BODY_SCALE = 1.55;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Soft glow card (visor, sword aura, backdrop). */
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uStretch;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= uStretch;
  float r = length(p);
  float g = pow(max(0.0, 1.0 - r), 2.2);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
}

function plate(sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0, rx = 0): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export class NoxMidBoss extends PhasedBoss<NoxConfig> {
  private body = new THREE.Group();
  private armourMat: THREE.MeshStandardMaterial;
  private trimMat: THREE.MeshStandardMaterial;
  private visorMat: THREE.MeshBasicMaterial;
  private edgeMat: THREE.MeshBasicMaterial;
  private glowMats: THREE.ShaderMaterial[] = [];
  private armour: THREE.Mesh;
  private trim: THREE.Mesh;
  private swordArm = new THREE.Group();
  private cape: THREE.InstancedMesh;
  private shields: THREE.InstancedMesh;
  private shieldRims: THREE.InstancedMesh;
  private shieldMat: THREE.MeshStandardMaterial;
  private rimMat: THREE.MeshBasicMaterial;
  private parts: THREE.Object3D[] = [];
  private swing = 0;
  private swingT = 0;
  private spread = 1;
  private shieldSpin = 0;
  private burstT = 0;
  private dissolve = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(ctx: BossContext<NoxConfig>) {
    super(ctx);
    this.group.add(this.body);
    const above = (o: THREE.Object3D, r = 3) => {
      o.renderOrder = r;
      o.frustumCulled = false;
      return o;
    };

    this.armourMat = new THREE.MeshStandardMaterial({
      color: 0x1a1426, emissive: 0x1a0830, emissiveIntensity: 0.6, metalness: 0.75, roughness: 0.32,
      flatShading: true, fog: false, transparent: true,
    });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a5a, emissive: VIOLET, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3,
      flatShading: true, fog: false, transparent: true,
    });

    // Body armour: breastplate, faulds, greaves, helmet, pauldrons.
    const A: THREE.BufferGeometry[] = [
      plate(1.25, 1.55, 0.75, 0, 1.3, 0), // chest
      plate(0.95, 0.75, 0.6, 0, -0.3, 0), // waist
      plate(0.5, 1.0, 0.45, -0.75, -1.3, 0, -0.25), // faulds
      plate(0.5, 1.0, 0.45, 0.75, -1.3, 0, 0.25),
      plate(0.3, 1.4, 0.32, -0.5, -3.1, 0.05, 0.05), // greaves
      plate(0.3, 1.4, 0.32, 0.5, -3.1, 0.05, -0.05),
      plate(0.62, 0.8, 0.64, 0, 3.35, 0), // helmet
      plate(0.9, 0.55, 0.7, -1.55, 2.35, 0, 0.5), // pauldrons
      plate(0.9, 0.55, 0.7, 1.55, 2.35, 0, -0.5),
      plate(0.32, 1.1, 0.3, -1.75, 0.9, 0.1, 0.15), // left arm (shield arm)
    ];
    this.armour = above(new THREE.Mesh(merge(A), this.armourMat)) as THREE.Mesh;
    this.body.add(this.armour);
    // Trim: crest, horns, pauldron spikes, belt.
    const T: THREE.BufferGeometry[] = [
      plate(0.1, 0.9, 0.12, 0, 4.25, -0.1), // crest
      plate(0.08, 0.7, 0.08, -0.55, 4.0, 0, 0.7), // horns
      plate(0.08, 0.7, 0.08, 0.55, 4.0, 0, -0.7),
      plate(0.12, 0.8, 0.12, -2.05, 2.85, 0, 0.9), // spikes
      plate(0.12, 0.8, 0.12, 2.05, 2.85, 0, -0.9),
      plate(1.0, 0.12, 0.66, 0, 0.25, 0.02), // belt
      plate(0.18, 0.5, 0.1, 0, 1.4, 0.72), // chest rune
    ];
    this.trim = above(new THREE.Mesh(merge(T), this.trimMat)) as THREE.Mesh;
    this.body.add(this.trim);

    // Visor slit (bright violet) + its glow.
    this.visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(1.6), fog: false, transparent: true });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.11, 0.1), this.visorMat);
    visor.position.set(0, 3.38, 0.62);
    this.body.add(above(visor, 3.2));
    this.body.add(this.glowCard(VIOLET, 3.4, 2.0, 0, 3.38, 0.75, 1.0, 2.5));
    // Backdrop aura so the black silhouette reads against the black abyss.
    this.body.add(this.glowCard(0x5a2a9a, 16, 16, 0, 0.6, -2.5, 0.55, 1, 2.9));

    // Sword arm: pivot at the right shoulder; blade along +Y of the pivot.
    this.swordArm.position.set(1.7, 1.9, 0.3);
    const arm = above(new THREE.Mesh(merge([plate(0.32, 1.1, 0.3, 0, -0.9, 0)]), this.armourMat));
    this.swordArm.add(arm);
    const hilt = new THREE.Group();
    hilt.position.set(0, -1.9, 0.2);
    hilt.rotation.x = 0.25;
    this.swordArm.add(hilt);
    const bladeGeo = merge([
      plate(0.22, 4.2, 0.05, 0, 4.4, 0), // blade
      plate(0.75, 0.12, 0.14, 0, 0.1, 0), // guard
      plate(0.1, 0.55, 0.1, 0, -0.5, 0), // grip
    ]);
    const blade = above(new THREE.Mesh(bladeGeo, this.armourMat));
    hilt.add(blade);
    this.edgeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(VIOLET).multiplyScalar(1.4), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const edge = new THREE.Mesh(merge([plate(0.07, 4.25, 0.07, 0.2, 4.4, 0), plate(0.07, 4.25, 0.07, -0.2, 4.4, 0)]), this.edgeMat);
    hilt.add(above(edge, 3.3));
    hilt.add(this.glowCard(VIOLET, 2.4, 10, 0, 4.4, 0, 0.85, 1, 3.4));
    this.body.add(this.swordArm);

    // Cape of shards hanging behind.
    const shard = new THREE.OctahedronGeometry(1, 0);
    shard.scale(0.35, 1.6, 0.06);
    shard.translate(0, -1.6, 0);
    this.cape = new THREE.InstancedMesh(shard, this.armourMat, 9);
    this.cape.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    above(this.cape, 2.9);
    this.body.add(this.cape);

    // Shield plates (hexagonal prisms with a violet rim).
    const hex = new THREE.CylinderGeometry(1.25, 1.25, 0.18, 6);
    hex.rotateX(Math.PI / 2);
    this.shieldMat = new THREE.MeshStandardMaterial({
      color: 0x0e0a16, emissive: 0x2a0818, emissiveIntensity: 0.6, metalness: 0.85, roughness: 0.28,
      flatShading: true, fog: false, transparent: true,
    });
    this.shields = new THREE.InstancedMesh(hex, this.shieldMat, SHIELDS);
    this.shields.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    above(this.shields, 3.1);
    this.group.add(this.shields);
    // Glowing hexagonal rims (a 6-segment torus is a hexagon).
    const rim = new THREE.TorusGeometry(1.25, 0.07, 3, 6);
    rim.rotateZ(Math.PI / 6);
    this.rimMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CRIMSON).multiplyScalar(1.2), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    this.shieldRims = new THREE.InstancedMesh(rim, this.rimMat, SHIELDS);
    this.shieldRims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    above(this.shieldRims, 3.15);
    this.group.add(this.shieldRims);
    this.body.scale.setScalar(BODY_SCALE);

    this.parts = [this.armour, this.trim, this.swordArm, this.cape];
  }

  private glowCard(color: number, w: number, h: number, x: number, y: number, z: number, intensity: number, stretch = 1, order = 3.5): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uStretch: { value: stretch } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    mat.userData.base = intensity;
    this.glowMats.push(mat);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    g.position.set(x, y, z);
    g.renderOrder = order;
    g.frustumCulled = false;
    return g;
  }

  protected onReset(): void {
    this.body.scale.setScalar(BODY_SCALE);
    this.body.position.set(0, 0, 0);
    this.dissolve = 0;
    this.setFade(1);
  }

  private setFade(f: number): void {
    for (const m of [this.armourMat, this.trimMat, this.visorMat, this.edgeMat, this.shieldMat, this.rimMat]) m.opacity = f;
    for (const g of this.glowMats) g.uniforms.uIntensity.value = g.userData.base * f;
  }

  protected onSpawn(): void {
    const P = this.config.position;
    this.position.set(P.x, P.y - 22, P.z - 30);
    this.setFade(0);
  }

  /** Rises out of the abyss below. */
  protected moveEnter(u: number): void {
    const P = this.config.position;
    const e = 1 - Math.pow(1 - u, 3);
    this.position.set(P.x, P.y - 22 * (1 - e), P.z - 30 * (1 - e));
    this.setFade(Math.min(1, u * 1.6));
  }

  private sway(dt: number): void {
    const C = this.config;
    const P = C.position;
    const k = this.phaseIndex >= 1 ? 1.3 : 1;
    const tx = P.x + Math.sin(this.life * 0.5 * k) * C.swayX;
    const ty = P.y + Math.sin(this.life * 0.9 * k) * C.swayY;
    const f = 1 - Math.exp(-dt * 2.5);
    this.position.x += (tx - this.position.x) * f;
    this.position.y += (ty - this.position.y) * f;
    this.position.z += (P.z - this.position.z) * f;
  }

  protected movePhase(dt: number): void {
    this.sway(dt);
  }

  protected onDeathStart(): void {
    this.burstT = 0;
  }

  protected updateDying(dt: number): boolean {
    const D = this.config.deathSec;
    const u = Math.min(1, this.t / D);
    this.dissolve = u;
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 0.09;
      const p = this.position;
      this.effects.burst(p.x + (this.rng.next() - 0.5) * 7, p.y + (this.rng.next() - 0.4) * 9, p.z + 2,
        this.rng.next() < 0.5 ? VIOLET : CRIMSON, 18, 10, 1.0, 0.8);
    }
    this.flash = 0.5 + Math.sin(this.t * 36) * 0.4;
    this.setFade(1 - u * u);
    this.position.y -= dt * 2;
    if (this.t < D) return false;
    const p = this.position;
    this.effects.burst(p.x, p.y, p.z + 2, 0xf4f0ff, 110, 26, 1.8, 1.3);
    this.effects.burst(p.x, p.y + 2, p.z + 2, VIOLET, 70, 20, 1.5, 1.2);
    this.effects.burst(p.x, p.y - 1, p.z + 2, CRIMSON, 40, 16, 1.2, 1.1);
    this.effects.ring(p.x, p.y, p.z + 3, 0xf4f0ff, 26, 0.8);
    this.effects.ring(p.x, p.y, p.z + 3, VIOLET, 16, 0.65);
    return true;
  }

  protected updateEscape(dt: number): boolean {
    const u = Math.min(1, this.t / 2);
    this.position.y -= dt * 14 * u;
    this.position.z -= dt * 30 * u;
    this.setFade(1 - u);
    return u >= 1;
  }

  protected animate(dt: number): void {
    this.group.position.copy(this.position);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const fl = this.flash;
    const fighting = this.state === BossState.Phase;
    this.armourMat.emissiveIntensity = 0.55 + fl * 1.4;
    this.trimMat.emissiveIntensity = 0.35 + fl * 1.2 + Math.sin(this.life * 2.4) * 0.08;
    this.shieldMat.emissiveIntensity = 0.6 + fl * 0.8;
    this.rimMat.color.setHex(this.phaseIndex >= 1 && fighting ? CRIMSON : VIOLET).multiplyScalar(1.1 + fl * 0.6 + Math.sin(this.life * 4) * 0.15);
    this.visorMat.color.setHex(VIOLET).multiplyScalar(1.4 + fl * 0.8 + Math.sin(this.life * 3.1) * 0.2);

    // Sword: a raised guard, swung down roughly once a second while fighting (the 剣閃 rhythm).
    this.swingT += dt;
    const period = this.phaseIndex >= 1 ? 1.25 : 1.0;
    if (fighting && this.swingT >= period) {
      this.swingT = 0;
      this.swing = 1;
    }
    this.swing = Math.max(0, this.swing - dt * 2.2);
    const sw = this.swing;
    const arc = sw > 0 ? Math.sin((1 - sw) * Math.PI) : 0;
    // swing 1 → 0: a fast cut down (first 40 %), then the blade is raised again.
    const rest = 2.3 + 0.12 * Math.sin(this.life * 0.8);
    const low = -0.5;
    let rz = rest;
    if (sw > 0.6) {
      const c = (1 - sw) / 0.4;
      rz = rest + (low - rest) * (1 - (1 - c) * (1 - c));
    } else if (sw > 0) {
      const r = 1 - sw / 0.6;
      rz = low + (rest - low) * r * r * (3 - 2 * r);
    }
    this.swordArm.rotation.set(0.15 + arc * 0.3, 0, rz);
    this.body.rotation.y = Math.sin(this.life * 0.45) * 0.18 + arc * 0.25;
    this.body.rotation.z = Math.sin(this.life * 0.6) * 0.04;
    this.body.position.y = Math.sin(this.life * 1.3) * 0.15;

    // Cape shards flutter.
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 0.38;
      this.v.set(x, 2.5 - Math.abs(i - 4) * 0.08, -0.7 - Math.abs(i - 4) * 0.05);
      this.e.set(0.25 + Math.sin(this.life * 2.1 + i * 0.7) * 0.12, 0, x * 0.18 + Math.sin(this.life * 1.7 + i) * 0.05);
      this.q.setFromEuler(this.e);
      this.s.set(1, 1 + Math.abs(i - 4) * -0.06, 1);
      this.m.compose(this.v, this.q, this.s);
      this.cape.setMatrixAt(i, this.m);
    }
    this.cape.instanceMatrix.needsUpdate = true;

    // Shields: orbit (tilted ring), wider and faster in the second phase; scatter on death.
    const wide = this.phaseIndex >= 1 ? 1.3 : 1;
    this.spread += (wide + this.dissolve * 2.5 - this.spread) * (1 - Math.exp(-dt * 2));
    this.shieldSpin += dt * (this.phaseIndex >= 1 ? 1.1 : 0.6);
    for (let i = 0; i < SHIELDS; i++) {
      const a = (i / SHIELDS) * Math.PI * 2 + this.shieldSpin;
      const R = 6.8 * this.spread;
      this.v.set(Math.cos(a) * R, 0.8 + Math.sin(a) * R * 0.45, Math.sin(a) * 1.6);
      this.e.set(Math.sin(a) * 0.4, -Math.cos(a) * 0.5, a);
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.9 + fl * 0.15);
      this.m.compose(this.v, this.q, this.s);
      this.shields.setMatrixAt(i, this.m);
      this.shieldRims.setMatrixAt(i, this.m);
    }
    this.shields.instanceMatrix.needsUpdate = true;
    this.shieldRims.instanceMatrix.needsUpdate = true;
    for (const p of this.parts) p.visible = this.dissolve < 0.98;
  }
}
