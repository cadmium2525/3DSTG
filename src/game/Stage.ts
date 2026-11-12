/** Runs one stage's event timeline (StageDef.events). */
import type { IntroEvent, MarkerEvent, SceneryEvent, StageEvent, WaveEvent } from './stages/types';

export interface StageHooks {
  wave(w: WaveEvent): void;
  intro(e: IntroEvent): void;
  announce(e: MarkerEvent): void;
  warning(e: MarkerEvent): void;
  midBoss(): void;
  boss(): void;
  scenery(e: SceneryEvent): void;
}

export class Stage {
  t = 0;
  /** True while the timeline waits for the mid-boss (set by a 'midboss' event, cleared by resume()). */
  waiting = false;
  private idx = 0;
  private events: readonly StageEvent[] = [];

  constructor(private hooks: StageHooks) {}

  /** Restart with a (new) timeline. */
  reset(events: readonly StageEvent[] = this.events): void {
    this.events = events;
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
    while (this.idx < this.events.length && this.events[this.idx].t < t) this.idx++;
  }

  get finished(): boolean {
    return this.idx >= this.events.length;
  }

  update(dt: number): void {
    if (this.waiting) return;
    this.t += dt;
    const ev = this.events;
    while (!this.waiting && this.idx < ev.length && ev[this.idx].t <= this.t) {
      const e = ev[this.idx++];
      switch (e.type) {
        case 'wave': this.hooks.wave(e); break;
        case 'intro': this.hooks.intro(e); break;
        case 'announce': this.hooks.announce(e); break;
        case 'warning': this.hooks.warning(e); break;
        case 'scenery': this.hooks.scenery(e); break;
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
