/**
 * Base class for bosses and mid-bosses: the phase state machine shared by every boss.
 *
 *   Off → spawn() → Enter (enterSec) → Phase 0 → Breather → Phase 1 → … → last phase
 *   last phase broken  → Dying (subclass death sequence) → Done + onDefeated
 *   last phase timeout → Escape (subclass fly-away)       → Done + onEscaped
 *
 * Each phase runs its patterns in parallel (re-armed when one ends early) and ends when the HP bar
 * reaches `hpEnd` or after `timeout`. Damage only counts during a phase and never pushes the bar
 * below the phase's floor. HP is scaled by Difficulty.bossHp, intensities by Difficulty.bullet.
 *
 * Subclasses build their meshes into `group` and override the motion / visual hooks.
 */
import * as THREE from 'three';
import type { Danmaku, PatternHandle, Vec3Like } from '../../core/types';
import type { Effects } from '../Effects';
import type { Rng } from '../Rng';
import type { Targets } from '../Shots';
import { scaleIntensity, type Difficulty } from '../stages/types';
import { BossState, type BossConfig, type BossContext, type BossEvents, type BossLike } from './BossLike';

export abstract class PhasedBoss<C extends BossConfig = BossConfig> implements BossLike {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly config: C;
  state = BossState.Off;
  hp = 1;
  phaseIndex = -1;
  /** Seconds in the current state (stops while frozen). */
  protected t = 0;
  /** Seconds since spawn (keeps running while frozen, for visuals). */
  protected life = 0;
  /** Hit flash 0..1 (subclass decays it in animate()). */
  protected flash = 0;
  protected frozen = false;
  protected readonly danmaku: Danmaku;
  protected readonly effects: Effects;
  protected readonly rng: Rng;
  protected readonly ev: BossEvents;
  protected readonly difficulty: Difficulty;
  protected readonly origin: () => Vec3Like;
  private handles: (PatternHandle | null)[] = [];

  constructor(ctx: BossContext<C>) {
    this.config = ctx.config;
    this.danmaku = ctx.danmaku;
    this.effects = ctx.effects;
    this.rng = ctx.rng;
    this.ev = ctx.events;
    this.difficulty = ctx.difficulty;
    this.origin = () => this.position;
    const P = this.config.position;
    this.position.set(P.x, P.y, P.z);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.state !== BossState.Off && this.state !== BossState.Done;
  }

  /** Damage accepted only while a phase is running. */
  get vulnerable(): boolean {
    return this.state === BossState.Phase;
  }

  protected get maxHp(): number {
    return this.config.maxHp * this.difficulty.bossHp;
  }

  reset(): void {
    this.stopPatterns();
    this.state = BossState.Off;
    this.group.visible = false;
    this.hp = 1;
    this.phaseIndex = -1;
    this.frozen = false;
    this.onReset();
  }

  spawn(): void {
    this.reset();
    this.state = BossState.Enter;
    this.t = 0;
    this.life = 0;
    this.group.visible = true;
    this.onSpawn();
  }

  protected stopPatterns(): void {
    for (let i = 0; i < this.handles.length; i++) {
      const h = this.handles[i];
      if (h) h.stop();
      this.handles[i] = null;
    }
  }

  private startPattern(k: number, duration: number): void {
    const p = this.config.phases[this.phaseIndex].patterns[k];
    this.handles[k] = this.danmaku.startPattern(p.id, {
      origin: this.origin, duration, intensity: scaleIntensity(p.intensity, this.difficulty), seed: this.rng.int(),
    });
  }

  protected startPhase(i: number): void {
    this.phaseIndex = i;
    this.state = BossState.Phase;
    this.t = 0;
    const def = this.config.phases[i];
    for (let k = 0; k < def.patterns.length; k++) this.startPattern(k, def.timeout);
    this.ev.onPhaseStart(i);
  }

  protected endPhase(broken: boolean): void {
    this.stopPatterns();
    const cancel = broken || this.config.cancelOnTimeout ? this.ev.onBulletCancel : undefined;
    const cancelled = this.danmaku.clear(undefined, undefined, cancel);
    this.ev.onPhaseEnd(this.phaseIndex, broken, cancelled);
    this.t = 0;
    if (this.phaseIndex >= this.config.phases.length - 1) {
      this.state = broken ? BossState.Dying : BossState.Escape;
      this.onDeathStart(broken);
    } else {
      this.state = BossState.Breather;
    }
  }

  damage(amount: number, x: number, y: number, z: number): void {
    const ok = this.vulnerable;
    if (ok) {
      const floor = this.config.phases[this.phaseIndex].hpEnd;
      this.hp = Math.max(floor, this.hp - amount / this.maxHp);
      this.flash = Math.min(1, this.flash + (this.config.hitFlash ?? 0.35));
    }
    this.ev.onHit(x, y, z, ok);
  }

  addTargets(t: Targets, id: number): void {
    const s = this.state;
    if (s === BossState.Off || s === BossState.Done || s === BossState.Dying || s === BossState.Escape) return;
    if (s === BossState.Enter && this.t < this.config.enterSec * 0.6) return;
    const p = this.position;
    t.add(id, p.x, p.y, p.z + (this.config.targetZ ?? 1), this.config.hitRadius);
  }

  forceBreak(): boolean {
    if (this.state !== BossState.Phase) return false;
    this.hp = this.config.phases[this.phaseIndex].hpEnd;
    return true;
  }

  freeze(): void {
    this.stopPatterns();
    this.frozen = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.life += dt;
    if (!this.frozen) {
      this.t += dt;
      this.step(dt);
    }
    if (this.state !== BossState.Done) this.animate(dt);
  }

  private step(dt: number): void {
    const cfg = this.config;
    switch (this.state) {
      case BossState.Enter: {
        const u = Math.min(1, this.t / cfg.enterSec);
        this.moveEnter(u, dt);
        if (u >= 1) this.startPhase(0);
        break;
      }
      case BossState.Phase: {
        const def = cfg.phases[this.phaseIndex];
        this.movePhase(dt);
        // Re-arm patterns that finished early.
        for (let k = 0; k < def.patterns.length; k++) {
          const h = this.handles[k];
          if (h && h.done && this.t < def.timeout - 1) this.startPattern(k, def.timeout - this.t);
        }
        if (this.hp <= def.hpEnd + 1e-6) this.endPhase(true);
        else if (this.t >= def.timeout) this.endPhase(false);
        break;
      }
      case BossState.Breather:
        this.moveBreather(dt);
        if (this.t >= cfg.breatherSec) this.startPhase(this.phaseIndex + 1);
        break;
      case BossState.Dying:
        if (this.updateDying(dt)) {
          this.state = BossState.Done;
          this.group.visible = false;
          const p = this.position;
          this.ev.onDefeated(p.x, p.y, p.z);
        }
        break;
      case BossState.Escape:
        if (this.updateEscape(dt)) {
          this.state = BossState.Done;
          this.group.visible = false;
          this.ev.onEscaped();
        }
        break;
    }
  }

  /* ---- hooks for subclasses ---- */

  /** Called by reset() (restore visuals). */
  protected onReset(): void {}
  /** Called by spawn() after reset (set the start position, fade in…). */
  protected onSpawn(): void {}
  /** Fly-in, u = 0..1 over enterSec. */
  protected abstract moveEnter(u: number, dt: number): void;
  /** Motion while a phase runs. */
  protected abstract movePhase(dt: number): void;
  /** Motion during the breather (default: same as movePhase). */
  protected moveBreather(dt: number): void {
    this.movePhase(dt);
  }
  /** Last phase ended (broken = will die, else escape). */
  protected onDeathStart(_broken: boolean): void {}
  /** Death sequence; `this.t` = seconds since it started. Return true when finished. */
  protected updateDying(_dt: number): boolean {
    return this.t >= this.config.deathSec;
  }
  /** Escape sequence; return true when gone. */
  protected updateEscape(_dt: number): boolean {
    return this.t >= 2;
  }
  /** Per-frame visuals (also while frozen; not after Done). */
  protected abstract animate(dt: number): void;

  /** Release GPU resources of everything under `group`. */
  dispose(): void {
    this.stopPatterns();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.group.removeFromParent();
  }
}
