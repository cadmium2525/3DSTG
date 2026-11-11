/**
 * Dev harness for the UI / audio / save modules (open /dev/ui.html).
 * Keys: 1 title, 2 hud, 3 boss, 4 announce, 5 damage, 6 graze, 7 pause,
 *       8 result clear, 9 result game over, h hide dev bar.
 * Query: ?screen=title|hud|boss|pause|clear|over|settings&hide=1 (for screenshots).
 */
import { createAudio } from '../src/audio';
import type { BgmTrack, HudData, SfxName } from '../src/core/types';
import { PATTERN_NAMES } from '../src/core/types';
import { createSaveStore } from '../src/save';
import { createUI } from '../src/ui';

const save = createSaveStore();
const audio = createAudio();
const logEl = document.createElement('div');
logEl.id = 'log';
const log = (s: string) => {
  logEl.textContent = `${s}\n${logEl.textContent ?? ''}`.slice(0, 600);
  console.log('[dev]', s);
};

let hudTimer = 0;
const hud: HudData = { score: 0, hiScore: save.hiScore, lives: 3, graze: 0, boss: null };

const ui = createUI(document.getElementById('ui-root')!, {
  onStart() {
    audio.unlock();
    audio.playBgm('stage');
    log('onStart');
    startHud(false);
  },
  onRetry() {
    audio.unlock();
    log('onRetry');
    startHud(false);
  },
  onBackToTitle() {
    log('onBackToTitle');
    stopHud();
    ui.showTitle(save.hiScore);
    audio.playBgm('title');
  },
  onPause(p) {
    log(`onPause(${p})`);
    ui.setPaused(p);
    audio.setPaused(p);
  },
  onSettingsChanged() {
    log(`settings ${JSON.stringify(save.settings)}`);
    audio.setMuted(save.settings.muted);
  },
}, save);

function stopHud() {
  clearInterval(hudTimer);
  hudTimer = 0;
}

function startHud(withBoss: boolean) {
  stopHud();
  Object.assign(hud, { score: 0, lives: 3, graze: 0, boss: null, hiScore: save.hiScore });
  ui.showHud();
  if (withBoss) hud.boss = { name: '星環の魔女 アストレア', hp: 1, pattern: PATTERN_NAMES.spiralCorridor };
  ui.updateHud(hud);
  let t = 0;
  hudTimer = window.setInterval(() => {
    t++;
    hud.score += 120 + Math.floor(Math.random() * 400);
    if (Math.random() < 0.4) {
      hud.graze += 1;
      ui.pulseGraze();
    }
    hud.hiScore = Math.max(hud.hiScore, hud.score);
    if (hud.boss) {
      hud.boss.hp = Math.max(0, hud.boss.hp - 0.01);
      if (hud.boss.hp <= 0) hud.boss.hp = 1;
      const pats = [PATTERN_NAMES.spiralCorridor, PATTERN_NAMES.petalBloom, PATTERN_NAMES.rippleRing];
      hud.boss.pattern = pats[Math.floor(t / 40) % 3];
    }
    ui.updateHud(hud);
  }, 100);
}

function showResult(cleared: boolean) {
  stopHud();
  const score = cleared ? 1234560 : 345670;
  const newRecord = save.submitScore(score) || cleared;
  ui.showResult({ cleared, score, hiScore: save.hiScore, newRecord, graze: 187, timeSec: 78.4, livesLeft: cleared ? 2 : 0 });
}

const actions: Record<string, () => void> = {
  title: () => {
    stopHud();
    ui.showTitle(save.hiScore || 1234560);
  },
  hud: () => startHud(false),
  boss: () => startHud(true),
  announce: () => ui.announce('星環の魔女', 'SPIRAL CORRIDOR'),
  damage: () => {
    ui.flashDamage();
    hud.lives = Math.max(0, hud.lives - 1);
    ui.updateHud(hud);
  },
  graze: () => ui.pulseGraze(),
  pause: () => ui.setPaused(true),
  clear: () => showResult(true),
  over: () => showResult(false),
  settings: () => {
    actions.title();
    (document.querySelector('.bd-gear') as HTMLElement).click();
  },
};

const dev = document.getElementById('dev')!;
const btn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  dev.appendChild(b);
};
for (const k of Object.keys(actions)) btn(k, actions[k]);
const tracks: BgmTrack[] = ['title', 'stage', 'midboss', 'boss'];
for (const tr of tracks)
  btn(`♪${tr}`, () => {
    audio.unlock();
    audio.playBgm(tr);
  });
btn('♪stop', () => audio.stopBgm());
const sfxNames: SfxName[] = ['shot', 'enemyHit', 'enemyDown', 'graze', 'playerHit', 'bossWarning', 'midbossDown', 'bossDown', 'uiTap', 'clear', 'gameOver'];
for (const s of sfxNames)
  btn(s, () => {
    audio.unlock();
    audio.sfx(s);
  });
btn('shot x8/s', () => {
  audio.unlock();
  let n = 0;
  const id = setInterval(() => {
    audio.sfx('shot');
    if (++n > 40) clearInterval(id);
  }, 125);
});
dev.appendChild(logEl);
setInterval(() => {
  if (audio.beat > 0) dev.dataset.beat = `${audio.beat.toFixed(2)} @ ${audio.bpm}`;
}, 250);

const keys: Record<string, string> = { '1': 'title', '2': 'hud', '3': 'boss', '4': 'announce', '5': 'damage', '6': 'graze', '7': 'pause', '8': 'clear', '9': 'over' };
window.addEventListener('keydown', (e) => {
  if (e.key === 'h') dev.classList.toggle('hidden');
  const a = keys[e.key];
  if (a) actions[a]();
});

const params = new URLSearchParams(location.search);
if (params.get('hide')) dev.classList.add('hidden');
(actions[params.get('screen') ?? 'title'] ?? actions.title)();

// Hooks for automated checks (Playwright).
Object.assign(window, { __dev: { ui, audio, save, actions, hud, tracks, sfxNames } });
