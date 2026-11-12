/**
 * Parameterised flight background, driven by a `BackgroundPreset` per stage:
 * streaming starfield + fast dust (GPU-animated Points, palette and density as uniforms), a far
 * nebula backdrop (procedural canvas texture, two of them cross-fading), tunnel frames that fly
 * past around the play corridor, the scene lights, fog / clear colour, optional extra layers
 * (stage-specific objects), a shooting-star shower for 'starfall' scenery events, and the
 * darkness overlay (stage 3: only the area around the heroine stays lit).
 *
 * `setPreset(p, sec)` morphs every parameter from the current look to `p` over `sec` seconds.
 * ~6 draw calls; no per-frame CPU work besides uniforms.
 */
import * as THREE from 'three';
import { FIELD, PALETTE } from '../core/config';
import { Rng } from './Rng';
import type { QualityLevel } from './Quality';

const STAR_COUNT = [700, 1200, 1700];
const DUST_COUNT = [90, 170, 260];
const STREAKS = 44;

/* ------------------------------------------------------------------ */
/* Preset                                                              */
/* ------------------------------------------------------------------ */

/** A stage-specific object in the background (clouds, silhouettes…). */
export interface BackgroundLayer {
  readonly object3d: THREE.Object3D;
  /** @param time background clock (already scaled by flight speed), speed = flight speed multiplier. */
  update(dt: number, time: number, speed: number): void;
  /** Cross-fade weight 0..1 (1 = fully shown). */
  setOpacity(o: number): void;
  /** React to SceneryEvent names (optional). */
  scenery?(name: string, duration: number): void;
  dispose(): void;
}
export type BackgroundLayerFactory = (rng: Rng) => BackgroundLayer;

export interface PointsLook {
  /** Five colours; index 0 is the "white" share. */
  colors: [number, number, number, number, number];
  /** Share of points using colour 0. */
  white: number;
  /** Fraction of the (quality-limited) points shown, 0..1. */
  density: number;
  /** Point size and stream speed. */
  size: number;
  speed: number;
  /** Brightness multiplier. */
  gain: number;
}

export interface BackgroundPreset {
  /** Clear colour (scene background) and fog. */
  clear: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  stars: PointsLook;
  dust: PointsLook;
  nebula: {
    /** Blob colours ('r,g,b' 0..255 strings are built from these). The last one is used for every 5th blob. */
    colors: number[];
    /** Glow at the vanishing point. */
    glow: number;
    glowAlpha: number;
    /** Overall brightness multiplier (0 = no nebula). */
    intensity: number;
    blobs: number;
    seed: number;
  };
  /** Tunnel frames around the corridor (opacity during play). */
  frame: { color: number; opacity: number };
  light: {
    sky: number;
    ground: number;
    hemi: number;
    key: number;
    keyColor: number;
    rimA: number;
    rimAColor: number;
    rimB: number;
    rimBColor: number;
  };
  /** 0 = off. 1 = everything outside the lit radius around the heroine is (almost) black. */
  darkness: number;
  /** Lit radius as a fraction of the screen height. */
  darkRadius: number;
  darkColor: number;
  /** Shooting-star colour for 'starfall' scenery. */
  streakColor: number;
  /** Stage-specific extra layers (created when the preset is applied, faded in / out). */
  layers?: BackgroundLayerFactory[];
}

/**
 * Runtime multipliers on the current preset's darkness amount / lit radius (1 = as the preset
 * says). Stage 3's final boss drives them (光喰い shrinks the light, the final spell and her
 * defeat lift the darkness). setPreset() bakes them into the morph start and resets them to 1.
 */
export const DARK_MOD = { amount: 1, radius: 1 };

/** Stage 1 「星海」: the original look (purple / cyan / pink / gold on dark space). */
export const BG_STAR_SEA: BackgroundPreset = {
  clear: PALETTE.bg,
  fog: PALETTE.bg,
  fogNear: 70,
  fogFar: 190,
  stars: { colors: [PALETTE.white, PALETTE.cyan, PALETTE.purple, PALETTE.pink, PALETTE.gold], white: 0.6, density: 1, size: 0.5, speed: 7, gain: 1 },
  dust: { colors: [PALETTE.white, PALETTE.cyan, PALETTE.purple, PALETTE.pink, PALETTE.gold], white: 0.3, density: 1, size: 0.09, speed: 38, gain: 1 },
  nebula: {
    colors: [0x9d6bff, 0xff6fb5, 0x4fe8ff, 0x783cc8, 0xffd166],
    glow: 0xc8aaff,
    glowAlpha: 0.22,
    intensity: 1,
    blobs: 46,
    seed: 1,
  },
  frame: { color: PALETTE.purple, opacity: 0.22 },
  light: {
    sky: 0xb7a6ff, ground: 0x141030, hemi: 1.1,
    key: 1.7, keyColor: 0xfff4ec,
    rimA: 1.4, rimAColor: PALETTE.cyan,
    rimB: 0.8, rimBColor: PALETTE.pink,
  },
  darkness: 0,
  darkRadius: 0.32,
  darkColor: 0x000000,
  streakColor: 0xe8f6ff,
};

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const POINT_VERT = /* glsl */ `
attribute float aSeed;
attribute float aRank;
attribute float aPick;
attribute float aHue;
attribute float aBright;
uniform float uTime;
uniform float uSpeed;
uniform float uLen;
uniform float uNear;
uniform float uSize;
uniform float uScale;
uniform float uWhite;
uniform float uDensity;
uniform float uGain;
uniform vec3 uPal[5];
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  float sp = uSpeed * (0.6 + aSeed * 0.8);
  p.z = mod(p.z + uTime * sp, uLen) - uLen + uNear;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.5, -mv.z);
  gl_PointSize = clamp(uSize * (0.55 + aSeed) * uScale / dist, 1.0, 48.0);
  float fadeNear = 1.0 - smoothstep(uNear - 10.0, uNear, p.z);
  float fadeFar = smoothstep(uNear - uLen, uNear - uLen + 40.0, p.z);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
  float keep = 1.0 - smoothstep(uDensity - 0.05, uDensity, aRank);
  vAlpha = fadeNear * fadeFar * tw * keep * uGain;
  int idx = aPick < uWhite ? 0 : 1 + int(min(aHue * 4.0, 3.0));
  vColor = uPal[idx] * aBright;
  gl_Position = projectionMatrix * mv;
  if (keep <= 0.0) gl_PointSize = 0.0;
}`;

const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a = a * a;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

const LINE_VERT = /* glsl */ `
attribute float aRing;
uniform float uTime;
uniform float uSpeed;
uniform float uLen;
uniform float uNear;
varying float vAlpha;
void main() {
  vec3 p = position;
  if (aRing >= 0.0) {
    p.z = mod(p.z + uTime * uSpeed, uLen) - uLen + uNear;
  }
  float fadeNear = 1.0 - smoothstep(uNear - 14.0, uNear + 2.0, p.z);
  float fadeFar = smoothstep(uNear - uLen, -70.0, p.z);
  vAlpha = fadeNear * fadeFar * (aRing >= 0.0 ? 1.0 : 0.55);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

/** Shooting stars: each streak launches at aSeed * uDur, flies toward the camera and fades. */
const STREAK_VERT = /* glsl */ `
attribute float aSeed;
attribute float aEnd;
attribute vec3 aDir;
uniform float uT;
uniform float uDur;
uniform float uOn;
varying float vAlpha;
void main() {
  float launch = aSeed * uDur * 0.85;
  float age = uT - launch;
  float life = 1.1 + fract(aSeed * 17.0) * 0.6;
  float u = age / life;
  float alive = step(0.0, u) * step(u, 1.0);
  vec3 head = position + aDir * age * 95.0;
  float len = 7.0 + fract(aSeed * 31.0) * 9.0;
  vec3 p = head - aDir * len * aEnd;
  vAlpha = alive * uOn * sin(clamp(u, 0.0, 1.0) * 3.14159) * (1.0 - aEnd * 0.95);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const STREAK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

/** Full-screen darkness with a lit hole around the heroine (drawn after the scenery, before shots / bullets). */
const DARK_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const DARK_FRAG = /* glsl */ `
uniform vec2 uCenter;
uniform float uAspect;
uniform float uRadius;
uniform float uAmount;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vNdc;
void main() {
  vec2 d = (vNdc - uCenter) * vec2(uAspect, 1.0) * 0.5;
  float r = length(d);
  // Breathing light edge; soft falloff from the lit core to full darkness.
  float rad = uRadius * (1.0 + 0.04 * sin(uTime * 1.7));
  float a = smoothstep(rad * 0.6, rad * 1.7, r);
  // Corners darkest.
  a = mix(a, 1.0, smoothstep(0.75, 1.25, length(vNdc)) * 0.35);
  gl_FragColor = vec4(uColor, clamp(a * uAmount, 0.0, 1.0));
}`;

/* ------------------------------------------------------------------ */
/* Nebula texture                                                      */
/* ------------------------------------------------------------------ */

const rgbStr = (hex: number) => `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;

function makeNebulaTexture(n: BackgroundPreset['nebula']): THREE.CanvasTexture {
  const rng = new Rng(n.seed * 2654435761 + 7);
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const cols = n.colors.map(rgbStr);
  const last = cols.length - 1;
  for (let i = 0; i < n.blobs; i++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.pow(rng.next(), 0.7) * S * 0.42;
    const x = S / 2 + Math.cos(ang) * rad;
    const y = S / 2 + Math.sin(ang) * rad * 0.8;
    const r = S * (0.05 + rng.next() * 0.16);
    const col = cols[i % 5 === 4 ? last : Math.floor(rng.next() * last)];
    const a = 0.05 + rng.next() * 0.08;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${col},${a})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Soft central glow at the vanishing point.
  const gc = rgbStr(n.glow);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
  grd.addColorStop(0, `rgba(${gc},${n.glowAlpha})`);
  grd.addColorStop(1, `rgba(${gc},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // Fade the square edges to black.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Morphable look                                                      */
/* ------------------------------------------------------------------ */

interface PointsState {
  pal: THREE.Color[];
  white: number;
  density: number;
  size: number;
  speed: number;
  gain: number;
}

/** Every numeric / colour parameter of a preset, flattened so it can be interpolated. */
class Look {
  clear = new THREE.Color();
  fog = new THREE.Color();
  fogNear = 70;
  fogFar = 190;
  stars: PointsState = Look.points();
  dust: PointsState = Look.points();
  frame = new THREE.Color();
  frameOpacity = 0.22;
  sky = new THREE.Color();
  ground = new THREE.Color();
  hemi = 1;
  keyColor = new THREE.Color();
  key = 1;
  rimAColor = new THREE.Color();
  rimA = 1;
  rimBColor = new THREE.Color();
  rimB = 1;
  darkness = 0;
  darkRadius = 0.3;
  darkColor = new THREE.Color();
  streak = new THREE.Color();
  nebula = 1;

  private static points(): PointsState {
    return { pal: [0, 1, 2, 3, 4].map(() => new THREE.Color()), white: 0.5, density: 1, size: 0.5, speed: 7, gain: 1 };
  }

  set(p: BackgroundPreset): this {
    this.clear.setHex(p.clear);
    this.fog.setHex(p.fog);
    this.fogNear = p.fogNear;
    this.fogFar = p.fogFar;
    for (const [dst, src] of [[this.stars, p.stars], [this.dust, p.dust]] as const) {
      src.colors.forEach((c, i) => dst.pal[i].setHex(c));
      dst.white = src.white;
      dst.density = src.density;
      dst.size = src.size;
      dst.speed = src.speed;
      dst.gain = src.gain;
    }
    this.frame.setHex(p.frame.color);
    this.frameOpacity = p.frame.opacity;
    const L = p.light;
    this.sky.setHex(L.sky);
    this.ground.setHex(L.ground);
    this.hemi = L.hemi;
    this.keyColor.setHex(L.keyColor);
    this.key = L.key;
    this.rimAColor.setHex(L.rimAColor);
    this.rimA = L.rimA;
    this.rimBColor.setHex(L.rimBColor);
    this.rimB = L.rimB;
    this.darkness = p.darkness;
    this.darkRadius = p.darkRadius;
    this.darkColor.setHex(p.darkColor);
    this.streak.setHex(p.streakColor);
    this.nebula = p.nebula.intensity;
    return this;
  }

  copy(o: Look): this {
    return this.lerpOf(o, o, 0);
  }

  lerpOf(a: Look, b: Look, t: number): this {
    const n = (x: number, y: number) => x + (y - x) * t;
    this.clear.lerpColors(a.clear, b.clear, t);
    this.fog.lerpColors(a.fog, b.fog, t);
    this.fogNear = n(a.fogNear, b.fogNear);
    this.fogFar = n(a.fogFar, b.fogFar);
    for (const k of ['stars', 'dust'] as const) {
      const d = this[k], x = a[k], y = b[k];
      for (let i = 0; i < 5; i++) d.pal[i].lerpColors(x.pal[i], y.pal[i], t);
      d.white = n(x.white, y.white);
      d.density = n(x.density, y.density);
      d.size = n(x.size, y.size);
      d.speed = n(x.speed, y.speed);
      d.gain = n(x.gain, y.gain);
    }
    this.frame.lerpColors(a.frame, b.frame, t);
    this.frameOpacity = n(a.frameOpacity, b.frameOpacity);
    this.sky.lerpColors(a.sky, b.sky, t);
    this.ground.lerpColors(a.ground, b.ground, t);
    this.hemi = n(a.hemi, b.hemi);
    this.keyColor.lerpColors(a.keyColor, b.keyColor, t);
    this.key = n(a.key, b.key);
    this.rimAColor.lerpColors(a.rimAColor, b.rimAColor, t);
    this.rimA = n(a.rimA, b.rimA);
    this.rimBColor.lerpColors(a.rimBColor, b.rimBColor, t);
    this.rimB = n(a.rimB, b.rimB);
    this.darkness = n(a.darkness, b.darkness);
    this.darkRadius = n(a.darkRadius, b.darkRadius);
    this.darkColor.lerpColors(a.darkColor, b.darkColor, t);
    this.streak.lerpColors(a.streak, b.streak, t);
    this.nebula = n(a.nebula, b.nebula);
    return this;
  }
}

interface LayerEntry {
  layer: BackgroundLayer;
  /** Fading out (removed when the morph finishes). */
  leaving: boolean;
}

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

export class Background {
  readonly group = new THREE.Group();
  private stars: THREE.Points;
  private dust: THREE.Points;
  private nebulae: THREE.Mesh[] = [];
  private nebulaMats: THREE.MeshBasicMaterial[] = [];
  /** Which nebula mesh shows the current preset. */
  private nebIdx = 0;
  private frames: THREE.LineSegments;
  private starMat: THREE.ShaderMaterial;
  private dustMat: THREE.ShaderMaterial;
  private frameMat: THREE.ShaderMaterial;
  private streakMat: THREE.ShaderMaterial;
  private streaks: THREE.LineSegments;
  private darkMat: THREE.ShaderMaterial;
  private dark: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private rimA: THREE.DirectionalLight;
  private rimB: THREE.DirectionalLight;
  private scene: THREE.Scene | null = null;
  private fog: THREE.Fog | null = null;
  private time = 0;
  /** Flight speed multiplier (eased), e.g. faster during the title->play dive. */
  speed = 1;
  private speedTarget = 1;
  /** Frames shown (0..1) on top of the preset's frame opacity. */
  private framesOn = 0;

  // Preset morph.
  private preset: BackgroundPreset = BG_STAR_SEA;
  private from = new Look().set(BG_STAR_SEA);
  private to = new Look().set(BG_STAR_SEA);
  private cur = new Look().set(BG_STAR_SEA);
  private mix = 1;
  private mixSec = 0;
  private layers: LayerEntry[] = [];
  private layerRng: Rng;
  private streakT = 1e3;
  private streakDur = 1;

  constructor(rng: Rng) {
    this.layerRng = new Rng(rng.int());

    const makePoints = (n: number, rMin: number, rMax: number, zLen: number) => {
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const rank = new Float32Array(n);
      const pick = new Float32Array(n);
      const hue = new Float32Array(n);
      const bright = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rMin + Math.sqrt(rng.next()) * (rMax - rMin);
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a) * r * 0.85;
        pos[i * 3 + 2] = rng.next() * zLen;
        seed[i] = rng.next();
        rank[i] = rng.next();
        pick[i] = rng.next();
        hue[i] = rng.next();
        bright[i] = 0.5 + rng.next() * 0.5;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aRank', new THREE.BufferAttribute(rank, 1));
      g.setAttribute('aPick', new THREE.BufferAttribute(pick, 1));
      g.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
      g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -zLen / 2), 1e4);
      return g;
    };

    const makeMat = (len: number) =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 7 },
          uLen: { value: len },
          uNear: { value: 12 },
          uSize: { value: 0.5 },
          uScale: { value: 400 },
          uWhite: { value: 0.5 },
          uDensity: { value: 1 },
          uGain: { value: 1 },
          uPal: { value: [0, 1, 2, 3, 4].map(() => new THREE.Color()) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    this.starMat = makeMat(220);
    this.stars = new THREE.Points(makePoints(STAR_COUNT[2], 7, 70, 220), this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.dustMat = makeMat(90);
    this.dust = new THREE.Points(makePoints(DUST_COUNT[2], 3.2, 11, 90), this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    // Two nebula backdrops far away (cross-fade between presets).
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), mat);
      mesh.position.set(0, 0, -230 - i * 0.5);
      mesh.renderOrder = -10;
      mesh.visible = i === 0;
      this.nebulaMats.push(mat);
      this.nebulae.push(mesh);
      this.group.add(mesh);
    }
    this.nebulaMats[0].map = makeNebulaTexture(BG_STAR_SEA.nebula);

    // Tunnel frames (rounded rectangles slightly larger than the field) + 4 corner rails.
    const RINGS = 9;
    const SEG = 48;
    const len = 140;
    const hw = FIELD.halfW + 1.3;
    const hh = FIELD.halfH + 1.1;
    const verts: number[] = [];
    const ringAttr: number[] = [];
    const pt = (u: number, z: number) => {
      // Superellipse (squircle) outline.
      const a = u * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const e = 0.35;
      verts.push(Math.sign(c) * Math.pow(Math.abs(c), e) * hw, Math.sign(s) * Math.pow(Math.abs(s), e) * hh, z);
    };
    for (let r = 0; r < RINGS; r++) {
      const z = (r / RINGS) * len;
      for (let i = 0; i < SEG; i++) {
        pt(i / SEG, z);
        pt((i + 1) / SEG, z);
        ringAttr.push(r, r);
      }
    }
    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1;
      const sy = i & 2 ? 1 : -1;
      verts.push(sx * hw * 0.93, sy * hh * 0.93, 10, sx * hw * 0.93, sy * hh * 0.93, -120);
      ringAttr.push(-1, -1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fg.setAttribute('aRing', new THREE.Float32BufferAttribute(ringAttr, 1));
    this.frameMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 16 },
        uLen: { value: len },
        uNear: { value: 12 },
        uColor: { value: new THREE.Color(PALETTE.purple) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.frames = new THREE.LineSegments(fg, this.frameMat);
    this.frames.frustumCulled = false;
    this.group.add(this.frames);

    // Shooting stars (scenery 'starfall').
    const sp: number[] = [];
    const sSeed: number[] = [];
    const sEnd: number[] = [];
    const sDir: number[] = [];
    const dir = new THREE.Vector3();
    for (let i = 0; i < STREAKS; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 9 + rng.next() * 34;
      const x = Math.cos(a) * r, y = Math.abs(Math.sin(a)) * r * 0.8 + 4;
      const z = -150 - rng.next() * 30;
      dir.set(-Math.sign(x) * (0.15 + rng.next() * 0.25), -(0.18 + rng.next() * 0.2), 1).normalize();
      const s = i / STREAKS;
      for (let e = 0; e < 2; e++) {
        sp.push(x, y, z);
        sSeed.push(s);
        sEnd.push(e);
        sDir.push(dir.x, dir.y, dir.z);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.Float32BufferAttribute(sSeed, 1));
    sg.setAttribute('aEnd', new THREE.Float32BufferAttribute(sEnd, 1));
    sg.setAttribute('aDir', new THREE.Float32BufferAttribute(sDir, 3));
    this.streakMat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: { uT: { value: 0 }, uDur: { value: 1 }, uOn: { value: 0 }, uColor: { value: new THREE.Color() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.streaks = new THREE.LineSegments(sg, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.streaks.renderOrder = -5;
    this.group.add(this.streaks);

    // Darkness overlay: after the scenery / enemies / boss (renderOrder ≤ 2), before shots (3),
    // effects (4–5), approach markers (10), bullets (11), items (12), bomb, hitbox (999).
    this.darkMat = new THREE.ShaderMaterial({
      vertexShader: DARK_VERT,
      fragmentShader: DARK_FRAG,
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uAspect: { value: 0.46 },
        uRadius: { value: 0.3 },
        uAmount: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.dark = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.darkMat);
    this.dark.frustumCulled = false;
    this.dark.renderOrder = 2.5;
    this.dark.visible = false;
    this.group.add(this.dark);

    // Lights (colours / intensities come from the preset).
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.position.set(2.5, 4, 7);
    this.rimA = new THREE.DirectionalLight(0xffffff, 1);
    this.rimA.position.set(-3, 2.5, -6);
    this.rimB = new THREE.DirectionalLight(0xffffff, 1);
    this.rimB.position.set(3.5, -1, -5);
    this.group.add(this.hemi, this.key, this.rimA, this.rimB);

    this.apply();
  }

  /** Let the background own the scene's clear colour and fog. */
  attach(scene: THREE.Scene): void {
    this.scene = scene;
    this.fog = new THREE.Fog(this.cur.fog, this.cur.fogNear, this.cur.fogFar);
    scene.fog = this.fog;
    scene.background = this.cur.clear.clone();
    scene.add(this.group);
    this.apply();
  }

  get currentPreset(): BackgroundPreset {
    return this.preset;
  }

  /** Darkness currently applied (0..1, morphing). */
  get darkness(): number {
    return this.cur.darkness * DARK_MOD.amount;
  }

  /**
   * Switch to another preset, morphing over `sec` seconds (0 = immediately).
   * Colours, densities, speeds, lights, fog, darkness interpolate; the nebula cross-fades;
   * extra layers fade out / in.
   */
  setPreset(p: BackgroundPreset, sec = 0): void {
    if (p === this.preset && this.mix >= 1) return;
    this.from.copy(this.cur);
    this.from.darkness *= DARK_MOD.amount;
    this.from.darkRadius *= DARK_MOD.radius;
    DARK_MOD.amount = DARK_MOD.radius = 1;
    this.to.set(p);
    this.preset = p;
    this.mixSec = sec;
    this.mix = sec > 0 ? 0 : 1;
    // Nebula: draw the new one into the other mesh.
    const next = 1 - this.nebIdx;
    const mat = this.nebulaMats[next];
    mat.map?.dispose();
    mat.map = makeNebulaTexture(p.nebula);
    mat.needsUpdate = true;
    this.nebulae[next].visible = true;
    this.nebIdx = next;
    // Layers.
    for (const e of this.layers) e.leaving = true;
    for (const f of p.layers ?? []) {
      const layer = f(this.layerRng);
      layer.setOpacity(sec > 0 ? 0 : 1);
      this.group.add(layer.object3d);
      this.layers.push({ layer, leaving: false });
    }
    if (this.mix >= 1) {
      this.cur.copy(this.to);
      this.finishMorph();
    }
    this.apply();
  }

  private finishMorph(): void {
    this.nebulae[1 - this.nebIdx].visible = false;
    this.layers = this.layers.filter((e) => {
      if (!e.leaving) return true;
      e.layer.object3d.removeFromParent();
      e.layer.dispose();
      return false;
    });
  }

  /** Trigger a scenery effect ('starfall' built in; layers may react to others). */
  scenery(name: string, duration: number): void {
    if (name === 'starfall') {
      this.streakT = 0;
      this.streakDur = Math.max(0.5, duration);
      this.streaks.visible = true;
    }
    for (const e of this.layers) e.layer.scenery?.(name, duration);
  }

  setQuality(l: QualityLevel): void {
    this.stars.geometry.setDrawRange(0, STAR_COUNT[l]);
    this.dust.geometry.setDrawRange(0, DUST_COUNT[l]);
  }

  /** Projection scale for point sizes: drawing-buffer height / (2 tan(fov/2)). */
  setPointScale(bufferHeight: number, tanHalfFov: number): void {
    const s = bufferHeight / (2 * tanHalfFov);
    this.starMat.uniforms.uScale.value = s;
    this.dustMat.uniforms.uScale.value = s;
  }

  setSpeed(mul: number): void {
    this.speedTarget = mul;
  }

  /** Show/hide the play-corridor frames (0..1 of the preset's frame opacity; hidden on the title screen). */
  setFramesOpacity(o: number): void {
    this.framesOn = o;
  }

  /** Centre of the lit area (heroine) in NDC, and the viewport aspect (w / h). */
  setLightCenter(ndcX: number, ndcY: number, aspect: number): void {
    this.darkMat.uniforms.uCenter.value.set(ndcX, ndcY);
    this.darkMat.uniforms.uAspect.value = aspect;
  }

  private apply(): void {
    const c = this.cur;
    if (this.scene) {
      (this.scene.background as THREE.Color).copy(c.clear);
      if (this.fog) {
        this.fog.color.copy(c.fog);
        this.fog.near = c.fogNear;
        this.fog.far = c.fogFar;
      }
    }
    for (const [mat, s] of [[this.starMat, c.stars], [this.dustMat, c.dust]] as const) {
      const u = mat.uniforms;
      const pal = u.uPal.value as THREE.Color[];
      for (let i = 0; i < 5; i++) pal[i].copy(s.pal[i]);
      u.uWhite.value = s.white;
      u.uDensity.value = s.density;
      u.uSize.value = s.size;
      u.uSpeed.value = s.speed;
      u.uGain.value = s.gain;
    }
    this.frameMat.uniforms.uColor.value.copy(c.frame);
    this.frameMat.uniforms.uOpacity.value = c.frameOpacity * this.framesOn;
    this.hemi.color.copy(c.sky);
    this.hemi.groundColor.copy(c.ground);
    this.hemi.intensity = c.hemi;
    this.key.color.copy(c.keyColor);
    this.key.intensity = c.key;
    this.rimA.color.copy(c.rimAColor);
    this.rimA.intensity = c.rimA;
    this.rimB.color.copy(c.rimBColor);
    this.rimB.intensity = c.rimB;
    const du = this.darkMat.uniforms;
    du.uAmount.value = c.darkness * DARK_MOD.amount;
    du.uRadius.value = c.darkRadius * DARK_MOD.radius;
    du.uColor.value.copy(c.darkColor);
    this.dark.visible = du.uAmount.value > 0.002;
    this.streakMat.uniforms.uColor.value.copy(c.streak);
    // Nebula cross-fade (additive: colour scales brightness).
    const k = this.mix * this.mix * (3 - 2 * this.mix);
    const nNew = this.to.nebula * k;
    const nOld = this.from.nebula * (1 - k);
    this.nebulaMats[this.nebIdx].color.setScalar(this.mix >= 1 ? c.nebula : nNew);
    this.nebulaMats[1 - this.nebIdx].color.setScalar(nOld);
  }

  update(dt: number): void {
    this.speed += (this.speedTarget - this.speed) * (1 - Math.exp(-dt * 2));
    this.time += dt * this.speed;
    // Keep the time small enough for float precision in the shader.
    if (this.time > 10000) this.time -= 10000;
    this.starMat.uniforms.uTime.value = this.time;
    this.dustMat.uniforms.uTime.value = this.time;
    this.frameMat.uniforms.uTime.value = this.time;
    this.darkMat.uniforms.uTime.value += dt;
    for (const n of this.nebulae) n.rotation.z += dt * 0.004;

    if (this.mix < 1) {
      this.mix = Math.min(1, this.mix + dt / Math.max(1e-3, this.mixSec));
      const k = this.mix * this.mix * (3 - 2 * this.mix);
      this.cur.lerpOf(this.from, this.to, k);
      for (const e of this.layers) e.layer.setOpacity(e.leaving ? 1 - k : k);
      if (this.mix >= 1) this.finishMorph();
    }
    this.apply();

    for (const e of this.layers) e.layer.update(dt, this.time, this.speed);

    if (this.streaks.visible) {
      this.streakT += dt;
      const u = this.streakMat.uniforms;
      u.uT.value = this.streakT;
      u.uDur.value = this.streakDur;
      u.uOn.value = 1;
      if (this.streakT > this.streakDur + 2) this.streaks.visible = false;
    }
  }
}
