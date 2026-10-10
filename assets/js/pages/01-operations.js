// 01-operations.js ― sims/01-operations.html と en/sims/01-operations.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL, mb2d } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, HistPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
let gas, view, simRate = 0.1, frame = 0;
const T0 = 1.0;

function build() {
  gas = new Gas({ H: 60, X: 90, Xmin: 45, Xmax: 110, seed: (Math.random() * 1e9) | 0 });
  Object.assign(gas.stirrer, { present: true, on: false, cx: 28, cy: 30, L: 24, omega: +$('omega').value });
  gas.addParticles(180, T0, { x0: 0, x1: 90, y0: 0, y1: 60 });
  gas.pTau = 20;
  gas.piston.target = 90;
  if (view) { view.g = gas; } else {
    view = new SimView($('sim'), gas, { bathPad: 13, envPad: 5, Tref: T0, drawScale: 2.8 });
  }
  applyWalls(); applyBath();
  $('pos').value = 90; $('pos-val').textContent = '90';
  $('btn-stir').setAttribute('aria-pressed', 'false');
  plotT?.reset(); plotP?.reset();
}

const plotT = new TimePlot($('plotT'), { height: 170, ylabel: tr('温度 T', 'Temperature T'), yZero: true,
  series: [{ key: 'T', label: tr('気体の温度 T', 'Gas temperature T'), color: SERIES[0] }, { key: 'Tb', label: tr('熱源の温度', 'Reservoir temperature'), color: SERIES[1], dash: [6, 4] }] });
const plotP = new TimePlot($('plotP'), { height: 170, ylabel: tr('圧力 P', 'Pressure P'), yZero: true,
  series: [{ key: 'P', label: tr('P（壁が受ける力）', 'P (force on the walls)'), color: SERIES[0] }, { key: 'Pk', label: 'NkT/V', color: SERIES[2], dash: [6, 4] }] });
const hist = new HistPlot($('hist'), { height: 180, vmax: 5 });

// ---- 壁 ----
const wallSegs = {};
function applyWalls() {
  for (const side of ['left', 'top', 'bottom']) if (wallSegs[side]) gas.walls[side] = wallSegs[side].value;
  updateHints();
}
for (const side of ['left', 'top', 'bottom']) wallSegs[side] = segmented('w-' + side, () => applyWalls(), false);

// ---- 熱源 ----
let bathMode = 'none';
function applyBath() {
  gas.bath = { left: bathMode !== 'none', top: bathMode === 'env', bottom: bathMode === 'env' };
  updateHints();
}
segmented('bathmode', (v) => { bathMode = v; applyBath(); }, false);
bindRange('Tb', (v) => { if (gas) gas.Tbath = v; }, (v) => v.toFixed(2), false);

function updateHints() {
  if (!gas) return;
  const sides = { left: tr('左', 'left'), top: tr('上', 'top'), bottom: tr('下', 'bottom') };
  const contact = Object.keys(sides).filter((s) => gas.bath[s]);
  let msg = '';
  if (!contact.length) msg = tr('熱源とは接していません。', 'Not in contact with a heat reservoir.');
  else {
    const open = contact.filter((s) => gas.walls[s] === DIATHERMAL);
    const closed = contact.filter((s) => gas.walls[s] === ADIABATIC);
    if (!open.length) msg = tr(`熱源と接していますが、接している壁（${closed.map((s) => sides[s]).join('・')}）が断熱壁なので熱は通りません。`, `In contact with a reservoir, but the wall in contact (${closed.map((s) => sides[s]).join(', ')}) is adiabatic, so no heat passes.`);
    else msg = tr(`透熱壁（${open.map((s) => sides[s]).join('・')}）を通して熱源とエネルギーをやりとりできます。`, `Energy can be exchanged with the reservoir through the diathermal wall (${open.map((s) => sides[s]).join(', ')}).`) + (closed.length ? tr(`（${closed.map((s) => sides[s]).join('・')}は断熱）`, ` (${closed.map((s) => sides[s]).join(', ')}: adiabatic)`) : '');
  }
  $('bath-hint').textContent = msg;
  const anyDia = Object.values(gas.walls).some((w) => w === DIATHERMAL);
  $('state-hint').textContent = !anyDia && true ? tr('— すべて断熱壁：熱のやりとりなし', '— all walls adiabatic: no heat exchange') : '';
}

// ---- ピストン・撹拌 ----
bindRange('pos', (v) => { if (gas) gas.piston.target = v; }, (v) => v.toFixed(0), false);
bindRange('pspeed', (v) => { if (gas) gas.piston.speed = Math.pow(10, v); }, (v) => Math.pow(10, v).toPrecision(2), true);
bindRange('omega', (v) => { if (gas) gas.stirrer.omega = v; }, (v) => v.toFixed(2), true);
$('btn-stir').addEventListener('click', (e) => {
  gas.stirrer.on = !gas.stirrer.on;
  e.currentTarget.setAttribute('aria-pressed', String(gas.stirrer.on));
});

// ---- 表示 ----
bindCheck('c-speed', (on) => { view && (view.opt.colorMode = on ? 'speed' : 'species'); $('lg-speed').hidden = !on; });
bindCheck('c-arrow', (on) => { view && (view.opt.arrows = on); });
bindCheck('c-trace', (on) => { if (gas) { gas.tracerOn = on; gas.tracer = []; } });
bindCheck('c-heat', (on) => { view && (view.opt.showHeat = on); });
bindSpeed('speed', (v) => { simRate = v; });

$('btn-reset').addEventListener('click', () => {
  build();
  gas.Tbath = +$('Tb').value;
  gas.piston.speed = Math.pow(10, +$('pspeed').value);
  view.opt.arrows = $('c-arrow').checked; gas.tracerOn = $('c-trace').checked;
});
$('btn-ledger').addEventListener('click', () => gas.resetLedger());

build();
gas.Tbath = +$('Tb').value;
gas.piston.speed = Math.pow(10, +$('pspeed').value);
view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
view.opt.arrows = $('c-arrow').checked;
gas.tracerOn = $('c-trace').checked;

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    gas.measure();
    frame++;
    const s = gas.stats();
    const bathOn = Object.keys(gas.bath).some((k) => gas.bath[k] && gas.walls[k] === DIATHERMAL);
    plotT.push(gas.time, { T: s.T, Tb: bathOn ? gas.Tbath : NaN });
    plotP.push(gas.time, { P: s.Pwall, Pk: s.Pkin });
    $('r-N').textContent = s.N;
    $('r-V').textContent = fmt(s.V, 0);
    $('r-U').textContent = fmt(s.U, 1);
    $('r-T').textContent = fmt(s.T, 3);
    $('r-P').textContent = fmt(s.Pwall, 4);
    $('r-Pk').textContent = fmt(s.Pkin, 4);
    if (frame % 6 === 0) { const sp = gas.speeds(); $('r-v').textContent = fmt(sp.reduce((a, b) => a + b, 0) / Math.max(1, sp.length), 2); }
    updateLedger('l-', s);
    $('l-Wp').textContent = fmtSigned(s.Wpiston, 1);
    $('l-Ws').textContent = fmtSigned(s.Wstir, 1);
    if (frame % 2 === 0) { plotT.draw(); plotP.draw(); }
    if (frame % 6 === 0) {
      const T = s.T;
      hist.set(gas.speeds(), (v) => mb2d(v, T), Math.max(6, 3.6 * Math.sqrt(T)), { fn: (v) => mb2d(v, T0), label: tr('はじめ（T=1）の分布', 'Initial (T=1) distribution') });
      hist.draw();
    }
    $('pos-val').textContent = gas.X.toFixed(0);
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
