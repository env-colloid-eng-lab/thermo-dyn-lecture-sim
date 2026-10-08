// =============================================================
//  levels.js ― 高さによるエネルギーの段差がある気体の理論（DOM 非依存）
//    11 の二領域・沈降平衡のページとテストの両方から使う。k_B = 1。
//
//  二領域：同じ大きさの下の領域（エネルギー 0）と上の領域（エネルギー ΔE）に
//          N 個の粒子を分け、上にいる割合を x とする。
//    配置エントロピー  S_conf/N = −[x ln x + (1−x) ln(1−x)]
//    熱源（温度 T）に接触：自由エネルギー F = E − TS が最小 → x/(1−x) = e^{−ΔE/T}
//    孤立系（全エネルギー一定）：全体のエントロピーが最大 → 同じ式で、T は終わりの温度
//  多段：n 層に分け、下から k 番目の層のエネルギーが k·ΔE → 割合 ∝ e^{−kΔE/T}
//  二状態（広さの違う二領域）：上の領域の広さの割合を v2（下は v1 = 1 − v2）とすると
//    x/(1−x) = (v2/v1) e^{−ΔE/kT} = e^{−(ΔE − TΔs)/kT}、Δs = k ln(v2/v1)。x = 1/2 になる温度 T_m = ΔE/Δs
//  （以下の関数の v2 は省くと 1/2 ＝同じ大きさの二領域）
// =============================================================
import { lnGamma } from './entropy.js';

const xlnx = (x) => (x > 0 ? x * Math.log(x) : 0);

/** 配置エントロピー（1粒子あたり）。広さ v2, 1−v2 の二領域で、x = v2（一様）で最大 */
export function confS(x, v2 = 0.5) {
  const v1 = 1 - v2;
  return -((x > 0 ? x * Math.log(x / v2) : 0) + (x < 1 ? (1 - x) * Math.log((1 - x) / v1) : 0));
}

/** 熱源に接触した二領域：上にいる割合の平衡値 x/(1−x) = (v2/v1) e^{−ΔE/T} */
export function xEqBath(dE, T, v2 = 0.5) { return 1 / (1 + ((1 - v2) / v2) * Math.exp(dE / T)); }

/** 二状態：x = 1/2 になる温度 T_m = ΔE/ln(v2/v1)（v2 > 1/2, ΔE > 0 のとき） */
export function meltT(dE, v2) { return dE / Math.log(v2 / (1 - v2)); }

/**
 * 熱源（温度 T）に接触した二領域の自由エネルギー（1粒子あたり、x = 1/2 からの変化）
 *   F/N = xΔE − T S_conf(x) + 定数（速さの分布の部分は T 一定なので x によらない）
 */
export function twoRegionF(x, dE, T, v2 = 0.5) {
  return x * dE - T * confS(x, v2) - v2 * dE;   // 一様（x = v2）からの差
}

/**
 * 孤立した二領域の全エントロピー（1粒子あたり、x = 1/2 からの変化）
 *   e = 1粒子あたりの全エネルギー（運動＋位置）。2次元なので運動エネルギー/N = T、
 *   上へ x の割合を上げると T = e − xΔE、速さの部分のエントロピーは ln T。
 */
export function twoRegionS(x, dE, e, v2 = 0.5) {
  const T = e - x * dE, T0 = e - v2 * dE;
  if (T <= 0) return -Infinity;
  return confS(x, v2) + Math.log(T) - Math.log(T0);   // 一様（x = v2）からの差
}

/** 孤立した二領域で全エントロピーが最大になる x（dS/dx = ln((1−x)/x) − ΔE/T(x) = 0 を二分法で解く） */
export function xEqIsolated(dE, e, v2 = 0.5) {
  let lo = 1e-12, hi = 1 - 1e-12;
  if (dE > 0) hi = Math.min(hi, e / dE - 1e-12);
  const d = (x) => Math.log(((1 - x) * v2) / (x * (1 - v2))) - dE / (e - x * dE);
  for (let k = 0; k < 200; k++) {
    const m = 0.5 * (lo + hi);
    if (d(m) > 0) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** 多段：下から k 番目の層にいる割合 v_k e^{−kΔE/T} / Σ（v：層の広さの割合、省くと等しい） */
export function boltzmannLayers(n, dE, T, v) {
  const w = [];
  let z = 0;
  for (let k = 0; k < n; k++) { const x = (v ? v[k] : 1) * Math.exp((-k * dE) / T); w.push(x); z += x; }
  return w.map((v) => v / z);
}

/**
 * 孤立した多段の気体が平衡になったときの温度。1粒子あたりの全エネルギー e が
 *   e = T + ΔE ⟨k⟩_T（2次元なので運動エネルギー/N = T）を満たす T を二分法で求める
 */
export function tEqIsolatedLayers(n, dE, e) {
  const mean = (T) => boltzmannLayers(n, dE, T).reduce((a, p, k) => a + p * k, 0);
  let lo = 1e-6, hi = Math.max(1e-3, e - Math.min(0, (n - 1) * dE)) * 2 + 1;
  for (let k = 0; k < 200; k++) {
    const m = 0.5 * (lo + hi);
    if (m + dE * mean(m) > e) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}

/** 層ごとの粒子数 counts（実数でもよい）での自由エネルギー F = Σ N_k kΔE − T ln(N!/ΠN_k!)（定数を除く） */
export function layersF(counts, dE, T, v) {
  return counts.reduce((a, c, k) => a + c * k * dE, 0) - T * lnMultinomial(counts, v);
}

/** 孤立系：全エネルギー E のとき、層ごとの粒子数 counts での全エントロピー ln(N!/ΠN_k!) + N ln T（定数を除く） */
export function layersS(counts, dE, E, v) {
  const N = counts.reduce((a, c) => a + c, 0);
  const T = (E - counts.reduce((a, c, k) => a + c * k * dE, 0)) / N;
  return T > 0 ? lnMultinomial(counts, v) + N * Math.log(T) : -Infinity;
}

/**
 * 粒子の層への分け方の数の対数 ln( N! / Π N_k! )。層の広さが違うとき（割合 v_k）は、
 * 各層の中での置き方の多さ Σ N_k ln v_k を足す（広さが同じなら定数なので省ける）
 */
export function lnMultinomial(counts, v) {
  let N = 0, s = 0;
  counts.forEach((c, k) => { N += c; s -= lnGamma(c + 1); if (v) s += c * Math.log(v[k]); });
  return s + lnGamma(N + 1);
}
