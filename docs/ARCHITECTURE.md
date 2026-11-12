# BLOOM DIVE — 構成と開発計画

企画書「PROJECT: BLOOM DIVE」(スマホ縦画面 × 後方視点 × 3D弾幕STG、GitHub Pages 無料公開) の MVP 実装計画。

## 技術
Three.js + TypeScript + Vite。静的ビルド (`npm run build` → `dist/`) を GitHub Actions で Pages に公開。
3D モデル・弾はコード生成。BGM/SE は「かなでる」で作成した MP3（`public/audio/`、生成元 `audio-src/`）。タイトルの立ち絵は `public/title/`。

## 座標系
X=左右 / Y=上下 / Z=奥行き。自機は操作平面 `z=0` 上を動き `-Z` を向く。敵は `z≈-60`、敵弾は `+Z` 方向へ迫る。
カメラは自機後方 (`+Z`) から追従。定数は `src/core/config.ts`。

## モジュール分担（契約は `src/core/types.ts`）
| フォルダ | 役割 | 公開 API |
|---|---|---|
| `src/core/` | 共有の定数と型 | `config.ts`, `types.ts` |
| `src/character/` | 主人公の手続き生成3Dモデル | `class Heroine { group; update(dt, motion); dispose() }` |
| `src/danmaku/` | 敵弾プール(InstancedMesh)、弾幕4種+狙い弾、衝突・グレイズ、接近予兆 | `createDanmaku(): Danmaku` |
| `src/game/`, `src/main.ts` | ループ、カメラ、入力、自機、ショット（パワー Lv1〜4）、アイテム、ボム、敵、中ボス、ボス、タイトル演出、ステージ進行、背景、品質自動調整 | — |
| `src/ui/`, `src/audio/`, `src/save.ts` | DOM HUD・タイトル・リザルト・ポーズ、Web Audio で BGM/SE ファイル再生、localStorage | `createUI()`, `createAudio()`, `createSaveStore()` |

## 1プレイの流れ（60〜90秒）
タイトル → 道中(約25〜30秒: 小型敵 + 狙い弾、波紋リング/星座の雨を単体で紹介)
→ ボス(螺旋回廊 → 花弁の開花 → 波紋リング+星座の雨、HP かタイムアウトで移行) → リザルト → 再挑戦。

## アイテム・ショットパワー・ボム（光の少女の力 = 光：白・金・シアン）
- **アイテム**（`src/game/Items.ts`、1 つの InstancedMesh のビルボード、プール 384、毎フレーム確保なし）
  - 星のかけら（得点・金/シアンの小さな星）：値 = `ITEMS.starValue` ×（1 + グレイズ連鎖 × `chainBonus`、最大 ×3）。
    ボム・ボス/中ボスのフェーズ撃破・撃破時に消えた弾は星に変わり（`Danmaku.clear` の `onCleared`。1 回の消去で最大約 90 個、1 個が複数弾分の値 `SCORE.bulletCancel` を持つ）、自機へ吸い込まれる。
  - 光の玉（パワー）：白い芯＋金のリング＋回転する十字の光芒、ゆっくり上下、光の粒の尾。敵弾（丸い玉）と形が違う。
  - 動き：撃破地点（z≈-40〜-60）から放物線を描いて操作平面 z=0 の場の中ほどへ 1〜1.4 秒で着地（減速しながら到着）→ ゆっくり下へ流れ 6.5 秒で消える。
    自機の半径 1.9（低速 2.8）以内・自機が上部（y>2.2）にいる間・マグネット中（ボム、フェーズ撃破、ステージクリア）は自機へ誘導。取得半径 0.62。
  - ドロップ：`ITEMS.drops`（小型 2〜3 個の星＋0.5〜0.6 個の玉を端数繰り越し、ランタン 8＋4）、ボスのフェーズ撃破 12＋4、中ボスのフェーズ撃破 8＋3、中ボス撃破 16＋10（直接吸い込み）。
- **ショットパワー**（`SHOT_LEVELS` / `POWER`）：Lv1→2→3→4 に玉 8/12/16 個。Lv1 2 本（従来と同じ DPS 28）、Lv2 3 本 ×1.2、Lv3 4 本（外側は金色の拡散）×1.4、Lv4 5 本 ×1.65。自動照準はそのまま。
  ボス/中ボスの HP は ×1.3 / ×1.075（ボスは Lv3 で従来とほぼ同じ長さ、Lv1 でも各フェーズを時間内に削れる）。ミスで玉 12 個分を失い（Lv1 未満にはならない）、5 個が飛び散って拾い直せる。最大時の玉は 1000 点。
- **ボム「光の結界」**（`src/game/Bomb.ts`、`BOMB`）：右下の丸ボタン（押した瞬間に発動）／キーボード X・B。在庫 2、ミスのたびに 2 へ補充。
  自機の周りに六角格子の光のドーム、始まりの放射光、奥へ走る光の輪。消去半径が 1.15 秒で奥の敵まで広がり 1.5 秒間弾を消し続け（→星）、
  0.12 秒と 0.55 秒に小型敵へ 30、ボス/中ボスへ 22 のダメージ。2.5 秒無敵（点滅なし）。ショットは撃ち続ける。
  **決死ボム**：被弾後 0.25 秒（実時間。その間は世界が 0.3 倍速、自機の周りに縮むピンクの輪、ボタンが点滅）以内にボムを押すと被弾を取り消す。
- HUD：3 段目に「POWER Lv2 ＋ 4 つのゲージ（最大で MAX）」と結界の残数アイコン。
- 効果音：`itemScore`（連鎖で音程が上がる。`AudioEngine.sfx(name, pitch)`）/ `itemPower` / `powerUp` / `bomb`（`audio-src/sfx/*.json`）。
- デバッグ：`__bloom.state()` に bombs / power / powerProgress / powerOrbs / maxPower / items / bombActive / hitPending、
  `__bloom.bomb()`、`__bloom.setPower(n)`、`__bloom.dropItems(stars, orbs, x?, y?, z?)`、URL `?power=N`。

## フェーズ
1. 操作検証: 自機移動・カメラ・接近弾・判定
2. 弾幕演出: 螺旋/花/リング/星座、発光、近接予兆
3. 遊びの完成: ボス、スコア、残機、グレイズ、リザルト、音
4. 公開・改善: Pages 公開、実機テスト、負荷調整

## 開発体制
設計・統合・主人公モデル: リード / コード生成: Opus サブエージェント(3分担) / テストプレイ: Sonnet サブエージェント(Playwright で自動プレイし報告)。

## 音（BGM / SE）— `audio-src/` → `public/audio/`
BGM と SE は作曲アプリ「かなでる」（mp4mp3 リポジトリの `daw/`、純粋 JS のエンジン）で作り、圧縮済みファイルとして配信する。
- `audio-src/bgm/*.gen.mjs` → `*.json`：曲の生成スクリプトと、かなでるの曲 JSON（正本。アプリに貼り付けて編集・試聴できる）。`bars` がそのままループの長さ。
  1面：title（88 BPM・16 小節）/ stage（150・36）/ midboss（160・24）/ boss（170・40）。
  2面「黄昏の境界」：stage2（145・36, E minor→G major のサビ, 琴・ハープ・バイオリン）/ midboss2（155・24, G minor, ゲートで明滅するチェレスタ）/
  boss2（165・40, F minor, 日輪のトランペット主題が Db→Dbm に蝕まれる, 合唱・オーケストラヒット）。
  3面「深淵」：stage3（136・32, C# minor, ドローン＋大太鼓の空白 → 半分テンポ → 全開）/ midboss3（160・24, A minor, 行進スネア・低音金管の 3-3-2 リフ）/
  boss3（170・56 ≒ 79 秒, 影の少女：タイトル主題の反行形を D minor で → 後半でタイトル主題そのものが D major で反撃）。
  ending（78・17 小節, 一度だけ再生, タイトル主題の D major での解決）。曲 JSON に `"loop": false` を書くと一回再生用に描画（余韻を残し、ループ用パディングなし）、
  マニフェストに `loop: false`（loopStart 0 / loopEnd = 長さ）が入り、再生側は鳴り終わったら止まる（unlock() などで再開しない）。
- `audio-src/sfx/*.json`：かなでるの効果音（プリセット・層）または `{"mix":[...], "post":[...], "peak":dB}` の重ね合わせ。名前は `SfxName` と同じ。
  新しい効果音だけ作るときは `node audio-src/build.mjs --only itemScore,bomb`（他のファイルは変わらない）。
- `audio-src/build.mjs`（`npm run audio`）：生成 → 自動ミックス（トラック音量）→ かなでるで描画 → 余韻をループ頭に折り返し →
  ループの前後に 0.25 秒の周期的なパディングを付けて MP3（BGM 128kbps ステレオ / SE 96kbps モノラル, 44.1kHz）で `public/audio/` に出力。
  `public/audio/manifest.json` と `src/audio/manifest.ts`（loopStart/loopEnd・bpm・キャッシュ用ハッシュ）も書き出す。
  `--only stage,shot` `--no-gen` `--report`（ラウドネス等）`--sheet`（解析 PNG を `audio-src/.out/`）`--wav`。
- 必要なもの：node 18+、ffmpeg、mp4mp3 のチェックアウト（`MP4MP3_DIR`、既定 `../cadmium2525/mp4mp3`）。
- `src/audio/index.ts`：Web Audio 再生。`createAudio()` で SE・title・1面の 3 曲だけ取得開始。2・3面とエンディングは、要求されたとき
  （`playBgm`）か、流れの直前の曲が始まったとき（`NEXT` 表：boss → stage2、boss2 → stage3、boss3 → ending など）に取得する。
  `unlock()` で AudioContext 作成・デコード（SE → 要求中の BGM → `NEXT` の曲を先読みデコード。BGM のデコードは 1 本ずつの優先度付きキューで、要求中の曲が常に先頭）。
  デコード済み BGM（1 曲 15〜30 MB）は最大 4 本（`MAX_DECODED`）。再生中・要求中・その次の曲以外を古い順に捨て、圧縮データ（最大 6 曲 `MAX_RAW`、超えたら HTTP キャッシュから再取得）から必要時に再デコード。
  BGM は AudioBufferSourceNode の loopStart/loopEnd でループし、切り替えはクロスフェード。`beat` は現在曲の開始からの拍数。
  開発用に `audio.__debug()`（デコード済み・保持中の圧縮データ・再生中・キュー）を返す。`dev/ui.html` に全 11 曲の試聴ボタン。
  SE は名前ごとの同時発音数・最小間隔、大きな SE では BGM をダッキング。
