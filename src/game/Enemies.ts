/**
 * Small procedural enemies, pooled. Kinds, shapes and formations are data (see
 * src/game/enemies/registry.ts); this class runs them: entry / hover / exit (or a path / drift /
 * custom motion script), fire scripts, damage, and the instanced drawing — one core + one crown
 * InstancedMesh per registered shape (only drawn while that shape is on screen) and one shared
 * glow-halo InstancedMesh.
 */
import * as THREE from 'three';
import type { Danmaku, PatternHandle, PatternId, Vec3Like } from '../core/types';
import type { Effects } from './Effects';
import { enemyShapes, getEnemyKind, getFormation, type EnemyKindDef, type EnemyMotionState, type FormationSlot } from './enemies/registry';
import type { Targets } from './Shots';
import type { Rng } from './Rng';
import { DIFFICULTY, scaleIntensity, type Difficulty, type WaveEvent } from './stages/types';
import './enemies/builtin';

export const MAX_ENEMIES = 32;

const ENTER_SEC = 1.7;
const EXIT_SEC = 1.6;
/** Path kinds become targetable this long after appearing. */
const PATH_TARGET_SEC = 0.35;

enum Phase { Off, Enter, Stay, Exit }

export interface EnemyEvents {
  onKilled(kind: string, def: EnemyKindDef, x: number, y: number, z: number): void;
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
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif',
    );
  };
}

interface ShapeMeshes {
  core: THREE.InstancedMesh;
  crown: THREE.InstancedMesh | null;
  n: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const PLACEHOLDER_KIND: EnemyKindDef = { hp: 1, score: 0, hitRadius: 1, drops: { stars: 0, power: 0 }, scale: 1, color: 0xffffff };

export class Enemies {
  readonly group = new THREE.Group();
  private halo: THREE.InstancedMesh;
  private shapeMeshes = new Map<string, ShapeMeshes>();
  private coreMat: THREE.MeshStandardMaterial;
  private crownMat: THREE.MeshStandardMaterial;
  difficulty: Difficulty = DIFFICULTY.normal;

  // Per-slot state.
  private phase = new Uint8Array(MAX_ENEMIES);
  private kindId: string[] = new Array(MAX_ENEMIES).fill('petal');
  private def: EnemyKindDef[] = [];
  private hp = new Float32Array(MAX_ENEMIES);
  private age = new Float32Array(MAX_ENEMIES);
  private delay = new Float32Array(MAX_ENEMIES);
  private stay = new Float32Array(MAX_ENEMIES);
  private fireEvery = new Float32Array(MAX_ENEMIES);
  private fireT = new Float32Array(MAX_ENEMIES);
  private trailT = new Float32Array(MAX_ENEMIES);
  private intensity = new Float32Array(MAX_ENEMIES);
  private flash = new Float32Array(MAX_ENEMIES);
  private wobble = new Float32Array(MAX_ENEMIES);
  private start: THREE.Vector3[] = [];
  private station: THREE.Vector3[] = [];
  private exit: THREE.Vector3[] = [];
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private origins: (() => Vec3Like)[] = [];
  private handles: (PatternHandle | null)[] = new Array(MAX_ENEMIES).fill(null);
  /** Lantern intro pattern (instead of the kind's fire script). */
  private introPattern: (PatternId | null)[] = new Array(MAX_ENEMIES).fill(null);
  private introDur = new Float32Array(MAX_ENEMIES);

  private slot: FormationSlot;
  private ms: EnemyMotionState;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private c = new THREE.Color();
  private time = 0;
  /** Stage enemies still on screen. */
  activeCount = 0;

  constructor(private danmaku: Danmaku, private rng: Rng, private ev: EnemyEvents, private effects?: Effects) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      this.start.push(new THREE.Vector3());
      this.station.push(new THREE.Vector3());
      this.exit.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      const p = new THREE.Vector3();
      this.pos.push(p);
      this.origins.push(() => p);
      this.def.push(PLACEHOLDER_KIND);
    }
    this.slot = { station: new THREE.Vector3(), start: new THREE.Vector3(), exit: new THREE.Vector3() };
    this.ms = { t: 0, dt: 0, time: 0, pos: this.pos[0], start: this.start[0], station: this.station[0], exit: this.exit[0], stay: 0, wobble: 0 };

    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.85, metalness: 0.1, roughness: 0.25, flatShading: true,
    });
    tintEmissive(this.coreMat);
    this.crownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.4, flatShading: true,
      side: THREE.DoubleSide,
    });
    tintEmissive(this.crownMat);

    const haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 4.2), haloMat, MAX_ENEMIES);
    this.prepMesh(this.halo);
    // Above the stage-3 darkness overlay (2.5): enemies' glow shows through the dark, their bodies don't.
    this.halo.renderOrder = 3;
    for (const id of enemyShapes().keys()) this.meshesFor(id);
  }

  private prepMesh(im: THREE.InstancedMesh): void {
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, this.c.setRGB(1, 1, 1));
    im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    this.group.add(im);
  }

  /** Instanced meshes of a shape (created on first use for shapes registered later). */
  private meshesFor(id: string): ShapeMeshes {
    let sm = this.shapeMeshes.get(id);
    if (sm) return sm;
    const def = enemyShapes().get(id) ?? enemyShapes().get('flower')!;
    const core = new THREE.InstancedMesh(def.core(), this.coreMat, MAX_ENEMIES);
    this.prepMesh(core);
    let crown: THREE.InstancedMesh | null = null;
    if (def.crown) {
      crown = new THREE.InstancedMesh(def.crown(), this.crownMat, MAX_ENEMIES);
      this.prepMesh(crown);
    }
    sm = { core, crown, n: 0 };
    this.shapeMeshes.set(id, sm);
    return sm;
  }

  private alloc(): number {
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.phase[i] === Phase.Off) return i;
    return -1;
  }

  spawnWave(w: WaveEvent): void {
    const form = getFormation(w.formation);
    const step = w.delayStep ?? 0.14;
    for (let i = 0; i < w.count; i++) {
      const s = this.alloc();
      if (s < 0) return;
      const slot = this.slot;
      slot.station = this.station[s];
      slot.start = this.start[s];
      slot.exit = this.exit[s];
      form(i, w.count, w, slot, this.rng);
      this.activate(s, w.kind, i * step, w.stay, w.fireEvery, w.intensity);
      if (w.quiet) this.fireT[s] = 1e9;
    }
  }

  /** A lantern carrier that runs one pattern from the centre (stage intro of a boss pattern). */
  spawnLantern(pattern: PatternId, duration: number, intensity: number, kind = 'lantern'): void {
    const s = this.alloc();
    if (s < 0) return;
    const st = this.station[s];
    st.set(0, 1.6, -50);
    this.start[s].set(0, st.y + 10, st.z - 70);
    this.exit[s].set(0, st.y + 14, st.z - 40);
    this.activate(s, kind, 0, duration + 1.2, 99, intensity);
    this.introPattern[s] = pattern;
    this.introDur[s] = duration;
  }

  private activate(s: number, kind: string, delay: number, stay: number, fireEvery: number, intensity: number): void {
    const def = getEnemyKind(kind);
    this.meshesFor(def.shape ?? 'flower');
    this.phase[s] = Phase.Enter;
    this.kindId[s] = kind;
    this.def[s] = def;
    this.hp[s] = def.hp * this.difficulty.enemyHp;
    this.age[s] = 0;
    this.delay[s] = delay;
    this.stay[s] = stay;
    this.fireEvery[s] = fireEvery * this.difficulty.fireRate;
    this.fireT[s] = def.fire?.firstDelay ?? 0.1 + this.rng.next() * 0.4;
    this.trailT[s] = 0;
    this.intensity[s] = scaleIntensity(intensity * (def.fire?.intensityMul ?? 1), this.difficulty);
    this.flash[s] = 0;
    this.wobble[s] = this.rng.next() * Math.PI * 2;
    this.handles[s] = null;
    this.introPattern[s] = null;
    this.pos[s].copy(this.start[s]);
    this.vel[s].set(0, 0, 0);
  }

  private stopFire(s: number): void {
    const h = this.handles[s];
    if (h) h.stop();
    this.handles[s] = null;
  }

  private kill(s: number, byPlayer: boolean): void {
    this.stopFire(s);
    this.phase[s] = Phase.Off;
    if (byPlayer) {
      const p = this.pos[s];
      this.ev.onKilled(this.kindId[s], this.def[s], p.x, p.y, p.z);
    }
  }

  private motionType(s: number): string {
    return this.def[s].motion?.type ?? 'station';
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
      this.stopFire(i);
      const mt = this.motionType(i);
      if (mt === 'path' || mt === 'custom') continue; // already passing through; they leave on their own
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

  private targetable(i: number, frac: number): boolean {
    if (this.phase[i] === Phase.Off) return false;
    const t = this.age[i] - this.delay[i];
    const mt = this.motionType(i);
    if (mt === 'path' || mt === 'custom') return t >= PATH_TARGET_SEC;
    return t >= ENTER_SEC * frac;
  }

  /** Damage every enemy that is on screen (bomb). */
  damageAll(amount: number): void {
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.targetable(i, 0.3)) this.damage(i, amount);
  }

  /** Push hittable enemies into the target list (ids 0..MAX_ENEMIES-1). */
  addTargets(t: Targets): void {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!this.targetable(i, 0.75)) continue;
      const p = this.pos[i];
      t.add(i, p.x, p.y, p.z, this.def[i].hitRadius);
    }
  }

  private startFire(i: number, pattern: PatternId, duration: number): void {
    this.handles[i] = this.danmaku.startPattern(pattern, {
      origin: this.origins[i], duration, intensity: this.intensity[i], seed: this.rng.int(),
    });
  }

  /** Default / scripted fire while the enemy is in its active part of life. */
  private updateFire(i: number, dt: number, allowFire: boolean, lifeLeft: number): void {
    if (this.introPattern[i]) return;
    const fire = this.def[i].fire;
    if (fire === null) return;
    if (fire?.continuous) {
      if (!this.handles[i] && allowFire) {
        this.fireT[i] -= dt;
        if (this.fireT[i] <= 0 && lifeLeft > 0.2) {
          this.fireT[i] = 1e9;
          this.startFire(i, fire.pattern, lifeLeft);
        }
      }
      return;
    }
    this.fireT[i] -= dt;
    if (this.fireT[i] <= 0 && allowFire) {
      this.fireT[i] = this.fireEvery[i];
      this.startFire(i, fire?.pattern ?? 'aimedBurst', fire?.duration ?? 0.5);
    }
  }

  update(dt: number, allowFire: boolean): void {
    this.time += dt;
    for (const sm of this.shapeMeshes.values()) sm.n = 0;
    let nh = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const ph = this.phase[i];
      if (ph === Phase.Off) continue;
      this.age[i] += dt;
      const t = this.age[i] - this.delay[i];
      if (t < 0) continue; // staggered, not visible yet
      const p = this.pos[i];
      const def = this.def[i];
      const motion = def.motion ?? { type: 'station' as const };
      this.prev.copy(p);
      let bloom = 1;

      if (motion.type === 'path') {
        const dur = Math.max(0.1, this.stay[i]);
        const u = Math.min(1, t / dur);
        p.lerpVectors(this.start[i], this.exit[i], u);
        if (motion.arc) p.y += Math.sin(u * Math.PI) * motion.arc;
        bloom = Math.min(1, t / 0.4);
        if (ph === Phase.Enter) this.updateFire(i, dt, allowFire, dur - t);
        if (u >= 1) {
          this.kill(i, false);
          continue;
        }
      } else if (motion.type === 'custom') {
        const ms = this.ms;
        ms.t = t; ms.dt = dt; ms.time = this.time; ms.pos = p; ms.start = this.start[i]; ms.station = this.station[i];
        ms.exit = this.exit[i]; ms.stay = this.stay[i]; ms.wobble = this.wobble[i];
        if (ph === Phase.Enter) this.updateFire(i, dt, allowFire, 99);
        if (motion.update(ms)) {
          this.kill(i, false);
          continue;
        }
      } else if (ph === Phase.Enter) {
        const u = Math.min(1, t / ENTER_SEC);
        const e = 1 - Math.pow(1 - u, 3);
        p.lerpVectors(this.start[i], this.station[i], e);
        bloom = 0.3 + 0.7 * e;
        if (u >= 1) {
          this.phase[i] = Phase.Stay;
          this.age[i] = this.delay[i] + ENTER_SEC;
          const ip = this.introPattern[i];
          if (ip && allowFire) this.startFire(i, ip, this.introDur[i]);
        }
      } else if (ph === Phase.Stay) {
        const ts = t - ENTER_SEC;
        const w = this.wobble[i];
        const st = this.station[i];
        if (motion.type === 'drift') {
          const sw = motion.sway ?? 0.6;
          p.set(
            st.x + motion.vx * ts + Math.sin(this.time * 0.8 + w) * sw,
            st.y + motion.vy * ts + Math.sin(this.time * 1.6 + w) * sw * 0.35,
            st.z + (motion.vz ?? 0) * ts,
          );
        } else {
          p.set(st.x + Math.sin(this.time * 1.3 + w) * 0.7, st.y + Math.cos(this.time * 1.1 + w) * 0.4, st.z);
        }
        this.updateFire(i, dt, allowFire, this.stay[i] - ts);
        if (ts >= this.stay[i]) {
          this.phase[i] = Phase.Exit;
          this.start[i].copy(p);
          this.age[i] = this.delay[i] + ENTER_SEC + this.stay[i];
          this.stopFire(i);
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
      if (dt > 0) this.vel[i].subVectors(p, this.prev).divideScalar(dt);

      // Trail.
      if (def.trail && this.effects) {
        this.trailT[i] -= dt;
        if (this.trailT[i] <= 0) {
          this.trailT[i] = def.trail.every;
          this.effects.burst(p.x, p.y, p.z, def.trail.color, 2, 1.4, def.trail.size, def.trail.life);
        }
      }

      // Visuals.
      const sm = this.shapeMeshes.get(def.shape ?? 'flower')!;
      const n = sm.n++;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 7);
      const f = this.flash[i];
      const sc = def.scale;
      const w = this.wobble[i];
      const spin = this.time * (def.spin ?? 1.1) + w;
      if (def.faceMotion && this.vel[i].lengthSq() > 1e-4) {
        this.v.copy(this.vel[i]).normalize();
        this.q.setFromUnitVectors(Y_AXIS, this.v);
        this.q2.setFromAxisAngle(Y_AXIS, spin);
        this.q.multiply(this.q2);
      } else if (def.spinAxis === 'y') {
        this.e.set(Math.sin(this.time * 0.9 + w) * 0.16, spin, Math.sin(this.time * 0.7 + w) * 0.12);
        this.q.setFromEuler(this.e);
      } else {
        this.e.set(Math.sin(this.time * 0.9 + w) * 0.3, Math.sin(this.time * 0.7) * 0.3, spin);
        this.q.setFromEuler(this.e);
      }
      let pulse = 1;
      if (def.pulse) pulse = 1 + def.pulse.amount * Math.sin(this.time * def.pulse.speed + w);
      this.s.set(sc * (2 - pulse), sc * (0.6 + 0.4 * pulse), sc * (2 - pulse));
      if (!def.pulse) this.s.setScalar(sc);
      this.m.compose(p, this.q, this.s);
      sm.core.setMatrixAt(n, this.m);
      if (sm.crown) {
        this.s.set(sc * bloom * (def.pulse ? 2 - pulse : 1), sc * bloom * pulse, sc * (def.pulse ? 2 - pulse : 1));
        this.m.compose(p, this.q, this.s);
        sm.crown.setMatrixAt(n, this.m);
      }
      const hs = sc * (def.haloScale ?? 1);
      this.m.makeScale(hs, hs, 1);
      this.m.setPosition(p.x, p.y, p.z + 0.2);
      this.halo.setMatrixAt(nh, this.m);

      const boost = 1 + f * 1.2;
      if (def.coreColor !== undefined) this.c.setHex(def.coreColor).multiplyScalar(boost);
      else {
        this.c.setHex(def.color);
        this.c.setRGB(Math.min(1, this.c.r * 0.6 + 0.4) * boost, Math.min(1, this.c.g * 0.6 + 0.4) * boost, Math.min(1, this.c.b * 0.6 + 0.4) * boost);
      }
      sm.core.setColorAt(n, this.c);
      if (sm.crown) sm.crown.setColorAt(n, this.c.setHex(def.color).multiplyScalar(boost));
      this.halo.setColorAt(nh, this.c.setHex(def.color).multiplyScalar((def.haloGain ?? 0.45) + f * 0.3));
      nh++;
    }
    let active = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.phase[i] !== Phase.Off) active++;
    this.activeCount = active;
    const flush = (im: THREE.InstancedMesh, n: number) => {
      im.count = n;
      im.visible = n > 0;
      if (n > 0) {
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
      }
    };
    flush(this.halo, nh);
    for (const sm of this.shapeMeshes.values()) {
      flush(sm.core, sm.n);
      if (sm.crown) flush(sm.crown, sm.n);
    }
  }
}
