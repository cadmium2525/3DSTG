/**
 * BLOOM DIVE — entry point. Creates the shared modules, boots the game and
 * exposes debug hooks (window.__bloom) + URL params for automated testing:
 *   ?autostart=1  start immediately      ?invincible=1  no damage
 *   ?boss=1       start at the boss      ?seed=N        deterministic seed
 *   ?midboss=1    start at the mid-boss  ?power=N  start at shot power Lv N (1..4)
 *   ?stage=N      start at stage N (1..3; power defaults to that stage's startPower). ?boss / ?midboss
 *                 then apply to that stage. Retry always restarts from stage 1.
 */
import { createDanmaku } from './danmaku';
import { createUI } from './ui';
import { createAudio } from './audio';
import { createSaveStore } from './save';
import { Game } from './game/Game';

const params = new URLSearchParams(location.search);
const flag = (k: string) => {
  const v = params.get(k);
  return v !== null && v !== '0' && v !== 'false';
};
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && params.has('seed') ? seedParam | 0 : (Math.random() * 0x7fffffff) | 0;

const save = createSaveStore();
const audio = createAudio();
const danmaku = createDanmaku();
const game = new Game({
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
  app: document.getElementById('app')!,
  danmaku,
  audio,
  save,
  seed,
});

const ui = createUI(
  document.getElementById('ui-root')!,
  {
    onStart() {
      audio.unlock();
      game.start();
    },
    onRetry() {
      audio.unlock();
      game.start();
    },
    onBackToTitle() {
      game.toTitle();
    },
    onPause(paused) {
      game.setPaused(paused, true);
    },
    onSettingsChanged() {
      game.settingsChanged();
    },
    onBomb() {
      game.useBomb();
    },
  },
  save,
);

game.boot(ui);

// Unlock audio on the first gesture anywhere so the title theme plays before START.
const unlockOnce = () => audio.unlock();
for (const ev of ['touchend', 'pointerup', 'keydown'] as const) {
  window.addEventListener(ev, unlockOnce, { capture: true, passive: true });
}
// UI tap sound for every button press in the overlay.
document.getElementById('ui-root')!.addEventListener(
  'pointerup',
  (e) => {
    // (the bomb button has its own sound)
    if ((e.target as Element | null)?.closest?.('button:not(.bd-bomb)')) audio.sfx('uiTap');
  },
  { capture: true },
);

if (flag('invincible')) game.setInvincible(true);
if (flag('boss')) game.bossOnStart = true;
if (flag('midboss')) game.midBossOnStart = true;
const stageParam = Number(params.get('stage'));
if (params.has('stage') && stageParam >= 1) game.startStage = stageParam | 0;
if (flag('autostart') || flag('boss') || flag('midboss') || params.has('stage')) game.start();
if (params.has('power')) game.setPower(Number(params.get('power')) || 1);

declare global {
  interface Window {
    __bloom: {
      state(): ReturnType<Game['debugState']>;
      start(): void;
      setInvincible(on: boolean): void;
      skipToBoss(): void;
      skipToMidBoss(): void;
      movePlayer(x: number, y: number): void;
      pause(paused: boolean): void;
      breakBossPhase(): void;
      /** Fire the bomb (光の結界); false when not usable. */
      bomb(): boolean;
      /** Set shot power level 1..4. */
      setPower(n: number): void;
      /** Drop items as if an enemy died ahead (stars, power orbs, optional x/y/z). */
      dropItems(stars: number, orbs: number, x?: number, y?: number, z?: number): void;
      /** Jump to stage n (starts a run there if needed; keeps score / lives / power otherwise). */
      skipToStage(n: number): void;
      /** Defeat the current stage's boss now → tally → next stage (or ending after the last). Repeated calls skip the tally / transition / ending. */
      clearStage(): void;
      seed: number;
    };
  }
}

window.__bloom = {
  state: () => game.debugState(),
  start: () => game.start(),
  setInvincible: (on) => game.setInvincible(on),
  skipToBoss: () => game.skipToBoss(),
  skipToMidBoss: () => game.skipToMidBoss(),
  movePlayer: (x, y) => game.movePlayer(x, y),
  pause: (p) => game.setPaused(p),
  breakBossPhase: () => game.breakBossPhase(),
  bomb: () => game.useBomb(),
  setPower: (n) => game.setPower(n),
  dropItems: (s, o, x, y, z) => game.debugDrop(s, o, x, y, z),
  skipToStage: (n) => game.skipToStage(n),
  clearStage: () => game.clearStage(),
  seed,
};
