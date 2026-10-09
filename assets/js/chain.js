// =============================================================
//  chain.js ― 理想鎖（2次元の自由連結鎖）のエントロピー弾性（DOM 非依存）
//    13 のページとテストの両方から使う。k_B = 1。
//
//  長さ b の節 Ns 本を、向きを独立にでたらめに選んでつなぐ。末端の x 座標の分布は
//  多数の独立な寄与の和なので、ほぼガウス分布 P(x) ∝ exp(−x²/(2σ²))、σ² = ⟨x²⟩ = Ns b²/2（2次元）。
//  理想鎖では伸ばしても内部エネルギーは変わらないので、自由エネルギー F(x) = −kT ln P(x) + 定数、
//  ゆっくり伸ばすのに必要な力 f = dF/dx = kT x/σ² = 2kT x/(Ns b²)（3次元なら 3kT x/(Ns b²)）。
// =============================================================

/** 鎖を1本つくる。原点から始まる (Ns+1) 個の点 [[x,y], ...] を返す */
export function sampleChain(Ns, b, rand) {
  const pts = [[0, 0]];
  let x = 0, y = 0;
  for (let k = 0; k < Ns; k++) {
    const a = 2 * Math.PI * rand();
    x += b * Math.cos(a); y += b * Math.sin(a);
    pts.push([x, y]);
  }
  return pts;
}

/** 末端の位置だけを返す（たくさんサンプルするとき用） */
export function sampleEnd(Ns, b, rand) {
  let x = 0, y = 0;
  for (let k = 0; k < Ns; k++) { const a = 2 * Math.PI * rand(); x += b * Math.cos(a); y += b * Math.sin(a); }
  return [x, y];
}

/** 末端の x 座標の分散の理論値（2次元）σ² = Ns b²/2 */
export function chainVar(Ns, b) { return (Ns * b * b) / 2; }

/** ガウス近似の確率密度 P(x) */
export function chainP(x, Ns, b) {
  const s2 = chainVar(Ns, b);
  return Math.exp(-(x * x) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
}

/** 自由エネルギー（x = 0 からの差）F(x) − F(0) = kT x²/(2σ²) */
export function chainF(x, Ns, b, T) { return (T * x * x) / (2 * chainVar(Ns, b)); }

/** 伸ばした長さ x を保つのに必要な外からの力 f = kT x/σ² */
export function chainForce(x, Ns, b, T) { return (T * x) / chainVar(Ns, b); }
