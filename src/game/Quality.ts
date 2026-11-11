/**
 * Frame-time monitor + quality level (0 low, 1 mid, 2 high).
 * In 'auto' mode it steps down when the sustained fps is low.
 */
import type { Settings } from '../core/types';

export type QualityLevel = 0 | 1 | 2;

const WINDOW = 1.0; // seconds per measurement window
const LOW_FPS = 46; // below this for STRIKES windows -> step down
const STRIKES = 2;
const COOLDOWN = 3.0; // seconds to wait after a change before measuring again

export class Quality {
  level: QualityLevel = 2;
  /** Smoothed fps for display/debug. */
  fps = 60;
  private mode: Settings['quality'] = 'auto';
  private acc = 0;
  private frames = 0;
  private strikes = 0;
  private cooldown = COOLDOWN;

  constructor(mode: Settings['quality'], private onChange: (l: QualityLevel) => void) {
    this.setMode(mode, true);
  }

  setMode(mode: Settings['quality'], force = false): void {
    if (mode === this.mode && !force) return;
    this.mode = mode;
    const l: QualityLevel = mode === 'low' ? 0 : 2;
    this.strikes = 0;
    this.cooldown = COOLDOWN;
    if (l !== this.level || force) {
      this.level = l;
      this.onChange(l);
    }
  }

  /** Ignore the next few seconds (after resume / state change spikes). */
  hold(sec = 1.5): void {
    this.cooldown = Math.max(this.cooldown, sec);
    this.acc = 0;
    this.frames = 0;
  }

  /** Feed the raw (unclamped) frame time in seconds. */
  sample(rawDt: number): void {
    if (rawDt <= 0 || rawDt > 0.5) return; // tab switches etc.
    this.fps += (1 / rawDt - this.fps) * 0.05;
    if (this.cooldown > 0) {
      this.cooldown -= rawDt;
      return;
    }
    this.acc += rawDt;
    this.frames++;
    if (this.acc < WINDOW) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.mode !== 'auto' || this.level === 0) return;
    if (fps < LOW_FPS) {
      if (++this.strikes >= STRIKES) {
        this.strikes = 0;
        this.cooldown = COOLDOWN;
        this.level = (this.level - 1) as QualityLevel;
        this.onChange(this.level);
      }
    } else {
      this.strikes = 0;
    }
  }
}
