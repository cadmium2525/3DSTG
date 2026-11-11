# BLOOM DIVE — 構成と開発計画

企画書「PROJECT: BLOOM DIVE」(スマホ縦画面 × 後方視点 × 3D弾幕STG、GitHub Pages 無料公開) の MVP 実装計画。

## 技術
Three.js + TypeScript + Vite。静的ビルド (`npm run build` → `dist/`) を GitHub Actions で Pages に公開。
外部アセットなし（モデル・弾・音はすべてコード生成）。

## 座標系
X=左右 / Y=上下 / Z=奥行き。自機は操作平面 `z=0` 上を動き `-Z` を向く。敵は `z≈-60`、敵弾は `+Z` 方向へ迫る。
カメラは自機後方 (`+Z`) から追従。定数は `src/core/config.ts`。

## モジュール分担（契約は `src/core/types.ts`）
| フォルダ | 役割 | 公開 API |
|---|---|---|
| `src/core/` | 共有の定数と型 | `config.ts`, `types.ts` |
| `src/character/` | 主人公の手続き生成3Dモデル | `class Heroine { group; update(dt, motion); dispose() }` |
| `src/danmaku/` | 敵弾プール(InstancedMesh)、弾幕4種+狙い弾、衝突・グレイズ、接近予兆 | `createDanmaku(): Danmaku` |
| `src/game/`, `src/main.ts` | ループ、カメラ、入力、自機、ショット、敵、ボス、ステージ進行、背景、品質自動調整 | — |
| `src/ui/`, `src/audio/`, `src/save.ts` | DOM HUD・タイトル・リザルト・ポーズ、Web Audio 合成 BGM/SE、localStorage | `createUI()`, `createAudio()`, `createSaveStore()` |

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
