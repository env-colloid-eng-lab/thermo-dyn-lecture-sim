// 02-equilibrium.js ― sims/02-equilibrium.html と en/sims/02-equilibrium.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL, mb2d } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, HistPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
let gas, view, simRate = 0.1, frame = 0, partMode = 'adiabatic';
let U0 = [0, 0];
let sValid = true, sN = [0, 0], sTrail = [], sm = null, sUt = 0, Tw0 = 1;   // エントロピーの図：有効か・粒子数・経路・ならした温度
const plotT = new TimePlot($('plotT'), { height: 170, ylabel: tr('温度 T', 'Temperature T'), yZero: true, window: 600,
  series: [{ key: 'T1', label: tr('流体1の温度 T₁', 'Temperature of fluid 1, T₁'), color: SERIES[0] }, { key: 'T2', label: tr('流体2の温度 T₂', 'Temperature of fluid 2, T₂'), color: SERIES[1] }] });
const plotU = new TimePlot($('plotU'), { height: 170, ylabel: tr('内部エネルギー U', 'Internal energy U'), yZero: true, window: 600,
  series: [{ key: 'U1', label: 'U₁', color: SERIES[0] }, { key: 'U2', label: 'U₂', color: SERIES[1] }, { key: 'Us', label: 'U₁+U₂', color: SERIES[3], dash: [6, 4] }] });
const plotSU = new XYPlot($('plotSU'), { height: 250, xmin: 0, xmax: 1, ymin: -1, ymax: 1, xlabel: tr('U₁ （左の内部エネルギー）', 'U₁ (internal energy of the left)'), ylabel: tr('ΔS （k 単位）', 'ΔS (units of k)'), xd: 1, yd: 1 });
const plotS = new TimePlot($('plotS'), { height: 170, ylabel: tr('ΔS（k 単位）', 'ΔS (units of k)'), yZero: true, window: 600,
  series: [{ key: 'S1', label: tr('ΔS₁（左）', 'ΔS₁ (left)'), color: SERIES[0], dash: [6, 4] }, { key: 'S2', label: tr('ΔS₂（右）', 'ΔS₂ (right)'), color: SERIES[1], dash: [6, 4] }, { key: 'Sw', label: tr('ΔS（仕切り壁）', 'ΔS (partition wall)'), color: '#77756f', dash: [2, 3] }, { key: 'S', label: tr('全体 ΔS₁ + ΔS₂ + ΔS壁', 'Total ΔS₁ + ΔS₂ + ΔS_wall'), color: SERIES[3] }] });
const h1 = new HistPlot($('h1'), { height: 160, title: tr('流体1', 'Fluid 1'), label: tr('流体1の速さ', 'Speed of fluid 1') });
const h2 = new HistPlot($('h2'), { height: 160, title: tr('流体2', 'Fluid 2'), label: tr('流体2の速さ', 'Speed of fluid 2'), barColor: 'rgba(120,120,120,0.45)' });

function build() {
  gas = new Gas({ H: 60, X: 100, Xmin: 100, Xmax: 100, seed: (Math.random() * 1e9) | 0 });
  gas.setVPartition(50, ADIABATIC);
  gas.addParticles(+$('N1in').value, +$('T1in').value, { x0: 0, x1: 50, y0: 0, y1: 60 }, 0);
  gas.addParticles(+$('N2in').value, +$('T2in').value, { x0: 50, x1: 100, y0: 0, y1: 60 }, 1);
  gas.vpart.Tw = (+$('T1in').value + +$('T2in').value) / 2;
  gas.vpart.Cw = 20;
  gas.resetLedger();
  const g0 = groups();
  U0 = g0.map((g) => g.U);
  setupEntropy(g0);
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { pistonRod: false, Tref: 1.2, drawScale: 2.8 });
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  view.opt.arrows = $('c-arrow').checked;
  view.opt.showHeat = $('c-heat').checked;
  partSeg?.select('adiabatic', false); partMode = 'adiabatic'; hint();
  plotT.reset(); plotU.reset(); plotS.reset();
}

/** 2次元理想気体（体積一定）: S = N ln U + 定数。はじめの状態からの変化 ΔS（k = 1） */
const dS1 = (u) => (u > 0 ? sN[0] * Math.log(u / U0[0]) : -Infinity);
const dS2 = (u) => (u > 0 ? sN[1] * Math.log(u / U0[1]) : -Infinity);

/** 全体のエントロピーを U₁ の関数として描く準備（外側は断熱なので U₁ + U₂ = 一定） */
function setupEntropy(g0) {
  sValid = true; sTrail = []; sm = null;
  sN = [g0[0].N, g0[1].N];
  const Ut = U0[0] + U0[1];
  sUt = Ut;
  Tw0 = gas.vpart.Tw;
  const uStar = (Ut * sN[0]) / (sN[0] + sN[1]);          // 頂上：T₁ = T₂
  const Smax = dS1(uStar) + dS2(Ut - uStar);
  const span = Math.max(Smax, 20);
  Object.assign(plotSU.opt, { xmax: Ut, ymin: -0.8 * span, ymax: Smax + 0.35 * span });
  const lo = plotSU.opt.ymin - 1e3;   // 端（U → 0）で −∞ にならないように
  plotSU.refs = [
    { label: tr('気体 S₁ + S₂', 'Gases S₁ + S₂'), color: SERIES[3], fn: (u) => Math.max(lo, dS1(u) + dS2(sUt - u)) },
    { label: tr('S₁（左）', 'S₁ (left)'), color: SERIES[0], dash: [6, 4], fn: (u) => Math.max(lo, dS1(u)) },
    { label: tr('S₂（右）', 'S₂ (right)'), color: SERIES[1], dash: [6, 4], fn: (u) => Math.max(lo, dS2(sUt - u)) },
  ];
  plotSU.peak = [uStar, Smax];
  plotSU.paths = []; plotSU.marker = [U0[0], 0];
  plotSU.draw();
}

/** 変化の向きの説明 */
function showDirection(T1, T2) {
  const el = $('r-dir');
  if (!sValid) {
    el.innerHTML = tr('仕切りを取り除いたので、粒子が行き来して体積も変わる。この図（体積一定の二室）はここまで。「準備し直す」で戻せます。', 'The partition has been removed, so particles move across and the volumes change too. This plot (two chambers at fixed volume) stops here. "Reset" brings it back.');
    return;
  }
  const b1 = 1 / T1, b2 = 1 / T2, d = b1 - b2;
  if (partMode === 'adiabatic') {
    el.innerHTML = tr('<b>断熱壁</b>：エネルギーのやりとりが禁じられている（拘束）ので <i>U</i>₁ は変われず、点は動かない。', '<b>Adiabatic wall</b>: exchanging energy is forbidden (a constraint), so <i>U</i>₁ cannot change and the dot does not move.') +
      (Math.abs(d) > 0.03 * (b1 + b2) ? tr('拘束を外せば <i>S</i> が増える向きがあるのに、変化が起こらない状態。', ' There is a direction in which <i>S</i> would increase if the constraint were removed, yet no change happens.') : '');
  } else if (Math.abs(d) < 0.03 * (b1 + b2)) {
    el.innerHTML = tr('<b>ほぼ頂上</b>：1/<i>T</i>₁ ≈ 1/<i>T</i>₂。どちらへエネルギーを移しても <i>S</i> はもう増えない → 平衡状態（残っているのはゆらぎ）。', '<b>Almost at the top</b>: 1/<i>T</i>₁ ≈ 1/<i>T</i>₂. Moving energy either way no longer increases <i>S</i> → equilibrium (what remains are fluctuations).');
  } else if (d < 0) {
    el.innerHTML = tr('<b>d<i>S</i>/d<i>U</i>₁ &lt; 0</b>：<i>U</i>₁ を減らす向き＝<b>左（高温）から右（低温）へ</b>エネルギーが移る向きで、全体の <i>S</i> が増える。実際の熱の流れもこの向き。', '<b>d<i>S</i>/d<i>U</i>₁ &lt; 0</b>: the total <i>S</i> increases in the direction where <i>U</i>₁ decreases, i.e. energy moves <b>from the left (hot) to the right (cold)</b>. The actual heat flow is in this direction too.');
  } else {
    el.innerHTML = tr('<b>d<i>S</i>/d<i>U</i>₁ &gt; 0</b>：<i>U</i>₁ を増やす向き＝<b>右（高温）から左（低温）へ</b>エネルギーが移る向きで、全体の <i>S</i> が増える。実際の熱の流れもこの向き。', '<b>d<i>S</i>/d<i>U</i>₁ &gt; 0</b>: the total <i>S</i> increases in the direction where <i>U</i>₁ increases, i.e. energy moves <b>from the right (hot) to the left (cold)</b>. The actual heat flow is in this direction too.');
  }
}

/** 仕切りがあれば部分系ごと、取り除いたら流体の種類ごとに集計 */
function groups() {
  const out = [{ N: 0, U: 0 }, { N: 0, U: 0 }];
  for (let i = 0; i < gas.N; i++) {
    const k = gas.vpart ? gas.region[i] : gas.species[i];
    out[k].N++; out[k].U += 0.5 * (gas.vx[i] ** 2 + gas.vy[i] ** 2);
  }
  for (const o of out) o.T = o.N ? o.U / o.N : NaN;
  return out;
}

function hint() {
  const t = { adiabatic: tr('断熱壁：左右の間でエネルギーは移動しない。', 'Adiabatic wall: no energy moves between left and right.'), diathermal: tr('透熱壁：壁を通してエネルギー（熱）が移動できる。', 'Diathermal wall: energy (heat) can move through the wall.'), none: tr('仕切りなし：粒子そのものが行き来して混ざる。', 'No partition: the particles themselves move across and mix.') };
  $('part-hint').textContent = t[partMode];
  $('grp-hint').textContent = gas?.vpart ? '' : tr('（仕切りを取り除いたので、流体の種類ごとに集計）', '(partition removed, so totals are per fluid species)');
  $('s-hint').textContent = sValid ? '' : tr('（仕切りを取り除いたので停止中）', '(stopped because the partition was removed)');
  $('n1').textContent = gas?.vpart ? tr('部分系1（左）', 'Subsystem 1 (left)') : tr('流体1（青）', 'Fluid 1 (blue)');
  $('n2').textContent = gas?.vpart ? tr('部分系2（右）', 'Subsystem 2 (right)') : tr('流体2（白）', 'Fluid 2 (white)');
}

const partSeg = segmented('part', (v) => {
  partMode = v;
  if (v === 'none') { gas.setVPartition(null); sValid = false; }
  else gas.setVPartition(50, v === 'adiabatic' ? ADIABATIC : DIATHERMAL);
  hint();
}, false);

for (const id of ['T1in', 'T2in']) bindRange(id, () => {}, (v) => v.toFixed(1));
for (const id of ['N1in', 'N2in']) bindRange(id, () => {}, (v) => v.toFixed(0));
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; $('lg-species').hidden = on; });
bindCheck('c-arrow', (on) => { if (view) view.opt.arrows = on; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
$('btn-reset').addEventListener('click', build);
build();

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    frame++;
    const g = groups();
    const Us = g[0].U + g[1].U;
    plotT.push(gas.time, { T1: g[0].T, T2: g[1].T });
    plotU.push(gas.time, { U1: g[0].U, U2: g[1].U, Us });
    $('N1').textContent = g[0].N; $('N2').textContent = g[1].N; $('Ns').textContent = g[0].N + g[1].N;
    $('T1').textContent = fmt(g[0].T, 3); $('T2').textContent = fmt(g[1].T, 3);
    $('U1').textContent = fmt(g[0].U, 1); $('U2').textContent = fmt(g[1].U, 1); $('Us').textContent = fmt(Us, 1);
    $('Q1').textContent = fmtSigned(g[0].U - U0[0], 1); $('Q2').textContent = fmtSigned(g[1].U - U0[1], 1);
    $('Qs').textContent = fmtSigned(Us - U0[0] - U0[1], 1);
    if (sValid) {
      const k = 0.05;   // 表示用に少しならした温度（向きの判定がゆらぎでちらつかないように）
      if (!sm) sm = { T1: g[0].T, T2: g[1].T };
      sm.T1 += k * (g[0].T - sm.T1); sm.T2 += k * (g[1].T - sm.T2);
      const S1 = dS1(g[0].U), S2 = dS2(g[1].U);
      const Sw = gas.vpart.Cw * Math.log(gas.vpart.Tw / Tw0);   // 仕切り壁（熱容量 Cw）/ the partition wall (heat capacity Cw)
      sUt = g[0].U + g[1].U;
      plotSU.opt.xmax = sUt;   // 仕切り壁が蓄える分だけわずかに変わる / changes slightly by what the wall stores
      const uStar = (sUt * sN[0]) / (sN[0] + sN[1]);
      plotSU.peak = [uStar, dS1(uStar) + dS2(sUt - uStar)];
      plotS.push(gas.time, { S1, S2, Sw, S: S1 + S2 + Sw });
      plotSU.marker = [g[0].U, S1 + S2];
      if (frame % 4 === 0) { sTrail.push([g[0].U, S1 + S2]); if (sTrail.length > 400) sTrail.shift(); }
      $('r-b1').textContent = fmt(1 / sm.T1, 3); $('r-b2').textContent = fmt(1 / sm.T2, 3);
      $('r-dSdU').textContent = fmtSigned(1 / sm.T1 - 1 / sm.T2, 3);
      $('r-dS').textContent = fmtSigned(S1 + S2 + Sw, 1);
    }
    if (frame % 2 === 0) {
      plotT.draw(); plotU.draw();
      if (sValid) {
        plotSU.paths = [{ label: tr('頂上（T₁ = T₂）', 'Top (T₁ = T₂)'), color: '#77756f', pts: [plotSU.peak], ends: true },
          { label: tr('これまでの経路', 'Path so far'), color: SERIES[2], pts: sTrail, width: 1.5 }];
        plotSU.draw(); plotS.draw();
      }
      if (sm) showDirection(sm.T1, sm.T2);
    }
    if (frame % 8 === 0) {
      const vmax = 3.6 * Math.sqrt(Math.max(g[0].T, g[1].T, 0.5));
      const pick = (k) => (i) => (gas.vpart ? gas.region[i] : gas.species[i]) === k;
      h1.set(gas.speeds(pick(0)), (v) => mb2d(v, g[0].T), vmax); h1.draw();
      h2.set(gas.speeds(pick(1)), (v) => mb2d(v, g[1].T), vmax); h2.draw();
    }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
