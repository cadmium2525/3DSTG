/** Runs the STAGE_EVENTS timeline (see StageData.ts). */
import { STAGE_EVENTS, type IntroEvent, type MarkerEvent, type WaveEvent } from './StageData';

export interface StageHooks {
  wave(w: WaveEvent): void;
  intro(e: IntroEvent): void;
  announce(e: MarkerEvent): void;
  warning(): void;
  midBoss(): void;
  boss(): void;
}

export class Stage {
  t = 0;
  /** True while the timeline waits for the mid-boss (set by a 'midboss' event, cleared by resume()). */
  waiting = false;
  private idx = 0;

  constructor(private hooks: StageHooks) {}

  reset(): void {
    this.t = 0;
    this.idx = 0;
    this.waiting = false;
  }

  /** Continue the timeline after the mid-boss is gone. */
  resume(): void {
    this.waiting = false;
  }

  /** Jump ahead; events before `t` are skipped (not fired). */
  jumpTo(t: number): void {
    this.t = t;
    this.waiting = false;
    while (this.idx < STAGE_EVENTS.length && STAGE_EVENTS[this.idx].t < t) this.idx++;
  }

  get finished(): boolean {
    return this.idx >= STAGE_EVENTS.length;
  }

  update(dt: number): void {
    if (this.waiting) return;
    this.t += dt;
    while (!this.waiting && this.idx < STAGE_EVENTS.length && STAGE_EVENTS[this.idx].t <= this.t) {
      const e = STAGE_EVENTS[this.idx++];
      switch (e.type) {
        case 'wave': this.hooks.wave(e); break;
        case 'intro': this.hooks.intro(e); break;
        case 'announce': this.hooks.announce(e); break;
        case 'warning': this.hooks.warning(); break;
        case 'midboss':
          this.waiting = true;
          this.t = e.t;
          this.hooks.midBoss();
          break;
        case 'boss': this.hooks.boss(); break;
      }
    }
  }
}
