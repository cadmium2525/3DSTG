/**
 * Small procedural enemies (crystal core + petal crown + glow halo), pooled and
 * drawn with 3 InstancedMeshes. They fly in from the depths in formations,
 * hover and fire aimedBurst, then leave.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Danmaku, PatternHandle, PatternId, Vec3Like } from '../core/types';
import { ENEMY_KINDS, type EnemyKind, type Formation, type WaveEvent } from './StageData';
import type { Targets } from './Shots';
import type { Rng } from './Rng';

export const MAX_ENEMIES = 32;

const ENTER_SEC = 1.7;
const EXIT_SEC = 1.6;

enum Phase { Off, Enter, Stay, Exit }

export interface EnemyEvents {
  onKilled(kind: EnemyKind, x: number, y: number, z: number): void;
  onHit(x: number, y: number, z: number): void;
}

const HALO_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = pow(max(0.0, 1.0 - r), 2.2);
  float ring = smoothstep(0.55, 0.62, r) * (1.0 - smoothstep(0.62, 0.7, r)) * 0.5;
  gl_FragColor = vec4(vColor * (g * 0.9 + ring), 1.0);
  #include <colorspace_fragment>
}`;

/** Make emissive follow the per-instance colour too (so tint + hit flash glow). */
function tintEmissive(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif',
    );
  };
}

export class Enemies {
  readonly group = new THREE.Group();
  private core: THREE.InstancedMesh;
  private petals: THREE.InstancedMesh;
  private halo: THREE.InstancedMesh;
  private meshes: THREE.InstancedMesh[];

  // Per-slot state.
  private phase = new Uint8Array(MAX_ENEMIES);
  private kind: EnemyKind[] = new Array(MAX_ENEMIES).fill('petal');
  private hp = new Float32Array(MAX_ENEMIES);
  private age = new Float32Array(MAX_ENEMIES);
  private delay = new Float32Array(MAX_ENEMIES);
  private stay = new Float32Array(MAX_ENEMIES);
  private fireEvery = new Float32Array(MAX_ENEMIES);
  private fireT = new Float32Array(MAX_ENEMIES);
  private intensity = new Float32Array(MAX_ENEMIES);
  private flash = new Float32Array(MAX_ENEMIES);
  private wobble = new Float32Array(MAX_ENEMIES);
  private start: THREE.Vector3[] = [];
  private station: THREE.Vector3[] = [];
  private exit: THREE.Vector3[] = [];
  private pos: THREE.Vector3[] = [];
  private origins: (() => Vec3Like)[] = [];
  private handles: (PatternHandle | null)[] = new Array(MAX_ENEMIES).fill(null);
  /** Lantern intro pattern (instead of aimedBurst). */
  private introPattern: (PatternId | null)[] = new Array(MAX_ENEMIES).fill(null);
  private introDur = new Float32Array(MAX_ENEMIES);

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private time = 0;
  /** Stage enemies still on screen. */
  activeCount = 0;

  constructor(private danmaku: Danmaku, private rng: Rng, private ev: EnemyEvents) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      this.start.push(new THREE.Vector3());
      this.station.push(new THREE.Vector3());
      this.exit.push(new THREE.Vector3());
      const p = new THREE.Vector3();
      this.pos.push(p);
      this.origins.push(() => p);
    }

    const coreGeo = new THREE.IcosahedronGeometry(0.42, 0);
    coreGeo.scale(1, 1.35, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.85, metalness: 0.1, roughness: 0.25, flatShading: true,
    });
    tintEmissive(coreMat);
    this.core = new THREE.InstancedMesh(coreGeo, coreMat, MAX_ENEMIES);

    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.26, 0.62, 0.1);
      g.translate(0, 0.78, 0);
      g.rotateX(-0.35); // slightly cupped toward the camera
      g.rotateZ((k / 6) * Math.PI * 2);
      parts.push(g);
    }
    const petalGeo = mergeGeometries(parts)!;
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.4, flatShading: true,
      side: THREE.DoubleSide,
    });
    tintEmissive(petalMat);
    this.petals = new THREE.InstancedMesh(petalGeo, petalMat, MAX_ENEMIES);

    const haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 4.2), haloMat, MAX_ENEMIES);

    this.meshes = [this.core, this.petals, this.halo];
    for (const im of this.meshes) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, this.c.setRGB(1, 1, 1));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.halo.renderOrder = 2;
  }

  private alloc(): number {
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.phase[i] === Phase.Off) return i;
    return -1;
  }

  private stationFor(f: Formation, i: number, n: number, side: number, out: THREE.Vector3): void {
    const c = (n - 1) / 2;
    switch (f) {
      case 'line': {
        const x = n > 1 ? -6 + (12 * i) / (n - 1) : 0;
        out.set(x, 4.6 + Math.sin(i * 1.7) * 0.6, -40 - (side !== 0 ? (side > 0 ? n - i : i) * 0.6 : 0));
        break;
      }
      case 'v': {
        const d = Math.abs(i - c);
        out.set((i - c) * 2.3, 6.2 - d * 1.1, -44 + d * 2.4);
        break;
      }
      case 'arc': {
        const a = (n > 1 ? i / (n - 1) : 0.5) * Math.PI * 0.8 + Math.PI * 0.1;
        out.set(-Math.cos(a) * 7, 1.6 + Math.sin(a) * 4.6, -42);
        break;
      }
      case 'columns': {
        const row = Math.floor(i / 2);
        const sx = i % 2 === 0 ? -1 : 1;
        out.set(sx * 4.8, 6.4 - row * 2.2, -37 - row * 3);
        break;
      }
      case 'center':
      default:
        out.set(0, 1.6, -50);
    }
  }

  spawnWave(w: WaveEvent): void {
    for (let i = 0; i < w.count; i++) {
      const s = this.alloc();
      if (s < 0) return;
      const st = this.station[s];
      this.stationFor(w.formation, i, w.count, w.side, st);
      const sgn = w.side !== 0 ? w.side : st.x >= 0 ? 1 : -1;
      if (w.side !== 0) this.start[s].set(st.x + w.side * 18, st.y + 3, st.z - 30);
      else this.start[s].set(st.x * 1.8, st.y + 7, st.z - 60);
      this.exit[s].set(st.x + sgn * 16, st.y + 9, st.z - 25);
      this.activate(s, w.kind, i * 0.14, w.stay, w.fireEvery, w.intensity);
    }
  }

  /** A lantern carrier that runs one pattern from the centre (stage intro of a boss pattern). */
  spawnLantern(pattern: PatternId, duration: number, intensity: number): void {
    const s = this.alloc();
    if (s < 0) return;
    this.stationFor('center', 0, 1, 0, this.station[s]);
    const st = this.station[s];
    this.start[s].set(0, st.y + 10, st.z - 70);
    this.exit[s].set(0, st.y + 14, st.z - 40);
    this.activate(s, 'lantern', 0, duration + 1.2, 99, intensity);
    this.introPattern[s] = pattern;
    this.introDur[s] = duration;
  }

  private activate(s: number, kind: EnemyKind, delay: number, stay: number, fireEvery: number, intensity: number): void {
    this.phase[s] = Phase.Enter;
    this.kind[s] = kind;
    this.hp[s] = ENEMY_KINDS[kind].hp;
    this.age[s] = 0;
    this.delay[s] = delay;
    this.stay[s] = stay;
    this.fireEvery[s] = fireEvery;
    this.fireT[s] = 0.1 + this.rng.next() * 0.4;
    this.intensity[s] = intensity;
    this.flash[s] = 0;
    this.wobble[s] = this.rng.next() * Math.PI * 2;
    this.handles[s] = null;
    this.introPattern[s] = null;
    this.pos[s].copy(this.start[s]);
  }

  private kill(s: number, byPlayer: boolean): void {
    const h = this.handles[s];
    if (h) h.stop();
    this.handles[s] = null;
    this.phase[s] = Phase.Off;
    if (byPlayer) {
      const p = this.pos[s];
      this.ev.onKilled(this.kind[s], p.x, p.y, p.z);
    }
  }

  /** Make every hovering / entering enemy leave now (e.g. before the boss). */
  retreatAll(): void {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const ph = this.phase[i];
      if (ph === Phase.Off || ph === Phase.Exit) continue;
      if (this.age[i] < this.delay[i]) {
        this.kill(i, false);
        continue;
      }
      const h = this.handles[i];
      if (h) h.stop();
      this.handles[i] = null;
      this.phase[i] = Phase.Exit;
      this.start[i].copy(this.pos[i]);
      this.stay[i] = 0;
      this.age[i] = this.delay[i] + ENTER_SEC;
    }
  }

  /** Remove everything (no score). */
  clear(): void {
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.phase[i] !== Phase.Off) this.kill(i, false);
    this.activeCount = 0;
  }

  /** Shot damage. Returns true if this id belongs to us and was alive. */
  damage(id: number, amount: number): boolean {
    if (id < 0 || id >= MAX_ENEMIES || this.phase[id] === Phase.Off) return false;
    this.hp[id] -= amount;
    this.flash[id] = Math.min(1, this.flash[id] + 0.5);
    const p = this.pos[id];
    if (this.hp[id] <= 0) this.kill(id, true);
    else this.ev.onHit(p.x, p.y, p.z);
    return true;
  }

  /** Push hittable enemies into the target list (ids 0..MAX_ENEMIES-1). */
  addTargets(t: Targets): void {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (this.phase[i] === Phase.Off || this.age[i] < this.delay[i] + ENTER_SEC * 0.75) continue;
      const p = this.pos[i];
      t.add(i, p.x, p.y, p.z, ENEMY_KINDS[this.kind[i]].hitRadius);
    }
  }

  update(dt: number, allowFire: boolean): void {
    this.time += dt;
    let n = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const ph = this.phase[i];
      if (ph === Phase.Off) continue;
      this.age[i] += dt;
      const t = this.age[i] - this.delay[i];
      const p = this.pos[i];
      const st = this.station[i];
      let bloom = 1;
      if (t < 0) continue; // staggered, not visible yet
      if (ph === Phase.Enter) {
        const u = Math.min(1, t / ENTER_SEC);
        const e = 1 - Math.pow(1 - u, 3);
        p.lerpVectors(this.start[i], st, e);
        bloom = 0.3 + 0.7 * e;
        if (u >= 1) {
          this.phase[i] = Phase.Stay;
          this.age[i] = this.delay[i] + ENTER_SEC;
          const ip = this.introPattern[i];
          if (ip && allowFire) {
            this.handles[i] = this.danmaku.startPattern(ip, {
              origin: this.origins[i], duration: this.introDur[i], intensity: this.intensity[i], seed: this.rng.int(),
            });
          }
        }
      } else if (ph === Phase.Stay) {
        const ts = t - ENTER_SEC;
        const w = this.wobble[i];
        p.set(st.x + Math.sin(this.time * 1.3 + w) * 0.7, st.y + Math.cos(this.time * 1.1 + w) * 0.4, st.z);
        if (!this.introPattern[i]) {
          this.fireT[i] -= dt;
          if (this.fireT[i] <= 0 && allowFire) {
            this.fireT[i] = this.fireEvery[i];
            this.handles[i] = this.danmaku.startPattern('aimedBurst', {
              origin: this.origins[i], duration: 0.5, intensity: this.intensity[i], seed: this.rng.int(),
            });
          }
        }
        if (ts >= this.stay[i]) {
          this.phase[i] = Phase.Exit;
          this.start[i].copy(p);
          this.age[i] = this.delay[i] + ENTER_SEC + this.stay[i];
          const h = this.handles[i];
          if (h) h.stop();
          this.handles[i] = null;
        }
      } else {
        const u = Math.min(1, (t - ENTER_SEC - this.stay[i]) / EXIT_SEC);
        p.lerpVectors(this.start[i], this.exit[i], u * u);
        bloom = 1 - u * 0.6;
        if (u >= 1) {
          this.kill(i, false);
          continue;
        }
      }

      // Visuals.
      const def = ENEMY_KINDS[this.kind[i]];
      this.flash[i] = Math.max(0, this.flash[i] - dt * 7);
      const f = this.flash[i];
      const sc = def.scale;
      const spin = this.time * (this.kind[i] === 'crystal' ? -1.6 : 1.1) + this.wobble[i];
      this.e.set(Math.sin(this.time * 0.9 + this.wobble[i]) * 0.3, Math.sin(this.time * 0.7) * 0.3, spin);
      this.q.setFromEuler(this.e);
      this.s.setScalar(sc);
      this.m.compose(p, this.q, this.s);
      this.core.setMatrixAt(n, this.m);
      this.s.set(sc * bloom, sc * bloom, sc);
      this.m.compose(p, this.q, this.s);
      this.petals.setMatrixAt(n, this.m);
      const hs = this.kind[i] === 'lantern' ? sc * 0.7 : sc;
      this.m.makeScale(hs, hs, 1);
      this.m.setPosition(p.x, p.y, p.z + 0.2);
      this.halo.setMatrixAt(n, this.m);

      this.c.setHex(def.color);
      const boost = 1 + f * 1.2;
      this.core.setColorAt(n, this.c.setRGB(Math.min(1, this.c.r * 0.6 + 0.4) * boost, Math.min(1, this.c.g * 0.6 + 0.4) * boost, Math.min(1, this.c.b * 0.6 + 0.4) * boost));
      this.c.setHex(def.color);
      this.petals.setColorAt(n, this.c.multiplyScalar(boost));
      this.c.setHex(def.color);
      this.halo.setColorAt(n, this.c.multiplyScalar((this.kind[i] === 'lantern' ? 0.3 : 0.45) + f * 0.3));
      n++;
    }
    let active = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.phase[i] !== Phase.Off) active++;
    this.activeCount = active;
    for (const im of this.meshes) {
      im.count = n;
      if (n > 0) {
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
      }
    }
  }
}
