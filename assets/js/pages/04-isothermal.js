// 04-isothermal.js ― sims/04-isothermal.html と en/sims/04-isothermal.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 100, N = 300;
let gas, view, simRate = 0.1, frame = 0, wallMode = 'dia', speed = 0.03, Tb = 1;
let hist = [];

const plotE = new TimePlot($('plotE'), { height: 200, ylabel: tr('エネルギー（累計）', 'Energy (cumulative)'), yZero: true, window: 3000,
  series: [{ key: 'W', label: tr('仕事 W', 'Work W'), color: SERIES[1] }, { key: 'mQ', label: tr('環境へ −Q', 'To surroundings −Q'), color: '#d6453d', dash: [6, 4] }, { key: 'dU', label: 'ΔU', color: SERIES[0] }] });
const plotT = new TimePlot($('plotT'), { height: 150, ylabel: tr('温度 T', 'Temperature T'), yZero: true, window: 3000,
  series: [{ key: 'T', label: tr('気体の温度 T', 'Gas temperature T'), color: SERIES[0] }, { key: 'Tb', label: tr('環境の温度', 'Temperature of surroundings'), color: SERIES[1], dash: [6, 4] }] });

function applyWalls() {
  const t = wallMode === 'dia' ? DIATHERMAL : ADIABATIC;
  gas.walls = { left: t, top: t, bottom: t };
  gas.bath = { left: true, top: true, bottom: true };
  gas.Tbath = Tb;
  $('mode-hint').textContent = wallMode === 'dia' ? tr('— 透熱壁：環境と熱をやりとりできる', '— Diathermal walls: heat can be exchanged with the surroundings') : tr('— 断熱壁：環境があっても熱は通らない', '— Adiabatic walls: no heat passes even though the surroundings are there');
}

function build() {
  gas = new Gas({ H, X: X0, Xmin: 40, Xmax: 110, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(N, Tb, { x0: 0, x1: X0, y0: 0, y1: H });
  gas.piston.target = X0; gas.piston.speed = speed;
  applyWalls();
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { envPad: 5, Tref: 1, drawScale: 2.8 });
  view.opt.showHeat = $('c-heat').checked;
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  gas.tracerOn = $('c-trace').checked;
  hist = []; plotE.reset(); plotT.reset();
}

segmented('walls', (v) => { wallMode = v; if (gas) applyWalls(); }, false);
segmented('pspeed', (v) => { speed = parseFloat(v); if (gas) gas.piston.speed = speed; }, false);
bindRange('Tb', (v) => { Tb = v; if (gas) gas.Tbath = v; }, (v) => v.toFixed(2), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
bindCheck('c-trace', (on) => { if (gas) { gas.tracerOn = on; gas.tracer = []; } });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
$('btn-comp').addEventListener('click', () => { gas.piston.speed = speed; gas.piston.target = Math.max(gas.Xmin, gas.X / 2); });
$('btn-exp').addEventListener('click', () => { gas.piston.speed = speed; gas.piston.target = X0; });
$('btn-stop').addEventListener('click', () => { gas.piston.target = gas.X; });
$('btn-reset').addEventListener('click', build);
$('btn-ledger').addEventListener('click', () => { gas.resetLedger(); hist = []; plotE.reset(); });
build();

function setBar(id, v, scale) {
  const el = $(id), w = Math.min(50, (Math.abs(v) / scale) * 50);
  el.style.left = v >= 0 ? '50%' : (50 - w) + '%';
  el.style.width = w + '%';
}
function setArrow(id, rate, thr) {
  const el = $(id);
  el.classList.toggle('idle', Math.abs(rate) < thr);
  el.classList.toggle('rev', rate < 0);
}

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    gas.measure();
    frame++;
    const s = gas.stats();
    hist.push([gas.time, s.W, s.Q]);
    while (hist.length > 2 && hist[0][0] < gas.time - 500) hist.shift();
    const dt = hist.length > 1 ? hist[hist.length - 1][0] - hist[0][0] : 1;
    const Wrate = hist.length > 1 ? (s.W - hist[0][1]) / dt : 0;
    const Qrate = hist.length > 1 ? (s.Q - hist[0][2]) / dt : 0;
    setArrow('a-W', Wrate, 0.005);
    setArrow('a-Q', -Qrate, 0.04);
    $('r-Wrate').textContent = `${fmtSigned(Wrate, 2)} /t`;
    $('r-Qrate').textContent = `${fmtSigned(-Qrate, 2)} /t`;
    $('f-out').textContent = fmtSigned(s.W, 1);
    $('f-dU').textContent = fmtSigned(s.dU, 1);
    $('f-U').textContent = tr(`U = ${fmt(s.U, 1)}（T = ${fmt(s.T, 2)}）`, `U = ${fmt(s.U, 1)} (T = ${fmt(s.T, 2)})`);
    $('f-bath').textContent = fmtSigned(-s.Q, 1);
    const scale = Math.max(50, Math.abs(s.W), Math.abs(s.Q), Math.abs(s.dU));
    setBar('b-W', s.W, scale); setBar('b-dU', s.dU, scale); setBar('b-Q', -s.Q, scale);
    $('o-W').textContent = fmtSigned(s.W, 1); $('o-dU').textContent = fmtSigned(s.dU, 1); $('o-Q').textContent = fmtSigned(-s.Q, 1);
    updateLedger('l-', s);
    plotE.push(gas.time, { W: s.W, mQ: -s.Q, dU: s.dU });
    plotT.push(gas.time, { T: s.T, Tb: wallMode === 'dia' ? gas.Tbath : NaN });
    if (frame % 2 === 0) { plotE.draw(); plotT.draw(); }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
