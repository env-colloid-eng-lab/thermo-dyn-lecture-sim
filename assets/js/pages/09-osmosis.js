// 09-osmosis.js ― sims/09-osmosis.html と en/sims/09-osmosis.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL, SEMIPERMEABLE } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, bindRange, bindCheck, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, XM = 50, X0 = 100, NW = 240;   // NW：溶媒の粒子数（左右の合計）
let gas, view, simRate = 0.1, frame = 0, ns = 80, T = 1, Pext = 0.09;
let sm = null;          // 表示用にならした値
const rows = [];

const plotN = new TimePlot($('plotN'), { height: 170, ylabel: tr('溶媒の粒子数', 'Solvent particles'), yZero: false, window: 1500,
  series: [{ key: 'L', label: tr('左（純粋な溶媒）', 'Left (pure solvent)'), color: SERIES[0] }, { key: 'R', label: tr('右（溶液）', 'Right (solution)'), color: SERIES[1] }] });
const plotP = new TimePlot($('plotP'), { height: 170, ylabel: tr('圧力 P', 'Pressure P'), yZero: true, window: 1500,
  series: [{ key: 'PL', label: tr('P左', 'P_L'), color: SERIES[0] }, { key: 'PR', label: tr('P右', 'P_R'), color: SERIES[1] }, { key: 'Pi', label: tr('Π = P右 − P左', 'Π = P_R − P_L'), color: SERIES[3] }] });
const plotV = new XYPlot($('plotV'), { height: 240, xmin: 0, xmax: 0.12, ymin: 0, ymax: 0.13, xlabel: 'nkT/V', ylabel: 'Π', xd: 3, yd: 3 });
plotV.refs = [{ label: tr('ファントホッフ Π = nkT/V', "van 't Hoff Π = nkT/V"), color: '#77756f', dash: [6, 4], fn: (x) => x }];

function build() {
  // 粒子を小さめ（r = 0.15）にして、理想的なうすい溶液に近づける
  gas = new Gas({ H, X: X0, Xmin: XM + 8, Xmax: 175, r: 0.15, seed: (Math.random() * 1e9) | 0 });
  gas.setVPartition(XM, ADIABATIC);   // はじめは何も通さない仕切り
  // 左右の体積は等しいので、粒子の総数を等しくすれば圧力も等しい
  const a = (NW + ns) / 2, b = (NW - ns) / 2;
  gas.addParticles(a, T, { x0: 0, x1: XM, y0: 0, y1: H }, 0);
  gas.addParticles(b, T, { x0: XM, x1: X0, y0: 0, y1: H }, 0);
  if (ns > 0) gas.addParticles(ns, T, { x0: XM, x1: X0, y0: 0, y1: H }, 1);
  gas.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  gas.bath = { left: true, top: true, bottom: true };
  gas.Tbath = T;
  gas.pTau = 200;
  gas.piston.target = X0;
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { envPad: 5, Tref: 1, drawScale: 5.6 });
  view.opt.showHeat = $('c-heat').checked;
  gas.tracerOn = $('c-trace').checked;
  sm = null;
  plotN.reset(); plotP.reset();
  $('btn-semi').disabled = false;
  $('state-hint').textContent = tr('— いまの仕切りは何も通さない壁', '— the partition currently lets nothing through');
}

/** いまの気体にある溶質の数（スライダーの値ではなく、実際の粒子から数える） */
function soluteCount() { let n = 0; for (let i = 0; i < gas.N; i++) if (gas.species[i] === 1) n++; return n; }

function stateLabel() {
  if (gas.vpart.type !== SEMIPERMEABLE) return tr('仕切り', 'Partition');
  // 押す圧力が溶液側の圧力より大きいか小さいかで流れの向きが変わるので、ここでは条件だけを書く
  return gas.piston.mode === 'force' ? tr(`外圧 P=${fmt(gas.piston.Pext, 3)}`, `External pressure P=${fmt(gas.piston.Pext, 3)}`) : tr('浸透（固定）', 'Osmosis (fixed)');
}

function drawRows() {
  const tb = $('tbl').querySelector('tbody');
  tb.innerHTML = rows.map((r, k) => `<tr><td>${k + 1}</td><td style="text-align:left">${r.state}</td><td>${r.n}</td><td>${fmt(r.T, 2)}</td><td>${fmt(r.V, 0)}</td><td>${fmt(r.th, 4)}</td><td>${fmt(r.Pi, 4)}</td><td>${fmt(r.Pm, 4)}</td><td>${fmt(r.Pi / r.th, 2)}</td></tr>`).join('');
  $('tbl-empty').hidden = rows.length > 0;
  const ok = rows.filter((r) => r.n > 0);
  plotV.paths = ok.map((r, k) => ({ label: k === 0 ? tr('測定：圧力差 P右 − P左', 'Measured: pressure difference P_R − P_L') : '', color: SERIES[1], pts: [[r.th, r.Pi]], ends: true }))
    .concat(ok.filter((r) => Number.isFinite(r.Pm)).map((r, k) => ({ label: k === 0 ? tr('測定：膜が受ける圧力', 'Measured: pressure on the membrane') : '', color: SERIES[0], pts: [[r.th, r.Pm]], ends: true })));
  plotV.draw();
}

bindRange('ns', (v) => { ns = v; }, (v) => v.toFixed(0), false);
bindRange('T', (v) => { T = v; }, (v) => v.toFixed(1), false);
bindRange('Pext', (v) => { Pext = v; if (gas && gas.piston.mode === 'force') gas.piston.Pext = v; }, (v) => v.toFixed(3), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
bindCheck('c-trace', (on) => { if (gas) { gas.tracerOn = on; gas.tracer = []; } });
$('btn-reset').addEventListener('click', build);
$('btn-semi').addEventListener('click', () => {
  gas.setVPartition(XM, SEMIPERMEABLE);
  $('btn-semi').disabled = true;
  $('state-hint').textContent = tr('— 半透膜：溶媒（青）だけが通り抜ける', '— semipermeable membrane: only the solvent (blue) passes through');
});
$('btn-push').addEventListener('click', () => { Object.assign(gas.piston, { mode: 'force', Pext, u: 0 }); });
$('btn-fix').addEventListener('click', () => { gas.piston.mode = 'position'; gas.piston.u = 0; gas.piston.target = gas.X; });
$('btn-rec').addEventListener('click', () => {
  if (!sm) return;
  const n = soluteCount();
  rows.push({ state: stateLabel(), n, T: sm.TR, V: sm.V, th: (n * sm.TR) / sm.V, Pi: gas.P.piston - gas.P.left, Pm: gas.vpart.type === SEMIPERMEABLE ? gas.P.vpart : NaN });
  drawRows();
});
$('btn-clear').addEventListener('click', () => { rows.length = 0; drawRows(); });
build();
drawRows();

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    gas.measure();
    frame++;
    let nL = 0;
    for (let i = 0; i < gas.N; i++) if (gas.species[i] === 0 && gas.x[i] < XM) nL++;
    const V = (gas.X - XM) * H, TR = gas.regionStats(1).T;
    // 表示用に時間平均（圧力と同じくらいの時間）
    const k = Math.min(1, simRate / gas.pTau);
    if (!sm) sm = { nL, V, TR };
    sm.nL += k * 4 * (nL - sm.nL); sm.V += k * (V - sm.V); sm.TR += k * (TR - sm.TR);
    const PL = gas.P.left, PR = gas.P.piston, Pi = PR - PL;
    const n = soluteCount(), semi = gas.vpart.type === SEMIPERMEABLE;
    $('r-nL').textContent = nL; $('r-nR').textContent = NW - nL; $('r-ns').textContent = n;
    $('r-V').textContent = fmt(V, 0);
    $('r-PL').textContent = fmt(PL, 4); $('r-PR').textContent = fmt(PR, 4);
    $('r-Pi').textContent = fmt(Pi, 4); $('r-Pm').textContent = semi ? fmt(gas.P.vpart, 4) : '–';   // 半透膜になるまでは膜の圧力ではない
    $('r-th').textContent = fmt((n * sm.TR) / sm.V, 4);
    plotN.push(gas.time, { L: sm.nL, R: NW - sm.nL });
    plotP.push(gas.time, { PL, PR, Pi });
    if (frame % 2 === 0) { plotN.draw(); plotP.draw(); }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
