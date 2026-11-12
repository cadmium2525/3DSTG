import * as THREE from 'three';
import { PLAYER } from '../core/config';
import { buildHeroineGeometry, CHEST_Y } from './heroineGeometry';
import { createFaceTexture, type FaceStyle } from './faceTexture';

/*
 * 影の少女 — the final boss: the heroine's own shadow given form.
 *
 * Same mesh as the heroine, re-shaded as an inverted silhouette: near-black
 * body with deep violet tones, an ember-like magenta rim, and hair / ribbons /
 * skirt that burn upward like shadow flames (vertex shader). Eyes glow pale
 * red-violet. Two draw calls (body + glowing outline hull).
 *
 * Scale it with `size` (world height) — as a boss she is shown much larger
 * than the player and far away.
 */

const SHADOW_FACE: FaceStyle = {
  iris: ['#3a0628', '#c0287a', '#ffb3e6'],
  rim: '#1a0010',
  pupil: '#12000a',
  sclera: '#1a1024',
  lash: '#05020a',
  blush: 0,
  smile: -0.35,
};

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aSway; // x hair, y skirt, z phase, w face mask
uniform float uTime;
uniform float uFlame;
uniform float uOutline;
uniform vec3 uDrift;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vFace;
varying float vFire;

void main() {
  vec3 p = position;
  float hw = aSway.x;
  float sw = aSway.y;
  float ph = aSway.z;
  float fire = clamp(hw * 1.4 + sw * 0.9, 0.0, 1.0);

  // Shadow flames: tips lift and flicker upward and outward.
  float t = uTime;
  float n1 = sin(t * 5.3 + ph * 1.7 + p.y * 23.0);
  float n2 = sin(t * 8.1 + ph * 2.9 + p.x * 31.0);
  vec2 radial = p.xz / max(length(p.xz), 1e-4);
  p.y += fire * fire * uFlame * (0.06 + 0.04 * n1);
  p.xz += radial * fire * uFlame * (0.03 + 0.02 * n2);
  p.x += sin(t * 2.1 + ph) * 0.012 * hw;
  p += uDrift * hw;

  p += normal * uOutline * (1.0 + fire * 1.8 * (0.6 + 0.4 * n2));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vColor = aColor;
  vUv = uv;
  vFace = aSway.w;
  vFire = fire;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uLight;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vFace;
varying float vFire;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;

  // Invert the heroine's palette into shadow: luminance -> darkness, keep a hint of hue.
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 base = mix(vec3(0.015, 0.008, 0.03), vec3(0.07, 0.03, 0.11), 1.0 - lum);
  // Ribbons (blue in the heroine) become deep crimson-violet.
  float blue = clamp((vColor.b - vColor.r) * 2.0, 0.0, 1.0);
  base = mix(base, vec3(0.22, 0.015, 0.09), blue * 0.85);

  vec4 tex = texture2D(uMap, vUv);
  base = mix(base, tex.rgb, tex.a * step(0.5, vFace));

  vec3 L = normalize(vec3(-0.3, 0.7, 0.6));
  float lit = smoothstep(-0.1, 0.2, dot(n, L));
  vec3 col = base * (0.6 + 0.4 * lit);

  // Ember rim + glowing eyes.
  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 4.0);
  col += vec3(0.6, 0.1, 0.5) * rim * (0.16 + 0.1 * sin(uTime * 3.0 + vFire * 6.0));
  // Eyes glow.
  col += vec3(1.0, 0.35, 0.8) * tex.a * step(0.5, vFace) * smoothstep(0.25, 0.6, tex.r) * 0.6;
  // Flame tips smoulder.
  col += vec3(0.45, 0.06, 0.4) * pow(vFire, 2.0) * (0.5 + 0.5 * sin(uTime * 6.0 + vFire * 12.0)) * 0.35;

  // Turning to light (her defeat): the shadow fills with warm light from the flame tips inward.
  float burn = clamp(uLight * 1.6 - (1.0 - vFire) * 0.6, 0.0, 1.0);
  vec3 lightCol = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.98, 0.92), lit);
  col = mix(col, lightCol * (0.8 + 0.4 * rim), burn);

  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col * uFade, uFade);
  #include <colorspace_fragment>
}
`;

const OUTLINE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uLight;
varying float vFire;
void main() {
  // Glowing violet-magenta aura hull, flickering on the flame parts.
  float f = 0.6 + 0.4 * sin(uTime * 7.0 + vFire * 9.0);
  vec3 col = mix(vec3(0.10, 0.015, 0.16), vec3(0.75, 0.14, 0.55), pow(vFire, 1.5) * f);
  // …and gold flames once she turns to light.
  col = mix(col, mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.75), pow(vFire, 1.2) * f), clamp(uLight * 1.4, 0.0, 1.0));
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col * uFade, uFade);
  #include <colorspace_fragment>
}
`;

export class ShadowGirl {
  readonly group = new THREE.Group();
  /** White flash 0..1 (hit feedback). */
  flash = 0;
  /** 0..1 overall visibility (fade in/out). */
  fade = 1;
  /** Flame strength (raise it in later phases). */
  flame = 1;
  /** 0 = shadow, 1 = turned to light (her defeat: the flames burn gold, the body fills with light). */
  light = 0;

  private readonly pivot = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private readonly faceTexture: THREE.Texture;
  private readonly uniforms: {
    uTime: { value: number };
    uFlame: { value: number };
    uFlash: { value: number };
    uFade: { value: number };
    uLight: { value: number };
    uDrift: { value: THREE.Vector3 };
  };
  private readonly body: THREE.Mesh;
  private readonly outline: THREE.Mesh;
  private time = 0;
  private sway = 0;

  /**
   * @param size world height of the figure. The group origin is her chest.
   * She faces +Z (toward the player / camera) by default.
   */
  constructor(size: number = PLAYER.modelHeight) {
    this.geometry = buildHeroineGeometry();
    this.faceTexture = createFaceTexture(SHADOW_FACE);
    this.uniforms = {
      uTime: { value: 0 },
      uFlame: { value: 1 },
      uFlash: { value: 0 },
      uFade: { value: 1 },
      uLight: { value: 0 },
      uDrift: { value: new THREE.Vector3() },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: { ...this.uniforms, uOutline: { value: 0 }, uMap: { value: this.faceTexture } },
    });
    this.outlineMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      uniforms: { ...this.uniforms, uOutline: { value: 0.0045 } },
    });
    const body = new THREE.Mesh(this.geometry, this.material);
    const outline = new THREE.Mesh(this.geometry, this.outlineMaterial);
    body.frustumCulled = outline.frustumCulled = false;
    outline.renderOrder = -1;
    this.body = body;
    this.outline = outline;

    const rig = new THREE.Group();
    rig.scale.setScalar(size);
    rig.position.y = -CHEST_Y * size;
    rig.add(outline, body);
    this.pivot.add(rig);
    this.group.add(this.pivot);
  }

  /**
   * Draw in the transparent pass at this renderOrder (e.g. 3 = above stage 3's darkness overlay
   * at 2.5, so the boss stays fully visible). Fade then also becomes real transparency.
   */
  setRenderOrder(order: number): void {
    for (const m of [this.material, this.outlineMaterial]) {
      m.transparent = true;
      m.needsUpdate = true;
    }
    this.outline.renderOrder = order;
    this.body.renderOrder = order + 0.01;
  }

  /** @param vx normalised lateral motion -1..1 for lean and hair drift. */
  update(dt: number, vx = 0): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.sway += (vx - this.sway) * (1 - Math.exp(-dt * 4));
    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uFlame.value = this.flame;
    u.uFlash.value = Math.min(1, this.flash);
    u.uFade.value = this.fade;
    u.uLight.value = this.light;
    u.uDrift.value.set(-this.sway * 0.06, 0.01, 0);
    // Hovering, slightly menacing idle.
    this.pivot.position.y = Math.sin(this.time * 1.3) * 0.04;
    this.pivot.rotation.z = -this.sway * 0.2 + Math.sin(this.time * 0.9) * 0.03;
    this.pivot.rotation.x = 0.08;
    this.group.visible = this.fade > 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.faceTexture.dispose();
  }
}
