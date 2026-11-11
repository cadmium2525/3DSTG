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
| `src/game/`, `src/main.ts` | ループ、カメラ、入力、自機、ショット、敵、中ボス、ボス、タイトル演出、ステージ進行、背景、品質自動調整 | — |
| `src/ui/`, `src/audio/`, `src/save.ts` | DOM HUD・タイトル・リザルト・ポーズ、Web Audio で BGM/SE ファイル再生、localStorage | `createUI()`, `createAudio()`, `createSaveStore()` |

## 1プレイの流れ（60〜90秒）
タイトル → 道中(約25〜30秒: 小型敵 + 狙い弾、波紋リング/星座の雨を単体で紹介)
→ ボス(螺旋回廊 → 花弁の開花 → 波紋リング+星座の雨、HP かタイムアウトで移行) → リザルト → 再挑戦。

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
  title（88 BPM・16 小節）/ stage（150・36）/ midboss（160・24）/ boss（170・40）。
- `audio-src/sfx/*.json`：かなでるの効果音（プリセット・層）または `{"mix":[...], "post":[...], "peak":dB}` の重ね合わせ。名前は `SfxName` と同じ。
- `audio-src/build.mjs`（`npm run audio`）：生成 → 自動ミックス（トラック音量）→ かなでるで描画 → 余韻をループ頭に折り返し →
  ループの前後に 0.25 秒の周期的なパディングを付けて MP3（BGM 128kbps ステレオ / SE 96kbps モノラル, 44.1kHz）で `public/audio/` に出力。
  `public/audio/manifest.json` と `src/audio/manifest.ts`（loopStart/loopEnd・bpm・キャッシュ用ハッシュ）も書き出す。
  `--only stage,shot` `--no-gen` `--report`（ラウドネス等）`--sheet`（解析 PNG を `audio-src/.out/`）`--wav`。
- 必要なもの：node 18+、ffmpeg、mp4mp3 のチェックアウト（`MP4MP3_DIR`、既定 `../cadmium2525/mp4mp3`）。
- `src/audio/index.ts`：Web Audio 再生。`createAudio()` で取得開始、`unlock()` で AudioContext 作成・デコード（SE → 要求中の BGM → 残り）。
  BGM は AudioBufferSourceNode の loopStart/loopEnd でループし、切り替えはクロスフェード。`beat` は現在曲の開始からの拍数。
  SE は名前ごとの同時発音数・最小間隔、大きな SE では BGM をダッキング。
