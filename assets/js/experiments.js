// =============================================================
//  experiments.js ― 決まった手順で進む「実験」（DOM 非依存）
//    HeatCapacityRun : 熱を加えて Q と ΔT を測り、熱容量 C = Q/ΔT を求める
//  ページでは毎フレーム gas.advance() の後に update() を呼ぶ。
//  テスト（Node）でも同じクラスをそのまま回して確かめる。
// =============================================================
import { ADIABATIC, DIATHERMAL } from './engine.js';

/**
 * 熱容量の測定。
 *   'prep'   ピストンを落ち着かせる（数えない）
 *   'before' 加熱前の温度・体積を時間平均で測る
 *   'heat'   熱源（温度 Tb）に透熱壁で接触させる
 *   'settle' 熱源から離し（断熱壁に戻し）、中が落ち着くのを待つ
 *   'after'  加熱後の温度・体積を時間平均で測る
 * Q は熱源との衝突1回ごとのエネルギー変化の合計（帳簿）なので正確。
 * 粒子数が有限なので T はゆらぐ。そのため ΔT は前後の時間平均の差で求める。
 *
 * mode 'V'：ピストン固定（定積）、mode 'P'：おもりを載せたピストン（定圧）
 */
export class HeatCapacityRun {
  constructor(gas, o = {}) {
    this.g = gas;
    this.mode = o.mode ?? 'V';
    this.Tb = o.Tb ?? 2;
    this.sides = o.sides ?? ['left'];
    this.dur = Object.assign({ prep: 200, before: 300, heat: 600, settle: 200, after: 300 }, o.dur);
    this.phase = 'prep';
    this.t0 = gas.time; this.tStart = gas.time;
    this._acc = { w: 0, T: 0, V: 0 };
    this._last = gas.time;
    this.before = null; this.after = null; this.result = null;
    this._setContact(false);
  }

  static PHASES = ['prep', 'before', 'heat', 'settle', 'after', 'done'];
  static LABEL = { prep: '準備中', before: '加熱前の T を測定中', heat: '熱源に接触中（加熱）', settle: '熱源から離して待機', after: '加熱後の T を測定中', done: '測定完了' };

  get label() { return HeatCapacityRun.LABEL[this.phase]; }
  /** 0..1 の進み具合 */
  get progress() {
    const d = this.dur, tot = d.prep + d.before + d.heat + d.settle + d.after;
    return this.phase === 'done' ? 1 : Math.min(1, (this.g.time - this.tStart) / tot);
  }

  _setContact(on) {
    for (const s of this.sides) { this.g.walls[s] = on ? DIATHERMAL : ADIABATIC; this.g.bath[s] = on; }
    if (on) this.g.Tbath = this.Tb;
  }

  update() {
    const g = this.g;
    const dt = g.time - this._last; this._last = g.time;
    if (this.phase === 'before' || this.phase === 'after') {
      this._acc.w += dt; this._acc.T += (g.kinetic() / g.N) * dt; this._acc.V += g.X * g.H * dt;
    }
    if (this.phase === 'done' || g.time - this.t0 < this.dur[this.phase]) return;
    // 次の段階へ
    const next = HeatCapacityRun.PHASES[HeatCapacityRun.PHASES.indexOf(this.phase) + 1];
    if (this.phase === 'before' || this.phase === 'after') {
      const a = this._acc, m = { T: a.T / a.w, V: a.V / a.w };
      if (this.phase === 'before') this.before = m; else this.after = m;
      this._acc = { w: 0, T: 0, V: 0 };
    }
    if (this.phase === 'prep') g.resetLedger();          // ここから Q, W を数える
    if (next === 'heat') this._setContact(true);
    if (next === 'settle') this._setContact(false);
    if (next === 'done') this._finish();
    this.phase = next; this.t0 = g.time;
  }

  _finish() {
    const g = this.g, s = g.stats(), b = this.before, a = this.after;
    const dT = a.T - b.T, dV = a.V - b.V;
    this.result = {
      mode: this.mode, N: g.N, Tb: this.Tb,
      T0: b.T, T1: a.T, dT, dV,
      Q: s.Q, W: s.W,
      dU: g.N * dT,                        // 2次元理想気体: U = NkT
      PdV: this.mode === 'P' ? g.piston.Pext * dV : 0,
      C: s.Q / dT,
    };
    this.result.c = this.result.C / g.N;   // 1粒子あたり（k 単位）
  }
}
