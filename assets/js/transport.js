// =============================================================
//  transport.js ― 沈降と拡散：平衡の分布と、そこへ近づく速さ（教科書 4.5 節、21 のページ）
//  DOM に依存しない（ページとテストの両方から使う）
//
//  無次元の量：高さ x = z/H（0 = 底、1 = 上）、時間 τ = tD/H²、濃度は容器の平均で割った c
//  粒子の流れ（上向き正）  j = −∂c/∂x − Pe·c、  ∂c/∂τ = −∂j/∂x、  底と上で j = 0
//    Pe = P/r、P = m_b g H/kT（重力の強さ）、r = D/(b kT)（アインシュタインの関係なら r = 1）
//  平衡は j = 0 から c ∝ e^{−Pe·x}。r ≠ 1 だと平衡の分布がボルツマン分布 e^{−P x} からずれる
// =============================================================

/** B(z) = z/(e^z − 1)（シャーフェッター–グンメルの流れの係数。z → 0 で 1） */
export function bernoulli(z) {
  if (Math.abs(z) < 1e-5) return 1 - z / 2 + (z * z) / 12;
  return z / Math.expm1(z);
}

/** n 個の層の平衡の濃度（層ごとの平均、容器の平均 = 1）。Pe > 0 で底ほど濃い */
export function sedimentEq(n, Pe) {
  const c = new Float64Array(n);
  if (Math.abs(Pe) < 1e-10) { c.fill(1); return c; }
  const q = Math.abs(Pe);
  for (let i = 0; i < n; i++) {
    // 層 [i/n, (i+1)/n] での e^{−q x} の平均を、全体の平均で割る
    const v = (Math.exp((-q * i) / n) * -Math.expm1(-q / n) * n) / -Math.expm1(-q);
    c[Pe > 0 ? i : n - 1 - i] = v;
  }
  return c;
}

/** 平衡からの自由エネルギーの差（粒子1個あたり、kT 単位）：∫ c ln(c/c_eq) dx ≥ 0 */
export function excessF(c, ceq) {
  let s = 0;
  for (let i = 0; i < c.length; i++) if (c[i] > 0) s += c[i] * Math.log(c[i] / ceq[i]);
  return s / c.length;
}

/**
 * 1次元の沈降と拡散（式 4.8）を、n 個の層で解く。
 * 流れは層の境目ごとに j_{i+1/2} = (B(h·Pe) c_i − B(−h·Pe) c_{i+1})/h（平衡を厳密に保つ書き方）、
 * 時間は陰解法（後退オイラー）で進めるので、刻み dτ を大きくしても安定で、粒子数と濃度の非負性を保つ
 */
export class Sediment1D {
  constructor({ n = 120, P = 5, r = 1, init = 'uniform' } = {}) {
    this.n = n; this.P = P; this.r = r; this.t = 0;
    this.c = new Float64Array(n);
    this.reset(init);
  }
  get Pe() { return this.P / this.r; }
  reset(init = 'uniform') {
    const n = this.n;
    if (init === 'top') { this.c.fill(0); const m = Math.max(1, Math.round(n / 10)); for (let i = n - m; i < n; i++) this.c[i] = n / m; }
    else this.c.fill(1);
    this.t = 0;
  }
  equilibrium() { return sedimentEq(this.n, this.Pe); }
  /** 時間 dτ だけ進める（陰解法：(I − dτ A) c_new = c を三重対角で解く） */
  step(dt) {
    const n = this.n, h = 1 / n, a = bernoulli(this.Pe * h) / h, b = bernoulli(-this.Pe * h) / h;
    // 層 i の変化 = (j_{i−1/2} − j_{i+1/2})/h、j_{i+1/2} = a c_i − b c_{i+1}
    const lo = new Float64Array(n), di = new Float64Array(n), up = new Float64Array(n), rhs = Float64Array.from(this.c);
    for (let i = 0; i < n; i++) {
      let d = 0;
      if (i > 0) { lo[i] = (-dt * a) / h; d += b; }        // 下の境目から入る：+ (a c_{i−1} − b c_i)/h
      if (i < n - 1) { up[i] = (-dt * b) / h; d += a; }    // 上の境目から出る：− (a c_i − b c_{i+1})/h
      di[i] = 1 + (dt * d) / h;
    }
    // トーマス法
    for (let i = 1; i < n; i++) { const w = lo[i] / di[i - 1]; di[i] -= w * up[i - 1]; rhs[i] -= w * rhs[i - 1]; }
    this.c[n - 1] = rhs[n - 1] / di[n - 1];
    for (let i = n - 2; i >= 0; i--) this.c[i] = (rhs[i] - up[i] * this.c[i + 1]) / di[i];
    this.t += dt;
  }
  /** 層の境目での流れ（上向き正）：拡散の分 −∂c/∂x、重力の分 −Pe·c、合計（解くのに使う形） */
  fluxes() {
    const n = this.n, h = 1 / n, a = bernoulli(this.Pe * h) / h, b = bernoulli(-this.Pe * h) / h, out = [];
    for (let i = 0; i < n - 1; i++) {
      const x = (i + 1) * h, c0 = this.c[i], c1 = this.c[i + 1];
      out.push({ x, diff: -(c1 - c0) / h, drift: (-this.Pe * (c0 + c1)) / 2, total: a * c0 - b * c1 });
    }
    return out;
  }
  mass() { let s = 0; for (const v of this.c) s += v; return s / this.n; }
  excessF() { return excessF(this.c, sedimentEq(this.n, this.P)); }   // ボルツマン分布（正しい平衡）からの差
}

/**
 * ブラウン運動の粒子（高さ x、0〜1）を dτ だけ進める：x += −Pe dτ + √(2dτ) ξ、底と上で鏡のように跳ね返る
 * gauss() は平均 0、分散 1 の乱数を返す関数
 */
export function brownianStep(xs, Pe, dt, gauss) {
  const s = Math.sqrt(2 * dt);
  for (let i = 0; i < xs.length; i++) {
    let x = xs[i] - Pe * dt + s * gauss();
    // 跳ね返り（大きくはみ出しても戻るよう繰り返す）
    for (let k = 0; k < 4 && (x < 0 || x > 1); k++) { if (x < 0) x = -x; if (x > 1) x = 2 - x; }
    xs[i] = Math.min(1, Math.max(0, x));
  }
}

/**
 * 例題4の粒子（直径 1 µm、密度差 50 kg/m³、水 25 °C）で、無次元の量を実際の長さ・時間に直す
 * D = kT/(6πηa)、重力長 ℓ_g = kT/(m_b g) = 16.0 µm。P > 0 なら容器の高さ H = P ℓ_g、時間の目安 H²/D
 */
export const EX4 = (() => {
  const kT = 1.380649e-23 * 298, a = 0.5e-6, eta = 1e-3, drho = 50, g = 9.81;
  const mb = drho * (4 / 3) * Math.PI * a ** 3, D = kT / (6 * Math.PI * eta * a), lg = kT / (mb * g);
  return { kT, a, eta, drho, mb, D, lg };
})();
export function realScales(P) {
  if (!(Math.abs(P) > 1e-9)) return null;
  const H = Math.abs(P) * EX4.lg;
  return { H, tD: (H * H) / EX4.D };
}
