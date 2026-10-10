// 14-stability.js ― sims/14-stability.html と en/sims/14-stability.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { GAMMA_D, G, lapseProfile, potentialTemp, bruntN2 } from '../climate.js';
import { XYPlot, TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const PS = 1000, ZTOP = 12;
let ge = 6.5, Ts = 288, z0 = 2, dz = 0.5, rate = 100;
let zp = 2, w = 0, Tp0 = 0, zstart = 2, t = 0;   // 空気塊の高さ（km）・速さ（m/s）・出発点の温度・出発の高さ・経過時間（s）

const env = (z) => lapseProfile(z, Ts, PS, ge);
const parcelT = (z) => Tp0 - GAMMA_D * (z - zstart);   // 乾燥断熱
const plotT = new XYPlot($('plotT'), { height: 300, xmin: 200, xmax: 320, ymin: 0, ymax: ZTOP, xlabel: tr('T （K）', 'T (K)'), ylabel: tr('高さ z （km）', 'height z (km)'), xd: 1, yd: 2 });
const plotTh = new XYPlot($('plotTh'), { height: 260, xmin: 260, xmax: 360, ymin: 0, ymax: ZTOP, xlabel: tr('θ （K）', 'θ (K)'), ylabel: tr('高さ z （km）', 'height z (km)'), xd: 1, yd: 2 });
const plotP = new XYPlot($('plotP'), { height: 240, xmin: 0, xmax: 1000, ymin: 0, ymax: ZTOP, xlabel: tr('P （hPa）', 'P (hPa)'), ylabel: tr('高さ z （km）', 'height z (km)'), xd: 0, yd: 2 });
const plotZ = new TimePlot($('plotZ'), { height: 160, ylabel: tr('空気塊の高さ（km）', 'parcel height (km)'), window: 3600, xlabel: tr('時間 t （s）', 'time t (s)'),
  series: [{ key: 'z', label: tr('空気塊の高さ', 'parcel height'), color: SERIES[1] }, { key: 'z0', label: tr('はじめの高さ', 'starting height'), color: '#77756f', dash: [6, 4] }] });

const curve = (fn, a, b, n = 60) => Array.from({ length: n + 1 }, (_, k) => { const z = a + ((b - a) * k) / n; return [fn(z), z]; });

/** 空気塊を高さ z からそっと離す（出発の高さでは周囲と同じ温度） */
function release(dzSign) {
  zstart = z0; Tp0 = env(z0).T;
  zp = Math.min(ZTOP, Math.max(0, z0 + dzSign * dz)); w = 0; t = 0;
  plotZ.reset();
}
function resetParcel() { zstart = z0; Tp0 = env(z0).T; zp = z0; w = 0; t = 0; plotZ.reset(); }

function step(dt) {
  // d²z/dt² = g (T_parcel − T_env)/T_env（z は m）。摩擦・混合は無視。地表と 12 km で止める
  const sub = 20, h = dt / sub;
  for (let k = 0; k < sub; k++) {
    const Te = env(zp).T, a = (G * (parcelT(zp) - Te)) / Te;
    w += a * h; zp += (w * h) / 1000;
    if (zp <= 0) { zp = 0; w = 0; } else if (zp >= ZTOP) { zp = ZTOP; w = 0; }
  }
  t += dt;
}

function draw() {
  const Tmin = Math.min(env(ZTOP).T, parcelT(ZTOP)) - 10, Tmax = Math.max(Ts, env(0).T, parcelT(0)) + 10;
  Object.assign(plotT.opt, { xmin: Math.floor(Tmin / 10) * 10, xmax: Math.ceil(Tmax / 10) * 10 });
  plotT.paths = [
    { label: tr('周囲の気温', 'surrounding temperature'), color: SERIES[0], pts: curve((z) => env(z).T, 0, ZTOP), width: 2.5 },
    { label: tr('空気塊がたどる乾燥断熱線', 'dry adiabat followed by the parcel'), color: SERIES[1], pts: curve(parcelT, 0, ZTOP), dash: [6, 4], width: 1.8 },
  ];
  plotT.marker = [parcelT(zp), zp];
  plotT.draw();
  const thEnv = (z) => { const e = env(z); return potentialTemp(e.T, e.p); };
  const thP = potentialTemp(Tp0, env(zstart).p);
  const ths = curve(thEnv, 0, ZTOP).map((p) => p[0]).concat([thP]);
  Object.assign(plotTh.opt, { xmin: Math.floor((Math.min(...ths) - 5) / 10) * 10, xmax: Math.ceil((Math.max(...ths) + 5) / 10) * 10 });
  plotTh.paths = [
    { label: tr('周囲の温位', 'surrounding potential temperature'), color: SERIES[0], pts: curve(thEnv, 0, ZTOP), width: 2.5 },
    { label: tr('空気塊の温位（動いても一定）', 'parcel potential temperature (constant as it moves)'), color: SERIES[1], pts: [[thP, 0], [thP, ZTOP]], dash: [6, 4], width: 1.8 },
  ];
  plotTh.marker = [thP, zp];
  plotTh.draw();
  plotP.paths = [
    { label: tr('いまの周囲の大気', 'current surrounding atmosphere'), color: SERIES[0], pts: curve((z) => env(z).p, 0, ZTOP), width: 2.5 },
    { label: tr(`等温 ${Ts} K`, `isothermal ${Ts} K`), color: '#77756f', pts: curve((z) => lapseProfile(z, Ts, PS, 0).p, 0, ZTOP), dash: [6, 4], width: 1.6 },
    { label: tr('乾燥断熱（θ 一様）', 'dry adiabatic (uniform θ)'), color: SERIES[2], pts: curve((z) => lapseProfile(z, Ts, PS, GAMMA_D).p, 0, ZTOP), dash: [2, 3], width: 1.6 },
  ];
  plotP.draw();
}

function readouts() {
  const N2 = bruntN2(env(zstart).T, ge), dT = parcelT(zp) - env(zp).T;
  $('r-ge').textContent = `${fmt(ge, 1)} K/km`; $('r-gd').textContent = `${fmt(GAMMA_D, 2)} K/km`;
  $('r-dT').textContent = `${fmtSigned(dT, 2)} K`;
  $('r-per').textContent = N2 > 0 ? tr(`${fmt(2 * Math.PI / Math.sqrt(N2) / 60, 1)} 分`, `${fmt(2 * Math.PI / Math.sqrt(N2) / 60, 1)} min`) : tr('振動しない', 'no oscillation');
  const el = $('r-dir'), moved = Math.abs(zp - zstart) > 0.02;
  if (Math.abs(ge - GAMMA_D) < 0.25) el.innerHTML = tr('<b>中立</b>：周囲の気温減率が乾燥断熱減率とほぼ同じ（温位が一様）。動かしても浮力がほとんど働かない。', '<b>Neutral</b>: the surrounding lapse rate is almost the dry adiabatic one (uniform potential temperature). Hardly any buoyancy acts when the parcel is moved.');
  else if (ge < GAMMA_D) el.innerHTML = tr('<b>安定</b>：Γ<sub>env</sub> &lt; Γ<sub>d</sub>（上ほど温位が高い）。', '<b>Stable</b>: Γ<sub>env</sub> &lt; Γ<sub>d</sub> (potential temperature increases upward). ') + (moved ? (dT < 0 ? tr('空気塊は周囲より冷たく重いので、下向きの浮力で戻される。', 'The parcel is colder and heavier than its surroundings, so a downward buoyancy pushes it back.') : tr('空気塊は周囲より暖かく軽いので、上向きの浮力で戻される。', 'The parcel is warmer and lighter than its surroundings, so an upward buoyancy pushes it back.')) : tr('持ち上げても押し下げても、元の高さへ戻す向きの浮力が働く。', 'Whether lifted or pushed down, buoyancy acts to bring it back to its original height.'));
  else el.innerHTML = tr('<b>不安定</b>：Γ<sub>env</sub> &gt; Γ<sub>d</sub>（上ほど温位が低い）。', '<b>Unstable</b>: Γ<sub>env</sub> &gt; Γ<sub>d</sub> (potential temperature decreases upward). ') + (moved ? (dT > 0 ? tr('空気塊は周囲より暖かく軽いので、さらに昇っていく（対流）。', 'The parcel is warmer and lighter than its surroundings, so it keeps rising (convection).') : tr('空気塊は周囲より冷たく重いので、さらに沈んでいく。', 'The parcel is colder and heavier than its surroundings, so it keeps sinking.')) : tr('少し動かすと、そのまま離れていく。', 'Moved a little, it keeps moving away.'));
}

bindRange('ge', (v) => { ge = v; resetParcel(); }, (v) => v.toFixed(1), false);
bindRange('Ts', (v) => { Ts = v; resetParcel(); }, (v) => v.toFixed(0), false);
bindRange('z0', (v) => { z0 = v; resetParcel(); }, (v) => v.toFixed(1), false);
bindRange('dz', (v) => { dz = v; }, (v) => v.toFixed(1), false);
bindRange('speed', (v) => { rate = Math.pow(10, v); }, (v) => `×${Math.round(Math.pow(10, v))}`);
$('btn-up').addEventListener('click', () => release(1));
$('btn-down').addEventListener('click', () => release(-1));
$('btn-reset').addEventListener('click', resetParcel);
resetParcel();

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) {
    const dt = rate / 60;   // 1フレーム（約 1/60 秒）で進める時間（s）
    step(dt); frame++;
    plotZ.push(t, { z: zp, z0: zstart });
  }
  if (frame % 2 === 0 || paused) { draw(); plotZ.draw(); readouts(); }
});
bindPlayPause('btn-play', loop);
