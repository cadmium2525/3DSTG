/**
 * BLOOM DIVE — DOM overlay UI (title, HUD, pause, settings, stage title card, stage-clear
 * tally, result).
 *
 * Input model: the overlay root is `pointer-events: none`; only buttons / panels
 * receive input, so drags anywhere else reach the game. Button presses stop
 * pointerdown/touchstart propagation so they never start a game drag.
 */
import './style.css';
import { PLAYER } from '../core/config';
import type { GameUI, HudData, ResultData, SaveStore, Settings, StageClearData, UiCallbacks } from '../core/types';
import {
  BARRIER_PIP,
  BOW,
  ICON_BARRIER,
  ICON_CLOSE,
  ICON_DRAG,
  ICON_GEAR,
  ICON_GRAZE,
  ICON_PAUSE,
  ICON_SHOT,
  ICON_SLOW,
  ICON_SOUND_OFF,
  ICON_SOUND_ON,
  SPRITE,
} from './icons';

type Screen = 'none' | 'title' | 'hud' | 'result';

const fmt = (n: number): string =>
  Math.max(0, Math.floor(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const fmtTime = (sec: number): string => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function q<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`ui: missing ${sel}`);
  return e;
}

/* ---------------- tap handling ---------------- */

// Last time any button fired; suppresses the ghost click that follows a touch/pointer tap.
let lastFire = -1e9;

/**
 * Fire `fn` synchronously inside the gesture: touchend for touch (the most reliable
 * audio-unlock event on iOS), pointerup for mouse/pen, click for keyboard / fallback.
 */
function onTap(target: HTMLElement, fn: (ev: Event) => void): void {
  let down = false;
  const fire = (ev: Event) => {
    lastFire = performance.now();
    fn(ev);
  };
  const inside = (x: number, y: number) => {
    const r = target.getBoundingClientRect();
    const pad = 12;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  };
  const stop = (e: Event) => e.stopPropagation();
  target.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    down = true;
    target.classList.add('is-down');
  });
  target.addEventListener('touchstart', stop, { passive: true });
  target.addEventListener('mousedown', stop);
  const release = () => {
    down = false;
    target.classList.remove('is-down');
  };
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    const was = down;
    if (e.pointerType === 'touch') {
      // touchend handles it; just clear the visual state once it has run.
      setTimeout(release, 0);
      return;
    }
    release();
    if (was && inside(e.clientX, e.clientY)) fire(e);
  });
  target.addEventListener(
    'touchend',
    (e) => {
      e.stopPropagation();
      const t = e.changedTouches[0];
      const was = down;
      release();
      if (was && t && inside(t.clientX, t.clientY)) fire(e);
    },
    { passive: true },
  );
  target.addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() - lastFire < 700) return;
    fire(e);
  });
}

/* ---------------- animation helper ---------------- */

const running = new WeakMap<Element, Animation>();

/** Restartable WAAPI animation (cancels the previous one on the same element). */
function play(e: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): void {
  if (typeof e.animate !== 'function') return;
  running.get(e)?.cancel();
  const a = e.animate(frames, opts);
  running.set(e, a);
}

/* ---------------- markup ---------------- */

const TITLE_HTML = `
  <div class="bd-title-top">
    <div class="bd-logo" aria-label="BLOOM DIVE">
      <span class="bd-logo-main">BLOOM</span>
      <span class="bd-logo-sub"><i></i>DIVE<i></i></span>
    </div>
    <div class="bd-hipill"><span class="bd-lab">HI-SCORE</span><b class="bd-title-hi">0</b></div>
  </div>
  <div class="bd-title-mid"></div>
  <div class="bd-title-bottom">
    <ul class="bd-howto">
      <li>${ICON_DRAG}<span>ドラッグで移動</span></li>
      <li>${ICON_SHOT}<span>ショットは自動</span></li>
      <li>${ICON_GRAZE}<span>弾にかすると得点</span></li>
    </ul>
    <button class="bd-btn bd-start" type="button"><span>タップしてスタート</span></button>
  </div>
  <button class="bd-icon-btn bd-gear" type="button" aria-label="設定">${ICON_GEAR}</button>
`;

const HUD_HTML = `
  <div class="bd-hud-top">
    <div class="bd-hud-row">
      <div class="bd-scorebox">
        <div class="bd-score-line"><span class="bd-lab">SCORE</span><b class="bd-score">0</b></div>
        <div class="bd-hi-line"><span class="bd-lab">HI</span><span class="bd-hi">0</span></div>
      </div>
      <button class="bd-icon-btn bd-pause-btn" type="button" aria-label="ポーズ">${ICON_PAUSE}</button>
    </div>
    <div class="bd-hud-row bd-hud-row2">
      <div class="bd-lives" aria-label="残機"></div>
      <div class="bd-grazebox">
        <span class="bd-lab">GRAZE</span><b class="bd-graze">0</b>
        <span class="bd-graze-pop" aria-hidden="true">GRAZE</span>
      </div>
    </div>
    <div class="bd-hud-row bd-hud-row3">
      <div class="bd-power" aria-label="ショットパワー">
        <span class="bd-lab">POWER</span><b class="bd-power-lv">Lv1</b>
        <span class="bd-power-segs"><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i></span>
      </div>
      <div class="bd-bombs" aria-label="結界"></div>
    </div>
    <div class="bd-boss" aria-hidden="true">
      <div class="bd-boss-head"><span class="bd-boss-name"></span><span class="bd-boss-pat"></span></div>
      <div class="bd-boss-bar"><i class="bd-boss-lag"></i><i class="bd-boss-fill"></i></div>
    </div>
  </div>
  <button class="bd-slow" type="button" aria-label="低速移動">${ICON_SLOW}<span>低速</span></button>
  <button class="bd-bomb" type="button" aria-label="光の結界（ボム）">${ICON_BARRIER}<span>結界</span><b class="bd-bomb-n">2</b></button>
`;

const SOUND_ROW = (cls: string) => `
  <div class="bd-row">
    <span class="bd-row-lab"><span class="bd-row-icon bd-sound-icon">${ICON_SOUND_ON}</span>サウンド</span>
    <button class="bd-switch ${cls}" type="button" role="switch" aria-label="サウンド"><i></i></button>
  </div>`;

const SETTINGS_HTML = `
  <div class="bd-panel bd-settings-panel" role="dialog" aria-label="設定">
    <div class="bd-panel-head">
      <h2>設定</h2>
      <button class="bd-icon-btn bd-close" type="button" aria-label="閉じる">${ICON_CLOSE}</button>
    </div>
    ${SOUND_ROW('bd-set-sound')}
    <div class="bd-row">
      <span class="bd-row-lab"><span class="bd-row-icon">${ICON_SLOW}</span>低速移動</span>
      <button class="bd-switch bd-set-slow" type="button" role="switch" aria-label="低速移動"><i></i></button>
    </div>
    <div class="bd-row bd-row-col">
      <span class="bd-row-lab">操作感度 <b class="bd-sens-val">1.0</b></span>
      <input class="bd-range bd-set-sens" type="range" min="0.5" max="2" step="0.1" aria-label="操作感度" />
      <div class="bd-range-ends"><span>ゆっくり</span><span>すばやく</span></div>
    </div>
    <div class="bd-row bd-row-col">
      <span class="bd-row-lab">画質</span>
      <div class="bd-seg bd-set-quality" role="radiogroup" aria-label="画質">
        <button type="button" data-q="auto">自動</button><button type="button" data-q="low">低</button><button type="button" data-q="high">高</button>
      </div>
    </div>
    <button class="bd-btn bd-btn-sub bd-settings-done" type="button">閉じる</button>
  </div>
`;

const PAUSE_HTML = `
  <div class="bd-panel bd-pause-panel" role="dialog" aria-label="ポーズ">
    <h2 class="bd-pause-title">PAUSE</h2>
    <button class="bd-btn bd-resume" type="button"><span>再開</span></button>
    ${SOUND_ROW('bd-pause-sound')}
    <button class="bd-btn bd-btn-sub bd-pause-title-btn" type="button">タイトルへ</button>
  </div>
`;

const RESULT_HTML = `
  <div class="bd-panel bd-result-panel">
    <h2 class="bd-result-title"></h2>
    <div class="bd-result-scorebox">
      <span class="bd-lab">SCORE</span>
      <b class="bd-result-score">0</b>
      <span class="bd-record">NEW RECORD</span>
    </div>
    <dl class="bd-stats">
      <div><dt>HI-SCORE</dt><dd class="bd-r-hi">0</dd></div>
      <div><dt>GRAZE</dt><dd class="bd-r-graze">0</dd></div>
      <div><dt>TIME</dt><dd class="bd-r-time">0:00.0</dd></div>
      <div><dt>残機</dt><dd class="bd-r-lives"></dd></div>
    </dl>
    <ol class="bd-r-stages"></ol>
    <div class="bd-result-btns">
      <button class="bd-btn bd-retry" type="button"><span>もう一度</span></button>
      <button class="bd-btn bd-btn-sub bd-totitle" type="button">タイトルへ</button>
    </div>
  </div>
`;

const TALLY_HTML = `
  <div class="bd-tally-head">
    <span class="bd-tally-no">STAGE 1</span>
    <b class="bd-tally-title"></b>
    <span class="bd-tally-clear">CLEAR</span>
  </div>
  <dl class="bd-tally-rows"></dl>
  <div class="bd-tally-total"><span>TOTAL</span><b class="bd-tally-sum">0</b></div>
`;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* ---------------- factory ---------------- */

export function createUI(root: HTMLElement, cb: UiCallbacks, save: SaveStore): GameUI {
  const ui = el('div', 'bd-ui');
  ui.insertAdjacentHTML('beforeend', SPRITE);
  ui.addEventListener('contextmenu', (e) => e.preventDefault());

  const flash = el('div', 'bd-flash');
  const col = el('div', 'bd-col');
  const title = el('section', 'bd-screen bd-title', TITLE_HTML);
  const hud = el('section', 'bd-screen bd-hud', HUD_HTML);
  const ann = el('div', 'bd-ann', '<span class="bd-ann-line"></span><b class="bd-ann-text"></b><span class="bd-ann-sub"></span><span class="bd-ann-line"></span>');
  const card = el('div', 'bd-stagecard', '<span class="bd-sc-no"></span><b class="bd-sc-title"></b><span class="bd-sc-sub"></span>');
  const tally = el('div', 'bd-tally', TALLY_HTML);
  col.append(title, hud, ann, card, tally);
  const result = el('section', 'bd-modal bd-result', RESULT_HTML);
  const pause = el('section', 'bd-modal bd-pause', PAUSE_HTML);
  const settings = el('section', 'bd-modal bd-settings', SETTINGS_HTML);
  ui.append(flash, col, result, pause, settings);
  root.appendChild(ui);

  let screen: Screen = 'none';
  let paused = false;

  const show = (e: HTMLElement, on: boolean) => e.classList.toggle('is-on', on);

  /* ---- settings sync ---- */
  const soundSwitches = [q(settings, '.bd-set-sound'), q(pause, '.bd-pause-sound')];
  const slowSwitch = q(settings, '.bd-set-slow');
  const slowBtn = q(hud, '.bd-slow');
  const sens = q<HTMLInputElement>(settings, '.bd-set-sens');
  const sensVal = q(settings, '.bd-sens-val');
  const qualityBtns = Array.from(settings.querySelectorAll<HTMLButtonElement>('.bd-set-quality button'));
  const soundIcons = Array.from(ui.querySelectorAll<HTMLElement>('.bd-sound-icon'));

  const sync = () => {
    const s = save.settings;
    for (const sw of soundSwitches) {
      sw.classList.toggle('is-on', !s.muted);
      sw.setAttribute('aria-checked', String(!s.muted));
    }
    for (const ic of soundIcons) ic.innerHTML = s.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    slowSwitch.classList.toggle('is-on', s.slowMode);
    slowSwitch.setAttribute('aria-checked', String(s.slowMode));
    slowBtn.classList.toggle('is-on', s.slowMode);
    slowBtn.setAttribute('aria-pressed', String(s.slowMode));
    sens.value = String(s.sensitivity);
    sensVal.textContent = `${s.sensitivity.toFixed(1)}×`;
    sens.style.setProperty('--p', `${((s.sensitivity - 0.5) / 1.5) * 100}%`);
    for (const b of qualityBtns) b.classList.toggle('is-on', b.dataset.q === s.quality);
  };

  const change = (fn: (s: Settings) => void) => {
    fn(save.settings);
    save.saveSettings();
    sync();
    cb.onSettingsChanged();
  };

  for (const sw of soundSwitches) onTap(sw, () => change((s) => (s.muted = !s.muted)));
  onTap(slowSwitch, () => change((s) => (s.slowMode = !s.slowMode)));
  onTap(slowBtn, () => change((s) => (s.slowMode = !s.slowMode)));
  for (const b of qualityBtns) {
    onTap(b, () => change((s) => (s.quality = (b.dataset.q as Settings['quality']) ?? 'auto')));
  }
  for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) {
    sens.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }
  sens.addEventListener('input', () => {
    const v = parseFloat(sens.value);
    if (Number.isFinite(v)) change((s) => (s.sensitivity = v));
  });

  // Panels swallow presses so the game never sees a drag starting on them.
  for (const p of ui.querySelectorAll<HTMLElement>('.bd-panel')) {
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  /* ---- title ---- */
  const titleHi = q(title, '.bd-title-hi');
  onTap(q(title, '.bd-start'), () => {
    if (screen !== 'title' || settings.classList.contains('is-on')) return;
    cb.onStart();
  });
  const openSettings = (on: boolean) => {
    if (on) sync();
    show(settings, on);
  };
  onTap(q(title, '.bd-gear'), () => openSettings(true));
  onTap(q(settings, '.bd-close'), () => openSettings(false));
  onTap(q(settings, '.bd-settings-done'), () => openSettings(false));
  // Tap on the dim backdrop closes the settings.
  settings.addEventListener('pointerdown', (e) => {
    if (e.target === settings) {
      e.stopPropagation();
      openSettings(false);
    }
  });

  /* ---- HUD ---- */
  const hScore = q(hud, '.bd-score');
  const hHi = q(hud, '.bd-hi');
  const hGraze = q(hud, '.bd-graze');
  const hLives = q(hud, '.bd-lives');
  const hPop = q(hud, '.bd-graze-pop');
  const boss = q(hud, '.bd-boss');
  const bossName = q(hud, '.bd-boss-name');
  const bossPat = q(hud, '.bd-boss-pat');
  const bossFill = q(hud, '.bd-boss-fill');
  const bossLag = q(hud, '.bd-boss-lag');
  const hPower = q(hud, '.bd-power');
  const hPowerLv = q(hud, '.bd-power-lv');
  const hPowerSegs = Array.from(hud.querySelectorAll<HTMLElement>('.bd-power-segs b'));
  const hBombs = q(hud, '.bd-bombs');
  const bombBtn = q(hud, '.bd-bomb');
  const bombN = q(hud, '.bd-bomb-n');
  const prev = { score: -1, hi: -1, graze: -1, lives: -1, slots: 0, boss: false, name: '', pat: '', hp: -1, bombs: -1, power: -1, pp: -1 };

  const renderLives = (n: number) => {
    const slots = Math.max(PLAYER.lives, n);
    if (slots !== prev.slots) {
      hLives.innerHTML = BOW.repeat(Math.min(slots, 8));
      prev.slots = slots;
    }
    const icons = hLives.children;
    for (let i = 0; i < icons.length; i++) icons[i].classList.toggle('is-lost', i >= n);
  };

  // Bomb fires on press (not release) so a 決死ボム within a fraction of a second is possible.
  let cardUntil = 0;
  let annFree = 0;
  const showBanner = (text: string, sub?: string) => {
      annText.textContent = text;
      annSub.textContent = sub ?? '';
      annSub.style.display = sub ? '' : 'none';
      play(
        ann,
        [
          { opacity: 0, transform: 'translate(-50%, 0) scale(1.18)', filter: 'blur(6px)', offset: 0 },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)', filter: 'blur(0px)', offset: 0.14 },
          { opacity: 1, transform: 'translate(-50%, 0) scale(0.98)', filter: 'blur(0px)', offset: 0.8 },
          { opacity: 0, transform: 'translate(-50%, -12px) scale(0.96)', filter: 'blur(4px)', offset: 1 },
        ],
        { duration: 1800, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
      );
  };
  let bombAt = -1e9;
  const fireBomb = () => {
    if (screen !== 'hud' || paused) return;
    bombAt = performance.now();
    if (bombBtn.classList.contains('is-empty')) {
      // No stock: shake so the tap is visibly acknowledged.
      play(bombBtn, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' });
      return;
    }
    cb.onBomb();
    play(bombBtn, [{ transform: 'scale(0.86)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  };
  bombBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    fireBomb();
  });
  for (const ev of ['touchstart', 'mousedown', 'pointerup', 'touchend'] as const) {
    bombBtn.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }
  bombBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() - bombAt > 700) fireBomb(); // keyboard / assistive activation
  });

  onTap(q(hud, '.bd-pause-btn'), () => {
    if (screen === 'hud' && !paused) cb.onPause(true);
  });

  /* ---- pause ---- */
  onTap(q(pause, '.bd-resume'), () => {
    if (paused) cb.onPause(false);
  });
  onTap(q(pause, '.bd-pause-title-btn'), () => cb.onBackToTitle());

  /* ---- result ---- */
  const rTitle = q(result, '.bd-result-title');
  const rScore = q(result, '.bd-result-score');
  const rRecord = q(result, '.bd-record');
  const rHi = q(result, '.bd-r-hi');
  const rGraze = q(result, '.bd-r-graze');
  const rTime = q(result, '.bd-r-time');
  const rLives = q(result, '.bd-r-lives');
  const rStages = q(result, '.bd-r-stages');
  let countRaf = 0;
  let resultAt = 0;
  // Ignore result buttons briefly so a frantic drag/tap at game end doesn't skip the screen.
  const armed = () => performance.now() - resultAt > 650;
  onTap(q(result, '.bd-retry'), () => {
    if (screen === 'result' && armed()) cb.onRetry();
  });
  onTap(q(result, '.bd-totitle'), () => {
    if (screen === 'result' && armed()) cb.onBackToTitle();
  });

  /* ---- stage title card / tally ---- */
  const scNo = q(card, '.bd-sc-no');
  const scTitle = q(card, '.bd-sc-title');
  const scSub = q(card, '.bd-sc-sub');
  const tNo = q(tally, '.bd-tally-no');
  const tTitle = q(tally, '.bd-tally-title');
  const tRows = q(tally, '.bd-tally-rows');
  const tSum = q(tally, '.bd-tally-sum');
  let tallyRaf = 0;
  const hideTally = () => {
    cancelAnimationFrame(tallyRaf);
    tally.classList.remove('is-on');
  };

  /* ---- announce / feedback ---- */
  const annText = q(ann, '.bd-ann-text');
  const annSub = q(ann, '.bd-ann-sub');

  const setScreen = (s: Screen) => {
    screen = s;
    show(title, s === 'title');
    show(hud, s === 'hud');
    show(result, s === 'result');
    if (s !== 'hud') hideTally();
    if (s !== 'title') show(settings, false);
    if (s !== 'hud') {
      paused = false;
      show(pause, false);
    }
    ui.dataset.screen = s;
  };

  sync();

  return {
    showTitle(hiScore: number) {
      cancelAnimationFrame(countRaf);
      titleHi.textContent = fmt(hiScore);
      sync();
      setScreen('title');
    },

    showHud() {
      cancelAnimationFrame(countRaf);
      sync();
      setScreen('hud');
    },

    updateHud(d: HudData) {
      if (d.score !== prev.score) {
        prev.score = d.score;
        hScore.textContent = fmt(d.score);
      }
      if (d.hiScore !== prev.hi) {
        prev.hi = d.hiScore;
        hHi.textContent = fmt(d.hiScore);
      }
      if (d.graze !== prev.graze) {
        prev.graze = d.graze;
        hGraze.textContent = fmt(d.graze);
      }
      if (d.lives !== prev.lives) {
        prev.lives = d.lives;
        renderLives(Math.max(0, d.lives));
      }
      if (d.bombs !== prev.bombs) {
        const n = Math.max(0, d.bombs);
        if (n < prev.bombs) play(hBombs, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
        prev.bombs = n;
        hBombs.innerHTML = BARRIER_PIP.repeat(Math.min(n, 6));
        bombN.textContent = String(n);
        bombBtn.classList.toggle('is-empty', n <= 0);
        bombBtn.setAttribute('aria-disabled', String(n <= 0));
      }
      const pp = Math.round(Math.min(1, Math.max(0, d.powerProgress)) * 50) / 50;
      if (d.power !== prev.power || pp !== prev.pp) {
        const up = prev.power > 0 && d.power > prev.power;
        prev.power = d.power;
        prev.pp = pp;
        const max = d.power >= 4;
        hPowerLv.textContent = max ? 'MAX' : `Lv${d.power}`;
        hPower.classList.toggle('is-max', max);
        for (let i = 0; i < hPowerSegs.length; i++) {
          const f = i < d.power ? 1 : i === d.power ? pp : 0;
          hPowerSegs[i].style.transform = `scaleX(${f})`;
        }
        if (up) play(hPower, [{ transform: 'scale(1.18)', filter: 'brightness(1.8)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 480, easing: 'ease-out' });
      }
      const b = d.boss;
      if (!!b !== prev.boss) {
        prev.boss = !!b;
        boss.classList.toggle('is-on', !!b);
        if (!b) prev.hp = -1;
      }
      if (b) {
        if (b.name !== prev.name) {
          prev.name = b.name;
          bossName.textContent = b.name;
        }
        const pat = b.pattern ?? '';
        if (pat !== prev.pat) {
          prev.pat = pat;
          bossPat.textContent = pat;
          if (pat) play(bossPat, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'ease-out' });
        }
        // Quantise to 0.1% so tiny float jitter doesn't touch the DOM.
        const hp = Math.round(Math.min(1, Math.max(0, b.hp)) * 1000) / 1000;
        if (hp !== prev.hp) {
          const healed = hp > prev.hp;
          prev.hp = hp;
          bossFill.style.transform = `scaleX(${hp})`;
          bossLag.style.transform = `scaleX(${hp})`;
          // On refill (new phase) skip the lagging "damage" trail.
          bossLag.classList.toggle('no-lag', healed);
        }
      }
    },

    showResult(r: ResultData) {
      cancelAnimationFrame(countRaf);
      resultAt = performance.now();
      result.classList.toggle('is-clear', r.cleared);
      result.classList.toggle('is-over', !r.cleared);
      rTitle.textContent = r.allClear ? 'ALL CLEAR' : r.cleared ? 'STAGE CLEAR' : 'GAME OVER';
      const st = r.stages ?? [];
      rStages.innerHTML = st
        .map(
          (x) =>
            `<li class="${x.cleared ? 'is-clear' : 'is-fail'}"><span class="bd-rs-no">STAGE ${x.number}</span>` +
            `<span class="bd-rs-title">${esc(x.title)}</span><span class="bd-rs-mark">${x.cleared ? 'CLEAR' : '—'}</span>` +
            `<b class="bd-rs-score">${fmt(x.score)}</b></li>`,
        )
        .join('');
      rStages.style.display = st.length > 1 || (st.length === 1 && !r.cleared && st[0].number > 1) ? '' : 'none';
      rRecord.classList.remove('is-on');
      rHi.textContent = fmt(Math.max(r.hiScore, r.newRecord ? r.score : 0));
      rGraze.textContent = fmt(r.graze);
      rTime.textContent = fmtTime(r.timeSec);
      const lives = Math.max(0, r.livesLeft);
      rLives.innerHTML = lives > 0 ? BOW.repeat(Math.min(lives, 8)) : '<span class="bd-none">0</span>';
      rScore.textContent = '0';
      setScreen('result');

      // Score count-up (ease-out), then the NEW RECORD badge.
      const target = Math.max(0, Math.floor(r.score));
      const dur = Math.min(1600, 500 + Math.log10(target + 1) * 160);
      const t0 = performance.now() + 250;
      let last = -1;
      const stepFn = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        const v = Math.floor(target * (1 - Math.pow(1 - k, 3)));
        if (v !== last) {
          last = v;
          rScore.textContent = fmt(v);
        }
        if (k < 1) countRaf = requestAnimationFrame(stepFn);
        else if (r.newRecord) rRecord.classList.add('is-on');
      };
      countRaf = requestAnimationFrame(stepFn);
    },

    setPaused(p: boolean) {
      paused = p && screen === 'hud';
      show(pause, paused);
      if (paused) sync();
    },

    stageTitle(stage: number, titleText: string, subtitle: string) {
      cardUntil = performance.now() + 2700;
      scNo.textContent = `STAGE ${stage}`;
      scTitle.textContent = titleText;
      scSub.textContent = subtitle;
      play(
        card,
        [
          { opacity: 0, transform: 'translate(-50%, 8px)', filter: 'blur(8px)', letterSpacing: '0.6em', offset: 0 },
          { opacity: 1, transform: 'translate(-50%, 0)', filter: 'blur(0px)', letterSpacing: '0.32em', offset: 0.16 },
          { opacity: 1, transform: 'translate(-50%, 0)', filter: 'blur(0px)', letterSpacing: '0.28em', offset: 0.82 },
          { opacity: 0, transform: 'translate(-50%, -10px)', filter: 'blur(6px)', letterSpacing: '0.24em', offset: 1 },
        ],
        { duration: 3000, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
      );
    },

    showStageClear(d: StageClearData) {
      cancelAnimationFrame(tallyRaf);
      tNo.textContent = `STAGE ${d.stage}`;
      tTitle.textContent = d.title + (d.placeholder ? '（仮）' : '');
      const rows: [string, string, number][] = [
        ['STAGE SCORE', '', d.stageScore],
        ['GRAZE', '', d.graze],
        ['ITEMS', `★ ${fmt(d.stars)}  ◆ ${fmt(d.orbs)}`, -1],
        ...d.bonus.map((b): [string, string, number] => [b.label, '', b.value]),
      ];
      tRows.innerHTML = rows
        .map(
          ([k, txt, v], i) =>
            `<div style="animation-delay:${0.25 + i * 0.16}s"${i >= 3 ? ' class="is-bonus"' : ''}><dt>${esc(k)}</dt>` +
            `<dd data-v="${v}">${v < 0 ? esc(txt) : i >= 3 ? '+0' : '0'}</dd></div>`,
        )
        .join('');
      const cells = Array.from(tRows.querySelectorAll<HTMLElement>('dd[data-v]')).filter((c) => Number(c.dataset.v) >= 0);
      const startTotal = d.total - d.bonus.reduce((a, b) => a + b.value, 0);
      tSum.textContent = fmt(startTotal);
      tally.classList.remove('is-on');
      void tally.offsetWidth; // restart the CSS entry animation
      tally.classList.add('is-on');
      const t0 = performance.now() + 300;
      const dur = 1300;
      const stepFn = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = 1 - Math.pow(1 - k, 3);
        cells.forEach((c, i) => {
          const v = Math.floor(Number(c.dataset.v) * e);
          c.textContent = (i >= 2 ? '+' : '') + fmt(v);
        });
        tSum.textContent = fmt(startTotal + (d.total - startTotal) * e);
        if (k < 1) tallyRaf = requestAnimationFrame(stepFn);
      };
      tallyRaf = requestAnimationFrame(stepFn);
    },

    hideStageClear() {
      hideTally();
    },

    announce(text: string, sub?: string) {
      // Never overlap the stage title card: wait until it has faded.
      // Banners wait for the stage card and for each other (1.8 s slots).
      const now = performance.now();
      const at = Math.max(now, cardUntil, annFree);
      annFree = at + 1800;
      if (at > now + 1) window.setTimeout(() => showBanner(text, sub), at - now);
      else showBanner(text, sub);
    },

    flashDamage() {
      play(flash, [{ opacity: 1 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'both' });
      play(hud, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260, easing: 'linear' });
    },

    pulseGraze() {
      play(hPop, [
        { opacity: 0, transform: 'translate(0, 4px) scale(0.8)' },
        { opacity: 1, transform: 'translate(0, 0) scale(1.05)', offset: 0.2 },
        { opacity: 0, transform: 'translate(0, -14px) scale(1)' },
      ], { duration: 520, easing: 'ease-out', fill: 'both' });
      play(hGraze, [{ transform: 'scale(1.25)', color: '#ffffff' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    },
  };
}
