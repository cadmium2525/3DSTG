/**
 * Game core: renderer, loop, state machine (title / playing / paused / result), the multi-stage
 * flow and the wiring between player, shots, enemies, bosses, danmaku, UI and audio.
 *
 * Run flow (state 'playing', sub-phase in `phase`):
 *   stage → (mid-boss inside 'stage') → boss → clearing (boss down, items magnet)
 *   → tally (stage-clear panel, bonus) → transition (background morphs, stage title) → next stage …
 *   → after the last stage's tally: ending (EndingSequence) → final result.
 *   Game over at any point: dying → result. Lives / bombs / power carry over between stages.
 * Everything stage-specific comes from the StageDef (src/game/stages/).
 */
import * as THREE from 'three';
import { FIELD, PALETTE, PLAYER } from '../core/config';
import {
  PATTERN_NAMES,
  type AudioEngine,
  type Danmaku,
  type GameUI,
  type HudData,
  type SaveStore,
  type SfxName,
  type StageResult,
} from '../core/types';
import { Background } from './Background';
import { BossState, type BossConfig, type BossEvents, type BossLike } from './bosses/BossLike';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Enemies, MAX_ENEMIES } from './Enemies';
import type { EnemyKindDef } from './enemies/registry';
import { createEnding, type EndingSequence } from './Ending';
import { Input } from './Input';
import { Player } from './Player';
import { TitleIntro } from './TitleIntro';
import { Quality, type QualityLevel } from './Quality';
import { Rng } from './Rng';
import { Shots, Targets } from './Shots';
import { Stage } from './Stage';
import { BOMB, ITEMS, POWER, SCORE } from './StageData';
import { Items, ItemKind } from './Items';
import { Bomb } from './Bomb';
import { eventTime, getStage, STAGES, stageCount, validateStages } from './stages';
import { DIFFICULTY, type Difficulty, type ScoreTable, type StageDef } from './stages/types';

export type GameState = 'title' | 'playing' | 'paused' | 'result';
/** Sub-state while playing. */
type PlayPhase = 'stage' | 'boss' | 'dying' | 'clearing' | 'tally' | 'transition' | 'ending';
type BossRole = 'boss' | 'midboss';

const BOSS_ID = MAX_ENEMIES;
const MIDBOSS_ID = MAX_ENEMIES + 1;
const MAX_DT = 1 / 20;
const HUD_INTERVAL = 0.1;
const PIXEL_RATIO_CAP: Record<QualityLevel, number> = { 0: 1, 1: 1.5, 2: 2 };
/** Orbs needed to reach power Lv1..4 (cumulative POWER.perLevel). */
const POWER_AT = POWER.perLevel.reduce((a, n) => (a.push(a[a.length - 1] + n), a), [0]);
const POWER_MAX = POWER_AT[POWER_AT.length - 1];
/** Seconds of the stage-clear tally, and of the flight to the next stage. */
const TALLY_SEC = 4.6;
const TRANSITION_SEC = 3.6;

function phaseName(cfg: BossConfig, i: number): string {
  const p = cfg.phases[i];
  return p.name ?? p.patterns.map((x) => PATTERN_NAMES[x.id]).join(' + ');
}

export interface GameDeps {
  canvas: HTMLCanvasElement;
  app: HTMLElement;
  danmaku: Danmaku;
  audio: AudioEngine;
  save: SaveStore;
  seed: number;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly quality: Quality;
  ui!: GameUI;
  state: GameState = 'title';
  private phase: PlayPhase = 'stage';

  private danmaku: Danmaku;
  private audio: AudioEngine;
  private save: SaveStore;
  private app: HTMLElement;
  private seed: number;
  private rng: Rng;
  private input: Input;
  private bg: Background;
  private effects: Effects;
  private player: Player;
  private intro: TitleIntro;
  private titleShown = false;
  private shots: Shots;
  private targets = new Targets();
  private enemies: Enemies;
  private stage: Stage;

  // Stages (src/game/stages). Bosses are created per StageDef and cached.
  /** 1-based number of the stage being played. */
  stageNo = 1;
  private def: StageDef = STAGES[0];
  private sc: ScoreTable = SCORE;
  difficulty: Difficulty = DIFFICULTY.normal;
  private bossCache = new Map<string, BossLike>();
  private boss!: BossLike;
  private midBoss: BossLike | null = null;
  private hudBoss = { name: '', hp: 1, pattern: '' as string | undefined };
  private hudMid = { name: '', hp: 1, pattern: '' as string | undefined };
  midBossOnStart = false;
  /** Debug / ?stage=N: the next start() begins at this stage (consumed). */
  startStage = 0;
  private stageResults: StageResult[] = [];
  private stageStartScore = 0;
  private stageStartGraze = 0;
  private stageMisses = 0;
  private stageStars = 0;
  private stageOrbs = 0;
  private phaseT = 0;
  private bannerT = -1;
  private ending: EndingSequence | null = null;
  private lightV = new THREE.Vector3();

  // Items, shot power, bomb (see Items.ts / Bomb.ts / StageData ITEMS, POWER, BOMB).
  private items: Items;
  private bomb: Bomb;
  bombs: number = BOMB.stock;
  private powerOrbs = 0;
  private maxPower = 1;
  /** Fractional power-orb drops accumulated across small-enemy kills. */
  private dropBank = 0;
  /** > 0 while a hit waits for a 決死ボム (deathbomb). */
  private hitPendingT = 0;
  /** Mirrors bomb.active on #app[data-bomb-active] (the UI dims the button). */
  private bombBusy = false;

  // Score / run stats.
  score = 0;
  graze = 0;
  playTime = 0;
  private misses = 0;
  private grazeChain = 0;
  private lastGrazeT = -10;
  private endTimer = 0;

  // Loop.
  private last = 0;
  private time = 0;
  private viewW = 1;
  private viewH = 1;
  private needsRender = true;

  // Throttles.
  private hud: HudData = { score: 0, hiScore: 0, lives: PLAYER.lives, graze: 0, bombs: BOMB.stock, power: 1, powerProgress: 0, boss: null };
  private hudTimer = 0;
  private hudDirty = true;
  private sfxT: Partial<Record<SfxName, number>> = {};
  private grazePulseT = 0;
  private drag = { x: 0, y: 0 };

  // Debug.
  bossOnStart = false;

  constructor(d: GameDeps) {
    this.danmaku = d.danmaku;
    this.audio = d.audio;
    this.save = d.save;
    this.app = d.app;
    this.seed = d.seed;
    this.rng = new Rng(d.seed);

    if (import.meta.env.DEV) for (const e of validateStages()) console.warn('[stages]', e);

    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      canvas: d.canvas,
      antialias: dpr < 1.5,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(PALETTE.bg, 1);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene;
    // Background owns the clear colour, fog and lights (per-stage presets).
    this.bg = new Background(new Rng(d.seed ^ 0x5bd1e995));
    this.bg.attach(scene);
    this.effects = new Effects(this.rng);
    scene.add(this.effects.group);
    this.player = new Player();
    scene.add(this.player.group);
    this.intro = new TitleIntro(this.player, this.effects);
    scene.add(this.intro.group);
    this.shots = new Shots();
    scene.add(this.shots.mesh);
    this.items = new Items(this.rng, this.effects, this.onCollect);
    scene.add(this.items.mesh);
    this.bomb = new Bomb();
    scene.add(this.bomb.group);

    this.enemies = new Enemies(this.danmaku, this.rng, {
      onKilled: (_kind, def, x, y, z) => this.onEnemyKilled(def, x, y, z),
      onHit: (x, y, z) => {
        this.effects.burst(x, y, z + 0.5, PALETTE.cyan, 2, 5, 0.3, 0.25);
        this.sfx('enemyHit', 0.06);
      },
    }, this.effects);
    scene.add(this.enemies.group);

    scene.add(this.danmaku.object3d);

    this.stage = new Stage({
      wave: (w) => this.enemies.spawnWave(w),
      intro: (e) => {
        this.enemies.spawnLantern(e.pattern, e.duration, e.intensity, e.kind);
        this.ui.announce(PATTERN_NAMES[e.pattern], e.sub);
      },
      announce: (e) => this.ui.announce(e.text ?? '', e.sub),
      warning: (e) => {
        this.enemies.retreatAll();
        this.ui.announce(e.text ?? 'WARNING', e.sub ?? this.def.warningText ?? '強大な魔力反応が接近中');
        this.sfx('bossWarning');
        // Boss theme starts under the alarm (the alarm ducks the BGM).
        this.audio.playBgm(this.def.bgm.boss);
        this.rig.shake(0.08, 1.5);
      },
      scenery: (e) => this.bg.scenery(e.name, e.duration),
      midBoss: () => this.beginMidBoss(),
      boss: () => this.beginBoss(),
    });
    this.applyStageDef(STAGES[0]);

    this.quality = new Quality(this.save.settings.quality, (l) => this.applyQuality(l));

    this.input = new Input(this.app);
    this.input.onPauseKey = () => {
      if (this.state === 'playing') this.setPaused(true);
      else if (this.state === 'paused') this.setPaused(false);
    };
    this.input.onBombKey = () => this.useBomb();

    // Resize / orientation.
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => this.onVisibility());

    this.resize();
    this.player.reset();
    this.player.position.set(0, 0, 0);
    this.rig.snap();
  }

  /** Must be called once after the UI exists. */
  boot(ui: GameUI): void {
    this.ui = ui;
    this.audio.setMuted(this.save.settings.muted);
    this.toTitle();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------------------ */
  /* Stages / bosses                                                     */
  /* ------------------------------------------------------------------ */

  /** Boss instance for a stage + role (created once, then reused). */
  private getBoss(def: StageDef, role: BossRole): BossLike | null {
    const slot = role === 'boss' ? def.boss : def.midBoss;
    if (!slot) return null;
    const key = `${def.id}:${role}`;
    let b = this.bossCache.get(key);
    if (!b) {
      b = slot.create({
        danmaku: this.danmaku,
        effects: this.effects,
        rng: this.rng,
        events: this.makeBossEvents(role),
        config: slot.config,
        difficulty: this.difficulty,
        role,
      });
      this.scene.add(b.group);
      this.bossCache.set(key, b);
    }
    return b;
  }

  /** Point every stage-dependent system at `def` (bosses reset, timeline rewound). */
  private applyStageDef(def: StageDef): void {
    this.def = def;
    this.stageNo = def.number;
    this.sc = def.score ? { ...SCORE, ...def.score } : SCORE;
    for (const b of this.bossCache.values()) b.reset();
    this.boss = this.getBoss(def, 'boss')!;
    this.midBoss = this.getBoss(def, 'midboss');
    this.hudBoss.name = def.boss.config.name;
    this.hudMid.name = def.midBoss?.config.name ?? '';
    this.midBossResult = null;
    this.enemies.difficulty = this.difficulty;
    this.stage.reset(def.events);
  }

  /** Start playing stage `n` (stats of the run carry over). */
  private beginStage(n: number, viaTransition: boolean): void {
    const def = getStage(n);
    this.applyStageDef(def);
    this.phase = 'stage';
    this.phaseT = 0;
    this.stageStartScore = this.score;
    this.stageStartGraze = this.graze;
    this.stageMisses = 0;
    this.stageStars = 0;
    this.stageOrbs = 0;
    this.bg.setPreset(def.background, viaTransition ? TRANSITION_SEC : 1.4);
    this.audio.playBgm(def.bgm.stage);
    this.bannerT = viaTransition ? -1 : 0.5;
    this.hudDirty = true;
  }

  private makeBossEvents(role: BossRole): BossEvents {
    const self = () => (role === 'boss' ? this.boss : this.midBoss)!;
    const hud = () => (role === 'boss' ? this.hudBoss : this.hudMid);
    return {
      onPhaseStart: (i) => {
        const cfg = self().config;
        const name = phaseName(cfg, i);
        const n = cfg.phases.length;
        this.ui.announce(name, role === 'boss' ? `SPELL ${i + 1} / ${n}` : `MID BOSS  ${i + 1} / ${n}`);
        hud().pattern = name;
        this.hudDirty = true;
      },
      onPhaseEnd: (i, broken) => {
        const b = self();
        const p = b.position;
        const last = i >= b.config.phases.length - 1;
        hud().pattern = undefined;
        this.hudDirty = true;
        if (role === 'boss') {
          // Cancelled bullets already turned into star items (onBulletCancel).
          if (broken) this.addScore(this.sc.phaseBreak);
          this.items.magnetAll();
          if (broken && !last) {
            this.items.drop(ItemKind.Star, p.x, p.y, p.z, ITEMS.bossPhase.stars, ITEMS.starValue, 2);
            this.items.drop(ItemKind.Power, p.x, p.y, p.z, ITEMS.bossPhase.power, 1, 1.6);
          }
          this.effects.ring(p.x, p.y, p.z + 2, broken ? PALETTE.gold : PALETTE.purple, 20, 0.7);
          if (broken) this.rig.shake(0.18);
        } else {
          // Timeout = no bonus at all (it is about to fly away / change phase on its own).
          if (broken) {
            this.items.magnetAll();
            if (!last) {
              this.addScore(this.sc.midBossPhaseBreak);
              this.items.drop(ItemKind.Star, p.x, p.y, p.z, ITEMS.midBossPhase.stars, ITEMS.starValue, 1.8);
              this.items.drop(ItemKind.Power, p.x, p.y, p.z, ITEMS.midBossPhase.power, 1, 1.4);
            }
            this.rig.shake(0.14);
          }
          this.effects.ring(p.x, p.y, p.z + 2, broken ? PALETTE.gold : PALETTE.purple, 14, 0.6);
        }
      },
      onDefeated: (x, y, z) => {
        if (role === 'boss') {
          this.sfx('bossDown');
          this.rig.shake(0.6, 2.5);
          this.onStageBossDown(true);
          return;
        }
        this.sfx('midbossDown');
        this.rig.shake(0.42, 3);
        this.danmaku.clear(undefined, undefined, this.items.cancelBullet);
        this.addScore(this.sc.midBossKill);
        // Guaranteed big power burst, sucked straight to the heroine.
        this.items.magnetAll(1.5);
        this.items.drop(ItemKind.Power, x, y, z, ITEMS.midBossKill.power, 1, 1.6);
        this.items.drop(ItemKind.Star, x, y, z, ITEMS.midBossKill.stars, ITEMS.starValue, 2);
        this.ui.announce('MID BOSS DEFEATED', `+${this.sc.midBossKill.toLocaleString()}`);
        this.endMidBoss('defeated');
      },
      onEscaped: () => {
        if (role === 'boss') {
          this.onStageBossDown(false);
          return;
        }
        this.ui.announce('ESCAPED', self().config.escapeText ?? '');
        this.endMidBoss('escaped');
      },
      onHit: (x, y, z, damaged) => {
        if (damaged) this.addScore((role === 'boss' ? this.sc.bossHit : this.sc.midBossHit) * this.shots.damage);
        const col = role === 'boss' ? PALETTE.gold : PALETTE.cyan;
        this.effects.burst(x, y, z + 1, damaged ? col : PALETTE.purple, 2, 7, role === 'boss' ? 0.45 : 0.4, 0.25);
        this.sfx('enemyHit', 0.07);
      },
      onBulletCancel: this.items.cancelBullet,
    };
  }

  /** The stage boss was defeated (killed) or left (timeout): clear → tally. */
  private onStageBossDown(killed: boolean): void {
    if (this.phase !== 'boss' && this.phase !== 'stage') return;
    this.danmaku.stopAllPatterns();
    if (killed) {
      this.danmaku.clear(undefined, undefined, this.items.cancelBullet);
      this.addScore(this.sc.bossKill);
      this.ui.announce('BOSS DEFEATED', `+${this.sc.bossKill.toLocaleString()}`);
    } else {
      this.danmaku.clear();
      this.ui.announce('TIME UP', this.def.boss.config.escapeText ?? '');
    }
    this.enemies.retreatAll();
    this.phase = 'clearing';
    this.endTimer = killed ? 3.0 : 2.0;
    this.items.magnetAll(this.endTimer + 1);
    this.hudDirty = true;
  }

  private beginTally(): void {
    this.phase = 'tally';
    this.phaseT = 0;
    const n = this.stageNo;
    const sc = this.sc;
    const stageScore = this.score - this.stageStartScore;
    const bonus = [
      { label: 'CLEAR BONUS', value: sc.stageClearBonus * n },
      { label: `残機 × ${this.player.lives}`, value: this.player.lives * sc.lifeBonus },
    ];
    if (this.stageMisses === 0) bonus.push({ label: 'NO MISS', value: sc.noMissBonus });
    for (const b of bonus) this.addScore(b.value);
    this.stageResults.push({ number: n, title: this.def.title, score: this.score - this.stageStartScore, cleared: true });
    this.items.magnetAll(TALLY_SEC);
    this.sfx('clear');
    this.ui.showStageClear({
      stage: n,
      title: this.def.title,
      stageScore,
      graze: this.graze - this.stageStartGraze,
      stars: this.stageStars,
      orbs: this.stageOrbs,
      bonus,
      total: this.score,
      placeholder: this.def.placeholder,
    });
    this.hudDirty = true;
  }

  private beginTransition(): void {
    this.phase = 'transition';
    this.phaseT = 0;
    this.ui.hideStageClear();
    const next = getStage(this.stageNo + 1);
    this.bg.setPreset(next.background, TRANSITION_SEC);
    this.audio.playBgm(next.bgm.stage);
    this.bannerT = 0.7;
    this.hudDirty = true;
  }

  private beginEnding(): void {
    this.phase = 'ending';
    this.phaseT = 0;
    this.ui.hideStageClear();
    this.ending = createEnding({ ui: this.ui, audio: this.audio, bg: this.bg });
    this.ending.start();
  }

  /** Per-frame flow between stages (tally → transition → next stage / ending → result). */
  private updateFlow(dt: number): void {
    this.phaseT += dt;
    if (this.bannerT >= 0) {
      this.bannerT -= dt;
      if (this.bannerT < 0) {
        const d = this.phase === 'transition' ? getStage(this.stageNo + 1) : this.def;
        this.ui.stageTitle(d.number, d.title, d.subtitle);
      }
    }
    switch (this.phase) {
      case 'dying':
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.showResult(false);
        break;
      case 'clearing':
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.beginTally();
        break;
      case 'tally':
        if (this.phaseT >= TALLY_SEC) {
          if (this.stageNo < stageCount()) this.beginTransition();
          else this.beginEnding();
        }
        break;
      case 'transition':
        if (this.phaseT >= TRANSITION_SEC) this.beginStage(this.stageNo + 1, true);
        break;
      case 'ending':
        if (!this.ending || this.ending.update(dt)) {
          this.ending = null;
          this.showResult(true);
        }
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* State transitions                                                   */
  /* ------------------------------------------------------------------ */

  private clearWorld(): void {
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.enemies.clear();
    for (const b of this.bossCache.values()) b.reset();
    this.midBossResult = null;
    this.shots.clear();
    this.items.clear();
    this.bomb.reset();
    this.ending = null;
    this.bannerT = -1;
    this.ui?.hideStageClear();
    this.hitPendingT = 0;
    delete this.app.dataset.hitPending;
    delete this.app.dataset.bombActive;
    this.bombBusy = false;
  }

  toTitle(): void {
    this.clearWorld();
    this.state = 'title';
    this.rig.mode = 'title';
    this.player.setTitlePose();
    this.player.alive = true;
    this.player.invincible = 0;
    this.bg.setPreset(STAGES[0].background, 1.2);
    this.ui.showTitle(this.save.hiScore);
    this.intro.showTitle(!this.titleShown);
    this.titleShown = true;
    this.audio.setPaused(false);
    this.audio.playBgm('title');
    this.needsRender = true;
  }

  /** Start a run (at stage 1, or at `startStage` once when set by ?stage=N / skipToStage). */
  start(): void {
    const first = Math.max(1, Math.min(stageCount(), this.startStage || 1));
    this.startStage = 0;
    const turning = this.state === 'title' && this.intro.beginTurn();
    this.clearWorld();
    this.effects.clear();
    this.rng.reseed(this.seed);
    this.state = 'playing';
    this.score = 0;
    this.graze = 0;
    this.playTime = 0;
    this.misses = 0;
    this.grazeChain = 0;
    this.lastGrazeT = -10;
    this.bombs = BOMB.stock;
    this.powerOrbs = 0;
    this.maxPower = 1;
    this.dropBank = 0;
    this.shots.level = 1;
    this.stageResults = [];
    this.player.reset();
    this.player.position.set(0, turning ? 0 : -0.8, FIELD.planeZ);
    this.player.setPlayPose();
    // During the title turn-around the camera waits a moment before swooping.
    this.rig.mode = turning ? 'title' : 'play';
    this.input.reset();
    this.quality.hold(2);
    this.ui.showHud();
    this.audio.setPaused(false);
    this.beginStage(first, false);
    // Starting later than stage 1: the power a run would usually have by then.
    if (first > 1) this.setPowerOrbs(POWER_AT[Math.max(1, Math.min(4, getStage(first).startPower ?? first)) - 1]);
    this.hudDirty = true;
    if (this.bossOnStart) this.skipToBoss();
    else if (this.midBossOnStart) this.skipToMidBoss();
  }

  skipToBoss(): void {
    if (this.state !== 'playing' && this.state !== 'paused') this.start();
    if (this.phase !== 'stage') return;
    this.enemies.clear();
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.midBoss?.reset(); // skipping to the boss also skips the mid-boss
    const w = eventTime(this.def, 'warning');
    this.stage.jumpTo(w >= 0 ? w : Math.max(0, eventTime(this.def, 'boss') - 0.01));
  }

  private beginBoss(): void {
    this.phase = 'boss';
    this.enemies.clear();
    this.boss.spawn();
    this.audio.playBgm(this.def.bgm.boss);
    this.ui.announce(this.def.boss.config.name, this.def.boss.config.sub ?? 'BOSS');
    this.hudBoss.pattern = undefined;
    this.hudDirty = true;
  }

  setPaused(p: boolean, _fromUi = false): void {
    if (p && this.state === 'playing') {
      this.state = 'paused';
      this.audio.setPaused(true);
      this.input.reset();
      this.ui.setPaused(true);
    } else if (!p && this.state === 'paused') {
      this.state = 'playing';
      this.audio.setPaused(false);
      this.ui.setPaused(false);
      this.last = performance.now();
      this.quality.hold();
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      if (this.state === 'playing') this.setPaused(true);
      this.audio.setPaused(true);
    } else {
      if (this.state !== 'paused') this.audio.setPaused(false);
      this.last = performance.now();
      this.quality.hold();
      this.needsRender = true;
    }
  }

  settingsChanged(): void {
    this.audio.setMuted(this.save.settings.muted);
    this.quality.setMode(this.save.settings.quality);
  }

  /** Player out of lives: result after `delay` seconds. */
  private endPlay(delay: number): void {
    this.phase = 'dying';
    this.endTimer = delay;
  }

  private showResult(allClear: boolean): void {
    const p = this.player;
    const stages = this.stageResults.slice();
    if (!allClear) stages.push({ number: this.stageNo, title: this.def.title, score: this.score - this.stageStartScore, cleared: false });
    const newRecord = this.save.submitScore(this.score);
    this.clearWorld();
    this.state = 'result';
    this.rig.mode = 'title';
    this.intro.hide();
    p.setTitlePose();
    p.alive = true;
    p.invincible = 0;
    this.audio.stopBgm();
    this.sfx(allClear ? 'clear' : 'gameOver');
    this.pushHud();
    this.ui.showResult({
      cleared: allClear,
      allClear,
      stages,
      score: this.score,
      hiScore: this.save.hiScore,
      newRecord,
      graze: this.graze,
      timeSec: Math.round(this.playTime * 10) / 10,
      livesLeft: p.lives,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay events                                                     */
  /* ------------------------------------------------------------------ */

  private addScore(n: number): void {
    this.score += Math.round(n);
  }

  private sfx(name: SfxName, minGap = 0, pitch = 0): void {
    const t = this.sfxT[name] ?? -1;
    if (this.time - t < minGap) return;
    this.sfxT[name] = this.time;
    this.audio.sfx(name, pitch);
  }

  private onShotHit = (id: number, x: number, y: number, z: number): void => {
    const dmg = this.shots.damage;
    if (id === BOSS_ID) this.boss.damage(dmg, x, y, z);
    else if (id === MIDBOSS_ID) this.midBoss?.damage(dmg, x, y, z);
    else this.enemies.damage(id, dmg);
  };

  private onEnemyKilled(def: EnemyKindDef, x: number, y: number, z: number): void {
    const big = !!def.big;
    this.addScore(def.score);
    this.dropItems(def, x, y, z);
    this.effects.burst(x, y, z, def.color, big ? 60 : 26, big ? 16 : 10, big ? 1.1 : 0.6, 0.8);
    this.effects.burst(x, y, z, PALETTE.white, 8, 6, 0.5, 0.4);
    this.effects.ring(x, y, z, def.color, def.scale * 2.6, 0.45);
    this.sfx('enemyDown', 0.04);
    if (big) this.rig.shake(0.12);
  }

  /* ---- items / power ---- */

  /** Current graze chain (0 when the last graze is too old). */
  private chainNow(): number {
    if (this.playTime - this.lastGrazeT >= SCORE.grazeChainWindow) return 0;
    return Math.min(this.grazeChain, SCORE.grazeChainCap);
  }

  get powerLevel(): number {
    let l = 1;
    while (l < POWER_AT.length && this.powerOrbs >= POWER_AT[l]) l++;
    return l;
  }

  get powerProgress(): number {
    const l = this.powerLevel;
    if (l >= POWER_AT.length) return 1;
    return (this.powerOrbs - POWER_AT[l - 1]) / (POWER_AT[l] - POWER_AT[l - 1]);
  }

  private setPowerOrbs(n: number): void {
    const before = this.powerLevel;
    this.powerOrbs = Math.max(0, Math.min(POWER_MAX, n));
    const l = this.powerLevel;
    this.shots.level = l;
    this.maxPower = Math.max(this.maxPower, l);
    this.hudDirty = true;
    if (l > before && this.state === 'playing') {
      const p = this.player.position;
      this.sfx('powerUp', 0.2);
      this.effects.ring(p.x, p.y, p.z, PALETTE.gold, 1.6, 0.45);
      this.effects.burst(p.x, p.y, p.z, PALETTE.white, 18, 5, 0.22, 0.6);
    }
  }

  private dropItems(def: EnemyKindDef, x: number, y: number, z: number): void {
    const d = def.drops;
    const big = !!def.big;
    this.items.drop(ItemKind.Star, x, y, z, d.stars, ITEMS.starValue, big ? 1.3 : 0.7);
    this.dropBank += d.power;
    const n = Math.floor(this.dropBank + 1e-6);
    this.dropBank -= n;
    if (n > 0) this.items.drop(ItemKind.Power, x, y, z, n, 1, big ? 1.1 : 0.5);
  }

  private onCollect = (kind: ItemKind, value: number): void => {
    const p = this.player.position;
    const chain = this.chainNow();
    const mul = 1 + chain * ITEMS.chainBonus;
    if (kind === ItemKind.Star) {
      this.stageStars++;
      this.addScore(value * mul);
      this.sfx('itemScore', 0.035, chain * 0.35);
      this.effects.burst(p.x, p.y, p.z, PALETTE.gold, 1, 2.5, 0.14, 0.25);
    } else {
      this.stageOrbs++;
      if (this.powerOrbs >= POWER_MAX) this.addScore(POWER.maxBonus * mul);
      else this.setPowerOrbs(this.powerOrbs + value);
      this.sfx('itemPower', 0.05);
      this.effects.burst(p.x, p.y, p.z, PALETTE.white, 4, 3, 0.18, 0.35);
    }
  };

  /* ---- bomb (光の結界) ---- */

  /** Fire the bomb if possible (button / X / B key). Within the 決死ボム window it cancels the hit. */
  useBomb(): boolean {
    if (this.state !== 'playing' || this.intro.busy || this.playTime < 0.8) return false;
    if (this.phase !== 'stage' && this.phase !== 'boss') return false;
    const pl = this.player;
    if (!pl.alive || this.bombs <= 0 || this.bomb.active) return false;
    const deathbomb = this.hitPendingT > 0;
    this.hitPendingT = 0;
    delete this.app.dataset.hitPending;
    this.bombs--;
    const p = pl.position;
    this.bomb.start(p);
    pl.guard = Math.max(pl.guard, BOMB.invincibleSec);
    this.items.magnetAll(BOMB.invincibleSec);
    this.sfx('bomb');
    this.rig.shake(0.3, 2.2);
    this.effects.burst(p.x, p.y, p.z, PALETTE.white, 22, 9, 0.24, 0.7);
    this.effects.burst(p.x, p.y, p.z, PALETTE.gold, 20, 6, 0.22, 0.9);
    this.effects.ring(p.x, p.y, p.z, PALETTE.cyan, 4.5, 0.5);
    if (deathbomb) this.effects.ring(p.x, p.y, p.z, PALETTE.pink, 3, 0.4);
    this.hudDirty = true;
    return true;
  }

  /** A bullet touched the heroine: with a bomb in stock, wait briefly for a 決死ボム. */
  private beginHitPending(): void {
    const p = this.player.position;
    this.hitPendingT = BOMB.deathbombWindow;
    this.app.dataset.hitPending = '1'; // the UI makes the bomb button flash
    this.effects.burst(p.x, p.y, p.z, PALETTE.pink, 14, 4, 0.22, 0.4);
    this.rig.shake(0.1, 4);
  }

  private bombTick(): void {
    this.enemies.damageAll(BOMB.enemyDamage);
    const b = this.boss.position;
    if (this.boss.active) this.boss.damage(BOMB.bossDamage, b.x, b.y, b.z + 2);
    const mb = this.midBoss;
    if (mb && mb.active) mb.damage(BOMB.bossDamage, mb.position.x, mb.position.y, mb.position.z + 2);
  }

  private onPlayerHit(): void {
    const p = this.player.position;
    this.misses++;
    this.stageMisses++;
    this.hitPendingT = 0;
    delete this.app.dataset.hitPending;
    this.sfx('playerHit');
    this.ui.flashDamage();
    this.rig.shake(0.35, 3.5);
    this.danmaku.clear();
    this.effects.burst(p.x, p.y, p.z, PALETTE.pink, 50, 9, 0.35, 0.9);
    this.effects.burst(p.x, p.y, p.z, PALETTE.white, 20, 5, 0.25, 0.6);
    this.effects.ring(p.x, p.y, p.z, PALETTE.pink, 1.7, 0.45);
    this.grazeChain = 0;
    const dead = this.player.hit();
    // Lose about one level of power (never below Lv1); some of it flies out to re-collect.
    const lost = Math.min(this.powerOrbs, POWER.missLoss);
    this.setPowerOrbs(this.powerOrbs - lost);
    if (!dead && lost > 0) this.items.scatter(p.x, p.y, p.z, Math.min(POWER.missScatter, lost));
    this.bombs = BOMB.stock;
    this.hudDirty = true;
    if (dead) {
      this.danmaku.stopAllPatterns();
      this.boss.freeze();
      this.midBoss?.freeze();
      this.effects.burst(p.x, p.y, p.z, PALETTE.cyan, 60, 12, 0.4, 1.2);
      this.effects.ring(p.x, p.y, p.z, PALETTE.white, 6, 0.9);
      this.rig.shake(0.6, 2.5);
      this.endPlay(1.8);
    }
  }

  private onGraze(n: number): void {
    const bossMul = this.phase === 'boss' || this.midBoss?.active ? this.sc.grazeBossMul : 1;
    const fastMul = this.player.slow ? 1 : this.sc.grazeFastMul;
    for (let i = 0; i < n; i++) {
      if (this.playTime - this.lastGrazeT < SCORE.grazeChainWindow) this.grazeChain++;
      else this.grazeChain = 0;
      this.lastGrazeT = this.playTime;
      const chain = Math.min(this.grazeChain, SCORE.grazeChainCap);
      this.addScore((this.sc.grazeBase + chain * this.sc.grazeChainStep) * bossMul * fastMul);
    }
    this.graze += n;
    const p = this.player.position;
    this.effects.burst(p.x, p.y, p.z, PALETTE.gold, 2 * n, 4, 0.18, 0.3);
    if (this.time - this.grazePulseT > 0.1) {
      this.grazePulseT = this.time;
      this.ui.pulseGraze();
    }
    this.sfx('graze', 0.07);
    this.hudDirty = true;
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.state === 'paused') {
      if (this.needsRender) this.render();
      return;
    }
    const dt = Math.min(Math.max(raw, 0), MAX_DT);
    this.quality.sample(raw);
    this.update(dt);
    this.render();
  };

  private render(): void {
    this.needsRender = false;
    this.renderer.render(this.scene, this.rig.camera);
  }

  private update(dt: number): void {
    // 決死ボム window: real time runs out, the world runs in slow motion meanwhile.
    let pendingU = -1;
    if (this.hitPendingT > 0 && this.state === 'playing') {
      this.hitPendingT -= dt;
      if (this.hitPendingT <= 0) {
        // The stage may have ended meanwhile (boss down): then the hit is simply void.
        if (this.phase === 'stage' || this.phase === 'boss') this.onPlayerHit();
        else {
          this.hitPendingT = 0;
          delete this.app.dataset.hitPending;
        }
      } else {
        pendingU = 1 - this.hitPendingT / BOMB.deathbombWindow;
        dt *= BOMB.deathbombTimeScale;
      }
    }
    this.time += dt;
    const settings = this.save.settings;
    const playing = this.state === 'playing';
    const fighting = this.phase === 'stage' || this.phase === 'boss';
    const control = playing && !this.intro.busy && this.phase !== 'dying';
    const slow = settings.slowMode || this.input.slowHeld;

    // Input -> movement.
    this.input.consumeDrag(this.drag);
    const scale = (PLAYER.dragScale / this.viewH) * settings.sensitivity * (slow ? PLAYER.slowFactor : 1);
    const p = this.player;
    if (!playing) {
      // Title / result: glide back to the origin and idle-turn toward the camera.
      const k = 1 - Math.exp(-dt * 3);
      p.position.x += (0 - p.position.x) * k;
      p.position.y += (0 - p.position.y) * k;
      p.titleIdle(this.time);
    }
    p.update(dt, this.drag.x * scale, -this.drag.y * scale, this.input.keyAxisX(), this.input.keyAxisY(), slow && playing, control, playing && this.playTime > 0.6 && !this.intro.busy);

    if (playing) {
      this.playTime += dt;
      if (this.phase === 'stage') this.stage.update(dt);
      this.items.beginFrame(this.danmaku.activeCount);

      this.targets.begin();
      this.enemies.addTargets(this.targets);
      this.boss.addTargets(this.targets, BOSS_ID);
      this.midBoss?.addTargets(this.targets, MIDBOSS_ID);
      const firing = p.alive && fighting && this.playTime > 0.8 && !this.intro.busy;
      const volleys = this.shots.update(dt, firing, p.position, this.targets, this.onShotHit);
      if (volleys > 0) this.sfx('shot', 0.11);

      this.enemies.update(dt, fighting);
      this.updateBosses(dt);

      // Bomb: clear bullets inside the sweeping radius (→ stars), damage ticks.
      const ticks = this.bomb.update(dt, p.position, pendingU);
      const busy = this.bomb.active;
      if (busy !== this.bombBusy) {
        this.bombBusy = busy;
        if (busy) this.app.dataset.bombActive = '1';
        else delete this.app.dataset.bombActive;
      }
      for (let k = 0; k < ticks; k++) this.bombTick();
      const cr = this.bomb.clearRadius;
      if (cr > 0) this.danmaku.clear(p.position, cr, this.items.cancelBullet);

      // God mode (debug) still collides so grazes count; hits are ignored.
      const collide = p.alive && p.invincible <= 0 && p.guard <= 0 && this.hitPendingT <= 0 && fighting;
      const res = this.danmaku.update(dt, p.position, collide);
      if (collide && res.hit && !p.godMode) {
        if (this.bombs > 0) this.beginHitPending();
        else this.onPlayerHit();
      } else if (collide && res.grazes > 0) this.onGraze(res.grazes);

      this.items.update(dt, p.position, slow, p.alive && this.phase !== 'dying');
      this.updateFlow(dt);
    } else {
      this.enemies.update(dt, false);
      this.updateBosses(dt);
      this.danmaku.update(dt, p.position, false);
      this.bomb.update(dt, p.position, -1);
    }

    this.effects.update(dt);
    let speed = 0.45;
    if (playing) {
      if (this.playTime < 1.4) speed = 2.8;
      else if (this.phase === 'transition') speed = 1 + 2.4 * Math.sin(Math.min(1, this.phaseT / TRANSITION_SEC) * Math.PI);
      else if (this.phase === 'ending') speed = 0.6;
      else speed = 1;
    }
    this.bg.setSpeed(speed);
    this.bg.setFramesOpacity(this.rig.mode === 'play' && this.state === 'playing' ? 1 : 0);
    // (state may have changed during this update, e.g. the result screen just opened)
    const stillPlaying = this.state === 'playing';
    if (stillPlaying && this.rig.mode === 'title' && this.intro.releaseCamera) this.rig.mode = 'play';
    if (stillPlaying && this.intro.busy) p.position.y += (-0.8 - p.position.y) * (1 - Math.exp(-dt * 4));
    this.rig.update(dt, p.position, p.vx);
    // Darkness overlay follows the heroine on screen.
    this.lightV.copy(p.position).project(this.rig.camera);
    this.bg.setLightCenter(this.lightV.x, this.lightV.y, this.viewW / this.viewH);
    this.bg.update(dt);
    this.intro.update(dt, this.rig.camera);

    if (playing) {
      this.hudTimer += dt;
      if (this.hudDirty || this.hudTimer >= HUD_INTERVAL) this.pushHud();
    }
  }

  private updateBosses(dt: number): void {
    this.boss.update(dt);
    this.midBoss?.update(dt);
  }

  private pushHud(): void {
    this.hudTimer = 0;
    this.hudDirty = false;
    const h = this.hud;
    h.score = this.score;
    h.hiScore = Math.max(this.save.hiScore, this.score);
    h.lives = this.player.lives;
    h.graze = this.graze;
    h.bombs = this.bombs;
    h.power = this.powerLevel;
    h.powerProgress = this.powerProgress;
    const mb = this.midBoss;
    if (this.boss.active && this.boss.state !== BossState.Dying) {
      this.hudBoss.hp = this.boss.hp;
      h.boss = this.hudBoss;
    } else if (mb && mb.active && mb.state !== BossState.Dying) {
      this.hudMid.hp = mb.hp;
      h.boss = this.hudMid;
    } else {
      h.boss = null;
    }
    this.ui.updateHud(h);
  }

  /* ------------------------------------------------------------------ */
  /* Viewport / quality                                                  */
  /* ------------------------------------------------------------------ */

  private resize(): void {
    const w = Math.max(1, this.app.clientWidth || window.innerWidth);
    const h = Math.max(1, this.app.clientHeight || window.innerHeight);
    this.viewW = w;
    this.viewH = h;
    const pr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[this.quality?.level ?? 2]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    const bufH = h * pr;
    this.bg.setPointScale(bufH, this.rig.tanHalfFov);
    this.effects.setPointScale(bufH, this.rig.tanHalfFov);
    this.needsRender = true;
  }

  private applyQuality(l: QualityLevel): void {
    this.danmaku.setQuality(l);
    this.bg.setQuality(l);
    this.effects.setQuality(l);
    if (this.renderer) this.resize();
  }

  /* ------------------------------------------------------------------ */
  /* Debug                                                               */
  /* ------------------------------------------------------------------ */

  debugState() {
    const b = this.boss;
    const mb = this.midBoss;
    const mbActive = !!mb && mb.active;
    return {
      state: this.state,
      phase: this.phase === 'stage' && mbActive ? 'midboss' : this.phase,
      stage: this.stageNo,
      stageId: this.def.id,
      stageTitle: this.def.title,
      placeholder: !!this.def.placeholder,
      stages: this.stageResults.map((r) => ({ ...r })),
      difficulty: this.difficulty.id,
      darkness: Math.round(this.bg.darkness * 1000) / 1000,
      score: this.score,
      lives: this.player.lives,
      graze: this.graze,
      time: Math.round(this.playTime * 100) / 100,
      stageTime: Math.round(this.stage.t * 100) / 100,
      bossHp: b.active ? Math.round(b.hp * 1000) / 1000 : null,
      bossPhase: b.active ? b.phaseIndex : null,
      bossState: b.active ? BossState[b.state] : null,
      midBossHp: mbActive ? Math.round(mb!.hp * 1000) / 1000 : null,
      midBossPhase: mbActive ? mb!.phaseIndex : null,
      midBossState: mbActive ? BossState[mb!.state] : null,
      midBossResult: this.midBossResult,
      enemies: this.enemies.activeCount,
      bombs: this.bombs,
      power: this.powerLevel,
      powerProgress: Math.round(this.powerProgress * 1000) / 1000,
      powerOrbs: this.powerOrbs,
      maxPower: this.maxPower,
      items: this.items.activeCount,
      bombActive: this.bomb.active,
      hitPending: this.hitPendingT > 0,
      bullets: this.danmaku.activeCount,
      fps: Math.round(this.quality.fps),
      quality: this.quality.level,
      player: { x: Math.round(this.player.position.x * 1000) / 1000, y: Math.round(this.player.position.y * 1000) / 1000 },
    };
  }

  /** Debug / tests: simulate `sec` seconds at 60 Hz without rendering (fast-forward). */
  advance(sec: number): void {
    const n = Math.max(0, Math.round(sec * 60));
    for (let i = 0; i < n && this.state !== 'paused'; i++) this.update(1 / 60);
    this.needsRender = true;
  }

  /** Debug: drop items as if an enemy died at (x, y, z) (default: ahead, mid-depth). */
  debugDrop(stars: number, orbs: number, x = 0, y = 3, z = -42): void {
    if (stars > 0) this.items.drop(ItemKind.Star, x, y, z, stars, ITEMS.starValue, 1);
    if (orbs > 0) this.items.drop(ItemKind.Power, x, y, z, orbs, 1, 1);
  }

  /** Debug: set shot power level 1..4. */
  setPower(n: number): void {
    const l = Math.max(1, Math.min(POWER_AT.length, Math.round(n)));
    this.setPowerOrbs(POWER_AT[l - 1]);
  }

  setInvincible(on: boolean): void {
    this.player.godMode = on;
  }

  movePlayer(x: number, y: number): void {
    this.player.position.x = Math.max(-FIELD.halfW, Math.min(FIELD.halfW, x));
    this.player.position.y = Math.max(-FIELD.halfH, Math.min(FIELD.halfH, y));
  }

  /** Debug: break the current boss (or mid-boss) phase. */
  breakBossPhase(): void {
    if (!this.midBoss?.forceBreak()) this.boss.forceBreak();
  }

  /** Debug: jump to stage n (starts a run there when not playing; otherwise keeps score / lives / power). */
  skipToStage(n: number): void {
    const N = Math.max(1, Math.min(stageCount(), Math.round(n) || 1));
    if (this.state !== 'playing' && this.state !== 'paused') {
      this.startStage = N;
      this.start();
      return;
    }
    if (this.phase === 'dying') return;
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.enemies.clear();
    this.ending = null;
    this.ui.hideStageClear();
    this.beginStage(N, false);
  }

  /** Debug: defeat the current stage's boss right now (→ clearing → tally → next stage / ending). */
  clearStage(): void {
    if (this.state !== 'playing') return;
    switch (this.phase) {
      case 'stage':
      case 'boss':
        this.midBoss?.reset();
        if (this.boss.active) this.boss.reset();
        this.enemies.clear();
        this.sfx('bossDown');
        this.onStageBossDown(true);
        this.endTimer = 1.2;
        break;
      case 'clearing':
        this.endTimer = 0;
        break;
      case 'tally':
        this.phaseT = TALLY_SEC;
        break;
      case 'transition':
        this.phaseT = TRANSITION_SEC;
        break;
      case 'ending':
        this.ending?.skip();
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mid-boss (StageDef.midBoss; the stage timeline waits while it lives) */
  /* ------------------------------------------------------------------ */

  /** 'defeated' / 'escaped' once this stage's mid-boss is over (debug / tests). */
  private midBossResult: null | 'defeated' | 'escaped' = null;

  private beginMidBoss(): void {
    const mb = this.midBoss;
    if (!mb) {
      this.stage.resume();
      return;
    }
    this.enemies.retreatAll();
    mb.spawn();
    this.midBossResult = null;
    this.audio.playBgm(this.def.bgm.midboss);
    this.ui.announce(mb.config.name, mb.config.sub ?? 'MID BOSS');
    this.hudMid.pattern = undefined;
    this.hudDirty = true;
  }

  private endMidBoss(result: 'defeated' | 'escaped'): void {
    this.midBossResult = result;
    this.hudDirty = true;
    if (this.phase !== 'stage') return; // player died meanwhile
    this.audio.playBgm(this.def.bgm.stage);
    this.stage.resume();
  }

  /** Debug: jump to the mid-boss of the current stage (starts a run when needed). */
  skipToMidBoss(): void {
    if (this.state !== 'playing' && this.state !== 'paused') this.start();
    const t = eventTime(this.def, 'midboss');
    if (this.phase !== 'stage' || !this.midBoss || this.midBoss.active || t < 0) return;
    this.enemies.clear();
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.stage.jumpTo(t);
  }

  /**
   * Hard-mode hook: change the difficulty multipliers (takes effect from the next start();
   * cached bosses are rebuilt so their HP / intensities pick it up).
   */
  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.enemies.difficulty = d;
    for (const b of this.bossCache.values()) b.dispose();
    this.bossCache.clear();
    this.applyStageDef(this.def);
  }
}
