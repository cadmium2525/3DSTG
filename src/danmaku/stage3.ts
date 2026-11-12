/**
 * Stage 3 「深淵」 emitters (registered with `registerEmitter`, imported by src/game/stages/stage3).
 *
 * Most bullets here are "dark bullets" (SpawnParams.dark = 1): a near-black core inside a thin
 * glowing ring in the bullet colour (src/danmaku/render.ts), per the dark-stage readability
 * rules in docs/STAGES.md. Gap edges, hearts and the light half of the final spell stay normal
 * (bright core) bullets — the light accents that tell the player where to go.
 *
 * Every emitter is validated with the fairness bot (dev/stage3.html?fairness=1).
 */
import { CAMERA, FIELD } from '../core/config';
import type { PatternId, PatternOptions } from '../core/types';
import { COL, createEmitter, Emitter, registerEmitter, type EmitCtx } from './patterns';
import type { BulletPool } from './pool';

type RGB = readonly [number, number, number];

/** Rim colours of the shadow bullets (bright and saturated: the ring is all the player sees). */
export const SHADOW_COL = {
  violet: [0.66, 0.4, 1.0] as RGB,
  crimson: [1.0, 0.24, 0.42] as RGB,
  magenta: [1.0, 0.36, 0.86] as RGB,
  ember: [1.0, 0.52, 0.34] as RGB,
  pale: [0.84, 0.78, 1.0] as RGB,
  cyan: COL.cyan,
} as const;

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const CLIP_X = FIELD.halfW + 0.45;
const CLIP_Y = FIELD.halfH + 0.45;
const inClip = (x: number, y: number) => Math.abs(x) <= CLIP_X && Math.abs(y) <= CLIP_Y;
const wrapPi = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

function col(ctx: EmitCtx, c: RGB, dark: boolean, mixWhite = 0): void {
  const sp = ctx.sp;
  sp.r = lerp(c[0], 1, mixWhite);
  sp.g = lerp(c[1], 1, mixWhite);
  sp.b = lerp(c[2], 1, mixWhite);
  sp.dark = dark ? 1 : 0;
}

function spawnPolar(ctx: EmitCtx, rho: number, th: number): number {
  ctx.sp.r1 = rho;
  ctx.sp.th1 = th;
  return ctx.pool.spawn(ctx.sp);
}

function spawnAt(ctx: EmitCtx, x: number, y: number): number {
  const sp = ctx.sp;
  const dx = x - sp.cx, dy = y - sp.cy;
  sp.r1 = Math.sqrt(dx * dx + dy * dy);
  sp.th1 = Math.atan2(dy, dx);
  return ctx.pool.spawn(sp);
}

/** The emitter position seen from the camera, projected onto the play plane. */
function projX(ctx: EmitCtx): number {
  return ctx.sp.ox * (CAMERA.distance / (CAMERA.distance - ctx.sp.oz));
}
function projY(ctx: EmitCtx): number {
  return ctx.sp.oy * (CAMERA.distance / (CAMERA.distance - ctx.sp.oz));
}

/* ---------------------------------------------------------------- player tracking */

/** Last known heroine position, written by the 'shadowProbe' emitter (read by the shadow girl). */
export const SHADOW_TRACK = { x: 0, y: -0.8, seen: 0 };

/**
 * Base for the stage-3 emitters: resets the shared `dark` flag after every update (the scratch
 * SpawnParams is shared with every other emitter) and keeps a lagged estimate of the player.
 */
abstract class ShadowEmitter extends Emitter {
  protected lx = 0;
  protected ly = 0;
  private tracked = false;
  /** 1/s; 0 = no lag (exact position at each event). */
  protected lagRate = 1.2;

  update(dt: number, ctx: EmitCtx): void {
    if (!this.tracked) {
      this.lx = ctx.px;
      this.ly = ctx.py;
      this.tracked = true;
    } else {
      const k = 1 - Math.exp(-dt * this.lagRate);
      this.lx += (ctx.px - this.lx) * k;
      this.ly += (ctx.py - this.ly) * k;
    }
    super.update(dt, ctx);
    ctx.sp.dark = 0;
  }
}

/** Never fires: records where the heroine is (so the boss's light motes can fly to her). */
class ShadowProbe extends Emitter {
  constructor(opts: PatternOptions) {
    super(opts, 1e9);
  }
  update(dt: number, ctx: EmitCtx): void {
    if (this.stopped) return;
    this.t += dt;
    SHADOW_TRACK.x = ctx.px;
    SHADOW_TRACK.y = ctx.py;
    SHADOW_TRACK.seen++;
  }
  protected emit(): number {
    return 1e9;
  }
}

/* ---------------------------------------------------------------- 影の礫 shadow shot (enemy) */

/** Aimed fan of 3 (5 at higher intensity) dark bullets with a pale centre bullet. */
class ShadowShot extends ShadowEmitter {
  constructor(opts: PatternOptions) {
    super(opts, 0.25);
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const n = I < 0.45 || ctx.density < 0.7 ? 3 : 5;
    const tx = clamp(ctx.px, -FIELD.halfW, FIELD.halfW);
    const ty = clamp(ctx.py, -FIELD.halfH, FIELD.halfH);
    let ex = tx - projX(ctx), ey = ty - projY(ctx);
    const el = Math.sqrt(ex * ex + ey * ey);
    if (el < 0.5) { ex = 0; ey = 1; } else { ex /= el; ey /= el; }
    const fx = -ey, fy = ex;
    const gap = lerp(0.7, 0.58, I);
    sp.T = lerp(3.4, 2.9, I);
    sp.accel = 1.7;
    sp.r0 = 0; sp.ep = 1; sp.om = 0;
    sp.size = 1.15;
    for (let j = 0; j < n; j++) {
      const o = (j - (n - 1) / 2) * gap;
      sp.cx = tx + fx * o;
      sp.cy = ty + fy * o;
      const mid = j === (n - 1) / 2;
      col(ctx, mid ? SHADOW_COL.pale : SHADOW_COL.violet, true);
      spawnPolar(ctx, 0, 0);
    }
    return lerp(1.5, 0.85, I);
  }
}

/* ---------------------------------------------------------------- 影の手 shadow grasp (enemy) */

/**
 * Cross-section: a claw of 4 finger lines reaching in horizontally from the hand's edge of the
 * field around the player's height; the tips arrive last (the hand reaching). The gaps between
 * fingers are ~0.8 wide — slip between two fingers or stay beyond their reach.
 */
class ShadowGrasp extends ShadowEmitter {
  constructor(opts: PatternOptions) {
    super(opts, 0.2);
    this.lagRate = 0;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const ox = projX(ctx);
    const side = Math.abs(ox) > 0.3 ? Math.sign(ox) : this.rng() < 0.5 ? -1 : 1;
    const W = FIELD.halfW + 0.3;
    const fingers = 4;
    const pitch = lerp(1.12, 1.02, I);
    const y0 = clamp(ctx.py, -FIELD.halfH + 1, FIELD.halfH - 1) + (this.rng() - 0.5) * pitch;
    const reach = lerp(3.3, 4.0, I);
    const spacing = 0.4 / Math.sqrt(ctx.density);
    const curl = (this.rng() - 0.5) * 0.25;
    sp.cx = 0; sp.cy = 0; sp.ep = 1; sp.om = side * 0.4; sp.accel = 2;
    for (let f = 0; f < fingers; f++) {
      const fy = y0 + (f - (fingers - 1) / 2) * pitch;
      // Middle fingers reach a little further.
      const L = reach * (f === 0 || f === fingers - 1 ? 0.82 : 1);
      for (let s = 0; s <= L; s += spacing) {
        const u = s / L;
        const x = side * (W - s);
        const y = fy + curl * u * u * 3 + (fy - y0) * 0.12 * u; // fingers curl and splay a little
        if (!inClip(x, y)) continue;
        sp.T = this.flightT - 0.2 + u * 0.55;
        sp.r0 = 1.5;
        const tip = s + spacing > L;
        sp.size = tip ? 1.25 : 1.0;
        col(ctx, tip ? SHADOW_COL.pale : SHADOW_COL.crimson, !tip);
        spawnAt(ctx, x, y);
      }
    }
    return 1e3;
  }
}

/* ---------------------------------------------------------------- 影の花 shadow bloom (enemy) */

/**
 * Cross-section: stage 1's petal bloom in miniature and in shadow — a 4-petal rose (two layers,
 * opening) centred at the mirror image (x → −x) of the flower's on-screen position. The petal
 * tips are light (gold) bullets.
 */
class ShadowBloom extends ShadowEmitter {
  private layer = 0;
  private cx = 0;
  private cy = 0;
  private psi = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.15);
    this.lagRate = 0;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    if (this.layer === 0) {
      this.cx = clamp(-projX(ctx), -FIELD.halfW + 0.6, FIELD.halfW - 0.6);
      this.cy = clamp(projY(ctx) * 0.6, -FIELD.halfH + 0.8, FIELD.halfH - 0.8);
      this.psi = this.rng() * TAU;
    }
    const P = 4;
    const layers = I >= 0.56 ? 2 : 1;
    const R = this.layer === 0 ? lerp(1.3, 1.45, I) : lerp(2.2, 2.45, I);
    const spacing = 0.5 / Math.sqrt(ctx.density);
    sp.cx = this.cx; sp.cy = this.cy;
    sp.om = 0.45; sp.ep = 1.2; sp.accel = 2.1;
    sp.T = this.flightT;
    const half = Math.PI / P;
    const psi = this.psi + this.layer * half;
    for (let m = 0; m < P; m++) {
      const pc = psi + (TAU * m) / P;
      let u = -half;
      while (u <= half) {
        const s = Math.cos((P / 2) * u);
        const rho = R * s;
        if (rho > 0.5) {
          const th = pc + u;
          const x = this.cx + rho * Math.cos(th), y = this.cy + rho * Math.sin(th);
          if (inClip(x, y)) {
            const tip = s > 0.97;
            sp.r0 = 0.4 * rho + 0.3;
            sp.size = tip ? 1.25 : 1.0;
            col(ctx, tip ? COL.gold : SHADOW_COL.magenta, !tip, tip ? 0.1 : 0);
            spawnPolar(ctx, rho, th);
          }
        }
        const dr = R * (P / 2) * Math.sin((P / 2) * u);
        const ds = Math.sqrt(rho * rho + dr * dr);
        u += spacing / Math.max(ds, 0.6);
      }
    }
    sp.r0 = 0; sp.size = 1.15;
    col(ctx, SHADOW_COL.pale, true);
    spawnPolar(ctx, 0, 0);
    this.layer++;
    if (this.layer < layers) return 0.16;
    this.layer = 0;
    return 1e3;
  }
}

/* ---------------------------------------------------------------- 影の剣閃 shadow slash (mid-boss) */

/**
 * Cross-section: a blade arc — a gently curved double line of bullets — laid across the whole
 * field near the player, arriving progressively from one end to the other (the sword sweeping).
 * Cross the line behind the blade (where it has already passed) or through its one gap (light
 * edges). Each slash turns ~60–120°; at higher intensity slashes come in crossed pairs.
 */
class ShadowSlash extends ShadowEmitter {
  private ang: number;
  private count = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.3);
    this.ang = this.rng() * Math.PI;
    this.lagRate = 1.6;
  }

  private slash(ctx: EmitCtx, ang: number, delay: number): void {
    const sp = ctx.sp;
    const I = this.I;
    const rng = this.rng;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx;
    // The blade passes close to the (lagged) player.
    const off = (rng() - 0.5) * 1.2;
    const px = clamp(this.lx, -FIELD.halfW, FIELD.halfW) + nx * off;
    const py = clamp(this.ly, -FIELD.halfH, FIELD.halfH) + ny * off;
    const bend = (rng() < 0.5 ? -1 : 1) * lerp(0.06, 0.09, I); // arc curvature
    const spacing = 0.42 / Math.sqrt(ctx.density);
    const Lh = 7.5;
    const gapAt = (rng() - 0.5) * 4;
    const gapW = lerp(1.45, 1.3, I);
    const sweep = lerp(0.62, 0.45, I);
    const dir = rng() < 0.5 ? -1 : 1;
    sp.cx = 0; sp.cy = 0; sp.ep = 1.1; sp.accel = 2.2; sp.om = dir * 0.3;
    for (let s = -Lh; s <= Lh; s += spacing) {
      const bx = px + dx * s + nx * bend * s * s;
      const by = py + dy * s + ny * bend * s * s;
      const e = Math.abs(s - gapAt);
      if (e < gapW * 0.5) continue;
      const edge = e < gapW * 0.5 + spacing;
      const u = (dir * s + Lh) / (2 * Lh);
      for (let row = 0; row < 2; row++) {
        // Second row: a thinner afterimage just behind the edge.
        const w = row * 0.3;
        const x = bx + nx * w, y = by + ny * w;
        if (!inClip(x, y)) continue;
        sp.T = this.flightT + delay + u * sweep + row * 0.06;
        sp.r0 = 0.5 * Math.sqrt(x * x + y * y) + 1.2;
        sp.size = edge ? 1.25 : row === 0 ? 1.05 : 0.85;
        if (edge) col(ctx, SHADOW_COL.pale, false, 0.2);
        else col(ctx, row === 0 ? SHADOW_COL.violet : SHADOW_COL.magenta, true);
        spawnAt(ctx, x, y);
      }
    }
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const I = this.I;
    const turn = (Math.PI / 3) * (1 + this.rng()) * (this.count & 1 ? -1 : 1);
    this.ang += turn;
    this.slash(ctx, this.ang, 0);
    if (I >= 0.55 && this.count % 2 === 1) this.slash(ctx, this.ang + Math.PI / 2 + (this.rng() - 0.5) * 0.4, 0.35);
    this.count++;
    return lerp(1.05, 0.8, I) + (I >= 0.55 && this.count % 2 === 0 ? 0.35 : 0);
  }
}

/* ---------------------------------------------------------------- 黒鎧の陣 black shield (mid-boss) */

/**
 * Cross-section: a wave of concentric rings of shield plates (arcs of bullets, ~1.4 long with
 * ~1.3 gaps) arriving inner-first. Each ring is turned a little more than the last, so the gaps
 * line up into a curved spiral channel; the next wave twists the other way.
 */
class BlackShield extends ShadowEmitter {
  private wave = 0;
  private phase: number;

  constructor(opts: PatternOptions) {
    super(opts, 0.2);
    this.phase = this.rng() * TAU;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const rng = this.rng;
    const dir = this.wave & 1 ? -1 : 1;
    const twist = dir * lerp(0.2, 0.28, I);
    this.phase += (rng() - 0.5) * 2.4;
    const cx = clamp(projX(ctx) * 0.5, -1, 1) + (rng() - 0.5) * 0.6;
    const cy = clamp(projY(ctx) * 0.4, -1, 1) + (rng() - 0.5) * 0.6;
    const plate = lerp(1.25, 1.45, I);
    const gap = lerp(1.45, 1.3, I);
    const dR = 0.62 / Math.sqrt(ctx.density);
    const spacing = 0.4 / Math.sqrt(ctx.density);
    sp.cx = cx; sp.cy = cy; sp.ep = 1; sp.accel = 2.1;
    let k = 0;
    for (let R = 0.55; R < 5.6; R += dR, k++) {
      const n = Math.max(2, Math.round((TAU * R) / (plate + gap)));
      const per = TAU / n;
      const plateA = (per * plate) / (plate + gap);
      const base = this.phase + twist * k;
      sp.T = this.flightT + k * 0.07;
      sp.om = dir * 0.5;
      sp.r0 = 0.3 * R + 0.3;
      const steps = Math.max(2, Math.round((plateA * R) / spacing));
      for (let m = 0; m < n; m++) {
        const a0 = base + m * per;
        for (let j = 0; j <= steps; j++) {
          const th = a0 + (plateA * j) / steps;
          const x = cx + R * Math.cos(th), y = cy + R * Math.sin(th);
          if (!inClip(x, y)) continue;
          const end = j === 0 || j === steps;
          sp.size = end ? 1.2 : 1.0;
          col(ctx, end ? SHADOW_COL.pale : k & 1 ? SHADOW_COL.violet : SHADOW_COL.crimson, !end, end ? 0.1 : 0);
          spawnPolar(ctx, R, th);
        }
      }
    }
    this.wave++;
    return lerp(1.75, 1.35, I);
  }
}

/* ---------------------------------------------------------------- 影の模倣 shadow mimic (boss) */

/**
 * The heroine's own shot fan, turned against her: 5 (7) vertical lanes of dark needles — her
 * streams — that pour down the field and track her with a lag. The lane grid shifts by half a
 * lane every few seconds (sometimes she is suddenly standing on a lane). The outer lanes are
 * gold-rimmed like her Lv3 outer streams.
 */
class ShadowMimic extends ShadowEmitter {
  private lanesOff = 0;
  private nextShift = 2.4;
  private count = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.15);
    this.lagRate = lerp(0.55, 0.8, this.I);
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    if (te >= this.nextShift) {
      this.nextShift = te + lerp(2.6, 2.0, I);
      this.lanesOff = this.lanesOff === 0 ? 0.5 : 0;
    }
    const lanes = I >= 0.6 ? 7 : 5;
    const g = lerp(1.2, 1.1, I);
    const H = FIELD.halfH + 0.3;
    const v = lerp(5.2, 6.4, I); // scan speed down a lane
    const rate = lerp(12, 14, I) * Math.sqrt(ctx.density);
    const c = this.count++;
    const cx = clamp(this.lx, -FIELD.halfW + 0.4, FIELD.halfW - 0.4) + this.lanesOff * g;
    sp.ep = 1.1; sp.accel = 2.2; sp.r0 = 0.5; sp.T = this.flightT;
    for (let k = 0; k < lanes; k++) {
      const j = k - (lanes - 1) / 2;
      const x = cx + j * g;
      // Each lane scans top → bottom; neighbouring lanes are phase-shifted (a fan, not a wall).
      const span = 2 * H;
      const y = H - (((te * v + Math.abs(j) * 1.1 + (j < 0 ? 0.55 : 0)) % span) + span) % span;
      if (!inClip(x, y)) continue;
      sp.cx = x; sp.cy = y;
      sp.om = j * 0.1;
      const outer = Math.abs(j) >= (lanes - 1) / 2;
      sp.size = c % 4 === 0 ? 1.15 : 1.0;
      col(ctx, outer ? COL.gold : SHADOW_COL.cyan, true);
      spawnPolar(ctx, 0, 0);
    }
    return 1 / rate;
  }
}

/* ---------------------------------------------------------------- 写し身の弾幕 shadow echo (boss) */

/** Stage-1 colour → shadow rim colour (gold / white stay light: gap edges and hearts). */
function shadeSlot(pool: BulletPool, i: number): void {
  const r = pool.cr[i], g = pool.cg[i], b = pool.cb[i];
  if (r > 0.85 && g > 0.65 && b < 0.75) return; // gold: keep as a light accent
  if (r > 0.85 && g > 0.85 && b > 0.85) return; // white
  let c: RGB;
  if (b > 0.9 && g > 0.7) c = SHADOW_COL.violet; // cyan
  else if (r > 0.9 && b > 0.55) c = SHADOW_COL.crimson; // pink
  else c = SHADOW_COL.magenta; // purple / other
  pool.cr[i] = c[0]; pool.cg[i] = c[1]; pool.cb[i] = c[2];
  pool.dark[i] = 1;
}

/** Mirror a freshly spawned bullet left ↔ right (x → −x) in place. */
function mirrorSlot(pool: BulletPool, i: number): void {
  pool.ox[i] = -pool.ox[i];
  pool.cx[i] = -pool.cx[i];
  pool.th1[i] = Math.PI - pool.th1[i];
  pool.om[i] = -pool.om[i];
  pool.tx[i] = -pool.tx[i];
  pool.evalPos(i);
  pool.px[i] = pool.x[i]; pool.py[i] = pool.y[i]; pool.pz[i] = pool.z[i];
}

const ECHO_SEQ: PatternId[] = ['spiralCorridor', 'petalBloom', 'wingSweep', 'rippleRing'];

/**
 * 写し身: the earlier stages' patterns replayed by her shadow — mirrored and in shadow colours
 * (gold gap edges and hearts stay light). Cycles 螺旋回廊 → 花弁の開花 → 胡蝶の羽ばたき → 波紋リング.
 * Same geometry as the originals (so the same fairness).
 */
class ShadowEcho extends Emitter {
  private inner: Emitter | null = null;
  private idx: number;
  private segT = 0;
  private readonly seg: number;

  constructor(opts: PatternOptions) {
    super(opts, 0);
    this.idx = Math.floor(this.rng() * ECHO_SEQ.length);
    this.seg = lerp(6.5, 5.5, this.I);
  }

  get done(): boolean {
    return this.stopped || this.t >= this.duration;
  }

  stop(): void {
    super.stop();
    this.inner?.stop();
  }

  update(dt: number, ctx: EmitCtx): void {
    if (this.stopped) return;
    this.t += dt;
    if (this.t >= this.duration) return;
    if (!this.inner || this.segT >= this.seg) {
      this.segT = 0;
      this.inner?.stop();
      this.inner = createEmitter(ECHO_SEQ[this.idx++ % ECHO_SEQ.length], {
        origin: this.opts.origin,
        duration: Math.min(this.seg, this.duration - this.t + 0.01),
        intensity: this.I,
        seed: (this.opts.seed ?? 1) * 31 + this.idx,
      });
    }
    this.segT += dt;
    const pool = ctx.pool;
    const n0 = pool.n;
    this.inner.update(dt, ctx);
    for (let i = n0; i < pool.n; i++) {
      shadeSlot(pool, i);
      mirrorSlot(pool, i);
    }
  }

  protected emit(): number {
    return 1e9;
  }
}

/* ---------------------------------------------------------------- 影の結界 shadow barrier (boss) */

/** Point on a regular hexagon of circumradius R rotated by rot, at perimeter parameter u 0..6. */
function hexPoint(R: number, rot: number, u: number, out: { x: number; y: number }): void {
  const k = Math.floor(u) % 6;
  const f = u - Math.floor(u);
  const a0 = rot + (k * TAU) / 6, a1 = rot + ((k + 1) * TAU) / 6;
  out.x = R * lerp(Math.cos(a0), Math.cos(a1), f);
  out.y = R * lerp(Math.sin(a0), Math.sin(a1), f);
}

/**
 * The heroine's 光の結界 inverted: her bomb is a hexagonal dome of light opening outward; the
 * shadow's barrier is a hexagonal lattice that closes in from the edges. Each cycle: hexagon
 * shells arriving outer-first around a centre near her, joined by spokes at the corners into a
 * web, with two opposite channels (light edges) cut through every shell along a slowly curving
 * line — slide into a channel and ride it as the shells close. At higher intensity the cycle
 * ends with a honeycomb seal over the centre: stand inside a cell.
 */
class ShadowBarrier extends ShadowEmitter {
  private cycle = 0;
  private readonly pt = { x: 0, y: 0 };

  constructor(opts: PatternOptions) {
    super(opts, 0.25);
    this.lagRate = 1.0;
  }

  protected emit(_te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const rng = this.rng;
    // Centre: offset from the (lagged) player so the shells sweep over her.
    const oa = rng() * TAU;
    const od = lerp(1.3, 1.8, rng());
    const cx = clamp(this.lx + Math.cos(oa) * od, -FIELD.halfW + 0.5, FIELD.halfW - 0.5);
    const cy = clamp(this.ly + Math.sin(oa) * od, -FIELD.halfH + 0.8, FIELD.halfH - 0.8);
    const rot0 = rng() * TAU;
    const twist = (rng() < 0.5 ? -1 : 1) * lerp(0.05, 0.08, I);
    // Channels at edge midpoints (never along a spoke).
    const g0 = rot0 + Math.PI / 6 + Math.floor(rng() * 6) * (Math.PI / 3);
    const gapW = lerp(1.45, 1.3, I);
    const spacing = 0.42 / Math.sqrt(ctx.density);
    const dR = lerp(0.72, 0.64, I) / Math.sqrt(Math.sqrt(ctx.density));
    const shells: number[] = [];
    for (let R = 6.4; R >= 1.45; R -= dR) shells.push(R);
    sp.cx = cx; sp.cy = cy; sp.ep = 1; sp.accel = 2.1;
    const pt = this.pt;
    const dt = lerp(0.12, 0.1, I);
    for (let k = 0; k < shells.length; k++) {
      const R = shells[k];
      const rot = rot0 + twist * k;
      const gc = g0 + twist * k;
      sp.T = this.flightT + k * dt;
      sp.om = (k & 1 ? 1 : -1) * 0.35;
      sp.r0 = 0.3 * R + 0.4;
      const per = 6 * R; // perimeter of a hexagon = 6 × side (side = R)
      const n = Math.max(6, Math.round(per / spacing));
      for (let j = 0; j < n; j++) {
        hexPoint(R, rot, (6 * j) / n, pt);
        const x = cx + pt.x, y = cy + pt.y;
        if (!inClip(x, y)) continue;
        const th = Math.atan2(pt.y, pt.x);
        const rr = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
        const edge = Math.min(Math.abs(wrapPi(th - gc)), Math.abs(wrapPi(th - gc - Math.PI))) * rr;
        if (edge < gapW * 0.5) continue;
        const isEdge = edge < gapW * 0.5 + spacing;
        const corner = j % Math.round(n / 6) === 0;
        sp.size = isEdge ? 1.25 : corner ? 1.15 : 1.0;
        col(ctx, isEdge ? COL.gold : corner ? SHADOW_COL.magenta : SHADOW_COL.violet, !isEdge, isEdge ? 0.15 : 0);
        spawnPolar(ctx, rr, th);
      }
      // Spokes to the next shell inward, at the corners (the lattice "web").
      if (k + 1 < shells.length && (k & 1) === 0) {
        const R2 = shells[k + 1];
        for (let c = 0; c < 6; c++) {
          const a = rot + (c * TAU) / 6;
          for (let s = 1; s <= 2; s++) {
            const r = lerp(R, R2, s / 3);
            const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            if (!inClip(x, y)) continue;
            sp.T = this.flightT + (k + s / 3) * dt;
            sp.size = 0.9;
            col(ctx, SHADOW_COL.crimson, true);
            spawnPolar(ctx, r, a);
          }
        }
      }
    }
    const shellEnd = shells.length * dt;
    let extra = 0;
    if (I >= 0.5 && this.cycle % 2 === 1) {
      // Honeycomb seal over the centre (cells of circumradius Rc).
      const Rc = 1.3;
      const tSeal = this.flightT + shellEnd + 0.75;
      const rot = rot0 + twist * shells.length;
      const ax = Math.cos(rot) * Rc * 1.5, ay = Math.sin(rot) * Rc * 1.5;
      const bx = Math.cos(rot + Math.PI / 2) * Rc * Math.sqrt(3), by = Math.sin(rot + Math.PI / 2) * Rc * Math.sqrt(3);
      sp.om = 0.2; sp.r0 = 1.2;
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          const hx = cx + i * ax + j * bx + (i & 1 ? bx * 0.5 : 0);
          const hy = cy + i * ay + j * by + (i & 1 ? by * 0.5 : 0);
          const d = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);
          if (d > 3.4) continue;
          // Draw 3 of the 6 edges per cell (shared edges once): corners 0-1, 1-2, 2-3.
          for (let e = 0; e < 3; e++) {
            for (let s = 0; s < 3; s++) {
              hexPoint(Rc, rot, e + s / 3, pt);
              const x = hx + pt.x, y = hy + pt.y;
              if (!inClip(x, y)) continue;
              sp.T = tSeal + d * 0.04;
              sp.size = s === 0 ? 1.1 : 0.95;
              col(ctx, s === 0 ? SHADOW_COL.magenta : SHADOW_COL.violet, true);
              spawnAt(ctx, x, y);
            }
          }
        }
      }
      extra = 1.0;
    }
    this.cycle++;
    return shellEnd + lerp(1.5, 1.2, I) + extra;
  }
}

/* ---------------------------------------------------------------- 光喰い light eater (boss) */

/**
 * Cross-section: dark curled arms turning around a hub that follows the heroine (lagging), with a
 * "maw" bullet at the hub — standing still is eaten. Keep just off the hub, or ride a gap
 * between arms. (The boss shrinks the light around her meanwhile.)
 */
class LightEater extends ShadowEmitter {
  private readonly arms: number;
  private readonly dir: number;
  private readonly phase0: number;
  private readonly curl: number;
  private count = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.2);
    this.lagRate = lerp(0.6, 0.8, this.I);
    this.arms = 3;
    this.dir = this.rng() < 0.5 ? -1 : 1;
    this.phase0 = this.rng() * TAU;
    this.curl = 0.6 * (this.rng() < 0.5 ? -1 : 1);
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const d = Math.sqrt(ctx.density);
    const w0 = lerp(0.45, 0.62, I);
    const phi = this.phase0 + this.dir * (w0 * te + 1.6 * w0 * Math.sin(te * 0.45));
    const c = this.count++;
    sp.cx = clamp(this.lx, -FIELD.halfW, FIELD.halfW);
    sp.cy = clamp(this.ly, -FIELD.halfH, FIELD.halfH);
    sp.om = -this.dir * 0.7;
    sp.ep = 1.2;
    sp.accel = 2.3;
    const step = 0.46 / d;
    for (let a = 0; a < this.arms; a++) {
      const base = phi + (TAU * a) / this.arms;
      for (let rho = 0.95; rho <= 5.6; rho += step / Math.sqrt(1 + this.curl * this.curl * rho * rho)) {
        if (rho > 2.6 && c % 2 === 1) continue; // thinner far out
        const th = base + this.curl * rho;
        const x = sp.cx + rho * Math.cos(th), y = sp.cy + rho * Math.sin(th);
        if (!inClip(x, y)) continue;
        sp.r0 = 0.7 * rho + 1.5;
        sp.size = 1.0;
        col(ctx, a === 0 ? SHADOW_COL.crimson : a === 1 ? SHADOW_COL.violet : SHADOW_COL.magenta, true);
        spawnPolar(ctx, rho, th);
      }
    }
    if (c % 2 === 0) {
      sp.r0 = 0; sp.size = 1.35;
      col(ctx, SHADOW_COL.ember, true);
      spawnPolar(ctx, 0, 0);
    }
    return 1 / (lerp(3.4, 4.4, I) * d);
  }
}

/* ---------------------------------------------------------------- 光と影の螺旋 light & shadow helix (final) */

/**
 * Final spell. Cross-section: two light arms (bright cores: white / gold / cyan) curled one way
 * and two shadow arms (dark bullets) curled the other way, all turning together around a slowly
 * wandering hub — a rigid, rotating lattice of curved diamonds. Stay inside a diamond and turn
 * with it. In flight the light and shadow streams twist in opposite directions (the double helix).
 */
class LightShadowHelix extends ShadowEmitter {
  private readonly dir: number;
  private readonly phase0: number;
  private readonly curl: number;
  private count = 0;

  constructor(opts: PatternOptions) {
    super(opts, 0.15);
    this.dir = this.rng() < 0.5 ? -1 : 1;
    this.phase0 = this.rng() * TAU;
    this.curl = lerp(0.4, 0.46, this.I);
  }

  protected emit(te: number, ctx: EmitCtx): number {
    const sp = ctx.sp;
    const I = this.I;
    const d = Math.sqrt(ctx.density);
    const w0 = lerp(0.32, 0.42, I);
    const phi = this.phase0 + this.dir * (w0 * te + 1.2 * w0 * Math.sin(te * 0.4));
    const c = this.count++;
    sp.cx = 0.5 * Math.sin(te * 0.31 + this.phase0);
    sp.cy = 0.6 * Math.sin(te * 0.23 + 1.1);
    sp.ep = 1.15;
    sp.accel = 2.3;
    const step = 0.5 / d;
    for (let fam = 0; fam < 2; fam++) {
      const light = fam === 0;
      const curl = light ? this.curl : -this.curl;
      sp.om = (light ? -1 : 1) * this.dir * 0.6;
      for (let a = 0; a < 2; a++) {
        const base = phi + Math.PI * a + (light ? 0 : Math.PI / 2);
        for (let rho = 0.6; rho <= 5.2; rho += step / Math.sqrt(1 + curl * curl * rho * rho)) {
          if (rho > 3.2 && (c & 1) === 1) continue;
          const th = base + curl * rho;
          const x = sp.cx + rho * Math.cos(th), y = sp.cy + rho * Math.sin(th);
          if (!inClip(x, y)) continue;
          sp.r0 = 0.6 * rho + 1.2;
          sp.size = 1.0;
          if (light) col(ctx, a === 0 ? COL.gold : COL.cyan, false, rho < 1 ? 0.4 : 0.1);
          else col(ctx, a === 0 ? SHADOW_COL.violet : SHADOW_COL.crimson, true);
          spawnPolar(ctx, rho, th);
        }
      }
    }
    if ((c & 1) === 0) {
      sp.r0 = 0; sp.size = 1.25; sp.om = 0;
      const lightHub = (c & 2) === 0;
      col(ctx, lightHub ? COL.white : SHADOW_COL.magenta, !lightHub);
      spawnPolar(ctx, 0, 0);
    }
    return 1 / (lerp(3.2, 3.9, I) * d);
  }
}

/* ---------------------------------------------------------------- registration */

registerEmitter('shadowProbe', (o) => new ShadowProbe(o));
registerEmitter('shadowShot', (o) => new ShadowShot(o));
registerEmitter('shadowGrasp', (o) => new ShadowGrasp(o));
registerEmitter('shadowBloom', (o) => new ShadowBloom(o));
registerEmitter('shadowSlash', (o) => new ShadowSlash(o));
registerEmitter('blackShield', (o) => new BlackShield(o));
registerEmitter('shadowMimic', (o) => new ShadowMimic(o));
registerEmitter('shadowEcho', (o) => new ShadowEcho(o));
registerEmitter('shadowBarrier', (o) => new ShadowBarrier(o));
registerEmitter('lightEater', (o) => new LightEater(o));
registerEmitter('lightShadowHelix', (o) => new LightShadowHelix(o));

/** Every stage-3 pattern that fires (dev / fairness lists). */
export const STAGE3_PATTERNS: PatternId[] = [
  'shadowShot', 'shadowGrasp', 'shadowBloom', 'shadowSlash', 'blackShield',
  'shadowMimic', 'shadowEcho', 'shadowBarrier', 'lightEater', 'lightShadowHelix',
];
