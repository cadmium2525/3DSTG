/** Runs the STAGE_EVENTS timeline (see StageData.ts). */
import { STAGE_EVENTS, type IntroEvent, type MarkerEvent, type WaveEvent } from './StageData';

export interface StageHooks {
  wave(w: WaveEvent): void;
  intro(e: IntroEvent): void;
  announce(e: MarkerEvent): void;
  warning(): void;
  boss(): void;
}

export class Stage {
  t = 0;
  private idx = 0;

  constructor(private hooks: StageHooks) {}

  reset(): void {
    this.t = 0;
    this.idx = 0;
  }

  /** Jump ahead; events before `t` are skipped (not fired). */
  jumpTo(t: number): void {
    this.t = t;
    while (this.idx < STAGE_EVENTS.length && STAGE_EVENTS[this.idx].t < t) this.idx++;
  }

  get finished(): boolean {
    return this.idx >= STAGE_EVENTS.length;
  }

  update(dt: number): void {
    this.t += dt;
    while (this.idx < STAGE_EVENTS.length && STAGE_EVENTS[this.idx].t <= this.t) {
      const e = STAGE_EVENTS[this.idx++];
      switch (e.type) {
        case 'wave': this.hooks.wave(e); break;
        case 'intro': this.hooks.intro(e); break;
        case 'announce': this.hooks.announce(e); break;
        case 'warning': this.hooks.warning(); break;
        case 'boss': this.hooks.boss(); break;
      }
    }
  }
}
