// 13-chain.js ― sims/13-chain.html と en/sims/13-chain.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { sampleChain, chainVar, chainP, chainF, chainForce } from '../chain.js';
import { XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const b = 1, K = 61, PER_FRAME = 120, MAXPTS = 1500;
let Ns = 40, T = 1, xs = 1.5, showChains = true;
let hist, M, sx2, ends, shown, hits, cBand = 0, c0 = 0;   // 分布・数・⟨x²⟩・末端の点・描く鎖・帯に入った鎖・帯（x と 0）に入った数

const plotP = new XYPlot($('plotP'), { height: 200, xmin: -1, xmax: 1, ymin: 0, ymax: null, xlabel: tr('x （末端の x 座標）', 'x (x coordinate of the end)'), ylabel: 'P(x)', xd: 2, yd: 4 });
const plotF = new XYPlot($('plotF'), { height: 220, xmin: -1, xmax: 1, ymin: 0, ymax: 1, xlabel: tr('x （末端の x 座標）', 'x (x coordinate of the end)'), ylabel: 'F(x) − F(0)', xd: 2, yd: 3 });

const sigma = () => Math.sqrt(chainVar(Ns, b));
const xT = () => xs * sigma();               // 伸ばした長さ
const range = () => 4 * sigma();             // 分布を数える範囲 ±4σ
const binW = () => (2 * range()) / K;
const binOf = (x) => Math.floor((x + range()) / binW());

function reset() {
  hist = new Array(K).fill(0); M = 0; sx2 = 0; ends = []; shown = []; hits = []; cBand = 0; c0 = 0;
  $('x-hint').textContent = tr(`σ = √(Nₛb²/2) = ${fmt(sigma(), 2)}、鎖の全長 Nₛb = ${Ns}。x = ${fmt(xT(), 2)}`, `σ = √(Nₛb²/2) = ${fmt(sigma(), 2)}, full chain length Nₛb = ${Ns}. x = ${fmt(xT(), 2)}`);
}

// --- 鎖の絵（自前の canvas）---
const cv = $('sim');
let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = cv.parentElement.clientWidth || 600, h = Math.round(Math.min(420, w * 0.62));
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { resize(); draw(); }).observe(cv.parentElement);
resize();

function draw() {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const R = Math.max(range(), xT() + sigma()) * 1.05;
  const s = Math.min(W / (2 * R), H / (1.6 * R));
  const X = (x) => W / 2 + x * s, Y = (y) => H / 2 - y * s;
  // 帯（末端の x がこの範囲に入る配置を数える）
  const w = binW();
  ctx.fillStyle = 'rgba(235,104,52,0.12)';
  ctx.fillRect(X(xT() - w / 2), 0, w * s, H);
  ctx.strokeStyle = 'rgba(235,104,52,0.6)'; ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(X(xT() - w / 2), 0, w * s, H);
  // 末端の点
  ctx.fillStyle = 'rgba(95,94,90,0.35)';
  for (const [x, y] of ends) { ctx.beginPath(); ctx.arc(X(x), Y(y), 1.6 * dpr, 0, 7); ctx.fill(); }
  // 鎖
  const line = (pts, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width * dpr; ctx.beginPath();
    pts.forEach(([x, y], k) => { if (k === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y)); });
    ctx.stroke();
  };
  if (showChains) {
    for (const c of shown) line(c, 'rgba(68,114,196,0.35)', 1.2);
    for (const c of hits) { line(c, 'rgba(235,104,52,0.9)', 2); const e = c[c.length - 1]; ctx.beginPath(); ctx.arc(X(e[0]), Y(e[1]), 3.5 * dpr, 0, 7); ctx.fillStyle = '#eb6834'; ctx.fill(); }
  }
  // 原点（固定した端）
  ctx.strokeStyle = '#1f1f1f'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(X(0) - 7 * dpr, Y(0)); ctx.lineTo(X(0) + 7 * dpr, Y(0)); ctx.moveTo(X(0), Y(0) - 7 * dpr); ctx.lineTo(X(0), Y(0) + 7 * dpr); ctx.stroke();
}

function sample() {
  const w = binW(), x0 = xT();
  for (let k = 0; k < PER_FRAME; k++) {
    const c = sampleChain(Ns, b, Math.random), e = c[c.length - 1];
    const j = binOf(e[0]);
    if (j >= 0 && j < K) hist[j]++;
    M++; sx2 += e[0] * e[0];
    ends.push(e); if (ends.length > MAXPTS) ends.shift();
    if (k < 2) { shown.push(c); if (shown.length > 24) shown.shift(); }
    if (Math.abs(e[0]) < w / 2) c0++;
    if (Math.abs(e[0] - x0) < w / 2) { cBand++; hits.push(c); if (hits.length > 6) hits.shift(); }
  }
}

function update() {
  const s2 = chainVar(Ns, b), w = binW(), x0 = xT();
  const dens = hist.map((c) => c / Math.max(1, M) / w);
  const centers = hist.map((_, j) => -range() + (j + 0.5) * w);
  const j0 = binOf(0);
  const ratio = c0 > 0 ? cBand / c0 : NaN;   // 帯（x のまわり）と原点のまわりに末端が入った数の比
  const ratioTh = Math.exp(-(x0 * x0) / (2 * s2));
  const s2m = M ? sx2 / M : NaN;
  $('r-M').textContent = M;
  $('r-x2').textContent = fmt(s2m, 2); $('r-x2th').textContent = fmt(s2, 2);
  $('r-ratio').textContent = fmt(ratio, 3); $('r-ratio-th').textContent = fmt(ratioTh, 3);
  const dS = Math.log(ratioTh), dF = chainF(x0, Ns, b, T), f = chainForce(x0, Ns, b, T);
  $('r-S').textContent = fmtSigned(Number.isFinite(ratio) && ratio > 0 ? Math.log(ratio) : dS, 2);
  $('r-F').textContent = fmtSigned(dF, 2);
  $('r-f').textContent = fmt(f, 3);
  $('r-fm').textContent = fmt(Number.isFinite(s2m) && s2m > 0 ? (T * x0) / s2m : NaN, 3);
  $('l-W').textContent = fmtSigned(dF, 2); $('l-Q').textContent = fmtSigned(-dF, 2);
  // 分布
  Object.assign(plotP.opt, { xmin: -range(), xmax: range(), ymax: chainP(0, Ns, b) * 1.35 });
  const stair = [];
  dens.forEach((d, j) => { stair.push([centers[j] - w / 2, d], [centers[j] + w / 2, d]); });
  plotP.refs = [{ label: tr('ガウス分布（理論）', 'Gaussian (theory)'), color: SERIES[1], fn: (x) => chainP(x, Ns, b) }];
  plotP.paths = [{ label: tr('測定（末端の x の分布）', 'Measured (distribution of end x)'), color: SERIES[0], pts: stair, width: 1.8 }];
  plotP.marker = [x0, chainP(x0, Ns, b)];
  plotP.draw();
  // 自由エネルギー（測定は −T ln(P(x)/P(0))、数が少ない端は省く）
  const Fm = [];
  hist.forEach((c, j) => { if (c >= 8 && hist[j0] > 0) Fm.push([centers[j], -T * Math.log(c / hist[j0])]); });
  const Fmax = chainF(range(), Ns, b, T);
  Object.assign(plotF.opt, { xmin: -range(), xmax: range(), ymin: -0.08 * Fmax, ymax: Fmax * 1.05 });
  const d = sigma();
  plotF.refs = [{ label: tr('F = kTx²/2σ²（理論）', 'F = kTx²/2σ² (theory)'), color: SERIES[3], fn: (x) => chainF(x, Ns, b, T) }];
  plotF.paths = [
    { label: tr('測定 −kT ln(P(x)/P(0))', 'Measured −kT ln(P(x)/P(0))'), color: SERIES[0], pts: Fm, width: 1.5 },
    { label: tr('接線の傾き = 力 f', 'Slope of tangent = force f'), color: SERIES[1], pts: [[x0 - d, dF - f * d], [x0 + d, dF + f * d]], width: 2, dash: [6, 4] },
  ];
  plotF.marker = [x0, dF];
  plotF.draw();
}

bindRange('Ns', (v) => { Ns = v; reset(); }, (v) => v.toFixed(0), false);
bindRange('T', (v) => { T = v; }, (v) => v.toFixed(1), false);
bindRange('xs', (v) => { xs = v; hits = []; cBand = 0; c0 = 0; $('x-hint').textContent = tr(`σ = √(Nₛb²/2) = ${fmt(sigma(), 2)}、鎖の全長 Nₛb = ${Ns}。x = ${fmt(xT(), 2)}`, `σ = √(Nₛb²/2) = ${fmt(sigma(), 2)}, full chain length Nₛb = ${Ns}. x = ${fmt(xT(), 2)}`); }, (v) => v.toFixed(2), false);
bindCheck('c-chains', (on) => { showChains = on; });
$('btn-reset').addEventListener('click', reset);
reset();

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) { sample(); frame++; }
  if (frame % 2 === 0 || paused) update();
  draw();
});
bindPlayPause('btn-play', loop);
