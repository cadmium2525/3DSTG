/**
 * Relative-drag pointer input + keyboard (desktop testing).
 * The first pointer drives movement; a second simultaneous touch acts as "slow".
 */
const INTERACTIVE = 'button, input, select, textarea, a, label, [role="button"], [data-ui-interactive]';

export class Input {
  /** Accumulated drag since last consume(), in CSS pixels. */
  private dragX = 0;
  private dragY = 0;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private secondPointer: number | null = null;
  private secondX = 0;
  private secondY = 0;
  private keys = new Set<string>();

  /** Called when P / Esc is pressed. */
  onPauseKey: (() => void) | null = null;
  /** X / B: bomb (desktop testing). */
  onBombKey: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Block page scroll / pinch zoom / double-tap zoom on the play area.
    el.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.reset());
  }

  private isUiTarget(t: EventTarget | null): boolean {
    return t instanceof Element && t.closest(INTERACTIVE) !== null;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.isUiTarget(e.target)) return;
    if (this.pointerId === null) {
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    } else if (this.secondPointer === null && e.pointerId !== this.pointerId) {
      this.secondPointer = e.pointerId;
      this.secondX = e.clientX;
      this.secondY = e.clientY;
    }
    if (e.pointerType !== 'mouse' && e.cancelable) e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.secondPointer) {
      this.secondX = e.clientX;
      this.secondY = e.clientY;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.dragX += e.clientX - this.lastX;
    this.dragY += e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) {
      this.pointerId = null;
      // Promote the second finger so play continues seamlessly.
      if (this.secondPointer !== null) {
        this.pointerId = this.secondPointer;
        this.lastX = this.secondX;
        this.lastY = this.secondY;
        this.secondPointer = null;
      }
    } else if (e.pointerId === this.secondPointer) {
      this.secondPointer = null;
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p' || k === 'Escape') {
      if (!e.repeat) this.onPauseKey?.();
      e.preventDefault();
      return;
    }
    if (k === 'x' || k === 'b') {
      if (!e.repeat) this.onBombKey?.();
      e.preventDefault();
      return;
    }
    if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(k);
  };

  reset(): void {
    this.keys.clear();
    this.pointerId = null;
    this.secondPointer = null;
    this.dragX = this.dragY = 0;
  }

  /** Drag delta in CSS px since last call (screen-down positive), then zeroed. */
  consumeDrag(out: { x: number; y: number }): void {
    out.x = this.dragX;
    out.y = this.dragY;
    this.dragX = this.dragY = 0;
  }

  /** Keyboard axis -1..1 (y up positive). */
  keyAxisX(): number {
    let v = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) v -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) v += 1;
    return v;
  }

  keyAxisY(): number {
    let v = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) v += 1;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) v -= 1;
    return v;
  }

  /** Shift held or a second finger down. */
  get slowHeld(): boolean {
    return this.keys.has('Shift') || this.secondPointer !== null;
  }

  get dragging(): boolean {
    return this.pointerId !== null;
  }
}
