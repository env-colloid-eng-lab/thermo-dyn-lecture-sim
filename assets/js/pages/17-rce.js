// 17-rce.js ― sims/17-rce.html と en/sims/17-rce.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { Column } from '../climate.js';
import { XYPlot, TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const DT = 6 * 3600;   // 1回の更新 6 時間
let tau = 1.6, phi = 240, gc = 6.5, daysPerFrame = 2;
let rce, rad, last;

const plotT = new XYPlot($('plotT'), { height: 340, xmin: 180, xmax: 340, ymin: 0, ymax: 26, xlabel: tr('T （K）', 'T (K)'), ylabel: tr('高さ z （km）', 'height z (km)'), xd: 1, yd: 2 });
const plotH = new XYPlot($('plotH'), { height: 280, xmin: -3, xmax: 3, ymin: 0, ymax: 26, xlabel: tr('加熱率 （K/日）', 'heating rate (K/day)'), ylabel: tr('高さ z （km）', 'height z (km)'), xd: 2, yd: 2 });
const plotS = new TimePlot($('plotS'), { height: 170, ylabel: tr('地表温度（K）', 'surface temperature (K)'), window: 600, xlabel: tr('経過日数', 'days elapsed'),
  series: [{ key: 'c', label: tr('対流あり', 'with convection'), color: '#d6453d' }, { key: 'r', label: tr('放射だけ', 'radiation only'), color: SERIES[0], dash: [6, 4] }] });

function make(convect) { return new Column({ tauS: tau, phiAbs: phi, gammaCrit: gc, convect }); }
function reset() { rce = make(true); rad = make(false); last = rce.fluxes(); plotS.reset(); }

/** 地表と各層の (T, z) の点列 */
const profile = (c) => { const z = c.heights(); return [[c.Ts, 0], ...c.T.map((T, i) => [T, z[i + 1]])]; };

function update(f) {
  const z = rce.heights(), zt = Math.ceil(z[z.length - 1] + 2);   // いちばん上の層の代表の高さまで
  // 対流が届く一番上の層（対流による加熱が 0 でない）
  let trop = 0; for (let i = 0; i < rce.T.length; i++) if (Math.abs(rce.convHeat[i + 1]) > 1e-6) trop = z[i + 1];
  $('r-Ts').textContent = `${fmt(rce.Ts, 1)} K`; $('r-Tr').textContent = `${fmt(rad.Ts, 1)} K`;
  $('r-olr').textContent = `${fmt(f.olr, 1)} W m⁻²`; $('r-imb').textContent = `${fmtSigned(phi - f.olr, 2)} W m⁻²`;
  $('r-trop').textContent = trop > 0 ? `${fmt(trop, 1)} km` : '–';
  $('r-day').textContent = fmt(rce.t / 86400, 0);
  const pr = profile(rce), pd = profile(rad);
  const Ts = pr.concat(pd).map((p) => p[0]);
  Object.assign(plotT.opt, { xmin: Math.floor((Math.min(...Ts) - 10) / 10) * 10, xmax: Math.ceil((Math.max(...Ts) + 10) / 10) * 10, ymax: zt });
  plotT.paths = [
    { label: tr('対流あり（放射対流平衡へ）', 'with convection (→ radiative-convective eq.)'), color: '#d6453d', pts: pr, width: 2.5 },
    { label: tr('放射だけ（放射平衡へ）', 'radiation only (→ radiative eq.)'), color: SERIES[0], pts: pd, width: 2, dash: [6, 4] },
    { label: tr(`限界減率 ${fmt(gc, 1)} K/km の直線`, `critical lapse rate ${fmt(gc, 1)} K/km`), color: '#77756f', pts: [[rce.Ts, 0], [rce.Ts - gc * zt, zt]], width: 1.2, dash: [2, 3] },
  ];
  plotT.marker = null;
  plotT.draw();
  // 加熱率
  const rh = rce.radHeat.map((v, i) => [v, z[i + 1]]), ch = rce.convHeat.slice(1).map((v, i) => [v, z[i + 1]]);
  const sum = rce.radHeat.map((v, i) => [v + rce.convHeat[i + 1], z[i + 1]]);
  const mx = Math.max(1, ...rh.map((p) => Math.abs(p[0])), ...ch.map((p) => Math.abs(p[0])));
  Object.assign(plotH.opt, { xmin: -Math.ceil(mx * 1.1), xmax: Math.ceil(mx * 1.1), ymax: zt });
  plotH.paths = [
    { label: tr('放射による加熱', 'radiative heating'), color: SERIES[0], pts: rh, width: 2.2 },
    { label: tr('対流による加熱', 'convective heating'), color: SERIES[1], pts: ch, width: 2.2 },
    { label: tr('合計', 'sum'), color: '#1f1f1f', pts: sum, width: 1.4, dash: [4, 3] },
  ];
  plotH.draw();
}

bindRange('tau', (v) => { tau = v; rce?.setTau(v); rad?.setTau(v); }, (v) => v.toFixed(1), false);
bindRange('phi', (v) => { phi = v; if (rce) { rce.o.phiAbs = v; rad.o.phiAbs = v; } }, (v) => v.toFixed(0), false);
bindRange('gc', (v) => { gc = v; if (rce) rce.o.gammaCrit = v; }, (v) => v.toFixed(1), false);
bindRange('speed', (v) => { daysPerFrame = Math.pow(10, v); }, (v) => Math.pow(10, v).toFixed(1));
$('btn-reset').addEventListener('click', reset);
reset();

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) {
    const n = Math.max(1, Math.round((daysPerFrame * 86400) / DT));
    for (let k = 0; k < n; k++) { last = rce.step(DT); rad.step(DT); }
    frame++;
    plotS.push(rce.t / 86400, { c: rce.Ts, r: rad.Ts });
  }
  if (paused) last = rce.fluxes();   // 停止中に τ を変えても収支を今の状態で表示する
  if (frame % 2 === 0 || paused) { update(last); plotS.draw(); }
});
bindPlayPause('btn-play', loop);
