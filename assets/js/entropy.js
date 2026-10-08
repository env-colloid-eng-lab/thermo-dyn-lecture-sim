// =============================================================
//  entropy.js ― エントロピーの計算に使う小さな関数（DOM 非依存）
//  k_B = 1 の単位。ln は自然対数。
// =============================================================

// ln Γ(x)（Lanczos 近似, x > 0）
const LG = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let k = 0; k < 8; k++) a += LG[k] / (x + k + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** ln C(n, k) = ln( n! / (k!(n-k)!) )。k は実数でもよい（グラフ用） */
export function lnChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/** n 個の粒子が左右に分かれるとき、左に k 個いる確率 C(n,k)/2^n */
export function binomHalf(n, k) { return Math.exp(lnChoose(n, k) - n * Math.LN2); }

/**
 * 2次元理想気体のエントロピー（定数を除く）: S = N k ln(V T / N) + 定数
 * （C_V = Nk なので温度の項は N ln T、体積の項は N ln V）
 */
export function idealGasS(N, V, T) { return N > 0 ? N * Math.log((V * T) / N) : 0; }
