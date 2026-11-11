/**
 * BLOOM DIVE — entry point. Creates the shared modules, boots the game and
 * exposes debug hooks (window.__bloom) + URL params for automated testing:
 *   ?autostart=1  start immediately      ?invincible=1  no damage
 *   ?boss=1       start at the boss      ?seed=N        deterministic seed
 *   ?midboss=1    start at the mid-boss
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
  },
  save,
);

game.boot(ui);

if (flag('invincible')) game.setInvincible(true);
if (flag('boss')) game.bossOnStart = true;
if (flag('midboss')) game.midBossOnStart = true;
if (flag('autostart') || flag('boss') || flag('midboss')) game.start();

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
  seed,
};
