# ミクロとマクロで見る熱力学 ― インタラクティブ教材

熱力学の講義（物理学：熱力学パート）で扱う **設定・壁・操作・過程・第一法則・示量/示強・熱容量・エントロピー・熱機関** を、
容器の中の粒子の運動（ミクロ）と状態量 *T, P, V, U, W, Q*（マクロ）を対応させながら
ブラウザ上で操作できるシミュレーション集です。

インストール不要・ビルド不要の静的サイト（HTML + JavaScript）なので、
GitHub Pages でそのまま公開できます。

## シミュレーション一覧

| # | ページ | 内容 | 講義との対応 |
|---|---|---|---|
| 01 | `sims/01-operations.html` | 断熱壁/透熱壁、操作1（ピストン）・操作2（撹拌）・操作3（熱源）で粒子の運動と *T, P, U* がどう変わるか。速さの分布とマクスウェル分布 | 設定・平衡状態・操作 |
| 02 | `sims/02-equilibrium.html` | 温度の違う二つの流体を透熱壁で接触 → 平衡へ緩和。仕切りを取り除くと混合 | 平衡状態への遷移・部分系/複合系 |
| 03 | `sims/03-processes.html` | ピストンを準静的/速く往復、自由膨張。P–V 図で「ピストンが受けた圧力」と状態方程式を比較 | 過程・準静的過程・可逆性・不可逆な断熱過程 |
| 04 | `sims/04-isothermal.html` | 等温圧縮で *W* をしても Δ*U* ≈ 0、エネルギーは熱として環境へ。エネルギーの流れ図 | 第一法則・仕事と熱・熱の本性 |
| 05 | `sims/05-extensive.html` | 系を壁で分割／同じ系をくっつける。*N, V, U* は相加的・示量的、*T, P* は示強的 | 状態変数・相加性・示量性・示強性 |
| 06 | `sims/06-heat-capacity.html` | 熱源に触れさせて *Q* と Δ*T* を測り *C* = *Q*/Δ*T*。定積（ピストン固定）と定圧（おもりを載せたピストン）で *C*<sub>V</sub> = *Nk*, *C*<sub>P</sub> = 2*Nk* | 熱容量・マイヤーの関係・自由度 |
| 07 | `sims/07-entropy.html` | 自由膨張・混合・熱の移動の不可逆性。場合の数から *S* = *k* ln *W*、速度の反転（時間の逆回し）、同じ気体の「混合」 | エントロピー・第二法則・ボルツマンの式 |
| 08 | `sims/08-heat-engines.html` | カルノー／スターリングサイクルを自動で回し、P–V 図・熱の流れ・各過程の収支から効率 η と成績係数 COP を測る。逆回しでヒートポンプ、再生器の有無 | 熱機関・カルノーの定理・ヒートポンプ |

各ページに「やってみよう」と「問い」があり、授業中の投影（右上の **投影モード** で文字拡大、スペースキーで再生/停止）にも、学生の自習・レポートにも使えます。

## GitHub Pages で公開する

1. このフォルダの中身をリポジトリ（例：`<organization>/thermo-sim`）の `main` ブランチ直下に置く
2. リポジトリの **Settings → Pages** を開く
3. **Build and deployment → Source** を「Deploy from a branch」、Branch を `main` / `/(root)` にして Save
4. 数分後に `https://<organization>.github.io/thermo-sim/` で公開される

> Web 画面だけでアップロードする場合：新しいリポジトリを作成 → 「uploading an existing file」→ このフォルダの中身（`index.html`, `assets/`, `sims/` など）をまとめてドラッグ＆ドロップ → Commit。
> `.nojekyll` と `.github/` は隠しファイルなので、Finder 等で表示されない場合はなくても公開には支障ありません。

## 手元で動かす

ES Modules を使っているので、`index.html` をダブルクリックではなく簡易サーバ経由で開いてください。

```bash
python3 -m http.server 8000
# → http://localhost:8000/ をブラウザで開く
```

## 物理モデル

- 2次元の剛体円板気体。粒子どうしは弾性衝突。単位は *m* = 1、*k*<sub>B</sub> = 1 の無次元単位
- 2次元・単原子なので自由度 2：`U = NkT`、`PV = NkT`（*V* は面積、*P* は単位長さあたりの力）、`γ = 2`
- **断熱壁**：鏡面反射。**熱源と接した透熱壁**：熱源の温度の（流束重み付き）マクスウェル分布で再放出
- **透熱の仕切り壁**（02, 05）：小さな熱容量 *C*<sub>w</sub> をもつ壁として模型化。両側の粒子が壁とエネルギーをやりとりする（気体＋壁の全エネルギーは厳密に保存）
- **ピストン**：質量無限大の動く壁との弾性衝突 `v' = 2u − v`（人が決めた速さで動かす）
- **おもりを載せたピストン**（06）：質量 *M* のピストンに外から一定の圧力がかかる。粒子との衝突は運動量とエネルギーを保存する弾性衝突
- **撹拌翼**：回転する板との弾性衝突
- **仕事 *W*** はピストン・撹拌翼との衝突での運動エネルギー変化の合計、**熱 *Q*** は熱源と接した壁との衝突での運動エネルギー変化の合計。衝突1回ごとに帳簿に記録するので Δ*U* = *Q* + *W* は丸め誤差の範囲で厳密に成り立つ
- 圧力は「壁が受けた力積 ÷（時間 × 壁の長さ）」の指数重み付き時間平均
- 速い粒子がいるときは時間刻みを自動で細かくする

剛体円板には大きさがあるため、強く圧縮すると圧力が理想気体より数％大きくなります（各ページの解説に記載）。

## テスト

物理的なふるまい（エネルギー保存、状態方程式、マクスウェル分布、断熱線 `TV = 一定`、等温圧縮の仕事 `NkT ln(V₀/V₁)`、透熱壁による温度の一致、自由膨張で *T* 不変 など）を Node.js で検証します。

```bash
npm test     # = node tests/physics-test.mjs
```

GitHub に push すると `.github/workflows/test.yml` で自動実行されます（物理テストとブラウザテストの両方）。

ブラウザでの操作テスト（全ページの全ボタン・スライダーを操作し、JS エラー・NaN 表示・スマホ幅での横スクロールを検出。スクリーンショットを `tests/screenshots/` に保存）：

```bash
npm install && npx playwright install chromium   # 初回のみ（テスト専用。公開ページは npm パッケージを使いません）
npm run test:browser
```

改良するときの約束（物理モデル・符号の約束・確認手順・ブランチ運用）は `CONTRIBUTING.md` にまとめてあります。人が作業するときも、Claude Code などの AI ツールで作業するときも共通です（`CLAUDE.md`・`AGENTS.md` はそこを参照しています）。

## ファイル構成

```
index.html                 目次
sims/01〜05-*.html         各シミュレーション
assets/js/engine.js        分子動力学エンジン（DOM 非依存・Node でも動く）
assets/js/render.js        容器・壁・粒子の描画（スライドの図の約束に準拠）
assets/js/plot.js          時系列・P–V 図・ヒストグラム（外部ライブラリなし）
assets/js/ui.js            スライダー等の UI ヘルパー
assets/css/style.css       共通スタイル
assets/js/experiments.js   熱容量の測定手順（06）
assets/js/entropy.js       場合の数・エントロピーの計算（07）
assets/js/cycles.js        熱機関・ヒートポンプのサイクル（08）
tests/physics-test.mjs     物理テスト
tests/smoke-browser.mjs    ブラウザ操作テスト（Playwright）
```

### 新しいシミュレーションを追加するには

`engine.js` の `Gas` クラスで容器・壁・操作を組み立てられます。

```js
import { Gas, ADIABATIC, DIATHERMAL } from '../assets/js/engine.js';
const gas = new Gas({ H: 60, X: 100, Xmin: 30, Xmax: 110 });
gas.addParticles(200, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });   // N, T, 領域
gas.walls.left = DIATHERMAL; gas.bath.left = true; gas.Tbath = 2;  // 左壁を熱源に接触
gas.piston.target = 50; gas.piston.speed = 0.05;                   // ピストンを動かす
gas.setVPartition(50, ADIABATIC);                                 // 仕切り壁
gas.step(10); gas.measure();
console.log(gas.stats());   // { N, V, U, T, Pwall, Pkin, W, Q, dU, ... }
```

## ライセンス

MIT License（教育目的での利用・改変・再配布を歓迎します）
