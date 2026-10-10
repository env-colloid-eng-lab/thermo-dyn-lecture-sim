// 19-membrane.js ― sims/19-membrane.html と en/sims/19-membrane.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
// 種類 0 = K⁺（+1）、1 = Cl⁻（−1）、2 = A⁻（−1、膜を通らない大きな陰イオン：タンパク質など）
const H = 60, X0 = 100, R = 0.2, T0 = 1;
const Q = [1, -1, -1];
const NAME = ['K⁺', 'Cl⁻', 'A⁻'];
const COL = ['#d6453d', '#2a78d6', '#77756f'];
const MV = 26.7;                    // T = 1 を体温 310 K とみたときの kT/e（mV）
const TAU = 200;                    // 内外の数の時間平均の時定数
const WIN = 300;                    // 正味の移動の速さを平均する時間
let gas, view, simRate = 0.2, frame = 0, psi = 0, perm = 'K', init = 'same';
let nin = new Float64Array(3), nout = new Float64Array(3), wsum = 0, layer = null, cross = [], netLog = [];

const plotR = new TimePlot($('plotR'), { height: 190, ylabel: 'ln(c_in/c_out)', window: 3000,
  series: [{ key: 'K', label: tr('K⁺（測定）', 'K⁺ (measured)'), color: COL[0] }, { key: 'Kth', label: tr('K⁺ 平衡（ネルンスト）', 'K⁺ equilibrium (Nernst)'), color: COL[0], dash: [6, 4] },
    { key: 'C', label: tr('Cl⁻（測定）', 'Cl⁻ (measured)'), color: COL[1] }, { key: 'Cth', label: tr('Cl⁻ 平衡（ネルンスト）', 'Cl⁻ equilibrium (Nernst)'), color: COL[1], dash: [6, 4] }] });
const plotN = new XYPlot($('plotN'), { height: 260, xmin: -3, xmax: 3, ymin: -3.5, ymax: 3.5, xlabel: tr('膜電位 Δψ = ψ_in − ψ_out（kT/e 単位）', 'membrane potential Δψ = ψ_in − ψ_out (units of kT/e)'), ylabel: 'ln(c_in/c_out)', xd: 2, yd: 2 });
let recK = [], recC = [];

function levelsOpt() { return { q: Q, block: [perm === 'none', perm !== 'KCl', true] }; }
function applyPsi() {
  // 層 0 = 下 = 細胞の内側（ψ_in = Δψ）、層 1 = 上 = 外側（ψ_out = 0）。外側にいるときの電気的なエネルギーは q(ψ_out − ψ_in) = −qΔψ
  gas.setLevels(2, -psi, [0.5], levelsOpt());
}

function build() {
  gas = new Gas({ H, X: X0, Xmin: 40, Xmax: 110, r: R, seed: (Math.random() * 1e9) | 0 });
  const IN = { x0: 0, x1: X0, y0: H / 2, y1: H }, OUT = { x0: 0, x1: X0, y0: 0, y1: H / 2 };
  if (init === 'same') {
    gas.addParticles(80, T0, IN, 0); gas.addParticles(80, T0, OUT, 0);
    gas.addParticles(60, T0, IN, 1); gas.addParticles(60, T0, OUT, 1);
  } else {   // 細胞のように：内側に K⁺ が多く、外側に Cl⁻ が多い
    gas.addParticles(140, T0, IN, 0); gas.addParticles(20, T0, OUT, 0);
    gas.addParticles(20, T0, IN, 1); gas.addParticles(100, T0, OUT, 1);
  }
  gas.addParticles(60, T0, IN, 2);
  gas.piston.target = X0;
  gas.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  gas.bath = { left: true, top: true, bottom: true }; gas.Tbath = T0;
  applyPsi();
  gas.resetLedger();
  if (view) view.g = gas;
  else view = new SimView($('sim'), gas, { envPad: 4, Tref: T0, drawScale: 4, speciesColors: COL, levelStyle: 'membrane', showHeat: false,
    levelText: (k) => (k === 0 ? tr(`内側  ψ_in = ${fmtSigned(psi, 2)}`, `inside  ψ_in = ${fmtSigned(psi, 2)}`) : tr('外側  ψ_out = 0', 'outside  ψ_out = 0')) });
  nin.fill(0); nout.fill(0); wsum = 0; layer = null; cross = []; netLog = [];
  plotR.reset();
}

/** 内外の数を時間平均し、膜を越えた粒子を数える */
function sample(dt) {
  const a = Math.exp(-dt / TAU);
  for (let s = 0; s < 3; s++) { nin[s] *= a; nout[s] *= a; }
  wsum = wsum * a + dt;
  if (!layer || layer.length !== gas.N) layer = new Int8Array(gas.N).fill(-1);
  const out = [0, 0, 0];   // 内 → 外 へ越えた数（外 → 内 は負）
  for (let i = 0; i < gas.N; i++) {
    const k = gas.layerOf(gas.y[i]), s = gas.species[i];
    if (k === 0) nin[s] += dt; else nout[s] += dt;
    if (layer[i] >= 0 && layer[i] !== k) out[s] += k === 1 ? 1 : -1;
    layer[i] = k;
  }
  netLog.push([gas.time, out]);
  while (netLog.length > 2 && netLog[0][0] < gas.time - WIN) netLog.shift();
}

segmented('perm', (v) => { perm = v; if (gas) applyPsi(); }, false);
segmented('init', (v) => { init = v; if (gas) build(); }, false);
const psiCtl = bindRange('psi', (v) => { psi = v; if (gas) applyPsi(); }, (v) => tr(`${fmtSigned(v, 1)}（${fmtSigned(v * MV, 0)} mV）`, `${fmtSigned(v, 1)} (${fmtSigned(v * MV, 0)} mV)`), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; });
$('btn-nernst').addEventListener('click', () => {
  // いまの K⁺ の濃度比から、K⁺ が正味に動かなくなる電位（ネルンスト電位）を求めてそろえる
  if (nin[0] > 0 && nout[0] > 0) { const v = Math.max(-3, Math.min(3, Math.log(nout[0] / nin[0]) / Q[0])); psiCtl.set(Math.round(v * 10) / 10); psi = parseFloat($('psi').value); applyPsi(); }
});
$('btn-rec').addEventListener('click', () => {
  if (nin[0] > 0 && nout[0] > 0) recK.push([psi, Math.log(nin[0] / nout[0])]);
  if (perm === 'KCl' && nin[1] > 0 && nout[1] > 0) recC.push([psi, Math.log(nin[1] / nout[1])]);
});
$('btn-clear').addEventListener('click', () => { recK = []; recC = []; });
$('btn-reset').addEventListener('click', build);
$('btn-ledger').addEventListener('click', () => { gas.resetLedger(); });
build();

function update(paused) {
  const s = gas.stats();
  updateLedger('l-', s);
  const dt = netLog.length > 1 ? netLog[netLog.length - 1][0] - netLog[0][0] : 0;
  const lr = [], dmu = [], rows = [];
  for (let k = 0; k < 3; k++) {
    lr[k] = nin[k] > 0 && nout[k] > 0 ? Math.log(nin[k] / nout[k]) : NaN;
    dmu[k] = lr[k] * T0 + Q[k] * psi;   // 電気化学ポテンシャルの差 μ̃<sub>in</sub> − μ̃<sub>out</sub>（kT 単位、e = 1）
    let net = 0; for (const [, o] of netLog) net += o[k];
    const rate = dt > 20 ? net / dt : NaN;
    const passes = !levelsOpt().block[k];
    $(`r-in${k}`).textContent = wsum ? fmt(nin[k] / wsum, 1) : '–'; $(`r-out${k}`).textContent = wsum ? fmt(nout[k] / wsum, 1) : '–';
    $(`r-lr${k}`).textContent = fmtSigned(lr[k], 2);
    $(`r-th${k}`).textContent = passes ? fmtSigned(-Q[k] * psi / T0, 2) : tr('（通れない）', '(cannot pass)');
    $(`r-dmu${k}`).textContent = passes ? fmtSigned(dmu[k], 2) : '–';
    $(`r-flux${k}`).textContent = passes ? fmtSigned(rate * 100, 1) : '0';
    rows.push({ k, passes, dmu: dmu[k], rate });
  }
  const vN = nin[0] > 0 && nout[0] > 0 ? Math.log(nout[0] / nin[0]) : NaN;
  $('r-vN').textContent = tr(`${fmtSigned(vN, 2)}（${fmtSigned(vN * MV, 0)} mV）`, `${fmtSigned(vN, 2)} (${fmtSigned(vN * MV, 0)} mV)`);
  $('r-psi').textContent = tr(`${fmtSigned(psi, 2)}（${fmtSigned(psi * MV, 0)} mV）`, `${fmtSigned(psi, 2)} (${fmtSigned(psi * MV, 0)} mV)`);

  // 向きの説明（K⁺ を中心に）
  const K = rows[0], el = $('r-dir');
  if (!K.passes) {
    el.innerHTML = tr('<b>膜がイオンを通さない</b>：濃度の差があっても、電位差があっても、イオンは膜を越えられない（拘束）。どちらが自由エネルギーの低い側かとは関係なく、いまの分布が保たれる。', '<b>The membrane lets no ions through</b>: whatever the concentration or potential difference, ions cannot cross (a constraint). The present distribution is kept regardless of which side has the lower free energy.');
  } else if (Math.abs(K.dmu) < 0.15) {
    el.innerHTML = tr(`<b>K⁺ は平衡</b>：濃度の差による向き（kT ln(c<sub>in</sub>/c<sub>out</sub>) = ${fmtSigned(lr[0], 2)}）と、電位差による向き（eΔψ = ${fmtSigned(psi, 2)}）が打ち消し合い、μ̃<sub>in</sub> ≈ μ̃<sub>out</sub>。膜を行き来する K⁺ は多いが、正味の移動はない。`, `<b>K⁺ is in equilibrium</b>: the push from the concentration difference (kT ln(c<sub>in</sub>/c<sub>out</sub>) = ${fmtSigned(lr[0], 2)}) and the push from the potential difference (eΔψ = ${fmtSigned(psi, 2)}) cancel, so μ̃<sub>in</sub> ≈ μ̃<sub>out</sub>. Many K⁺ ions cross the membrane, but there is no net movement.`);
  } else {
    el.innerHTML = K.dmu > 0
      ? tr(`<b>K⁺ は外へ出ていく</b>：内側の電気化学ポテンシャルの方が高い（μ̃<sub>in</sub> − μ̃<sub>out</sub> = ${fmtSigned(K.dmu, 2)} kT）。外へ移すと自由エネルギーが下がる。`, `<b>K⁺ moves out</b>: the electrochemical potential inside is higher (μ̃<sub>in</sub> − μ̃<sub>out</sub> = ${fmtSigned(K.dmu, 2)} kT). Moving it out lowers the free energy.`)
      : tr(`<b>K⁺ は内へ入ってくる</b>：外側の電気化学ポテンシャルの方が高い（μ̃<sub>in</sub> − μ̃<sub>out</sub> = ${fmtSigned(K.dmu, 2)} kT）。内へ移すと自由エネルギーが下がる。`, `<b>K⁺ moves in</b>: the electrochemical potential outside is higher (μ̃<sub>in</sub> − μ̃<sub>out</sub> = ${fmtSigned(K.dmu, 2)} kT). Moving it in lowers the free energy.`);
  }

  if (!paused) plotR.push(gas.time, { K: lr[0], Kth: perm !== 'none' ? -Q[0] * psi : NaN, C: perm === 'KCl' ? lr[1] : NaN, Cth: perm === 'KCl' ? -Q[1] * psi : NaN });
  plotR.draw();
  plotN.refs = [{ label: tr('K⁺ のネルンストの式（傾き −1）', 'Nernst equation for K⁺ (slope −1)'), color: COL[0], dash: [6, 4], fn: (x) => -Q[0] * x },
    { label: tr('Cl⁻ のネルンストの式（傾き +1）', 'Nernst equation for Cl⁻ (slope +1)'), color: COL[1], dash: [6, 4], fn: (x) => -Q[1] * x }];
  plotN.paths = [{ label: tr('K⁺ の記録', 'K⁺ records'), color: COL[0], pts: recK, dots: true }, { label: tr('Cl⁻ の記録', 'Cl⁻ records'), color: COL[1], pts: recC, dots: true }];
  plotN.marker = Number.isFinite(lr[0]) ? [psi, lr[0]] : null;
  plotN.draw();
}

const loop = new Loop((paused) => {
  if (!paused) { gas.advance(simRate); sample(simRate); frame++; }
  if (paused || frame % 3 === 0) update(paused);   // 一時停止中も、スライダーやボタンの変更をすぐ表示する
  view.draw();
});
bindPlayPause('btn-play', loop);
