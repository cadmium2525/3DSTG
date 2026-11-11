import * as THREE from 'three';

/*
 * Procedural mesh for the heroine, modelled 1 unit tall (feet at y = 0), facing +Z.
 * Everything is merged into a single non-indexed geometry with attributes:
 *   position, normal, uv (face decal), aColor, aSway (hair, skirt, phase, faceMask).
 */

/** Height of the chest (hitbox centre) in model units. */
export const CHEST_Y = 0.66;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;

const col = (hex: number) => new THREE.Color(hex);
const C_SKIN = col(0xfbdcc8);
const C_DRESS = col(0xf6f6fc);
const C_BLUE = col(0x3160d6);
const C_BLUE_DEEP = col(0x2449b4);
const C_HAIR = col(0xedc47c);
const C_HAIR_LIGHT = col(0xf8dea2);
const C_HAIR_DEEP = col(0xd9a95e);
const C_SHOE = col(0x6e3b22);
const C_SHOE_DARK = col(0x3d2014);

const HEAD_C = new V3(0, 0.872, 0);
const HEAD_R = 0.1225;
const CAP_C = new V3(0, 0.878, -0.01);
const CAP_R = 0.134;

interface Paint {
  color: THREE.Color;
  hair: number;
  skirt: number;
  phase: number;
  face: number;
  u: number;
  v: number;
}
type PaintFn = (p: V3, uv: THREE.Vector2, o: Paint) => void;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private colr: number[] = [];
  private sway: number[] = [];

  add(geo: THREE.BufferGeometry, paint: PaintFn | THREE.Color): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const vp = new V3();
    const vuv = new THREE.Vector2();
    const o: Paint = { color: new THREE.Color(), hair: 0, skirt: 0, phase: 0, face: 0, u: 0, v: 0 };
    for (let i = 0; i < p.count; i++) {
      vp.set(p.getX(i), p.getY(i), p.getZ(i));
      if (uv) vuv.set(uv.getX(i), uv.getY(i));
      o.hair = o.skirt = o.phase = o.face = o.u = o.v = 0;
      if (paint instanceof THREE.Color) o.color.copy(paint);
      else paint(vp, vuv, o);
      this.pos.push(vp.x, vp.y, vp.z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uvs.push(o.u, o.v);
      this.colr.push(o.color.r, o.color.g, o.color.b);
      this.sway.push(o.hair, o.skirt, o.phase, o.face);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/* ----------------------------- shape helpers ----------------------------- */

function sphere(rx: number, ry: number, rz: number, x: number, y: number, z: number, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

/** Tapered cylinder between two points. */
function limb(a: V3, b: V3, ra: number, rb: number, radial = 12) {
  const d = new V3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(rb, ra, d.length(), radial, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  const m = new V3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Horizontal ruffled ring (sock / sleeve frill). */
function frill(R: number, tube: number, ruffles: number, amp: number) {
  const g = new THREE.TorusGeometry(R, tube, 8, 40);
  g.rotateX(Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const f = 1 + amp * Math.sin(th * ruffles);
    p.setXYZ(i, x * f, p.getY(i) + Math.cos(th * ruffles) * tube * 0.5, z * f);
  }
  g.computeVertexNormals();
  return g;
}

/** Bow tie shape: two puffy loops pinched at the knot, lying in the XY plane. */
function bow(w: number, h: number, d: number) {
  const g = new THREE.SphereGeometry(1, 24, 12);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const ax = Math.abs(x);
    const pinch = 0.24 + 0.76 * smooth(0, 0.6, ax);
    p.setXYZ(i, x * w, p.getY(i) * h * pinch - 0.22 * h * ax * ax, p.getZ(i) * d * pinch);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Flattened tapering tube along a spline: hair locks and ribbon tails.
 * uv.x = t along the strand (0 root .. 1 tip).
 */
function strand(
  ctrl: V3[],
  width: (t: number) => number,
  thick: (t: number) => number,
  outFn: (p: V3) => V3,
  segs = 16,
  radial = 6,
) {
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', 0.5);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const S = new V3();
  const N = new V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const T = curve.getTangent(t);
    const O = outFn(p);
    S.crossVectors(T, O).normalize();
    N.crossVectors(S, T).normalize();
    const w = width(t);
    const th = thick(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * w;
      const s = Math.sin(a) * th;
      pos.push(p.x + S.x * c + N.x * s, p.y + S.y * c + N.y * s, p.z + S.z * c + N.z * s);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = a + radial;
      const d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Drop triangles whose centroid fails `keep`. Returns a non-indexed geometry. */
function filterTriangles(geo: THREE.BufferGeometry, keep: (c: V3) => boolean) {
  const g = geo.toNonIndexed();
  geo.dispose();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const pos: number[] = [];
  const nor: number[] = [];
  const a = new V3();
  const b = new V3();
  const c = new V3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const cen = new V3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    if (!keep(cen)) continue;
    for (let k = 0; k < 3; k++) {
      pos.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
      nor.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
    }
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const radialXZ = (p: V3) => {
  const o = new V3(p.x, 0, p.z);
  return o.lengthSq() < 1e-8 ? o.set(0, 0, -1) : o.normalize();
};

/* --------------------------------- build --------------------------------- */

export function buildHeroineGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const rnd = mulberry32(20261111);

  /* ---- legs, socks, shoes ---- */
  for (const sx of [-1, 1]) {
    const x = sx * 0.042;
    b.add(limb(new V3(x, 0.42, 0), new V3(x, 0.12, 0.002), 0.036, 0.0245), C_SKIN);
    b.add(limb(new V3(x, 0.142, 0.002), new V3(x, 0.05, 0.004), 0.0262, 0.0225), C_DRESS);
    const f1 = frill(0.031, 0.0095, 9, 0.1);
    f1.translate(x, 0.146, 0.002);
    b.add(f1, C_DRESS);
    const f2 = frill(0.0285, 0.008, 9, 0.1);
    f2.rotateY(0.35);
    f2.translate(x, 0.13, 0.002);
    b.add(f2, C_DRESS);
    // Shoe: rounded toe box with a dark sole, plus an ankle strap.
    b.add(sphere(0.037, 0.031, 0.068, x, 0.031, 0.02, 16, 12), (p, _uv, o) => {
      o.color.copy(p.y < 0.011 ? C_SHOE_DARK : C_SHOE);
    });
    const strap = new THREE.TorusGeometry(0.0275, 0.0065, 6, 20);
    strap.rotateX(Math.PI / 2);
    strap.rotateX(-0.25);
    strap.translate(x, 0.06, 0.006);
    b.add(strap, C_SHOE);
  }

  /* ---- torso, neck, neckline ---- */
  {
    const torso = new THREE.CylinderGeometry(0.058, 0.047, 0.135, 24, 4);
    torso.scale(1, 1, 0.8);
    torso.translate(0, 0.665, 0);
    b.add(torso, C_DRESS);
    b.add(sphere(0.066, 0.022, 0.046, 0, 0.716, 0, 20, 10), C_DRESS);
    b.add(sphere(0.036, 0.012, 0.03, 0, 0.73, 0.004, 16, 8), C_SKIN);
    const trim = new THREE.TorusGeometry(0.038, 0.0055, 6, 28);
    trim.rotateX(Math.PI / 2);
    trim.scale(1, 1, 0.82);
    trim.rotateX(0.32);
    trim.translate(0, 0.728, 0.004);
    b.add(trim, C_BLUE);
    b.add(limb(new V3(0, 0.725, 0), new V3(0, 0.8, 0), 0.0225, 0.02), C_SKIN);
  }

  /* ---- sleeves, arms, hands ---- */
  for (const sx of [-1, 1]) {
    b.add(sphere(0.05, 0.044, 0.048, sx * 0.088, 0.695, 0, 16, 12), C_DRESS);
    const cuff = frill(0.031, 0.0095, 8, 0.1);
    cuff.rotateZ(sx * 0.42);
    cuff.translate(sx * 0.104, 0.662, 0.002);
    b.add(cuff, C_DRESS);
    const shoulder = new V3(sx * 0.098, 0.678, 0.002);
    const elbow = new V3(sx * 0.137, 0.582, -0.006);
    const wrist = new V3(sx * 0.158, 0.492, 0.018);
    b.add(limb(shoulder, elbow, 0.0205, 0.0175), C_SKIN);
    b.add(sphere(0.0176, 0.0176, 0.0176, elbow.x, elbow.y, elbow.z, 8, 6), C_SKIN);
    b.add(limb(elbow, wrist, 0.0175, 0.0145), C_SKIN);
    b.add(sphere(0.0155, 0.024, 0.013, sx * 0.162, 0.474, 0.022, 10, 8), C_SKIN);
  }

  /* ---- sash ---- */
  {
    const sash = new THREE.CylinderGeometry(0.0515, 0.0525, 0.04, 28, 1, true);
    sash.scale(1, 1, 0.82);
    sash.translate(0, 0.613, 0);
    b.add(sash, C_BLUE);
  }

  /* ---- skirt (lathe with folds and a blue stripe near the hem) ---- */
  {
    const TOP = 0.602;
    const HEM = 0.31;
    const ys: number[] = [];
    for (let i = 0; i <= 14; i++) ys.push(TOP - ((TOP - 0.352) * i) / 14);
    ys.push(0.3475, 0.3455, 0.3295, 0.3275, 0.318, HEM);
    const pts = ys.map((y) => {
      const t = (TOP - y) / (TOP - HEM);
      const r = 0.05 + 0.128 * Math.pow(Math.sin((t * Math.PI) / 2), 0.92);
      return new THREE.Vector2(r, y);
    });
    const g = new THREE.LatheGeometry(pts, 72);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = (TOP - y) / (TOP - HEM);
      const th = Math.atan2(z, x);
      const fold = 1 + 0.055 * t * t * Math.sin(th * 10) + 0.018 * t * Math.sin(th * 23 + 1.3);
      const squash = 0.82 + 0.18 * smooth(0, 0.35, t);
      p.setXYZ(i, x * fold, y - 0.005 * t * t * Math.sin(th * 10), z * fold * squash);
      uv.setXY(i, y, th); // keep the undisplaced ring height for painting
    }
    g.computeVertexNormals();
    const C_FOLD = col(0xc3c8ea);
    b.add(g, (_v, vuv, o) => {
      const y = vuv.x;
      const th = vuv.y;
      const t = (TOP - y) / (TOP - HEM);
      const stripe = y < 0.3465 && y > 0.3285;
      // Baked shading: fold valleys and the gathered waist are darker.
      const valley = 0.5 - 0.5 * Math.sin(th * 10);
      const ao = 0.75 * t * Math.pow(valley, 2.2) + 0.35 * (1 - smooth(0, 0.12, t));
      o.color.copy(stripe ? C_BLUE : C_DRESS);
      if (!stripe) o.color.lerp(C_FOLD, Math.min(1, ao));
      else o.color.lerp(C_BLUE_DEEP, Math.min(1, ao));
      o.skirt = t * t;
      o.phase = th * 3;
    });
  }

  /* ---- sash bow at the back of the waist ---- */
  {
    const g = bow(0.105, 0.05, 0.024);
    g.rotateX(0.25);
    g.translate(0, 0.612, -0.066);
    b.add(g, (_p, _uv, o) => {
      o.color.copy(C_BLUE);
      o.skirt = 0.04;
    });
    b.add(sphere(0.02, 0.022, 0.018, 0, 0.612, -0.074, 10, 8), C_BLUE_DEEP);
    for (const sx of [-1, 1]) {
      const tail = strand(
        [
          new V3(sx * 0.008, 0.61, -0.068),
          new V3(sx * 0.04, 0.545, -0.112),
          new V3(sx * 0.068, 0.47, -0.15),
          new V3(sx * 0.092, 0.395, -0.178),
        ],
        (t) => 0.02 + 0.02 * t,
        () => 0.005,
        () => new V3(0, 0.25, -1).normalize(),
        10,
        6,
      );
      b.add(tail, (_p, uv, o) => {
        o.color.copy(C_BLUE).lerp(C_BLUE_DEEP, uv.x * 0.5);
        o.skirt = uv.x * uv.x * 0.9;
        o.phase = sx * 1.7;
      });
    }
  }

  /* ---- head ---- */
  {
    const g = new THREE.SphereGeometry(HEAD_R, 36, 28);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      const y = p.getY(i);
      let z = p.getZ(i);
      if (y < 0) {
        // Taper the jaw toward a soft chin.
        const k = y / HEAD_R;
        const f = 1 - 0.24 * k * k;
        x *= f;
        z *= f;
      }
      z *= 0.97;
      p.setXYZ(i, x, y, z);
      uv.setXY(i, x / (2 * HEAD_R) + 0.5, y / (2 * HEAD_R) + 0.5);
    }
    g.computeVertexNormals();
    g.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
    b.add(g, (v, vuv, o) => {
      o.color.copy(C_SKIN);
      o.u = vuv.x;
      o.v = vuv.y;
      o.face = v.z > 0.012 ? 1 : 0;
    });
  }

  /* ---- hair cap (top / back of the head, face window cut out) ---- */
  {
    const g0 = new THREE.SphereGeometry(CAP_R, 40, 28);
    g0.translate(CAP_C.x, CAP_C.y, CAP_C.z);
    const g = filterTriangles(g0, (c) => {
      const d = c.clone().sub(HEAD_C).normalize();
      return !(d.z > 0.2 && d.y < 0.56) && d.y > -0.9;
    });
    b.add(g, (v, _uv, o) => {
      const th = Math.atan2(v.x, v.z - CAP_C.z);
      const streak = 0.5 + 0.5 * Math.sin(th * 17 + Math.sin(th * 5) * 2);
      o.color.copy(C_HAIR).lerp(C_HAIR_LIGHT, streak * 0.5);
    });
  }

  /* ---- hair mass behind the back (keeps the long hair opaque) ---- */
  b.add(sphere(0.158, 0.25, 0.08, 0, 0.705, -0.072, 24, 18), (v, _uv, o) => {
    o.color.copy(C_HAIR_DEEP);
    const w = Math.min(1, Math.max(0, (0.9 - v.y) / 0.44));
    o.hair = w * w * 0.85;
    o.phase = v.x * 14;
  });

  /* ---- long back / side locks ---- */
  const longLock = (
    aDeg: number,
    yEnd: number,
    rOff: number,
    w0: number,
    tint: THREE.Color,
    tintAmt: number,
  ) => {
    const a = (aDeg * Math.PI) / 180;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    const ph1 = rnd() * Math.PI * 2;
    const ph2 = rnd() * Math.PI * 2;
    const waves = 1.5 + rnd() * 0.5;
    const ctrl: V3[] = [];
    const K = 9;
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      const fall = t < 0.18 ? (t / 0.18) * 0.2 : 0.2 + (0.8 * (t - 0.18)) / 0.82;
      const y = 1.013 - (1.013 - yEnd) * fall;
      const rIn = 0.01 + 0.132 * smooth(0, 0.18, t) + rOff * smooth(0.05, 0.3, t);
      const rx = rIn + 0.052 * smooth(0.2, 1, t);
      const rz = rIn + 0.012 * smooth(0.2, 1, t);
      const wv = 0.02 * t * Math.sin(Math.PI * 2 * waves * t + ph1);
      const wr = 0.012 * t * Math.sin(Math.PI * 2 * (waves + 0.5) * t + ph2);
      ctrl.push(
        new V3(sa * (rx + wr) + ca * wv, y, CAP_C.z + ca * (rz + wr) - sa * wv - 0.022 * t),
      );
    }
    const phase = rnd() * 6.28;
    const shade = 0.93 + rnd() * 0.1;
    const g = strand(
      ctrl,
      (t) => w0 * (0.3 + 0.7 * smooth(0, 0.25, t)) * Math.pow(1 - Math.pow(t, 4.2), 0.8),
      (t) => 0.021 * (0.6 + 0.4 * smooth(0, 0.3, t)) * Math.pow(1 - Math.pow(t, 4), 0.8) + 0.002,
      radialXZ,
      22,
      7,
    );
    b.add(g, (_p, uv, o) => {
      const t = uv.x;
      const edge = Math.pow(Math.abs(Math.cos(uv.y * Math.PI * 2)), 3);
      o.color
        .copy(C_HAIR)
        .lerp(tint, tintAmt)
        .lerp(C_HAIR_DEEP, t * 0.45)
        .multiplyScalar(shade * (1 - 0.2 * edge));
      const k = Math.max(0, (t - 0.22) / 0.78);
      o.hair = Math.pow(k, 1.6);
      o.phase = phase;
    });
  };

  const NA = 12;
  for (let i = 0; i < NA; i++) {
    const a = 100 + (160 * i) / (NA - 1);
    const back = Math.abs(Math.sin(((a - 180) * Math.PI) / 180));
    longLock(a + (rnd() - 0.5) * 5, 0.455 + 0.05 * back + rnd() * 0.025, 0, 0.062, C_HAIR_DEEP, 0.12);
  }
  const NB = 9;
  for (let i = 0; i < NB; i++) {
    const a = 108 + (144 * i) / (NB - 1);
    longLock(a + (rnd() - 0.5) * 6, 0.53 + rnd() * 0.07, 0.013, 0.037, C_HAIR_LIGHT, 0.55);
  }

  /* ---- front locks falling over the shoulders, face-framing locks ---- */
  for (const sx of [-1, 1]) {
    const phase = rnd() * 6.28;
    const front = strand(
      [
        new V3(sx * 0.03, 1.004, 0.008),
        new V3(sx * 0.112, 0.94, 0.04),
        new V3(sx * 0.136, 0.86, 0.046),
        new V3(sx * 0.128, 0.775, 0.066),
        new V3(sx * 0.118, 0.7, 0.082),
        new V3(sx * 0.134, 0.625, 0.086),
        new V3(sx * 0.118, 0.555, 0.082),
        new V3(sx * 0.128, 0.505, 0.074),
      ],
      (t) => 0.042 * (0.5 + 0.5 * smooth(0, 0.25, t)) * Math.pow(1 - Math.pow(t, 3.2), 0.85),
      (t) => 0.017 * Math.pow(1 - Math.pow(t, 4), 0.8) + 0.002,
      radialXZ,
      22,
      7,
    );
    b.add(front, (_p, uv, o) => {
      const edge = Math.pow(Math.abs(Math.cos(uv.y * Math.PI * 2)), 3);
      o.color.copy(C_HAIR).lerp(C_HAIR_DEEP, uv.x * 0.4).multiplyScalar(1 - 0.2 * edge);
      const k = Math.max(0, (uv.x - 0.35) / 0.65);
      o.hair = Math.pow(k, 1.6) * 0.75;
      o.phase = phase;
    });

    const side = strand(
      [
        new V3(sx * 0.024, 1.005, 0.026),
        new V3(sx * 0.094, 0.95, 0.078),
        new V3(sx * 0.121, 0.885, 0.068),
        new V3(sx * 0.118, 0.815, 0.066),
        new V3(sx * 0.104, 0.762, 0.074),
      ],
      (t) => 0.03 * (0.5 + 0.5 * smooth(0, 0.3, t)) * Math.pow(1 - Math.pow(t, 2.6), 0.9),
      (t) => 0.014 * Math.pow(1 - Math.pow(t, 3), 0.8) + 0.002,
      (p) => p.clone().sub(HEAD_C).normalize(),
      14,
      6,
    );
    b.add(side, (_p, uv, o) => {
      o.color.copy(C_HAIR).lerp(C_HAIR_LIGHT, 0.3);
      o.hair = uv.x * uv.x * 0.12;
      o.phase = phase + 1;
    });
  }

  /* ---- bangs ---- */
  {
    const R = CAP_R + 0.004;
    const onCap = (x: number, y: number) => {
      const dy = y - CAP_C.y;
      return new V3(x, y, CAP_C.z + Math.sqrt(Math.max(1e-6, R * R - x * x - dy * dy)));
    };
    const N = 7;
    for (let i = 0; i < N; i++) {
      const k = i - (N - 1) / 2; // -3..3
      const x = k * 0.031;
      const ak = Math.abs(k);
      const tipY = HEAD_C.y + 0.036 - ak * 0.014 + (rnd() - 0.5) * 0.01;
      const sweep = (k === 0 ? 0.012 : Math.sign(k) * 0.006) + (rnd() - 0.5) * 0.008;
      const g = strand(
        [
          onCap(x * 0.25, CAP_C.y + 0.128),
          onCap(x * 0.7, CAP_C.y + 0.1),
          onCap(x * 1.0, CAP_C.y + 0.06),
          onCap(x * 1.08 + sweep, tipY),
        ],
        (t) => 0.026 * (0.55 + 0.45 * smooth(0, 0.4, t)) * Math.pow(1 - Math.pow(t, 2.4), 0.9),
        (t) => 0.011 * Math.pow(1 - Math.pow(t, 3), 0.8) + 0.0015,
        (p) => p.clone().sub(HEAD_C).normalize(),
        12,
        6,
      );
      const shade = 0.96 + rnd() * 0.07;
      b.add(g, (_p, uv, o) => {
        o.color.copy(C_HAIR).lerp(C_HAIR_LIGHT, 0.35).lerp(C_HAIR_DEEP, uv.x * 0.25).multiplyScalar(shade);
      });
    }
  }

  /* ---- big bow on the back of the head ---- */
  {
    const z = CAP_C.z - 0.196;
    const g = bow(0.1, 0.06, 0.026);
    g.translate(0, 0.882, z);
    b.add(g, (_p, _uv, o) => {
      o.color.copy(C_BLUE);
      o.hair = 0.03;
    });
    b.add(sphere(0.022, 0.026, 0.02, 0, 0.882, z - 0.01, 10, 8), C_BLUE_DEEP);
    for (const sx of [-1, 1]) {
      const tail = strand(
        [
          new V3(sx * 0.006, 0.878, z),
          new V3(sx * 0.03, 0.8, z - 0.014),
          new V3(sx * 0.052, 0.735, z - 0.024),
          new V3(sx * 0.07, 0.675, z - 0.03),
        ],
        (t) => 0.018 + 0.02 * t,
        () => 0.0045,
        () => new V3(0, 0, -1),
        10,
        6,
      );
      b.add(tail, (_p, uv, o) => {
        o.color.copy(C_BLUE).lerp(C_BLUE_DEEP, uv.x * 0.5);
        o.hair = 0.05 + uv.x * uv.x * 0.3;
        o.phase = sx * 2.1;
      });
    }
  }

  /* ---- side ribbons ---- */
  for (const sx of [-1, 1]) {
    const cx = sx * 0.172;
    const cy = 0.882;
    const cz = -0.012;
    const g = bow(0.064, 0.05, 0.02);
    g.rotateZ(sx * -0.35);
    g.rotateY(sx * 0.75);
    g.translate(cx, cy, cz);
    b.add(g, (_p, _uv, o) => {
      o.color.copy(C_BLUE);
      o.hair = 0.02;
    });
    b.add(sphere(0.015, 0.018, 0.015, cx + sx * 0.008, cy, cz + 0.008, 8, 6), C_BLUE_DEEP);
    for (const k of [0, 1]) {
      const dz = k === 0 ? 0.016 : -0.02;
      const len = k === 0 ? 0.17 : 0.14;
      const tail = strand(
        [
          new V3(cx, cy - 0.005, cz),
          new V3(cx + sx * 0.012, cy - len * 0.4, cz + dz * 0.6),
          new V3(cx + sx * 0.018, cy - len * 0.75, cz + dz),
          new V3(cx + sx * 0.014, cy - len, cz + dz * 1.2),
        ],
        (t) => 0.015 + 0.016 * t,
        () => 0.004,
        () => new V3(sx * 0.75, 0, 0.66),
        8,
        6,
      );
      b.add(tail, (_p, uv, o) => {
        o.color.copy(C_BLUE).lerp(C_BLUE_DEEP, uv.x * 0.5);
        o.hair = 0.03 + uv.x * uv.x * 0.25;
        o.phase = sx + k;
      });
    }
  }

  return b.build();
}
