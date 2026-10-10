// 16-phase.js ― sims/16-phase.html と en/sims/16-phase.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { satVapor, dewPoint, deltaMuVapor, LV, RV } from '../climate.js';
import { XYPlot, TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, segmented, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
// 確率モデル：容器の幅 1、高さ 1、水面の高さ YL。分子は一定の速さ v(T) でまっすぐ飛び、壁で跳ね返る
const YL = 0.18, TREF = 293, NREF = 120, V0 = 0.35, MAXN = 600;
let T = 293, lid = 'closed', mol = [], splash = [], time = 0, evap = 0, cond = 0, rates = { e: 0, c: 0 }, eSm = 0, last = { t: 0, e: 0, c: 0 }, tPushed = -1;

const speed = () => V0 * Math.sqrt(T / TREF);
// 1分子が単位時間に水面に当たる割合（向きがでたらめな2次元の一定の速さ：⟨下向きの速さ⟩ = v/π）
const hitRate = () => speed() / Math.PI / (1 - YL);
// 飛び出す割合（単位時間あたりの数）：密閉で飽和したとき e = e_s(T) になるように決める
const evapRate = () => hitRate() * NREF * (satVapor(T) / satVapor(TREF)) * (TREF / T);
const vaporP = () => mol.length * (satVapor(TREF) / NREF) * (T / TREF);   // 分子の数から水蒸気圧（hPa）

const plotN = new TimePlot($('plotN'), { height: 170, ylabel: 'hPa', yZero: true, window: 120, xlabel: tr('時間', 'time'),
  series: [{ key: 'e', label: tr('水蒸気圧 e', 'vapor pressure e'), color: 'rgba(42,120,214,0.45)' }, { key: 'sm', label: tr('ならした値', 'smoothed'), color: SERIES[0] }, { key: 'es', label: tr('飽和水蒸気圧 e_s(T)', 'saturation e_s(T)'), color: '#77756f', dash: [6, 4] }] });
const plotE = new XYPlot($('plotE'), { height: 240, xmin: 270, xmax: 312, ymin: 0, ymax: 80, xlabel: tr('T （K）', 'T (K)'), ylabel: tr('e （hPa）', 'e (hPa)'), xd: 1, yd: 2 });
const plotMu = new XYPlot($('plotMu'), { height: 220, xmin: 270, xmax: 312, ymin: -2, ymax: 2, xlabel: tr('T （K）', 'T (K)'), ylabel: tr('μ （kJ/mol、基準は露点）', 'μ (kJ/mol, zero at dew point)'), xd: 1, yd: 3 });

function addMol(n, y0) {
  for (let k = 0; k < n && mol.length < MAXN; k++) {
    const a = Math.random() * Math.PI * 2;
    mol.push({ x: Math.random(), y: y0 ?? YL + (1 - YL) * Math.random(), a });
  }
}
function reset() { mol = []; splash = []; time = 0; tPushed = -1; evap = 0; cond = 0; eSm = 0; rates = { e: 0, c: 0 }; last = { t: 0, e: 0, c: 0 }; plotN.reset(); }

function step(dt) {
  const v = speed();
  // 飛び出す（ポアソン過程）
  let n = 0; const lam = evapRate() * dt;
  for (let L = Math.exp(-lam), p = Math.random(); p > L; p *= Math.random()) n++;
  for (let k = 0; k < n && mol.length < MAXN; k++) {
    const a = Math.acos(1 - 2 * Math.random());   // 上向き。水面の法線に近いほど多く出す（∝ sin a）：気体中の向きがでたらめになる
    const m = { x: Math.random(), y: YL + 1e-6, a: -a };
    mol.push(m); splash.push({ x: m.x, t: time, up: true }); evap++;
  }
  // 飛ぶ・跳ね返る・飛び込む
  const keep = [];
  for (const m of mol) {
    m.x += v * Math.cos(m.a) * dt; m.y -= v * Math.sin(m.a) * dt;
    if (m.x < 0) { m.x = -m.x; m.a = Math.PI - m.a; } else if (m.x > 1) { m.x = 2 - m.x; m.a = Math.PI - m.a; }
    if (m.y > 1) {
      if (lid === 'open') continue;                       // 風で運び去られる
      m.y = 2 - m.y; m.a = -m.a;
    }
    if (m.y < YL) { splash.push({ x: m.x, t: time, up: false }); cond++; continue; }   // 水面に飛び込む
    keep.push(m);
  }
  mol = keep;
  time += dt;
  if (splash.length > 200) splash.splice(0, splash.length - 200);
}

// --- 容器の絵 ---
const cv = $('sim');
let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = cv.parentElement.clientWidth || 600, h = Math.round(Math.min(320, w * 0.5));
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { resize(); draw(); }).observe(cv.parentElement);
resize();
function draw() {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 8 * dpr;
  const X = (x) => pad + x * (W - 2 * pad), Y = (y) => H - pad - y * (H - 2 * pad);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f4f6fb'; ctx.fillRect(X(0), Y(1), X(1) - X(0), Y(YL) - Y(1));
  ctx.fillStyle = '#5b8fd6'; ctx.fillRect(X(0), Y(YL), X(1) - X(0), Y(0) - Y(YL));            // 液体の水
  ctx.strokeStyle = '#2F5597'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(X(0), Y(1), X(1) - X(0), Y(0) - Y(1));
  if (lid === 'open') {   // ふたなし：上に風の矢印
    ctx.fillStyle = '#ffffff'; ctx.fillRect(X(0) + dpr, Y(1) - 2 * dpr, X(1) - X(0) - 2 * dpr, 4 * dpr);
    ctx.strokeStyle = 'rgba(95,94,90,0.7)'; ctx.lineWidth = 1.5 * dpr;
    for (const f of [0.2, 0.5, 0.8]) { const y = Y(1) + 2 * dpr; ctx.beginPath(); ctx.moveTo(X(f - 0.08), y); ctx.lineTo(X(f + 0.08), y); ctx.lineTo(X(f + 0.06), y - 3 * dpr); ctx.stroke(); }
  }
  for (const s of splash) {
    const age = time - s.t; if (age > 1.2) continue;
    ctx.beginPath(); ctx.arc(X(s.x), Y(YL), (3 + 8 * age) * dpr, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = s.up ? `rgba(214,69,61,${1 - age / 1.2})` : `rgba(42,120,214,${1 - age / 1.2})`; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
  ctx.fillStyle = '#2a78d6';
  for (const m of mol) { ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 3 * dpr, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#ffffff'; ctx.font = `${12 * dpr}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(tr(`液体の水  T = ${T} K`, `Liquid water  T = ${T} K`), X(0) + 6 * dpr, Y(0) - 4 * dpr);
  ctx.fillStyle = '#1f1f1f'; ctx.textBaseline = 'top';
  ctx.fillText(tr(`飛び出す ${fmt(rates.e, 1)} 個/時間、飛び込む ${fmt(rates.c, 1)} 個/時間`, `leaving ${fmt(rates.e, 1)} /time, entering ${fmt(rates.c, 1)} /time`), X(0) + 6 * dpr, Y(1) + 6 * dpr);
}

function update() {
  // 分子の数はゆらぐので、表示と判定には少しならした値を使う（グラフは生の値）
  const eRaw = vaporP(); eSm += 0.06 * (eRaw - eSm);
  const e = eSm, es = satVapor(T), H = e / es;
  $('r-T').textContent = `${T} K`;
  $('r-e').textContent = `${fmt(e, 1)} hPa`; $('r-es').textContent = `${fmt(es, 1)} hPa`;
  $('r-H').textContent = `${fmt(100 * H, 0)} %`;
  const dmu = e > 0 ? deltaMuVapor(T, e, es) / 1000 : -Infinity;
  $('r-mu').textContent = Number.isFinite(dmu) ? `${fmtSigned(dmu, 2)} kJ/mol` : '−∞';
  const el = $('r-dir');
  if (Math.abs(H - 1) < 0.06) el.innerHTML = tr('<b>飽和（相平衡）</b>：μ<sub>蒸気</sub> ≈ μ<sub>液体</sub>。飛び出す数と飛び込む数がつり合い、正味の移動がない（ゆらぎの範囲）。', '<b>Saturated (phase equilibrium)</b>: μ<sub>vapor</sub> ≈ μ<sub>liquid</sub>. Leaving and entering balance, with no net transfer (within fluctuations).');
  else if (H < 1) el.innerHTML = tr('<b>未飽和</b>：μ<sub>蒸気</sub> &lt; μ<sub>液体</sub>（Δμ &lt; 0）。液体から蒸気へ移すと <i>G</i> が下がるので、<b>正味に蒸発</b>する。', '<b>Unsaturated</b>: μ<sub>vapor</sub> &lt; μ<sub>liquid</sub> (Δμ &lt; 0). Moving water from liquid to vapor lowers <i>G</i>, so there is <b>net evaporation</b>.');
  else el.innerHTML = tr('<b>過飽和</b>：μ<sub>蒸気</sub> &gt; μ<sub>液体</sub>（Δμ &gt; 0）。蒸気から液体へ移すと <i>G</i> が下がるので、<b>正味に凝結</b>する。', '<b>Supersaturated</b>: μ<sub>vapor</sub> &gt; μ<sub>liquid</sub> (Δμ &gt; 0). Moving water from vapor to liquid lowers <i>G</i>, so there is <b>net condensation</b>.');
  if (time !== tPushed) { plotN.push(time, { e: eRaw, es, sm: e }); tPushed = time; }
  // e_s(T) の曲線
  const Td = e > 0 ? dewPoint(e) : NaN;
  $('r-Td').textContent = Number.isFinite(Td) ? `${fmt(Td, 1)} K` : '–';
  $('r-rate').textContent = `${fmt(100 * LV / (RV * T * T), 1)} %/K`;
  plotE.opt.ymax = Math.max(70, e * 1.2);
  plotE.refs = [{ label: tr('飽和水蒸気圧 e_s(T)', 'saturation vapor pressure e_s(T)'), color: SERIES[3], fn: (x) => satVapor(x) }];
  plotE.paths = Number.isFinite(Td) && Td > 270 ? [{ label: tr('露点', 'dew point'), color: '#77756f', pts: [[Td, 0], [Td, e], [T, e]], dash: [4, 4], width: 1.4 }] : [];
  plotE.marker = [T, e];
  plotE.draw();
  // 化学ポテンシャル（いまの e のまま温度を変える）：μ_液体 = −s_l (T − T_d)、μ_蒸気 = μ_液体 + RT ln(e/e_s(T))
  if (Number.isFinite(Td)) {
    const sl = 0.07;   // kJ/(mol K)（液体の水のモルエントロピーの目安。図の傾きを見せるため）
    const muL = (x) => -sl * (x - Td), muV = (x) => muL(x) + deltaMuVapor(x, e, satVapor(x)) / 1000;
    const lo = Math.max(270, Td - 15), hi = Math.min(312, Td + 15);
    Object.assign(plotMu.opt, { xmin: lo, xmax: hi, ymin: Math.min(muL(hi), muV(hi)) - 0.3, ymax: Math.max(muL(lo), muV(lo)) + 0.3 });
    plotMu.refs = [{ label: tr('μ 液体', 'μ liquid'), color: '#5b8fd6', fn: muL }, { label: tr(`μ 蒸気（e = ${fmt(e, 1)} hPa）`, `μ vapor (e = ${fmt(e, 1)} hPa)`), color: '#d6453d', fn: muV }];
    plotMu.paths = [{ label: tr('露点（交点）', 'dew point (crossing)'), color: '#77756f', pts: [[Td, plotMu.opt.ymin], [Td, plotMu.opt.ymax]], dash: [4, 4], width: 1.2 }];
    plotMu.marker = T >= lo && T <= hi ? [T, Math.min(muL(T), muV(T))] : null;
  } else { plotMu.refs = []; plotMu.paths = []; plotMu.marker = null; }
  plotMu.draw();
}

bindRange('T', (v) => { T = v; }, (v) => v.toFixed(0), false);
segmented('lid', (v) => { lid = v; }, false);
$('btn-add').addEventListener('click', () => addMol(60));
$('btn-rem').addEventListener('click', () => { mol = mol.filter(() => Math.random() < 0.5); });
$('btn-reset').addEventListener('click', reset);
reset();

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) {
    for (let k = 0; k < 4; k++) step(0.02);
    frame++;
    if (time - last.t >= 2) { rates = { e: (evap - last.e) / (time - last.t), c: (cond - last.c) / (time - last.t) }; last = { t: time, e: evap, c: cond }; }
  }
  draw();
  if (frame % 3 === 0 || paused) { update(); plotN.draw(); }
});
bindPlayPause('btn-play', loop);
