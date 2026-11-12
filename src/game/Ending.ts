/**
 * The ending: runs after the last stage's tally, before the final ALL CLEAR result.
 *
 *   0 s     the darkness has lifted; the abyss morphs into a dawn-lit star sea, the 'ending'
 *           theme starts (one-shot, ~57 s); she glides to the centre of the corridor.
 *   ~6 s    the camera swings around over her head to her front while she turns to face it
 *           (the title turn played backwards).
 *   lines   six short lines about light and shadow becoming one, one after another, centred.
 *   ~24 s   the 3D model flashes white and turns back into the original 2D illustration card
 *           (TitleIntro's card, its 'enter' transformation).
 *   ~26 s   THANK YOU FOR PLAYING → ~33 s the final result (the music is still playing).
 *
 * Tap: jump to the next beat (lines / turn / card / thank-you / result) — it never waits on input.
 */
import type { AudioEngine, GameUI } from '../core/types';
import type { Background } from './Background';
import type { CameraRig } from './CameraRig';
import type { Effects } from './Effects';
import type { Player } from './Player';
import type { TitleIntro } from './TitleIntro';
import { ABYSS_LIGHT, BG_DAWN } from './stages/stage3/background';

export interface EndingContext {
  ui: GameUI;
  audio: AudioEngine;
  bg: Background;
  /** Optional (older callers): without them the ending is text and music only. */
  player?: Player;
  rig?: CameraRig;
  intro?: TitleIntro;
  effects?: Effects;
  /** Where the text overlay goes (default: #ui-root or <body>). */
  overlayParent?: HTMLElement;
}

export interface EndingSequence {
  start(): void;
  /** Returns true once finished (→ final result screen). */
  update(dt: number): boolean;
  /** Skip to the end (tap / debug). */
  skip(): void;
  /** Remove overlays / listeners (called by Game whenever the ending is dropped). */
  dispose?(): void;
}

export type EndingFactory = (ctx: EndingContext) => EndingSequence;

/** The ending's lines (original text). */
export const ENDING_LINES = [
  '影は、光がそこにある証。',
  'わたしが輝くほど、あなたは深くなった。',
  'だからもう、闇の底でも迷わない。',
  '光と影は、ひとつの形。',
  '夜の果てにも、朝は届く。',
  '――おかえり、わたしの影。',
];

const T_LINE0 = 1.6;
const LINE_GAP = 3.7;
const LINE_SHOW = 3.3;
const T_TURN = 6.2;
const T_CARD = T_LINE0 + LINE_GAP * ENDING_LINES.length + 0.2; // ≈ 24 s
const T_THANKS = T_CARD + 2.2;
const T_END = T_THANKS + 7;

type Beat = { t: number; run: () => void };

export class LightEnding implements EndingSequence {
  private t = 0;
  private done = false;
  private beats: Beat[] = [];
  private beatIdx = 0;
  private root: HTMLDivElement | null = null;
  private lineEl: HTMLDivElement | null = null;
  private thanksEl: HTMLDivElement | null = null;
  private lineIdx = -1;
  private lineT = 0;
  private sparkT = 0;
  private glide = false;
  private turned = false;
  private onTap = (e: Event) => {
    const el = e.target as Element | null;
    if (el?.closest?.('button')) return; // pause button etc.
    if (this.t < 0.6) return;
    this.next();
  };

  constructor(private ctx: EndingContext) {}

  start(): void {
    this.t = 0;
    this.done = false;
    this.beatIdx = 0;
    this.lineIdx = -1;
    const c = this.ctx;
    c.audio.playBgm('ending');
    c.bg.setPreset(BG_DAWN, 7);
    ABYSS_LIGHT.value = 1;
    this.glide = !!c.player;
    this.turned = false;

    this.beats = [];
    ENDING_LINES.forEach((_, i) => this.beats.push({ t: T_LINE0 + i * LINE_GAP, run: () => this.showLine(i) }));
    this.beats.push({ t: T_TURN, run: () => this.turn() });
    this.beats.push({ t: T_CARD, run: () => this.toCard() });
    this.beats.push({ t: T_THANKS, run: () => this.showThanks() });
    this.beats.sort((a, b) => a.t - b.t);
    this.buildOverlay();
    window.addEventListener('pointerdown', this.onTap, { capture: true });
  }

  private buildOverlay(): void {
    const parent = this.ctx.overlayParent ?? document.getElementById('ui-root') ?? document.body;
    const root = document.createElement('div');
    root.className = 'bd-ending';
    root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:30;display:flex;flex-direction:column;align-items:center;' +
      "font-family:'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif;color:#fffaf2;text-align:center;";
    const line = document.createElement('div');
    line.style.cssText =
      'position:absolute;left:16px;right:16px;top:21%;font-size:clamp(15px,4.6vw,24px);letter-spacing:0.08em;line-height:1.6;word-break:keep-all;' +
      'opacity:0;text-shadow:0 0 12px rgba(255,214,160,0.85),0 0 28px rgba(255,170,200,0.45),0 1px 2px rgba(20,8,30,0.9);';
    const thanks = document.createElement('div');
    thanks.style.cssText =
      'position:absolute;left:16px;right:16px;top:17%;opacity:0;font-family:inherit;';
    thanks.innerHTML =
      '<div style="font-size:clamp(20px,6.6vw,34px);letter-spacing:0.22em;font-weight:600;' +
      'text-shadow:0 0 14px rgba(255,220,170,0.95),0 0 36px rgba(160,200,255,0.55),0 1px 2px rgba(20,8,30,0.9)">THANK YOU<br>FOR PLAYING</div>' +
      '<div style="margin-top:12px;font-size:clamp(12px,3.4vw,15px);letter-spacing:0.5em;opacity:0.85;' +
      'text-shadow:0 0 10px rgba(255,214,160,0.8)">BLOOM DIVE</div>';
    root.append(line, thanks);
    parent.appendChild(root);
    this.root = root;
    this.lineEl = line;
    this.thanksEl = thanks;
  }

  private showLine(i: number): void {
    this.lineIdx = i;
    this.lineT = 0;
    if (this.lineEl) this.lineEl.textContent = ENDING_LINES[i];
  }

  /** Camera swings to her front; she turns to face it (the title turn, reversed). */
  private turn(): void {
    const c = this.ctx;
    if (this.turned) return;
    this.turned = true;
    if (c.rig) c.rig.mode = 'title';
    c.player?.setTitlePose();
    if (c.player && c.effects) {
      const p = c.player.position;
      c.effects.burst(p.x, p.y, p.z, 0xffe6a8, 26, 2.4, 0.06, 1.1);
      c.effects.ring(p.x, p.y, p.z, 0xfff4dc, 1.4, 0.7);
    }
  }

  /** The 3D model flashes white and becomes the 2D illustration again. */
  private toCard(): void {
    const c = this.ctx;
    this.turn();
    if (c.player) c.player.position.set(0, 0, c.player.position.z);
    c.intro?.showTitle(false);
    if (c.player && c.effects) {
      const p = c.player.position;
      c.effects.burst(p.x, p.y, p.z, 0xffd166, 36, 3.0, 0.07, 1.0);
      c.effects.burst(p.x, p.y, p.z, 0x9fd8ff, 24, 3.6, 0.06, 0.8);
      c.effects.ring(p.x, p.y, p.z, 0xffffff, 1.2, 0.5);
    }
  }

  private showThanks(): void {
    this.lineIdx = -1;
  }

  /** Tap: jump to the next beat (or finish). */
  private next(): void {
    if (this.done) return;
    if (this.beatIdx >= this.beats.length) {
      this.done = true;
      return;
    }
    this.t = Math.max(this.t, this.beats[this.beatIdx].t);
  }

  update(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    while (this.beatIdx < this.beats.length && this.t >= this.beats[this.beatIdx].t) this.beats[this.beatIdx++].run();
    const c = this.ctx;

    // She glides to the centre (the title framing is built around the origin).
    const pl = c.player;
    if (pl && this.glide) {
      const k = 1 - Math.exp(-dt * 1.1);
      pl.position.x += (0 - pl.position.x) * k;
      pl.position.y += (0 - pl.position.y) * k;
    }
    // Light motes rising around her.
    if (pl && c.effects) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.22;
        const p = pl.position;
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.6;
        c.effects.burst(p.x + Math.cos(a) * r, p.y - 0.4 + Math.random() * 1.2, p.z + Math.sin(a) * r * 0.6,
          Math.random() < 0.6 ? 0xffe2a8 : 0xbfe8ff, 2, 0.5, 0.05, 1.4);
      }
    }

    // Text: the current line fades in / out; then THANK YOU stays.
    if (this.lineEl) {
      let o = 0;
      if (this.lineIdx >= 0) {
        this.lineT += dt;
        const u = this.lineT;
        o = Math.min(1, u / 0.9) * (1 - Math.max(0, Math.min(1, (u - LINE_SHOW + 0.8) / 0.8)));
      }
      this.lineEl.style.opacity = o.toFixed(3);
      this.lineEl.style.transform = `translateY(${((1 - Math.min(1, this.lineT / 1.2)) * 8).toFixed(1)}px)`;
    }
    if (this.thanksEl) {
      const u = Math.max(0, Math.min(1, (this.t - T_THANKS) / 1.6));
      this.thanksEl.style.opacity = (u * u * (3 - 2 * u)).toFixed(3);
    }
    if (this.t >= T_END) this.done = true;
    return this.done;
  }

  skip(): void {
    this.done = true;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onTap, { capture: true });
    this.root?.remove();
    this.root = this.lineEl = this.thanksEl = null;
  }
}

export const ENDING_DURATION = T_END;

export const createEnding: EndingFactory = (ctx) => new LightEnding(ctx);
