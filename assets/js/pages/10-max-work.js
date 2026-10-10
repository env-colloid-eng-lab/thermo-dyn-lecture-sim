// 10-max-work.js ― sims/10-max-work.html と en/sims/10-max-work.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 45, X1 = 90;
let gA, gB, vA, vB, simRate = 0.6, frame = 0;
let T = 1, N = 200, pspeed = 0.03, started = false, SbA = 0, QpA = 0, T0A = 1, T0B = 1, tDone = null, t0 = 0;

const plotS = new TimePlot($('plotS'), { height: 220, ylabel: tr('ΔS（k 単位）', 'ΔS (units of k)'), yZero: true, window: 3000,
  series: [{ key: 'Sg', label: tr('A：気体', 'A: gas'), color: SERIES[0], dash: [6, 4] }, { key: 'Sb', label: tr('A：熱源', 'A: reservoir'), color: '#d6453d', dash: [2, 3] },
    { key: 'St', label: tr('A：全体', 'A: total'), color: SERIES[3] }, { key: 'StB', label: tr('B：全体', 'B: total'), color: SERIES[1] }] });

function build() {
  const seed = (Math.random() * 1e9) | 0;
  gA = new Gas({ H, X: X0, Xmin: X0, Xmax: X1, r: 0.15, seed });
  gA.addParticles(N, T, { x0: 0, x1: X0, y0: 0, y1: H });
  gA.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  gA.bath = { left: true, top: true, bottom: true };
  gA.Tbath = T;
  gA.resetLedger();
  gB = new Gas({ H, X: X1, Xmin: X1, Xmax: X1, r: 0.15, seed: seed + 1 });
  gB.setVPartition(X0, ADIABATIC);
  gB.addParticles(N, T, { x0: 0, x1: X0, y0: 0, y1: H });
  gB.resetLedger();
  if (vA) { vA.g = gA; vB.g = gB; } else {
    vA = new SimView($('simA'), gA, { envPad: 5, Tref: 1, drawScale: 5.6 });
    vB = new SimView($('simB'), gB, { envPad: 5, Tref: 1, drawScale: 5.6, pistonRod: false });   // B の右壁は動かない
  }
  for (const v of [vA, vB]) { v.opt.Tref = T; v.opt.colorMode = $('c-speed').checked ? 'speed' : 'species'; v.opt.showHeat = $('c-heat').checked; }
  started = false; SbA = 0; QpA = 0; tDone = null;
  $('btn-start').disabled = false;
  $('r-state').textContent = tr('— 「膨張を始める」を押す', '— press "Start the expansion"');
  plotS.reset();
  // 理論値（2次元理想気体、k = 1）
  const L = N * Math.log(2);
  $('t-Q').textContent = fmtSigned(T * L, 1); $('t-W').textContent = fmtSigned(-T * L, 1);
  $('t-Sg').textContent = fmtSigned(L, 1); $('t-Sg2').textContent = fmtSigned(L, 1);
  $('t-Sb').textContent = fmtSigned(-L, 1); $('t-St2').textContent = fmtSigned(L, 1);
  $('t-F').textContent = fmtSigned(-T * L, 1); $('t-F2').textContent = fmtSigned(-T * L, 1);
  for (const k of ['Q', 'W', 'dU', 'Sg', 'Sb', 'St', 'F']) { $('a-' + k).textContent = '–'; $('b-' + k).textContent = '–'; }
  setStack('rev', T * L, 0);
  setStack('a', 0, 0); setStack('b', 0, 0);
  $('o-a').textContent = '–'; $('o-b').textContent = '–';
}

/** 棒：取り出した仕事と失われた仕事。破線は上限 −ΔF */
function setStack(id, wout, lost) {
  const max = T * N * Math.log(2), scale = max * 1.25;
  const w = Math.max(0, wout), l = Math.max(0, lost);
  const pct = (v) => `${Math.min(100, (100 * v) / scale).toFixed(2)}%`;
  Object.assign($(`s-${id}-w`).style, { left: '0', width: pct(w) });
  Object.assign($(`s-${id}-l`).style, { left: pct(w), width: pct(l) });
  $(`s-${id}-m`).style.width = pct(max);
  $(`o-${id}`).textContent = `${fmt(wout, 0)} + ${fmt(lost, 0)}`;
}

function start() {
  if (started) return;
  started = true;
  gA.resetLedger(); gB.resetLedger();
  SbA = 0; QpA = 0;
  T0A = gA.kinetic() / gA.N; T0B = gB.kinetic() / gB.N; t0 = gA.time;
  gA.piston.speed = pspeed; gA.piston.target = X1;
  gB.setVPartition(null);
  $('btn-start').disabled = true;
  plotS.reset();
}

segmented('pspeed', (v) => { pspeed = parseFloat(v); if (gA && started && gA.X < X1) gA.piston.speed = pspeed; }, false);
bindRange('T', (v) => { T = v; if (gA) build(); }, (v) => v.toFixed(1), false);
bindRange('N', (v) => { N = v; if (gA) build(); }, (v) => v.toFixed(0), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { for (const v of [vA, vB]) if (v) v.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
bindCheck('c-heat', (on) => { for (const v of [vA, vB]) if (v) v.opt.showHeat = on; });
$('btn-reset').addEventListener('click', build);
$('btn-start').addEventListener('click', start);
build();

const loop = new Loop((paused) => {
  if (!paused) {
    gA.advance(simRate); gB.advance(simRate);
    frame++;
    const sA = gA.stats(), sB = gB.stats();
    $('r-A').textContent = tr(`T = ${fmt(sA.T, 2)}、V = ${fmt(sA.V, 0)}`, `T = ${fmt(sA.T, 2)}, V = ${fmt(sA.V, 0)}`) + (started ? (gA.X < X1 - 1e-9 ? tr('（ピストンを引いている）', ' (pulling the piston)') : tr('（膨張が終わった）', ' (expansion finished)')) : '');
    $('r-B').textContent = tr(`T = ${fmt(sB.T, 2)}、V = ${fmt(gB.vpart ? X0 * H : sB.V, 0)}`, `T = ${fmt(sB.T, 2)}, V = ${fmt(gB.vpart ? X0 * H : sB.V, 0)}`) + (started ? tr('（仕切りを外した）', ' (partition removed)') : tr('（右半分は真空）', ' (right half is vacuum)'));
    if (started) {
      // 熱源のエントロピー：熱源が受け取った熱 −dQ を熱源の温度で割って足していく
      SbA -= (sA.Q - QpA) / gA.Tbath; QpA = sA.Q;
      // 気体のエントロピー（2次元理想気体）：N ln(V/V₀) + N ln(T/T₀)。温度はならさない（熱源の項とゆらぎが打ち消し合う）
      const SgA = N * Math.log(gA.X / X0) + N * Math.log(sA.T / T0A);
      // B：左右半分それぞれにいる粒子数から数えた（粗視化した）エントロピー Σ nᵢ ln(V₀/nᵢ) − N ln(V₀/N)。広がるにつれて N ln 2 に近づく
      let nL = 0; for (let i = 0; i < gB.N; i++) if (gB.x[i] < X0) nL++;
      const nR = gB.N - nL, V0 = X0 * H, xl = (n) => (n > 0 ? n * Math.log(V0 / n) : 0);
      const SgB = xl(nL) + xl(nR) - xl(N) + N * Math.log(sB.T / T0B);
      const StA = SgA + SbA, StB = SgB;
      plotS.push(gA.time - t0, { Sg: SgA, Sb: SbA, St: StA, StB });
      const set = (p, k, v) => { $(`${p}-${k}`).textContent = fmtSigned(v, 1); };
      set('a', 'Q', sA.Q); set('a', 'W', sA.W); set('a', 'dU', sA.dU); set('a', 'Sg', SgA); set('a', 'Sb', SbA); set('a', 'St', StA);
      set('a', 'F', sA.dU - T * SgA);
      set('b', 'Q', sB.Q); set('b', 'W', sB.W); set('b', 'dU', sB.dU); set('b', 'Sg', SgB); set('b', 'Sb', 0); set('b', 'St', StB);
      set('b', 'F', sB.dU - T * SgB);
      if (frame % 3 === 0) { setStack('a', -sA.W, T * StA); setStack('b', -sB.W, T * StB); }
      if (gA.X >= X1 - 1e-9 && tDone == null) tDone = gA.time;
      $('r-state').textContent = tDone == null ? tr('— 膨張中', '— expanding') : tr('— A の膨張が終わった。熱源と平衡になるまで少し待つと、値が落ち着く', '— A has finished expanding. Wait a little until it equilibrates with the reservoir and the values settle');
      if (frame % 2 === 0) plotS.draw();
    }
  }
  vA.draw(); vB.draw();
});
bindPlayPause('btn-play', loop);
