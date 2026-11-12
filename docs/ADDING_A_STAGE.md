# 面の追加・差し替え手順（2面・3面の担当向け）

Game.ts はほぼ触らずに済むように作ってある。面の中身はすべて `StageDef`（`src/game/stages/types.ts`）に書く。
今の 2面・3面は `src/game/stages/placeholders.ts` の **仮定義**（1面の中身＋本来のタイトル・BGM・背景）。

## 1. フォルダを作る
```
src/game/stages/stage2/
  index.ts        StageDef（タイムライン・中ボス/ボス設定・背景）
  enemies.ts      雑魚の形・種類の登録（import するだけで登録される）
  Lanterna.ts     中ボスのクラス（PhasedBoss を継承）
  Eclipse.ts      ボスのクラス
  background.ts   BackgroundPreset（placeholders.ts の BG_TWILIGHT を移して育てる）
```

## 2. StageDef を書く
```ts
import { defineBoss } from '../../bosses/BossLike';
import type { StageDef } from '../types';
import './enemies';

export const STAGE2: StageDef = {
  id: 'stage2', number: 2, title: '黄昏の境界', subtitle: 'TWILIGHT BORDER',
  bgm: { stage: 'stage2', midboss: 'midboss2', boss: 'boss2' },
  background: BG_TWILIGHT,
  enemyKinds: ['moth', 'wisp', 'shard'],
  events: [
    { t: 2, type: 'wave', formation: 'line', kind: 'moth', count: 5, side: -1, stay: 4, fireEvery: 1.6, intensity: 0.4 },
    { t: 9, type: 'intro', pattern: 'sunRays', duration: 4.5, intensity: 0.3, sub: '光条の間を抜けろ' },
    { t: 20, type: 'scenery', name: 'starfall', duration: 4 },
    { t: 34, type: 'midboss' },        // タイムラインはここで止まり、中ボスが消えたら再開
    { t: 58, type: 'warning' },        // 雑魚が退く・WARNING・ボス曲（sub 省略時は warningText）
    { t: 61, type: 'boss' },           // 必ず 1 つ
  ],
  midBoss: defineBoss(LANTERNA_CONFIG, (ctx) => new Lanterna(ctx)),
  boss: defineBoss(ECLIPSE_CONFIG, (ctx) => new Eclipse(ctx)),
  warningText: '沈む光の向こうから何かが来る',
  startPower: 2,               // ?stage=2 で始めたときのパワー
  // score: { bossKill: 40000 }, // SCORE（StageData.ts）の上書きが必要なら
};
```
イベントは t 昇順。開発ビルドでは起動時に `validateStages()` が未登録の種類・編隊、順序、boss 数をコンソールに警告する。

## 3. 登録する
`src/game/stages/index.ts` の `STAGES` の該当要素を `STAGE2` に差し替える（並び順＝プレイ順）。

## 4. 雑魚（`src/game/enemies/registry.ts`）
```ts
registerEnemyShape('moth', { core: () => geo, crown: () => geo }); // 新しい形 = 描画 2 回（画面にいる間だけ）
registerEnemyKind('moth', {
  shape: 'moth', hp: 14, score: 200, scale: 1.4, hitRadius: 2, color: 0xffa860,
  drops: { stars: 2, power: 0.5 },
  spin: 1.2, spinAxis: 'y' | 'z', faceMotion?, pulse?: { speed, amount }, trail?: { color, every, size, life },
  motion: { type: 'station' }                       // 既定: 入場 → stay 秒ホバー → 退場
        | { type: 'drift', vx, vy, vz?, sway? }    // ホバー中に流れる
        | { type: 'path', arc? }                   // start → exit を stay 秒で一直線（彗星）
        | { type: 'custom', update(s) { …; return done; } },
  fire: { pattern: 'aimedBurst', duration?, continuous?, firstDelay?, intensityMul? } | null, // 既定 aimedBurst、null = 撃たない
});
registerFormation('spiral', (i, n, wave, out, rng) => { out.station.set(…); defaultEntry(wave, out); });
```
既存の編隊: `line` `v` `arc` `columns` `center` `sides`（左右の端に対で）`diagonal`（斜めに横切る、`x` で向き）`scatter` `low`（下から浮かぶ）。
WaveEvent の追加項目: `delayStep`（隊員の出現間隔）、`quiet`（撃たない）、`x` / `y`（編隊ごとのずらし）。

## 5. ボス・中ボス（`src/game/bosses/`）
`PhasedBoss<C>` を継承すると、フェーズ進行（HP しきい値 or タイムアウト、パターンの並列実行と再装填、ブレイク時の弾→星、
最終フェーズ撃破で Dying → onDefeated、時間切れで Escape → onEscaped）、ダメージ、当たり判定、freeze が全部入っている。
実装するのは見た目と動きだけ:
```ts
class Eclipse extends PhasedBoss<EclipseConfig> {
  constructor(ctx: BossContext<EclipseConfig>) { super(ctx); /* this.group にメッシュを追加 */ }
  protected onSpawn() { this.position.set(0, 10, -170); }
  protected moveEnter(u: number, dt: number) { … }        // u = 0..1
  protected movePhase(dt: number) { … }                    // this.phaseIndex, this.life
  protected moveBreather(dt: number) { … }                 // 省略時は movePhase
  protected updateDying(dt: number): boolean { …; return this.t >= this.config.deathSec; }
  protected updateEscape(dt: number): boolean { …; return this.t >= 2; }
  protected animate(dt: number) { this.group.position.copy(this.position); … this.flash … }
}
```
`BossConfig`: name, sub, escapeText, maxHp, enterSec, breatherSec, deathSec, position, hitRadius, targetZ, hitFlash,
cancelOnTimeout, phases[{ name?, patterns[{ id, intensity }], hpEnd, timeout }]。設定を増やすときは `interface XConfig extends BossConfig`。
PhasedBoss を使わない場合は `BossLike` を直接実装する（HUD・スコア・アイテムは Game が `BossEvents` で処理する）。

## 6. 弾幕パターン
`src/core/types.ts` の `PatternId` / `PATTERN_NAMES` に追加し、`src/danmaku/patterns.ts` に `Emitter` のサブクラスと
`createEmitter` の case を足す。**必ず** `dev/danmaku.html?fairness=1`（`ALL` に追加）でボットの生存 10/10 を確認する。
`dev/danmaku.html?pattern=id&auto=1` で見た目も確認。暗い面では「明るい芯＋色の縁」を守る（docs/STAGES.md）。

## 7. 背景（`BackgroundPreset`、`src/game/Background.ts`）
`clear / fog / fogNear / fogFar`、`stars` と `dust`（5 色・白の割合・密度 0..1・大きさ・速さ・明るさ）、`nebula`（色・中心の光・強さ・塊の数・seed）、
`frame`（トンネル枠の色・不透明度）、`light`（半球光・キー・リム 2 本）、`darkness`（0..1）/`darkRadius`（画面高さ比）/`darkColor`、
`streakColor`（流れ星）、`layers`（面専用の追加物：`BackgroundLayer { object3d, update, setOpacity, scenery?, dispose }` を返す関数）。
面の切り替え時は全部が 3.6 秒でモーフし、レイヤーはフェードで入れ替わる。`{ ...BG_STAR_SEA, …}` から書き始めるとよい。
闇の覆いは renderOrder 2.5：それより小さい renderOrder（背景、雑魚、ボスの円陣など）は暗くなる。光らせたいものは 3 以上に。

## 8. 確認
- `npx tsc --noEmit`、`npx vite build`
- `?stage=2&invincible=1`（その面から）、`?stage=2&midboss=1`、`?stage=2&boss=1`
- `__bloom.clearStage()` で集計 → 移動 → 次の面、`__bloom.skipToStage(n)`、`__bloom.advance(sec)`（描画なしで早送り）、`__bloom.state()`
- コンソールの `[stages]` 警告がないこと

## 9. ハードモード（`Difficulty` と `hard` / `hardOnly`）
難易度は `src/game/stages/types.ts` の `DIFFICULTY.normal / hard`（`Difficulty`）。面の側で書くのは **ハード専用の追加だけ**。倍率は全部自動で掛かる:
```ts
interface Difficulty {
  id: 'normal' | 'hard';
  bullet: number;       // 全パターン強度 ×（scaleIntensity で 0..1 に clamp）— 雑魚・紹介・中ボス・ボス・ハード追加分すべて
  enemyHp: number;      // 雑魚 HP ×
  bossHp: number;       // 中ボス／ボス maxHp ×
  fireRate: number;     // WaveEvent.fireEvery ×（< 1 = 雑魚がよく撃つ）
  timeout: number;      // フェーズの timeout ×
  scoreMul: number;     // 得点すべて ×（Game.addScore と集計のボーナス）
  deathbombSec: number; // 決死ボムの猶予（実時間秒）
  attract: number;      // アイテム吸引半径 ×
  extraLayers: boolean; // 下の hard / hardOnly を使うか
}
```
- **ボス／中ボスのフェーズ**（`BossPhaseDef.hard`）：`hard: { patterns?: [{ id, intensity }], name? }`。`patterns` は通常のパターンの
  **後ろに追加**され並列に走る（強度は他と同じく × bullet）。`name` はハードでのスペル名。
  ゲームは `resolveBossConfig(config, difficulty)`（`bosses/BossLike.ts`）で解決した設定でボスを作るので、`this.config.phases` は
  ハードでは追加込み・timeout 込みになる。パターンを id で探すボス（エクリプスの totalEclipse）はそのまま動く。
  ```ts
  { name: '日輪の光条', patterns: [{ id: 'coronaRays', intensity: 0.5 }],
    hard: { patterns: [{ id: 'aimedBurst', intensity: 0.3 }] }, hpEnd: 0.75, timeout: 15 },
  ```
- **タイムライン**：どのイベントにも `hardOnly: true`（ハードだけで出る）。雑魚の波は `hard: { count: 7 }` のように
  WaveEvent の一部を上書きできる（`eventsFor(events, d)` が適用。ノーマルでは無視される）。t 昇順は守る。
- **確認**：`dev/hard-fairness.html`（StageDef から全フェーズと道中をハード設定で組み立ててボットに通す。`?mode=normal` で比較、
  `?only=stage2`）。行は bot ≥ 9/10・peak < 850 で合格。各面の個別ページも `?hard=1`（`dev/danmaku.html?fairness=1&hard=1`、
  `dev/stage2-fairness.html?hard=1`、`dev/stage3.html?fair3=1&hard=1`）。ゲームは `?mode=hard`、`__bloom.setMode('hard')`、`__bloom.state().mode`。
