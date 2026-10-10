// 15-greenhouse.js ― sims/15-greenhouse.html と en/sims/15-greenhouse.html の共通スクリプト。表示する文字は tr('日本語', 'English') で書く
import { SIGMA, absorbedSolar, effectiveTemp, oneLayer, restoringB, co2Forcing, linearResponse } from '../climate.js';
import { XYPlot, TimePlot, SERIES } from '../plot.js';
import { $, fmt, fmtSigned, bindRange, Loop, bindPlayPause, setupCommon } from '../ui.js';
import { tr } from '../i18n.js';

setupCommon();
const YEAR = 365.25 * 86400, CW = 4.2e6;
let S0 = 1361, alb = 0.3, eps = 0.8, h = 10, co2 = 2, fb = 0, yrPerSec = 0.3;
let Ts = 0, t = 0, tPushed = -1;   // tPushed：最後にグラフへ記録した時刻（一時停止中に同じ点を重ねないため）

const phiAbs = () => absorbedSolar(S0, alb);
const CA = () => CW * h;
const plotT = new TimePlot($('plotT'), { height: 190, ylabel: tr('温度（K）', 'temperature (K)'), window: 10, xlabel: tr('時間 t （年）', 'time t (years)'),
  series: [{ key: 'Ts', label: tr('地表 T_s', 'surface T_s'), color: '#d6453d' }, { key: 'eq', label: tr('定常状態の T_s', 'steady-state T_s'), color: '#77756f', dash: [6, 4] }, { key: 'Te', label: 'T_e', color: SERIES[0], dash: [2, 3] }] });
const plotR = new XYPlot($('plotR'), { height: 230, xmin: 0, xmax: 5, ymin: 0, ymax: 3, xlabel: tr('時間 （年）', 'time (years)'), ylabel: 'ΔT_s （K）', xd: 2, yd: 2 });

function reset() { Ts = oneLayer(phiAbs(), eps).Ts; t = 0; tPushed = -1; plotT.reset(); }

/** 地表温度を dt 秒進める（大気はすばやく放射平衡：T_a⁴ = T_s⁴/2） */
function step(dt) {
  const B = restoringB(eps, Ts) + 1e-9, n = Math.max(1, Math.ceil(dt / (0.05 * CA() / B)));
  for (let k = 0; k < n; k++) Ts += ((phiAbs() - (1 - eps / 2) * SIGMA * Ts ** 4) * (dt / n)) / CA();
  t += dt;
}

// --- 放射の図 ---
const cv = $('diag');
let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = cv.parentElement.clientWidth || 600, hh = Math.round(Math.min(340, Math.max(260, w * 0.45)));
  cv.style.width = w + 'px'; cv.style.height = hh + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { resize(); drawDiag(); }).observe(cv.parentElement);
resize();

function arrow(ctx, x, y0, y1, phi, color, label, side = 1, ly = null) {
  const W = Math.max(2, (phi / 400) * 22) * dpr, dir = Math.sign(y1 - y0), head = 9 * dpr;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.fillRect(x - W / 2, Math.min(y0, y1 - dir * head), W, Math.abs(y1 - dir * head - y0));
  ctx.beginPath(); ctx.moveTo(x - W / 2 - 5 * dpr, y1 - dir * head); ctx.lineTo(x + W / 2 + 5 * dpr, y1 - dir * head); ctx.lineTo(x, y1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1f1f1f'; ctx.font = `${(cv.width / dpr < 560 ? 11 : 12) * dpr}px sans-serif`; ctx.textBaseline = 'middle';
  ctx.textAlign = side > 0 ? 'left' : 'right';
  const lines = label.split('\n');
  const yc = ly ?? (y0 + y1) / 2;
  lines.forEach((l, k) => ctx.fillText(l, x + side * (W / 2 + 8 * dpr), yc + (k - (lines.length - 1) / 2) * 15 * dpr));
}

function drawDiag() {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f2f4fa'; ctx.fillRect(0, 0, W, H);                                   // 宇宙
  const yA0 = H * 0.36, yA1 = H * 0.52, yS = H * 0.84;
  ctx.fillStyle = 'rgba(218,227,243,0.95)'; ctx.fillRect(0, yA0, W, yA1 - yA0);          // 大気の層
  ctx.fillStyle = '#d9cfb8'; ctx.fillRect(0, yS, W, H - yS);                               // 地表
  const Ta = Ts * Math.pow(0.5, 0.25), up = SIGMA * Ts ** 4, atm = eps * SIGMA * Ta ** 4, abs = phiAbs();
  const compact = W / dpr < 560;   // スマホ幅ではラベルを短く
  ctx.fillStyle = '#1f1f1f'; ctx.font = `${(compact ? 11 : 13) * dpr}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(tr('宇宙', 'Space'), 8 * dpr, 6 * dpr);
  ctx.fillText(tr(`大気 T_a = ${fmt(Ta, 1)} K`, `Atmosphere T_a = ${fmt(Ta, 1)} K`), 8 * dpr, yA0 + 4 * dpr);
  ctx.fillText(tr(`地表 T_s = ${fmt(Ts, 1)} K`, `Surface T_s = ${fmt(Ts, 1)} K`), 8 * dpr, yS + 6 * dpr);
  const xs = (compact ? [0.42, 0.58, 0.74, 0.92] : [0.3, 0.5, 0.68, 0.9]).map((f) => f * W);
  const L = compact
    ? [tr('太陽', 'Sun'), tr('地表', 'Surface'), tr('通過', 'Through'), tr('大気', 'Atm.'), tr('大気', 'Atm.')]
    : [tr('太陽', 'Sun'), tr('地表 σT_s⁴', 'Surface σT_s⁴'), tr('通り抜け', 'Passes through'), tr('大気 εσT_a⁴', 'Atm. εσT_a⁴'), tr('大気 εσT_a⁴', 'Atm. εσT_a⁴')];
  arrow(ctx, xs[0], 4 * dpr, yS, abs, '#f0a32b', `${L[0]}\n${fmt(abs, 0)}`, -1, yA0 * 0.55);
  arrow(ctx, xs[1], yS, yA1, up, '#d6453d', `${L[1]}\n${fmt(up, 0)}`, 1);
  arrow(ctx, xs[1], yA0, 4 * dpr, (1 - eps) * up, '#e8877f', `${L[2]}\n${fmt((1 - eps) * up, 0)}`, 1);
  arrow(ctx, xs[2], yA0, 4 * dpr, atm, '#8a5bd6', `${L[3]}\n${fmt(atm, 0)}`, 1);
  arrow(ctx, xs[3], yA1, yS, atm, '#8a5bd6', `${L[4]}\n${fmt(atm, 0)}`, -1);
}

function update() {
  const abs = phiAbs(), Te = effectiveTemp(abs), eq = oneLayer(abs, eps), Ta = Ts * Math.pow(0.5, 0.25);
  const out = (1 - eps / 2) * SIGMA * Ts ** 4, imb = abs - out;
  $('r-abs').textContent = fmt(abs, 1); $('r-Te').textContent = `${fmt(Te, 1)} K`;
  $('r-Ts').textContent = `${fmt(Ts, 1)} K`; $('r-Tseq').textContent = `${fmt(eq.Ts, 1)} K`;
  $('r-imb').textContent = `${fmtSigned(imb, 2)} W m⁻²`;
  const net = SIGMA * Ts ** 4 * eps - eps * SIGMA * Ta ** 4;   // 地表 → 大気の正味（地表が吸収されるぶん − 大気から受け取るぶん）
  $('r-dir').innerHTML = (Math.abs(imb) < 0.05 ? tr('<b>定常状態</b>：入る放射と出る放射がつり合い、温度は変わらない。', '<b>Steady state</b>: incoming and outgoing radiation balance, and the temperature does not change.')
    : imb > 0 ? tr('<b>入る方が多い</b>：地球にエネルギーがたまり、地表の温度が上がっていく。', '<b>More comes in</b>: energy accumulates on Earth and the surface temperature rises.')
      : tr('<b>出る方が多い</b>：地球からエネルギーが減り、地表の温度が下がっていく。', '<b>More goes out</b>: Earth loses energy and the surface temperature falls.')) +
    tr(` 地表と大気の間の正味の放射は、暖かい地表から冷たい大気へ ${fmt(net, 0)} W m⁻²（下向きの放射より、地表が大気へ渡す放射の方が多い）。`, ` The net radiation between surface and atmosphere is ${fmt(net, 0)} W m⁻² from the warm surface to the cold atmosphere (the surface gives the atmosphere more than the downward radiation returns).`);
  if (t !== tPushed) { plotT.push(t / YEAR, { Ts, eq: eq.Ts, Te }); tPushed = t; }
  // CO₂ とフィードバック
  const dF = co2Forcing(co2), B = restoringB(eps, eq.Ts), k = B - fb, CAv = CA();
  $('r-F').textContent = `${fmt(dF, 2)} W m⁻²`; $('r-B').textContent = `${fmt(B, 2)} W m⁻² K⁻¹`;
  $('r-dT').textContent = k > 0 ? `${fmt(dF / k, 2)} K` : tr('定まらない（暴走）', 'undefined (runaway)');
  $('r-tau').textContent = k > 0 ? tr(`${fmt(CAv / k / YEAR, 2)} 年`, `${fmt(CAv / k / YEAR, 2)} years`) : '–';
  $('r-bb').textContent = `${fmt(dF / (4 * SIGMA * effectiveTemp(abs) ** 3), 2)} K`;
  const tmax = k > 0 ? Math.min(500, Math.max(1, (5 * CAv) / Math.min(B, k) / YEAR)) : 5;   // 遅い方の時定数に合わせる
  Object.assign(plotR.opt, { xmax: tmax, ymax: k > 0 ? Math.max(1, (dF / k) * 1.3, (dF / B) * 1.3) : 5 });
  plotR.refs = [{ label: tr('f = 0（フィードバックなし）', 'f = 0 (no feedback)'), color: '#77756f', dash: [6, 4], fn: (y) => linearResponse(y * YEAR, dF, B, 0, CAv) }];
  if (k > 0) plotR.refs.push({ label: `f = ${fmt(fb, 1)}`, color: '#d6453d', fn: (y) => linearResponse(y * YEAR, dF, B, fb, CAv) });
  plotR.draw();
}

bindRange('S0', (v) => { S0 = v; }, (v) => v.toFixed(0), false);
bindRange('alb', (v) => { alb = v; }, (v) => v.toFixed(2), false);
bindRange('eps', (v) => { eps = v; }, (v) => v.toFixed(2), false);
bindRange('h', (v) => { h = v; }, (v) => v.toFixed(0), false);
bindRange('co2', (v) => { co2 = v; }, (v) => v.toFixed(1), false);
bindRange('fb', (v) => { fb = v; }, (v) => v.toFixed(1), false);
bindRange('speed', (v) => { yrPerSec = Math.pow(10, v); }, (v) => (Math.pow(10, v) < 1 ? Math.pow(10, v).toFixed(2) : Math.pow(10, v).toFixed(1)));
$('btn-reset').addEventListener('click', reset);
reset();

let frame = 0;
const loop = new Loop((paused) => {
  if (!paused) { step((yrPerSec * YEAR) / 60); frame++; }
  if (frame % 2 === 0 || paused) { update(); plotT.draw(); drawDiag(); }
});
bindPlayPause('btn-play', loop);
