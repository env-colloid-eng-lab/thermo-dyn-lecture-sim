// 20-binding.js ― sims/20-binding.html と en/sims/20-binding.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 100, R = 0.3, A_SITE = 1;   // 受容体のとらえる半径 a
const TAU = 300;                               // 時間平均の時定数
const LIG = '#eb6834', REC = '#4a3aa7';
let gas, view, simRate = 0.3, frame = 0, NL = 60, M = 20, eps = 3, T = 1;
let nbAvg = 0, cAvg = 0, wsum = 0, rec = [];

const plotF = new TimePlot($('plotF'), { height: 180, ylabel: tr('結合した割合 f', 'fraction bound f'), ymin: 0, ymax: 1, window: 3000,
  series: [{ key: 'f', label: tr('測定（その瞬間）', 'measured (instantaneous)'), color: REC }, { key: 'fth', label: tr('理論 c/(K_d + c)', 'theory c/(K_d + c)'), color: '#1f1f1f', dash: [6, 4] }] });
const plotB = new XYPlot($('plotB'), { height: 260, xmin: 0, xmax: 0.06, ymin: 0, ymax: 1.05, xlabel: tr('自由なリガンドの濃度 c（面積あたり）', 'free ligand concentration c (per area)'), ylabel: tr('結合した割合 f', 'fraction bound f'), xd: 4, yd: 3 });

const Kd = () => Math.exp(-eps / T) / (Math.PI * A_SITE * A_SITE);

/** 受容体を容器の中に格子状に並べる（壁から離す） */
function sitePositions(m) {
  const cols = Math.ceil(Math.sqrt((m * X0) / H)), rows = Math.ceil(m / cols), pos = [];
  for (let k = 0; k < m; k++) {
    const i = k % cols, j = Math.floor(k / cols);
    pos.push([((i + 0.5) * X0) / cols, ((j + 0.5) * H) / rows]);
  }
  return pos;
}

function build() {
  gas = new Gas({ H, X: X0, Xmin: 40, Xmax: 110, r: R, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(NL, T, { x0: 0, x1: X0, y0: 0, y1: H }, 0);
  gas.piston.target = X0;
  gas.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  gas.bath = { left: true, top: true, bottom: true }; gas.Tbath = T;
  gas.setSites(sitePositions(M), { a: A_SITE, eps, species: 0 });
  gas.resetLedger();
  if (view) view.g = gas;
  else view = new SimView($('sim'), gas, { envPad: 4, Tref: 1, drawScale: 2.5, speciesColors: [LIG], showHeat: false, siteColor: REC });
  nbAvg = 0; cAvg = 0; wsum = 0;
  plotF.reset();
}

bindRange('NL', (v) => { NL = v; if (gas) build(); }, (v) => v.toFixed(0), false);
bindRange('M', (v) => { M = v; if (gas) build(); }, (v) => v.toFixed(0), false);
bindRange('eps', (v) => { eps = v; rec = []; if (gas) gas.setSites(null, { eps }); }, (v) => v.toFixed(1), false);
bindRange('T', (v) => { T = v; rec = []; if (gas) gas.Tbath = T; }, (v) => v.toFixed(2), false);
bindSpeed('speed', (v) => { simRate = v; });
$('btn-rec').addEventListener('click', () => { if (wsum > 0) rec.push([cAvg / wsum, nbAvg / wsum / M]); });
$('btn-clear').addEventListener('click', () => { rec = []; });
$('btn-reset').addEventListener('click', build);
$('btn-ledger').addEventListener('click', () => { gas.resetLedger(); });
build();

/** 全量の保存から求めた結合数：n/(M − n) = (N_L − n)/(A K_d) の 0 ≤ n ≤ min(M, N_L) の根 */
function nFromTotals() {
  const A = X0 * H, k = A * Kd();
  // n² − (M + N_L + k) n + M N_L = 0
  const b = M + NL + k, disc = b * b - 4 * M * NL;
  return (b - Math.sqrt(Math.max(0, disc))) / 2;
}

function update(paused) {
  const s = gas.stats(), A = X0 * H;
  const nb = gas.sites.nb, c = (gas.N) / A, f = nb / M;
  const fAvg = wsum ? nbAvg / wsum / M : NaN, c_ = wsum ? cAvg / wsum : NaN, K = Kd();
  const fth = c_ / (K + c_);
  $('r-f').textContent = fmt(fAvg, 3); $('r-c').textContent = fmt(c_, 4);
  $('r-Kd').textContent = fmt(K, 4); $('r-fth').textContent = fmt(fth, 3);
  $('r-ftot').textContent = fmt(nFromTotals() / M, 3);
  updateLedger('l-', s);
  const el = $('r-dir');
  if (!(wsum > 0.5 * TAU)) el.innerHTML = tr('<b>測定中</b>：つく数と離れる数がつり合うまで少し待つ。', '<b>Measuring</b>: wait a little until binding and unbinding balance.');
  else if (Math.abs(fAvg - fth) < 0.08) el.innerHTML = tr(`<b>平衡</b>：リガンドはついたり離れたりし続けているが、つく速さと離れる速さがつり合い、結合した割合 <i>f</i> ≈ ${fmt(fAvg, 2)} は <i>c</i>/(<i>K</i><sub>d</sub> + <i>c</i>) = ${fmt(fth, 2)} のまわりでゆらぐ。${fAvg > 0.85 ? 'ほとんどの受容体がふさがっている（飽和に近い）。' : ''}`, `<b>Equilibrium</b>: ligands keep binding and unbinding, but the rates balance and the fraction bound <i>f</i> ≈ ${fmt(fAvg, 2)} fluctuates around <i>c</i>/(<i>K</i><sub>d</sub> + <i>c</i>) = ${fmt(fth, 2)}.${fAvg > 0.85 ? ' Almost all receptors are occupied (close to saturation).' : ''}`);
  else el.innerHTML = fAvg < fth
    ? tr('<b>結合が増えていく</b>：いまの濃度で平衡になる割合より、結合が少ない。つく方が離れるより多い。', '<b>Binding increases</b>: fewer are bound than in equilibrium at the present concentration, so more bind than unbind.')
    : tr('<b>結合が減っていく</b>：いまの濃度で平衡になる割合より、結合が多い（強さや温度を変えた直後など）。離れる方がつくより多い。', '<b>Binding decreases</b>: more are bound than in equilibrium at the present concentration (e.g. right after changing the strength or temperature), so more unbind than bind.');

  if (!paused) plotF.push(gas.time, { f, fth: c / (K + c) });
  plotF.draw();
  const xmax = Math.max(0.02, Math.min(0.3, 1.25 * Math.max(NL / A, 3 * K, ...rec.map((p) => p[0]))));
  plotB.opt.xmax = xmax; plotB.opt.xd = xmax < 0.05 ? 4 : 3;
  plotB.refs = [{ label: tr('f = c/(K_d + c)', 'f = c/(K_d + c)'), color: '#1f1f1f', dash: [6, 4], fn: (x) => x / (K + x) }];
  plotB.paths = [{ label: tr('記録', 'records'), color: REC, pts: rec, dots: true },
    { label: 'c = K_d', color: '#77756f', pts: [[K, 0], [K, 1.05]], dash: [2, 4], width: 1.2 }];
  plotB.marker = Number.isFinite(fAvg) ? [c_, fAvg] : null;
  plotB.draw();
}

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    const a = Math.exp(-simRate / TAU);
    nbAvg = nbAvg * a + gas.sites.nb * simRate; cAvg = cAvg * a + (gas.N / (X0 * H)) * simRate; wsum = wsum * a + simRate;
    frame++;
  }
  if (paused || frame % 3 === 0) update(paused);   // 一時停止中も、スライダーやボタンの変更をすぐ表示する
  view.draw();
});
bindPlayPause('btn-play', loop);
