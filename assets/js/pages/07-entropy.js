// 07-entropy.js ― sims/07-entropy.html と en/sims/07-entropy.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { lnChoose, binomHalf } from '../entropy.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X = 100, NS = [4, 10, 20, 50, 100, 200, 300, 400];
const TH = 1.6, TC = 0.4;
let gas, view, simRate = 0.1, frame = 0, mode = 'exp', N = 200, same = false, opened = false;
let sm = null;   // 熱の移動：表示用に少しならした温度

const plotS = new TimePlot($('plotS'), { height: 220, ylabel: tr('S（k 単位）', 'S (units of k)'), yZero: true, window: 600, series: [] });
const plotB = new XYPlot($('plotB'), { height: 200, xmin: 0, xmax: 200, ymin: 0, ymax: null, xlabel: tr('n（左半分の粒子数）', 'n (particles in left half)'), ylabel: tr('割合', 'fraction'), xd: 0, yd: 4 });
const plotT = new TimePlot($('plotT'), { height: 180, ylabel: tr('温度 T', 'Temperature T'), yZero: true, window: 600,
  series: [{ key: 'T1', label: tr('左 T₁（高温側）', 'Left T₁ (hot side)'), color: '#d6453d' }, { key: 'T2', label: tr('右 T₂（低温側）', 'Right T₂ (cold side)'), color: SERIES[0] }] });

function setSeries() {
  if (mode === 'heat') plotS.opt.series = [
    { key: 'S', label: tr('全体の ΔS', 'Total ΔS'), color: SERIES[3] },
    { key: 'S1', label: tr('左の ΔS₁', 'Left ΔS₁'), color: '#d6453d', dash: [6, 4] },
    { key: 'S2', label: tr('右の ΔS₂', 'Right ΔS₂'), color: SERIES[0], dash: [6, 4] },
    { key: 'th', label: tr('理論（平衡後）', 'Theory (after equilibrium)'), color: '#77756f', dash: [2, 3] }];
  else plotS.opt.series = [
    { key: 'S', label: tr('ln W（ボルツマンのエントロピー）', 'ln W (Boltzmann entropy)'), color: SERIES[3] },
    { key: 'th', label: mode === 'exp' ? tr('熱力学の ΔS = N ln 2', 'Thermodynamic ΔS = N ln 2') : (same ? tr('同じ気体なら ΔS = 0', 'Same gas: ΔS = 0') : tr('混合の ΔS = N ln 2', 'Mixing ΔS = N ln 2')), color: '#77756f', dash: [6, 4] }];
}

function build() {
  opened = false; sm = null;
  gas = new Gas({ H, X, Xmin: X, Xmax: X, seed: (Math.random() * 1e9) | 0 });
  gas.setVPartition(X / 2, ADIABATIC);
  if (mode === 'exp') gas.addParticles(N, 1, { x0: 0, x1: X / 2, y0: 0, y1: H }, 0);
  else if (mode === 'mix') {
    gas.addParticles(N / 2, 1, { x0: 0, x1: X / 2, y0: 0, y1: H }, 0);
    gas.addParticles(N / 2, 1, { x0: X / 2, x1: X, y0: 0, y1: H }, 1);
  } else {
    gas.addParticles(N / 2, TH, { x0: 0, x1: X / 2, y0: 0, y1: H }, 0);
    gas.addParticles(N / 2, TC, { x0: X / 2, x1: X, y0: 0, y1: H }, 0);
    gas.vpart.Tw = (TH + TC) / 2;
  }
  gas.resetLedger();
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { pistonRod: false, Tref: 1, drawScale: 2.8 });
  if (mode === 'heat') $('c-speed').checked = true;   // 熱の移動は色＝速さで見る
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  $('lg-speed').hidden = !$('c-speed').checked;
  gas.tracerOn = $('c-trace').checked;
  const heat = mode === 'heat';
  $('btn-open').textContent = heat ? tr('透熱壁にする（接触させる）', 'Make it diathermal (bring into contact)') : tr('仕切りを外す', 'Remove the partition');
  $('btn-open').disabled = false;
  $('btn-rev').hidden = heat;
  $('opt-mix').hidden = mode !== 'mix';
  $('ro-count').hidden = heat; $('ro-heat').hidden = !heat;
  $('wrap-binom').hidden = heat; $('wrap-temp').hidden = !heat;
  $('lg-species').hidden = mode !== 'mix';
  $('mode-hint').textContent = mode === 'exp' ? tr('— 左半分に気体、右半分は真空', '— gas in the left half, vacuum in the right half')
    : mode === 'mix' ? tr('— 左に気体 A、右に気体 B（同じ温度・同じ圧力）', '— gas A on the left, gas B on the right (same temperature, same pressure)')
    : tr(`— 左は高温（T = ${TH}）、右は低温（T = ${TC}）。いまは断熱壁で仕切られている`, `— left is hot (T = ${TH}), right is cold (T = ${TC}); separated by an adiabatic wall for now`);
  setSeries();
  plotS.reset(); plotT.reset();
  plotB.opt.xmax = mode === 'mix' ? N / 2 : N;
}

// 左半分にいる粒子の数（種類ごと）
function countLeft() {
  let a = 0, b = 0;
  for (let i = 0; i < gas.N; i++) if (gas.x[i] < X / 2) { if (gas.species[i] === 0) a++; else b++; }
  return [a, b];
}

/** ln W と、その理論上の最大値（平衡後の値） */
function lnW() {
  const [a, b] = countLeft();
  if (mode === 'exp') return { S: lnChoose(N, a), th: N * Math.LN2, n: a };
  if (same) {
    // 区別しない：左に n = a+b 個、はじめは n = N/2（左右に N/2 ずつ）
    const n = a + b;
    return { S: lnChoose(N, n) - lnChoose(N, N / 2), th: 0, n, a, b };
  }
  // A は右へ、B は左へ広がる：A が左に a 個、B が左に b 個
  return { S: lnChoose(N / 2, a) + lnChoose(N / 2, b), th: N * Math.LN2, n: a + b, a, b };
}

function heatS() {
  const r1 = gas.regionStats(0), r2 = gas.regionStats(gas.vpart ? 1 : 0);
  const k = 0.05;
  if (!sm) sm = { T1: r1.T, T2: r2.T, Tw: gas.vpart.Tw };
  sm.T1 += k * (r1.T - sm.T1); sm.T2 += k * (r2.T - sm.T2); sm.Tw += k * (gas.vpart.Tw - sm.Tw);
  const n = N / 2, Cw = gas.vpart.Cw;
  const S1 = n * Math.log(sm.T1 / TH), S2 = n * Math.log(sm.T2 / TC), Sw = Cw * Math.log(sm.Tw / ((TH + TC) / 2));
  const Tf = (n * TH + n * TC + Cw * (TH + TC) / 2) / (2 * n + Cw);
  const th = n * Math.log(Tf / TH) + n * Math.log(Tf / TC) + Cw * Math.log(Tf / ((TH + TC) / 2));
  return { S1, S2, S: S1 + S2 + Sw, th, r1, r2 };
}

segmented('mode', (v) => { mode = v; build(); }, false);
bindRange('N', (v) => { N = NS[v]; build(); }, (v) => String(NS[v]), true);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
bindCheck('c-trace', (on) => { if (gas) { gas.tracerOn = on; gas.tracer = []; } });
bindCheck('c-same', (on) => { same = on; setSeries(); plotS.reset(); });
$('btn-reset').addEventListener('click', build);
$('btn-open').addEventListener('click', () => {
  if (opened) return;
  opened = true;
  if (mode === 'heat') gas.setVPartition(X / 2, DIATHERMAL); else gas.setVPartition(null);
  $('btn-open').disabled = true;
});
$('btn-rev').addEventListener('click', () => {
  for (let i = 0; i < gas.N; i++) { gas.vx[i] = -gas.vx[i]; gas.vy[i] = -gas.vy[i]; }
});

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    frame++;
    $('r-N').textContent = gas.N;
    if (mode === 'heat') {
      const h = heatS();
      $('r-T1').textContent = fmt(h.r1.T, 3); $('r-T2').textContent = fmt(h.r2.T, 3);
      $('r-Q1').textContent = fmtSigned(h.r1.Q, 1); $('r-Q2').textContent = fmtSigned(h.r2.Q, 1);
      $('r-dS').textContent = fmtSigned(h.S, 2); $('r-dSth').textContent = fmtSigned(h.th, 2);
      plotS.push(gas.time, { S: h.S, S1: h.S1, S2: h.S2, th: h.th });
      plotT.push(gas.time, { T1: sm.T1, T2: sm.T2 });
      if (frame % 2 === 0) { plotS.draw(); plotT.draw(); }
    } else {
      const w = lnW();
      $('r-nL').textContent = mode === 'mix' ? `A ${w.a} / B ${w.b}` : String(w.n);
      $('r-S').textContent = fmt(w.S, 1);
      $('r-Sth').textContent = fmt(w.th, 1);
      const p = Math.pow(0.5, N);   // 混合なら「A が全部左・B が全部右」に戻る確率
      $('r-prob').textContent = p > 1e-4 ? p.toFixed(4) : `10^${Math.log10(p).toFixed(0)}`;
      plotS.push(gas.time, { S: w.S, th: w.th });
      if (frame % 2 === 0) {
        plotS.draw();
        const M = mode === 'mix' ? N / 2 : N, x = mode === 'mix' ? w.a : w.n;
        plotB.refs = [{ label: mode === 'mix' ? tr(`C(${M}, n)/2^${M}（気体 A）`, `C(${M}, n)/2^${M} (gas A)`) : `C(${M}, n)/2^${M}`, color: SERIES[0], fn: (k) => binomHalf(M, k) }];
        plotB.opt.ymax = binomHalf(M, M / 2) * 1.25;
        plotB.marker = [x, binomHalf(M, x)];
        plotB.draw();
      }
    }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
