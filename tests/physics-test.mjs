// エンジンの物理的なふるまいを数値的に確かめるテスト
//   node tests/physics-test.mjs
import { Gas, DIATHERMAL, ADIABATIC, SEMIPERMEABLE } from '../assets/js/engine.js';
import { HeatCapacityRun } from '../assets/js/experiments.js';
import { lnChoose, binomHalf } from '../assets/js/entropy.js';
import { CycleRunner } from '../assets/js/cycles.js';
import { xEqBath, xEqIsolated, twoRegionF, boltzmannLayers, lnMultinomial } from '../assets/js/levels.js';

let fails = 0;
function check(name, cond, info) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info ?? ''}`);
  if (!cond) fails++;
}
const f = (v, d = 3) => Number(v).toFixed(d);

// 1) 孤立系：エネルギー保存と状態方程式 PV = NkT
{
  const g = new Gas({ H: 60, X: 100, seed: 1 });
  g.addParticles(250, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  const U0 = g.kinetic();
  g.pTau = 1e9; // 単純平均に近づける
  for (let k = 0; k < 400; k++) { g.step(10); }
  g.resetPressure(); g.pTau = 3000;
  let acc = 0, n = 0;
  for (let k = 0; k < 6000; k++) { g.step(10); g.measure(); }
  const s = g.stats();
  check('孤立系でエネルギー保存', Math.abs(s.U - U0) / U0 < 1e-9, `U0=${f(U0)} U=${f(s.U)}`);
  check('壁の力から測った P ≈ NkT/V', Math.abs(s.Pwall / s.Pkin - 1) < 0.08, `Pwall=${f(s.Pwall, 4)} NkT/V=${f(s.Pkin, 4)}`);
}

// 2) 速さ分布が 2D マクスウェル分布に近づく（<v^2> = 2T, <v> = sqrt(pi T/2)）
{
  const g = new Gas({ H: 60, X: 100, seed: 2 });
  g.addParticles(300, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  // 全粒子を同じ速さにして（非平衡）緩和させる
  for (let i = 0; i < g.N; i++) { const a = Math.atan2(g.vy[i], g.vx[i]); g.vx[i] = Math.SQRT2 * Math.cos(a); g.vy[i] = Math.SQRT2 * Math.sin(a); }
  let sum = 0, cnt = 0;
  for (let k = 0; k < 200; k++) g.step(10);
  for (let k = 0; k < 200; k++) { g.step(5); for (const v of g.speeds()) { sum += v; cnt++; } }
  const mean = sum / cnt, T = g.kinetic() / g.N;
  check('速さの平均 ≈ sqrt(πT/2)', Math.abs(mean / Math.sqrt(Math.PI * T / 2) - 1) < 0.03, `<v>=${f(mean)} 理論=${f(Math.sqrt(Math.PI * T / 2))}`);
}

// 3) 断熱準静的圧縮: T V^(γ-1) = 一定 (γ=2 → T V = 一定), ΔU = W
{
  const g = new Gas({ H: 60, X: 100, Xmin: 10, seed: 3 });
  g.addParticles(200, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  for (let k = 0; k < 200; k++) g.step(10);
  g.resetLedger();
  const s0 = g.stats();
  g.piston.speed = 0.01; g.piston.target = 50;
  while (g.X > 50 + 1e-9) g.step(10);
  for (let k = 0; k < 100; k++) g.step(10);
  const s1 = g.stats();
  const ratio = (s1.T * s1.V) / (s0.T * s0.V);
  check('断熱準静的: TV ≈ 一定 (γ=2)', Math.abs(ratio - 1) < 0.04, `T0V0=${f(s0.T * s0.V, 1)} T1V1=${f(s1.T * s1.V, 1)} T1/T0=${f(s1.T / s0.T)}`);
  check('断熱: ΔU = W (厳密)', Math.abs(s1.dU - s1.W - s1.Q) < 1e-8, `ΔU=${f(s1.dU)} W=${f(s1.W)} Q=${f(s1.Q)}`);
  // 同じ速さで戻す → ほぼ元の温度に戻る（可逆）
  g.piston.target = 100;
  while (g.X < 100 - 1e-9) g.step(10);
  for (let k = 0; k < 100; k++) g.step(10);
  const s2 = g.stats();
  check('準静的往復で温度がほぼ戻る', Math.abs(s2.T / s0.T - 1) < 0.03, `T0=${f(s0.T)} T2=${f(s2.T)}  W往復=${f(s2.W)}`);
}

// 4) 速い往復（不可逆）: 断熱で往復すると温度が上がる
{
  const g = new Gas({ H: 60, X: 100, Xmin: 10, seed: 4 });
  g.addParticles(200, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  for (let k = 0; k < 200; k++) g.step(10);
  g.resetLedger();
  const s0 = g.stats();
  for (let rep = 0; rep < 3; rep++) {
    g.piston.speed = 2.5; g.piston.target = 50;
    while (g.X > 50 + 1e-9) g.step(1);
    g.piston.target = 100;
    while (g.X < 100 - 1e-9) g.step(1);
  }
  for (let k = 0; k < 100; k++) g.step(10);
  const s1 = g.stats();
  check('速い往復で温度上昇（不可逆な断熱過程）', s1.T > s0.T * 1.05, `T0=${f(s0.T)} T1=${f(s1.T)} W=${f(s1.W)}`);
}

// 5) 等温準静的圧縮: ΔU ≈ 0, Q ≈ -W, W ≈ NkT ln(V0/V1)
{
  const g = new Gas({ H: 60, X: 100, Xmin: 10, seed: 5 });
  g.addParticles(200, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  g.bath = { left: true, top: true, bottom: true };
  g.Tbath = 1.0;
  for (let k = 0; k < 300; k++) g.step(10);
  g.resetLedger();
  g.piston.speed = 0.01; g.piston.target = 50;
  while (g.X > 50 + 1e-9) g.step(10);
  const s = g.stats();
  let dUavg = 0;
  for (let k = 0; k < 400; k++) { g.step(10); dUavg += g.stats().dU / 400; }
  const Wth = 200 * 1.0 * Math.log(2);
  check('等温: W ≈ NkT ln(V0/V1)', Math.abs(s.W / Wth - 1) < 0.1, `W=${f(s.W, 1)} 理論(理想気体)=${f(Wth, 1)}`);
  check('等温: 圧縮後の ΔU(時間平均) ≈ 0 （≪ W）', Math.abs(dUavg) < 0.15 * s.W, `ΔU平均=${f(dUavg, 1)}  Q=${f(s.Q, 1)}`);
  check('等温: 帳簿 ΔU = W + Q (厳密)', Math.abs(s.dU - s.W - s.Q) < 1e-8);
}

// 6) 透熱仕切りで温度が等しくなる（エネルギーは全体で保存）
{
  const g = new Gas({ H: 60, X: 100, seed: 6 });
  g.setVPartition(50, ADIABATIC);
  g.addParticles(150, 2.0, { x0: 0, x1: 50, y0: 0, y1: 60 }, 0);
  g.addParticles(150, 0.5, { x0: 50, x1: 100, y0: 0, y1: 60 }, 1);
  g.vpart.Tw = 1.25;
  const Etot0 = g.kinetic() + g.vpart.Cw * g.vpart.Tw;
  g.setVPartition(50, DIATHERMAL);
  for (let k = 0; k < 2000; k++) g.step(10);
  let T1 = 0, T2 = 0;
  for (let k = 0; k < 4000; k++) { g.step(10); T1 += g.regionStats(0).T; T2 += g.regionStats(1).T; }
  T1 /= 4000; T2 /= 4000;
  const Etot = g.kinetic() + g.vpart.Cw * g.vpart.Tw;
  check('透熱壁で T1 ≈ T2', Math.abs(T1 - T2) / (T1 + T2) < 0.05, `T1=${f(T1)} T2=${f(T2)}`);
  check('気体＋仕切り壁のエネルギー保存', Math.abs(Etot - Etot0) < 1e-8, `E0=${f(Etot0)} E=${f(Etot)}`);
}

// 7) 撹拌（操作2）: 断熱容器で T 上昇、ΔU = W_stir
{
  const g = new Gas({ H: 60, X: 100, seed: 7 });
  g.stirrer.present = true; g.stirrer.on = true; g.stirrer.cx = 50; g.stirrer.cy = 30; g.stirrer.L = 30; g.stirrer.omega = 0.15;
  g.addParticles(200, 1.0, { x0: 0, x1: 100, y0: 0, y1: 60 });
  g.resetLedger();
  const s0 = g.stats();
  for (let k = 0; k < 1500; k++) g.step(10);
  const s = g.stats();
  check('撹拌で温度上昇', s.T > s0.T * 1.05, `T0=${f(s0.T)} T=${f(s.T)} Wstir=${f(s.Wstir, 1)}`);
  check('撹拌: ΔU = W_stir (厳密)', Math.abs(s.dU - s.Wstir) < 1e-8);
  // 粒子が翼をすり抜けていないか（翼の近くに粒子が詰まっていないか）は目視で確認
}

// 8) 自由膨張: W = Q = 0, T 不変
{
  const g = new Gas({ H: 60, X: 100, seed: 8 });
  g.setVPartition(50, ADIABATIC);
  g.addParticles(200, 1.0, { x0: 0, x1: 50, y0: 0, y1: 60 });
  for (let k = 0; k < 100; k++) g.step(10);
  g.resetLedger();
  const s0 = g.stats();
  g.setVPartition(null);
  for (let k = 0; k < 500; k++) g.step(10);
  const s = g.stats();
  const nL = g.speeds(i => g.x[i] < 50).length;
  check('自由膨張: T 不変, W=Q=0', Math.abs(s.T - s0.T) < 1e-9 && s.W === 0 && s.Q === 0, `T0=${f(s0.T)} T=${f(s.T)} 左側の粒子 ${nL}/200`);
}

// 9) おもりを載せたピストン（定圧）: 平均の圧力 ≈ 外圧、ΔU = W（厳密）
{
  const g = new Gas({ H: 60, X: 60, Xmin: 15, Xmax: 140, seed: 9 });
  g.addParticles(200, 1.0, { x0: 0, x1: 60, y0: 0, y1: 60 });
  const Pext = 0.8 * g.kinetic() / (g.X * g.H);    // 少し低い外圧 → 膨張して釣り合う
  Object.assign(g.piston, { mode: 'force', Pext, u: 0 });
  g.resetLedger();
  for (let k = 0; k < 300; k++) g.advance(1);
  let P = 0, n = 0;
  for (let k = 0; k < 1500; k++) { g.advance(1); P += g.kinetic() / (g.X * g.H); n++; }
  P /= n;
  const s = g.stats();
  // 円板には大きさがあるので、実際の圧力は NkT/V より数％大きい → 釣り合うと NkT/V は外圧より少し小さい
  check('定圧ピストン: 平均の NkT/V ≈ 外圧', Math.abs(P / Pext - 1) < 0.08, `NkT/V=${f(P, 4)} Pext=${f(Pext, 4)} X=${f(g.X, 1)}`);
  check('定圧ピストン: ΔU = W (厳密)', Math.abs(s.dU - s.W - s.Q) < 1e-8, `ΔU=${f(s.dU)} W=${f(s.W)}`);
}

// 10) 熱容量: 定積 C_V = Nk、定圧 C_P ≈ 2Nk（2次元）
{
  const meas = (mode, seed) => {
    const g = new Gas({ H: 60, X: 60, Xmin: 15, Xmax: 140, seed });
    g.addParticles(300, 1.0, { x0: 0, x1: 60, y0: 0, y1: 60 });
    if (mode === 'P') Object.assign(g.piston, { mode: 'force', Pext: g.kinetic() / (g.X * g.H), u: 0 });
    const run = new HeatCapacityRun(g, { mode, Tb: 2 });
    while (run.phase !== 'done') { g.advance(3); run.update(); }
    return run.result;
  };
  const v = meas('V', 10), p1 = meas('P', 11), p2 = meas('P', 12);
  const cp = (p1.Q + p2.Q) / (p1.dT + p2.dT) / 300;
  check('熱容量: 定積 C/N = 1', Math.abs(v.c - 1) < 1e-6, `C/N=${f(v.c, 4)} ΔT=${f(v.dT)}`);
  check('熱容量: 定圧 C/N ≈ 2', Math.abs(cp - 2) < 0.15, `C/N=${f(cp)}（${f(p1.c)}, ${f(p2.c)}）`);
  check('熱容量: 定圧で気体は外へ仕事 ≈ PΔV', Math.abs(-p1.W / p1.PdV - 1) < 0.3, `−W=${f(-p1.W, 1)} PΔV=${f(p1.PdV, 1)}`);
}

// 11) エントロピー: 場合の数と自由膨張
{
  let sum = 0; for (let k = 0; k <= 50; k++) sum += binomHalf(50, k);
  check('二項分布の和 = 1', Math.abs(sum - 1) < 1e-9, `Σ=${f(sum, 12)}`);
  check('ln C(10,5) = ln 252', Math.abs(lnChoose(10, 5) - Math.log(252)) < 1e-9);
  const g = new Gas({ H: 60, X: 100, Xmin: 100, Xmax: 100, seed: 13 });
  g.setVPartition(50, ADIABATIC);
  g.addParticles(200, 1.0, { x0: 0, x1: 50, y0: 0, y1: 60 });
  g.setVPartition(null);
  let S = 0;
  for (let k = 0; k < 300; k++) g.advance(1);
  for (let k = 0; k < 200; k++) { g.advance(1); let n = 0; for (let i = 0; i < g.N; i++) if (g.x[i] < 50) n++; S += lnChoose(200, n) / 200; }
  check('自由膨張: ln W → N ln 2 付近', S > 0.9 * 200 * Math.LN2, `⟨ln W⟩=${f(S, 1)} N ln2=${f(200 * Math.LN2, 1)}`);
}

// 12) 熱機関とヒートポンプ: 第一法則（厳密）と、カルノーの上限以下の性能
{
  const cyc = (type, dir, seed) => {
    const g = new Gas({ H: 60, X: 30, Xmin: 15, Xmax: 155, seed });
    g.addParticles(200, 2, { x0: 0, x1: 30, y0: 0, y1: 60 });
    const r = new CycleRunner(g, { type, dir, Th: 2, Tc: 1, X1: 30, r: 2, speed: 0.05 });
    while (r.cycles.length < 3) { g.advance(4); r.update(); }
    return r;
  };
  const ce = cyc('carnot', 'engine', 21), T = ce.total;
  const eta = -T.W / T.Qh;
  let maxErr = 0;
  for (const c of ce.cycles) for (const s of c.steps) maxErr = Math.max(maxErr, Math.abs(s.dU - s.Q - s.W));
  check('サイクル: 各過程で ΔU = Q + W (厳密)', maxErr < 1e-8, `最大誤差=${maxErr.toExponential(1)}`);
  check('カルノー熱機関: 0.3 < η < 1−Tc/Th + ゆらぎ', eta > 0.3 && eta < 0.56, `η=${f(eta)} 理論=0.500`);
  const cp = cyc('carnot', 'pump', 22), Tp = cp.total, cop = -Tp.Qh / Tp.W;
  check('カルノーヒートポンプ: 1 < COP < Th/(Th−Tc) + ゆらぎ', cop > 1.2 && cop < 2.2, `COP=${f(cop)} 理論=2.000`);
  const se = cyc('stirling', 'engine', 23), Ts = se.total;
  const etaS = -Ts.W / Ts.Qh, etaR = -Ts.W / Ts.Qiso_h;
  check('スターリング: 再生器なしの η < 再生器ありの η', etaS < etaR && etaS > 0.15, `η=${f(etaS)}（理論 0.290） 再生器あり=${f(etaR)}（理論 0.500）`);
}

// 13) 半透膜と浸透圧: 溶媒は通り、溶質は通らない。Π = P右 − P左 ≈ nkT/V（ファントホッフ）
{
  const g = new Gas({ H: 60, X: 100, Xmin: 58, Xmax: 175, r: 0.15, seed: 31 });
  g.setVPartition(50, ADIABATIC);
  g.addParticles(160, 1, { x0: 0, x1: 50, y0: 0, y1: 60 }, 0);
  g.addParticles(80, 1, { x0: 50, x1: 100, y0: 0, y1: 60 }, 0);
  g.addParticles(80, 1, { x0: 50, x1: 100, y0: 0, y1: 60 }, 1);
  g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  g.bath = { left: true, top: true, bottom: true }; g.Tbath = 1;
  g.setVPartition(50, SEMIPERMEABLE);
  for (let k = 0; k < 600; k++) g.advance(1);
  g.pTau = 1e9; g.resetPressure();
  let TR = 0, nL = 0, n = 0, soluteLeft = 0;
  for (let k = 0; k < 4000; k++) {
    g.advance(1); g.measure(); TR += g.regionStats(1).T; n++;
    if (k % 20 === 0) for (let i = 0; i < g.N; i++) { if (g.x[i] < 50) { if (g.species[i] === 0) nL++; else soluteLeft++; } }
  }
  TR /= n; nL /= 200;
  const th = (80 * TR) / 3000, Pi = g.P.piston - g.P.left;
  check('半透膜: 溶質は膜を通らない', soluteLeft === 0);
  check('半透膜: 溶媒は左右で同じ密度になる', Math.abs(nL / 120 - 1) < 0.08, `左の溶媒 ⟨n⟩=${f(nL, 1)}（理論 120）`);
  check('浸透圧: P右 − P左 ≈ nkT/V', Math.abs(Pi / th - 1) < 0.12, `Π=${f(Pi, 4)} nkT/V=${f(th, 4)}`);
  check('浸透圧: 膜が溶質から受ける圧力 ≈ nkT/V', Math.abs(g.P.vpart / th - 1) < 0.12, `P膜=${f(g.P.vpart, 4)}`);
}

// 14) 高さによるエネルギーの段差（二領域・沈降平衡）
{
  const avgX = (g, steps) => {
    let x = 0;
    for (let k = 0; k < steps; k++) { g.advance(1); x += g.layerCounts()[1] / g.N; }
    return x / steps;
  };
  // 孤立系：運動＋位置エネルギーが厳密に保存し、上にいる割合は全エントロピー最大の値に近づく
  {
    const g = new Gas({ H: 60, X: 90, Xmin: 90, Xmax: 90, r: 0.15, seed: 41 });
    g.addParticles(300, 1, { x0: 0, x1: 90, y0: 0, y1: 60 });
    g.setLevels(2, 1.5); g.resetLedger();
    const E0 = g.kinetic() + g.potential();
    for (let k = 0; k < 600; k++) g.advance(1);
    const x = avgX(g, 3000), E = g.kinetic() + g.potential();
    const th = xEqIsolated(1.5, E0 / g.N);
    check('段差（孤立系）: 運動＋位置エネルギーの保存', Math.abs(E - E0) < 1e-8, `E0=${f(E0)} E=${f(E)}`);
    check('段差（孤立系）: 上にいる割合 ≈ S 最大の値', Math.abs(x - th) < 0.02, `x=${f(x)} 理論=${f(th)} T=${f(g.kinetic() / g.N)}`);
  }
  // 熱源に接触：x ≈ 1/(1+e^{ΔE/T})、途中で段差を変えても ΔU = Q + W（厳密）
  {
    const g = new Gas({ H: 60, X: 90, Xmin: 90, Xmax: 90, r: 0.15, seed: 42 });
    g.addParticles(300, 1, { x0: 0, x1: 90, y0: 0, y1: 60 });
    g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
    g.bath = { left: true, top: true, bottom: true }; g.Tbath = 1;
    g.setLevels(2, 0.5); g.resetLedger();
    for (let k = 0; k < 200; k++) g.advance(1);
    g.setLevels(2, 1.5);
    for (let k = 0; k < 600; k++) g.advance(1);
    const x = avgX(g, 3000), s = g.stats();
    check('段差（熱源）: 上にいる割合 ≈ 1/(1+e^{ΔE/T})', Math.abs(x - xEqBath(1.5, 1)) < 0.02, `x=${f(x)} 理論=${f(xEqBath(1.5, 1))}`);
    check('段差（熱源）: ΔU = Q + W（段差を変えた仕事を含め厳密）', Math.abs(s.dU - s.Q - s.W) < 1e-8, `ΔU=${f(s.dU)} Q=${f(s.Q)} W=${f(s.W)}`);
    check('段差（熱源）: 自由エネルギー最小の位置 = 1/(1+e^{ΔE/T})', (() => {
      let best = 0, fb = Infinity;
      for (let i = 1; i < 10000; i++) { const xx = i / 10000, v = twoRegionF(xx, 1.5, 1); if (v < fb) { fb = v; best = xx; } }
      return Math.abs(best - xEqBath(1.5, 1)) < 2e-4;
    })());
  }
  // 多段（重力の近似）：層ごとの割合 ≈ e^{−kΔE/T} / Σ
  {
    const g = new Gas({ H: 60, X: 90, Xmin: 90, Xmax: 90, r: 0.15, seed: 43 });
    g.addParticles(300, 1, { x0: 0, x1: 90, y0: 0, y1: 60 });
    g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
    g.bath = { left: true, top: true, bottom: true }; g.Tbath = 1;
    g.setLevels(6, 0.5); g.resetLedger();
    for (let k = 0; k < 800; k++) g.advance(1);
    const acc = new Array(6).fill(0);
    for (let k = 0; k < 3000; k++) { g.advance(1); g.layerCounts().forEach((c, j) => { acc[j] += c / g.N / 3000; }); }
    const th = boltzmannLayers(6, 0.5, 1);
    const err = Math.max(...acc.map((v, j) => Math.abs(v - th[j])));
    check('多段: 層ごとの割合 ≈ ボルツマン分布', err < 0.02, `測定=${acc.map((v) => f(v, 3)).join(',')} 理論=${th.map((v) => f(v, 3)).join(',')}`);
    check('多段: ln(N!/ΠN_k!) は一様な分け方で最大', lnMultinomial([50, 50, 50, 50, 50, 50]) > lnMultinomial(g.layerCounts()));
  }
}

// 15) 可動の仕切り（12）：全エネルギー保存、部分系ごとの ΔU = Q + W、透熱なら T と P がそろう
{
  const run = (type, seed) => {
    const g = new Gas({ H: 60, X: 100, Xmin: 100, Xmax: 100, seed });
    g.setVPartition(50, ADIABATIC);
    g.addParticles(200, 2.0, { x0: 0, x1: 50, y0: 0, y1: 60 }, 0);
    g.addParticles(100, 0.6, { x0: 50, x1: 100, y0: 0, y1: 60 }, 1);
    Object.assign(g.vpart, { Tw: 1.3, Cw: 20, M: 30, movable: true });
    g.setVPartition(50, type); g.resetLedger();
    const E = () => g.kinetic() + g.vpart.Cw * g.vpart.Tw + 0.5 * g.vpart.M * g.vpart.u ** 2;
    const E0 = E();
    for (let k = 0; k < 2500; k++) g.advance(1);
    let x = 0, T1 = 0, T2 = 0, P1 = 0, P2 = 0; const n = 2500;
    for (let k = 0; k < n; k++) {
      g.advance(1); const a = g.regionStats(0), b = g.regionStats(1);
      x += g.vpart.x / n; T1 += a.T / n; T2 += b.T / n; P1 += a.U / a.V / n; P2 += b.U / b.V / n;
    }
    const a = g.regionStats(0), b = g.regionStats(1);
    return { dE: E() - E0, x, T1, T2, P1, P2, led: Math.max(Math.abs(a.dU - a.Q - a.W), Math.abs(b.dU - b.Q - b.W)) };
  };
  const d = run(DIATHERMAL, 51), ad = run(ADIABATIC, 52);
  check('可動の仕切り: 気体＋壁の全エネルギー保存', Math.abs(d.dE) < 1e-8 && Math.abs(ad.dE) < 1e-8, `透熱 ${d.dE.toExponential(1)} 断熱 ${ad.dE.toExponential(1)}`);
  check('可動の仕切り: 部分系ごとに ΔU = Q + W (厳密)', d.led < 1e-8 && ad.led < 1e-8);
  check('可動・透熱: T と P がそろう', Math.abs(d.T1 / d.T2 - 1) < 0.08 && Math.abs(d.P1 / d.P2 - 1) < 0.05, `T=${f(d.T1)},${f(d.T2)} P=${f(d.P1, 4)},${f(d.P2, 4)} x=${f(d.x, 1)}（理論 66.7）`);
  check('可動・断熱: P がそろう', Math.abs(ad.P1 / ad.P2 - 1) < 0.05, `P=${f(ad.P1, 4)},${f(ad.P2, 4)} T=${f(ad.T1)},${f(ad.T2)}`);
  // すべてを通す壁（pass < 0）：数密度と温度がそろう
  const g = new Gas({ H: 60, X: 100, Xmin: 100, Xmax: 100, seed: 53 });
  g.setVPartition(50, ADIABATIC);
  g.addParticles(200, 2.0, { x0: 0, x1: 50, y0: 0, y1: 60 }, 0);
  g.addParticles(100, 0.6, { x0: 50, x1: 100, y0: 0, y1: 60 }, 1);
  g.setVPartition(50, SEMIPERMEABLE); g.vpart.pass = -1;
  for (let k = 0; k < 1500; k++) g.advance(1);
  let n1 = 0; for (let k = 0; k < 1000; k++) { g.advance(1); n1 += g.regionStats(0).N / 1000; }
  check('すべてを通す壁: 左右の粒子数がそろう', Math.abs(n1 / 150 - 1) < 0.05, `左 ⟨N⟩=${f(n1, 1)}（理論 150）`);
}

console.log(fails ? `\n${fails} 件失敗` : '\nすべて成功');
process.exit(fails ? 1 : 0);
