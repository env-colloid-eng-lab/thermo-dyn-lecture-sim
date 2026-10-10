// 06-heat-capacity.js ― sims/06-heat-capacity.html と en/sims/06-heat-capacity.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Gas } from '../engine.js';
import { HeatCapacityRun } from '../experiments.js';
import { SimView } from '../render.js';
import { TimePlot, XYPlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, bindCheck, segmented, Loop, bindPlayPause, setupCommon, bindSpeed } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const H = 60, X0 = 45, T0 = 1;   // 定圧で熱源の温度 3 まで温めてもピストンが端に届かない大きさ
let gas, view, run = null, simRate = 0.1, frame = 0, mode = 'V', N = 300, Tb = 2;
const results = [];

const plotT = new TimePlot($('plotT'), { height: 170, ylabel: tr('温度 T', 'Temperature T'), yZero: true, window: 1500,
  series: [{ key: 'T', label: tr('気体の温度 T', 'Gas temperature T'), color: SERIES[0] }, { key: 'Tb', label: tr('接触中の熱源の温度', 'Temperature of reservoir in contact'), color: '#d6453d', dash: [6, 4] }] });
const plotQ = new XYPlot($('plotQ'), { height: 260, xmin: -0.8, xmax: 2.6, ymin: -1.8, ymax: 6.5, xlabel: 'ΔT', ylabel: 'Q/N', xd: 2, yd: 2 });
plotQ.refs = [
  { label: tr('定積の理論 Q/N = ΔT', 'Constant-volume theory Q/N = ΔT'), color: SERIES[0], dash: [6, 4], fn: (x) => x },
  { label: tr('定圧の理論 Q/N = 2ΔT', 'Constant-pressure theory Q/N = 2ΔT'), color: SERIES[1], dash: [6, 4], fn: (x) => 2 * x },
];

function build() {
  run = null;
  gas = new Gas({ H, X: X0, Xmin: 12, Xmax: 170, seed: (Math.random() * 1e9) | 0 });
  gas.addParticles(N, T0, { x0: 0, x1: X0, y0: 0, y1: H });
  if (mode === 'P') Object.assign(gas.piston, { mode: 'force', Pext: gas.kinetic() / (gas.X * H), u: 0 });
  gas.Tbath = Tb;
  if (view) view.g = gas; else view = new SimView($('sim'), gas, { bathPad: 13, Tref: T0, drawScale: 2.8 });
  view.opt.showHeat = $('c-heat').checked;
  view.opt.colorMode = $('c-speed').checked ? 'speed' : 'species';
  $('mode-hint').textContent = mode === 'V' ? tr('— 定積：ピストンは動かない', '— Constant volume: the piston does not move') : tr(`— 定圧：外から一定の圧力 P = ${gas.piston.Pext.toFixed(4)} でピストンを押している（赤い矢印）`, `— Constant pressure: the piston is pushed from outside with a constant pressure P = ${gas.piston.Pext.toFixed(4)} (red arrow)`);
  plotT.reset();
  $('r-phase').textContent = tr('―', '–'); $('r-prog').style.width = '0';
  $('btn-measure').disabled = false;
}

function drawResults() {
  const tb = $('tbl').querySelector('tbody');
  tb.innerHTML = results.map((r, k) => tr(`<tr><td>${k + 1}</td><td style="text-align:left">${r.mode === 'V' ? '定積' : '定圧'}</td><td>${r.N}</td><td>${fmt(r.Tb, 1)}</td><td>${fmtSigned(r.Q, 1)}</td><td>${fmtSigned(r.dT, 3)}</td><td>${fmt(r.C, 1)}</td><td><b>${fmt(r.c, 2)}</b>${r.hitLimit ? ' ※' : ''}</td></tr>`, `<tr><td>${k + 1}</td><td style="text-align:left">${r.mode === 'V' ? 'Const. V' : 'Const. P'}</td><td>${r.N}</td><td>${fmt(r.Tb, 1)}</td><td>${fmtSigned(r.Q, 1)}</td><td>${fmtSigned(r.dT, 3)}</td><td>${fmt(r.C, 1)}</td><td><b>${fmt(r.c, 2)}</b>${r.hitLimit ? ' *' : ''}</td></tr>`)).join('');
  $('tbl-note').hidden = !results.some((r) => r.hitLimit);
  $('tbl-empty').hidden = results.length > 0;
  const pts = (m) => results.filter((r) => r.mode === m).map((r) => [r.dT, r.Q / r.N]);
  plotQ.paths = [];
  for (const [m, color, label] of [['V', SERIES[0], tr('定積の測定', 'Constant-volume measurement')], ['P', SERIES[1], tr('定圧の測定', 'Constant-pressure measurement')]]) {
    pts(m).forEach((p, k) => plotQ.paths.push({ label: k === 0 ? label : '', color, pts: [p], ends: true }));
  }
  plotQ.draw();
}

segmented('mode', (v) => { mode = v; build(); }, false);
bindRange('N', (v) => { N = v; }, (v) => v.toFixed(0), false);
bindRange('Tb', (v) => { Tb = v; if (gas && !run) gas.Tbath = v; }, (v) => v.toFixed(1), false);
bindSpeed('speed', (v) => { simRate = v; });
bindCheck('c-heat', (on) => { if (view) view.opt.showHeat = on; });
bindCheck('c-speed', (on) => { if (view) view.opt.colorMode = on ? 'speed' : 'species'; $('lg-speed').hidden = !on; });
$('btn-reset').addEventListener('click', build);
$('btn-measure').addEventListener('click', () => {
  if (run && run.phase !== 'done') return;
  build();   // 毎回、温度 1 の新しい気体で測る
  run = new HeatCapacityRun(gas, { mode, Tb });
  $('btn-measure').disabled = true;
});
$('btn-clear').addEventListener('click', () => { results.length = 0; drawResults(); });
build();
drawResults();

const loop = new Loop((paused) => {
  if (!paused) {
    const busy = run && run.phase !== 'done';
    gas.advance(busy ? Math.max(simRate, 3) : simRate);   // 測定中は自動で早送り
    gas.measure();
    frame++;
    if (run) {
      run.update();
      $('r-phase').textContent = run.label;
      $('r-prog').style.width = (100 * run.progress).toFixed(1) + '%';
      if (run.phase === 'done' && run.result && !run.recorded) {
        run.recorded = true; results.push(run.result); drawResults();
        $('btn-measure').disabled = false;
      }
    }
    const s = gas.stats();
    $('r-N').textContent = s.N;
    $('r-V').textContent = fmt(s.V, 0);
    $('r-T').textContent = fmt(s.T, 3);
    $('r-P').textContent = fmt(s.Pkin, 4);
    $('r-Q').textContent = fmtSigned(s.Q, 1);
    $('r-W').textContent = fmtSigned(s.W, 1);
    plotT.push(gas.time, { T: s.T, Tb: gas.bath.left ? gas.Tbath : NaN });
    if (frame % 2 === 0) plotT.draw();
  }
  view.draw();
});
bindPlayPause('btn-play', loop);
