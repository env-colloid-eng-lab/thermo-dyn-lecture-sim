# CONTRIBUTING.md ― このリポジトリで作業するときの約束

人が作業するときも、Claude Code などの AI ツールで作業するときも、この文書に従う。

熱力学の講義（筑波大学・物理学：熱力学パート、担当 杉本）で使う、
粒子の運動（ミクロ）と状態量（マクロ）を対応させたブラウザ教材。
GitHub Pages（main / root）でそのまま公開される静的サイト。

## 絶対に守ること

- **ビルド不要・外部ライブラリなし** を維持する（素の HTML + ES Modules + Canvas）。CDN や npm パッケージを実行時に読み込まない。
- **UI と解説は日本語**。講義スライドの用語に合わせる（断熱壁・透熱壁・操作1〜3・準静的過程・示量変数/示強変数 など）。
- **英語版**（`en/`）も同じ内容に保つ。日本語ページを変えたら、対応する `en/` のページも同じように直す（id・数値・ロジックは同一、文章だけ英語）。JavaScript 内の表示文字列は `tr('日本語', 'English')`（`assets/js/i18n.js`）で書く。
- **符号の約束は ΔU = Q + W**（W：系が「された」仕事、Q：系が「受け取った」熱）。表示・解説・テストすべてで統一。
- **図の約束**：斜線の帯＝断熱壁、細い実線＝透熱壁、薄い青＝流体（`assets/js/render.js`）。
- **物理モデル**：2次元剛体円板気体、m = 1、k_B = 1。`U = NkT`、`PV = NkT`、γ = 2。3次元の式（3/2 NkT など）を書かない。書くなら「3次元なら」と明記する。
- **エネルギーの帳簿**：W と Q は衝突1回ごとの運動エネルギー変化として `engine.js` の `ledger` に記録する。ΔU = Q + W が丸め誤差の範囲で厳密に成り立つことを壊さない。
- `assets/js/engine.js` は DOM に依存させない（Node のテストから直接 import している）。

## 作業の流れ

main は GitHub Pages でそのまま学生に公開されるので、**main に直接 push しない**。

1. main から作業用ブランチを作る（例：`git switch -c add-carnot-cycle`）。
2. 変更してローカルで下の「確認すること」を済ませ、ブランチを push する。
3. GitHub で Pull Request を作る。自動テスト（物理テスト・ブラウザテスト）が緑になり、
   スクリーンショット（Actions の実行結果ページの Artifacts → `screenshots`）で見た目を確認してから main にマージする。

### はじめての準備

Node.js 20 以上を入れてから：

```bash
npm install                        # 開発用の Playwright（ブラウザテスト用）だけが入る
npx playwright install chromium    # テスト用ブラウザ（初回のみ）
npm run serve                      # http://localhost:8000/ で表示を確認
```

公開ページ自体は npm パッケージを一切使わない。`npm install` で入るものはテスト専用。

## 変更したら必ず確認すること

1. `npm test`（= `node tests/physics-test.mjs`）がすべて PASS。物理の振る舞いを変えたらテストも追加・更新する。
2. ブラウザでの確認：`npm run test:browser`（= `node tests/smoke-browser.mjs --shots`）
   - 既にある Chromium を使うときは `CHROMIUM_PATH=/path/to/chrome npm run test:browser`
   - 全ページを開き、すべてのボタン・チェックボックス・スライダーを操作して、JS エラーと画面上の NaN/undefined がないことを確認する。
   - `tests/screenshots/` に各ページのスクリーンショット（PC幅 1400px と スマホ幅 390px）が保存されるので、変更したページは画像を見て崩れがないか確かめる。
3. スマホ幅（390px）で横スクロールが出ないこと。
4. 変更内容を README.md の該当箇所に反映する（ページ一覧・モデルの説明）。
5. Pull Request の説明には「何を変えたか」「どう確認したか（テスト結果・スクショで見た点）」「気づいた懸念」を短く書く（テンプレートあり）。

## ファイル構成

- `index.html` 目次 / `sims/01〜09-*.html` 各シミュレーション / `en/` 英語版（同じ構成）
- `assets/js/engine.js` 分子動力学（`Gas` クラス：壁・熱源・ピストン・撹拌翼・仕切り（断熱・透熱・半透膜）・圧力測定・帳簿）
  - ピストンは `piston.mode` が `'position'`（目標位置へ一定の速さ）か `'force'`（質量 `M`、外圧 `Pext` の定圧ピストン）
  - `gas.advance(t)` で時間 t だけ進める（速い粒子がいると自動で刻みを細かくする）
- `assets/js/render.js` 描画（`SimView`）、`plot.js` グラフ（`TimePlot` / `XYPlot` / `HistPlot`）、`ui.js` UI 部品
  - 再生速度は `bindSpeed()`（対数スライダー、×1 = 1フレームで時間 0.1）
- `assets/js/experiments.js`（熱容量の測定手順）、`entropy.js`（場合の数）、`cycles.js`（サイクルの自動運転）：DOM に依存しない。ページとテストの両方から使う
- `tests/physics-test.mjs` 物理テスト、`tests/smoke-browser.mjs` ブラウザ操作テスト

## 表示・教育上の方針

- 粒子の動きは「目で追える速さ」を既定にする（各ページの再生速度の初期値は ×1〜×3 程度）。時間のかかる準静的操作だけ自動で早送りする。
- 温度の違いは、色（`speedColor`、基準温度 Tref で固定）・平均の速さ・速さの分布（はじめの分布を破線で重ねる）で見せる。T が2倍でも速さは √2 倍にしかならないことを解説で補う。
- 数値は時間平均やゆらぎの扱いを明記する。粒子数が少ないことによるゆらぎは隠さず、教材として説明する。
- 各ページの「やってみよう」「問い」は講義（スライド）の流れに沿わせる。

## 今後の候補（未着手）

- 3次元版（U = 3/2 NkT）への切り替え表示
