// 08-heat-engines.js ― sims/08-heat-engines.html と en/sims/08-heat-engines.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas } from '../engine.js';
import { CycleRunner, cycleDef } from '../cycles.js';
import { SimView } from '../render.js';
import { XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, N = 200, X1 = 30, R = 2, XMAX = 155;
let gas, view, run, simRate = 0.1, frame = 0;
let type = 'carnot', dir = 'engine', Th = 2, Tc = 1, pspeed = 0.06;
let cur = [], prev = null, curTS = [], prevTS = null, Tsm = null;   // P–V 図の軌跡（いまのサイクル・直前のサイクル）
let thSlider, tcSlider;

const pv = new XYPlot($('pv'), { height: 320, xmin: 0, xmax: XMAX * H, ymin: 0, ymax: 1, xlabel: tr('V（面積）', 'V (area)'), ylabel: 'P', xd: 0, yd: 4 });

/** 理論のサイクル（準静的）を P–V 図の点列にする */
function theoryPts() {
  const { states: S, kinds: K } = cycleDef(type, { Th, Tc, X1, r: R });
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const a = S[k], b = S[(k + 1) % 4], Va = a.X * H, Vb = b.X * H;
    for (let j = 0; j <= 40; j++) {
      const V = Va + ((Vb - Va) * j) / 40;
      let P;
      if (K[k] === 'iso') P = (N * a.T) / V;
      else if (K[k] === 'adi') P = ((N * a.T) / Va) * (Va / V) ** 2;    // P V² = 一定
      else P = (N * (a.T + ((b.T - a.T) * j) / 40)) / Va;              // 定積
      pts.push([V, P]);
    }
  }
  return pts;
}

const ts = new XYPlot($('ts'), { height: 300, xmin: -1, xmax: 1, ymin: 0, ymax: 1, xlabel: tr('S − S_A （k 単位）', 'S − S_A (units of k)'), ylabel: 'T', xd: 1, yd: 3 });
/** 2次元理想気体のエントロピー（状態 A を 0 とする, k = 1）/ entropy of the 2D ideal gas (0 at state A) */
const Sgas = (V, T) => N * Math.log((V * T) / (X1 * H * Th));

/** 理論のサイクル（準静的）を T–S 図の点列にする / the quasi-static cycle as points on the T–S diagram */
function theoryTS() {
  const { states: S, kinds: K } = cycleDef(type, { Th, Tc, X1, r: R });
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const a = S[k], b = S[(k + 1) % 4], Va = a.X * H, Vb = b.X * H;
    for (let j = 0; j <= 40; j++) {
      let V = Va + ((Vb - Va) * j) / 40, T;
      if (K[k] === 'iso') T = a.T;
      else if (K[k] === 'adi') T = (a.T * Va) / V;           // T V = 一定 / const
      else { V = Va; T = a.T + ((b.T - a.T) * j) / 40; }
      pts.push([Sgas(V, T), T]);
    }
  }
  return pts;
}

function build() {
  gas = new Gas({ H, X: X1, Xmin: 15, Xmax: XMAX, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(N, Th, { x0: 0, x1: X1, y0: 0, y1: H });
  run = new CycleRunner(gas, { type, dir, Th, Tc, X1, r: R, speed: pspeed });
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { envPad: 5, Tref: 1.5, drawScale: 2.8 });
  view.opt.showHeat = $('c-heat').checked;
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  cur = []; prev = null; curTS = []; prevTS = null; Tsm = null;
  const tp = theoryTS(), sx = tp.map((p) => p[0]);
  const smin = Math.min(...sx), smax = Math.max(...sx), pad = 0.18 * (smax - smin);
  Object.assign(ts.opt, { xmin: smin - pad, xmax: smax + pad, ymin: 0, ymax: Th * 1.3 });
  ts.refs = [
    { label: tr(`高温熱源 T = ${fmt(Th, 1)}`, `Hot reservoir T = ${fmt(Th, 1)}`), color: '#d6453d', dash: [3, 4], fn: () => Th },
    { label: tr(`低温熱源 T = ${fmt(Tc, 1)}`, `Cold reservoir T = ${fmt(Tc, 1)}`), color: SERIES[0], dash: [3, 4], fn: () => Tc },
  ];
  $('ts-area').textContent = ''; $('r-sgen').textContent = '–';
  const eng = dir === 'engine';
  $('mode-hint').textContent = tr(`— ${type === 'carnot' ? 'カルノー' : 'スターリング'}サイクルを${eng ? '熱機関' : 'ヒートポンプ'}の向きに自動で回す`, `— running the ${type === 'carnot' ? 'Carnot' : 'Stirling'} cycle automatically in the ${eng ? 'heat-engine' : 'heat-pump'} direction`);
  $('k-main').textContent = eng ? tr('効率 η（測定）', 'Efficiency η (measured)') : tr('成績係数 COP（測定）', 'COP (measured)');
  $('k-th').textContent = eng ? tr('理論の η（準静的）', 'Theoretical η (quasi-static)') : tr('理論の COP（準静的）', 'Theoretical COP (quasi-static)');
  $('k-regen').textContent = tr('再生器ありなら（測定）', 'With regenerator (measured)');
  $('k-carnot').textContent = tr('カルノーの上限', 'Carnot limit');
  $('st-regen').hidden = type !== 'stirling';
  $('r-th').textContent = fmt(run.theory.main, 3);
  $('r-carnot').textContent = fmt(run.theory.carnot, 3);
  $('r-main').textContent = '–'; $('r-regen').textContent = '–'; $('r-n').textContent = '0';
  for (const id of ['f-Qh', 'f-Qc', 'f-W']) $(id).textContent = '–';
  $('pv-area').textContent = '';
  showWarn(null);
  for (const id of ['f-Qh-t', 'f-Qc-t', 'f-W-t']) $(id).textContent = '';
  $('flow-hint').textContent = tr('1サイクル回ると表示されます', 'Shown after one cycle is complete');
  $('f-Th').textContent = fmt(Th, 1); $('f-Tc').textContent = fmt(Tc, 1);
  pv.opt.ymax = ((N * Th) / (X1 * H)) * 1.15;
  pv.refs = [
    { label: tr(`等温線 T = ${fmt(Th, 1)}`, `Isotherm T = ${fmt(Th, 1)}`), color: '#d6453d', dash: [3, 4], fn: (V) => (N * Th) / V },
    { label: tr(`等温線 T = ${fmt(Tc, 1)}`, `Isotherm T = ${fmt(Tc, 1)}`), color: SERIES[0], dash: [3, 4], fn: (V) => (N * Tc) / V },
  ];
  drawTable(null);
}

function drawTable(c) {
  const tb = $('tbl').querySelector('tbody');
  $('tbl-empty').hidden = !!c;
  if (!c) { tb.innerHTML = ''; return; }
  const bath = (T) => (T == null ? tr('―', '–') : T === Th ? tr(`高温 ${fmt(Th, 1)}`, `Hot ${fmt(Th, 1)}`) : tr(`低温 ${fmt(Tc, 1)}`, `Cold ${fmt(Tc, 1)}`));
  let sQ = 0, sW = 0, sU = 0, sS = 0;
  tb.innerHTML = c.steps.map((s) => {
    sQ += s.Q; sW += s.W; sU += s.dU;
    const dSb = s.bathT == null ? 0 : -s.Q / s.bathT;   // 熱源のエントロピー変化
    sS += dSb;
    return tr(`<tr><td>${s.label}</td><td>${bath(s.bathT)}</td><td>${fmtSigned(s.Q, 1)}</td><td>${fmtSigned(s.W, 1)}</td><td>${fmtSigned(s.dU, 1)}</td><td>${s.bathT == null ? '―' : fmtSigned(dSb, 1)}</td></tr>`, `<tr><td>${s.label}</td><td>${bath(s.bathT)}</td><td>${fmtSigned(s.Q, 1)}</td><td>${fmtSigned(s.W, 1)}</td><td>${fmtSigned(s.dU, 1)}</td><td>${s.bathT == null ? '–' : fmtSigned(dSb, 1)}</td></tr>`);
  }).join('') + tr(`<tr class="sum"><td>1サイクルの合計</td><td></td><td>${fmtSigned(sQ, 1)}</td><td>${fmtSigned(sW, 1)}</td><td>${fmtSigned(sU, 1)}</td><td>${fmtSigned(sS, 1)}</td></tr>`, `<tr class="sum"><td>Total for one cycle</td><td></td><td>${fmtSigned(sQ, 1)}</td><td>${fmtSigned(sW, 1)}</td><td>${fmtSigned(sU, 1)}</td><td>${fmtSigned(sS, 1)}</td></tr>`);
}

/** 閉じた曲線が囲む面積（時計回りを正）＝ ∮P dV */
function loopArea(pts) {
  let a = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length];
    a += (x1 - x0) * (y0 + y1) / 2;
  }
  return a;
}

/** 再生器なしの逆スターリングは、条件によって低温側から熱をくみ上げられない */
function showWarn(T) {
  const el = $('r-warn');
  const theoryBad = type === 'stirling' && dir === 'pump' && Tc * Math.log(R) < Th - Tc;
  const measBad = dir === 'pump' && T && T.n > 0 && T.Qc < 0;
  el.hidden = !(theoryBad || measBad);
  if (el.hidden) return;
  el.innerHTML = tr('<b>注意</b>　再生器なしのこの運転では、低温側から正味に熱をくみ上げていません（低温熱源も気体から熱を受け取っている）。', '<b>Note</b> In this operation without a regenerator, no net heat is being pumped out of the cold side (the cold reservoir also receives heat from the gas). ') +
    tr('外からした仕事が両方の熱源へ熱として捨てられているだけなので、ヒートポンプとしては働いていません（COP &lt; 1）。', 'The work done from outside is simply dumped as heat into both reservoirs, so the device is not working as a heat pump (COP &lt; 1). ') +
    (type === 'stirling' ? tr('「再生器ありなら」の値と比べてみよう。', 'Compare with the "With regenerator" value.') : '');
}

function setArrow(id, active, q) {
  const el = $(id);
  el.classList.toggle('idle', !active);
  el.classList.toggle('rev', id === 'a-h' ? q < 0 : q > 0);   // 矢印の向き＝熱の流れる向き
}

function restartWith(fn) { return (v) => { fn(v); build(); }; }
segmented('type', restartWith((v) => { type = v; }), false);
segmented('dir', restartWith((v) => { dir = v; }), false);
segmented('pspeed', restartWith((v) => { pspeed = parseFloat(v); }), false);
// カルノーの断熱膨張でピストンが端を超えないよう Th/Tc ≤ 2.5 に保つ
thSlider = bindRange('Th', (v) => { Th = v; if (Th / Tc > 2.5) { Tc = Math.ceil((Th / 2.5) * 10) / 10; tcSlider?.set(Tc); } if (gas) build(); }, (v) => v.toFixed(1), false);
tcSlider = bindRange('Tc', (v) => { Tc = v; if (Th / Tc > 2.5) { Th = Math.floor(Tc * 2.5 * 10) / 10; thSlider.set(Th); } if (gas) build(); }, (v) => v.toFixed(1), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
$('btn-reset').addEventListener('click', build);
build();

const loop = new Loop((paused) => {
  if (!paused) {
    gas.advance(simRate);
    const nBefore = run.cycles.length;
    run.update();
    frame++;
    const U = gas.kinetic(), V = gas.X * H;
    // T–S 図の温度は少しならす（粒子数が少ないと N ln T のゆらぎが大きく見えるため）/ smooth T a little for the T–S plot
    Tsm = Tsm == null ? U / N : Tsm + (1 - Math.exp(-simRate / 40)) * (U / N - Tsm);   // 時定数 40 / time constant 40
    if (run.k >= 0) { cur.push([V, U / V]); curTS.push([Sgas(V, Tsm), Tsm]); }
    // 点が多くなったら1つおきに間引く（1サイクル全体を残すので、面積が正しく求まる）
    if (cur.length > 3000) { cur = cur.filter((_, k) => k % 2 === 0); curTS = curTS.filter((_, k) => k % 2 === 0); }
    if (run.cycles.length > nBefore) {
      const c = run.cycles[run.cycles.length - 1];
      prev = cur; cur = [[V, U / V]];
      prevTS = curTS; curTS = [[Sgas(V, Tsm), Tsm]];
      const cQ = c.steps.reduce((a, s) => a + s.Q, 0);
      drawTable(c);
      const T = run.total, eng = dir === 'engine';
      $('r-main').textContent = fmt(eng ? -T.W / T.Qh : -T.Qh / T.W, 3);
      $('r-regen').textContent = fmt(eng ? -T.W / T.Qiso_h : -T.Qiso_h / T.W, 3);
      $('r-n').textContent = T.n;
      $('f-Qh').textContent = fmtSigned(T.Qh, 0);
      $('f-Qc').textContent = fmtSigned(T.Qc, 0);
      $('f-W').textContent = fmtSigned(-T.W, 0);
      $('f-Qh-t').textContent = T.Qh >= 0 ? tr('気体へ渡した熱', 'heat given to the gas') : tr('気体から受け取った熱', 'heat received from the gas');
      $('f-Qc-t').textContent = T.Qc >= 0 ? tr('気体へ渡した熱', 'heat given to the gas') : tr('気体から受け取った熱', 'heat received from the gas');
      $('f-W-t').textContent = -T.W >= 0 ? tr('外へした仕事 −W', 'work done on the surroundings −W') : tr('外からされた仕事 W', 'work done on the gas W');
      $('flow-hint').textContent = tr(`終わった ${T.n} サイクルの合計（気体から見た符号：Q は受け取った熱）`, `Total over ${T.n} completed cycle(s) (signs as seen by the gas: Q is heat received)`);
      $('pv-area').textContent = tr(`直前のサイクル：塗った面積 = ${fmtSigned(loopArea(prev), 1)}、表の正味の仕事 −W = ${fmtSigned(-c.W, 1)}`, `Last cycle: shaded area = ${fmtSigned(loopArea(prev), 1)}, net work in the table −W = ${fmtSigned(-c.W, 1)}`) +
        (pspeed > 0.1 ? tr('（速く動かしているので一致しない）', ' (they do not agree because the piston moves fast)') : '');
      showWarn(T);
      $('r-sgen').textContent = fmtSigned((-T.Qh / Th - T.Qc / Tc) / T.n, 1);
      $('ts-area').textContent = tr(`直前のサイクル：塗った面積 = ${fmtSigned(loopArea(prevTS), 1)}、表の正味の熱 Q = ${fmtSigned(cQ, 1)}`, `Last cycle: shaded area = ${fmtSigned(loopArea(prevTS), 1)}, net heat in the table Q = ${fmtSigned(cQ, 1)}`) + (pspeed > 0.1 ? tr('（速く動かしているので一致しない）', ' (moving fast, so they do not agree)') : '');
    }
    const s = run.step;
    $('r-step').textContent = run.label;
    $('r-cycle').textContent = run.k >= 0 ? tr(`（${run.cycles.length + 1} サイクル目, T = ${fmt(U / N, 2)}）`, `(cycle ${run.cycles.length + 1}, T = ${fmt(U / N, 2)})`) : '';
    const q = s && run._snap ? gas.stats().Q - run._snap.Q : 0;
    setArrow('a-h', s && s.bathT === Th, q);
    setArrow('a-c', s && s.bathT === Tc, q);
    if (frame % 3 === 0) {
      pv.paths = [{ label: tr('理論（準静的）', 'Theory (quasi-static)'), color: '#77756f', pts: theoryPts(), width: 1.5, dash: [6, 4] }];
      if (prev) pv.paths.push({ label: tr('直前のサイクル', 'Last cycle'), color: SERIES[1], pts: prev, width: 1.5, closed: true, fillColor: dir === 'engine' ? 'rgba(235,104,52,0.18)' : 'rgba(42,120,214,0.15)' });
      pv.paths.push({ label: tr('いまのサイクル', 'Current cycle'), color: SERIES[3], pts: cur, width: 2 });
      pv.marker = [V, U / V];
      pv.draw();
      ts.paths = [{ label: tr('理論（準静的）', 'Theory (quasi-static)'), color: '#77756f', pts: theoryTS(), width: 1.5, dash: [6, 4] }];
      if (prevTS) ts.paths.push({ label: tr('直前のサイクル', 'Last cycle'), color: SERIES[1], pts: prevTS, width: 1.5, closed: true, fillColor: dir === 'engine' ? 'rgba(235,104,52,0.18)' : 'rgba(42,120,214,0.15)' });
      ts.paths.push({ label: tr('いまのサイクル', 'Current cycle'), color: SERIES[3], pts: curTS, width: 2 });
      ts.marker = [Sgas(V, Tsm), Tsm];
      ts.draw();
    }
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
