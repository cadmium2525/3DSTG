/**
 * Game core: renderer, loop, state machine (title / playing / paused / result),
 * and the wiring between player, shots, enemies, boss, danmaku, UI and audio.
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
} from '../core/types';
import { Background } from './Background';
import { Boss, BossState } from './Boss';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Enemies, MAX_ENEMIES } from './Enemies';
import { Input } from './Input';
import { Player } from './Player';
import { TitleIntro } from './TitleIntro';
import { Quality, type QualityLevel } from './Quality';
import { Rng } from './Rng';
import { Shots, Targets } from './Shots';
import { Stage } from './Stage';
import { BOSS, BOSS_SKIP_T, ENEMY_KINDS, SCORE, SHOT } from './StageData';
import { MidBoss, MidBossState } from './MidBoss';
import { MIDBOSS, MIDBOSS_SKIP_T } from './StageData';

export type GameState = 'title' | 'playing' | 'paused' | 'result';
/** Sub-state while playing. */
type PlayPhase = 'stage' | 'boss' | 'dying' | 'clearing';

const BOSS_ID = MAX_ENEMIES;
const MIDBOSS_ID = MAX_ENEMIES + 1;
const MAX_DT = 1 / 20;
const HUD_INTERVAL = 0.1;
const PIXEL_RATIO_CAP: Record<QualityLevel, number> = { 0: 1, 1: 1.5, 2: 2 };
const PHASE_NAMES = BOSS.phases.map((p) => p.patterns.map((x) => PATTERN_NAMES[x.id]).join(' + '));

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
  private boss: Boss;
  private stage: Stage;
  // Mid-boss (see MidBoss.ts / StageData.MIDBOSS).
  private midBoss: MidBoss;
  private hudMid = { name: MIDBOSS.name, hp: 1, pattern: '' as string | undefined };
  midBossOnStart = false;

  // Score / run stats.
  score = 0;
  graze = 0;
  playTime = 0;
  private misses = 0;
  private grazeChain = 0;
  private lastGrazeT = -10;
  private endTimer = 0;
  private endCleared = false;

  // Loop.
  private last = 0;
  private time = 0;
  private viewW = 1;
  private viewH = 1;
  private needsRender = true;

  // Throttles.
  private hud: HudData = { score: 0, hiScore: 0, lives: PLAYER.lives, graze: 0, boss: null };
  private hudBoss = { name: BOSS.name, hp: 1, pattern: '' as string | undefined };
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
    scene.background = new THREE.Color(PALETTE.bg);
    scene.fog = new THREE.Fog(PALETTE.bg, 70, 190);

    // Lights: soft purple ambient, warm key from the camera side, cyan/pink rims from the depths.
    scene.add(new THREE.HemisphereLight(0xb7a6ff, 0x141030, 1.1));
    const key = new THREE.DirectionalLight(0xfff4ec, 1.7);
    key.position.set(2.5, 4, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(PALETTE.cyan, 1.4);
    rim.position.set(-3, 2.5, -6);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(PALETTE.pink, 0.8);
    rim2.position.set(3.5, -1, -5);
    scene.add(rim2);

    this.bg = new Background(new Rng(d.seed ^ 0x5bd1e995));
    scene.add(this.bg.group);
    this.effects = new Effects(this.rng);
    scene.add(this.effects.group);
    this.player = new Player();
    scene.add(this.player.group);
    this.intro = new TitleIntro(this.player, this.effects);
    scene.add(this.intro.group);
    this.shots = new Shots();
    scene.add(this.shots.mesh);

    this.enemies = new Enemies(this.danmaku, this.rng, {
      onKilled: (kind, x, y, z) => {
        const def = ENEMY_KINDS[kind];
        this.addScore(def.score);
        this.effects.burst(x, y, z, def.color, kind === 'lantern' ? 60 : 26, kind === 'lantern' ? 16 : 10, kind === 'lantern' ? 1.1 : 0.6, 0.8);
        this.effects.burst(x, y, z, PALETTE.white, 8, 6, 0.5, 0.4);
        this.effects.ring(x, y, z, def.color, def.scale * 2.6, 0.45);
        this.sfx('enemyDown', 0.04);
        if (kind === 'lantern') this.rig.shake(0.12);
      },
      onHit: (x, y, z) => {
        this.effects.burst(x, y, z + 0.5, PALETTE.cyan, 2, 5, 0.3, 0.25);
        this.sfx('enemyHit', 0.06);
      },
    });
    scene.add(this.enemies.group);

    this.boss = new Boss(this.danmaku, this.effects, this.rng, {
      onPhaseStart: (i) => {
        this.ui.announce(PHASE_NAMES[i], `SPELL ${i + 1} / ${BOSS.phases.length}`);
        this.hudBoss.pattern = PHASE_NAMES[i];
        this.hudDirty = true;
      },
      onPhaseEnd: (_i, broken, cancelled) => {
        this.addScore(cancelled * SCORE.bulletCancel + (broken ? SCORE.phaseBreak : 0));
        this.hudBoss.pattern = undefined;
        this.hudDirty = true;
        const p = this.boss.position;
        this.effects.ring(p.x, p.y, p.z + 2, broken ? PALETTE.gold : PALETTE.purple, 20, 0.7);
        if (broken) this.rig.shake(0.18);
      },
      onDefeated: () => {
        this.sfx('bossDown');
        this.rig.shake(0.6, 2.5);
        this.danmaku.stopAllPatterns();
        this.danmaku.clear();
        this.addScore(SCORE.bossKill);
        this.ui.announce('BOSS DEFEATED', `+${SCORE.bossKill.toLocaleString()}`);
        this.endPlay(true, 3.0);
      },
      onEscaped: () => {
        this.danmaku.clear();
        this.ui.announce('TIME UP', 'ボスは星の彼方へ去った');
        this.endPlay(true, 2.0);
      },
      onHit: (x, y, z, damaged) => {
        if (damaged) this.addScore(SCORE.bossHit);
        this.effects.burst(x, y, z + 1, damaged ? PALETTE.gold : PALETTE.purple, 2, 7, 0.45, 0.25);
        this.sfx('enemyHit', 0.07);
      },
    });
    scene.add(this.boss.group);
    this.midBoss = this.createMidBoss();
    scene.add(this.midBoss.group);

    scene.add(this.danmaku.object3d);

    this.stage = new Stage({
      wave: (w) => this.enemies.spawnWave(w),
      intro: (e) => {
        this.enemies.spawnLantern(e.pattern, e.duration, e.intensity);
        this.ui.announce(PATTERN_NAMES[e.pattern], e.sub);
      },
      announce: (e) => this.ui.announce(e.text ?? '', e.sub),
      warning: () => {
        this.enemies.retreatAll();
        this.ui.announce('WARNING', '強大な魔力反応が接近中');
        this.sfx('bossWarning');
        // Boss theme starts under the alarm (the alarm ducks the BGM).
        this.audio.playBgm('boss');
        this.rig.shake(0.08, 1.5);
      },
      midBoss: () => this.beginMidBoss(),
      boss: () => this.beginBoss(),
    });

    this.quality = new Quality(this.save.settings.quality, (l) => this.applyQuality(l));

    this.input = new Input(this.app);
    this.input.onPauseKey = () => {
      if (this.state === 'playing') this.setPaused(true);
      else if (this.state === 'paused') this.setPaused(false);
    };

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
  /* State transitions                                                   */
  /* ------------------------------------------------------------------ */

  private clearWorld(): void {
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.enemies.clear();
    this.boss.reset();
    this.midBoss.reset();
    this.midBossResult = null;
    this.shots.clear();
  }

  toTitle(): void {
    this.clearWorld();
    this.state = 'title';
    this.rig.mode = 'title';
    this.player.setTitlePose();
    this.player.alive = true;
    this.player.invincible = 0;
    this.ui.showTitle(this.save.hiScore);
    this.intro.showTitle(!this.titleShown);
    this.titleShown = true;
    this.audio.setPaused(false);
    this.audio.playBgm('title');
    this.needsRender = true;
  }

  start(): void {
    const turning = this.state === 'title' && this.intro.beginTurn();
    this.clearWorld();
    this.effects.clear();
    this.rng.reseed(this.seed);
    this.state = 'playing';
    this.phase = 'stage';
    this.score = 0;
    this.graze = 0;
    this.playTime = 0;
    this.misses = 0;
    this.grazeChain = 0;
    this.lastGrazeT = -10;
    this.player.reset();
    this.player.position.set(0, turning ? 0 : -0.8, FIELD.planeZ);
    this.player.setPlayPose();
    // During the title turn-around the camera waits a moment before swooping.
    this.rig.mode = turning ? 'title' : 'play';
    this.stage.reset();
    this.input.reset();
    this.quality.hold(2);
    this.ui.showHud();
    this.audio.setPaused(false);
    this.audio.playBgm('stage');
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
    this.midBoss.reset(); // skipping to the boss also skips the mid-boss
    this.stage.jumpTo(BOSS_SKIP_T);
  }

  private beginBoss(): void {
    this.phase = 'boss';
    this.enemies.clear();
    this.boss.spawn();
    this.audio.playBgm('boss');
    this.ui.announce(BOSS.name, 'BOSS');
    this.hudBoss.pattern = undefined;
    this.hudDirty = true;
  }

  setPaused(p: boolean, fromUi = false): void {
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

  /** Called when the run ends; result shown after `delay` seconds. */
  private endPlay(cleared: boolean, delay: number): void {
    this.phase = cleared ? 'clearing' : 'dying';
    this.endCleared = cleared;
    this.endTimer = delay;
  }

  private showResult(): void {
    const cleared = this.endCleared;
    const p = this.player;
    if (cleared) {
      this.addScore(p.lives * SCORE.lifeBonus + (this.misses === 0 ? SCORE.noMissBonus : 0));
    }
    const newRecord = this.save.submitScore(this.score);
    this.clearWorld();
    this.state = 'result';
    this.rig.mode = 'title';
    this.intro.hide();
    p.setTitlePose();
    p.alive = true;
    p.invincible = 0;
    this.audio.stopBgm();
    this.sfx(cleared ? 'clear' : 'gameOver');
    this.pushHud();
    this.ui.showResult({
      cleared,
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

  private sfx(name: SfxName, minGap = 0): void {
    const t = this.sfxT[name] ?? -1;
    if (this.time - t < minGap) return;
    this.sfxT[name] = this.time;
    this.audio.sfx(name);
  }

  private onShotHit = (id: number, x: number, y: number, z: number): void => {
    if (id === BOSS_ID) this.boss.damage(SHOT.damage, x, y, z);
    else if (id === MIDBOSS_ID) this.midBoss.damage(SHOT.damage, x, y, z);
    else this.enemies.damage(id, SHOT.damage);
  };

  private onPlayerHit(): void {
    const p = this.player.position;
    this.misses++;
    this.sfx('playerHit');
    this.ui.flashDamage();
    this.rig.shake(0.35, 3.5);
    this.danmaku.clear();
    this.effects.burst(p.x, p.y, p.z, PALETTE.pink, 50, 9, 0.35, 0.9);
    this.effects.burst(p.x, p.y, p.z, PALETTE.white, 20, 5, 0.25, 0.6);
    this.effects.ring(p.x, p.y, p.z, PALETTE.pink, 1.7, 0.45);
    this.grazeChain = 0;
    const dead = this.player.hit();
    this.hudDirty = true;
    if (dead) {
      this.danmaku.stopAllPatterns();
      this.boss.freeze();
      this.midBoss.freeze();
      this.effects.burst(p.x, p.y, p.z, PALETTE.cyan, 60, 12, 0.4, 1.2);
      this.effects.ring(p.x, p.y, p.z, PALETTE.white, 6, 0.9);
      this.rig.shake(0.6, 2.5);
      this.endPlay(false, 1.8);
    }
  }

  private onGraze(n: number): void {
    const bossMul = this.phase === 'boss' || this.midBoss.active ? SCORE.grazeBossMul : 1;
    const fastMul = this.player.slow ? 1 : SCORE.grazeFastMul;
    for (let i = 0; i < n; i++) {
      if (this.playTime - this.lastGrazeT < SCORE.grazeChainWindow) this.grazeChain++;
      else this.grazeChain = 0;
      this.lastGrazeT = this.playTime;
      const chain = Math.min(this.grazeChain, SCORE.grazeChainCap);
      this.addScore((SCORE.grazeBase + chain * SCORE.grazeChainStep) * bossMul * fastMul);
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
    this.time += dt;
    const settings = this.save.settings;
    const playing = this.state === 'playing';
    const control = playing && !this.intro.busy && (this.phase === 'stage' || this.phase === 'boss' || this.phase === 'clearing');
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

      this.targets.begin();
      this.enemies.addTargets(this.targets);
      this.boss.addTargets(this.targets, BOSS_ID);
      this.midBoss.addTargets(this.targets, MIDBOSS_ID);
      const firing = p.alive && (this.phase === 'stage' || this.phase === 'boss') && this.playTime > 0.8 && !this.intro.busy;
      const volleys = this.shots.update(dt, firing, p.position, this.targets, this.onShotHit);
      if (volleys > 0) this.sfx('shot', 0.11);

      this.enemies.update(dt, this.phase === 'stage' || this.phase === 'boss');
      this.boss.update(dt);
      this.midBoss.update(dt);

      // God mode (debug) still collides so grazes count; hits are ignored.
      const collide = p.alive && p.invincible <= 0 && (this.phase === 'stage' || this.phase === 'boss');
      const res = this.danmaku.update(dt, p.position, collide);
      if (collide && res.hit && !p.godMode) this.onPlayerHit();
      else if (collide && res.grazes > 0) this.onGraze(res.grazes);

      if (this.phase === 'dying' || this.phase === 'clearing') {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.showResult();
      }
    } else {
      this.enemies.update(dt, false);
      this.boss.update(dt);
      this.midBoss.update(dt);
      this.danmaku.update(dt, p.position, false);
    }

    this.effects.update(dt);
    this.bg.setSpeed(playing ? (this.playTime < 1.4 ? 2.8 : 1) : 0.45);
    this.bg.setFramesOpacity(this.rig.mode === 'play' ? 0.22 : 0);
    this.bg.update(dt);
    if (playing && this.rig.mode === 'title' && this.intro.releaseCamera) this.rig.mode = 'play';
    if (playing && this.intro.busy) p.position.y += (-0.8 - p.position.y) * (1 - Math.exp(-dt * 4));
    this.rig.update(dt, p.position, p.vx);
    this.intro.update(dt, this.rig.camera);

    if (playing) {
      this.hudTimer += dt;
      if (this.hudDirty || this.hudTimer >= HUD_INTERVAL) this.pushHud();
    }
  }

  private pushHud(): void {
    this.hudTimer = 0;
    this.hudDirty = false;
    const h = this.hud;
    h.score = this.score;
    h.hiScore = Math.max(this.save.hiScore, this.score);
    h.lives = this.player.lives;
    h.graze = this.graze;
    if (this.boss.active && this.boss.state !== BossState.Dying) {
      this.hudBoss.hp = this.boss.hp;
      h.boss = this.hudBoss;
    } else if (this.midBoss.active && this.midBoss.state !== MidBossState.Dying) {
      this.hudMid.hp = this.midBoss.hp;
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
    return {
      state: this.state,
      phase: this.phase === 'stage' && this.midBoss.active ? 'midboss' : this.phase,
      score: this.score,
      lives: this.player.lives,
      graze: this.graze,
      time: Math.round(this.playTime * 100) / 100,
      stageTime: Math.round(this.stage.t * 100) / 100,
      bossHp: b.active ? Math.round(b.hp * 1000) / 1000 : null,
      bossPhase: b.active ? b.phaseIndex : null,
      midBossHp: this.midBoss.active ? Math.round(this.midBoss.hp * 1000) / 1000 : null,
      midBossPhase: this.midBoss.active ? this.midBoss.phaseIndex : null,
      midBossState: this.midBoss.active ? MidBossState[this.midBoss.state] : null,
      midBossResult: this.midBossResult,
      enemies: this.enemies.activeCount,
      bullets: this.danmaku.activeCount,
      fps: Math.round(this.quality.fps),
      quality: this.quality.level,
      player: { x: Math.round(this.player.position.x * 1000) / 1000, y: Math.round(this.player.position.y * 1000) / 1000 },
    };
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
    if (!this.midBoss.forceBreak()) this.boss.forceBreak();
  }

  /* ------------------------------------------------------------------ */
  /* Mid-boss (StageData.MIDBOSS; the stage timeline waits while it lives) */
  /* ------------------------------------------------------------------ */

  /** 'defeated' / 'escaped' once this run's mid-boss is over (debug / tests). */
  private midBossResult: null | 'defeated' | 'escaped' = null;

  private createMidBoss(): MidBoss {
    return new MidBoss(this.danmaku, this.effects, this.rng, {
      onPhaseStart: (i) => {
        const def = MIDBOSS.phases[i];
        this.ui.announce(def.name, `MID BOSS  ${i + 1} / ${MIDBOSS.phases.length}`);
        this.hudMid.pattern = def.name;
        this.hudDirty = true;
      },
      onPhaseEnd: (i, broken, cancelled) => {
        // Timeout = no bonus at all (it is about to fly away / change phase on its own).
        if (broken) {
          const last = i >= MIDBOSS.phases.length - 1;
          this.addScore(cancelled * SCORE.bulletCancel + (last ? 0 : SCORE.midBossPhaseBreak));
          this.rig.shake(0.14);
        }
        this.hudMid.pattern = undefined;
        this.hudDirty = true;
        const p = this.midBoss.position;
        this.effects.ring(p.x, p.y, p.z + 2, broken ? PALETTE.gold : PALETTE.purple, 14, 0.6);
      },
      onDefeated: () => {
        this.sfx('midbossDown');
        this.rig.shake(0.42, 3);
        this.danmaku.clear();
        this.addScore(SCORE.midBossKill);
        this.ui.announce('MID BOSS DEFEATED', `+${SCORE.midBossKill.toLocaleString()}`);
        this.endMidBoss('defeated');
      },
      onEscaped: () => {
        this.ui.announce('ESCAPED', 'ルクシアは夜空の彼方へ');
        this.endMidBoss('escaped');
      },
      onHit: (x, y, z, damaged) => {
        if (damaged) this.addScore(SCORE.midBossHit);
        this.effects.burst(x, y, z + 1, damaged ? PALETTE.cyan : PALETTE.purple, 2, 7, 0.4, 0.25);
        this.sfx('enemyHit', 0.07);
      },
    });
  }

  private beginMidBoss(): void {
    this.enemies.retreatAll();
    this.midBoss.spawn();
    this.midBossResult = null;
    this.audio.playBgm('midboss');
    this.ui.announce(MIDBOSS.name, MIDBOSS.sub);
    this.hudMid.pattern = undefined;
    this.hudDirty = true;
  }

  private endMidBoss(result: 'defeated' | 'escaped'): void {
    this.midBossResult = result;
    this.hudDirty = true;
    if (this.phase !== 'stage') return; // player died meanwhile
    this.audio.playBgm('stage');
    this.stage.resume();
  }

  /** Debug: jump to the mid-boss (starts a run when needed). */
  skipToMidBoss(): void {
    if (this.state !== 'playing' && this.state !== 'paused') this.start();
    if (this.phase !== 'stage' || this.midBoss.active) return;
    this.enemies.clear();
    this.danmaku.stopAllPatterns();
    this.danmaku.clear();
    this.stage.jumpTo(MIDBOSS_SKIP_T);
  }
}
