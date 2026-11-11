/**
 * Pattern emitters. Each emitter is time-driven and deterministic from its seed; emission
 * events are scheduled in emitter time and late spawns are pre-aged, so the result does not
 * depend on the frame rate. Patterns are designed in terms of their cross-section on the play
 * plane (where and when bullets cross z = 0); the 3D flight shape is decoration on top.
 */
import { FIELD, PALETTE } from '../core/config';
import type { PatternHandle, PatternId, PatternOptions } from '../core/types';
import type { BulletPool, SpawnParams } from './pool';

export interface EmitCtx {
  pool: BulletPool;
  sp: SpawnParams;
  /** Last known player position (for aimed shots). */
  px: number;
  py: number;
  /** Quality density factor: 0.55 / 0.8 / 1. */
  density: number;
}

/* ---------------------------------------------------------------- utils */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = readonly [number, number, number];
const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export const COL = {
  cyan: rgb(PALETTE.cyan),
  purple: rgb(PALETTE.purple),
  pink: rgb(PALETTE.pink),
  gold: rgb(PALETTE.gold),
  white: rgb(PALETTE.white),
} as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;
/** Cross-section clip: bullets crossing well outside the field are not worth spawning. */
const CLIP_X = FIELD.halfW + 0.45;
const CLIP_Y = FIELD.halfH + 0.45;
const inClip = (x: number, y: number) => Math.abs(x) <= CLIP_X && Math.abs(y) <= CLIP_Y;
const wrapPi = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

function setColor(sp: SpawnParams, c: RGB, mixWhite = 0): void {
  sp.r = lerp(c[0], 1, mixWhite);
  sp.g = lerp(c[1], 1, mixWhite);
  sp.b = lerp(c[2], 1, mixWhite);
}
function mixColor(sp: SpawnParams, a: RGB, b: RGB, t: number): void {
  sp.r = lerp(a[0], b[0], t);
  sp.g = lerp(a[1], b[1], t);
  sp.b = lerp(a[2], b[2], t);
}

/** Polar arrival point (relative to axis c) -> spawn. */
function spawnPolar(ctx: EmitCtx, rho: number, th: number): number {
  const sp = ctx.sp;
  sp.r1 = rho;
  sp.th1 = th;
  return ctx.pool.spawn(sp);
}

/** Cartesian arrival point -> spawn (polar about the current axis sp.cx, sp.cy). */
function spawnAt(ctx: EmitCtx, x: number, y: number): number {
  const sp = ctx.sp;
  const dx = x - sp.cx, dy = y - sp.cy;
  sp.r1 = Math.sqrt(dx * dx + dy * dy);
  sp.th1 = Math.atan2(dy, dx);
  return ctx.pool.spawn(sp);
}

/* ---------------------------------------------------------------- base */

export abstract class Emitter implements PatternHandle {
  t = 0;
  protected next = 0;
  protected stopped = false;
  protected readonly I: number;
  protected readonly rng: () => number;
  protected readonly duration: number;
  protected readonly opts: PatternOptions;
  /** Base flight time to the play plane at this intensity. */
  protected readonly flightT: number;

  constructor(opts: PatternOptions, firstDelay = 0) {
    this.opts = opts;
    this.I = Math.min(1, Math.max(0, opts.intensity ?? 0.5));
    this.rng = mulberry32((opts.seed ?? 1) * 2654435761 + 12345);
    this.duration = opts.duration;
    this.next = firstDelay;
    this.flightT = lerp(4.25, 3.45, this.I);
  }

  get done(): boolean {
    return this.stopped || this.t >= this.duration;
  }

  stop(): void {
    this.stopped = true;
  }

  update(dt: number, ctx: EmitCtx): void {
    if (this.stopped) return;
    this.t += dt;
    let guard = 0;
    while (this.next <= this.t && this.next < this.duration && guard++ < 64) {
      const o = this.opts.origin();
      const sp = ctx.sp;
      sp.ox = o.x; sp.oy = o.y; sp.oz = Math.min(o.z, FIELD.planeZ - 6);
      sp.age = this.t - this.next;
      sp.size = 1; sp.ep = 1; sp.om = 0; sp.cx = 0; sp.cy = 0;
      sp.T = this.flightT; sp.accel = 2.2;
      this.next += Math.max(0.02, this.emit(this.next, ctx));
    }
  }

  /** Emit the event scheduled at emitter time te; return seconds until the next event. */
  protected abstract emit(te: number, ctx: EmitCtx): number;
}

/* ------------------------------------------------- 螺旋回廊 spiral corridor */

/**
 * Cross-section: A curved spokes (galaxy arms) sweeping around a slowly wandering hub, plus a
 * hub stream. The gap between arms rotates with varying speed; the player rides it.
 * In 3D the arms twist the opposite way in flight, so the stream reads as a helix tunnel.
 */
class SpiralCorridor extends Emitter {
  private readonly arms: number;
  private readonly dir: number;
  private readonly phase0: number;
  private readonly curl: number;
  private count = 0;
  private lastPhi = NaN;

  constructor(opts: PatternOptions) {
    super(opts, 0.1);
    this.arms = this.I > 0.62 ? 3 : 2;
    this.dir = this.rng() < 0.5 ? -1 : 1;
    this.phase0 = this.rng() * TAU;
    this.curl = (0.55 + this.rng() * 0.12) * (this.rng() < 0.5 ? -1 : 1);
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const d = Math.sqrt(ctx.density);
    const w0 = lerp(0.42, 0.7, I);
    // Gap phase: turning one way, angular speed breathing between ~0 and ~2x w0.
    const phi = this.phase0 + this.dir * (w0 * te + 2 * w0 * Math.sin(te * 0.5));
    const dPhi = Number.isNaN(this.lastPhi) ? 0.12 : Math.abs(phi - this.lastPhi);
    this.lastPhi = phi;
    const c = this.count++;
    // Hub wanders a little so the corridor itself drifts.
    sp.cx = 0.45 * Math.sin(te * 0.37 + this.phase0);
    sp.cy = 0.6 * Math.sin(te * 0.29 + 1.3);
    sp.om = -this.dir * 0.55;
    sp.ep = 1.15;
    sp.accel = 2.3;
    const step = 0.44 / d;
    const rhoMax = 4.9;
    for (let a = 0; a < this.arms; a++) {
      const base = phi + (TAU * a) / this.arms;
      const col = a === 0 ? COL.cyan : a === 1 ? COL.purple : COL.pink;
      // Arc-length stepping along the curled arm.
      for (let rho = 0.42; rho <= rhoMax; rho += step / Math.sqrt(1 + this.curl * this.curl * rho * rho)) {
        // Where the arm is nearly tangential it barely moves between emissions: thin it out.
        const perp = (rho * dPhi) / Math.sqrt(1 + this.curl * this.curl * rho * rho);
        const every = perp > 0.15 ? 1 : perp > 0.08 ? 2 : 3;
        if (c % every !== 0) continue;
        const th = base + this.curl * rho;
        const x = sp.cx + rho * Math.cos(th), y = sp.cy + rho * Math.sin(th);
        if (!inClip(x, y)) continue;
        sp.r0 = 0.6 * rho + 1.2;
        sp.size = 0.95 + 0.1 * (rho / rhoMax);
        setColor(sp, col, rho < 1 ? 0.35 : 0);
        spawnPolar(ctx, rho, th);
      }
    }
    // Hub stream: keeps the centre of the corridor lethal.
    if ((c & 1) === 0) {
      sp.r0 = 0; sp.size = 1.2;
      setColor(sp, COL.gold, 0.25);
      spawnPolar(ctx, 0, 0);
    }
    // Fewer emissions per arm when there are three arms (keeps the bullet budget).
    return 1 / (lerp(3.6, 5.2, I) * d * (this.arms === 3 ? 0.72 : 1));
  }
}

/* ------------------------------------------------- 花弁の開花 petal bloom */

/**
 * Cross-section: rose petals r = R·cos(P/2·u) arriving as nested layers (R growing = opening,
 * shrinking = closing). Every bloom is rotated half a petal, so the safe channels between
 * petals become the next petals — slide over one channel per bloom.
 */
class PetalBloom extends Emitter {
  private readonly P: number;
  private readonly psi0: number;
  private bloom = 0;
  private layer = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.1);
    this.P = 4 + Math.round(this.I * 2);
    this.psi0 = this.rng() * TAU;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, P = this.P;
    // Low quality drops one layer per bloom (plus wider spacing below).
    const L = ctx.density < 0.7 ? 4 : 5;
    const opening = (this.bloom & 1) === 0;
    const li = opening ? this.layer : L - 1 - this.layer;
    const f = li / (L - 1);
    const R = lerp(0.95, 4.85, f);
    const psi = this.psi0 + this.bloom * (Math.PI / P) + this.bloom * 0.07;
    const spacing = lerp(0.54, 0.62, I) / Math.sqrt(ctx.density);
    sp.cx = 0; sp.cy = 0;
    sp.om = (opening ? 1 : -1) * 0.5;
    sp.ep = 1.2;
    sp.accel = 2.2;
    const half = Math.PI / P;
    // Alternate saturated layer colours (mixing toward white blows out under additive blending).
    const layerCol = li & 1 ? COL.purple : opening ? COL.pink : COL.cyan;
    for (let m = 0; m < P; m++) {
      const pc = psi + (TAU * m) / P;
      // March along the petal outline with roughly constant arc-length spacing.
      let u = -half;
      while (u <= half) {
        const s = Math.cos((P / 2) * u);
        const rho = R * s;
        if (rho > 0.55) {
          const th = pc + u;
          const x = rho * Math.cos(th), y = rho * Math.sin(th);
          if (inClip(x, y)) {
            const tip = s > 0.97;
            sp.r0 = 0.42 * rho + 0.3;
            sp.size = tip ? 1.3 : 0.95 + 0.1 * f;
            if (tip) setColor(sp, COL.gold, 0.1);
            else mixColor(sp, layerCol, COL.gold, s > 0.85 ? 0.35 : 0);
            spawnPolar(ctx, rho, th);
          }
        }
        const dr = R * (P / 2) * Math.sin((P / 2) * u);
        const ds = Math.sqrt(rho * rho + dr * dr);
        u += spacing / Math.max(ds, 0.6);
      }
    }
    // One centre bullet per layer: the bloom's heart.
    sp.r0 = 0; sp.size = 1.1;
    setColor(sp, COL.gold);
    spawnPolar(ctx, 0, 0);

    this.layer++;
    if (this.layer < L) return 0.115 * (5 - 1) / (L - 1);
    this.layer = 0;
    this.bloom++;
    return lerp(2.4, 1.75, I) - 0.115 * 4;
  }
}

/* ------------------------------------------------- 波紋リング ripple rings */

/**
 * Cross-section: a wave of concentric rings (inner-first or outer-first ripple) that covers
 * the field, with 1–2 curved radial channels cut through every ring of radius >= ~1.
 * Gap edges are gold so the channel reads at a glance; the next wave turns the channels.
 */
class RippleRing extends Emitter {
  private gapAngle: number;
  private wave = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.15);
    this.gapAngle = this.rng() * TAU;
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const gaps = rng() < lerp(0.8, 0.25, I) ? 2 : 1;
    if (this.wave > 0) {
      const turn = (0.9 + rng() * 1.0) * (rng() < 0.5 ? -1 : 1);
      this.gapAngle += turn;
    }
    const g0 = this.gapAngle;
    const curve = (rng() - 0.5) * 0.5;
    const width = lerp(1.55, 1.2, I);
    const dR = 0.65 / Math.sqrt(ctx.density);
    const rOff = rng() * dR;
    const outward = (this.wave & 1) === 0;
    const spacing = 0.58 / Math.sqrt(ctx.density);
    sp.cx = (rng() - 0.5) * 0.6;
    sp.cy = (rng() - 0.5) * 0.8;
    sp.ep = 1;
    sp.accel = 2.2;
    const K = Math.ceil((4.75 - rOff) / dR);
    for (let k = 0; k < K; k++) {
      const R = rOff + k * dR;
      if (R < 0.28) continue;
      sp.T = this.flightT + (outward ? k : K - 1 - k) * 0.05;
      sp.om = (k & 1 ? 1 : -1) * 0.32;
      sp.r0 = 0.28 * R + 0.25;
      const n = Math.max(4, Math.round((TAU * R) / spacing));
      const base = (k & 1) * (Math.PI / n) + te * 0.1;
      const ringCol = k & 1 ? COL.purple : COL.cyan;
      for (let j = 0; j < n; j++) {
        const th = base + (TAU * j) / n;
        const x = sp.cx + R * Math.cos(th), y = sp.cy + R * Math.sin(th);
        if (!inClip(x, y)) continue;
        // Distance (arc length) to the nearest channel centre line.
        let edge = 99;
        if (R >= 0.95) {
          for (let g = 0; g < gaps; g++) {
            const ga = g0 + g * Math.PI + curve * R;
            const dist = Math.abs(wrapPi(th - ga)) * R;
            if (dist < edge) edge = dist;
          }
        }
        if (edge < width * 0.5) continue;
        const isEdge = edge < width * 0.5 + spacing;
        sp.size = isEdge ? 1.3 : k & 1 ? 0.95 : 1.05;
        if (isEdge) setColor(sp, COL.gold, 0.15);
        else setColor(sp, ringCol);
        spawnPolar(ctx, R, th);
      }
    }
    // Heart of the ripple.
    sp.T = this.flightT + (outward ? 0 : K - 1) * 0.05;
    sp.r0 = 0; sp.size = 1.2; sp.om = 0;
    setColor(sp, COL.white);
    spawnPolar(ctx, 0, 0);
    this.wave++;
    return lerp(1.55, 1.0, I);
  }
}

/* ------------------------------------------------- 星座の雨 constellation rain */

const CURVE_N = 240;
const curveX = new Float32Array(CURVE_N);
const curveY = new Float32Array(CURVE_N);
const knotX = new Float32Array(5);
const knotY = new Float32Array(5);
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const LISSA = [1, 2, 2, 1, 1, 3, 3, 2, 2, 3];

/**
 * Cross-section: one (or two) smooth curves per sheet — Lissajous arcs, splines through
 * scattered stars, spiral arms — stamped onto the plane and drawn progressively along their
 * length. Gold "stars" sit on the curve; everything off the curve is safe for that sheet.
 */
class ConstellationRain extends Emitter {
  private sheet = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.2);
  }

  private buildCurve(kind: number): void {
    const rng = this.rng;
    const W = FIELD.halfW + 0.2, H = FIELD.halfH + 0.2;
    if (kind === 0) {
      // Lissajous arc
      const p = Math.floor(rng() * 5) * 2;
      const a = LISSA[p], b = LISSA[p + 1];
      const ph = rng() * TAU, s0 = rng() * TAU;
      const span = TAU * (0.45 + rng() * 0.25);
      for (let i = 0; i < CURVE_N; i++) {
        const s = s0 + (span * i) / (CURVE_N - 1);
        curveX[i] = W * 0.92 * Math.sin(a * s + ph);
        curveY[i] = H * 0.92 * Math.sin(b * s);
      }
    } else if (kind === 1) {
      // Catmull-Rom spline through 5 stars zig-zagging down (or across) the field.
      const px = knotX, py = knotY;
      const vertical = rng() < 0.6;
      for (let k = 0; k < 5; k++) {
        const along = -1 + (2 * k) / 4;
        const across = k === 2 ? (rng() - 0.5) * 0.3 : (k & 1 ? 1 : -1) * (0.3 + rng() * 0.6);
        if (vertical) { px[k] = across * W; py[k] = along * H * 0.95; }
        else { px[k] = along * W * 0.95; py[k] = across * H * 0.8; }
      }
      const seg = (CURVE_N - 1) / 4;
      for (let i = 0; i < CURVE_N; i++) {
        const fpos = Math.min(3.9999, i / seg);
        const k = Math.floor(fpos), t = fpos - k;
        const k0 = Math.max(0, k - 1), k2 = Math.min(4, k + 1), k3 = Math.min(4, k + 2);
        curveX[i] = catmull(px[k0], px[k], px[k2], px[k3], t);
        curveY[i] = catmull(py[k0], py[k], py[k2], py[k3], t);
      }
    } else {
      // Spiral arm around an off-centre star.
      const cx = (rng() - 0.5) * W, cy = (rng() - 0.5) * H;
      const dir = rng() < 0.5 ? -1 : 1, a0 = rng() * TAU;
      for (let i = 0; i < CURVE_N; i++) {
        const s = i / (CURVE_N - 1);
        const r = 0.35 + s * 4.2;
        const th = a0 + dir * s * 4.4;
        curveX[i] = cx + r * Math.cos(th);
        curveY[i] = cy + r * Math.sin(th) * 1.25;
      }
    }
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const curves = I >= 0.4 ? 2 : 1;
    const spacing = 0.42 / Math.sqrt(ctx.density);
    const maxLen = lerp(15, 21, I) * Math.sqrt(ctx.density);
    for (let c = 0; c < curves; c++) {
      this.buildCurve(Math.floor(rng() * 3));
      const spin = (rng() - 0.5) * 0.9;
      const tint = (this.sheet + c) % 3;
      const lineCol = tint === 0 ? COL.cyan : tint === 1 ? COL.pink : COL.purple;
      sp.cx = 0; sp.cy = 0; sp.ep = 1.2; sp.accel = 2.0;
      let acc = spacing, len = 0, idx = 0;
      for (let i = 1; i < CURVE_N && len < maxLen; i++) {
        const dx = curveX[i] - curveX[i - 1], dy = curveY[i] - curveY[i - 1];
        const segLen = Math.sqrt(dx * dx + dy * dy);
        acc += segLen;
        len += segLen;
        if (acc < spacing) continue;
        acc = 0;
        const x = curveX[i], y = curveY[i];
        if (!inClip(x, y)) continue;
        const star = idx % 6 === 0;
        idx++;
        // Drawn along its length: later points arrive a little later.
        sp.T = this.flightT - 0.15 + (len / maxLen) * 0.4;
        sp.om = spin;
        const dist = Math.sqrt(x * x + y * y);
        sp.r0 = 0.22 * dist + 0.2;
        sp.size = star ? 1.4 : 0.9;
        if (star) setColor(sp, COL.gold, 0.3);
        else setColor(sp, lineCol, 0.1);
        spawnAt(ctx, x, y);
      }
    }
    this.sheet++;
    return lerp(1.05, 0.62, I);
  }
}

/* ------------------------------------------------- aimed burst */

/** Small fan of 3–5 bullets aimed at the player's last known position. */
class AimedBurst extends Emitter {
  constructor(opts: PatternOptions) {
    super(opts, 0.25);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    // Odd count so the centre bullet is aimed straight at the player.
    const n = I < 0.45 || ctx.density < 0.7 ? 3 : 5;
    const tx = Math.max(-FIELD.halfW, Math.min(FIELD.halfW, ctx.px));
    const ty = Math.max(-FIELD.halfH, Math.min(FIELD.halfH, ctx.py));
    // Fan line perpendicular to the emitter->player direction on screen.
    let ex = tx - sp.ox, ey = ty - sp.oy;
    const el = Math.sqrt(ex * ex + ey * ey);
    if (el < 0.5) { ex = 0; ey = 1; } else { ex /= el; ey /= el; }
    const fx = -ey, fy = ex;
    const gap = lerp(0.68, 0.56, I);
    sp.T = lerp(3.3, 2.8, I);
    sp.accel = 1.7;
    sp.r0 = 0; sp.ep = 1; sp.om = 0;
    sp.size = 1.15;
    for (let j = 0; j < n; j++) {
      const o = (j - (n - 1) / 2) * gap;
      sp.cx = tx + fx * o;
      sp.cy = ty + fy * o;
      setColor(sp, j === (n - 1) / 2 ? COL.gold : COL.pink, 0.1);
      spawnPolar(ctx, 0, 0);
    }
    return lerp(1.45, 0.8, I);
  }
}

/* ------------------------------------------------- 胡蝶の羽ばたき wing sweep (mid-boss) */

/**
 * Cross-section: a mirrored pair of curved "wing edges" — vertical walls of bullets — that
 * sweep across the field, alternately closing (edges -> centre) and opening (centre -> edges),
 * like a butterfly's wingbeat. Every wall has one gap (gold edges) that drifts slowly along
 * the wall during the sweep; each beat the player threads exactly one gap on their side.
 * At higher intensity the beats are quicker and the wing edges ripple.
 */
class WingSweep extends Emitter {
  private beat = 0;
  private step = 0;
  private readonly steps: number;
  private gapL = 0;
  private gapR = 0;
  private driftL = 0;
  private driftR = 0;
  private bow = 0;
  private ripple = 0;
  private lattice = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.3);
    this.steps = 11;
    this.newBeat();
  }

  private newBeat(): void {
    const rng = this.rng;
    const H = FIELD.halfH * 0.62;
    this.gapL = (rng() * 2 - 1) * H;
    // Keep the two gaps apart vertically so the wings never look identical.
    this.gapR = (rng() * 2 - 1) * H;
    if (Math.abs(this.gapR - this.gapL) < 1.2) this.gapR = this.gapL + (this.gapL > 0 ? -1.8 : 1.8);
    const dmax = lerp(0.9, 1.4, this.I);
    this.driftL = (rng() * 2 - 1) * dmax;
    this.driftR = (rng() * 2 - 1) * dmax;
    // Keep the drifting gap inside the field.
    const lim = FIELD.halfH - 0.9;
    if (Math.abs(this.gapL + this.driftL) > lim) this.driftL = -this.driftL;
    if (Math.abs(this.gapR + this.driftR) > lim) this.driftR = -this.driftR;
    this.bow = (0.35 + rng() * 0.35) * (rng() < 0.5 ? -1 : 1);
    this.ripple = rng() * TAU;
    // Shift the bullet lattice along the wall every beat so no fixed slot stays open.
    this.lattice = rng() - 0.5;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const closing = (this.beat & 1) === 0;
    const u = this.step / (this.steps - 1);
    const W0 = FIELD.halfW + 0.35;
    const W = W0 * (closing ? 1 - u : u);
    // Walls only thin out a little at low quality (they must stay walls).
    const spacing = 0.52 / Math.sqrt(Math.sqrt(ctx.density));
    const gapW = lerp(1.5, 1.3, I);
    const amp = I >= 0.5 ? lerp(0.0, 0.5, (I - 0.5) * 2) + 0.15 : 0;
    const k = W / W0; // the edge curve flattens into a straight line at the centre
    const H = FIELD.halfH;
    sp.cx = 0; sp.cy = 0; sp.ep = 1.1; sp.accel = 2.1; sp.om = 0;
    const merged = W < 0.05;
    for (let side = -1; side <= 1; side += 2) {
      if (merged && side > 0) break;
      const gy = side < 0 ? this.gapL + this.driftL * u : this.gapR + this.driftR * u;
      const col = side < 0 ? COL.cyan : COL.purple;
      const n = Math.floor((2 * CLIP_Y) / spacing);
      const y0 = -((n - 1) * spacing) / 2 + this.lattice * spacing;
      for (let j = 0; j < n; j++) {
        const y = y0 + j * spacing;
        const q = (y / H) * (y / H);
        const x = side * (W + k * (this.bow * (q - 0.35) + amp * Math.sin(y * 1.6 + this.ripple)));
        if (!inClip(x, y)) continue;
        // The merged centre line (closing end / opening start) keeps the left wing's gap.
        const edge = Math.abs(y - gy);
        if (edge < gapW * 0.5) continue;
        const isEdge = edge < gapW * 0.5 + spacing;
        sp.T = this.flightT;
        sp.r0 = 0.5 * Math.sqrt(x * x + y * y) + 1.4;
        sp.size = isEdge ? 1.3 : 1.0;
        if (isEdge) setColor(sp, COL.gold);
        else if (j === 0 || j === n - 1) setColor(sp, COL.pink);
        else setColor(sp, col);
        spawnAt(ctx, x, y);
      }
    }
    const sweepT = lerp(1.65, 1.2, I);
    this.step++;
    if (this.step < this.steps) return sweepT / (this.steps - 1);
    this.step = 0;
    this.beat++;
    this.newBeat();
    return lerp(1.05, 0.6, I);
  }
}

export function createEmitter(id: PatternId, opts: PatternOptions): Emitter {
  switch (id) {
    case 'spiralCorridor': return new SpiralCorridor(opts);
    case 'petalBloom': return new PetalBloom(opts);
    case 'rippleRing': return new RippleRing(opts);
    case 'constellationRain': return new ConstellationRain(opts);
    case 'aimedBurst': return new AimedBurst(opts);
    case 'wingSweep': return new WingSweep(opts);
  }
}
