// =============================================================
//  climate.js ― 応用ページ（14〜17）のマクロなモデル（DOM 非依存）
//    粒子ではなく、収支の式を解く。実際の大気（3次元の空気）の値を SI 単位で使う。
//    放射の流れ（面積あたり、W m⁻²）は Φ と書く（自由エネルギー F と区別するため）。
// =============================================================
export const SIGMA = 5.6704e-8;   // W m⁻² K⁻⁴
export const G = 9.81;            // m s⁻²
export const RD = 287.0;          // 乾燥空気の気体定数 J kg⁻¹ K⁻¹
export const CP = 1004.0;         // 乾燥空気の定圧比熱 J kg⁻¹ K⁻¹
export const RV = 461.0;          // 水蒸気の気体定数 J kg⁻¹ K⁻¹
export const LV = 2.5e6;          // 蒸発潜熱 J kg⁻¹（一定とする近似）
export const GAMMA_D = (G / CP) * 1000;   // 乾燥断熱減率 K km⁻¹（≈ 9.77）

// ---------------- 第5章：静水圧平衡・温位・安定性 ----------------
/**
 * 気温が高さとともに一定の割合 Γ（K km⁻¹）で下がる大気の、高さ z（km）での温度と圧力。
 * 静水圧平衡 dp/dz = −ρg と状態方程式 p = ρ R_d T から。Γ = 0 なら等温大気（指数関数）。
 */
export function lapseProfile(z, Ts, ps, gamma) {
  const T = Ts - gamma * z;
  if (Math.abs(gamma) < 1e-9) return { T: Ts, p: ps * Math.exp((-G * z * 1000) / (RD * Ts)) };
  return { T, p: ps * Math.pow(T / Ts, (G * 1000) / (RD * gamma)) };
}

/** 温位 θ = T (p₀/p)^{R_d/c_p} */
export function potentialTemp(T, p, p0 = 1000) { return T * Math.pow(p0 / p, RD / CP); }

/** 浮力振動数の2乗 N² = (g/T)(Γ_d − Γ_env)（s⁻²）。負なら不安定 */
export function bruntN2(T, gammaEnv) { return (G / T) * ((GAMMA_D - gammaEnv) / 1000); }

// ---------------- 第6・7章：放射収支・1層モデル・温度応答 ----------------
/** 全球平均の吸収太陽放射 Φ_abs = (1 − α) S₀ / 4 */
export function absorbedSolar(S0, albedo) { return ((1 - albedo) * S0) / 4; }

/** 有効放射温度 T_e = (Φ_abs/σ)^{1/4} */
export function effectiveTemp(phiAbs) { return Math.pow(phiAbs / SIGMA, 0.25); }

/** 1層灰色大気（赤外の吸収率 ε）の定常状態：T_s = T_e (1 − ε/2)^{−1/4}、T_a⁴ = T_s⁴/2 */
export function oneLayer(phiAbs, eps) {
  const Te = effectiveTemp(phiAbs);
  const Ts = Te * Math.pow(1 - eps / 2, -0.25);
  const Ta = Ts * Math.pow(0.5, 0.25);
  const up = SIGMA * Ts ** 4, atm = SIGMA * Ta ** 4;
  return { Te, Ts, Ta, surfaceUp: up, transmitted: (1 - eps) * up, atmUp: eps * atm, atmDown: eps * atm, olr: (1 - eps) * up + eps * atm };
}

/** 1層モデルでの地表温度の復元係数 B_s = 4(1 − ε/2) σ T_s³（W m⁻² K⁻¹） */
export function restoringB(eps, Ts) { return 4 * (1 - eps / 2) * SIGMA * Ts ** 3; }

/** CO₂ の放射強制力の近似式 ΔΦ = 5.35 ln(C/C₀)（W m⁻²） */
export function co2Forcing(ratio) { return 5.35 * Math.log(ratio); }

/** 線形応答 C_A dΔT/dt = ΔΦ − (B − f)ΔT の解（ΔT(0) = 0） */
export function linearResponse(t, dPhi, B, f, CA) {
  const k = B - f;
  if (k <= 0) return NaN;
  return (dPhi / k) * (1 - Math.exp((-k * t) / CA));
}

// ---------------- 第7章：相平衡・飽和水蒸気圧 ----------------
/** 飽和水蒸気圧（クラウジウス＝クラペイロン、潜熱一定）e_s(T) = e_s(T₀) exp[(L_v/R_v)(1/T₀ − 1/T)]（hPa） */
export function satVapor(T, T0 = 273.15, es0 = 6.11) { return es0 * Math.exp((LV / RV) * (1 / T0 - 1 / T)); }

/** 露点：e_s(T_d) = e となる温度 */
export function dewPoint(e, T0 = 273.15, es0 = 6.11) { return 1 / (1 / T0 - (RV / LV) * Math.log(e / es0)); }

/** 水 1 mol を液体から蒸気へ移すときのギブズ自由エネルギー変化 Δμ = RT ln(e/e_s)（J mol⁻¹）。負なら蒸発が進む */
export function deltaMuVapor(T, e, es) { return 8.314 * T * Math.log(e / es); }

// ---------------- 第8章：多層の灰色大気と対流調整 ----------------
/**
 * 灰色大気の長波フラックス（gray_layers.py と同じ計算）。層は下から上へ。
 *   U_i = t_i U_{i−1} + (1 − t_i) σT_i⁴（下から）、D_{i−1} = t_i D_i + (1 − t_i) σT_i⁴（上から）、D_n = 0
 * 返り値：境界ごとの上向き・下向き・正味上向き、層ごとの加熱（流入 − 流出）、地表の加熱
 */
export function grayFluxes(Ts, T, t, phiAbs) {
  const n = T.length, up = new Array(n + 1), down = new Array(n + 1).fill(0);
  up[0] = SIGMA * Ts ** 4;
  for (let i = 0; i < n; i++) up[i + 1] = t[i] * up[i] + (1 - t[i]) * SIGMA * T[i] ** 4;
  for (let i = n - 1; i >= 0; i--) down[i] = t[i] * down[i + 1] + (1 - t[i]) * SIGMA * T[i] ** 4;
  const net = up.map((u, i) => u - down[i]);
  const heat = T.map((_, i) => net[i] - net[i + 1]);
  return { up, down, net, heat, surfaceHeat: phiAbs - net[0], olr: net[n] };
}

/**
 * 対流調整：隣り合う層（地表を含む）の気温減率が Γ_crit を超えていたら、
 * 熱容量で重みをつけた合計エネルギー Σ C_i T_i を保ったまま、減率がちょうど Γ_crit になるようにする。
 * 不安定な部分がなくなるまで繰り返す。T[0] を地表とする配列、C は同じ長さの熱容量、z は高さ（km）。
 * 返り値：調整で動いたエネルギー（各層の加熱 C_i ΔT_i、合計は 0）
 */
export function convectiveAdjust(T, C, z, gammaCrit) {
  const T0 = T.slice();
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    for (let i = 0; i < T.length - 1; i++) {
      const d = gammaCrit * (z[i + 1] - z[i]);
      if (T[i] - T[i + 1] > d + 1e-9) {
        // 不安定な部分をひとまとまり（i..j）として、まとめて限界減率の直線にそろえる
        let j = i + 1;
        const fit = (a, b) => {
          let E = 0, Cs = 0, Cz = 0;
          for (let k = a; k <= b; k++) { E += C[k] * T[k]; Cs += C[k]; Cz += C[k] * z[k]; }
          // T_k = A − Γ z_k、Σ C_k T_k = E を満たす A
          return (E + gammaCrit * Cz) / Cs;
        };
        let A = fit(i, j);
        while (j + 1 < T.length && T[j + 1] > A - gammaCrit * z[j + 1] + 1e-9) { j++; A = fit(i, j); }
        for (let k = i; k <= j; k++) T[k] = A - gammaCrit * z[k];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return T.map((v, i) => C[i] * (v - T0[i]));
}
