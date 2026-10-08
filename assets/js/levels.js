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
// =============================================================
import { lnGamma } from './entropy.js';

const xlnx = (x) => (x > 0 ? x * Math.log(x) : 0);

/** 配置エントロピー（1粒子あたり）。x = 1/2 で最大 ln 2 */
export function confS(x) { return -(xlnx(x) + xlnx(1 - x)); }

/** 熱源に接触した二領域：上にいる割合の平衡値 x = 1/(1 + e^{ΔE/T}) */
export function xEqBath(dE, T) { return 1 / (1 + Math.exp(dE / T)); }

/**
 * 熱源（温度 T）に接触した二領域の自由エネルギー（1粒子あたり、x = 1/2 からの変化）
 *   F/N = xΔE − T S_conf(x) + 定数（速さの分布の部分は T 一定なので x によらない）
 */
export function twoRegionF(x, dE, T) {
  return x * dE - T * confS(x) - (0.5 * dE - T * Math.LN2);
}

/**
 * 孤立した二領域の全エントロピー（1粒子あたり、x = 1/2 からの変化）
 *   e = 1粒子あたりの全エネルギー（運動＋位置）。2次元なので運動エネルギー/N = T、
 *   上へ x の割合を上げると T = e − xΔE、速さの部分のエントロピーは ln T。
 */
export function twoRegionS(x, dE, e) {
  const T = e - x * dE, T0 = e - 0.5 * dE;
  if (T <= 0) return -Infinity;
  return confS(x) + Math.log(T) - (Math.LN2 + Math.log(T0));
}

/** 孤立した二領域で全エントロピーが最大になる x（dS/dx = ln((1−x)/x) − ΔE/T(x) = 0 を二分法で解く） */
export function xEqIsolated(dE, e) {
  let lo = 1e-12, hi = 1 - 1e-12;
  if (dE > 0) hi = Math.min(hi, e / dE - 1e-12);
  const d = (x) => Math.log((1 - x) / x) - dE / (e - x * dE);
  for (let k = 0; k < 200; k++) {
    const m = 0.5 * (lo + hi);
    if (d(m) > 0) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** 多段：下から k 番目の層にいる割合 e^{−kΔE/T} / Σ */
export function boltzmannLayers(n, dE, T) {
  const w = [];
  let z = 0;
  for (let k = 0; k < n; k++) { const v = Math.exp((-k * dE) / T); w.push(v); z += v; }
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
export function layersF(counts, dE, T) {
  return counts.reduce((a, c, k) => a + c * k * dE, 0) - T * lnMultinomial(counts);
}

/** 孤立系：全エネルギー E のとき、層ごとの粒子数 counts での全エントロピー ln(N!/ΠN_k!) + N ln T（定数を除く） */
export function layersS(counts, dE, E) {
  const N = counts.reduce((a, c) => a + c, 0);
  const T = (E - counts.reduce((a, c, k) => a + c * k * dE, 0)) / N;
  return T > 0 ? lnMultinomial(counts) + N * Math.log(T) : -Infinity;
}

/** 粒子の層への分け方の数の対数 ln( N! / Π N_k! )（層の大きさは同じ） */
export function lnMultinomial(counts) {
  let N = 0, s = 0;
  for (const c of counts) { N += c; s -= lnGamma(c + 1); }
  return s + lnGamma(N + 1);
}
