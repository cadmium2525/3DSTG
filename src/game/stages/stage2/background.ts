/**
 * Stage 2 「黄昏の境界」 background: BG_TWILIGHT preset + three layers.
 *
 *  - dusk sky (screen-space gradient: deep indigo overhead → plum → ember horizon at the bottom,
 *    darker in the middle where bullets fly) and a large setting sun low on the left, which the
 *    moon slowly bites into (DUSK_STATE.eclipse — the boss エクリプス drives it).
 *  - a sea of clouds streaming past below the corridor, a few banks drifting at the sides.
 *  - shadow motes: dark violet-rimmed specks drifting among the warm light motes (preset dust);
 *    the 'shadowtide' scenery event makes them swarm.
 *  - the boss's screen dim / warm flare overlays (renderOrder 2.4: under bullets, shots, items).
 * 7 draw calls in total, no per-frame CPU work besides uniforms.
 */
import * as THREE from 'three';
import { BG_STAR_SEA, type BackgroundLayer, type BackgroundPreset } from '../../Background';
import type { Rng } from '../../Rng';
import { DUSK_DEFAULT, DUSK_STATE } from './shared';

/* ------------------------------------------------------------------ sky + sun */

const NDC_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vNdc;
#define S(c) pow(c, vec3(2.2))
void main() {
  float y = vNdc.y;
  vec3 top = S(vec3(0.035, 0.03, 0.12));
  vec3 mid = S(vec3(0.14, 0.06, 0.2));
  vec3 low = S(vec3(0.42, 0.13, 0.2));
  vec3 hor = S(vec3(1.0, 0.52, 0.24));
  vec3 col = mix(low, mid, smoothstep(-0.95, -0.35, y));
  col = mix(col, top, smoothstep(-0.3, 0.85, y));
  // Glowing horizon band at the very bottom (below most of the field).
  col += hor * 0.6 * exp(-pow((y + 0.98) * 6.0, 2.0));
  col += S(vec3(0.6, 0.2, 0.25)) * 0.35 * exp(-pow((y + 0.78) * 3.5, 2.0));
  // Keep the middle of the screen (the play area) darker for bullet readability.
  float c = length(vNdc * vec2(1.0, 0.95));
  col *= mix(0.35, 1.0, smoothstep(0.15, 1.0, c));
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}`;

const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Setting sun (deep orange, horizontal haze bands), the moon biting into it, and its glow. Additive. */
const SUN_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform float uEclipse;
uniform float uFlare;
varying vec2 vUv;
#define S(c) pow(c, vec3(2.2))
void main() {
  vec2 p = (vUv - 0.5) * 4.0;   // sun radius = 1, quad edge at r = 2
  float r = length(p);
  float disc = smoothstep(1.0, 0.975, r);
  vec3 sun = mix(S(vec3(1.0, 0.66, 0.36)), S(vec3(0.92, 0.3, 0.2)), smoothstep(0.1, 1.0, r * r));
  // Haze bands drifting across the low sun.
  float bands = 1.0 - 0.3 * smoothstep(0.55, 1.0, sin(p.y * 9.0 - uTime * 0.25 + sin(p.x * 1.5) * 0.4) * 0.5 + 0.5) * smoothstep(-0.2, -0.9, p.y);
  // The moon slides in from the upper right.
  vec2 mo = vec2(mix(1.95, 0.0, uEclipse), mix(1.0, 0.0, uEclipse));
  float md = length(p - mo);
  float moon = smoothstep(0.985, 1.005, md);         // 0 inside the moon
  float moonRim = exp(-pow((md - 1.0) * 26.0, 2.0)) * disc;
  float edge = 1.0 - smoothstep(1.4, 2.0, r);         // fade out before the quad border
  float glow = exp(-max(r - 1.0, 0.0) * 2.6) * (1.0 - disc) * 0.4 * edge;
  float cor = exp(-max(r - 1.0, 0.0) * 5.0) * (1.0 - disc) * smoothstep(0.3, 1.0, uEclipse) * 0.8 * edge;
  vec3 col = sun * disc * bands * moon * 0.7
           + S(vec3(1.0, 0.5, 0.3)) * glow * mix(1.0, 0.55, uEclipse)
           + S(vec3(1.0, 0.85, 0.65)) * (cor + moonRim * uEclipse * 0.6);
  col *= 1.0 + uFlare * 1.5;
  gl_FragColor = vec4(col * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

function skyLayer(): BackgroundLayer {
  const group = new THREE.Group();
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: NDC_VERT, fragmentShader: SKY_FRAG,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    // Depth-tested at the far plane: transparent objects draw after the opaque ones, so this
    // must not paint over enemies / the heroine.
    transparent: true, depthTest: true, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  group.add(sky);

  const sunMat = new THREE.ShaderMaterial({
    vertexShader: UV_VERT, fragmentShader: SUN_FRAG,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uEclipse: { value: DUSK_DEFAULT.eclipse }, uFlare: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const R = 21;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(R * 4, R * 4), sunMat);
  sun.position.set(-27, -104, -226);
  sun.renderOrder = -11;
  sun.frustumCulled = false;
  group.add(sun);

  // Dim (normal blend) + flare (additive) overlays for the boss's 皆既日蝕 / death.
  const dimMat = new THREE.ShaderMaterial({
    vertexShader: NDC_VERT,
    fragmentShader: /* glsl */ `
      uniform float uDim;
      varying vec2 vNdc;
      void main() {
        float v = 0.75 + 0.25 * smoothstep(0.3, 1.3, length(vNdc));
        gl_FragColor = vec4(0.012, 0.005, 0.03, clamp(uDim * v, 0.0, 1.0));
      }`,
    uniforms: { uDim: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false,
  });
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dimMat);
  dim.frustumCulled = false;
  dim.renderOrder = 2.4;
  dim.visible = false;
  group.add(dim);
  const flareMat = new THREE.ShaderMaterial({
    vertexShader: NDC_VERT,
    fragmentShader: /* glsl */ `
      uniform float uFlare;
      varying vec2 vNdc;
      void main() {
        float v = 1.0 - 0.5 * smoothstep(0.0, 1.4, length(vNdc));
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.32) * uFlare * v, 1.0);
      }`,
    uniforms: { uFlare: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flareMat);
  flare.frustumCulled = false;
  flare.renderOrder = 2.45;
  flare.visible = false;
  group.add(flare);

  let opacity = 0;
  const S = DUSK_STATE;
  return {
    object3d: group,
    update(dt, time) {
      if (!S.fresh) {
        const k = 1 - Math.exp(-dt * 1.5);
        S.eclipse += (DUSK_DEFAULT.eclipse - S.eclipse) * k;
        S.dim += (DUSK_DEFAULT.dim - S.dim) * Math.min(1, k * 3);
        S.flare += (DUSK_DEFAULT.flare - S.flare) * Math.min(1, k * 3);
      }
      S.fresh = false;
      skyMat.uniforms.uTime.value = time;
      sunMat.uniforms.uTime.value = time;
      sunMat.uniforms.uEclipse.value = S.eclipse;
      sunMat.uniforms.uFlare.value = S.flare;
      dimMat.uniforms.uDim.value = S.dim * 0.62 * opacity;
      dim.visible = S.dim * opacity > 0.003;
      flareMat.uniforms.uFlare.value = S.flare * 0.32 * opacity;
      flare.visible = S.flare * opacity > 0.003;
    },
    setOpacity(o) {
      opacity = o;
      skyMat.uniforms.uOpacity.value = o;
      sunMat.uniforms.uOpacity.value = o;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    },
  };
}

/* ------------------------------------------------------------------ billboards */

const BILL_VERT = /* glsl */ `
attribute vec4 aInst;   // x, y, z0, seed
attribute vec2 aSize;
uniform float uTime;
uniform float uSpeed;
uniform float uLen;
uniform float uNear;
uniform float uWobble;
uniform float uFar;
uniform float uGrow;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  vec3 c = aInst.xyz;
  float s = aInst.w;
  c.z = mod(c.z + uTime * uSpeed * (0.75 + 0.5 * fract(s * 3.7)), uLen) - uLen + uNear;
  c.x += sin(uTime * 0.6 + s * 31.0) * uWobble;
  c.y += sin(uTime * 0.45 + s * 17.0) * uWobble * 0.7;
  vFade = smoothstep(uNear - uLen, uNear - uLen + uFar, c.z) * (1.0 - smoothstep(uNear - 26.0, uNear, c.z));
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * aSize * uGrow;
  vUv = uv;
  vSeed = s;
  gl_Position = projectionMatrix * mv;
}`;

const CLOUD_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
#define S(c) pow(c, vec3(2.2))
float blob(vec2 p, vec2 c, float r) { return smoothstep(r, r * 0.15, length((p - c) * vec2(1.0, 1.35))); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float s = vSeed;
  float a = blob(p, vec2(-0.5, -0.12), 0.5 + 0.1 * fract(s * 5.1))
          + blob(p, vec2(0.05 + 0.2 * (fract(s * 2.3) - 0.5), 0.02), 0.62)
          + blob(p, vec2(0.52, -0.16), 0.46 + 0.1 * fract(s * 7.7))
          + blob(p, vec2(0.6 * (fract(s * 11.0) - 0.5), 0.28), 0.38);
  a = clamp(a, 0.0, 1.0) * smoothstep(-0.62, -0.25, p.y);
  // Lit from the setting sun below: warm undersides and tops, plum body.
  float top = smoothstep(-0.05, 0.55, p.y);
  float under = smoothstep(-0.1, -0.45, p.y);
  vec3 col = S(vec3(0.16, 0.08, 0.2)) + S(vec3(0.55, 0.26, 0.3)) * top * 0.5 + S(vec3(0.85, 0.4, 0.25)) * under * 0.55;
  gl_FragColor = vec4(col, a * vFade * uOpacity * 0.75);
  #include <colorspace_fragment>
}`;

const MOTE_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTide;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float keep = step(vSeed, 0.42 + 0.58 * uTide);
  float core = smoothstep(0.95, 0.35, d);
  float rim = exp(-pow((d - 0.62) * 7.0, 2.0));
  float tw = 0.7 + 0.3 * sin(uTime * (1.3 + vSeed * 2.0) + vSeed * 50.0);
  vec3 col = mix(vec3(0.0015, 0.0004, 0.004), pow(vec3(0.6, 0.38, 1.0), vec3(2.2)), rim * 0.55 * tw);
  gl_FragColor = vec4(col, (core * 0.72 + rim * 0.2) * vFade * uOpacity * keep);
  #include <colorspace_fragment>
}`;

function billboards(n: number, fill: (i: number, inst: Float32Array, size: Float32Array) => void): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const inst = new Float32Array(n * 4);
  const size = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) fill(i, inst, size);
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
  g.instanceCount = n;
  return g;
}

function cloudLayer(rng: Rng): BackgroundLayer {
  const LEN = 240, NEAR = 10;
  const N = 72;
  const geo = billboards(N, (i, inst, size) => {
    const side = i % 6 === 5; // a few banks drifting at the sides
    const sx = rng.next() < 0.5 ? -1 : 1;
    const x = side ? sx * rng.range(20, 46) : rng.range(-62, 62);
    const y = side ? rng.range(-10, 2) : rng.range(-30, -13) - Math.abs(x) * 0.08;
    inst.set([x, y, rng.next() * LEN, rng.next()], i * 4);
    const w = side ? rng.range(16, 26) : rng.range(22, 46);
    size.set([w, w * rng.range(0.3, 0.42)], i * 2);
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: BILL_VERT, fragmentShader: CLOUD_FRAG,
    uniforms: {
      uTime: { value: 0 }, uSpeed: { value: 9 }, uLen: { value: LEN }, uNear: { value: NEAR }, uWobble: { value: 0.6 }, uFar: { value: 130 }, uGrow: { value: 1 },
      uOpacity: { value: 0 },
    },
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -6;
  return {
    object3d: mesh,
    update(_dt, time) {
      mat.uniforms.uTime.value = time;
    },
    setOpacity(o) {
      mat.uniforms.uOpacity.value = o;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function moteLayer(rng: Rng): BackgroundLayer {
  const LEN = 150, NEAR = 8;
  const N = 150;
  const geo = billboards(N, (i, inst, size) => {
    const a = rng.next() * Math.PI * 2;
    const r = 2.8 + Math.pow(rng.next(), 0.8) * 22;
    inst.set([Math.cos(a) * r, Math.sin(a) * r * 0.85, rng.next() * LEN, rng.next()], i * 4);
    const s = rng.range(0.22, 0.6) * (r < 6 ? 0.7 : 1);
    size.set([s, s], i * 2);
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: BILL_VERT, fragmentShader: MOTE_FRAG,
    uniforms: {
      uTime: { value: 0 }, uSpeed: { value: 11 }, uLen: { value: LEN }, uNear: { value: NEAR }, uWobble: { value: 1.3 }, uFar: { value: 40 }, uGrow: { value: 1 },
      uOpacity: { value: 0 }, uTide: { value: 0 },
    },
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  let tideT = 0, tideDur = 1, tide = 0;
  return {
    object3d: mesh,
    update(dt, time) {
      tideT = Math.max(0, tideT - dt);
      // Swell over the first third, hold, ebb over the last third.
      const u = tideT > 0 ? 1 - tideT / tideDur : 1;
      const target = tideT > 0 ? Math.min(1, u * 3, (1 - u) * 3) : 0;
      tide += (target - tide) * (1 - Math.exp(-dt * 3));
      mat.uniforms.uTide.value = tide;
      mat.uniforms.uTime.value = time;
      mat.uniforms.uSpeed.value = 11 + tide * 9;
      mat.uniforms.uGrow.value = 1 + tide * 0.9;
    },
    setOpacity(o) {
      mat.uniforms.uOpacity.value = o;
    },
    scenery(name, duration) {
      if (name === 'shadowtide') {
        tideT = duration;
        tideDur = Math.max(0.5, duration);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ------------------------------------------------------------------ preset */

/** Stage 2 「黄昏の境界」: sunset orange sinking into indigo; a sea of clouds; the first shadows. */
export const BG_TWILIGHT: BackgroundPreset = {
  ...BG_STAR_SEA,
  clear: 0x0c0718,
  fog: 0x2a1430,
  fogNear: 60,
  fogFar: 175,
  stars: { colors: [0xffe6c8, 0xff9a4a, 0xff6f8a, 0x6a5be0, 0xffc36b], white: 0.5, density: 0.42, size: 0.48, speed: 7, gain: 0.75 },
  dust: { colors: [0xfff0dd, 0xffb070, 0xff7a90, 0xffc890, 0xffd08a], white: 0.3, density: 0.8, size: 0.1, speed: 30, gain: 0.95 },
  nebula: { colors: [0xff8a3c, 0xff5f7a, 0x5a4bd0, 0x8a3c9a, 0xffb85a], glow: 0x7a3060, glowAlpha: 0.1, intensity: 0.55, blobs: 40, seed: 2 },
  frame: { color: 0xffa050, opacity: 0.17 },
  light: {
    sky: 0xffb79a, ground: 0x1a1030, hemi: 1.0,
    key: 1.6, keyColor: 0xffe2c4,
    rimA: 1.25, rimAColor: 0xff9a4a,
    rimB: 0.9, rimBColor: 0x7a6bff,
  },
  darkness: 0.18,
  darkRadius: 0.44,
  darkColor: 0x0a0414,
  streakColor: 0xffd6a8,
  layers: [() => skyLayer(), (rng) => cloudLayer(rng), (rng) => moteLayer(rng)],
};
