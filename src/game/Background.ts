/**
 * Dark fantasy void: streaming starfield + fast dust (GPU-animated Points),
 * a far nebula backdrop (procedural canvas texture), and tunnel frames that
 * fly past around the play corridor so depth/speed is readable.
 * 4 draw calls; no per-frame CPU work besides uniforms.
 */
import * as THREE from 'three';
import { FIELD, PALETTE } from '../core/config';
import type { Rng } from './Rng';
import type { QualityLevel } from './Quality';

const STAR_COUNT = [700, 1200, 1700];
const DUST_COUNT = [90, 170, 260];

const POINT_VERT = /* glsl */ `
attribute float aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uSpeed;
uniform float uLen;
uniform float uNear;
uniform float uSize;
uniform float uScale;
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
  vAlpha = fadeNear * fadeFar * tw;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
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

function makeNebulaTexture(rng: Rng): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const cols = ['157,107,255', '255,111,181', '79,232,255', '120,60,200', '255,209,102'];
  for (let i = 0; i < 46; i++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.pow(rng.next(), 0.7) * S * 0.42;
    const x = S / 2 + Math.cos(ang) * rad;
    const y = S / 2 + Math.sin(ang) * rad * 0.8;
    const r = S * (0.05 + rng.next() * 0.16);
    const col = cols[i % 5 === 4 ? 4 : Math.floor(rng.next() * 4)];
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
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
  grd.addColorStop(0, 'rgba(200,170,255,0.22)');
  grd.addColorStop(1, 'rgba(200,170,255,0)');
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

export class Background {
  readonly group = new THREE.Group();
  private stars: THREE.Points;
  private dust: THREE.Points;
  private nebula: THREE.Mesh;
  private frames: THREE.LineSegments;
  private starMat: THREE.ShaderMaterial;
  private dustMat: THREE.ShaderMaterial;
  private frameMat: THREE.ShaderMaterial;
  private time = 0;
  /** Flight speed multiplier (eased), e.g. faster during the title->play dive. */
  speed = 1;
  private speedTarget = 1;

  constructor(rng: Rng) {
    const pal = [PALETTE.white, PALETTE.cyan, PALETTE.purple, PALETTE.pink, PALETTE.gold];
    const col = new THREE.Color();

    const makePoints = (n: number, rMin: number, rMax: number, zLen: number, colorBias: number) => {
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const color = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rMin + Math.sqrt(rng.next()) * (rMax - rMin);
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a) * r * 0.85;
        pos[i * 3 + 2] = rng.next() * zLen;
        seed[i] = rng.next();
        const pick = rng.next() < colorBias ? 0 : 1 + Math.floor(rng.next() * 4);
        col.setHex(pal[pick]);
        const b = 0.5 + rng.next() * 0.5;
        color[i * 3] = col.r * b;
        color[i * 3 + 1] = col.g * b;
        color[i * 3 + 2] = col.b * b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -zLen / 2), 1e4);
      return g;
    };

    const makeMat = (speed: number, len: number, size: number) =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: speed },
          uLen: { value: len },
          uNear: { value: 12 },
          uSize: { value: size },
          uScale: { value: 400 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    this.starMat = makeMat(7, 220, 0.5);
    this.stars = new THREE.Points(makePoints(STAR_COUNT[2], 7, 70, 220, 0.6), this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.dustMat = makeMat(38, 90, 0.09);
    this.dust = new THREE.Points(makePoints(DUST_COUNT[2], 3.2, 11, 90, 0.3), this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    // Nebula backdrop far away.
    const nebMat = new THREE.MeshBasicMaterial({
      map: makeNebulaTexture(rng),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.nebula = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), nebMat);
    this.nebula.position.set(0, 0, -230);
    this.nebula.renderOrder = -10;
    this.group.add(this.nebula);

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
        uOpacity: { value: 0.32 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.frames = new THREE.LineSegments(fg, this.frameMat);
    this.frames.frustumCulled = false;
    this.group.add(this.frames);
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

  /** Show/hide the play-corridor frames (hidden on the title screen). */
  setFramesOpacity(o: number): void {
    this.frameMat.uniforms.uOpacity.value = o;
  }

  update(dt: number): void {
    this.speed += (this.speedTarget - this.speed) * (1 - Math.exp(-dt * 2));
    this.time += dt * this.speed;
    // Keep the time small enough for float precision in the shader.
    if (this.time > 10000) this.time -= 10000;
    this.starMat.uniforms.uTime.value = this.time;
    this.dustMat.uniforms.uTime.value = this.time;
    this.frameMat.uniforms.uTime.value = this.time;
    this.nebula.rotation.z += dt * 0.004;
  }
}
