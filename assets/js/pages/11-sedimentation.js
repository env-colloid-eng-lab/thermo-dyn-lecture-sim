// 11-sedimentation.js ― sims/11-sedimentation.html と en/sims/11-sedimentation.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { xEqBath, meltT, xEqIsolated, twoRegionF, twoRegionS, boltzmannLayers, tEqIsolatedLayers, lnMultinomial, layersF, layersS } from '../levels.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X = 90;
let gas, view, simRate = 0.1, frame = 0;
let mode = 'two', env = 'bath', dE = 1.5, mgH = 3, nL = 6, T0 = 1, N = 300, v2 = 0.8, meltPts = [];
let tT = 0, c0 = 0, cnt0 = [], Tinit = 1, Sbath = 0, Qprev = 0, sm = null, avg = null, trail = [];

const plotF = new XYPlot($('plotF'), { height: 260, xmin: 0, xmax: 1, ymin: -1, ymax: 1, xlabel: tr('x （上の領域にいる割合）', 'x (fraction in the upper region)'), ylabel: 'F/N', xd: 3, yd: 3 });
const plotC = new XYPlot($('plotC'), { height: 300, xmin: 0, xmax: 3, ymin: 0, ymax: 1, xlabel: tr('c/c̄ （層の濃度 ÷ 平均の濃度）', 'c/c̄ (layer concentration ÷ mean concentration)'), ylabel: tr('z/H （高さ）', 'z/H (height)'), xd: 2, yd: 2 });
const plotS = new TimePlot($('plotS'), { height: 200, ylabel: tr('ΔS（k 単位）', 'ΔS (units of k)'), yZero: true, window: 800,
  series: [{ key: 'Sc', label: tr('系：配置', 'System: configuration'), color: SERIES[0], dash: [6, 4] }, { key: 'Sk', label: tr('系：速さ', 'System: speeds'), color: SERIES[1], dash: [6, 4] },
    { key: 'Sb', label: tr('熱源', 'Reservoir'), color: '#d6453d', dash: [2, 3] }, { key: 'St', label: tr('全体', 'Total'), color: SERIES[3] },
    { key: 'th', label: tr('全体の理論値（平衡後）', 'Theoretical total (after equilibrium)'), color: '#77756f', dash: [6, 4] }] });
const plotX = new TimePlot($('plotX'), { height: 170, ylabel: tr('割合 x', 'fraction x'), yZero: true, window: 800, series: [] });

const levelN = () => (mode === 'multi' ? nL : 2);
const levelE = () => (mode === 'multi' ? mgH / nL : dE);
// 二状態：上の領域の広さ v2（境目の高さ 1 − v2）。それ以外は同じ広さ
const V2 = () => (mode === 'state' ? v2 : 0.5);
const bounds = () => (mode === 'state' ? [1 - v2] : undefined);
const fr = () => (mode === 'state' ? [1 - v2, v2] : undefined);

function build() {
  gas = new Gas({ H, X, Xmin: X, Xmax: X, r: 0.15, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(N, T0, { x0: 0, x1: X, y0: 0, y1: H });
  const bath = env === 'bath';
  gas.walls = bath ? { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL } : { left: ADIABATIC, top: ADIABATIC, bottom: ADIABATIC };
  gas.bath = { left: bath, top: bath, bottom: bath };
  gas.Tbath = T0;
  gas.setLevels(levelN(), levelE(), bounds());
  gas.resetLedger();
  cnt0 = gas.layerCounts(); c0 = lnMultinomial(cnt0, fr()); meltPts = []; Tinit = T0;
  Sbath = 0; Qprev = 0; sm = null; avg = null; trail = [];
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { envPad: 5, Tref: 1, drawScale: 5.6, pistonRod: false });
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  view.opt.showHeat = $('c-heat').checked;
  const two = mode !== 'multi';
  $('row-v2').hidden = mode !== 'state'; $('wrap-melt').hidden = mode !== 'state'; $('st-Tm').hidden = mode !== 'state';
  $('row-dE').hidden = !two; $('row-mgH').hidden = two; $('row-nL').hidden = two;
  $('wrap-curve').hidden = !two; $('wrap-prof').hidden = two;
  $('lbl-T').innerHTML = bath ? tr('熱源の温度 <i>T</i>', 'Reservoir temperature <i>T</i>') : tr('はじめの温度 <i>T</i>₀', 'Initial temperature <i>T</i>₀');
  $('mode-hint').textContent = (two ? tr('— 上の領域の粒子だけエネルギーが ΔE 高い', '— only particles in the upper region have an energy higher by ΔE') : tr('— 層ごとに mgH/n ずつエネルギーが高い（重力の階段近似）', '— each layer is higher in energy by mgH/n (staircase approximation of gravity)')) +
    (bath ? tr('。壁は熱源（温度 T）と接触', '; the walls touch a reservoir (temperature T)') : tr('。外壁はすべて断熱', '; all outer walls are adiabatic'));
  $('k-x').innerHTML = two ? tr('上の領域にいる割合 <i>x</i>', 'Fraction in the upper region <i>x</i>') : tr('重心の高さ ⟨<i>z</i>⟩/<i>H</i>', 'Height of the center of mass ⟨<i>z</i>⟩/<i>H</i>');
  $('k-xth').textContent = tr('理論の平衡値', 'Theoretical equilibrium value');
  $('curve-title').textContent = two ? (bath ? tr('変化の向き：自由エネルギー F(x) が減る向き', 'Direction of change: the way the free energy F(x) decreases') : tr('変化の向き：全体のエントロピー S(x) が増える向き', 'Direction of change: the way the total entropy S(x) increases')) : tr('層ごとの濃度（沈降平衡）', 'Concentration in each layer (sedimentation equilibrium)');
  $('curve-hint').textContent = two ? (bath ? tr('1粒子あたり、一様に置いた状態からの差（k = 1）', 'per particle, difference from uniform placement (k = 1)') : tr('1粒子あたり、一様に置いた状態からの差（k 単位）', 'per particle, difference from uniform placement (units of k)')) : tr('棒＝測定（時間平均）、破線＝理論（階段）、点線＝連続な重力', 'bars = measured (time average), dashed = theory (staircase), dotted = continuous gravity');
  plotF.opt.ylabel = bath ? 'ΔF/N' : 'ΔS/N';
  plotX.opt.ylabel = two ? tr('割合 x', 'fraction x') : '⟨z⟩/H';
  plotX.opt.series = two
    ? [{ key: 'x', label: tr('上の領域にいる割合 x', 'Fraction in the upper region x'), color: SERIES[0] }, { key: 'th', label: tr('理論の平衡値', 'Theoretical equilibrium'), color: '#77756f', dash: [6, 4] }]
    : [{ key: 'x', label: tr('重心の高さ ⟨z⟩/H', 'Height of the center of mass ⟨z⟩/H'), color: SERIES[0] }, { key: 'th', label: tr('理論の平衡値', 'Theoretical equilibrium'), color: '#77756f', dash: [6, 4] }];
  if (mode === 'state') $('mode-hint').textContent = tr('— 上の領域はエネルギーが ΔE 高いが、広さが v₂（置き方が多い）', '— the upper region is higher in energy by ΔE but has size v₂ (more ways to be placed)');
  plotS.reset(); plotX.reset();
}

/** いまの条件での理論（平衡の温度と分布） */
function theory() {
  const n = levelN(), e = levelE();
  const E = gas.kinetic() + gas.potential();
  const T = env === 'bath' ? gas.Tbath : (n === 2 ? E / gas.N - xEqIsolated(e, E / gas.N, V2()) * e : tEqIsolatedLayers(n, e, E / gas.N));
  const p = boltzmannLayers(n, e, T, fr());
  // はじめ（一様に置いた状態）から平衡までの全体のエントロピー変化：熱源なら −ΔF/T、孤立系なら ΔS。途中で段差や熱源の温度を変えたら出さない
  const eq = p.map((v) => v * gas.N);
  const dStot = Math.abs(gas.ledger.Wfield) > 1e-9 || (env === 'bath' && gas.Tbath !== Tinit) ? NaN
    : env === 'bath' ? (layersF(cnt0, e, T, fr()) - layersF(eq, e, T, fr())) / T : layersS(eq, e, E, fr()) - layersS(cnt0, e, E, fr());
  return { n, e, T, E, p, dStot, x: p[n - 1], zmean: p.reduce((a, v, k) => a + v * (k + 0.5) / n, 0) };
}

function drawCurve(th, x) {
  const e = th.e, eN = th.E / gas.N;
  const fn = env === 'bath' ? (u) => twoRegionF(u, e, gas.Tbath, V2()) : (u) => twoRegionS(u, e, eN, V2());
  let lo = Infinity, hi = -Infinity;
  for (let k = 1; k < 200; k++) { const v = fn(k / 200); if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  const pad = Math.max(0.05, 0.12 * (hi - lo));
  Object.assign(plotF.opt, { ymin: lo - pad, ymax: hi + pad });
  plotF.refs = [{ label: env === 'bath' ? tr('自由エネルギー F(x)', 'Free energy F(x)') : tr('全体のエントロピー S(x)', 'Total entropy S(x)'), color: SERIES[3], fn: (u) => Math.max(lo - 10, fn(u)) }];
  plotF.paths = [{ label: env === 'bath' ? tr('最小（理論の平衡）', 'Minimum (theoretical equilibrium)') : tr('最大（理論の平衡）', 'Maximum (theoretical equilibrium)'), color: '#77756f', pts: [[th.x, fn(th.x)]], ends: true },
    { label: tr('これまでの経路', 'Path so far'), color: SERIES[2], pts: trail, width: 1.5 }];
  plotF.marker = [x, fn(x)];
  plotF.draw();
}

const plotM = new XYPlot($('plotM'), { height: 220, xmin: 0.3, xmax: 3, ymin: 0, ymax: 1, xlabel: tr('T （熱源の温度）', 'T (reservoir temperature)'), ylabel: 'x', xd: 2, yd: 3 });
/** 二状態：x(T) の理論曲線と、温度ごとの測定（時間平均） */
function drawMelt(xAvg) {
  const Tm = meltT(dE, v2);
  $('r-Tm').textContent = Number.isFinite(Tm) && Tm > 0 ? fmt(Tm, 3) : '–';
  plotM.refs = [{ label: tr('上の領域にいる割合（理論）', 'Fraction in the upper region (theory)'), color: SERIES[3], fn: (T) => xEqBath(dE, T, v2) }];
  plotM.paths = [{ label: tr('測定（時間平均）', 'Measured (time average)'), color: SERIES[0], pts: meltPts.concat(env === 'bath' ? [[gas.Tbath, xAvg]] : []), dots: true }];
  if (Number.isFinite(Tm) && Tm > 0.3 && Tm < 3) plotM.paths.push({ label: 'T_m', color: '#77756f', pts: [[Tm, 0], [Tm, 1]], dash: [4, 4], width: 1.2 });
  plotM.marker = env === 'bath' ? [gas.Tbath, xAvg] : null;
  plotM.draw();
}

function drawProfile(th) {
  const n = th.n, P = (mgH / Math.max(th.T, 1e-9));
  const stair = (c) => { const pts = []; c.forEach((v, k) => { pts.push([v, k / n], [v, (k + 1) / n]); }); return pts; };
  const thC = th.p.map((v) => v * n), meas = avg.map((v) => v * n);
  const cont = [];
  for (let j = 0; j <= 60; j++) { const z = j / 60; cont.push([P > 1e-6 ? (P * Math.exp(-P * z)) / (1 - Math.exp(-P)) : 1, z]); }
  plotC.opt.xmax = Math.max(1.5, ...thC, ...meas, cont[0][0]) * 1.15;
  plotC.paths = [
    { label: tr('測定（時間平均）', 'Measured (time average)'), color: SERIES[0], pts: stair(meas), width: 3 },
    { label: tr('理論（階段）', 'Theory (staircase)'), color: '#77756f', pts: stair(thC), dash: [6, 4], width: 1.8 },
    { label: tr('連続な重力 e^(−z/ℓ)', 'Continuous gravity e^(−z/ℓ)'), color: SERIES[1], pts: cont, dash: [2, 3], width: 1.8 },
  ];
  plotC.draw();
}

function showDirection(two, xNow, xTh, sig) {
  const el = $('r-dir'), bath = env === 'bath';
  const what = bath ? tr('<i>F</i> が減る（系＋熱源の全体の <i>S</i> が増える）', '<i>F</i> decreases (the total <i>S</i> of system + reservoir increases)') : tr('全体の <i>S</i> が増える', 'the total <i>S</i> increases');
  if (Math.abs(xNow - xTh) < 2.5 * sig) {
    el.innerHTML = tr(`<b>平衡</b>：${bath ? '<i>F</i> の最小' : '<i>S</i> の最大'}のまわりでゆらいでいる。粒子は行き来し続けているが、上へ越える数と下へ来る数がつり合って、正味の移動がない。`, `<b>Equilibrium</b>: fluctuating around the ${bath ? 'minimum of <i>F</i>' : 'maximum of <i>S</i>'}. The particles keep moving back and forth, but the number crossing upward balances the number coming down, so there is no net movement.`);
  } else if (xNow > xTh) {
    el.innerHTML = tr(`<b>${two ? '上に多すぎる' : '重心が高すぎる'}</b>：粒子が下へ移る向きで ${what}。実際の正味の移動もこの向き。`, `<b>${two ? 'Too many at the top' : 'Center of mass too high'}</b>: moving particles downward is the direction in which ${what}. The actual net movement is in this direction too.`);
  } else {
    el.innerHTML = tr(`<b>${two ? '上に少なすぎる' : '重心が低すぎる'}</b>：粒子が上へ移る向きで ${what}。実際の正味の移動もこの向き。`, `<b>${two ? 'Too few at the top' : 'Center of mass too low'}</b>: moving particles upward is the direction in which ${what}. The actual net movement is in this direction too.`);
  }
}

segmented('mode', (v) => { mode = v; build(); }, false);
segmented('env', (v) => { env = v; build(); }, false);
bindRange('v2', (v) => { v2 = v; if (gas && mode === 'state') build(); }, (v) => v.toFixed(2), false);
bindRange('dE', (v) => { dE = v; if (gas && mode !== 'multi') { gas.setLevels(2, dE, bounds()); meltPts = []; } }, (v) => v.toFixed(1), false);
bindRange('mgH', (v) => { mgH = v; if (gas && mode === 'multi') gas.setLevels(nL, mgH / nL); }, (v) => v.toFixed(2), false);
bindRange('nL', (v) => { nL = v; if (gas && mode === 'multi') build(); }, (v) => v.toFixed(0), false);
bindRange('T', (v) => {
  // 二状態：温度を変える前の時間平均を x(T) の図に残す
  if (gas && mode === 'state' && env === 'bath' && avg && gas.time - tT > 150) meltPts.push([gas.Tbath, avg[1]]);
  T0 = v; if (!gas) return; if (env === 'bath') { gas.Tbath = v; tT = gas.time; } else build();
}, (v) => v.toFixed(1), false);
bindRange('N', (v) => { N = v; if (gas) build(); }, (v) => v.toFixed(0), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; $('lg-species').hidden = on; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
$('btn-reset').addEventListener('click', build);
build();

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    frame++;
    const s = gas.stats(), th = theory(), two = mode !== 'multi';
    const counts = gas.layerCounts(), frac = counts.map((c) => c / gas.N);
    // 熱源のエントロピー：受け取った熱 −dQ をそのときの熱源の温度で割って足していく
    if (env === 'bath') Sbath -= (s.Q - Qprev) / gas.Tbath;
    Qprev = s.Q;
    const k = 0.05;
    if (!sm) sm = { T: s.T };
    sm.T += k * (s.T - sm.T);
    if (!avg) avg = frac.slice(); else frac.forEach((v, j) => { avg[j] += 0.02 * (v - avg[j]); });
    const xNow = two ? frac[1] : frac.reduce((a, v, j) => a + v * (j + 0.5) / th.n, 0);
    const xAvg = two ? avg[1] : avg.reduce((a, v, j) => a + v * (j + 0.5) / th.n, 0);
    const xTh = two ? th.x : th.zmean;
    // 速さの部分はならさない温度で数える（熱源とのやりとりによるゆらぎが、熱源の項と打ち消し合うように）
    const Sc = lnMultinomial(counts, fr()) - c0, Sk = gas.N * Math.log(s.T / Tinit);
    plotS.push(gas.time, { Sc, Sk, Sb: Sbath, St: Sc + Sk + Sbath, th: th.dStot });
    plotX.push(gas.time, { x: xNow, th: xTh });
    $('r-x').textContent = fmt(xNow, 3); $('r-xavg').textContent = fmt(xAvg, 3); $('r-xth').textContent = fmt(xTh, 3);
    $('r-T').textContent = fmt(sm.T, 3);
    $('r-Sc').textContent = fmtSigned(Sc, 1); $('r-Sk').textContent = fmtSigned(Sk, 1);
    $('r-Sb').textContent = env === 'bath' ? fmtSigned(Sbath, 1) : tr('0（断熱）', '0 (adiabatic)'); $('r-St').textContent = fmtSigned(Sc + Sk + Sbath, 1);
    updateLedger('l-', s);
    if (two && frame % 4 === 0) { trail.push([xNow, 0]); if (trail.length > 300) trail.shift(); }
    if (frame % 2 === 0) {
      plotS.draw(); plotX.draw();
      if (two) {
        const fn = env === 'bath' ? (u) => twoRegionF(u, th.e, gas.Tbath, V2()) : (u) => twoRegionS(u, th.e, th.E / gas.N, V2());
        for (const p of trail) p[1] = fn(p[0]);   // 条件を変えたら曲線ごと描き直す
        drawCurve(th, xNow);
        if (mode === 'state') drawMelt(avg[1]);
      } else drawProfile(th);
      // 向きの判定は時間平均で（ゆらぎでちらつかないように）。σ はゆらぎの大きさの目安
      const sig = two ? Math.sqrt(th.x * (1 - th.x) / gas.N) : 0.25 / Math.sqrt(gas.N * th.n);
      showDirection(two, xAvg, xTh, Math.max(sig, 0.004));
    }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
