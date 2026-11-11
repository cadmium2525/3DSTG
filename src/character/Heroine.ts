import * as THREE from 'three';
import type { HeroineMotion } from '../core/types';
import { PLAYER } from '../core/config';
import { buildHeroineGeometry, CHEST_Y } from './heroineGeometry';
import { createFaceTexture } from './faceTexture';

/*
 * The protagonist: long wavy blonde hair, royal-blue ribbons, white puff-sleeve
 * dress with a blue sash, frilled socks and brown strap shoes.
 *
 * The whole body is ONE merged, vertex-coloured geometry drawn twice (toon pass +
 * inverted-hull outline), so she costs two draw calls. Hair and skirt motion is
 * done in the vertex shader from per-vertex sway weights; lighting is a fixed
 * view-space toon ramp so she looks the same whatever lights the scene has.
 */

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aSway; // x: hair weight, y: skirt weight, z: phase, w: face-texture mask
uniform vec3 uHair;
uniform vec3 uSkirt;
uniform float uTime;
uniform float uOutline;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vFace;

void main() {
  vec3 p = position;
  float hw = aSway.x;
  float sw = aSway.y;
  float ph = aSway.z;

  // Hair: lagging offset + travelling wave that grows toward the tips.
  p += uHair * hw;
  p.x += sin(uTime * 2.3 + ph + p.y * 10.0) * 0.012 * hw;
  p.z += cos(uTime * 1.9 + ph * 1.3 + p.y * 8.0) * 0.010 * hw;

  // Skirt / sash tails: lagging offset + hem flutter.
  p += uSkirt * sw;
  vec2 radial = p.xz / max(length(p.xz), 1e-4);
  p.xz += radial * sin(uTime * 3.1 + ph) * 0.007 * sw;

  p += normal * uOutline;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vColor = aColor;
  vUv = uv;
  vFace = aSway.w;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uRim;
uniform float uFlash;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vFace;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;

  vec3 base = vColor;
  vec4 tex = texture2D(uMap, vUv);
  base = mix(base, tex.rgb, tex.a * step(0.5, vFace));

  // Two-tone toon ramp with a key light fixed in view space.
  vec3 L = normalize(vec3(0.38, 0.62, 0.68));
  float lit = smoothstep(0.0, 0.07, dot(n, L) - 0.12);
  lit = mix(lit, 1.0, vFace * 0.92); // keep the face evenly lit
  vec3 shade = base * mix(vec3(0.70, 0.67, 0.90), base, 0.35);
  vec3 col = mix(shade, base, lit);

  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
  col += uRim * rim * (0.3 + 0.7 * lit);
  col = mix(col, vec3(1.0), uFlash);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const OUTLINE_FRAG = /* glsl */ `
uniform float uFlash;
varying vec3 vColor;
void main() {
  vec3 col = vColor * vec3(0.34, 0.26, 0.30);
  col = mix(col, vec3(1.0), uFlash * 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** Critically-damped-ish spring used for hair / skirt lag. */
class Spring2 {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  constructor(private k: number, private d: number) {}
  step(dt: number, tx: number, ty: number): void {
    // Sub-step so large frame times stay stable.
    const n = Math.max(1, Math.ceil(dt / 0.012));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += ((tx - this.x) * this.k - this.vx * this.d) * h;
      this.vy += ((ty - this.y) * this.k - this.vy * this.d) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
    }
  }
}

/**
 * `group` origin = chest = hitbox centre; she faces -Z (her back is toward the
 * gameplay camera). Total height = PLAYER.modelHeight.
 */
export class Heroine {
  readonly group = new THREE.Group();

  private readonly rig = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private readonly faceTexture: THREE.Texture;
  private readonly uniforms: {
    uHair: { value: THREE.Vector3 };
    uSkirt: { value: THREE.Vector3 };
    uTime: { value: number };
    uFlash: { value: number };
  };

  private time = 0;
  private readonly hair = new Spring2(46, 7.5);
  private readonly skirt = new Spring2(70, 9);
  private bank = 0;
  private pitch = 0;

  constructor() {
    this.geometry = buildHeroineGeometry();
    this.faceTexture = createFaceTexture();

    this.uniforms = {
      uHair: { value: new THREE.Vector3() },
      uSkirt: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uFlash: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        ...this.uniforms,
        uOutline: { value: 0 },
        uMap: { value: this.faceTexture },
        uRim: { value: new THREE.Color(0x5b78c8) },
      },
    });
    this.outlineMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      uniforms: { ...this.uniforms, uOutline: { value: 0.0042 } },
    });

    const body = new THREE.Mesh(this.geometry, this.material);
    const outline = new THREE.Mesh(this.geometry, this.outlineMaterial);
    // Vertex-shader sway moves vertices outside the static bounds.
    body.frustumCulled = false;
    outline.frustumCulled = false;
    outline.renderOrder = -1;

    // The mesh is modelled 1 unit tall, feet at y=0, facing +Z.
    const s = PLAYER.modelHeight;
    this.rig.scale.setScalar(s);
    this.rig.rotation.y = Math.PI;
    this.rig.position.y = -CHEST_Y * s;
    this.rig.add(outline, body);

    const pivot = new THREE.Group(); // banking pivot at the chest
    pivot.add(this.rig);
    this.pivot = pivot;
    this.group.add(pivot);
  }

  private readonly pivot: THREE.Group;

  /** Call every frame. */
  update(dt: number, motion: HeroineMotion): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const vx = THREE.MathUtils.clamp(motion.vx, -1.5, 1.5);
    const vy = THREE.MathUtils.clamp(motion.vy, -1.5, 1.5);

    // Hair and skirt trail behind the motion. Model space is rotated 180° about Y,
    // so world +X is model -X.
    this.hair.step(dt, vx * 0.085, -vy * 0.05);
    this.skirt.step(dt, vx * 0.04, -vy * 0.022);
    this.uniforms.uHair.value.set(this.hair.x, this.hair.y, -0.012);
    this.uniforms.uSkirt.value.set(this.skirt.x, this.skirt.y, -0.006);
    this.uniforms.uTime.value = this.time;

    // Bank into turns, lean with vertical motion, breathe while idle.
    const k = 1 - Math.exp(-dt * 9);
    this.bank += (-vx * 0.38 - this.bank) * k;
    this.pitch += (vy * 0.2 - this.pitch) * k;
    this.pivot.rotation.z = this.bank;
    this.pivot.rotation.x = this.pitch - 0.06;
    this.pivot.rotation.y = this.bank * -0.35;
    this.pivot.position.y = Math.sin(this.time * 1.7) * 0.03;

    // Post-hit invincibility: blink + white pulse.
    const inv = motion.invincible ?? 0;
    if (inv > 0) {
      this.rig.visible = Math.floor(inv * 14) % 2 === 1;
      this.uniforms.uFlash.value = 0.25 + 0.25 * Math.sin(this.time * 30);
    } else {
      this.rig.visible = true;
      this.uniforms.uFlash.value = 0;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.faceTexture.dispose();
  }
}
