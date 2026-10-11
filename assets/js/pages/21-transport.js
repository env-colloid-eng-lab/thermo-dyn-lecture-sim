// 21-transport.js ― sims/21-transport.html と en/sims/21-transport.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Sediment1D, sedimentEq, brownianStep, realScales } from '../transport.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const NP = 300, NB = 10, N_CELL = 120;
const COL_L = SERIES[0], COL_R = SERIES[1];
let P = 5, k = 3, r = 1, init = 'uniform', speed = 0.03, showBD = true;
let left, right, bdL, bdR, hxL, hxR, histL, histR, t = 0;

// 乱数（ページでは毎回ちがう種）
let seed = (Math.random() * 2147483646 + 1) | 0;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

const plotC = new XYPlot($('plotC'), { height: 300, xmin: 0, xmax: 6, ymin: 0, ymax: 1, xlabel: tr('濃度 c/c̄（容器の平均で割った値）', 'concentration c/c̄ (divided by the container mean)'), ylabel: tr('高さ z/H', 'height z/H'), xd: 2, yd: 2 });
const plotF = new TimePlot($('plotF'), { height: 180, ylabel: tr('平衡との自由エネルギーの差（kT/粒子）', 'free energy above equilibrium (kT/particle)'), yZero: true, window: 1, xlabel: tr('時間 τ = tD/H²（左の容器の D で）', 'time τ = tD/H² (with D of the left container)'),
  series: [{ key: 'L', label: tr('左（粘度 η）', 'left (viscosity η)'), color: COL_L }, { key: 'R', label: tr('右（粘度 kη）', 'right (viscosity kη)'), color: COL_R, dash: [6, 4] }] });
const plotJ = new XYPlot($('plotJ'), { height: 240, xmin: -8, xmax: 8, ymin: 0, ymax: 1, xlabel: tr('上向きの粒子の流れ j（左の容器）', 'upward particle flux j (left container)'), ylabel: tr('高さ z/H', 'height z/H'), xd: 1, yd: 2 });

function build() {
  left = new Sediment1D({ n: N_CELL, P, r, init }); right = new Sediment1D({ n: N_CELL, P, r, init });
  const start = () => (init === 'top' ? 0.9 + 0.1 * rnd() : rnd());
  bdL = Float64Array.from({ length: NP }, start); bdR = Float64Array.from({ length: NP }, start);
  hxL = Float64Array.from({ length: NP }, rnd); hxR = Float64Array.from({ length: NP }, rnd);
  histL = histogram(bdL); histR = histogram(bdR);
  t = 0; plotF.reset();
}
function setParams() { for (const s of [left, right]) { s.P = P; s.r = r; } }

function histogram(xs) {
  const h = new Float64Array(NB);
  for (const x of xs) h[Math.min(NB - 1, Math.floor(x * NB))] += NB / xs.length;
  return h;
}
/** 横方向にもゆらがせる（見た目だけ。高さの分布には関係しない） */
function jitter(hx, dt) {
  const s = Math.sqrt(2 * dt) * 0.6;
  for (let i = 0; i < hx.length; i++) { let x = hx[i] + s * gauss(); if (x < 0) x = -x; if (x > 1) x = 2 - x; hx[i] = Math.min(1, Math.max(0, x)); }
}

function advance(dtau) {
  // 左は D、右は D/k（粘度が k 倍）：同じ実時間で、右の無次元時間は 1/k しか進まない
  const n1 = Math.ceil(dtau / 0.002), n2 = Math.ceil(dtau / k / 0.002);
  for (let i = 0; i < n1; i++) left.step(dtau / n1);
  for (let i = 0; i < n2; i++) right.step(dtau / k / n2);
  const Pe = P / r, sub = Math.max(1, Math.ceil(dtau / 2e-4));
  for (let i = 0; i < sub; i++) {
    brownianStep(bdL, Pe, dtau / sub, gauss); brownianStep(bdR, Pe, dtau / k / sub, gauss);
    jitter(hxL, dtau / sub); jitter(hxR, dtau / k / sub);
  }
  // 粒子の高さの分布は、少しだけならして表示する（300 個なので1つの層に 30 個ほど）
  const hl = histogram(bdL), hr = histogram(bdR), a = 0.85;
  for (let b = 0; b < NB; b++) { histL[b] = a * histL[b] + (1 - a) * hl[b]; histR[b] = a * histR[b] + (1 - a) * hr[b]; }
  t += dtau;
}

/** 容器と粒子を描く */
function drawBox(canvas, xs, hx, col) {
  const dpr = window.devicePixelRatio || 1, w = canvas.parentElement.clientWidth || 300, h = Math.round(w * (w < 420 ? 0.65 : 1.1));   // スマホ幅では左右が縦に並ぶので低めに
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
  const ctx = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height, m = 10 * dpr, wt = 6 * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, Hh);
  const x0 = m + wt, x1 = W - m - wt, y0 = m + wt, y1 = Hh - m - wt;
  ctx.fillStyle = '#dbe7f6'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = '#2F5597'; ctx.lineWidth = 1.4 * dpr; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if (showBD) {
    ctx.fillStyle = col;
    const rd = Math.max(2 * dpr, (x1 - x0) / 90);
    for (let i = 0; i < xs.length; i++) { ctx.beginPath(); ctx.arc(x0 + rd + hx[i] * (x1 - x0 - 2 * rd), y1 - rd - xs[i] * (y1 - y0 - 2 * rd), rd, 0, 7); ctx.fill(); }
  }
  // 重力の向き
  ctx.fillStyle = 'rgba(31,31,31,0.75)'; ctx.font = `${12 * dpr}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(P > 0 ? tr('↓ 重力（沈む）', '↓ gravity (sinks)') : P < 0 ? tr('↑ 浮く', '↑ floats') : tr('重力なし', 'no gravity'), x1 - 4 * dpr, y0 + 4 * dpr);
}

segmented('init', (v) => { init = v; if (left) build(); }, false);
bindRange('P', (v) => { P = v; if (left) setParams(); }, (v) => fmtSigned(v, 1), false);
bindRange('k', (v) => { k = v; }, (v) => v.toFixed(1), false);
bindRange('r', (v) => { r = v; if (left) setParams(); }, (v) => v.toFixed(2), false);
bindRange('speed', (v) => { speed = Math.pow(10, v); }, (v) => Math.pow(10, v).toFixed(3));
bindCheck('c-bd', (on) => { showBD = on; });
$('btn-reset').addEventListener('click', build);
build();

function update() {
  const ceqP = sedimentEq(N_CELL, P), ceqR = left.equilibrium();
  const xc = (i) => (i + 0.5) / N_CELL, xb = (b) => (b + 0.5) / NB;
  const toPts = (c) => Array.from(c, (v, i) => [v, xc(i)]);
  const cmax = Math.max(2, ...ceqP, ...ceqR, ...left.c, ...right.c);
  plotC.opt.xmax = Math.min(12, Math.ceil(cmax * 1.15));
  plotC.paths = [
    { label: tr('ボルツマン分布（平衡）', 'Boltzmann distribution (equilibrium)'), color: '#1f1f1f', pts: toPts(ceqP), dash: [6, 4], width: 1.4 },
    { label: tr('左：式 (4.8)', 'left: eq. (4.8)'), color: COL_L, pts: toPts(left.c), width: 2.2 },
    { label: tr('右：式 (4.8)', 'right: eq. (4.8)'), color: COL_R, pts: toPts(right.c), width: 2.2, dash: [3, 3] },
  ];
  if (showBD) plotC.paths.push({ label: tr('左：粒子', 'left: particles'), color: COL_L, pts: Array.from(histL, (v, b) => [v, xb(b)]), dots: true },
    { label: tr('右：粒子', 'right: particles'), color: COL_R, pts: Array.from(histR, (v, b) => [v, xb(b)]), dots: true });
  if (Math.abs(r - 1) > 1e-6) plotC.paths.push({ label: tr('この r での行き先 e^{−Px/r}', 'destination for this r, e^{−Px/r}'), color: '#d6453d', pts: toPts(ceqR), dash: [2, 3], width: 1.4 });
  plotC.draw();

  const fl = left.fluxes(), jmax = Math.max(1, ...fl.map((f) => Math.max(Math.abs(f.diff), Math.abs(f.drift))));
  Object.assign(plotJ.opt, { xmin: -Math.ceil(jmax * 1.1), xmax: Math.ceil(jmax * 1.1) });
  plotJ.paths = [
    { label: tr('拡散の流れ −∂c/∂x（上向き）', 'diffusion flux −∂c/∂x (upward)'), color: SERIES[2], pts: fl.map((f) => [f.diff, f.x]), width: 2 },
    { label: tr('重力による流れ −Pe·c（下向き）', 'flux due to gravity −Pe·c (downward)'), color: SERIES[3], pts: fl.map((f) => [f.drift, f.x]), width: 2 },
    { label: tr('合計 j', 'total j'), color: '#1f1f1f', pts: fl.map((f) => [f.total, f.x]), width: 1.4, dash: [4, 3] },
  ];
  plotJ.draw();

  const FL = left.excessF(), FR = right.excessF();
  plotF.opt.window = Math.max(0.3, Math.min(4, 0.5 * k));   // 右の容器が平衡に近づくまでが入る幅
  plotF.draw();
  $('r-t').textContent = fmt(t, 3);
  const sc = realScales(P);
  $('r-real').textContent = sc ? tr(`${fmt((t * sc.tD) / 3600, 2)} 時間（H = ${fmt(sc.H * 1e6, 0)} µm）`, `${fmt((t * sc.tD) / 3600, 2)} h (H = ${fmt(sc.H * 1e6, 0)} µm)`) : '–';
  $('r-tg').textContent = Math.abs(P) > 1e-9 ? fmt(r / Math.abs(P), 3) : '–';
  $('r-FL').textContent = fmt(FL, 4); $('r-FR').textContent = fmt(FR, 4);

  const el = $('r-dir');
  if (Math.abs(r - 1) > 0.02) {
    el.innerHTML = tr(`<b>アインシュタインの関係を破っている</b>（<i>D</i>/(<i>bkT</i>) = ${fmt(r, 2)}）：流れが止まる分布は e<sup>−<i>Px</i>/${fmt(r, 2)}</sup> になり、ボルツマン分布（平衡）と一致しない。自由エネルギーの差も 0 にならない。拡散と移動度は勝手には決められず、<i>D</i> = <i>bkT</i> でなければ熱平衡と矛盾する。`, `<b>The Einstein relation is broken</b> (<i>D</i>/(<i>bkT</i>) = ${fmt(r, 2)}): the distribution where the flow stops becomes e<sup>−<i>Px</i>/${fmt(r, 2)}</sup>, which does not match the Boltzmann distribution (equilibrium). The free energy difference does not reach 0 either. Diffusion and mobility cannot be chosen independently: unless <i>D</i> = <i>bkT</i>, they contradict thermal equilibrium.`);
  } else if (FL > 0.005 || FR > 0.005) {
    el.innerHTML = tr(`<b>平衡へ向かっている</b>：どちらの容器でも自由エネルギーが減っていく（左 ${fmt(FL, 3)}、右 ${fmt(FR, 3)}）。行き先は同じボルツマン分布だが、粘度が ${fmt(k, 1)} 倍の右は ${fmt(k, 1)} 倍ゆっくり近づく。`, `<b>Heading to equilibrium</b>: the free energy decreases in both containers (left ${fmt(FL, 3)}, right ${fmt(FR, 3)}). Both head to the same Boltzmann distribution, but the right one, with ${fmt(k, 1)} times the viscosity, approaches ${fmt(k, 1)} times more slowly.`);
  } else {
    el.innerHTML = tr('<b>平衡（沈降平衡）</b>：左右とも同じボルツマン分布になった。粒子は動き続けているが、拡散で上へ行く流れと重力で下へ行く流れが各高さでつり合い、正味の流れは 0。粘度は「どれだけ速く着くか」を変えるだけで、「どこに着くか」は変えない。', '<b>Equilibrium (sedimentation equilibrium)</b>: both containers reached the same Boltzmann distribution. Particles keep moving, but at each height the upward flow by diffusion and the downward flow by gravity balance, so the net flow is 0. Viscosity changes only "how fast it arrives", not "where it arrives".');
  }
}

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) {
    advance(speed / 60);
    plotF.push(t, { L: left.excessF(), R: right.excessF() });
    frame++;
  }
  if (paused || frame % 2 === 0) update();
  drawBox($('boxL'), bdL, hxL, COL_L); drawBox($('boxR'), bdR, hxR, COL_R);
});
bindPlayPause('btn-play', loop);
