// 12-partitions.js ― sims/12-partitions.html と en/sims/12-partitions.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL, SEMIPERMEABLE } from '../engine.js';
import { idealGasS } from '../entropy.js';
import { SimView } from '../render.js';
import { TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X = 100, XP = 50;
// 仕切りの種類：壁の性質と、許すやりとり（U：エネルギー、V：体積、N：粒子）
const MODES = {
  adi: { type: ADIABATIC, mov: false, allow: {} },
  dia: { type: DIATHERMAL, mov: false, allow: { U: true } },
  mov: { type: DIATHERMAL, mov: true, allow: { U: true, V: true } },
  perm: { type: SEMIPERMEABLE, mov: false, allow: { U: true, N: true } },
  movadi: { type: ADIABATIC, mov: true, allow: { V: true } },
};
const HINT = {
  adi: tr('断熱・固定：エネルギーも体積も粒子もやりとりできない。', 'Adiabatic, fixed: no energy, volume or particles can be exchanged.'),
  dia: tr('透熱・固定：壁を通してエネルギー（熱）だけが移る。', 'Diathermal, fixed: only energy (heat) moves through the wall.'),
  mov: tr('透熱・可動：熱が移り、壁が動いて体積もやりとりする。', 'Diathermal, movable: heat moves, and the wall moves so volume is exchanged too.'),
  perm: tr('粒子を通す：粒子が行き来し、粒子と一緒にエネルギーも移る。', 'Lets particles through: particles move back and forth, carrying energy with them.'),
  movadi: tr('断熱・可動（参考）：熱は通さないが、壁が動いて体積をやりとりする。', 'Adiabatic, movable (extra): no heat passes, but the wall moves and volume is exchanged.'),
};
let gas, view, simRate = 0.1, frame = 0, mode = 'adi', S0 = 0, sm = null;

const plotD = new TimePlot($('plotD'), { height: 180, ylabel: tr('左右の差（相対）', 'left − right (relative)'), yZero: true, window: 1500,
  series: [{ key: 'T', label: tr('温度 (T₁−T₂)/T̄', 'temperature (T₁−T₂)/T̄'), color: '#d6453d' }, { key: 'P', label: tr('圧力 (P₁−P₂)/P̄', 'pressure (P₁−P₂)/P̄'), color: SERIES[0] }, { key: 'n', label: tr('数密度 (n₁−n₂)/n̄', 'number density (n₁−n₂)/n̄'), color: SERIES[2], dash: [6, 4] }] });
const plotS = new TimePlot($('plotS'), { height: 170, ylabel: tr('ΔS（k 単位）', 'ΔS (units of k)'), yZero: true, window: 1500,
  series: [{ key: 'S', label: tr('全体の ΔS（気体＋壁）', 'total ΔS (gas + wall)'), color: SERIES[3] }] });

function sides() {
  const a = gas.regionStats(0), b = gas.regionStats(gas.vpart ? 1 : 0);
  return [a, b];
}
function totalS() {
  const [a, b] = sides();
  return idealGasS(a.N, a.V, a.T) + idealGasS(b.N, b.V, b.T) + gas.vpart.Cw * Math.log(gas.vpart.Tw);
}

function build() {
  const T1 = +$('T1in').value, T2 = +$('T2in').value, N1 = +$('N1in').value, N2 = +$('N2in').value;
  gas = new Gas({ H, X, Xmin: X, Xmax: X, seed: (Math.random() * 1e9) | 0 });
  gas.setVPartition(XP, ADIABATIC);
  gas.addParticles(N1, T1, { x0: 0, x1: XP, y0: 0, y1: H }, 0);
  gas.addParticles(N2, T2, { x0: XP, x1: X, y0: 0, y1: H }, 1);
  Object.assign(gas.vpart, { Tw: (N1 * T1 + N2 * T2) / (N1 + N2), Cw: 20, M: 30, u: 0, movable: false });
  gas.resetLedger();
  S0 = totalS(); sm = null;
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { pistonRod: false, Tref: 1, drawScale: 2.8 });
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  view.opt.showHeat = $('c-heat').checked;
  partSeg?.select('adi', false); setMode('adi');
  plotD.reset(); plotS.reset();
}

function setMode(v) {
  mode = v;
  const m = MODES[v];
  if (!m.mov) gas.vpart.u = 0;            // 固定する（外から押さえる）
  gas.vpart.movable = m.mov;
  gas.setVPartition(gas.vpart.x, m.type);
  if (v === 'perm') gas.vpart.pass = -1;   // すべての粒子を通す
  $('part-hint').textContent = HINT[v];
  $('mode-hint').textContent = '— ' + HINT[v].split(tr('：', ':'))[0];
  for (const k of ['U', 'V', 'N']) $('a-' + k).textContent = m.allow[k] ? tr('許す', 'allowed') : tr('禁止（拘束）', 'forbidden (constraint)');
}

const partSeg = segmented('part', setMode, false);
for (const id of ['T1in', 'T2in']) bindRange(id, () => {}, (v) => v.toFixed(1));
for (const id of ['N1in', 'N2in']) bindRange(id, () => {}, (v) => v.toFixed(0));
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; $('lg-species').hidden = on; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
$('btn-reset').addEventListener('click', build);
build();

/** 係数の状態：許されていて 0 に近い／0 へ向かう／拘束で 0 でなくてよい */
function status(allowed, rel) {
  if (!allowed) return tr('拘束されている', 'constrained');
  return Math.abs(rel) < 0.1 ? tr('≈ 0（ゆらぎの範囲でそろった）', '≈ 0 (equal within fluctuations)') : tr('0 へ向かう', 'heading to 0');
}

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    frame++;
    const [a, b] = sides();
    const k = 0.03;
    const cur = { T1: a.T, T2: b.T, n1: a.N / a.V, n2: b.N / b.V };
    if (!sm) sm = { ...cur }; else for (const key in cur) sm[key] += k * (cur[key] - sm[key]);
    const P1 = sm.n1 * sm.T1, P2 = sm.n2 * sm.T2;
    $('N1').textContent = a.N; $('N2').textContent = b.N;
    $('V1').textContent = fmt(a.V, 0); $('V2').textContent = fmt(b.V, 0);
    $('n1').textContent = fmt(sm.n1, 4); $('n2').textContent = fmt(sm.n2, 4);
    $('T1').textContent = fmt(sm.T1, 3); $('T2').textContent = fmt(sm.T2, 3);
    $('P1').textContent = fmt(P1, 4); $('P2').textContent = fmt(P2, 4);
    const cU = 1 / sm.T1 - 1 / sm.T2, cV = P1 / sm.T1 - P2 / sm.T2, cN = -(Math.log(sm.n1 / sm.T1) - Math.log(sm.n2 / sm.T2));   // dN₁ の係数 −(μ₁/T₁ − μ₂/T₂)
    $('c-U').textContent = fmtSigned(cU, 3); $('c-V').textContent = fmtSigned(cV, 4); $('c-N').textContent = fmtSigned(cN, 3);
    const al = MODES[mode].allow;
    $('s-U').textContent = status(al.U, cU / ((1 / sm.T1 + 1 / sm.T2) / 2));
    $('s-V').textContent = status(al.V, cV / ((sm.n1 + sm.n2) / 2));
    $('s-N').textContent = status(al.N, cN);
    const rel = (x, y) => (2 * (x - y)) / (x + y);
    plotD.push(gas.time, { T: rel(sm.T1, sm.T2), P: rel(P1, P2), n: rel(sm.n1, sm.n2) });
    plotS.push(gas.time, { S: totalS() - S0 });
    if (frame % 2 === 0) { plotD.draw(); plotS.draw(); }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
