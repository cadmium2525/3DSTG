/**
 * Ending hook: runs after the last stage's tally, before the final result.
 * The real ending (the shadow dissolving into light, the heroine turning around) will replace
 * `PlaceholderEnding`; Game only needs an `EndingSequence`.
 */
import type { AudioEngine, GameUI } from '../core/types';
import type { Background } from './Background';
import { BG_STAR_SEA } from './Background';

export interface EndingContext {
  ui: GameUI;
  audio: AudioEngine;
  bg: Background;
}

export interface EndingSequence {
  start(): void;
  /** Returns true once finished (→ final result screen). */
  update(dt: number): boolean;
  /** Skip to the end (tap / debug). */
  skip(): void;
}

export type EndingFactory = (ctx: EndingContext) => EndingSequence;

/** For now: ending BGM, the light returns (background morphs back to the star sea), two banners. */
export class PlaceholderEnding implements EndingSequence {
  private t = 0;
  private step = 0;
  private done = false;
  static readonly DURATION = 7.5;

  constructor(private ctx: EndingContext) {}

  start(): void {
    this.t = 0;
    this.step = 0;
    this.done = false;
    this.ctx.audio.playBgm('ending');
    this.ctx.bg.setPreset(BG_STAR_SEA, 5);
    this.ctx.bg.setSpeed(0.6);
  }

  update(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    if (this.step === 0 && this.t >= 0.6) {
      this.step = 1;
      this.ctx.ui.announce('ALL STAGES CLEAR', '影は光に溶けて ― ENDING（仮）');
    } else if (this.step === 1 && this.t >= 3.6) {
      this.step = 2;
      this.ctx.ui.announce('THANK YOU FOR PLAYING', '光の少女の旅はつづく');
    }
    if (this.t >= PlaceholderEnding.DURATION) this.done = true;
    return this.done;
  }

  skip(): void {
    this.done = true;
  }
}

export const createEnding: EndingFactory = (ctx) => new PlaceholderEnding(ctx);
