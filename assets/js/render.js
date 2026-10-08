// =============================================================
//  render.js ― 容器・壁・ピストン・粒子の描画
//  図の約束は講義スライドに合わせる:
//    斜線の帯 = 断熱壁 / 細い実線 = 透熱壁 / 薄い青 = 流体
// =============================================================
import { ADIABATIC, DIATHERMAL, SEMIPERMEABLE } from './engine.js';
import { tr } from './i18n.js';

export const COLORS = {
  fluid: '#DAE3F3',
  wall: '#2F5597',
  particle: '#4472C4',
  particle2Fill: '#F4F4F4',
  particle2Stroke: '#7F7F7F',
  arrow: 'rgba(90,90,90,0.75)',
  hot: '#d6453d',
  cold: '#2a78d6',
  tracer: '#eb6834',
  bathHot: '#fbe1dc',
  bathCold: '#dce8fb',
  text: '#1f1f1f',
  muted: '#5f5e5a',
};

function lerp(a, b, t) { return a + (b - a) * t; }
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
const C_COLD = hex('#2a78d6'), C_MID = hex('#c9c8c3'), C_HOT = hex('#e34948');
/** 速さ→色（基準温度より遅い=青、速い=赤、中間=灰）*/
export function speedColor(v, Tref) {
  const ke = 0.5 * v * v;
  let t = Math.log2(Math.max(ke, 1e-6) / Tref) / 2.5; // -1..1 付近
  t = Math.max(-1, Math.min(1, t));
  const a = t < 0 ? C_COLD : C_HOT;
  const k = Math.abs(t);
  return `rgb(${Math.round(lerp(C_MID[0], a[0], k))},${Math.round(lerp(C_MID[1], a[1], k))},${Math.round(lerp(C_MID[2], a[2], k))})`;
}

/** 温度に応じた熱源の色 */
function bathColor(T, Tref) {
  const t = Math.max(-1, Math.min(1, Math.log2(T / Tref)));
  const a = t < 0 ? hex('#cfe0fa') : hex('#fad3cc');
  const w = [252, 251, 248];
  const k = Math.abs(t);
  return `rgb(${Math.round(lerp(w[0], a[0], k))},${Math.round(lerp(w[1], a[1], k))},${Math.round(lerp(w[2], a[2], k))})`;
}

export class SimView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./engine.js').Gas} gas
   * @param {object} opt
   *   colorMode: 'species' | 'speed'
   *   arrows: bool, Tref: number, showHeat: bool
   *   bathPad: 左に熱源ブロックを置く余白, envPad: 周囲に環境枠を置く余白
   *   regionLabels: bool
   */
  constructor(canvas, gas, opt = {}) {
    this.c = canvas; this.g = gas;
    this.opt = Object.assign({
      colorMode: 'species', arrows: false, Tref: 1, showHeat: true,
      bathPad: 0, envPad: 0, regionLabels: false, pistonRod: true, drawScale: 2.0,
    }, opt);
    this.wt = 2.4;   // 壁の厚さ（世界座標）
    this.pt = 3.0;   // ピストンの厚さ
    this._pattern = null;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
  }

  worldBounds() {
    const g = this.g, wt = this.wt, o = this.opt;
    const x0 = -wt - o.bathPad - o.envPad - 1;
    const x1 = g.Xmax + this.pt + (o.pistonRod ? 10 : 2) + o.envPad;
    const y0 = -wt - o.envPad - 1;
    const y1 = g.H + wt + o.envPad + 1;
    return { x0, x1, y0, y1 };
  }

  resize() {
    const b = this.worldBounds();
    const cssW = this.c.parentElement.clientWidth || 600;
    const aspect = (b.y1 - b.y0) / (b.x1 - b.x0);
    const cssH = Math.round(cssW * aspect);
    const dpr = window.devicePixelRatio || 1;
    this.c.style.width = cssW + 'px';
    this.c.style.height = cssH + 'px';
    this.c.width = Math.round(cssW * dpr);
    this.c.height = Math.round(cssH * dpr);
    this.s = (cssW * dpr) / (b.x1 - b.x0);
    this.ox = -b.x0 * this.s; this.oy = -b.y0 * this.s;
    this.dpr = dpr;
    this._pattern = null;
  }

  X(x) { return this.ox + x * this.s; }
  Y(y) { return this.oy + y * this.s; }

  hatch(ctx) {
    if (this._pattern) return this._pattern;
    const n = Math.max(6, Math.round(7 * this.dpr));
    const pc = document.createElement('canvas');
    pc.width = pc.height = n;
    const p = pc.getContext('2d');
    p.fillStyle = '#ffffff'; p.fillRect(0, 0, n, n);
    p.strokeStyle = COLORS.wall; p.lineWidth = Math.max(1, 1.1 * this.dpr);
    p.beginPath();
    p.moveTo(0, n); p.lineTo(n, 0);
    p.moveTo(-n / 2, n / 2); p.lineTo(n / 2, -n / 2);
    p.moveTo(n / 2, n * 1.5); p.lineTo(n * 1.5, n / 2);
    p.stroke();
    this._pattern = ctx.createPattern(pc, 'repeat');
    return this._pattern;
  }

  /** 壁（長方形の帯）を描く。type が断熱なら斜線、透熱なら細線 */
  wallRect(ctx, x, y, w, h, type, thinSide) {
    if (type === ADIABATIC) {
      ctx.fillStyle = this.hatch(ctx);
      ctx.fillRect(this.X(x), this.Y(y), w * this.s, h * this.s);
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 1.2 * this.dpr;
      ctx.strokeRect(this.X(x), this.Y(y), w * this.s, h * this.s);
    } else {
      // 透熱壁: 細い帯（中を白く抜いた細線）
      let xx = x, yy = y, ww = w, hh = h;
      const th = this.wt * 0.35;
      if (thinSide === 'left') { xx = x + w - th; ww = th; }
      if (thinSide === 'top') { yy = y + h - th; hh = th; }
      if (thinSide === 'bottom') { hh = th; }
      if (thinSide === 'center-v') { xx = x + w / 2 - th / 2; ww = th; }
      if (thinSide === 'center-h') { yy = y + h / 2 - th / 2; hh = th; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.X(xx), this.Y(yy), ww * this.s, hh * this.s);
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 1.4 * this.dpr;
      ctx.strokeRect(this.X(xx), this.Y(yy), ww * this.s, hh * this.s);
    }
  }

  draw() {
    const ctx = this.c.getContext('2d');
    const g = this.g, o = this.opt, s = this.s, wt = this.wt, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.c.width, this.c.height);
    const fontPx = Math.max(11, 13 * dpr * Math.min(1.6, this.c.width / (900 * dpr) + 0.5));

    // --- 環境（温度一定の環境におく）---
    const allBath = g.bath.left && g.bath.top && g.bath.bottom;
    if (o.envPad > 0 && allBath) {
      const e = o.envPad - 1;
      ctx.fillStyle = bathColor(g.Tbath, o.Tref);
      ctx.fillRect(this.X(-wt - e), this.Y(-wt - e), (g.Xmax + this.pt + wt + 2 * e + 4) * s, (g.H + 2 * wt + 2 * e) * s);
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 1.2 * dpr;
      ctx.strokeRect(this.X(-wt - e), this.Y(-wt - e), (g.Xmax + this.pt + wt + 2 * e + 4) * s, (g.H + 2 * wt + 2 * e) * s);
      ctx.fillStyle = COLORS.text; ctx.font = `italic ${fontPx * 1.1}px serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${tr('環境', 'surroundings')} T = ${g.Tbath.toFixed(2)}`, this.X(g.Xmax + this.pt + e + 2), this.Y(g.H + wt + e) - 4 * dpr);
    }
    // --- 熱源ブロック（左壁に接触）---
    if (o.bathPad > 0 && g.bath.left && !allBath) {
      const bx0 = -wt - o.bathPad, bw = o.bathPad - 1.2;
      ctx.fillStyle = bathColor(g.Tbath, o.Tref);
      ctx.fillRect(this.X(bx0), this.Y(0), bw * s, g.H * s);
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 1.2 * dpr;
      ctx.strokeRect(this.X(bx0), this.Y(0), bw * s, g.H * s);
      ctx.fillStyle = COLORS.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${fontPx}px sans-serif`;
      ctx.fillText(tr('熱源', 'reservoir'), this.X(bx0 + bw / 2), this.Y(g.H / 2) - fontPx * 0.9);
      ctx.font = `italic ${fontPx * 1.15}px serif`;
      ctx.fillText(`T=${g.Tbath.toFixed(2)}`, this.X(bx0 + bw / 2), this.Y(g.H / 2) + fontPx * 0.5);
    }

    // --- 流体 ---
    ctx.fillStyle = COLORS.fluid;
    ctx.fillRect(this.X(0), this.Y(0), g.X * s, g.H * s);

    // --- 高さによるエネルギーの段差（壁ではない）: 位置エネルギーの高い層ほど少し濃く、境目は灰色の点線 ---
    if (g.levels) {
      const L = g.levels, h = g.H / L.n, emax = Math.max(0, (L.n - 1) * L.dE), emin = Math.min(0, (L.n - 1) * L.dE);
      for (let k = 0; k < L.n; k++) {
        const y0 = g.H - (k + 1) * h, e = k * L.dE;
        const a = emax > emin ? (0.16 * (e - emin)) / (emax - emin) : 0;
        if (a > 0) { ctx.fillStyle = `rgba(47,85,151,${a.toFixed(3)})`; ctx.fillRect(this.X(0), this.Y(y0), g.X * s, h * s); }
      }
      ctx.strokeStyle = 'rgba(80,80,80,0.75)'; ctx.lineWidth = 1.3 * dpr; ctx.setLineDash([2 * dpr, 4 * dpr]);
      for (let k = 1; k < L.n; k++) {
        const y = g.H - k * h;
        ctx.beginPath(); ctx.moveTo(this.X(0), this.Y(y)); ctx.lineTo(this.X(g.X), this.Y(y)); ctx.stroke();
      }
      ctx.setLineDash([]);
      // 層のエネルギーの目盛り（層が多いときは上と下だけ）
      ctx.font = `${fontPx * 0.95}px sans-serif`; ctx.fillStyle = 'rgba(31,31,31,0.8)';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      for (let k = 0; k < L.n; k++) {
        if (L.n > 4 && k !== 0 && k !== L.n - 1) continue;
        const y0 = g.H - (k + 1) * h;
        ctx.fillText(`ε = ${(k * L.dE).toFixed(2)}`, this.X(g.X) - 6 * dpr, this.Y(y0) + 3 * dpr);
      }
    }

    // --- 外壁（左・上・下）。上下の壁はシリンダとしてピストンの外まで伸ばす ---
    const xEnd = g.Xmax + this.pt + 1;
    this.wallRect(ctx, -wt, 0, wt, g.H, g.walls.left, 'left');
    this.wallRect(ctx, -wt, -wt, xEnd + wt, wt, g.walls.top, 'top');
    this.wallRect(ctx, -wt, g.H, xEnd + wt, wt, g.walls.bottom, 'bottom');
    // 角
    ctx.fillStyle = this.hatch(ctx);

    // --- 仕切り壁 ---
    const pw = 1.4;
    if (g.vpart && g.vpart.type === SEMIPERMEABLE) {
      // 半透膜：破線（溶媒は通り抜ける）
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 2.2 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(this.X(g.vpart.x), this.Y(0)); ctx.lineTo(this.X(g.vpart.x), this.Y(g.H)); ctx.stroke();
      ctx.setLineDash([]);
    } else if (g.vpart) this.wallRect(ctx, g.vpart.x - pw / 2, 0, pw, g.H, g.vpart.type, 'center-v');
    if (g.hpart) this.wallRect(ctx, 0, g.hpart.y - pw / 2, g.X, pw, g.hpart.type, 'center-h');

    // --- 熱のやりとりの可視化 ---
    if (o.showHeat) {
      const now = g.time, life = 8;
      for (const ev of g.heatEvents) {
        const age = now - ev.t;
        if (age > life || age < 0) continue;
        const a = 1 - age / life;
        const rad = (0.6 + 1.4 * Math.min(1, Math.sqrt(Math.abs(ev.dE) / (o.Tref * 2)))) * (1 + 0.6 * age / life) * s;
        ctx.beginPath();
        ctx.arc(this.X(ev.x), this.Y(ev.y), rad, 0, Math.PI * 2);
        ctx.strokeStyle = ev.dE > 0 ? `rgba(214,69,61,${a})` : `rgba(42,120,214,${a})`;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
    }

    // --- 軌跡 ---
    if (g.tracerOn && g.tracer.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.X(g.tracer[0][0]), this.Y(g.tracer[0][1]));
      for (let k = 1; k < g.tracer.length; k++) ctx.lineTo(this.X(g.tracer[k][0]), this.Y(g.tracer[k][1]));
      ctx.strokeStyle = 'rgba(235,104,52,0.8)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }

    // --- 粒子 ---
    const rd = Math.max(g.r * o.drawScale * s, 2.2 * dpr);
    for (let i = 0; i < g.N; i++) {
      const X = this.X(g.x[i]), Y = this.Y(g.y[i]);
      ctx.beginPath();
      ctx.arc(X, Y, rd, 0, Math.PI * 2);
      if (o.colorMode === 'speed') {
        ctx.fillStyle = speedColor(Math.hypot(g.vx[i], g.vy[i]), o.Tref);
        ctx.fill();
      } else if (g.species[i] === 1) {
        ctx.fillStyle = COLORS.particle2Fill; ctx.fill();
        ctx.strokeStyle = COLORS.particle2Stroke; ctx.lineWidth = 1 * dpr; ctx.stroke();
      } else {
        ctx.fillStyle = COLORS.particle; ctx.fill();
      }
    }
    if (o.arrows) {
      const k = 2.2 * s / Math.sqrt(o.Tref);
      ctx.strokeStyle = COLORS.arrow; ctx.fillStyle = COLORS.arrow;
      ctx.lineWidth = 1.3 * dpr;
      const step = g.N > 300 ? 2 : 1;
      for (let i = 0; i < g.N; i += step) {
        const X = this.X(g.x[i]), Y = this.Y(g.y[i]);
        const ex = X + g.vx[i] * k, ey = Y + g.vy[i] * k;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(ex, ey); ctx.stroke();
        const ang = Math.atan2(ey - Y, ex - X), h = 3.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - h * Math.cos(ang - 0.5), ey - h * Math.sin(ang - 0.5));
        ctx.lineTo(ex - h * Math.cos(ang + 0.5), ey - h * Math.sin(ang + 0.5));
        ctx.closePath(); ctx.fill();
      }
    }
    if (g.tracerOn && g.N > 0) {
      ctx.beginPath();
      ctx.arc(this.X(g.x[0]), this.Y(g.y[0]), rd * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.tracer; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }

    // --- 撹拌翼（上から見た図）---
    const st = g.stirrer;
    if (st.present) {
      const ex = Math.cos(st.theta), ey = Math.sin(st.theta), h = st.L / 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(5 * dpr, 1.4 * s);
      ctx.beginPath();
      ctx.moveTo(this.X(st.cx - ex * h), this.Y(st.cy - ey * h));
      ctx.lineTo(this.X(st.cx + ex * h), this.Y(st.cy + ey * h));
      ctx.stroke();
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = Math.max(2 * dpr, 0.5 * s);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(this.X(st.cx), this.Y(st.cy), Math.max(3 * dpr, 0.9 * s), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.wall; ctx.fill();
      if (st.on) {
        // 回転方向の矢印
        const R = (h + 2) * s, a0 = st.theta + 0.3, a1 = a0 + Math.sign(st.omega || 1) * 0.9;
        ctx.beginPath(); ctx.arc(this.X(st.cx), this.Y(st.cy), R, Math.min(a0, a1), Math.max(a0, a1));
        ctx.strokeStyle = 'rgba(47,85,151,0.6)'; ctx.lineWidth = 2 * dpr; ctx.stroke();
      }
    }

    // --- ピストン（常に断熱）---
    this.wallRect(ctx, g.X, 0, this.pt, g.H, ADIABATIC);
    if (o.pistonRod) {
      const yRod = g.H / 2;
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(this.X(g.X + this.pt), this.Y(yRod));
      ctx.lineTo(this.X(g.Xmax + this.pt + 9), this.Y(yRod));
      ctx.stroke();
      if (g.piston.mode === 'force') {
        // おもりを載せたピストン：外から一定の圧力で押されている
        const xa = g.X + this.pt + 1.5, L = 6 * s, X0 = this.X(xa), Y0 = this.Y(yRod) - 4.5 * s;
        ctx.strokeStyle = COLORS.hot; ctx.fillStyle = COLORS.hot; ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath(); ctx.moveTo(X0 + L, Y0); ctx.lineTo(X0 + 6 * dpr, Y0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0 + 7 * dpr, Y0 - 5 * dpr); ctx.lineTo(X0 + 7 * dpr, Y0 + 5 * dpr); ctx.closePath(); ctx.fill();
      }
      // 動いているとき矢印
      const u = g.piston.u;
      if (Math.abs(u) > 1e-6 && g.piston.mode !== 'force') {
        const xa = g.Xmax + this.pt + 6, dir = Math.sign(u);
        const L = 3 * s;
        const X0 = this.X(xa), Y0 = this.Y(yRod) - 3.2 * s;
        ctx.strokeStyle = COLORS.hot; ctx.fillStyle = COLORS.hot; ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath(); ctx.moveTo(X0 - dir * L, Y0); ctx.lineTo(X0 + dir * L, Y0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X0 + dir * (L + 6 * dpr), Y0);
        ctx.lineTo(X0 + dir * L, Y0 - 5 * dpr); ctx.lineTo(X0 + dir * L, Y0 + 5 * dpr); ctx.closePath(); ctx.fill();
      }
    }

    // --- 部分系の番号 ---
    if (o.regionLabels && (g.vpart || g.hpart)) {
      ctx.font = `${fontPx * 1.4}px sans-serif`;
      ctx.fillStyle = 'rgba(31,31,31,0.75)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const reg of g.activeRegions()) {
        const R = g.regionRect(reg);
        ctx.fillText(String(reg + 1), this.X(R.x0) + 6 * dpr, this.Y(R.y0) + 4 * dpr);
      }
    }
  }
}
