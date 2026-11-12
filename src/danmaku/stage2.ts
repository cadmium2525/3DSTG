/**
 * Stage 2 「黄昏の境界」 emitters (registered with `registerEmitter`, imported by the stage-2 module).
 * Warm palette (amber / rose / gold / sun-white) plus "shadow" bullets: a saturated violet whose
 * renderer rim keeps them readable on the dusk background (the core is always bright).
 *
 *   mothDust        光蛾の鱗粉     small aimed fan + a straddling follow-up (光蛾 moth)
 *   wispSpread      鬼火の散弾     curved aimed spread of shadow bullets (影の鬼火 wisp)
 *   shardRing       夕陽の欠片     one / two small rings where a sunset shard bursts
 *   lanternDrift    灯籠流し       slow lanterns that burst mid-flight into slow rings (mid-boss)
 *   flickerCurtain  揺らぐ灯       wavering curtains; lit and unlit waves land in each other's gaps (mid-boss)
 *   coronaRays      日輪の光条     rotating corona spokes, the rotation breathes and reverses (boss)
 *   twilightLattice 黄昏の格子     light lattice / shadow lattice sheets, each on the other's holes (boss)
 *   crescentSweep   蝕の三日月     filled crescents orbiting the field, waxing and waning (boss)
 *   totalEclipse    皆既日蝕       a moon disc lands on the player, then the corona rings burst outward (boss)
 */
import { CAMERA, FIELD } from '../core/config';
import type { PatternId, PatternOptions } from '../core/types';
import { COL, Emitter, registerEmitter, type EmitCtx } from './patterns';
import type { SpawnParams } from './pool';

/* ---------------------------------------------------------------- helpers */

type RGB = readonly [number, number, number];
const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** Stage-2 bullet colours. */
export const DUSK_COL = {
  amber: rgb(0xffa040),
  ember: rgb(0xff7a36),
  rose: rgb(0xff6f8a),
  gold: COL.gold,
  sun: rgb(0xffe2a0),
  /** Shadow bullets: violet body, the renderer adds the white core + a violet rim. */
  shadow: rgb(0x8a5cff),
  shadowDeep: rgb(0x6a3ef0),
} as const;
const C = DUSK_COL;

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const CLIP_X = FIELD.halfW + 0.45;
const CLIP_Y = FIELD.halfH + 0.45;
const inClip = (x: number, y: number) => Math.abs(x) <= CLIP_X && Math.abs(y) <= CLIP_Y;
const clampX = (x: number, m = 0) => Math.max(-FIELD.halfW + m, Math.min(FIELD.halfW - m, x));
const clampY = (y: number, m = 0) => Math.max(-FIELD.halfH + m, Math.min(FIELD.halfH - m, y));
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
function spawnPolar(ctx: EmitCtx, rho: number, th: number): number {
  ctx.sp.r1 = rho;
  ctx.sp.th1 = th;
  return ctx.pool.spawn(ctx.sp);
}
/** Arrival point (x, y) on the play plane, polar about the current axis end (sp.cx, sp.cy). */
function spawnAt(ctx: EmitCtx, x: number, y: number): number {
  const sp = ctx.sp;
  const dx = x - sp.cx, dy = y - sp.cy;
  sp.r1 = Math.sqrt(dx * dx + dy * dy);
  sp.th1 = Math.atan2(dy, dx);
  return ctx.pool.spawn(sp);
}
/** The emitter's position projected onto the play plane as seen from the camera. */
function projX(sp: SpawnParams): number {
  return sp.ox * (CAMERA.distance / (CAMERA.distance - sp.oz));
}
function projY(sp: SpawnParams): number {
  return sp.oy * (CAMERA.distance / (CAMERA.distance - sp.oz));
}

/* ------------------------------------------------- 光蛾の鱗粉 moth dust (enemy) */

/**
 * Cross-section: a 3-way fan aimed at the player, then (0.28 s later) a pair re-aimed at her new
 * position but straddling it (4 at higher intensity) — the moth's fluttering double beat. Moving
 * off the first fan and then holding still is the answer.
 */
class MothDust extends Emitter {
  private shot = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.2);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const tx = clampX(ctx.px), ty = clampY(ctx.py);
    let ex = tx - projX(sp), ey = ty - projY(sp);
    const el = Math.sqrt(ex * ex + ey * ey);
    if (el < 0.5) { ex = 0; ey = 1; } else { ex /= el; ey /= el; }
    const fx = -ey, fy = ex;
    sp.T = lerp(3.4, 2.95, I);
    sp.accel = 1.7;
    sp.r0 = 0; sp.ep = 1; sp.om = 0;
    sp.size = 1.05;
    const gap = lerp(0.7, 0.6, I);
    if (this.shot === 0) {
      for (let j = -1; j <= 1; j++) {
        sp.cx = tx + fx * j * gap;
        sp.cy = ty + fy * j * gap;
        setColor(sp, j === 0 ? C.rose : C.amber, 0.08);
        spawnPolar(ctx, 0, 0);
      }
      this.shot = 1;
      return 0.28;
    }
    const n = I >= 0.55 && ctx.density >= 0.7 ? 4 : 2;
    for (let j = 0; j < n; j++) {
      const o = (j - (n - 1) / 2) * gap * 0.95;
      sp.cx = tx + fx * o;
      sp.cy = ty + fy * o;
      sp.size = 0.95;
      setColor(sp, C.rose, 0.15);
      spawnPolar(ctx, 0, 0);
    }
    this.shot = 0;
    return 1e3;
  }
}

/* ------------------------------------------------- 鬼火の散弾 wisp spread (enemy) */

/**
 * Cross-section: a 5-way (7-way) fan centred on the player, bowed back toward the wisp, of
 * shadow bullets with one pale centre bullet. Step sideways past the fan's end or through a gap.
 */
class WispSpread extends Emitter {
  constructor(opts: PatternOptions) {
    super(opts, 0.15);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const tx = clampX(ctx.px), ty = clampY(ctx.py);
    let ex = tx - projX(sp), ey = ty - projY(sp);
    const el = Math.sqrt(ex * ex + ey * ey);
    if (el < 0.5) { ex = 0; ey = 1; } else { ex /= el; ey /= el; }
    const fx = -ey, fy = ex;
    const n = I >= 0.5 && ctx.density >= 0.7 ? 7 : 5;
    const gap = lerp(0.66, 0.58, I);
    const bow = 0.14;
    sp.T = lerp(3.7, 3.2, I);
    sp.accel = 1.6;
    sp.r0 = 0.15; sp.ep = 0.8; sp.om = 0;
    for (let j = 0; j < n; j++) {
      const o = (j - (n - 1) / 2) * gap;
      const back = -bow * o * o;
      sp.cx = tx + fx * o + ex * back;
      sp.cy = ty + fy * o + ey * back;
      const mid = j === (n - 1) / 2;
      sp.size = mid ? 1.2 : 1.1;
      setColor(sp, mid ? C.shadow : C.shadowDeep, mid ? 0.4 : 0);
      spawnPolar(ctx, 0, 0);
    }
    return 1e3;
  }
}

/* ------------------------------------------------- 夕陽の欠片 shard ring (enemy) */

/**
 * Cross-section: one ring (two at higher intensity: the second wider, half a step turned and a
 * little later) centred between the shard's on-screen position and the player. Wide gaps.
 */
class ShardRing extends Emitter {
  constructor(opts: PatternOptions) {
    super(opts, 0.05);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    // Centred a ring-radius-ish away from the player, on the shard's side: the ring line runs
    // near her about half the time.
    let dx = projX(sp) - ctx.px, dy = projY(sp) - ctx.py;
    const dl = Math.sqrt(dx * dx + dy * dy);
    if (dl < 0.3) { const a = this.rng() * TAU; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= dl; dy /= dl; }
    const off = lerp(0.4, 1.9, this.rng());
    const cx = clampX(ctx.px + dx * off);
    const cy = clampY(ctx.py + dy * off);
    const n = Math.max(8, Math.round(lerp(10, 13, I) * Math.sqrt(ctx.density)));
    const rings = I >= 0.5 ? 2 : 1;
    const ph = this.rng() * TAU;
    const dir = this.rng() < 0.5 ? -1 : 1;
    sp.cx = cx; sp.cy = cy;
    sp.r0 = 0.15; sp.ep = 0.6; sp.accel = 1.8;
    for (let k = 0; k < rings; k++) {
      const R = lerp(1.5, 1.65, I) + k * 0.85;
      sp.T = lerp(3.9, 3.4, I) + k * 0.35;
      sp.om = dir * 0.4;
      for (let j = 0; j < n; j++) {
        const th = ph + (j + k * 0.5) * (TAU / n);
        const x = cx + R * Math.cos(th), y = cy + R * Math.sin(th);
        if (!inClip(x, y)) continue;
        sp.size = j % 2 === 0 ? 1.1 : 1.0;
        setColor(sp, k === 0 ? (j % 2 === 0 ? C.ember : C.gold) : C.amber, 0.05);
        spawnPolar(ctx, R, th);
      }
    }
    return 1e3;
  }
}

/* ------------------------------------------------- 灯籠流し lantern drift (mid-boss) */

const MAX_PENDING = 24;

/**
 * Cross-section: each lantern is one big slow bullet landing near the player; at ~42 % of its
 * flight it bursts and a slow ring blooms out of it, landing around the lantern together with it.
 * Rings are sparse (gaps ≈ 0.55 wide); stand clear of the ring line or slip through.
 * In 3D the lanterns visibly drift in from the mid-boss's little orbiting lanterns.
 */
class LanternDrift extends Emitter {
  private nextRelease: number;
  private side = 1;
  private readonly bt = new Float32Array(MAX_PENDING);
  private readonly bx = new Float32Array(MAX_PENDING);
  private readonly by = new Float32Array(MAX_PENDING);
  private readonly bz = new Float32Array(MAX_PENDING);
  private readonly bcx = new Float32Array(MAX_PENDING);
  private readonly bcy = new Float32Array(MAX_PENDING);
  private readonly bT = new Float32Array(MAX_PENDING);
  private nb = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.4);
    this.nextRelease = 0.4;
  }

  private release(te: number, ctx: EmitCtx): void {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const count = I >= 0.55 ? 2 : 1;
    const ox = sp.ox, oy = sp.oy, oz = sp.oz;
    for (let c = 0; c < count; c++) {
      this.side = -this.side;
      sp.ox = ox + this.side * 3.2;
      sp.oy = oy + 1.2;
      sp.oz = oz;
      // The first lantern drifts onto the player (step off it, stay inside its ring or leave);
      // the second lands a ring-radius or so away, so its ring sweeps past her.
      const reach = c === 0 ? rng() * 0.45 : lerp(1.5, 2.6, rng());
      const a = rng() * TAU;
      const cx = clampX(ctx.px + Math.cos(a) * reach, 0.3);
      const cy = clampY(ctx.py + Math.sin(a) * reach, 0.3);
      const T = lerp(5.6, 5.0, I);
      sp.cx = cx; sp.cy = cy;
      sp.r0 = 0; sp.ep = 1; sp.om = 0;
      sp.T = T; sp.accel = 1;
      sp.size = 2.0;
      setColor(sp, C.sun, 0.25);
      spawnPolar(ctx, 0, 0);
      // Schedule the burst (the lantern was pre-aged by sp.age).
      if (this.nb < MAX_PENDING) {
        const ab = T * 0.42;
        const u = ab / T;
        const D = Math.max(0.5, FIELD.planeZ - sp.oz);
        const i = this.nb++;
        this.bt[i] = te + ab - sp.age;
        this.bx[i] = sp.ox + (cx - sp.ox) * u;
        this.by[i] = sp.oy + (cy - sp.oy) * u;
        this.bz[i] = FIELD.planeZ - D + D * u;
        this.bcx[i] = cx;
        this.bcy[i] = cy;
        this.bT[i] = T - ab;
      }
    }
    sp.ox = ox; sp.oy = oy; sp.oz = oz;
  }

  private burst(i: number, ctx: EmitCtx): void {
    const sp = ctx.sp;
    const I = this.I;
    sp.ox = this.bx[i]; sp.oy = this.by[i]; sp.oz = this.bz[i];
    const cx = this.bcx[i], cy = this.bcy[i];
    sp.cx = cx; sp.cy = cy;
    sp.r0 = 0.25; sp.ep = 0.5; sp.accel = 1;
    sp.T = this.bT[i];
    sp.om = (this.rng() < 0.5 ? -1 : 1) * 0.35;
    const n = Math.max(9, Math.round(lerp(11, 14, I) * Math.sqrt(ctx.density)));
    const R = lerp(1.75, 1.95, I);
    const ph = this.rng() * TAU;
    for (let j = 0; j < n; j++) {
      const th = ph + (j * TAU) / n;
      const x = cx + R * Math.cos(th), y = cy + R * Math.sin(th);
      if (!inClip(x, y)) continue;
      sp.size = 1.0;
      setColor(sp, j % 2 === 0 ? C.amber : C.rose, 0.05);
      spawnPolar(ctx, R, th);
    }
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const due = te + 1e-4;
    if (this.nextRelease <= due) {
      this.release(te, ctx);
      this.nextRelease = te + lerp(1.35, 0.95, this.I);
    }
    for (let i = this.nb - 1; i >= 0; i--) {
      if (this.bt[i] > due) continue;
      this.burst(i, ctx);
      const last = --this.nb;
      this.bt[i] = this.bt[last]; this.bx[i] = this.bx[last]; this.by[i] = this.by[last]; this.bz[i] = this.bz[last];
      this.bcx[i] = this.bcx[last]; this.bcy[i] = this.bcy[last]; this.bT[i] = this.bT[last];
    }
    let nxt = this.nextRelease;
    for (let i = 0; i < this.nb; i++) if (this.bt[i] < nxt) nxt = this.bt[i];
    return nxt - te;
  }
}

/* ------------------------------------------------- 揺らぐ灯 flickering curtains (mid-boss) */

/**
 * Cross-section: vertical curtains of bullets across the field (spacing S), falling top-first and
 * wavering sideways. Waves alternate lit (amber / gold) and unlit (shadow); each wave lands on the
 * previous wave's gaps, so shift half a spacing every beat — or slip through the one "unlit" hole
 * (rose edges) every curtain has.
 */
class FlickerCurtain extends Emitter {
  private wave = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.3);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const S = lerp(1.8, 1.5, I);
    const lit = (this.wave & 1) === 0;
    // Lit waves put a curtain on the player's x, unlit waves put their gaps there.
    const shift = clampX(ctx.px) + CLIP_X + ((this.wave & 1) * 0.5 + (rng() - 0.5) * 0.08) * S;
    const x0 = -CLIP_X + (((shift % S) + S) % S);
    const spacing = 0.5 / Math.sqrt(Math.sqrt(ctx.density));
    const amp = lerp(0.16, 0.3, I);
    const ph = rng() * TAU;
    const holeH = lerp(1.35, 1.2, I);
    const n = Math.floor((2 * CLIP_Y) / spacing) + 1;
    const y0 = -CLIP_Y + (rng() * spacing) * 0.5;
    sp.ep = 1.1; sp.accel = 2.0; sp.om = 0; sp.cx = 0; sp.cy = 0;
    for (let x = x0; x <= CLIP_X; x += S) {
      const holeY = (rng() * 2 - 1) * FIELD.halfH * 0.7;
      for (let j = 0; j < n; j++) {
        const y = y0 + j * spacing;
        const edge = Math.abs(y - holeY);
        if (edge < holeH * 0.5) continue;
        const xx = x + amp * Math.sin(y * 1.25 + ph + x * 0.7);
        if (!inClip(xx, y)) continue;
        const isEdge = edge < holeH * 0.5 + spacing;
        sp.T = this.flightT + ((CLIP_Y - y) / (2 * CLIP_Y)) * 0.4;
        sp.r0 = 0.45 * Math.sqrt(xx * xx + y * y) + 1.0;
        sp.size = isEdge ? 1.25 : 1.0;
        if (lit) setColor(sp, isEdge ? C.rose : j % 3 === 0 ? C.gold : C.amber, isEdge ? 0.1 : 0);
        else setColor(sp, isEdge ? C.rose : C.shadow, isEdge ? 0.1 : 0);
        spawnAt(ctx, xx, y);
      }
    }
    this.wave++;
    return lerp(1.25, 0.98, I);
  }
}

/* ------------------------------------------------- 日輪の光条 corona rays (boss) */

/**
 * Cross-section: N straight spokes from a slowly wandering hub (gold tips, sun-white roots) with
 * short rose spokes between them near the hub, emitted as pulses. The spoke angle turns steadily
 * one way while a slow swing on top makes it speed up, stall and turn back; ride a gap, away
 * from the lethal hub.
 */
class CoronaRays extends Emitter {
  private count = 0;
  private readonly N: number;
  private readonly phi0: number;
  private readonly dir: number;

  constructor(opts: PatternOptions) {
    super(opts, 0.15);
    this.N = this.I >= 0.55 ? 6 : 5;
    this.phi0 = this.rng() * TAU;
    this.dir = this.rng() < 0.5 ? -1 : 1;
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const d = Math.sqrt(ctx.density);
    const N = this.N;
    const phi = this.phi0 + this.dir * lerp(0.2, 0.3, I) * te + lerp(1.15, 1.5, I) * Math.sin(0.4 * te);
    const c = this.count++;
    sp.cx = 0.35 * Math.sin(te * 0.31 + this.phi0);
    sp.cy = 0.4 * Math.sin(te * 0.23 + 1.1);
    sp.om = -this.dir * 0.3;
    sp.ep = 1.15;
    sp.accel = 2.2;
    const step = 0.7 / d;
    const rMax = 5.6;
    for (let a = 0; a < N; a++) {
      const th = phi + (TAU * a) / N;
      for (let rho = 0.85 + (c & 1) * step * 0.5; rho <= rMax; rho += step) {
        const x = sp.cx + rho * Math.cos(th), y = sp.cy + rho * Math.sin(th);
        if (!inClip(x, y)) continue;
        sp.r0 = 0.5 * rho + 0.9;
        sp.size = rho < 1.5 ? 1.2 : 1.0;
        if (rho > 3.9) setColor(sp, C.gold, 0.1);
        else mixColor(sp, C.sun, C.amber, Math.min(1, rho / 3.9));
        spawnPolar(ctx, rho, th);
      }
      // Short rose spoke between two long ones (every other pulse).
      if ((c & 1) === 0) {
        const th2 = th + Math.PI / N;
        for (let rho = 0.9; rho <= 2.1; rho += step) {
          sp.r0 = 0.5 * rho + 0.9;
          sp.size = 0.95;
          setColor(sp, C.rose, 0.05);
          spawnPolar(ctx, rho, th2);
        }
      }
    }
    // Hub: the sun's heart keeps the middle lethal.
    sp.r0 = 0; sp.size = 1.3; sp.om = 0;
    setColor(sp, C.sun, 0.3);
    spawnPolar(ctx, 0, 0);
    if ((c & 1) === 1) {
      for (let k = 0; k < 3; k++) {
        sp.size = 1.0;
        setColor(sp, C.gold, 0.1);
        spawnPolar(ctx, 0.42, phi + (k * TAU) / 3 + Math.PI / N);
      }
    }
    return 1 / (lerp(2.1, 2.5, I) * d);
  }
}

/* ------------------------------------------------- 黄昏の格子 twilight lattice (boss) */

/**
 * Cross-section: a square lattice (random rotation and offset) of light bullets lands as a sheet
 * sweeping across the field; the next sheet is the same lattice shifted by half a cell — shadow
 * bullets exactly on the light lattice's holes, slower and bigger. The edge midpoints are safe
 * for both sheets of a pair; every pair picks a new lattice.
 */
class TwilightLattice extends Emitter {
  private sheet = 0;
  private ang = 0;
  private offX = 0;
  private offY = 0;
  private sweep = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.3);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const L = lerp(1.5, 1.24, I) / Math.pow(ctx.density, 0.25);
    const shadow = (this.sheet & 1) === 1;
    if (!shadow) {
      this.ang = rng() * (Math.PI / 2);
      this.offX = rng() * L;
      this.offY = rng() * L;
      this.sweep = rng() * TAU;
    }
    const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
    const sc = Math.cos(this.sweep), ss = Math.sin(this.sweep);
    const half = shadow ? L / 2 : 0;
    sp.cx = 0; sp.cy = 0; sp.ep = 1; sp.accel = shadow ? 1.8 : 2.1;
    const M = Math.ceil(6.5 / L);
    for (let i = -M; i <= M; i++) {
      for (let j = -M; j <= M; j++) {
        const u = i * L + this.offX + half, v = j * L + this.offY + half;
        const x = u * ca - v * sa, y = u * sa + v * ca;
        if (!inClip(x, y)) continue;
        const sw = (x * sc + y * ss) / 5;
        sp.T = this.flightT + (shadow ? 0.3 : 0) + 0.28 * sw;
        sp.r0 = 0.3 * Math.sqrt(x * x + y * y) + 0.7;
        sp.om = shadow ? -0.25 : 0.25;
        if (shadow) {
          sp.size = 1.3;
          setColor(sp, (i + j) & 1 ? C.shadow : C.shadowDeep, 0);
        } else {
          sp.size = 1.0;
          setColor(sp, (i + j) & 1 ? C.gold : C.sun, 0);
        }
        spawnAt(ctx, x, y);
      }
    }
    this.sheet++;
    return lerp(0.92, 0.74, I);
  }
}

/* ------------------------------------------------- 蝕の三日月 eclipse crescents (boss) */

/**
 * Cross-section: filled crescents = disc(C1, R) minus disc(C2, R), C2 offset toward the field
 * centre. C1 orbits the centre, so each crescent covers the outer part of the field on one side
 * and sweeps on around; its thickness waxes and wanes sheet by sheet. Gold outer rim, rose inner
 * rim, shadow interior. Stay in the hollow (toward the centre / the opposite side).
 */
class CrescentSweep extends Emitter {
  private k = 0;
  private beta: number;
  private dir: number;

  constructor(opts: PatternOptions) {
    super(opts, 0.3);
    this.beta = this.rng() * TAU;
    this.dir = this.rng() < 0.5 ? -1 : 1;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const k = this.k++;
    if (k > 0 && k % 7 === 0) this.dir = -this.dir;
    if (k > 0) this.beta += this.dir * lerp(0.72, 0.86, I);
    const R = lerp(2.5, 2.75, I);
    const wax = 0.5 - 0.5 * Math.cos(k * 0.8);
    const dsep = R * lerp(0.5, 1.2, wax);
    const b = this.beta;
    const ub = Math.cos(b), vb = Math.sin(b);
    // C1 sits off-centre toward β; the bite C2 is taken from the outer side (β ± a swing), so the
    // crescent's body lies across the middle and the far side, its hollow opening outward at β.
    const c1x = 1.25 * ub, c1y = 1.5 * vb;
    const g = b + (k & 1 ? 0.55 : -0.55);
    const c2x = c1x + dsep * Math.cos(g), c2y = c1y + dsep * Math.sin(g);
    const dens = Math.sqrt(ctx.density);
    const rimS = 0.46 / dens;
    const fillS = lerp(0.7, 0.62, I) / dens;
    sp.cx = 0; sp.cy = 0; sp.ep = 1.1; sp.accel = 2.0;
    sp.om = this.dir * 0.2;
    const sweepT = (x: number, y: number) => {
      const a = wrapPi(Math.atan2(y - c1y, x - c1x) - b);
      return this.flightT + 0.32 * (a / Math.PI) * this.dir;
    };
    // Outer rim (gold): C1 circle outside disc C2.
    const nOut = Math.ceil((TAU * R) / rimS);
    for (let j = 0; j < nOut; j++) {
      const th = (j * TAU) / nOut;
      const x = c1x + R * Math.cos(th), y = c1y + R * Math.sin(th);
      const ex = x - c2x, ey = y - c2y;
      if (ex * ex + ey * ey <= R * R || !inClip(x, y)) continue;
      sp.T = sweepT(x, y);
      sp.r0 = 0.35 * Math.sqrt(x * x + y * y) + 0.8;
      sp.size = 1.15;
      setColor(sp, C.gold, 0.1);
      spawnAt(ctx, x, y);
    }
    // Inner rim (rose): C2 circle inside disc C1.
    for (let j = 0; j < nOut; j++) {
      const th = (j * TAU) / nOut;
      const x = c2x + R * Math.cos(th), y = c2y + R * Math.sin(th);
      const ex = x - c1x, ey = y - c1y;
      if (ex * ex + ey * ey >= R * R || !inClip(x, y)) continue;
      sp.T = sweepT(x, y);
      sp.r0 = 0.35 * Math.sqrt(x * x + y * y) + 0.8;
      sp.size = 1.05;
      setColor(sp, C.rose, 0.05);
      spawnAt(ctx, x, y);
    }
    // Interior fill (shadow), hex grid, kept off both rims.
    const m = fillS * 0.55;
    const rowH = fillS * 0.866;
    const rows = Math.ceil((2 * R) / rowH);
    for (let r = -rows; r <= rows; r++) {
      const y = c1y + r * rowH;
      const xo = (r & 1) * fillS * 0.5;
      for (let x = c1x - R + xo; x <= c1x + R; x += fillS) {
        const d1 = Math.hypot(x - c1x, y - c1y);
        const d2 = Math.hypot(x - c2x, y - c2y);
        if (d1 > R - m || d2 < R + m || !inClip(x, y)) continue;
        sp.T = sweepT(x, y);
        sp.r0 = 0.35 * Math.sqrt(x * x + y * y) + 0.8;
        sp.size = 1.0;
        setColor(sp, C.shadow, 0);
        spawnAt(ctx, x, y);
      }
    }
    return lerp(1.12, 0.92, I);
  }
}

/* ------------------------------------------------- 皆既日蝕 total eclipse (boss) */

/** Cycle timing of 皆既日蝕 (the boss dims the screen in sync with the moon's arrival). */
export function totalEclipseTiming(intensity: number): { first: number; period: number; moonT: number } {
  const I = Math.min(1, Math.max(0, intensity));
  return { first: 0.6, period: lerp(5.4, 4.7, I), moonT: lerp(4.2, 3.8, I) };
}

/**
 * Cross-section, every cycle: a moon disc of shadow bullets (violet rim) lands centred on the
 * player — leave it — then the corona bursts outward from it: rings every 0.6 units arriving
 * 0.13 s apart, each with three gaps (gold edges) that twist a little ring by ring, forming three
 * curved channels to stand in while the wave passes.
 */
class TotalEclipse extends Emitter {
  private readonly moonT: number;
  private readonly period: number;
  private g0: number;

  constructor(opts: PatternOptions) {
    const tm = totalEclipseTiming(opts.intensity ?? 0.5);
    super(opts, tm.first);
    this.moonT = tm.moonT;
    this.period = tm.period;
    this.g0 = this.rng() * TAU;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I, rng = this.rng;
    const dens = Math.sqrt(ctx.density);
    const mx = clampX(ctx.px, 0.4), my = clampY(ctx.py, 0.4);
    const Rm = 1.3;
    sp.cx = mx; sp.cy = my; sp.ep = 1; sp.accel = 1.9; sp.om = 0;
    // Moon: violet rim + deep shadow fill.
    sp.T = this.moonT;
    const nRim = Math.round(15 * dens);
    for (let j = 0; j < nRim; j++) {
      const th = (j * TAU) / nRim;
      const x = mx + Rm * Math.cos(th), y = my + Rm * Math.sin(th);
      if (!inClip(x, y)) continue;
      sp.r0 = 0.6; sp.size = 1.3;
      setColor(sp, C.shadow, 0.2);
      spawnPolar(ctx, Rm, th);
    }
    const fs = 0.62 / dens;
    for (let r = -2; r <= 2; r++) {
      const y = r * fs * 0.866;
      for (let x = -Rm + (r & 1) * fs * 0.5; x <= Rm; x += fs) {
        if (x * x + y * y > (Rm - 0.35) * (Rm - 0.35)) continue;
        if (!inClip(mx + x, my + y)) continue;
        sp.r0 = 0.3; sp.size = 1.05;
        setColor(sp, C.shadowDeep, 0);
        spawnAt(ctx, mx + x, my + y);
      }
    }
    // Corona burst.
    this.g0 += (0.8 + rng() * 0.9) * (rng() < 0.5 ? -1 : 1);
    const twist = (rng() < 0.5 ? -1 : 1) * lerp(0.08, 0.11, I);
    const gapW = lerp(1.4, 1.2, I);
    const spacing = 0.52 / dens;
    const G = 3;
    for (let k = 0; k < 10; k++) {
      const R = Rm + 0.5 + k * 0.6;
      sp.T = this.moonT + 0.25 + k * 0.13;
      sp.r0 = 0.25 * R + 0.3;
      sp.om = (k & 1 ? 1 : -1) * 0.25;
      const n = Math.max(6, Math.round((TAU * R) / spacing));
      const base = (k & 1) * (Math.PI / n);
      let any = false;
      for (let j = 0; j < n; j++) {
        const th = base + (j * TAU) / n;
        const x = mx + R * Math.cos(th), y = my + R * Math.sin(th);
        if (!inClip(x, y)) continue;
        any = true;
        let edge = 99;
        for (let g = 0; g < G; g++) {
          const ga = this.g0 + (g * TAU) / G + twist * k;
          const dd = Math.abs(wrapPi(th - ga)) * R;
          if (dd < edge) edge = dd;
        }
        if (edge < gapW * 0.5) continue;
        const isEdge = edge < gapW * 0.5 + spacing;
        sp.size = isEdge ? 1.25 : 1.0;
        if (isEdge) setColor(sp, C.sun, 0.2);
        else setColor(sp, k & 1 ? C.amber : C.rose, 0);
        spawnPolar(ctx, R, th);
      }
      if (!any && k > 2) break;
    }
    return this.period;
  }
}

/* ---------------------------------------------------------------- registry */

export const STAGE2_PATTERNS: PatternId[] = [
  'mothDust', 'wispSpread', 'shardRing', 'lanternDrift', 'flickerCurtain',
  'coronaRays', 'twilightLattice', 'crescentSweep', 'totalEclipse',
];

registerEmitter('mothDust', (o) => new MothDust(o));
registerEmitter('wispSpread', (o) => new WispSpread(o));
registerEmitter('shardRing', (o) => new ShardRing(o));
registerEmitter('lanternDrift', (o) => new LanternDrift(o));
registerEmitter('flickerCurtain', (o) => new FlickerCurtain(o));
registerEmitter('coronaRays', (o) => new CoronaRays(o));
registerEmitter('twilightLattice', (o) => new TwilightLattice(o));
registerEmitter('crescentSweep', (o) => new CrescentSweep(o));
registerEmitter('totalEclipse', (o) => new TotalEclipse(o));
