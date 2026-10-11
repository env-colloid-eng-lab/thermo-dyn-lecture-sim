// 18-steady-state.js ― sims/18-steady-state.html と en/sims/18-steady-state.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas, ADIABATIC, DIATHERMAL } from '../engine.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, updateLedger, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 100, R = 1;      // 熱が衝突でリレーされるよう、他のページより粒子を大きくする
const NB = 8;                       // 温度・混み具合を数える層の数
const WIN = 400;                    // 熱の速さを平均する時間
const TAU = 150;                    // 層ごとの時間平均の時定数
const HOT = '#d6453d', COLD = '#2a78d6';
let gas, view, simRate = 0.3, frame = 0, N = 400, Th = 1, Tc = 1, contact = 'on', ff = 0;
let hist = [], Sh = 0, Sc = 0, lastQ = { h: 0, c: 0 };
const ke = new Float64Array(NB), cnt = new Float64Array(NB);

const plotT = new XYPlot($('plotT'), { height: 230, xmin: 0, xmax: 3.2, ymin: 0, ymax: H, xlabel: tr('温度 T', 'temperature T'), ylabel: tr('高さ（下から）', 'height (from bottom)'), xd: 2, yd: 0 });
const plotN = new XYPlot($('plotN'), { height: 230, xmin: 0, xmax: 0.12, ymin: 0, ymax: H, xlabel: tr('混み具合 n（面積あたりの粒子数）', 'crowding n (particles per area)'), ylabel: tr('高さ（下から）', 'height (from bottom)'), xd: 3, yd: 0 });
const plotE = new TimePlot($('plotE'), { height: 190, ylabel: tr('エネルギー（累計）', 'energy (cumulative)'), yZero: true, window: 3000,
  series: [{ key: 'Qh', label: tr('熱い熱源から入った熱 Q_h', 'heat in from the hot reservoir Q_h'), color: HOT },
    { key: 'mQc', label: tr('冷たい熱源へ出た熱 −Q_c', 'heat out to the cold reservoir −Q_c'), color: COLD, dash: [6, 4] },
    { key: 'dU', label: tr('気体の ΔU', 'ΔU of the gas'), color: SERIES[2] }] });
const plotS = new TimePlot($('plotS'), { height: 190, ylabel: tr('エントロピーの変化（k 単位）', 'entropy change (units of k)'), yZero: true, window: 3000,
  series: [{ key: 'Sh', label: tr('熱い熱源 −∫dQ_h/T_h', 'hot reservoir −∫dQ_h/T_h'), color: HOT, dash: [6, 4] },
    { key: 'Sc', label: tr('冷たい熱源 −∫dQ_c/T_c', 'cold reservoir −∫dQ_c/T_c'), color: COLD, dash: [6, 4] },
    { key: 'S', label: tr('熱源の合計（定常状態では全体の増加と同じ）', 'reservoirs total (equals the total increase in a steady state)'), color: '#1f1f1f' }] });

function applyWalls() {
  const t = contact === 'on' ? DIATHERMAL : ADIABATIC;
  gas.walls = { left: ADIABATIC, top: t, bottom: t };
  gas.bath = { left: false, top: contact === 'on', bottom: contact === 'on' };
  gas.Tside = { left: null, top: Tc, bottom: Th };
  $('mode-hint').textContent = contact === 'on'
    ? tr(`— 下：熱い熱源 T_h = ${fmt(Th, 2)}、上：冷たい熱源 T_c = ${fmt(Tc, 2)}、左右は断熱壁`, `— bottom: hot reservoir T_h = ${fmt(Th, 2)}, top: cold reservoir T_c = ${fmt(Tc, 2)}, sides adiabatic`)
    : tr('— 熱源を外した：まわりはすべて断熱壁', '— reservoirs removed: adiabatic walls all around');
}

function resetMeasure() {
  gas.resetLedger(); hist = []; Sh = 0; Sc = 0; lastQ = { h: 0, c: 0 };
  plotE.reset(); plotS.reset();
}

function build() {
  gas = new Gas({ H, X: X0, Xmin: 40, Xmax: 110, r: R, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(N, (Th + Tc) / 2, { x0: 0, x1: X0, y0: 0, y1: H });
  gas.piston.target = X0;
  applyWalls();
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { tbPad: 7, Tref: 1, drawScale: 1.1, colorMode: 'speed' });
  view.opt.showHeat = $('c-heat').checked;
  ke.fill(0); cnt.fill(0); ff = 0;
  resetMeasure();
}

/** 層ごとの運動エネルギーと粒子数を、時定数 TAU で時間平均する */
function sampleLayers(dt) {
  const a = Math.exp(-dt / TAU);
  for (let b = 0; b < NB; b++) { ke[b] *= a; cnt[b] *= a; }
  for (let i = 0; i < gas.N; i++) {
    const b = Math.min(NB - 1, Math.max(0, Math.floor((gas.y[i] / H) * NB)));
    ke[b] += 0.5 * (gas.vx[i] ** 2 + gas.vy[i] ** 2) * dt;
    cnt[b] += dt;
  }
}

function advance(dt) {
  gas.advance(dt);
  sampleLayers(dt);
  // 熱源のエントロピー：受け取った熱をそのときの熱源の温度で割って足す
  const L = gas.ledger;
  Sh -= (L.Qside.bottom - lastQ.h) / Th;
  Sc -= (L.Qside.top - lastQ.c) / Tc;
  lastQ = { h: L.Qside.bottom, c: L.Qside.top };
}

segmented('contact', (v) => { contact = v; if (gas) applyWalls(); }, false);
bindRange('Th', (v) => { Th = v; if (gas) applyWalls(); }, (v) => v.toFixed(2), false);
bindRange('Tc', (v) => { Tc = v; if (gas) applyWalls(); }, (v) => v.toFixed(2), false);
bindRange('N', (v) => { N = v; if (gas) build(); }, (v) => v.toFixed(0), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
const setT = (h, c) => {
  for (const [id, v] of [['Th', h], ['Tc', c]]) { $(id).value = v; $(id).dispatchEvent(new Event('input')); }
  if (contact !== 'on') $('contact').querySelector('[data-value="on"]').click();
};
$('btn-same').addEventListener('click', () => setT(1, 1));
$('btn-diff').addEventListener('click', () => setT(2, 0.5));
$('btn-ff').addEventListener('click', () => { ff = 500; });
$('btn-reset').addEventListener('click', build);
$('btn-ledger').addEventListener('click', resetMeasure);
build();

function update(paused) {
  const s = gas.stats(), L = gas.ledger;
  if (!paused || !hist.length) hist.push([gas.time, L.Qside.bottom, L.Qside.top, s.U, Sh + Sc, s.T]);
  while (hist.length > 2 && hist[0][0] < gas.time - WIN) hist.shift();
  const h0 = hist[0], dt = gas.time - h0[0];
  const ok = dt > 20;
  const qh = ok ? (L.Qside.bottom - h0[1]) / dt : NaN, qc = ok ? (L.Qside.top - h0[2]) / dt : NaN, du = ok ? (s.U - h0[3]) / dt : NaN;
  // エントロピーを作る速さ = 熱源のエントロピーの増える速さ + 気体のエントロピーの増える速さ。
  // 気体の分は dS = dU/T（T は測定期間の平均の気体の温度）で近似する。熱源の分だけだと、平衡でも気体のエネルギーのゆらぎがそのまま σ のゆらぎに見えてしまう。
  // 熱源を外したときは熱の出入りがなく、気体の中で作られる分は熱の帳簿からは測れないので表示しない
  const sig = contact === 'on' && ok ? (Sh + Sc - h0[4]) / dt + du / ((h0[5] + s.T) / 2) : NaN;
  $('r-Qh').textContent = fmtSigned(qh, 2); $('r-Qc').textContent = fmtSigned(-qc, 2);
  $('r-dU').textContent = fmtSigned(du, 2); $('r-sig').textContent = fmtSigned(sig, 3);
  $('r-win').textContent = fmt(Math.min(dt, WIN), 0);
  updateLedger('l-', s);

  // 層ごとの温度と混み具合（高さは下から）
  const Tl = [], nl = [], area = (X0 * H) / NB;
  let tot = 0; for (let b = 0; b < NB; b++) tot += cnt[b];
  for (let b = 0; b < NB; b++) {
    const z = H - ((b + 0.5) * H) / NB;
    if (cnt[b] > 0) { Tl.push([ke[b] / cnt[b], z]); nl.push([((cnt[b] / tot) * gas.N) / area, z]); }
  }
  const vline = (x, color, label) => ({ label, color, pts: [[x, 0], [x, H]], dash: [6, 4], width: 1.4 });
  plotT.paths = [{ label: tr('層の温度', 'layer temperature'), color: SERIES[0], pts: Tl, dots: true }];
  if (contact === 'on') plotT.paths.push(vline(Th, HOT, 'T_h'), vline(Tc, COLD, 'T_c'));
  plotT.draw();
  plotN.paths = [{ label: tr('層の混み具合', 'layer crowding'), color: SERIES[3], pts: nl, dots: true },
    vline(gas.N / (X0 * H), '#77756f', tr('一様なら', 'if uniform'))];
  plotN.draw();

  if (!paused) {   // 一時停止中は同じ時刻の点を重ねない
    plotE.push(gas.time, { Qh: L.Qside.bottom, mQc: -L.Qside.top, dU: s.dU });
    plotS.push(gas.time, { Sh, Sc, S: Sh + Sc });
  }
  plotE.draw(); plotS.draw();

  // いまの状態の説明
  const dTl = Tl.length === NB ? Tl[NB - 1][0] - Tl[0][0] : 0;   // 下の層 − 上の層
  const el = $('r-dir');
  if (contact !== 'on') {
    el.innerHTML = Math.abs(dTl) > 0.08
      ? tr(`<b>平衡へ向かっている</b>：熱源を外したので熱の出入りはない。気体の中では熱い下から冷たい上へ熱が移り、温度差（下 − 上 ${fmtSigned(dTl, 2)}）が小さくなっていく。気体のエントロピーが増える向き。`, `<b>Heading to equilibrium</b>: with the reservoirs removed no heat goes in or out. Inside the gas heat moves from the hot bottom to the cold top and the temperature difference (bottom − top ${fmtSigned(dTl, 2)}) shrinks: the direction in which the gas's entropy increases.`)
      : tr('<b>平衡</b>：温度は高さによらずそろい、正味の熱の流れはない。外から何も供給しなくても、この状態はずっと続く。', '<b>Equilibrium</b>: the temperature is the same at every height and there is no net flow of heat. This state lasts forever without any supply from outside.');
  } else if (Math.abs(Th - Tc) < 0.01) {
    el.innerHTML = tr('<b>平衡</b>：上下の熱源が同じ温度。熱は壁ごとに出入りしているが、正味の流れは 0 のまわりでゆらぐだけ。エントロピーは作られない（σ ≈ 0）。', '<b>Equilibrium</b>: both reservoirs have the same temperature. Heat goes in and out at each wall, but the net flow only fluctuates around 0. No entropy is produced (σ ≈ 0).');
  } else if (!ok || Math.abs(du) > 0.25 * Math.max(0.2, Math.abs(qh))) {
    el.innerHTML = tr('<b>定常状態へ向かっている</b>：入る熱と出る熱がまだつり合わず、気体の内部エネルギーが変わっている。', '<b>Heading to a steady state</b>: the heat coming in and going out do not balance yet, so the internal energy of the gas is still changing.');
  } else {
    el.innerHTML = Th > Tc
      ? tr(`<b>定常状態</b>（平衡ではない）：気体の状態は変わらない（d<i>U</i>/d<i>t</i> ≈ 0）が、熱い熱源から ${fmt(qh, 2)} の速さで入った熱が、そのまま冷たい熱源へ出ていく。全体のエントロピーは σ ≈ ${fmt(sig, 2)} の速さで増え続けている。`, `<b>Steady state</b> (not equilibrium): the gas does not change (d<i>U</i>/d<i>t</i> ≈ 0), but heat entering from the hot reservoir at a rate ${fmt(qh, 2)} flows straight out to the cold reservoir. The total entropy keeps increasing at a rate σ ≈ ${fmt(sig, 2)}.`)
      : tr(`<b>定常状態</b>（平衡ではない）：こんどは上の方が熱い。熱は上から下へ流れる（<i>Q̇</i><sub>h</sub> &lt; 0）。熱い方から冷たい方へ流れる向きは変わらず、σ ≈ ${fmt(sig, 2)} &gt; 0。`, `<b>Steady state</b> (not equilibrium): now the top is hotter, so heat flows from top to bottom (<i>Q̇</i><sub>h</sub> &lt; 0). It still flows from hot to cold, and σ ≈ ${fmt(sig, 2)} &gt; 0.`);
  }
}

const loop = new Loop((paused) => {
  if (!paused) {
    advance(simRate);
    if (ff > 0) { const d = Math.min(ff, 50); advance(d); ff -= d; }
    frame++;
  }
  if (paused || frame % 3 === 0) update(paused);   // 一時停止中も、スライダーやボタンの変更をすぐ表示する
  view.draw();
});
bindPlayPause('btn-play', loop);
