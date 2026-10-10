// 05-extensive.js ― sims/05-extensive.html と en/sims/05-extensive.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { $, fmt, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, T0 = 1.0, TAU = 80;
let gas, view, simRate = 0.1, mode = 'split', ptype = DIATHERMAL;
let avg = null, ref = null, joinStage = 0, wholeAvg = null, lastT = 0;

// ---------- 時間平均 ----------
function newAvg() { return { w: 0, N: new Float64Array(4), U: new Float64Array(4), K: new Float64Array(4) }; }
function accumulate(A, dt) {
  const dec = Math.exp(-dt / TAU);
  A.w = A.w * dec + dt;
  const n = new Float64Array(4), u = new Float64Array(4);
  for (let i = 0; i < gas.N; i++) { n[gas.region[i]]++; u[gas.region[i]] += 0.5 * (gas.vx[i] ** 2 + gas.vy[i] ** 2); }
  for (let g = 0; g < 4; g++) {
    A.N[g] = A.N[g] * dec + n[g] * dt;
    A.U[g] = A.U[g] * dec + u[g] * dt;
    A.K[g] = A.K[g] * dec + (n[g] ? u[g] / n[g] : 0) * dt;
  }
}
function readAvg(g) {
  const A = avg, R = gas.regionRect(g);
  return { N: A.N[g] / A.w, V: (R.x1 - R.x0) * (R.y1 - R.y0), U: A.U[g] / A.w, T: A.K[g] / A.w, P: gas.P.reg[g] };
}
function readWhole() {
  const A = wholeAvg;
  return { N: gas.N, V: gas.X * H, U: A.U[0] / A.w, T: A.K[0] / A.w, P: gas.P.all };
}
function resetAverages() { avg = newAvg(); gas.resetPressure(); }

// ---------- 準備 ----------
function build() {
  joinStage = 0;
  if (mode === 'split') {
    gas = new Gas({ H, X: 100, Xmin: 100, Xmax: 100, seed: (Math.random() * 1e9) | 0, pTau: TAU });
    gas.addParticles(400, T0, { x0: 0, x1: 100, y0: 0, y1: H });
    $('c-v').checked = false; $('c-h').checked = false;
  } else {
    gas = new Gas({ H, X: 50, Xmin: 50, Xmax: 100, seed: (Math.random() * 1e9) | 0, pTau: TAU });
    gas.piston.target = 50;
    gas.addParticles(200, T0, { x0: 0, x1: 50, y0: 0, y1: H });
    $('btn-copy').disabled = false; $('btn-remove').disabled = true;
  }
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { pistonRod: false, Tref: T0, drawScale: 2.8, regionLabels: true });
  resetAverages(); wholeAvg = newAvg(); ref = null; lastT = gas.time;
  $('lg-species').hidden = mode === 'split';
  hint();
}

function hint() {
  const t = mode === 'split'
    ? (gas.vpart || gas.hpart ? tr('— 壁を挿入して部分系に分けた（複合系）', '— Walls inserted to divide into subsystems (composite system)') : tr('— 一つの単純系', '— A single simple system'))
    : [tr('— 元の系', '— The original system'), tr('— 元の系とコピーを断熱壁で仕切って並べた', '— The original and the copy side by side, separated by an adiabatic wall'), tr('— くっつけて一つの系にした', '— Joined into one system')][joinStage];
  $('mode-hint').textContent = t;
}

// 仕切る前の全体を基準として記録
function snapshotWhole(label) {
  const w = wholeAvg.w > 0 ? readWhole() : { N: gas.N, V: gas.X * H, U: gas.kinetic(), T: gas.kinetic() / gas.N, P: gas.P.all };
  ref = Object.assign({ label }, w);
}

function applySplit() {
  if (mode !== 'split') return;
  const wasWhole = !gas.vpart && !gas.hpart;
  const v = $('c-v').checked, h = $('c-h').checked;
  if (wasWhole && (v || h)) snapshotWhole(tr('仕切る前の全体', 'Whole before partitioning'));
  gas.setVPartition(v ? +$('xv').value : null, ptype);
  gas.setHPartition(h ? +$('yh').value : null, ptype);
  if (!v && !h) ref = null;
  resetAverages();
  hint();
}

segmented('mode', (v) => {
  mode = v;
  $('ctl-split').hidden = v !== 'split'; $('ctl-join').hidden = v !== 'join';
  build();
}, false);
segmented('ptype', (v) => { ptype = v === 'adiabatic' ? ADIABATIC : DIATHERMAL; if (gas) applySplit(); }, false);
bindCheck('c-v', () => gas && applySplit(), false);
bindCheck('c-h', () => gas && applySplit(), false);
bindRange('xv', () => { if (gas && $('c-v').checked) applySplit(); }, (v) => v.toFixed(0), false);
bindRange('yh', () => { if (gas && $('c-h').checked) applySplit(); }, (v) => v.toFixed(0), false);
$('xv-val').textContent = $('xv').value; $('yh-val').textContent = $('yh').value;
bindSpeed('speed', (v) => { simRate = v; });
$('btn-reset').addEventListener('click', build);

$('btn-copy').addEventListener('click', () => {
  snapshotWhole(tr('元の系（くっつける前）', 'Original system (before joining)'));
  const n = gas.N;
  gas.X = 100; gas.piston.target = 100; gas.Xmin = 100;
  for (let i = 0; i < n; i++) {
    const j = gas.N++;
    // コピー：位置を右へずらし、速度は上下反転（同じ状態だが同じ動きにならないように）
    gas.x[j] = gas.px[j] = gas.x[i] + 50; gas.y[j] = gas.py[j] = H - gas.y[i];
    gas.vx[j] = gas.vx[i]; gas.vy[j] = -gas.vy[i];
    gas.species[j] = 1;
  }
  gas.setVPartition(50, ADIABATIC);
  gas.resetLedger();
  resetAverages(); wholeAvg = newAvg();
  joinStage = 1; hint();
  $('btn-copy').disabled = true; $('btn-remove').disabled = false;
});
$('btn-remove').addEventListener('click', () => {
  gas.setVPartition(null);
  resetAverages();
  joinStage = 2; hint();
  $('btn-remove').disabled = true;
});

build();

// ---------- 表 ----------
const NAMES_SPLIT = [tr('部分系1', 'Subsystem 1'), tr('部分系2', 'Subsystem 2'), tr('部分系3', 'Subsystem 3'), tr('部分系4', 'Subsystem 4')];
function row(label, d, cls = '', dig = { N: 1, V: 0, U: 1, T: 3, P: 4 }) {
  return `<tr class="${cls}"><td>${label}</td>` +
    `<td class="ext">${typeof d.N === 'string' ? d.N : fmt(d.N, dig.N)}</td>` +
    `<td class="ext">${typeof d.V === 'string' ? d.V : fmt(d.V, dig.V)}</td>` +
    `<td class="ext">${typeof d.U === 'string' ? d.U : fmt(d.U, dig.U)}</td>` +
    `<td class="int">${typeof d.T === 'string' ? d.T : fmt(d.T, dig.T)}</td>` +
    `<td class="int">${typeof d.P === 'string' ? d.P : fmt(d.P, dig.P)}</td></tr>`;
}
function ratioRow(label, a, b) {
  const r = (k) => (Number.isFinite(a[k] / b[k]) ? '×' + (a[k] / b[k]).toFixed(2) : '–');
  return `<tr class="whole"><td>${label}</td><td class="ext">${r('N')}</td><td class="ext">${r('V')}</td><td class="ext">${r('U')}</td><td class="int">${r('T')}</td><td class="int">${r('P')}</td></tr>`;
}

function renderTable() {
  const regs = gas.activeRegions();
  const names = mode === 'split' ? NAMES_SPLIT : (joinStage === 1 ? [tr('元の系', 'Original system'), tr('コピー', 'Copy')] : [joinStage === 2 ? tr('くっつけた系', 'Joined system') : tr('元の系', 'Original system')]);
  let html = '';
  const vals = regs.map((g) => readAvg(g));
  regs.forEach((g, k) => { html += row(names[mode === 'split' ? g : k], vals[k]); });
  if (regs.length > 1) {
    const sum = { N: 0, V: 0, U: 0, T: 0, P: 0 };
    for (const v of vals) for (const k in sum) sum[k] += v[k];
    html += row(tr('合計（足し算）', 'Sum (added up)'), { N: sum.N, V: sum.V, U: sum.U, T: fmt(sum.T, 3) + ' ?', P: fmt(sum.P, 4) + ' ?' }, 'sum');
  }
  if (ref) {
    html += row(ref.label, ref, 'whole');
    const target = vals[0];
    const lbl = mode === 'split' ? `${names[regs[0]]} ÷ ${ref.label}` : `${names[0]} ÷ ${ref.label}`;
    html += ratioRow(lbl, target, ref);
  }
  $('tbody').innerHTML = html;
}

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    gas.measure();
    const dt = gas.time - lastT; lastT = gas.time;
    accumulate(avg, dt);
    // 全体（仕切りを無視）の平均も並行してとる
    {
      const dec = Math.exp(-dt / TAU), U = gas.kinetic();
      wholeAvg.w = wholeAvg.w * dec + dt;
      wholeAvg.U[0] = wholeAvg.U[0] * dec + U * dt;
      wholeAvg.K[0] = wholeAvg.K[0] * dec + (U / gas.N) * dt;
    }
    if (++frame % 6 === 0) renderTable();
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
