/**
 * Pooled visual effects: particle bursts (one Points draw call, CPU-simulated,
 * compacted each frame) and expanding shockwave rings (one InstancedMesh).
 */
import * as THREE from 'three';
import type { QualityLevel } from './Quality';
import type { Rng } from './Rng';

const MAX_PARTICLES = 900;
const MAX_RINGS = 24;

const P_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), 1.0, 96.0);
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * mv;
}`;

const P_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(vColor * (a * a * 1.6 + a * 0.4) * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

const R_VERT = /* glsl */ `
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

const R_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.62, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
  float fill = (1.0 - smoothstep(0.0, 0.9, r)) * 0.18;
  gl_FragColor = vec4(vColor * (ring + fill), 1.0);
  #include <colorspace_fragment>
}`;

export class Effects {
  readonly group = new THREE.Group();
  // Simulation state (structure of arrays).
  private px = new Float32Array(MAX_PARTICLES);
  private py = new Float32Array(MAX_PARTICLES);
  private pz = new Float32Array(MAX_PARTICLES);
  private vx = new Float32Array(MAX_PARTICLES);
  private vy = new Float32Array(MAX_PARTICLES);
  private vz = new Float32Array(MAX_PARTICLES);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private size = new Float32Array(MAX_PARTICLES);
  private cr = new Float32Array(MAX_PARTICLES);
  private cg = new Float32Array(MAX_PARTICLES);
  private cb = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  // GPU buffers (compacted).
  private gPos: THREE.BufferAttribute;
  private gAlpha: THREE.BufferAttribute;
  private gSize: THREE.BufferAttribute;
  private gColor: THREE.BufferAttribute;
  private gAttrs: THREE.BufferAttribute[];
  private points: THREE.Points;
  private pMat: THREE.ShaderMaterial;
  private countMul = 1;

  // Rings.
  private rings: THREE.InstancedMesh;
  private rPos = new Float32Array(MAX_RINGS * 3);
  private rLife = new Float32Array(MAX_RINGS);
  private rMax = new Float32Array(MAX_RINGS);
  private rSize = new Float32Array(MAX_RINGS);
  private rCol = new Float32Array(MAX_RINGS * 3);
  private rCursor = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(private rng: Rng) {
    const g = new THREE.BufferGeometry();
    this.gPos = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.gAlpha = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage);
    this.gSize = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage);
    this.gColor = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.gPos);
    g.setAttribute('aAlpha', this.gAlpha);
    g.setAttribute('aSize', this.gSize);
    g.setAttribute('aColor', this.gColor);
    g.setDrawRange(0, 0);
    this.gAttrs = [this.gPos, this.gAlpha, this.gSize, this.gColor];
    this.pMat = new THREE.ShaderMaterial({
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);

    const rMat = new THREE.ShaderMaterial({
      vertexShader: R_VERT,
      fragmentShader: R_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), rMat, MAX_RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, this.c.setRGB(0, 0, 0));
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 4;
    this.group.add(this.rings);
  }

  setQuality(l: QualityLevel): void {
    this.countMul = l === 0 ? 0.45 : l === 1 ? 0.75 : 1;
  }

  setPointScale(bufferHeight: number, tanHalfFov: number): void {
    this.pMat.uniforms.uScale.value = bufferHeight / (2 * tanHalfFov);
  }

  /** Spherical burst of glowing sparks. */
  burst(x: number, y: number, z: number, color: number, count: number, speed: number, size = 0.35, life = 0.8): void {
    this.c.setHex(color);
    const n = Math.max(1, Math.round(count * this.countMul));
    const rng = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      // Random direction on a sphere.
      const u = rng.next() * 2 - 1;
      const a = rng.next() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + rng.next() * 0.65);
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = Math.cos(a) * s * sp;
      this.vy[i] = Math.sin(a) * s * sp;
      this.vz[i] = u * sp;
      const l = life * (0.6 + rng.next() * 0.6);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = size * (0.6 + rng.next() * 0.8);
      const w = rng.next() * 0.35; // whiten some sparks
      this.cr[i] = this.c.r + (1 - this.c.r) * w;
      this.cg[i] = this.c.g + (1 - this.c.g) * w;
      this.cb[i] = this.c.b + (1 - this.c.b) * w;
      this.drag[i] = 2.2 + rng.next() * 1.5;
    }
  }

  /** Expanding ring facing the camera (+Z). */
  ring(x: number, y: number, z: number, color: number, size: number, life = 0.5): void {
    const i = this.rCursor;
    this.rCursor = (this.rCursor + 1) % MAX_RINGS;
    this.rPos[i * 3] = x;
    this.rPos[i * 3 + 1] = y;
    this.rPos[i * 3 + 2] = z;
    this.rLife[i] = life;
    this.rMax[i] = life;
    this.rSize[i] = size;
    this.c.setHex(color);
    this.rCol[i * 3] = this.c.r;
    this.rCol[i * 3 + 1] = this.c.g;
    this.rCol[i * 3 + 2] = this.c.b;
  }

  clear(): void {
    this.life.fill(0);
    this.rLife.fill(0);
  }

  update(dt: number): void {
    // Particles.
    const pos = this.gPos.array as Float32Array;
    const al = this.gAlpha.array as Float32Array;
    const sz = this.gSize.array as Float32Array;
    const co = this.gColor.array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      let l = this.life[i];
      if (l <= 0) continue;
      l -= dt;
      this.life[i] = l;
      if (l <= 0) continue;
      const d = Math.exp(-dt * this.drag[i]);
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const t = l / this.maxLife[i];
      pos[n * 3] = this.px[i];
      pos[n * 3 + 1] = this.py[i];
      pos[n * 3 + 2] = this.pz[i];
      al[n] = t * t;
      sz[n] = this.size[i] * (0.5 + 0.5 * t);
      co[n * 3] = this.cr[i];
      co[n * 3 + 1] = this.cg[i];
      co[n * 3 + 2] = this.cb[i];
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    if (n > 0) {
      for (const a of this.gAttrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }

    // Rings.
    let rn = 0;
    for (let i = 0; i < MAX_RINGS; i++) {
      let l = this.rLife[i];
      if (l <= 0) continue;
      l -= dt;
      this.rLife[i] = l;
      if (l <= 0) continue;
      const t = 1 - l / this.rMax[i];
      const s = this.rSize[i] * (0.15 + 0.85 * (1 - (1 - t) * (1 - t)));
      this.m.makeScale(s, s, 1);
      this.m.setPosition(this.rPos[i * 3], this.rPos[i * 3 + 1], this.rPos[i * 3 + 2]);
      this.rings.setMatrixAt(rn, this.m);
      const f = (1 - t) * (1 - t);
      this.c.setRGB(this.rCol[i * 3] * f, this.rCol[i * 3 + 1] * f, this.rCol[i * 3 + 2] * f);
      this.rings.setColorAt(rn, this.c);
      rn++;
    }
    this.rings.count = rn;
    if (rn > 0) {
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
  }
}
