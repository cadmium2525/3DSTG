/**
 * Stage 2 mid-boss 「黄昏の灯守 ランテルナ」: a tall lantern spirit whose light is being eaten by
 * shadow. Hexagonal paper body (shader: warm glow with a wavering shadow line creeping up from the
 * bottom), bronze frame, roof and pedestal, a flickering flame inside, shadow tendrils winding up
 * the frame (they climb higher each phase), six little lanterns orbiting it (they release the
 * 灯籠流し lanterns; one by one they go dark) and a soft glow. ~10 draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PhasedBoss } from '../../bosses/PhasedBoss';
import { BossState, type BossConfig, type BossContext } from '../../bosses/BossLike';

export interface LanternaConfig extends BossConfig {
  swayX: number;
  swayY: number;
  swayZ: number;
}

const AMBER = 0xffa04a;
const GOLD = 0xffd166;
const ROSE = 0xff6f8a;
const VIOLET = 0x8a5cff;
const MINI = 6;
const TENDRILS = 7;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Paper panels: warm glow, ribs, a wavering shadow rising from below (uShadow = height 0..1). */
const PAPER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uShadow;
uniform float uLight;
varying vec2 vUv;
#define S(c) pow(c, vec3(2.2))
void main() {
  float y = vUv.y;
  float a = vUv.x * 6.0;
  float edge = abs(fract(a) - 0.5) * 2.0;       // 1 at the frame posts
  float rib = smoothstep(0.92, 1.0, edge);
  float bands = 0.85 + 0.15 * sin(y * 40.0);
  float glow = (0.55 + 0.45 * (1.0 - edge * edge)) * bands * (0.8 + 0.2 * sin(y * 3.14159));
  // Shadow line: wavering, rising with uShadow.
  float line = uShadow * 1.05 - 0.05 + 0.06 * sin(vUv.x * 37.7 + uTime * 1.3) + 0.04 * sin(vUv.x * 12.6 - uTime * 0.9);
  float shade = smoothstep(line + 0.04, line - 0.06, y);
  float rim = exp(-pow((y - line) * 22.0, 2.0));
  vec3 warm = mix(S(vec3(1.0, 0.5, 0.2)), S(vec3(1.0, 0.8, 0.45)), smoothstep(0.1, 0.9, y));
  vec3 col = warm * glow * (1.0 - shade) * uLight * 0.62 + S(vec3(0.55, 0.32, 1.0)) * rim * 0.55 + S(vec3(0.06, 0.02, 0.12)) * shade;
  col *= (1.0 - rib * 0.7);
  col *= (0.85 + uFlash * 0.8) * uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Flame billboard: a teardrop with a hot core; uFlicker drives the shape noise. */
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlicker;
uniform float uPower;
uniform float uFade;
varying vec2 vUv;
#define S(c) pow(c, vec3(2.2))
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float w = 0.55 * (1.0 - smoothstep(-0.9, 1.0, p.y)) + 0.08;
  float wob = sin(p.y * 6.0 - uTime * 9.0) * 0.07 * (p.y + 1.0) * (0.6 + uFlicker);
  float dx = (p.x - wob) / w;
  float body = smoothstep(1.0, 0.2, abs(dx)) * smoothstep(-1.0, -0.6, p.y) * smoothstep(1.0, 0.1, p.y);
  float core = smoothstep(0.5, 0.0, length(vec2(dx * 0.6, (p.y + 0.35) * 1.6)));
  float fl = 0.82 + 0.18 * sin(uTime * 23.0) * sin(uTime * 7.3 + 1.0) * (0.3 + uFlicker);
  vec3 col = S(vec3(1.0, 0.45, 0.15)) * body + S(vec3(1.0, 0.85, 0.55)) * core * 1.2;
  gl_FragColor = vec4(col * fl * uPower * uFade, 1.0);
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

/** Tube along a curve whose radius tapers from r0 to r1 (shadow tendrils). */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, seg: number, radial: number, r0: number, r1: number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, p);
    const r = r0 + (r1 - r0) * u;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.push(p.x + N.x * c + B.x * s, p.y + N.y * c + B.y * s, p.z + N.z * c + B.z * s);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      const c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Lanterna extends PhasedBoss<LanternaConfig> {
  private body = new THREE.Group();
  private paperMat: THREE.ShaderMaterial;
  private flameMat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;
  private frameMat: THREE.MeshStandardMaterial;
  private tendrilMat: THREE.MeshStandardMaterial;
  private tendrils: THREE.Group[] = [];
  private minis: THREE.InstancedMesh;
  private miniMat: THREE.MeshStandardMaterial;
  private shadow = 0.25;
  private reach = 0.5;
  private burstT = 0;
  private emberT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(ctx: BossContext<LanternaConfig>) {
    super(ctx);
    this.group.add(this.body);

    // Paper body (open hexagonal cylinder, uv.x around, uv.y up).
    this.paperMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: PAPER_FRAG,
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 }, uShadow: { value: 0.25 }, uLight: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.7, 5.4, 6, 1, true), this.paperMat);
    paper.renderOrder = 1;
    this.body.add(paper);

    // Bronze frame: posts, rings, roof, finial, pedestal (one merged mesh).
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const post = new THREE.BoxGeometry(0.16, 5.8, 0.16);
      post.translate(Math.cos(a) * 1.86, 0, Math.sin(a) * 1.86);
      parts.push(post);
    }
    for (const [y, r] of [[2.75, 2.0], [-2.75, 1.78], [0.9, 1.9]] as const) {
      const ring = new THREE.TorusGeometry(r, 0.09, 4, 6);
      ring.rotateX(Math.PI / 2);
      ring.rotateY(Math.PI / 6);
      ring.translate(0, y, 0);
      parts.push(ring);
    }
    const roof = new THREE.ConeGeometry(3.1, 1.7, 6);
    roof.translate(0, 3.65, 0);
    parts.push(roof);
    const roof2 = new THREE.ConeGeometry(1.2, 1.1, 6);
    roof2.translate(0, 4.75, 0);
    parts.push(roof2);
    const fin = new THREE.OctahedronGeometry(0.42, 0);
    fin.scale(1, 1.6, 1);
    fin.translate(0, 5.75, 0);
    parts.push(fin);
    for (const s of [-1, 1]) {
      // upturned roof corners
      const curl = new THREE.OctahedronGeometry(1, 0);
      curl.scale(0.12, 0.5, 0.12);
      curl.rotateZ(-s * 0.9);
      curl.translate(s * 3.1, 3.05, 0);
      parts.push(curl);
    }
    const ped = new THREE.CylinderGeometry(1.25, 0.8, 0.9, 6);
    ped.translate(0, -3.25, 0);
    parts.push(ped);
    const ped2 = new THREE.CylinderGeometry(0.45, 0.9, 1.3, 6);
    ped2.translate(0, -4.3, 0);
    parts.push(ped2);
    const tip = new THREE.OctahedronGeometry(0.4, 0);
    tip.scale(1, 2.2, 1);
    tip.translate(0, -5.4, 0);
    parts.push(tip);
    const frameGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    frameGeo.computeVertexNormals();
    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0x5a3a2a, emissive: 0xff7a3a, emissiveIntensity: 0.18, metalness: 0.6, roughness: 0.4, flatShading: true, fog: false,
    });
    const frame = new THREE.Mesh(frameGeo, this.frameMat);
    this.body.add(frame);

    // Flame.
    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FLAME_FRAG,
      uniforms: { uTime: { value: 0 }, uFlicker: { value: 0.2 }, uPower: { value: 1 }, uFade: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), this.flameMat);
    flame.position.set(0, 0.2, 0.2);
    flame.renderOrder = 2;
    this.body.add(flame);

    // Shadow tendrils climbing the frame.
    this.tendrilMat = new THREE.MeshStandardMaterial({
      color: 0x120822, emissive: VIOLET, emissiveIntensity: 0.22, metalness: 0.1, roughness: 0.8, flatShading: true, fog: false,
    });
    for (let k = 0; k < TENDRILS; k++) {
      const a0 = (k / TENDRILS) * Math.PI * 2 + 0.3;
      const turn = (k % 2 ? 1 : -1) * (1.2 + (k % 3) * 0.35);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        const a = a0 + turn * u;
        const r = 2.3 - 0.4 * u + 0.25 * Math.sin(u * 9 + k);
        pts.push(new THREE.Vector3(Math.cos(a) * r, -5.6 + u * 8.6, Math.sin(a) * r));
      }
      const geo = taperedTube(new THREE.CatmullRomCurve3(pts), 28, 5, 0.32, 0.03);
      geo.translate(0, 5.6, 0); // pivot at the root
      const pivot = new THREE.Group();
      pivot.position.y = -5.6;
      const mesh = new THREE.Mesh(geo, this.tendrilMat);
      pivot.add(mesh);
      this.tendrils.push(pivot);
      this.body.add(pivot);
    }

    // Little lanterns orbiting.
    const mg: THREE.BufferGeometry[] = [];
    const mb = new THREE.CylinderGeometry(0.42, 0.36, 0.8, 6);
    mg.push(mb);
    const mr = new THREE.ConeGeometry(0.62, 0.38, 6);
    mr.translate(0, 0.58, 0);
    mg.push(mr);
    const mbs = new THREE.CylinderGeometry(0.44, 0.5, 0.12, 6);
    mbs.translate(0, -0.46, 0);
    mg.push(mbs);
    const miniGeo = mergeGeometries(mg.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    miniGeo.computeVertexNormals();
    this.miniMat = new THREE.MeshStandardMaterial({
      color: 0xffe6c0, emissive: 0xffffff, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.5, flatShading: true, fog: false,
    });
    this.miniMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif',
      );
    };
    this.minis = new THREE.InstancedMesh(miniGeo, this.miniMat, MINI);
    this.minis.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MINI; i++) this.minis.setColorAt(i, this.c.setHex(AMBER));
    this.minis.frustumCulled = false;
    this.body.add(this.minis);

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(AMBER) }, uIntensity: { value: 0.45 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(15, 17), this.glowMat);
    glow.position.set(0, 0.4, -2.5);
    glow.renderOrder = 0;
    this.body.add(glow);
  }

  protected onReset(): void {
    this.body.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.shadow = 0.25;
    this.reach = 0.5;
  }

  protected onSpawn(): void {
    this.paperMat.uniforms.uFade.value = 1;
    this.flameMat.uniforms.uFade.value = 1;
    const P = this.config.position;
    this.position.set(P.x + 12, P.y - 10, -150);
  }

  protected moveEnter(u: number): void {
    // Rise from the cloud sea on the right, swinging into place.
    const P = this.config.position;
    const e = 1 - Math.pow(1 - u, 3);
    this.position.set(P.x + (1 - e) * 12 - Math.sin(e * Math.PI) * 4, P.y + (1 - e) * -10, -150 + (P.z + 150) * e);
  }

  private sway(dt: number): void {
    const C = this.config;
    const P = C.position;
    const k = this.phaseIndex >= 1 ? 1.3 : 1;
    const L = this.life * k;
    const tx = P.x + Math.sin(L * 0.5) * C.swayX;
    const ty = P.y + Math.sin(L * 0.9) * C.swayY;
    const tz = P.z + Math.sin(L * 0.33) * C.swayZ;
    const f = 1 - Math.exp(-dt * 2.5);
    this.position.x += (tx - this.position.x) * f;
    this.position.y += (ty - this.position.y) * f;
    this.position.z += (tz - this.position.z) * f;
  }

  protected movePhase(dt: number): void {
    this.sway(dt);
  }

  protected onDeathStart(): void {
    this.burstT = 0;
  }

  protected updateDying(dt: number): boolean {
    const D = this.config.deathSec;
    const u = this.t / D;
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 0.1;
      const p = this.position;
      const col = this.rng.next() < 0.45 ? VIOLET : this.rng.next() < 0.5 ? AMBER : GOLD;
      this.effects.burst(p.x + (this.rng.next() - 0.5) * 5, p.y + (this.rng.next() - 0.5) * 9, p.z + 2, col, 18, 10, 1.0, 0.8);
    }
    // The shadow swallows the paper, the flame gutters, then everything bursts.
    this.shadow = Math.min(1.05, this.shadow + dt * 1.2);
    this.flameMat.uniforms.uPower.value = (1 - u) * (0.6 + 0.4 * Math.sin(this.t * 31));
    this.flash = 0.5 + Math.sin(this.t * 36) * 0.4;
    this.paperMat.uniforms.uFade.value = Math.max(0, 1 - u * 0.8);
    this.body.rotation.z = Math.sin(this.t * 17) * 0.05 * u;
    this.body.scale.setScalar(1 + u * 0.1);
    if (this.t < D) return false;
    const p = this.position;
    this.effects.burst(p.x, p.y, p.z + 2, 0xfff0d8, 90, 26, 1.8, 1.3);
    this.effects.burst(p.x, p.y + 2, p.z + 2, AMBER, 60, 20, 1.5, 1.2);
    this.effects.burst(p.x, p.y - 2, p.z + 2, VIOLET, 50, 16, 1.4, 1.1);
    this.effects.burst(p.x, p.y, p.z + 2, ROSE, 30, 14, 1.2, 1.0);
    this.effects.ring(p.x, p.y, p.z + 3, 0xfff0d8, 24, 0.8);
    this.effects.ring(p.x, p.y, p.z + 3, AMBER, 15, 0.65);
    this.body.scale.setScalar(1);
    return true;
  }

  protected updateEscape(dt: number): boolean {
    // Sinks back into the clouds while the light goes out.
    const u = Math.min(1, this.t / 2);
    this.position.y -= dt * 9 * u;
    this.position.z -= dt * 30 * u;
    this.paperMat.uniforms.uFade.value = 1 - u;
    this.flameMat.uniforms.uFade.value = 1 - u;
    return u >= 1;
  }

  protected animate(dt: number): void {
    this.group.position.copy(this.position);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash;
    const ph = this.state === BossState.Phase || this.state === BossState.Breather ? Math.max(0, this.phaseIndex) : 0;
    const dying = this.state === BossState.Dying;
    // Shadow height & tendril reach grow with the phase (and as HP falls within it).
    if (!dying) {
      const hpK = this.state === BossState.Phase ? 1 - this.hp : 0;
      const target = (ph >= 1 ? 0.5 : 0.22) + hpK * 0.35;
      this.shadow += (target - this.shadow) * (1 - Math.exp(-dt * 1.5));
    }
    const reachT = dying ? 0.2 : ph >= 1 ? 1.0 : 0.62;
    this.reach += (reachT - this.reach) * (1 - Math.exp(-dt * (dying ? 3 : 1.2)));

    const L = this.life;
    const U = this.paperMat.uniforms;
    U.uTime.value = L;
    U.uFlash.value = fl;
    U.uShadow.value = this.shadow;
    U.uLight.value = 1 - this.shadow * 0.35 + 0.08 * Math.sin(L * 13) * Math.sin(L * 5.1);
    const F = this.flameMat.uniforms;
    F.uTime.value = L;
    F.uFlicker.value = ph >= 1 ? 1 : 0.25;
    if (!dying && this.state !== BossState.Escape) {
      // Phase 2: the flame stutters (揺らぐ灯).
      const stut = ph >= 1 ? 0.75 + 0.25 * Math.sign(Math.sin(L * 7.3) + 0.6) : 1;
      F.uPower.value = (1.05 + fl * 0.4) * stut;
    }
    this.frameMat.emissiveIntensity = 0.16 + fl * 0.5;
    this.tendrilMat.emissiveIntensity = 0.18 + 0.12 * Math.sin(L * 2.3);
    this.glowMat.uniforms.uIntensity.value = (0.36 + fl * 0.25 + Math.sin(L * 9) * 0.03) * (1 - this.shadow * 0.4);

    // Body sways like a hanging lantern.
    this.body.rotation.y = L * 0.25;
    if (!dying) this.body.rotation.z = Math.sin(L * 0.9) * 0.06;

    for (let k = 0; k < TENDRILS; k++) {
      const t = this.tendrils[k];
      const w = Math.sin(L * (1.1 + k * 0.13) + k * 1.7);
      t.scale.set(1 + 0.05 * w, Math.max(0.05, this.reach * (0.82 + 0.18 * Math.sin(L * 0.7 + k))), 1 + 0.05 * w);
      t.rotation.set(0.06 * w, Math.sin(L * 0.4 + k) * 0.25, 0.05 * Math.cos(L * 0.8 + k));
    }

    // Orbiting little lanterns; as the shadow rises they go dark one by one (violet ember).
    const dark = Math.floor(this.shadow * 1.6 * MINI * 0.5);
    for (let i = 0; i < MINI; i++) {
      const a = (i / MINI) * Math.PI * 2 - L * 0.55;
      this.v.set(Math.cos(a) * 6.4, Math.sin(a * 2 + L) * 0.6 + 0.6, Math.sin(a) * 3.2);
      this.e.set(0, -this.body.rotation.y + a, Math.sin(L * 1.4 + i) * 0.15);
      this.q.setFromEuler(this.e);
      this.s.setScalar(1.25 + fl * 0.2);
      this.m.compose(this.v, this.q, this.s);
      this.minis.setMatrixAt(i, this.m);
      const lit = i >= dark;
      const flick = 0.85 + 0.15 * Math.sin(L * 17 + i * 3);
      this.minis.setColorAt(i, lit ? this.c.setHex(AMBER).multiplyScalar(flick * (1 + fl)) : this.c.setHex(VIOLET).multiplyScalar(0.35));
    }
    this.minis.instanceMatrix.needsUpdate = true;
    this.minis.instanceColor!.needsUpdate = true;

    // Embers / shadow flakes drifting off while it fights.
    if (this.state === BossState.Phase || this.state === BossState.Enter) {
      this.emberT -= dt;
      if (this.emberT <= 0) {
        this.emberT = 0.11;
        const p = this.position;
        const up = this.rng.next() < 0.55;
        this.effects.burst(
          p.x + (this.rng.next() - 0.5) * 3.6, p.y + (up ? 3 : -3) + (this.rng.next() - 0.5) * 2, p.z + 1,
          up ? AMBER : VIOLET, 1, 1.6, 0.4, 1.0,
        );
      }
    }
  }
}
