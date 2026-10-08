// =============================================================
//  engine.js  ―  2次元剛体円板気体の分子動力学（教育用）
// -------------------------------------------------------------
//  単位系: 粒子質量 m = 1, ボルツマン定数 k_B = 1 の無次元単位
//  2次元・単原子なので 1粒子あたりの自由度は 2:
//      U = N k_B T ,  P V = N k_B T  (V は面積, P は単位長さあたりの力)
//      断熱準静的過程:  P V^γ = 一定,  γ = (f+2)/f = 2
//
//  符号の約束（講義スライドと同じ）:  ΔU = Q + W
//      W : 系(気体)が「された」仕事   Q : 系が「受け取った」熱
//
//  エネルギーの出入りはすべて「1回の衝突ごとの運動エネルギー変化」として
//  帳簿(ledger)に記録するので、ΔU = W + Q は数値誤差の範囲で厳密に成り立つ。
// =============================================================

export const ADIABATIC = 'adiabatic';   // 断熱壁: 鏡面反射（エネルギーを通さない）
export const DIATHERMAL = 'diathermal'; // 透熱壁: 熱源/相手と熱的に接触していればエネルギーを通す

// 再現性のある乱数
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAXN = 1200;

export class Gas {
  /**
   * @param {object} o
   *  H      容器の高さ
   *  X      ピストン（右壁）の初期位置 = 容器の幅
   *  Xmin, Xmax  ピストンの可動範囲
   *  r      粒子半径
   */
  constructor(o = {}) {
    this.H = o.H ?? 60;
    this.X = o.X ?? 100;
    this.Xmin = o.Xmin ?? 20;
    this.Xmax = o.Xmax ?? 120;
    this.r = o.r ?? 0.3;
    this.dt = o.dt ?? 0.1;
    this.rand = mulberry32(o.seed ?? 12345);

    // 粒子データ
    this.N = 0;
    this.x = new Float64Array(MAXN); this.y = new Float64Array(MAXN);
    this.vx = new Float64Array(MAXN); this.vy = new Float64Array(MAXN);
    this.px = new Float64Array(MAXN); this.py = new Float64Array(MAXN); // 1ステップ前の位置
    this.species = new Uint8Array(MAXN);   // 流体の種類（色分け用）
    this.region = new Uint8Array(MAXN);    // どの部分系にいるか (0..3)
    this.paddleSide = new Int8Array(MAXN);

    // 固定壁（左・上・下）の種類と熱源との接触。ピストン(右壁)は常に断熱。
    this.walls = { left: ADIABATIC, top: ADIABATIC, bottom: ADIABATIC };
    this.bath = { left: false, top: false, bottom: false };
    this.Tbath = 1.0;

    // ピストン（操作1）
    this.piston = { target: this.X, speed: 0.05, u: 0 };

    // 撹拌翼（操作2）
    this.stirrer = { on: false, present: false, omega: 0.08, theta: 0, cx: 30, cy: 30, L: 20 };

    // 仕切り壁: null または {x, type, Tw, Cw} / {y, type, Tw, Cw}
    this.vpart = null;
    this.hpart = null;

    this.time = 0;
    this.resetLedger();
    this.heatEvents = [];   // 熱のやりとりの可視化用 {x,y,dE,t}
    this.tracer = [];       // 粒子0の軌跡
    this.tracerOn = false;

    // 圧力測定（運動量輸送の時間平均）
    this.pTau = o.pTau ?? 15;
    this._imp = { piston: 0, all: 0, reg: new Float64Array(4) };
    this.P = { piston: NaN, all: NaN, reg: new Float64Array(4).fill(NaN) };
    this._lastMeasure = 0;
    this._acc = { w: 0, piston: 0, all: 0, reg: new Float64Array(4) };

    // 格子（衝突判定用）
    this._cell = Math.max(2 * this.r, 1.5);
    this._gx = Math.ceil(this.Xmax / this._cell) + 2;
    this._gy = Math.ceil(this.H / this._cell) + 2;
    this._head = new Int32Array(this._gx * this._gy);
    this._next = new Int32Array(MAXN);
  }

  // ------------------------------------------------------------
  //  初期化まわり
  // ------------------------------------------------------------
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.rand();
    v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  clear() { this.N = 0; this.tracer = []; }

  /** 長方形領域に n 個の粒子を温度 T で（重ならないように）置く */
  addParticles(n, T, rect, species = 0) {
    const r = this.r, start = this.N;
    const x0 = rect.x0 + r * 1.2, x1 = rect.x1 - r * 1.2;
    const y0 = rect.y0 + r * 1.2, y1 = rect.y1 - r * 1.2;
    for (let k = 0; k < n && this.N < MAXN; k++) {
      let xx = 0, yy = 0, ok = false;
      for (let tries = 0; tries < 200 && !ok; tries++) {
        xx = x0 + (x1 - x0) * this.rand();
        yy = y0 + (y1 - y0) * this.rand();
        ok = true;
        for (let j = 0; j < this.N; j++) {
          const dx = this.x[j] - xx, dy = this.y[j] - yy;
          if (dx * dx + dy * dy < 4.4 * r * r) { ok = false; break; }
        }
      }
      const i = this.N++;
      this.x[i] = this.px[i] = xx; this.y[i] = this.py[i] = yy;
      this.vx[i] = this.gauss(); this.vy[i] = this.gauss();
      this.species[i] = species;
      this.paddleSide[i] = 0;
    }
    const idx = [];
    for (let i = start; i < this.N; i++) idx.push(i);
    this.setTemperature(idx, T);
    this._updateRegions();
    this.resetLedger();
    return idx;
  }

  /** 指定粒子群の重心運動を除き、温度がちょうど T になるよう速度をスケール */
  setTemperature(idx, T) {
    if (!idx.length) return;
    let mx = 0, my = 0;
    for (const i of idx) { mx += this.vx[i]; my += this.vy[i]; }
    mx /= idx.length; my /= idx.length;
    let ke = 0;
    for (const i of idx) {
      this.vx[i] -= mx; this.vy[i] -= my;
      ke += 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2);
    }
    const s = Math.sqrt((T * idx.length) / Math.max(ke, 1e-12)); // 2D: KE = N T
    for (const i of idx) { this.vx[i] *= s; this.vy[i] *= s; }
  }

  indicesInRegion(reg) {
    const a = [];
    for (let i = 0; i < this.N; i++) if (this.region[i] === reg) a.push(i);
    return a;
  }

  resetLedger() {
    this.ledger = {
      Wpiston: 0,   // ピストンが気体にした仕事
      Wstir: 0,     // 撹拌翼が気体にした仕事
      Q: 0,         // 熱源から気体が受け取った熱
      Qreg: new Float64Array(4),     // 部分系ごとの熱（熱源＋透熱仕切りから）
      Wreg: new Float64Array(4),     // 部分系ごとの仕事
      U0: this.kinetic(),
      U0reg: this.regionEnergies(),
      t0: this.time,
    };
  }

  kinetic() {
    let ke = 0;
    for (let i = 0; i < this.N; i++) ke += 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2);
    return ke;
  }

  regionEnergies() {
    const e = new Float64Array(4);
    for (let i = 0; i < this.N; i++) e[this.region[i]] += 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2);
    return e;
  }

  // ------------------------------------------------------------
  //  仕切り壁
  // ------------------------------------------------------------
  setVPartition(x, type = ADIABATIC) {
    if (x == null) { this.vpart = null; this._updateRegions(); return; }
    const old = this.vpart;
    this.vpart = { x, type, Tw: old?.Tw ?? this._meanT(), Cw: 30 };
    for (let i = 0; i < this.N; i++) this.px[i] = this.x[i];
    this._updateRegions();
  }
  setHPartition(y, type = ADIABATIC) {
    if (y == null) { this.hpart = null; this._updateRegions(); return; }
    const old = this.hpart;
    this.hpart = { y, type, Tw: old?.Tw ?? this._meanT(), Cw: 30 };
    for (let i = 0; i < this.N; i++) this.py[i] = this.y[i];
    this._updateRegions();
  }
  _meanT() { return this.N ? this.kinetic() / this.N : 1; }

  regionOf(x, y) {
    let g = 0;
    if (this.vpart && x > this.vpart.x) g += 1;
    if (this.hpart && y > this.hpart.y) g += 2;
    return g;
  }
  _updateRegions() {
    for (let i = 0; i < this.N; i++) this.region[i] = this.regionOf(this.x[i], this.y[i]);
  }

  /** 部分系 g の長方形 {x0,x1,y0,y1} */
  regionRect(g) {
    const vx = this.vpart ? this.vpart.x : null;
    const hy = this.hpart ? this.hpart.y : null;
    const right = g & 1, low = g & 2;
    return {
      x0: right ? vx : 0,
      x1: right ? this.X : (vx ?? this.X),
      y0: low ? hy : 0,
      y1: low ? this.H : (hy ?? this.H),
    };
  }
  activeRegions() {
    const a = [0];
    if (this.vpart) a.push(1);
    if (this.hpart) { a.push(2); if (this.vpart) a.push(3); }
    return a;
  }

  // ------------------------------------------------------------
  //  壁との衝突
  // ------------------------------------------------------------
  /** 熱壁（温度 T）での散乱: 法線成分は流束重み付きマクスウェル分布、接線成分はガウス分布 */
  _thermalVelocity(nx, ny, T) {
    const s = Math.sqrt(T);
    const vn = s * Math.sqrt(-2 * Math.log(1 - this.rand()));
    const vt = s * this.gauss();
    return [vn * nx - vt * ny, vn * ny + vt * nx];
  }

  _logHeat(x, y, dE) {
    if (Math.abs(dE) < 1e-9) return;
    this.heatEvents.push({ x, y, dE, t: this.time });
    if (this.heatEvents.length > 400) this.heatEvents.splice(0, this.heatEvents.length - 400);
  }

  /** 固定壁 side での反射。nx,ny は気体側を向く法線 */
  _wallHit(i, side, nx, ny) {
    const vx0 = this.vx[i], vy0 = this.vy[i];
    const e0 = 0.5 * (vx0 * vx0 + vy0 * vy0);
    if (this.walls[side] === DIATHERMAL && this.bath[side]) {
      const [a, b] = this._thermalVelocity(nx, ny, this.Tbath);
      this.vx[i] = a; this.vy[i] = b;
      const dE = 0.5 * (a * a + b * b) - e0;
      this.ledger.Q += dE;
      this.ledger.Qreg[this.region[i]] += dE;
      this._logHeat(this.x[i], this.y[i], dE);
    } else {
      if (nx !== 0) this.vx[i] = -vx0; else this.vy[i] = -vy0;
    }
    const imp = Math.abs((this.vx[i] - vx0) * nx + (this.vy[i] - vy0) * ny);
    this._imp.all += imp;
    this._imp.reg[this.region[i]] += imp;
  }

  /** 仕切り壁での反射。透熱なら壁の内部自由度（温度 Tw, 熱容量 Cw）とエネルギー交換 */
  _partHit(i, part, nx, ny) {
    const vx0 = this.vx[i], vy0 = this.vy[i];
    let done = false;
    if (part.type === DIATHERMAL) {
      const e0 = 0.5 * (vx0 * vx0 + vy0 * vy0);
      const [a, b] = this._thermalVelocity(nx, ny, part.Tw);
      const dE = 0.5 * (a * a + b * b) - e0;
      const Tw2 = part.Tw - dE / part.Cw;
      if (Tw2 > 0.02) {
        this.vx[i] = a; this.vy[i] = b; part.Tw = Tw2;
        this.ledger.Qreg[this.region[i]] += dE;
        this._logHeat(this.x[i], this.y[i], dE);
        done = true;
      }
    }
    if (!done) { if (nx !== 0) this.vx[i] = -vx0; else this.vy[i] = -vy0; }
    const imp = Math.abs((this.vx[i] - vx0) * nx + (this.vy[i] - vy0) * ny);
    this._imp.reg[this.region[i]] += imp;
  }

  // ------------------------------------------------------------
  //  時間発展
  // ------------------------------------------------------------
  /** nsub × dt だけ時間を進める。速い粒子がいるときは自動的に刻みを細かくする */
  step(nsub = 1) { this.advance(nsub * this.dt); }

  /** 時間 t だけ進める（表示の速さを自由に変えられるよう、刻み dt 未満でもよい） */
  advance(t) {
    let remain = t;
    while (remain > 1e-12) {
      let v2 = 0;
      for (let i = 0; i < this.N; i++) {
        const w = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
        if (w > v2) v2 = w;
      }
      let vmax = Math.sqrt(v2) + Math.abs(this.piston.speed);
      if (this.stirrer.present && this.stirrer.on) vmax += Math.abs(this.stirrer.omega) * this.stirrer.L / 2;
      const h = Math.min(this.dt, remain, (0.5 * this.r) / Math.max(vmax, 1e-9));
      this._substep(h);
      remain -= h;
    }
  }

  _substep(dt) {
    const r = this.r, H = this.H, N = this.N;

    // --- ピストンを目標位置に向けて一定速度で動かす（操作1） ---
    const pst = this.piston;
    let lo = this.Xmin;
    if (this.vpart) lo = Math.max(lo, this.vpart.x + 4 * r);
    if (this.stirrer.present) lo = Math.max(lo, this.stirrer.cx + this.stirrer.L / 2 + 3);
    const tgt = Math.min(this.Xmax, Math.max(lo, pst.target));
    const diff = tgt - this.X;
    const stepMax = pst.speed * dt;
    let u;
    if (Math.abs(diff) <= stepMax) u = diff / dt; else u = Math.sign(diff) * pst.speed;
    this.X += u * dt;
    pst.u = u;
    const X = this.X;

    // --- 撹拌翼の回転 ---
    const st = this.stirrer;
    if (st.present && st.on) st.theta += st.omega * dt;

    // --- 自由飛行 ---
    for (let i = 0; i < N; i++) {
      this.px[i] = this.x[i]; this.py[i] = this.y[i];
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }

    // --- 仕切り壁 ---
    const vp = this.vpart, hp = this.hpart;
    if (vp) {
      const c = vp.x;
      for (let i = 0; i < N; i++) {
        const left = this.px[i] < c;
        if (left && this.x[i] > c - r) {
          if (this.vx[i] > 0) { this._partHit(i, vp, -1, 0); }
          this.x[i] = Math.min(this.x[i], c - r) - Math.max(0, this.x[i] - (c - r));
        } else if (!left && this.x[i] < c + r) {
          if (this.vx[i] < 0) { this._partHit(i, vp, 1, 0); }
          this.x[i] = Math.max(this.x[i], c + r) + Math.max(0, (c + r) - this.x[i]);
        }
      }
    }
    if (hp) {
      const c = hp.y;
      for (let i = 0; i < N; i++) {
        const up = this.py[i] < c;
        if (up && this.y[i] > c - r) {
          if (this.vy[i] > 0) { this._partHit(i, hp, 0, -1); }
          this.y[i] = Math.min(this.y[i], c - r) - Math.max(0, this.y[i] - (c - r));
        } else if (!up && this.y[i] < c + r) {
          if (this.vy[i] < 0) { this._partHit(i, hp, 0, 1); }
          this.y[i] = Math.max(this.y[i], c + r) + Math.max(0, (c + r) - this.y[i]);
        }
      }
    }

    // --- 外壁とピストン ---
    for (let i = 0; i < N; i++) {
      if (this.x[i] < r) {
        if (this.vx[i] < 0) this._wallHit(i, 'left', 1, 0);
        this.x[i] = 2 * r - this.x[i];
      }
      if (this.y[i] < r) {
        if (this.vy[i] < 0) this._wallHit(i, 'top', 0, 1);
        this.y[i] = 2 * r - this.y[i];
      } else if (this.y[i] > H - r) {
        if (this.vy[i] > 0) this._wallHit(i, 'bottom', 0, -1);
        this.y[i] = 2 * (H - r) - this.y[i];
      }
      if (this.x[i] > X - r) {
        const v0 = this.vx[i];
        if (v0 > u) {
          // 質量無限大の動く壁との弾性衝突: v' = 2u - v
          const v1 = 2 * u - v0;
          this.vx[i] = v1;
          const dE = 0.5 * (v1 * v1 - v0 * v0);   // = 2u(u - v0)
          this.ledger.Wpiston += dE;
          this.ledger.Wreg[this.region[i]] += dE;
          const imp = v0 - v1;
          this._imp.piston += imp; this._imp.all += imp; this._imp.reg[this.region[i]] += imp;
          this.x[i] = 2 * (X - r) - this.x[i];
        } else {
          this.x[i] = X - r;
        }
      }
      // 念のためのクランプ
      if (this.x[i] < r) this.x[i] = r;
      if (this.x[i] > X - r) this.x[i] = X - r;
      if (this.y[i] < r) this.y[i] = r;
      if (this.y[i] > H - r) this.y[i] = H - r;
    }

    // --- 撹拌翼（操作2）: 回転する板との弾性衝突 ---
    if (st.present) this._stir();

    // --- 部分系の判定 ---
    this._updateRegions();

    // --- 粒子間衝突 ---
    this._collide();

    this.time += dt;

    if (this.tracerOn && N > 0) {
      this.tracer.push([this.x[0], this.y[0]]);
      if (this.tracer.length > 600) this.tracer.shift();
    }
  }

  _stir() {
    const st = this.stirrer, r = this.r, N = this.N;
    const ex = Math.cos(st.theta), ey = Math.sin(st.theta);
    const nx = -ey, ny = ex;
    const half = st.L / 2;
    const w = st.on ? st.omega : 0;
    for (let i = 0; i < N; i++) {
      const rx = this.x[i] - st.cx, ry = this.y[i] - st.cy;
      const s = rx * ex + ry * ey;
      const d = rx * nx + ry * ny;
      if (Math.abs(s) > half + r) { this.paddleSide[i] = 0; continue; }
      const sd = d >= 0 ? 1 : -1;
      let side = this.paddleSide[i] || sd;
      const crossed = this.paddleSide[i] !== 0 && sd !== this.paddleSide[i] && Math.abs(d) < 2.5;
      if (Math.abs(s) <= half && (Math.abs(d) < r || crossed)) {
        // 接触点での板の速度 = ω s n
        const vpn = w * s;
        const vn = this.vx[i] * nx + this.vy[i] * ny;
        const rel = vn - vpn;
        if (rel * side < 0 || crossed) {
          const e0 = 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2);
          const dv = -2 * rel;
          this.vx[i] += dv * nx; this.vy[i] += dv * ny;
          const dE = 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2) - e0;
          this.ledger.Wstir += dE;
          this.ledger.Wreg[this.region[i]] += dE;
        }
        // 板の正しい側へ押し戻す
        this.x[i] = st.cx + s * ex + side * r * nx;
        this.y[i] = st.cy + s * ey + side * r * ny;
        this.paddleSide[i] = side;
      } else {
        this.paddleSide[i] = sd;
      }
    }
  }

  _collide() {
    const N = this.N, cs = this._cell, gx = this._gx, gy = this._gy;
    const head = this._head, next = this._next;
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const cx = Math.min(gx - 1, Math.max(0, (this.x[i] / cs) | 0));
      const cy = Math.min(gy - 1, Math.max(0, (this.y[i] / cs) | 0));
      const c = cy * gx + cx;
      next[i] = head[c]; head[c] = i;
    }
    const d2max = 4 * this.r * this.r;
    for (let i = 0; i < N; i++) {
      const cx = Math.min(gx - 1, Math.max(0, (this.x[i] / cs) | 0));
      const cy = Math.min(gy - 1, Math.max(0, (this.y[i] / cs) | 0));
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy; if (yy < 0 || yy >= gy) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox; if (xx < 0 || xx >= gx) continue;
          for (let j = head[yy * gx + xx]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            if (this.region[i] !== this.region[j]) continue; // 仕切りの向こう側とは衝突しない
            const dx = this.x[i] - this.x[j], dy = this.y[i] - this.y[j];
            const d2 = dx * dx + dy * dy;
            if (d2 >= d2max || d2 === 0) continue;
            const dvx = this.vx[i] - this.vx[j], dvy = this.vy[i] - this.vy[j];
            const dot = dx * dvx + dy * dvy;
            if (dot >= 0) continue;          // 離れつつある
            const f = dot / d2;              // 等質量の弾性衝突
            this.vx[i] -= f * dx; this.vy[i] -= f * dy;
            this.vx[j] += f * dx; this.vy[j] += f * dy;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------
  //  測定
  // ------------------------------------------------------------
  /** 毎フレーム呼ぶ: 壁に与えた運動量から圧力を時間平均で求める */
  measure() {
    const el = this.time - this._lastMeasure;
    if (el <= 0) return;
    // 指数重み付きの時間平均（立ち上がりのバイアスなし）:
    //   P = Σ e^{-(t-t_k)/τ} (力積_k / 周長) / Σ e^{-(t-t_k)/τ} Δt_k
    const dec = Math.exp(-el / this.pTau);
    const A = this._acc;
    const H = this.H, X = this.X;
    A.w = A.w * dec + el;
    A.piston = A.piston * dec + this._imp.piston / H;
    A.all = A.all * dec + this._imp.all / (2 * X + 2 * H);
    for (let g = 0; g < 4; g++) {
      const R = this.regionRect(g);
      const per = 2 * (R.x1 - R.x0) + 2 * (R.y1 - R.y0);
      A.reg[g] = A.reg[g] * dec + (per > 0 ? this._imp.reg[g] / per : 0);
      this.P.reg[g] = per > 0 ? A.reg[g] / A.w : NaN;
    }
    this.P.piston = A.piston / A.w;
    this.P.all = A.all / A.w;
    this._imp.piston = 0; this._imp.all = 0; this._imp.reg.fill(0);
    this._lastMeasure = this.time;
  }

  resetPressure() {
    this.P.piston = NaN; this.P.all = NaN; this.P.reg.fill(NaN);
    this._imp.piston = 0; this._imp.all = 0; this._imp.reg.fill(0);
    this._acc = { w: 0, piston: 0, all: 0, reg: new Float64Array(4) };
    this._lastMeasure = this.time;
  }

  /** 全体のマクロ量 */
  stats() {
    const U = this.kinetic();
    const V = this.X * this.H;
    const N = this.N;
    const T = N ? U / N : 0;
    const L = this.ledger;
    return {
      N, V, U, T,
      Pkin: N ? U / V : 0,        // 状態方程式 P = NkT/V（2D: = U/V）
      Pwall: this.P.all,           // 壁全体が受ける力から測った圧力
      Ppiston: this.P.piston,      // ピストンが受ける力から測った圧力
      W: L.Wpiston + L.Wstir,
      Wpiston: L.Wpiston, Wstir: L.Wstir,
      Q: L.Q + (this._partitionHeatTotal()),
      Qbath: L.Q,
      dU: U - L.U0,
    };
  }

  _partitionHeatTotal() {
    // 透熱仕切りから気体全体へ流れた正味のエネルギー（= 仕切り壁の内部エネルギー減少）
    let s = 0;
    for (let g = 0; g < 4; g++) s += this.ledger.Qreg[g];
    return s - this.ledger.Q;
  }

  /** 部分系ごとのマクロ量 */
  regionStats(g) {
    const R = this.regionRect(g);
    const V = Math.max(0, (R.x1 - R.x0) * (R.y1 - R.y0));
    let n = 0, U = 0;
    for (let i = 0; i < this.N; i++) if (this.region[i] === g) {
      n++; U += 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2);
    }
    return {
      N: n, V, U, T: n ? U / n : NaN, Pkin: V > 0 ? U / V : NaN, Pwall: this.P.reg[g],
      dU: U - this.ledger.U0reg[g], Q: this.ledger.Qreg[g], W: this.ledger.Wreg[g],
    };
  }

  speeds(filter) {
    const a = [];
    for (let i = 0; i < this.N; i++) {
      if (filter && !filter(i)) continue;
      a.push(Math.hypot(this.vx[i], this.vy[i]));
    }
    return a;
  }
}

/** 2次元マクスウェル–ボルツマン分布（速さ v の確率密度, m=k=1） */
export function mb2d(v, T) { return (v / T) * Math.exp(-(v * v) / (2 * T)); }
