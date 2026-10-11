// 03-processes.js ― sims/03-processes.html と en/sims/03-processes.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { XYPlot, TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 100, N = 300, T0 = 1.0;
let gas, view, simRate = 0.1, frame = 0, cond = 'adi', speed = 0.02, speedCtl;
let legs = [], cur = null, cycle = null, fe = null, refState = null;

const pv = new XYPlot($('pv'), { height: 300, xmin: 0, xmax: 6600, ymin: 0, ymax: null, xlabel: tr('V（面積）', 'V (area)'), ylabel: 'P' });
const plotT = new TimePlot($('plotT'), { height: 150, ylabel: tr('温度 T', 'Temperature T'), yZero: true, window: 1500,
  series: [{ key: 'T', label: tr('気体の温度 T', 'Gas temperature T'), color: SERIES[0] }] });

function Vsys() { return gas.vpart ? gas.vpart.x * H : gas.X * H; }

function newGas(X, nRect) {
  gas = new Gas({ H, X: X0, Xmin: 35, Xmax: 110, seed: (Math.random() * 1e9) | 0, pTau: 6 });
  if (cond === 'iso') {
    gas.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
    gas.bath = { left: true, top: true, bottom: true };
    gas.Tbath = T0;
  }
  return gas;
}

function setRefs() {
  const s = { V: Vsys(), U: gas.kinetic() };
  const P0 = s.U / s.V, V0 = s.V, T = s.U / gas.N;
  refState = { V0, P0, T };
  pv.refs = [
    { label: tr(`等温線 (T=${T.toFixed(2)})`, `Isotherm (T=${T.toFixed(2)})`), color: '#9a988f', dash: [5, 4], fn: (V) => (P0 * V0) / V },
    { label: tr('断熱線 PV²=一定', 'Adiabat PV²=const.'), color: SERIES[2], dash: [2, 3], fn: (V) => P0 * (V0 / V) ** 2 },
  ];
  const Vmin = gas.Xmin * H;
  pv.opt.ymax = Math.min(P0 * (V0 / Vmin) ** 2 * 1.15, P0 * 6);
}

function build() {
  newGas();
  gas.addParticles(N, T0, { x0: 0, x1: X0, y0: 0, y1: H });
  gas.piston.target = X0; gas.piston.speed = speed;
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { envPad: 5, Tref: T0, drawScale: 2.8 });
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  view.opt.arrows = $('c-arrow').checked;
  legs = []; cur = null; cycle = null; fe = null;
  $('btn-fe-go').disabled = true; $('result').hidden = true;
  setRefs(); plotT.reset();
  $('mode-hint').textContent = cond === 'adi' ? tr('— 断熱：Q = 0', '— Adiabatic: Q = 0') : tr('— 等温：温度 T=1 の環境の中、すべて透熱壁', '— Isothermal: all walls diathermal, in surroundings at T=1');
}

function startLeg(target) {
  if (speed <= 0.02 && simRate < 1 && speedCtl) speedCtl.set(30);
  gas.piston.target = target;
  gas.piston.speed = speed;
  cur = { ppts: [], epts: [[Vsys(), gas.kinetic() / Vsys()]], lastV: Vsys(), lastW: gas.ledger.Wpiston,
          bin: H * Math.min(10, 3 + 4 * speed) };
  legs.push(cur);
  if (legs.length > 6) legs.shift();
}

function recordLeg() {
  if (!cur) return;
  const V = Vsys();
  if (Math.abs(V - cur.lastV) >= cur.bin) {
    const Pp = -(gas.ledger.Wpiston - cur.lastW) / (V - cur.lastV);
    cur.ppts.push([(V + cur.lastV) / 2, Pp]);
    cur.epts.push([V, gas.kinetic() / V]);
    cur.lastV = V; cur.lastW = gas.ledger.Wpiston;
  }
}

/** 雑音を減らすため隣り合う3点で移動平均 */
function smooth(p) {
  if (p.length < 3) return p;
  return p.map((q, k) => {
    const a = p[Math.max(0, k - 1)], c = p[Math.min(p.length - 1, k + 1)];
    return [q[0], (a[1] + 2 * q[1] + c[1]) / 4];
  });
}

function updatePV() {
  pv.paths = [];
  legs.forEach((L, k) => {
    const last = k === legs.length - 1;
    pv.paths.push({ label: k === 0 ? tr('状態方程式 NkT/V', 'Equation of state NkT/V') : '', color: SERIES[0], pts: L.epts, width: 2 });
    pv.paths.push({ label: k === 0 ? tr('ピストンが受けた圧力', 'Pressure on the piston') : '', color: SERIES[1], pts: smooth(L.ppts), width: 2, fill: last && !L.free });
    if (L.free) pv.paths.push({ label: tr('自由膨張の始点と終点（途中は非平衡）', 'Start and end of free expansion (non-equilibrium in between)'), color: '#77756f', pts: L.free, width: 1.5, dash: [6, 5], ends: true });
  });
  pv.marker = [Vsys(), gas.kinetic() / Vsys()];
  pv.draw();
}

segmented('cond', (v) => { cond = v; build(); }, false);
segmented('pspeed', (v) => {
  speed = parseFloat(v); if (gas) gas.piston.speed = speed;
  // 準静的は時間がかかるので再生速度を自動で上げる（手動で変更可）
  if (speedCtl) speedCtl.set(speed <= 0.02 ? 30 : speed <= 0.06 ? 10 : speed <= 1 ? 1.5 : 1);
}, false);
bindRange('xc', () => {}, (v) => v.toFixed(0));
speedCtl = bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
bindCheck('c-arrow', (on) => { if (view) view.opt.arrows = on; });

function leaveFreeExpansion() {
  if (fe) { build(); }
}
$('btn-comp').addEventListener('click', () => { leaveFreeExpansion(); cycle = null; startLeg(+$('xc').value); });
$('btn-exp').addEventListener('click', () => { leaveFreeExpansion(); cycle = null; startLeg(X0); });
$('btn-stop').addEventListener('click', () => { cycle = null; gas.piston.target = gas.X; cur = null; });
$('btn-cycle').addEventListener('click', () => {
  leaveFreeExpansion();
  if (Math.abs(gas.X - X0) > 0.5) { startLeg(X0); cycle = { stage: 'return' }; }
  else beginCycle();
});
function beginCycle() {
  cycle = { stage: 'compress', T0: gas.kinetic() / gas.N, W0: gas.ledger.Wpiston + gas.ledger.Wstir, Q0: gas.ledger.Q, U0: gas.kinetic() };
  setRefs();
  legs = [];
  startLeg(+$('xc').value);
  $('result').hidden = true;
}

$('btn-fe-prep').addEventListener('click', () => {
  cond = 'adi';
  document.querySelector('#cond button[data-value=adi]').setAttribute('aria-pressed', 'true');
  document.querySelector('#cond button[data-value=iso]').setAttribute('aria-pressed', 'false');
  newGas();
  gas.setVPartition(X0 / 2, ADIABATIC);
  gas.addParticles(N, T0, { x0: 0, x1: X0 / 2, y0: 0, y1: H });
  gas.piston.target = X0;
  view.g = gas;
  legs = []; cur = null; cycle = null; fe = { stage: 'ready' };
  setRefs(); plotT.reset();
  $('btn-fe-go').disabled = false; $('result').hidden = true;
  $('mode-hint').textContent = tr('— 自由膨張：右半分は真空（粒子なし）', '— Free expansion: the right half is a vacuum (no particles)');
});
$('btn-fe-go').addEventListener('click', () => {
  if (!fe || fe.stage !== 'ready') return;
  const V1 = Vsys(), P1 = gas.kinetic() / V1;
  fe = { stage: 'run', t0: gas.time, V1, P1, T1: gas.kinetic() / gas.N };
  gas.setVPartition(null);
  $('btn-fe-go').disabled = true;
});

$('btn-reset').addEventListener('click', build);
build();

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    gas.measure();
    frame++;
    recordLeg();
    // 1往復の自動進行
    if (cycle && Math.abs(gas.X - gas.piston.target) < 1e-9) {
      if (cycle.stage === 'return') beginCycle();
      else if (cycle.stage === 'compress') { cycle.stage = 'expand'; startLeg(X0); }
      else if (cycle.stage === 'expand') { cycle.stage = 'relax'; cycle.t1 = gas.time; cur = null; }
      else if (cycle.stage === 'relax' && gas.time - cycle.t1 > 60) {
        const T1 = gas.kinetic() / gas.N;
        const W = gas.ledger.Wpiston + gas.ledger.Wstir - cycle.W0, Q = gas.ledger.Q - cycle.Q0, dU = gas.kinetic() - cycle.U0;
        const lbl = { 0.02: tr('準静的', 'quasi-static'), 0.06: tr('ゆっくり', 'slow'), 0.8: tr('速い', 'fast'), 2.5: tr('とても速い', 'very fast') }[speed] ?? speed;
        $('result').innerHTML = tr(`<b>1往復の結果（${cond === 'adi' ? '断熱' : '等温'}・${lbl}）</b>　体積は元に戻った。`, `<b>Result of one round trip (${cond === 'adi' ? 'adiabatic' : 'isothermal'}, ${lbl})</b> The volume is back to its original value. `) +
          tr(`温度 ${cycle.T0.toFixed(3)} → ${T1.toFixed(3)}、往復で気体がされた仕事 <i>W</i> = ${fmtSigned(W, 1)}、熱 <i>Q</i> = ${fmtSigned(Q, 1)}、Δ<i>U</i> = ${fmtSigned(dU, 1)}。`, `Temperature ${cycle.T0.toFixed(3)} → ${T1.toFixed(3)}, work done on the gas over the round trip <i>W</i> = ${fmtSigned(W, 1)}, heat <i>Q</i> = ${fmtSigned(Q, 1)}, Δ<i>U</i> = ${fmtSigned(dU, 1)}.`) +
          (cond === 'adi'
            ? (Math.abs(T1 / cycle.T0 - 1) < 0.04 ? tr('　→ ほぼ元の状態に戻った（可逆）。', ' → Almost back to the original state (reversible).') : tr('　→ 元の状態に戻らない（不可逆）。外からした仕事が内部エネルギーとして残った。', ' → Not back to the original state (irreversible). The work done from outside remained as internal energy.'))
            : (W > 0.05 * N * T0 ? tr('　→ 往復で外からした正味の仕事が、熱として環境へ捨てられた（不可逆）。', ' → The net work done from outside over the round trip was dumped into the surroundings as heat (irreversible).') : tr('　→ 正味の仕事はほぼ 0（可逆）。', ' → The net work is almost 0 (reversible).')));
        $('result').hidden = false;
        cycle = null;
      }
    }
    // 自由膨張
    if (fe && fe.stage === 'run' && gas.time - fe.t0 > 150) {
      const V2 = Vsys(), P2 = gas.kinetic() / V2;
      legs.push({ ppts: [], epts: [], free: [[fe.V1, fe.P1], [V2, P2]] });
      const T2 = gas.kinetic() / gas.N;
      $('result').innerHTML = tr(`<b>自由膨張の結果</b>　体積 ${fe.V1.toFixed(0)} → ${V2.toFixed(0)}、温度 ${fe.T1.toFixed(3)} → ${T2.toFixed(3)}、<i>W</i> = ${fmtSigned(gas.ledger.Wpiston, 1)}、<i>Q</i> = ${fmtSigned(gas.ledger.Q, 1)}。`, `<b>Result of free expansion</b> Volume ${fe.V1.toFixed(0)} → ${V2.toFixed(0)}, temperature ${fe.T1.toFixed(3)} → ${T2.toFixed(3)}, <i>W</i> = ${fmtSigned(gas.ledger.Wpiston, 1)}, <i>Q</i> = ${fmtSigned(gas.ledger.Q, 1)}. `) +
        tr('真空に向かって膨張するときピストンや壁は動かないので仕事は 0、断熱なので熱も 0、よって Δ<i>U</i> = 0（理想気体なら <i>T</i> も不変）。P–V 図の灰色の線は始めと終わりを結んだだけで、途中は平衡状態ではないため P–V 図上に「経路」は描けない。', 'When the gas expands into a vacuum, no piston or wall moves, so the work is 0; the walls are adiabatic, so the heat is also 0; hence Δ<i>U</i> = 0 (for an ideal gas, <i>T</i> is unchanged too). The gray line on the P–V diagram merely connects the start and the end: the states in between are not equilibrium states, so no "path" can be drawn on the P–V diagram.');
      $('result').hidden = false;
      fe.stage = 'done';
    }
    const s = gas.stats();
    const V = Vsys();
    $('r-V').textContent = fmt(V, 0);
    $('r-T').textContent = fmt(s.T, 3);
    $('r-P').textContent = fmt(s.U / V, 4);
    $('r-U').textContent = fmt(s.U, 1);
    $('r-u').textContent = fmt(Math.abs(gas.piston.u), 2);
    // 温位：基準圧力 P₀（はじめの圧力）まで準静的・断熱に変えたときの温度。2次元では k/c_P = 1/2
    $('r-th').textContent = fmt(s.T * Math.sqrt(refState.P0 / (s.U / V)), 3);
    updateLedger('l-', s);
    plotT.push(gas.time, { T: s.T });
    if (frame % 2 === 0) { updatePV(); plotT.draw(); }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
