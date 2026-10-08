// =============================================================
//  cycles.js ― 熱機関・ヒートポンプのサイクルを自動で回す（DOM 非依存）
//    カルノーサイクル : 等温 → 断熱 → 等温 → 断熱
//    スターリングサイクル : 等温 → 定積 → 等温 → 定積
//  向き 'engine'（熱機関：P–V 図で時計回り）/ 'pump'（ヒートポンプ：反時計回り）
//  ページでは毎フレーム gas.advance() の後に update() を呼ぶ。
// =============================================================
import { ADIABATIC, DIATHERMAL } from './engine.js';

const SIDES = ['left', 'top', 'bottom'];

/**
 * 熱機関の向きでの4つの状態 A→B→C→D→A と、その間の過程。
 * 2次元理想気体（γ = 2）なので断熱線は T V = 一定。
 *   p: { Th, Tc, X1, r }  X1 = A の体積（ピストン位置）、r = 等温膨張での体積比
 */
export function cycleDef(type, p) {
  const { Th, Tc, X1, r } = p;
  const X2 = X1 * r;
  if (type === 'carnot') {
    return {
      states: [
        { name: 'A', X: X1, T: Th }, { name: 'B', X: X2, T: Th },
        { name: 'C', X: X2 * Th / Tc, T: Tc }, { name: 'D', X: X1 * Th / Tc, T: Tc }],
      kinds: ['iso', 'adi', 'iso', 'adi'],     // A→B, B→C, C→D, D→A
    };
  }
  // stirling
  return {
    states: [
      { name: 'A', X: X1, T: Th }, { name: 'B', X: X2, T: Th },
      { name: 'C', X: X2, T: Tc }, { name: 'D', X: X1, T: Tc }],
    kinds: ['iso', 'isoV', 'iso', 'isoV'],
  };
}

const KIND_LABEL = { iso: '等温', adi: '断熱', isoV: '定積' };

/** 向きを考えた過程の列 [{from, to, kind, bathT}] */
export function cycleSteps(type, dir, p) {
  const { states: S, kinds: K } = cycleDef(type, p);
  const steps = [];
  if (dir === 'engine') {
    for (let k = 0; k < 4; k++) steps.push({ from: S[k], to: S[(k + 1) % 4], kind: K[k] });
  } else {
    // 逆回し：A→D→C→B→A
    for (let k = 0; k < 4; k++) {
      const a = (4 - k) % 4, b = (3 - k + 4) % 4;
      steps.push({ from: S[a], to: S[b], kind: K[b] });
    }
  }
  for (const s of steps) {
    // 等温は両端の温度の熱源、定積は行き先の温度の熱源、断熱は熱源なし
    s.bathT = s.kind === 'adi' ? null : s.to.T;
    const dirWord = s.kind === 'isoV' ? (s.to.T > s.from.T ? '加熱' : '冷却') : (s.to.X > s.from.X ? '膨張' : '圧縮');
    s.label = `${s.from.name}→${s.to.name} ${KIND_LABEL[s.kind]}${dirWord}`;
  }
  return steps;
}

/** 理論値 */
export function cycleTheory(type, dir, p) {
  const { Th, Tc, r } = p, L = Math.log(r);
  const carnotEta = 1 - Tc / Th, carnotCOP = Th / (Th - Tc);
  if (dir === 'engine') {
    if (type === 'carnot') return { main: carnotEta, regen: carnotEta, carnot: carnotEta };
    // スターリング（再生器なし）: Qh = N Th ln r + N(Th−Tc)、W = N(Th−Tc) ln r
    return { main: ((Th - Tc) * L) / (Th * L + (Th - Tc)), regen: carnotEta, carnot: carnotEta };
  }
  if (type === 'carnot') return { main: carnotCOP, regen: carnotCOP, carnot: carnotCOP };
  // 逆スターリング（再生器なし）: 高温側へ出す正味の熱 = N Th ln r − N(Th−Tc)
  //   低温側から受け取る正味の熱 N(Tc ln r − (Th−Tc)) が負なら、ヒートポンプとしては働かない（COP < 1）
  return { main: (Th * L - (Th - Tc)) / ((Th - Tc) * L), regen: carnotCOP, carnot: carnotCOP };
}

export class CycleRunner {
  /**
   * o: { type: 'carnot'|'stirling', dir: 'engine'|'pump', Th, Tc, X1, r, speed, relax, prep }
   *   speed: ピストンの速さ、relax: 定積過程で熱源に触れさせておく時間
   */
  constructor(gas, o) {
    this.g = gas;
    this.o = Object.assign({ type: 'carnot', dir: 'engine', Th: 2, Tc: 1, X1: 30, r: 2, speed: 0.05, relax: 300, prep: 200 }, o);
    this.steps = cycleSteps(this.o.type, this.o.dir, this.o);
    this.theory = cycleTheory(this.o.type, this.o.dir, this.o);
    this.k = -1;              // -1 = 準備中（状態 A で高温熱源に接触）
    this.t0 = gas.time;
    this.cur = [];            // いまのサイクルの各過程の記録
    this.cycles = [];         // 終わったサイクル
    this.total = { Qh: 0, Qc: 0, W: 0, Qiso_h: 0, Qiso_c: 0, n: 0 };
    this._setBath(this.o.Th);
    gas.piston.mode = 'position';
    gas.piston.target = gas.X;
  }

  get step() { return this.k >= 0 ? this.steps[this.k] : null; }
  get label() { return this.k < 0 ? '準備中（状態 A に落ち着かせる）' : this.step.label; }

  _setBath(T) {
    for (const s of SIDES) { this.g.walls[s] = T == null ? ADIABATIC : DIATHERMAL; this.g.bath[s] = T != null; }
    if (T != null) this.g.Tbath = T;
  }

  _begin(k) {
    const g = this.g, s = this.steps[k];
    this.k = k; this.t0 = g.time;
    const st = g.stats();
    this._snap = { Q: st.Q, W: st.W, U: st.U };
    this._setBath(s.bathT);
    g.piston.speed = this.o.speed;
    g.piston.target = s.to.X;
  }

  _stepDone() {
    const g = this.g, s = this.step;
    if (s.kind === 'isoV') return g.time - this.t0 >= this.o.relax;
    return Math.abs(g.X - s.to.X) < 1e-9;
  }

  update() {
    const g = this.g;
    if (this.k < 0) {
      if (g.time - this.t0 >= this.o.prep) { g.resetLedger(); this._begin(0); }
      return;
    }
    if (!this._stepDone()) return;
    const st = g.stats(), s = this.step, a = this._snap;
    this.cur.push({ label: s.label, kind: s.kind, bathT: s.bathT, Q: st.Q - a.Q, W: st.W - a.W, dU: st.U - a.U });
    if (this.k === 3) this._closeCycle();
    this._begin((this.k + 1) % 4);
  }

  _closeCycle() {
    const { Th, Tc } = this.o;
    const c = { steps: this.cur, Qh: 0, Qc: 0, W: 0, Qiso_h: 0, Qiso_c: 0 };
    for (const s of this.cur) {
      c.W += s.W;
      if (s.bathT === Th) { c.Qh += s.Q; if (s.kind === 'iso') c.Qiso_h += s.Q; }
      if (s.bathT === Tc) { c.Qc += s.Q; if (s.kind === 'iso') c.Qiso_c += s.Q; }
    }
    Object.assign(c, this.perf(c));
    this.cycles.push(c);
    const T = this.total;
    T.Qh += c.Qh; T.Qc += c.Qc; T.W += c.W; T.Qiso_h += c.Qiso_h; T.Qiso_c += c.Qiso_c; T.n++;
    this.cur = [];
  }

  /**
   * 性能：熱機関なら効率 η = (外へした仕事)/(高温熱源から受け取った熱)、
   *       ヒートポンプなら成績係数 COP = (高温側へ出した熱)/(外からされた仕事)。
   * regen は「定積過程の熱は再生器の中でやりとりされる（熱源とはやりとりしない）」とした値。
   */
  perf(c) {
    if (this.o.dir === 'engine') return { main: -c.W / c.Qh, regen: -c.W / c.Qiso_h };
    return { main: -c.Qh / c.W, regen: -c.Qiso_h / c.W };
  }
}
