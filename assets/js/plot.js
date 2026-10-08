// =============================================================
//  plot.js ― 依存ライブラリなしの小さなグラフ部品
//    TimePlot : 時系列（ホバーで値を表示）
//    XYPlot   : P–V 図など（参照曲線＋軌跡＋面積の塗り）
//    HistPlot : 速さの分布＋理論曲線
// =============================================================
import { tr } from './i18n.js';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7'];
const INK = '#1f1f1f', INK2 = '#5f5e5a', GRID = '#e6e5e0', AXIS = '#b9b8b2';

function niceStep(range, n = 5) {
  const raw = range / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
function fmtTick(v, step) {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(d, 4));
}

class Base {
  constructor(canvas, opt) {
    this.c = canvas;
    this.opt = Object.assign({ height: 200, xlabel: '', ylabel: '', title: '' }, opt);
    this.hover = null;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas.parentElement);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.hover = { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr };
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.c.parentElement.clientWidth || 300;
    const h = this.opt.height;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.fs = 12 * dpr;
    this.m = { l: 52 * dpr, r: 14 * dpr, t: (this.opt.title ? 24 : 12) * dpr, b: 36 * dpr };
  }
  frame(ctx, xmin, xmax, ymin, ymax) {
    const { l, r, t, b } = this.m, W = this.c.width, H = this.c.height;
    const pw = W - l - r, ph = H - t - b;
    const sx = (v) => l + ((v - xmin) / (xmax - xmin)) * pw;
    const sy = (v) => t + ph - ((v - ymin) / (ymax - ymin)) * ph;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.font = `${this.fs}px sans-serif`;
    // grid + ticks
    const ys = niceStep(ymax - ymin, 4);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(ymin / ys) * ys; v <= ymax + 1e-12; v += ys) {
      ctx.beginPath(); ctx.moveTo(l, sy(v)); ctx.lineTo(l + pw, sy(v)); ctx.stroke();
      ctx.fillText(fmtTick(v, ys), l - 6 * this.dpr, sy(v));
    }
    const xs = niceStep(xmax - xmin, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(xmin / xs) * xs; v <= xmax + 1e-12; v += xs) {
      ctx.fillText(fmtTick(v, xs), sx(v), t + ph + 5 * this.dpr);
    }
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath(); ctx.moveTo(l, t); ctx.lineTo(l, t + ph); ctx.lineTo(l + pw, t + ph); ctx.stroke();
    // labels
    ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(this.opt.xlabel, l + pw, H - 2 * this.dpr);
    ctx.save(); ctx.translate(12 * this.dpr, t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.opt.ylabel, 0, 0); ctx.restore();
    if (this.opt.title) {
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = `bold ${this.fs}px sans-serif`;
      ctx.fillText(this.opt.title, l, 4 * this.dpr);
      ctx.font = `${this.fs}px sans-serif`;
    }
    return { sx, sy, pw, ph };
  }
  legend(ctx, items) {
    // 右上に凡例（線の見本＋テキスト）
    const { r, t } = this.m, W = this.c.width;
    let x = W - r - 4 * this.dpr, y = t + 2 * this.dpr;
    ctx.font = `${this.fs}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    for (const it of items) {
      const tw = ctx.measureText(it.label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x - tw - 26 * this.dpr, y - 1, tw + 28 * this.dpr, this.fs + 4);
      ctx.fillStyle = INK; ctx.fillText(it.label, x, y);
      ctx.strokeStyle = it.color; ctx.lineWidth = 2.5 * this.dpr;
      ctx.setLineDash(it.dash ? it.dash.map((d) => d * this.dpr) : []);
      ctx.beginPath(); ctx.moveTo(x - tw - 22 * this.dpr, y + this.fs / 2); ctx.lineTo(x - tw - 6 * this.dpr, y + this.fs / 2); ctx.stroke();
      ctx.setLineDash([]);
      y += this.fs + 6 * this.dpr;
    }
  }
}

export class TimePlot extends Base {
  /** opt.series: [{key,label,color,dash}], opt.window: 表示する時間幅 */
  constructor(canvas, opt) {
    super(canvas, Object.assign({ window: 400, xlabel: tr('時間 t', 'time t'), yZero: false, ymin: null, ymax: null }, opt));
    this.data = [];
  }
  reset() { this.data = []; this.draw(); }
  push(t, obj) {
    this.data.push([t, obj]);
    const w = this.opt.window;
    while (this.data.length > 2 && this.data[0][0] < t - w * 1.05) this.data.shift();
    if (this.data.length > 1500) this.data.splice(0, this.data.length - 1500);
  }
  draw() {
    const ctx = this.c.getContext('2d');
    const d = this.data, S = this.opt.series;
    const t0 = d.length ? d[0][0] : 0;
    const tmax = d.length ? Math.max(d[d.length - 1][0], t0 + this.opt.window) : this.opt.window;
    const tmin = tmax - this.opt.window;
    let ymin = Infinity, ymax = -Infinity;
    for (const [, o] of d) for (const s of S) { const v = o[s.key]; if (Number.isFinite(v)) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); } }
    if (!Number.isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (this.opt.yZero) { ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0); }
    if (this.opt.ymin != null) ymin = Math.min(ymin, this.opt.ymin);
    if (this.opt.ymax != null) ymax = Math.max(ymax, this.opt.ymax);
    const pad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.1 || 1;
    ymin -= pad; ymax += pad;
    const { sx, sy } = this.frame(ctx, tmin, tmax, ymin, ymax);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.m.l, this.m.t, this.c.width - this.m.l - this.m.r, this.c.height - this.m.t - this.m.b); ctx.clip();
    if (ymin < 0 && ymax > 0) {
      ctx.strokeStyle = AXIS; ctx.lineWidth = 1 * this.dpr;
      ctx.beginPath(); ctx.moveTo(this.m.l, sy(0)); ctx.lineTo(this.c.width - this.m.r, sy(0)); ctx.stroke();
    }
    for (const s of S) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2 * this.dpr;
      ctx.setLineDash(s.dash ? s.dash.map((v) => v * this.dpr) : []);
      ctx.beginPath();
      let first = true;
      for (const [t, o] of d) {
        const v = o[s.key]; if (!Number.isFinite(v)) { first = true; continue; }
        if (first) { ctx.moveTo(sx(t), sy(v)); first = false; } else ctx.lineTo(sx(t), sy(v));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    this.legend(ctx, S);
    // hover: crosshair + values
    if (this.hover && d.length) {
      const tt = tmin + ((this.hover.x - this.m.l) / (this.c.width - this.m.l - this.m.r)) * (tmax - tmin);
      let best = d[0];
      for (const p of d) if (Math.abs(p[0] - tt) < Math.abs(best[0] - tt)) best = p;
      const X = sx(best[0]);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1 * this.dpr;
      ctx.beginPath(); ctx.moveTo(X, this.m.t); ctx.lineTo(X, this.c.height - this.m.b); ctx.stroke();
      const lines = [`t = ${best[0].toFixed(0)}`].concat(S.map((s) => `${s.label}: ${Number.isFinite(best[1][s.key]) ? best[1][s.key].toFixed(3) : '-'}`));
      ctx.font = `${this.fs}px sans-serif`;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12 * this.dpr;
      const h = lines.length * (this.fs + 4 * this.dpr) + 8 * this.dpr;
      let bx = X + 8 * this.dpr; if (bx + w > this.c.width) bx = X - w - 8 * this.dpr;
      const by = this.m.t + 4 * this.dpr;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = AXIS;
      ctx.fillRect(bx, by, w, h); ctx.strokeRect(bx, by, w, h);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, k) => ctx.fillText(l, bx + 6 * this.dpr, by + 4 * this.dpr + k * (this.fs + 4 * this.dpr)));
      S.forEach((s, k) => { ctx.beginPath(); ctx.arc(X, sy(best[1][s.key]), 4 * this.dpr, 0, 7); ctx.fillStyle = s.color; ctx.fill(); });
    }
  }
}

export class XYPlot extends Base {
  /**
   * opt: xmin,xmax,ymin,ymax（ymaxはnullで自動）
   * refs: [{label,color,dash,fn}]  参照曲線 y = fn(x)
   * paths: [{label,color,pts:[[x,y]],fill:bool,closed:bool,ends:bool}]
   */
  constructor(canvas, opt) {
    super(canvas, Object.assign({ xmin: 0, xmax: 1, ymin: 0, ymax: null }, opt));
    this.refs = []; this.paths = []; this.marker = null;
  }
  draw() {
    const ctx = this.c.getContext('2d');
    const o = this.opt;
    let ymax = o.ymax;
    if (ymax == null) {
      ymax = 0;
      for (const p of this.paths) for (const [, y] of p.pts) if (Number.isFinite(y)) ymax = Math.max(ymax, y);
      if (this.marker) ymax = Math.max(ymax, this.marker[1]);
      ymax = (ymax || 1) * 1.25;
    }
    const { sx, sy } = this.frame(ctx, o.xmin, o.xmax, o.ymin, ymax);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.m.l, this.m.t, this.c.width - this.m.l - this.m.r, this.c.height - this.m.t - this.m.b); ctx.clip();
    // 面積の塗り
    for (const p of this.paths) {
      // closed: 閉じた曲線の内側を塗る（サイクルが囲む面積 = 正味の仕事）
      if (!p.closed || p.pts.length < 3) continue;
      ctx.beginPath();
      p.pts.forEach(([x, y], k) => { if (k === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y)); });
      ctx.closePath();
      ctx.fillStyle = p.fillColor || 'rgba(235,104,52,0.15)'; ctx.fill();
    }
    for (const p of this.paths) {
      if (!p.fill || p.pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx(p.pts[0][0]), sy(0));
      for (const [x, y] of p.pts) ctx.lineTo(sx(x), sy(y));
      ctx.lineTo(sx(p.pts[p.pts.length - 1][0]), sy(0));
      ctx.closePath();
      ctx.fillStyle = p.fillColor || 'rgba(235,104,52,0.15)'; ctx.fill();
    }
    for (const r of this.refs) {
      ctx.strokeStyle = r.color; ctx.lineWidth = 1.6 * this.dpr;
      ctx.setLineDash(r.dash ? r.dash.map((v) => v * this.dpr) : []);
      ctx.beginPath();
      const n = 120;
      for (let k = 0; k <= n; k++) {
        const x = o.xmin + ((o.xmax - o.xmin) * k) / n;
        const y = r.fn(x);
        if (k === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const p of this.paths) {
      if (p.pts.length < 1) continue;
      ctx.strokeStyle = p.color; ctx.lineWidth = (p.width || 2) * this.dpr;
      ctx.setLineDash(p.dash ? p.dash.map((v) => v * this.dpr) : []);
      ctx.beginPath();
      p.pts.forEach(([x, y], k) => { if (k === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y)); });
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.ends) for (const [x, y] of [p.pts[0], p.pts[p.pts.length - 1]]) {
        ctx.beginPath(); ctx.arc(sx(x), sy(y), 4 * this.dpr, 0, 7); ctx.fillStyle = p.color; ctx.fill();
      }
    }
    if (this.marker) {
      ctx.beginPath(); ctx.arc(sx(this.marker[0]), sy(this.marker[1]), 5 * this.dpr, 0, 7);
      ctx.fillStyle = INK; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
    }
    ctx.restore();
    this.legend(ctx, this.refs.concat(this.paths.filter((p) => p.label)));
    if (this.hover) {
      const { l, r, t, b } = this.m;
      const x = o.xmin + ((this.hover.x - l) / (this.c.width - l - r)) * (o.xmax - o.xmin);
      const y = o.ymin + ((this.c.height - b - this.hover.y) / (this.c.height - t - b)) * (ymax - o.ymin);
      if (x >= o.xmin && x <= o.xmax && y >= o.ymin && y <= ymax) {
        const txt = `${o.xlabel.split(' ')[0]} = ${x.toFixed(o.xd ?? 0)},  ${o.ylabel.split(' ')[0]} = ${y.toFixed(o.yd ?? 4)}`;
        ctx.font = `${this.fs}px sans-serif`;
        const w = ctx.measureText(txt).width + 12 * this.dpr;
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(l + 6 * this.dpr, t + 4 * this.dpr, w, this.fs + 8 * this.dpr);
        ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(txt, l + 12 * this.dpr, t + 8 * this.dpr);
      }
    }
  }
}

export class HistPlot extends Base {
  constructor(canvas, opt) {
    super(canvas, Object.assign({ bins: 24, vmax: 5, xlabel: tr('速さ v', 'speed v'), ylabel: tr('割合（確率密度）', 'fraction (probability density)'), label: tr('粒子の速さ（ヒストグラム）', 'particle speeds (histogram)'), barColor: 'rgba(42,120,214,0.55)' }, opt));
    this.values = []; this.theory = null; this.color = SERIES[0];
  }
  set(values, theoryFn, vmax, ref) { this.values = values; this.theory = theoryFn; if (vmax) this.opt.vmax = vmax; this.ref = ref || null; }
  draw() {
    const ctx = this.c.getContext('2d');
    const { bins, vmax } = this.opt;
    const h = new Array(bins).fill(0), bw = vmax / bins;
    for (const v of this.values) { const k = Math.floor(v / bw); if (k >= 0 && k < bins) h[k]++; }
    const n = Math.max(1, this.values.length);
    const dens = h.map((c) => c / n / bw);
    let ymax = Math.max(...dens, 0.1);
    if (this.theory) for (let k = 0; k <= 60; k++) ymax = Math.max(ymax, this.theory((vmax * k) / 60));
    if (this.ref) for (let k = 0; k <= 60; k++) ymax = Math.max(ymax, this.ref.fn((vmax * k) / 60));
    ymax *= 1.15;
    const { sx, sy } = this.frame(ctx, 0, vmax, 0, ymax);
    const gap = 2 * this.dpr;
    ctx.fillStyle = this.opt.barColor;
    dens.forEach((d, k) => {
      const x0 = sx(k * bw) + gap / 2, x1 = sx((k + 1) * bw) - gap / 2;
      ctx.fillRect(x0, sy(d), Math.max(1, x1 - x0), sy(0) - sy(d));
    });
    if (this.theory) {
      ctx.strokeStyle = SERIES[1]; ctx.lineWidth = 2.2 * this.dpr;
      ctx.beginPath();
      for (let k = 0; k <= 100; k++) { const v = (vmax * k) / 100; const y = this.theory(v); if (k === 0) ctx.moveTo(sx(v), sy(y)); else ctx.lineTo(sx(v), sy(y)); }
      ctx.stroke();
    }
    if (this.ref) {
      ctx.strokeStyle = '#77756f'; ctx.lineWidth = 1.8 * this.dpr; ctx.setLineDash([6 * this.dpr, 4 * this.dpr]);
      ctx.beginPath();
      for (let k = 0; k <= 100; k++) { const v = (vmax * k) / 100; const y = this.ref.fn(v); if (k === 0) ctx.moveTo(sx(v), sy(y)); else ctx.lineTo(sx(v), sy(y)); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    this.legend(ctx, [{ label: this.opt.label, color: this.opt.barColor }]
      .concat(this.theory ? [{ label: tr('マクスウェル分布（いまの T）', 'Maxwell distribution (current T)'), color: SERIES[1] }] : [])
      .concat(this.ref ? [{ label: this.ref.label, color: '#77756f', dash: [6, 4] }] : []));
  }
}
