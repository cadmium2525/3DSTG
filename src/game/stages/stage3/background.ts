/**
 * Stage 3 「深淵」 background: an almost black abyss with deep violet / crimson undertones. The
 * darkness overlay keeps only a radius around the heroine lit. Extra layer (one object, 4 draw
 * calls): shadow ash flakes (dark, under the darkness) + faint embers (above it), distant pale
 * lights that are swallowed by the dark, and falling inverted "shadow petals" (dark mirror
 * images of stage 1's flowers).
 *
 * `ABYSS_LIGHT.value` (0..1) is driven by the final boss: as the heroine's light wins, the embers
 * turn into golden motes, the petals into pale light flowers and the distant lights stop dying.
 */
import * as THREE from 'three';
import { BG_STAR_SEA, type BackgroundLayer, type BackgroundPreset } from '../../Background';
import type { Rng } from '../../Rng';

/** 0 = the abyss, 1 = the heroine's light has won (set by the shadow girl's last spell / death). */
export const ABYSS_LIGHT = { value: 0 };

/* ------------------------------------------------------------------ shaders */

const ASH_VERT = /* glsl */ `
attribute vec4 aSeed; // x size, y speed, z phase, w kind (0 flake, 1 ember)
uniform float uTime;
uniform float uScale;
uniform float uKind;
uniform float uLight;
uniform float uOpacity;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 p = position;
  float len = 150.0;
  float sp = 5.0 + aSeed.y * 9.0;
  p.z = mod(p.z + uTime * sp, len) - len + 8.0;
  // Ash drifts and swirls slowly; embers rise.
  p.x += sin(uTime * 0.31 + aSeed.z * 6.28) * 1.6;
  p.y += sin(uTime * 0.23 + aSeed.z * 9.1) * 1.2 + (aSeed.w > 0.5 ? mod(uTime * 0.9 + aSeed.z * 30.0, 30.0) - 15.0 : 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.5, -mv.z);
  float on = step(abs(aSeed.w - uKind), 0.5);
  gl_PointSize = on * clamp((0.25 + aSeed.x) * uScale / dist, 1.0, 40.0) * (aSeed.w > 0.5 ? 0.55 + uLight * 0.6 : 1.0);
  float fadeNear = 1.0 - smoothstep(-2.0, 8.0, p.z);
  float fadeFar = smoothstep(-142.0, -100.0, p.z);
  float tw = 0.6 + 0.4 * sin(uTime * (2.0 + aSeed.y * 4.0) + aSeed.z * 50.0);
  vAlpha = fadeNear * fadeFar * uOpacity * (aSeed.w > 0.5 ? tw : 1.0);
  vSeed = aSeed.z;
  gl_Position = projectionMatrix * mv;
}`;

/** Flakes: dark, normal blending (seen against the lit area and the light as it returns). */
const FLAKE_FRAG = /* glsl */ `
uniform float uLight;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Ragged flake: an ellipse with a notch, slightly rotated per seed.
  float a = vSeed * 6.28;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  float d = length(q * vec2(1.0, 1.9));
  float m = 1.0 - smoothstep(0.32, 0.5, d);
  if (m < 0.01) discard;
  vec3 dark = vec3(0.02, 0.008, 0.035);
  vec3 lit = vec3(1.0, 0.86, 0.62);
  vec3 col = mix(dark, lit, uLight) + vec3(0.25, 0.08, 0.3) * smoothstep(0.2, 0.45, d) * (1.0 - uLight);
  gl_FragColor = vec4(col, m * vAlpha * mix(0.75, 0.45, uLight));
  #include <colorspace_fragment>
}`;

/** Embers: faint additive violet / crimson glints that show through the darkness. */
const EMBER_FRAG = /* glsl */ `
uniform float uLight;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float g = pow(max(0.0, 1.0 - d * 2.0), 2.2);
  vec3 shadow = mix(vec3(0.55, 0.22, 0.95), vec3(0.95, 0.2, 0.42), step(0.6, fract(vSeed * 7.0)));
  vec3 light = mix(vec3(1.0, 0.86, 0.5), vec3(0.75, 0.95, 1.0), step(0.6, fract(vSeed * 7.0)));
  vec3 col = mix(shadow * 0.32, light * 0.9, uLight);
  gl_FragColor = vec4(col * g * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

const LIGHT_VERT = /* glsl */ `
attribute vec4 aState; // x glow 0..1, y swallow 0..1, z hue seed, w size
varying vec2 vUv;
varying vec4 vState;
void main() {
  vUv = position.xy * 2.0;
  vState = aState;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * aState.w;
  gl_Position = projectionMatrix * mv;
}`;

/** A distant pale light; while swallowed a crimson-rimmed dark disc closes over it. */
const LIGHT_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying vec4 vState;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float glow = vState.x;
  float sw = vState.y;
  vec3 pale = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.9, 0.8), vState.z);
  float core = exp(-r * r * 30.0) * 1.4 + exp(-r * r * 6.0) * 0.45 + (1.0 - r) * 0.08;
  // The swallowing dark: a disc growing from the rim inward (radius shrinks to 0).
  float hole = 1.0 - sw;
  float inside = smoothstep(hole + 0.04, hole - 0.04, r);
  float ring = exp(-pow((r - hole) * 22.0, 2.0)) * sw * (1.0 - sw) * 4.0;
  float flick = 0.75 + 0.25 * sin(uTime * 13.0 + vState.z * 40.0);
  vec3 col = pale * core * glow * mix(1.0, inside, step(0.001, sw)) + vec3(1.0, 0.18, 0.4) * ring * flick * glow;
  gl_FragColor = vec4(col * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ layer */

const ASH_N = 520;
const LIGHTS = 6;
const PETALS = 44;

function flowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.26, 0.62, 0.08);
    g.translate(0, 0.72, 0);
    g.rotateX(0.4); // cupped away: an inverted flower
    g.rotateZ((k / 6) * Math.PI * 2);
    parts.push(g);
  }
  const heart = new THREE.IcosahedronGeometry(0.22, 0);
  parts.push(heart);
  // Manual merge (positions + normals only).
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position').array as Float32Array;
    pos.set(a, o);
    o += a.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

class AbyssLayer implements BackgroundLayer {
  readonly object3d = new THREE.Group();
  private flakeMat: THREE.ShaderMaterial;
  private emberMat: THREE.ShaderMaterial;
  private lightMat: THREE.ShaderMaterial;
  private petalMat: THREE.MeshStandardMaterial;
  private ashGeo: THREE.BufferGeometry;
  private lights: THREE.InstancedMesh;
  private lightState: THREE.InstancedBufferAttribute;
  private lightT = new Float32Array(LIGHTS);
  private lightDur = new Float32Array(LIGHTS);
  private petals: THREE.InstancedMesh;
  private petalP: Float32Array;
  private petalR: Float32Array;
  private opacity = 1;
  private swallowBoost = 0;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private size = new THREE.Vector2();

  constructor(private rng: Rng) {
    ABYSS_LIGHT.value = 0;
    // --- ash flakes + embers (one geometry, two materials) ---
    const pos = new Float32Array(ASH_N * 3);
    const seed = new Float32Array(ASH_N * 4);
    for (let i = 0; i < ASH_N; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 2.5 + Math.sqrt(rng.next()) * 26;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r * 0.8;
      pos[i * 3 + 2] = rng.next() * 150;
      seed[i * 4] = 0.2 + rng.next() * 0.55;
      seed[i * 4 + 1] = rng.next();
      seed[i * 4 + 2] = rng.next();
      seed[i * 4 + 3] = i % 3 === 0 ? 1 : 0;
    }
    this.ashGeo = new THREE.BufferGeometry();
    this.ashGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ashGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.ashGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const ashUniforms = (kind: number) => ({
      uTime: { value: 0 }, uScale: { value: 600 }, uKind: { value: kind }, uLight: { value: 0 }, uOpacity: { value: 1 },
    });
    this.flakeMat = new THREE.ShaderMaterial({
      vertexShader: ASH_VERT, fragmentShader: FLAKE_FRAG, uniforms: ashUniforms(0),
      transparent: true, depthWrite: false,
    });
    this.emberMat = new THREE.ShaderMaterial({
      vertexShader: ASH_VERT, fragmentShader: EMBER_FRAG, uniforms: ashUniforms(1),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const flakes = new THREE.Points(this.ashGeo, this.flakeMat);
    flakes.renderOrder = 1;
    const embers = new THREE.Points(this.ashGeo, this.emberMat);
    embers.renderOrder = 3; // above the darkness: faint glints in the dark
    for (const pts of [flakes, embers]) {
      pts.frustumCulled = false;
      const mat = pts.material as THREE.ShaderMaterial;
      pts.onBeforeRender = (renderer, _s, camera) => {
        renderer.getDrawingBufferSize(this.size);
        const cam = camera as THREE.PerspectiveCamera;
        mat.uniforms.uScale.value = this.size.y / (2 * Math.tan(((cam.fov ?? 60) * Math.PI) / 360));
      };
    }

    // --- distant pale lights that get swallowed ---
    this.lightMat = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG,
      uniforms: { uOpacity: { value: 1 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lg = new THREE.PlaneGeometry(1, 1);
    this.lightState = new THREE.InstancedBufferAttribute(new Float32Array(LIGHTS * 4), 4);
    this.lightState.setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('aState', this.lightState);
    this.lights = new THREE.InstancedMesh(lg, this.lightMat, LIGHTS);
    this.lights.frustumCulled = false;
    this.lights.renderOrder = 3;
    for (let i = 0; i < LIGHTS; i++) this.placeLight(i, true);

    // --- inverted shadow petals ---
    this.petalMat = new THREE.MeshStandardMaterial({
      color: 0x1a0c22, emissive: 0x3a0a34, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.3,
      flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 1,
    });
    this.petals = new THREE.InstancedMesh(flowerGeometry(), this.petalMat, PETALS);
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 0.5;
    this.petalP = new Float32Array(PETALS * 4);
    this.petalR = new Float32Array(PETALS * 3);
    for (let i = 0; i < PETALS; i++) this.placePetal(i, true);

    this.object3d.add(flakes, this.petals, embers, this.lights);
  }

  private placeLight(i: number, initial: boolean): void {
    const rng = this.rng;
    const a = rng.next() * Math.PI * 2;
    const r = 18 + rng.next() * 42;
    this.v.set(Math.cos(a) * r, Math.sin(a) * r * 0.7 + 6, -150 - rng.next() * 60);
    this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
    this.lights.setMatrixAt(i, this.m);
    this.lightT[i] = initial ? -rng.next() * 7 : -1 - rng.next() * 4;
    this.lightDur[i] = 5 + rng.next() * 3;
    const st = this.lightState.array as Float32Array;
    st[i * 4 + 2] = rng.next();
    st[i * 4 + 3] = 4 + rng.next() * 7;
    this.lights.instanceMatrix.needsUpdate = true;
  }

  private placePetal(i: number, initial: boolean): void {
    const rng = this.rng;
    const P = this.petalP;
    const side = rng.next() < 0.5 ? -1 : 1;
    P[i * 4] = side * (3.5 + rng.next() * 16);
    P[i * 4 + 1] = initial ? -18 + rng.next() * 40 : 20 + rng.next() * 6;
    P[i * 4 + 2] = -10 - rng.next() * 110;
    P[i * 4 + 3] = 0.5 + rng.next() * 0.8; // scale
    this.petalR[i * 3] = rng.next() * 6.28;
    this.petalR[i * 3 + 1] = (rng.next() - 0.5) * 1.6;
    this.petalR[i * 3 + 2] = (rng.next() - 0.5) * 1.2;
  }

  scenery(name: string, duration: number): void {
    if (name === 'swallow') {
      // Several far lights appear at once and are swallowed one after another.
      this.swallowBoost = duration;
      for (let i = 0; i < LIGHTS; i++) {
        this.placeLight(i, false);
        this.lightT[i] = -i * (duration / LIGHTS) * 0.6;
      }
    }
  }

  setOpacity(o: number): void {
    this.opacity = o;
  }

  update(dt: number, time: number, speed: number): void {
    this.t += dt;
    const L = ABYSS_LIGHT.value;
    const op = this.opacity;
    for (const mat of [this.flakeMat, this.emberMat]) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uLight.value = L;
      mat.uniforms.uOpacity.value = op;
    }
    this.emberMat.uniforms.uOpacity.value = op * (1 + L * 1.4);
    this.lightMat.uniforms.uOpacity.value = op;
    this.lightMat.uniforms.uTime.value = this.t;
    this.swallowBoost = Math.max(0, this.swallowBoost - dt);

    // Lights: fade in, shine, then the dark closes over them (not any more once her light wins).
    const st = this.lightState.array as Float32Array;
    for (let i = 0; i < LIGHTS; i++) {
      this.lightT[i] += dt;
      const t = this.lightT[i], D = this.lightDur[i];
      let glow = 0, sw = 0;
      if (t > 0) {
        glow = Math.min(1, t / 1.4);
        const swStart = D * 0.55;
        if (L < 0.5 && t > swStart) sw = Math.min(1, (t - swStart) / (D - swStart));
        glow *= 0.55 + L * 0.9;
        if (t > D && L < 0.5) this.placeLight(i, false);
      }
      st[i * 4] = glow;
      st[i * 4 + 1] = sw;
    }
    this.lightState.needsUpdate = true;

    // Petals: fall, tumble, stream toward the camera; turn into pale light flowers as L → 1.
    const P = this.petalP, R = this.petalR;
    const fall = 1.4 + speed * 0.4;
    for (let i = 0; i < PETALS; i++) {
      P[i * 4 + 1] -= dt * fall * (0.7 + (i % 5) * 0.12);
      P[i * 4 + 2] += dt * speed * 9;
      if (P[i * 4 + 1] < -22 || P[i * 4 + 2] > 6) this.placePetal(i, false);
      const sc = P[i * 4 + 3];
      this.e.set(Math.PI + R[i * 3 + 1] * this.t, R[i * 3] + this.t * 0.4, R[i * 3 + 2] * this.t);
      this.q.setFromEuler(this.e);
      this.v.set(P[i * 4] + Math.sin(this.t * 0.6 + i) * 0.8, P[i * 4 + 1], P[i * 4 + 2]);
      this.s.setScalar(sc);
      this.m.compose(this.v, this.q, this.s);
      this.petals.setMatrixAt(i, this.m);
    }
    this.petals.instanceMatrix.needsUpdate = true;
    this.petalMat.opacity = op;
    this.petalMat.color.setRGB(0.1 + L * 0.9, 0.05 + L * 0.82, 0.13 + L * 0.8);
    this.petalMat.emissive.setRGB(0.23 + L * 0.7, 0.04 + L * 0.6, 0.2 + L * 0.5);
    this.petalMat.emissiveIntensity = 0.5 + L * 0.7;
  }

  dispose(): void {
    this.ashGeo.dispose();
    this.flakeMat.dispose();
    this.emberMat.dispose();
    this.lightMat.dispose();
    this.lights.geometry.dispose();
    this.lights.dispose();
    this.petals.geometry.dispose();
    this.petals.dispose();
    this.petalMat.dispose();
  }
}

/** Stage 3 「深淵」: no light at the bottom of the dark; only the heroine's surroundings are lit. */
export const BG_ABYSS: BackgroundPreset = {
  ...BG_STAR_SEA,
  clear: 0x030108,
  fog: 0x07030f,
  fogNear: 36,
  fogFar: 135,
  stars: { colors: [0xb9b0ff, 0x6a4bd0, 0x8a2a5a, 0x8a3c9a, 0x4a3aa0], white: 0.25, density: 0.3, size: 0.42, speed: 5, gain: 0.55 },
  dust: { colors: [0xd8d0ff, 0x7a5bd0, 0x6a1a3a, 0xc04a8a, 0x9d6bff], white: 0.15, density: 0.45, size: 0.085, speed: 26, gain: 0.6 },
  nebula: { colors: [0x3a1060, 0x4a0a2a, 0x1a1050, 0x5a1040, 0x7a1a50], glow: 0x6a2a8a, glowAlpha: 0.16, intensity: 0.6, blobs: 40, seed: 3 },
  frame: { color: 0x7a3ab0, opacity: 0.14 },
  light: {
    sky: 0x8a7ad0, ground: 0x08040e, hemi: 0.85,
    key: 1.5, keyColor: 0xf4f0ff,
    rimA: 1.1, rimAColor: 0x9d6bff,
    rimB: 0.7, rimBColor: 0xff4f8a,
  },
  darkness: 0.9,
  darkRadius: 0.17,
  darkColor: 0x030108,
  streakColor: 0xb9a8ff,
  layers: [(rng: Rng) => new AbyssLayer(rng)],
};

/**
 * The ending's dawn: the darkness lifted, a star sea lit from below by a warm dawn (rose, gold,
 * pale cyan) — brighter and warmer than stage 1's night.
 */
export const BG_DAWN: BackgroundPreset = {
  ...BG_STAR_SEA,
  clear: 0x1a1030,
  fog: 0x2a1838,
  fogNear: 80,
  fogFar: 210,
  stars: { colors: [0xfff6ea, 0xffd6a0, 0xffa8c8, 0x9fd8ff, 0xffe6a0], white: 0.6, density: 1, size: 0.55, speed: 3.5, gain: 1.15 },
  dust: { colors: [0xfff4e0, 0xffc890, 0xff9ab8, 0xa8e8ff, 0xffe08a], white: 0.4, density: 0.8, size: 0.09, speed: 16, gain: 1.1 },
  nebula: { colors: [0xff9a6a, 0xff7aa8, 0x8a7aff, 0x6ac8ff, 0xffd08a], glow: 0xffd6a8, glowAlpha: 0.55, intensity: 1.25, blobs: 56, seed: 5 },
  frame: { color: 0xffc89a, opacity: 0 },
  light: {
    sky: 0xffe0c8, ground: 0x3a2048, hemi: 1.25,
    key: 1.8, keyColor: 0xfff0dc,
    rimA: 1.4, rimAColor: 0xffb87a,
    rimB: 1.0, rimBColor: 0x9fd8ff,
  },
  darkness: 0,
  darkRadius: 0.4,
  darkColor: 0x030108,
  streakColor: 0xfff0d0,
};
