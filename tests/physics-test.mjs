// エンジンの物理的なふるまいを数値的に確かめるテスト
//   node tests/physics-test.mjs
import { Gas, DIATHERMAL, ADIABATIC, SEMIPERMEABLE } from '../assets/js/engine.js';
import { HeatCapacityRun } from '../assets/js/experiments.js';
import { lnChoose, binomHalf } from '../assets/js/entropy.js';
import { CycleRunner } from '../assets/js/cycles.js';
import { sampleEnd, chainVar } from '../assets/js/chain.js';
import * as CL from '../assets/js/climate.js';
import * as TR from '../assets/js/transport.js';
import { xEqBath, xEqIsolated, twoRegionF, boltzmannLayers, lnMultinomial, meltT } from '../assets/js/levels.js';

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

// 14b) 二状態（広さの違う二領域）：x/(1−x) = (v2/v1) e^{−ΔE/T}、T_m で x = 1/2
{
  const g = new Gas({ H: 60, X: 90, Xmin: 90, Xmax: 90, r: 0.15, seed: 44 });
  g.addParticles(300, 1, { x0: 0, x1: 90, y0: 0, y1: 60 });
  g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL };
  g.bath = { left: true, top: true, bottom: true };
  const v2 = 0.8, dE = 1.5, Tm = meltT(dE, v2);
  g.Tbath = Tm;
  g.setLevels(2, dE, [1 - v2]); g.resetLedger();
  for (let k = 0; k < 600; k++) g.advance(1);
  let x = 0; for (let k = 0; k < 3000; k++) { g.advance(1); x += g.layerCounts()[1] / g.N / 3000; }
  check('二状態: T = T_m で上にいる割合 ≈ 1/2', Math.abs(x - 0.5) < 0.03 && Math.abs(xEqBath(dE, Tm, v2) - 0.5) < 1e-12, `x=${f(x)} T_m=${f(Tm)}`);
  const s = g.stats();
  check('二状態: ΔU = Q + W (厳密)', Math.abs(s.dU - s.Q - s.W) < 1e-8);
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

// 16) 理想鎖（13）：末端の x の分散 ≈ Ns b²/2（2次元）
{
  let a = 7;   // mulberry32
  const rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let s2 = 0, s4 = 0; const M = 20000;
  for (let k = 0; k < M; k++) { const [x] = sampleEnd(40, 1, rand); s2 += x * x / M; s4 += x ** 4 / M; }
  check('理想鎖: ⟨x²⟩ ≈ Ns b²/2', Math.abs(s2 / chainVar(40, 1) - 1) < 0.03, `⟨x²⟩=${f(s2, 2)} 理論=${f(chainVar(40, 1), 2)}`);
  check('理想鎖: ほぼガウス分布（⟨x⁴⟩ ≈ 3⟨x²⟩²）', Math.abs(s4 / (3 * s2 * s2) - 1) < 0.06, `比=${f(s4 / (3 * s2 * s2))}`);
}

// 17) 応用ページのマクロなモデル（教科書の数値例と照合）
{
  const r = CL.grayFluxes((400 / CL.SIGMA) ** 0.25, [(300 / CL.SIGMA) ** 0.25, (200 / CL.SIGMA) ** 0.25], [0.5, 0.5], 275);
  check('灰色2層: 途中の問い8.1・8.2（U₁=350, U₂=275, D₁=100, 加熱 −50, −25, 地表 +75）',
    [r.up[1] - 350, r.up[2] - 275, r.down[1] - 100, r.heat[0] + 50, r.heat[1] + 25, r.surfaceHeat - 75].every((v) => Math.abs(v) < 1e-9));
  const one = CL.oneLayer(CL.absorbedSolar(1361, 0.3), 0.8);
  const g1 = CL.grayFluxes(one.Ts, [one.Ta], [0.2], CL.absorbedSolar(1361, 0.3));
  check('1層モデル: 定常状態で地表・大気・大気上端の収支が 0', Math.abs(g1.surfaceHeat) < 1e-9 && Math.abs(g1.heat[0]) < 1e-9 && Math.abs(one.olr - CL.absorbedSolar(1361, 0.3)) < 1e-9, `T_e=${f(one.Te, 1)} T_s=${f(one.Ts, 1)}`);
  check('復元係数 B_s(ε=0.8, 290 K) = 3.32', Math.abs(CL.restoringB(0.8, 290) - 3.32) < 0.005);
  check('乾燥断熱減率 g/c_p = 9.77 K/km', Math.abs(CL.GAMMA_D - 9.77) < 0.005);
  check('クラウジウス＝クラペイロン: 300 K で 6.03 %/K、303/300 K で 1.196 倍', Math.abs(CL.LV / (CL.RV * 300 ** 2) - 0.0603) < 5e-5 && Math.abs(CL.satVapor(303) / CL.satVapor(300) - 1.196) < 5e-4);
  check('露点は飽和水蒸気圧の逆関数', Math.abs(CL.dewPoint(CL.satVapor(290)) - 290) < 1e-9);
  const T = [300, 280]; CL.convectiveAdjust(T, [1, 1], [0, 1], CL.GAMMA_D);
  check('例題9: 対流調整（平均 290 K を保ち、差 9.77 K）', Math.abs(T[0] - 294.885) < 1e-3 && Math.abs(T[1] - 285.115) < 1e-3);
  const T2 = [300, 290, 270, 250, 240], C = [3, 1, 1, 1, 1], z = [0, 1, 2, 3, 4], E0 = T2.reduce((a, v, i) => a + C[i] * v, 0);
  CL.convectiveAdjust(T2, C, z, 6.5);
  const ok = T2.every((v, i) => i === 0 || T2[i - 1] - v <= 6.5 + 1e-9);
  check('対流調整: エネルギー保存・不安定がなくなる', ok && Math.abs(T2.reduce((a, v, i) => a + C[i] * v, 0) - E0) < 1e-9, T2.map((v) => f(v, 1)).join(','));
  // 調整した直線より上の層が冷たすぎるときは、その層もまとめて調整する
  const T3 = [300, 299, 280, 250], C3 = [1, 1, 1, 1], z3 = [0, 1, 2, 3], E3 = T3.reduce((a, v) => a + v, 0);
  CL.convectiveAdjust(T3, C3, z3, 6.5);
  check('対流調整: 上へ広がる不安定もまとめて直す', T3.every((v, i) => i === 0 || T3[i - 1] - v <= 6.5 + 1e-9) && Math.abs(T3.reduce((a, v) => a + v, 0) - E3) < 1e-9, T3.map((v) => f(v, 1)).join(','));
  // 気柱モデル：定常状態で大気上端の収支 0、対流のない上空は放射平衡、対流圏の減率 = 限界減率
  const col = new CL.Column({ tauS: 1.6 }), rad = new CL.Column({ tauS: 1.6, convect: false });
  let fc, fr;
  for (let k = 0; k < 6000; k++) { fc = col.step(21600); fr = rad.step(21600); }
  const zc = col.heights(), top = col.T.length - 1;
  check('放射対流平衡: 大気上端で J_abs = OLR、成層圏は放射平衡', Math.abs(fc.olr - 240) < 0.05 && Math.abs(fc.heat[top]) < 0.01, `OLR=${f(fc.olr, 2)} T_s=${f(col.Ts, 1)}`);
  check('放射対流平衡: 地表付近の減率 = 6.5 K/km、放射平衡だけより地表が冷たい', Math.abs((col.T[0] - col.T[1]) / (zc[2] - zc[1]) - 6.5) < 0.05 && rad.Ts > col.Ts + 10, `放射平衡のみ T_s=${f(rad.Ts, 1)}`);
  const c1 = new CL.Column({ tauS: 1.6 }), r1 = c1.step(21600);
  check('気柱モデル: step() は更新後の状態の収支を返す', Math.abs(r1.olr - c1.fluxes().olr) < 1e-9, `OLR=${f(r1.olr, 2)}`);
  const N2 = CL.bruntN2(288, 6.5);
  check('浮力振動数: Γ_env < Γ_d で N² > 0、周期 ≈ 10 分', N2 > 0 && Math.abs(2 * Math.PI / Math.sqrt(N2) / 60 - 9.8) < 1.5, `周期=${f(2 * Math.PI / Math.sqrt(N2) / 60, 1)} 分`);
  const a = CL.lapseProfile(5, 288.15, 1000, CL.GAMMA_D), th = CL.potentialTemp(a.T, a.p);
  check('乾燥断熱の大気では温位が一定', Math.abs(th - 288.15) < 0.05, `θ(5 km)=${f(th, 2)}`);
}

// --- 18 平衡と定常状態：上下の熱源の温度が違うと熱が流れ続ける ---
{
  const mk = (Th, Tc, seed) => {
    const g = new Gas({ H: 60, X: 100, Xmin: 40, Xmax: 110, r: 1, seed });
    g.addParticles(400, (Th + Tc) / 2, { x0: 0, x1: 100, y0: 0, y1: 60 });
    g.piston.target = 100;
    g.walls = { left: ADIABATIC, top: DIATHERMAL, bottom: DIATHERMAL };
    g.bath = { left: false, top: true, bottom: true };
    g.Tside = { left: null, top: Tc, bottom: Th };
    g.advance(1000); g.resetLedger();
    return g;
  };
  // 温度差あり：定常状態。入る熱 = 出る熱、エントロピー生成 > 0、温度は下ほど高い
  const g = mk(2, 0.5, 11), nb = 6, ke = new Float64Array(nb), cnt = new Float64Array(nb);
  for (let k = 0; k < 800; k++) {
    g.advance(5);
    for (let i = 0; i < g.N; i++) { const b = Math.min(nb - 1, Math.floor((g.y[i] / 60) * nb)); ke[b] += 0.5 * (g.vx[i] ** 2 + g.vy[i] ** 2); cnt[b]++; }
  }
  const L = g.ledger, t = g.time - L.t0, qh = L.Qside.bottom / t, qc = L.Qside.top / t, s = g.stats();
  const Tl = [...ke].map((v, b) => v / cnt[b]);
  check('定常状態: 熱い熱源から入る熱の速さ = 冷たい熱源へ出る熱の速さ', qh > 1 && Math.abs(qh + qc) < 0.03 * qh, `Q̇_h=${f(qh, 3)} −Q̇_c=${f(-qc, 3)}`);
  check('定常状態: 帳簿 ΔU = Q_h + Q_c が厳密（W = 0）', Math.abs(s.dU - (L.Qside.bottom + L.Qside.top)) < 1e-6 && Math.abs(s.W) < 1e-12 && Math.abs(L.Qside.left) < 1e-12, `ΔU=${f(s.dU, 3)}`);
  const sig = -qh / 2 - qc / 0.5;
  check('定常状態: エントロピーを作る速さ σ = Q̇(1/T_c − 1/T_h) > 0', sig > 0 && Math.abs(sig - qh * (1 / 0.5 - 1 / 2)) < 0.05 * sig, `σ=${f(sig, 3)}`);
  check('定常状態: 温度は冷たい上から熱い下へ単調に上がる（壁で温度がとぶ）', Tl.every((v, b) => b === 0 || v > Tl[b - 1]) && Tl[0] > 0.5 && Tl[nb - 1] < 2, Tl.map((v) => f(v, 2)).join(' '));
  // 同じ温度：平衡。正味の熱の流れは 0 のまわりでゆらぐだけ
  const e = mk(1.25, 1.25, 12);
  e.advance(4000);
  const qe = e.ledger.Qside.bottom / (e.time - e.ledger.t0);
  check('平衡: 上下が同じ温度なら正味の熱の流れはほぼ 0', Math.abs(qe) < 0.1 * qh, `Q̇_h=${f(qe, 3)}（温度差ありの ${f(qh, 2)} と比べて）`);
}

// --- 19 膜電位：種類ごとの価数 q と、通れない種類 block ---
{
  const g = new Gas({ H: 60, X: 100, Xmin: 40, Xmax: 110, r: 0.2, seed: 21 });
  const IN = { x0: 0, x1: 100, y0: 30, y1: 60 }, OUT = { x0: 0, x1: 100, y0: 0, y1: 30 };
  g.addParticles(80, 1, IN, 0); g.addParticles(80, 1, OUT, 0);     // K⁺
  g.addParticles(60, 1, IN, 1); g.addParticles(60, 1, OUT, 1);     // Cl⁻
  g.addParticles(60, 1, IN, 2);                                    // A⁻（膜を通らない）
  g.piston.target = 100;
  g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL }; g.bath = { left: true, top: true, bottom: true }; g.Tbath = 1;
  g.setLevels(2, 0, [0.5], { q: [1, -1, -1], block: [false, false, true] });
  g.resetLedger();
  const psi = -1;
  g.setLevels(2, -psi, [0.5], { q: [1, -1, -1], block: [false, false, true] });   // 外側のエネルギー −qΔψ
  g.advance(600);
  const cin = [0, 0, 0], cout = [0, 0, 0];
  for (let k = 0; k < 800; k++) { g.advance(5); for (let i = 0; i < g.N; i++) (g.layerOf(g.y[i]) === 0 ? cin : cout)[g.species[i]]++; }
  const rK = cin[0] / cout[0], rC = cin[1] / cout[1], s = g.stats();
  check('膜電位: K⁺ は c_in/c_out = e^{−eΔψ/kT}（ネルンスト）', Math.abs(rK / Math.exp(-psi) - 1) < 0.08, `測定=${f(rK, 3)} 理論=${f(Math.exp(-psi), 3)}`);
  check('膜電位: Cl⁻ は逆向きに c_in/c_out = e^{+eΔψ/kT}', Math.abs(rC / Math.exp(psi) - 1) < 0.08, `測定=${f(rC, 3)} 理論=${f(Math.exp(psi), 3)}`);
  check('膜電位: 膜を通れない A⁻ は外へ出ない', cout[2] === 0, `外側の A⁻ = ${cout[2]}`);
  check('膜電位: ΔU = Q + W（電位を変えた仕事を含め厳密）', Math.abs(s.dU - s.Q - s.W) < 1e-6 && Math.abs(s.W) > 1, `ΔU=${f(s.dU, 3)} Q=${f(s.Q, 3)} W=${f(s.W, 3)}`);
}

// --- 20 結合の平衡：受容体（1部位1個まで）と自由なリガンド ---
{
  const run = (NL, eps, T, seed) => {
    const M = 20, H = 60, X = 100, A = X * H;
    const g = new Gas({ H, X, Xmin: 40, Xmax: 110, r: 0.3, seed });
    g.addParticles(NL, T, { x0: 0, x1: X, y0: 0, y1: H }, 0);
    g.piston.target = X;
    g.walls = { left: DIATHERMAL, top: DIATHERMAL, bottom: DIATHERMAL }; g.bath = { left: true, top: true, bottom: true }; g.Tbath = T;
    const cols = Math.ceil(Math.sqrt((M * X) / H)), rows = Math.ceil(M / cols), pos = [];
    for (let k = 0; k < M; k++) pos.push([((k % cols + 0.5) * X) / cols, ((Math.floor(k / cols) + 0.5) * H) / rows]);
    g.setSites(pos, { a: 1, eps, species: 0 });
    g.resetLedger();
    g.advance(500);
    let nb = 0, c = 0, n = 0;
    for (let k = 0; k < 2500; k++) { g.advance(2); nb += g.sites.nb; c += g.N / A; n++; }
    const Kd = Math.exp(-eps / T) / Math.PI;
    return { g, f: nb / n / M, c: c / n, Kd, nTot: nb / n + g.N };
  };
  const a = run(60, 3, 1, 31);
  const fth = a.c / (a.Kd + a.c);
  check('結合: 結合した割合 f = c/(K_d + c)（c は自由なリガンドの濃度）', Math.abs(a.f - fth) < 0.05, `f=${f(a.f, 3)} 理論=${f(fth, 3)}`);
  const s = a.g.stats();
  check('結合: ΔU = Q + W が厳密（結合のエネルギー −ε を含む）、リガンドの総数は保存', Math.abs(s.dU - s.Q - s.W) < 1e-6 && a.g.N + a.g.sites.nb === 60, `ΔU=${f(s.dU, 3)} Q=${f(s.Q, 3)}`);
  const b = run(60, 2, 1, 32), c2 = run(60, 3, 1.5, 33);
  check('結合: K_d は ε/kT だけで決まる（ε=2,T=1 と ε=3,T=1.5 で同じ割合）', Math.abs(b.f - c2.f) < 0.05 && Math.abs(b.f - b.c / (b.Kd + b.c)) < 0.05, `f=${f(b.f, 3)} と ${f(c2.f, 3)}`);
  const sat = run(300, 4, 1, 34);
  check('結合: リガンドが多いと飽和に近づく（f → 1、1 は超えない）', sat.f > 0.85 && sat.f <= 1 && Math.abs(sat.f - sat.c / (sat.Kd + sat.c)) < 0.05, `f=${f(sat.f, 3)} 理論=${f(sat.c / (sat.Kd + sat.c), 3)}`);
}

// --- 21 平衡の分布と到達時間：式 (4.8) を教科書の付属プログラム（sedimentation.py、P = 5、120 層、dτ = 0.002）と比べる ---
{
  const s = new TR.Sediment1D({ n: 120, P: 5 });
  const ref = [[0.02, 0.539766], [0.05, 0.250377], [0.1, 0.063287], [0.2, 0.003284]];
  const got = [], F0 = s.excessF();
  let mono = true, last = F0, minC = 1, massErr = 0;
  for (const [tt] of ref) { while (s.t < tt - 1e-9) { s.step(0.002); const F = s.excessF(); if (F > last + 1e-12) mono = false; last = F; minC = Math.min(minC, ...s.c); massErr = Math.max(massErr, Math.abs(s.mass() - 1)); } got.push(s.excessF()); }
  check('到達時間: 平衡との自由エネルギーの差が付属プログラムと一致（τ = 0, 0.02, 0.05, 0.1, 0.2）', Math.abs(F0 - 0.883729) < 1e-5 && ref.every(([, v], i) => Math.abs(got[i] - v) < 1e-5), got.map((v) => f(v, 6)).join(' '));
  check('到達時間: 粒子数は保存、濃度は負にならず、自由エネルギーは減り続ける', massErr < 1e-10 && minC > 0 && mono, `質量の誤差=${massErr.toExponential(1)}`);
  while (s.t < 1 - 1e-9) s.step(0.002);
  const ceq = TR.sedimentEq(120, 5); let L1 = 0; for (let i = 0; i < 120; i++) L1 += Math.abs(s.c[i] - ceq[i]) / 120;
  check('到達時間: 行き先は沈降平衡（ボルツマン分布）', L1 < 1e-6, `L1=${L1.toExponential(2)}`);
  // 粘度を k 倍：D も b も 1/k なので、同じ実時間で無次元時間が 1/k しか進まない。行き先は同じ
  // 実時間を左の D で測り、右の容器は1刻みで無次元時間が 1/3 しか進まない（ページと同じ進め方）
  const dt = 0.0005, a1 = new TR.Sediment1D({ n: 60, P: 5 }), a3 = new TR.Sediment1D({ n: 60, P: 5 }), b3 = new TR.Sediment1D({ n: 60, P: 5 });
  for (let i = 0; i < 200; i++) { a1.step(dt); a3.step(dt / 3); }            // 実時間 0.1
  for (let i = 0; i < 600; i++) b3.step(dt / 3);                             // 右の容器で実時間 0.3
  check('到達時間: 粘度が3倍なら同じ分布に3倍の時間で着く', a3.excessF() > 2 * a1.excessF() && Math.abs(b3.excessF() - a1.excessF()) < 0.03 * a1.excessF(), `実時間 0.1 で左 ${f(a1.excessF(), 4)}・右 ${f(a3.excessF(), 4)}、右は実時間 0.3 で ${f(b3.excessF(), 4)}`);
  // アインシュタインの関係を破ると（r ≠ 1）、流れの止まる分布がボルツマン分布にならない
  const br = new TR.Sediment1D({ n: 60, P: 5, r: 2 }); for (let i = 0; i < 1000; i++) br.step(0.005);
  check('到達時間: D ≠ bkT（r = 2）だと行き先がボルツマン分布からずれる（自由エネルギーの差が残る）', br.excessF() > 0.1, `残る差=${f(br.excessF(), 3)}`);
  // ブラウン運動の粒子も同じ分布に着く
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const xs = Float64Array.from({ length: 4000 }, rnd);
  for (let t = 0; t < 1.5; t += 2e-4) TR.brownianStep(xs, 5, 2e-4, gauss);
  const h = new Array(10).fill(0); for (const x of xs) h[Math.min(9, Math.floor(x * 10))] += 10 / xs.length;
  const e10 = TR.sedimentEq(10, 5);
  check('到達時間: ブラウン運動の粒子の高さの分布もボルツマン分布になる', h.every((v, i) => Math.abs(v - e10[i]) < 0.15 + 0.06 * e10[i]), h.map((v) => f(v, 2)).join(' '));
  const sc = TR.realScales(5);
  check('到達時間: 例題4の粒子で D = 4.37×10⁻¹³ m²/s、重力長 16.0 µm、P = 5 で H²/D ≈ 4.1 時間', Math.abs(TR.EX4.D / 4.365e-13 - 1) < 0.002 && Math.abs(TR.EX4.lg / 1.602e-5 - 1) < 0.002 && Math.abs(sc.tD / 3600 - 4.08) < 0.01, `H²/D=${f(sc.tD / 3600, 2)} 時間`);
}

console.log(fails ? `\n${fails} 件失敗` : '\nすべて成功');
process.exit(fails ? 1 : 0);
