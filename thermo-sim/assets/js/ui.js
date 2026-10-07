// =============================================================
//  ui.js ― ページ共通の小さな UI ヘルパー
// =============================================================
export const $ = (id) => document.getElementById(id);

export function fmt(v, d = 2) {
  if (!Number.isFinite(v)) return '–';
  const s = v.toFixed(d);
  return s === '-' + (0).toFixed(d) ? (0).toFixed(d) : s;
}
export function fmtSigned(v, d = 1) {
  if (!Number.isFinite(v)) return '–';
  const s = fmt(v, d);
  return v > 0 && s !== (0).toFixed(d) ? '+' + s : s;
}

/** <input type=range id=..> と <output id=..-val> を結びつける */
export function bindRange(id, fn, show = (v) => v, fire = true) {
  const el = $(id), out = $(id + '-val');
  const h = () => { const v = parseFloat(el.value); if (out) out.textContent = show(v); fn(v); };
  el.addEventListener('input', h);
  if (fire) h();
  return { el, set(v) { el.value = v; if (out) out.textContent = show(parseFloat(el.value)); } };
}

export function bindCheck(id, fn, fire = true) {
  const el = $(id);
  el.addEventListener('change', () => fn(el.checked));
  if (fire) fn(el.checked);
  return el;
}

/** data-value を持つボタン群を「どれか1つ選ぶ」セグメントにする */
export function segmented(id, fn, fire = true) {
  const box = $(id);
  const btns = [...box.querySelectorAll('button[data-value]')];
  const select = (val, call = true) => {
    for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.value === val));
    if (call) fn(val);
  };
  for (const b of btns) b.addEventListener('click', () => select(b.dataset.value));
  const init = btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0];
  if (fire) select(init.dataset.value); else select(init.dataset.value, false);
  return { select, get value() { return btns.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value; } };
}

/** アニメーションループ（再生/一時停止） */
export class Loop {
  constructor(frame) {
    this.frame = frame; this.running = true;
    const tick = () => { if (this.running) this.frame(); else this.frame(true); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  toggle() { this.running = !this.running; return this.running; }
}

export function bindPlayPause(id, loop) {
  const b = $(id);
  const upd = () => { b.textContent = loop.running ? '⏸ 一時停止' : '▶ 再生'; b.setAttribute('aria-pressed', String(!loop.running)); };
  b.addEventListener('click', () => { loop.toggle(); upd(); });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault(); loop.toggle(); upd();
    }
  });
  upd();
}

/** 投影モード（文字を大きく）。設定はブラウザに保存（使えなければ無視） */
export function setupCommon() {
  let on = false;
  try { on = localStorage.getItem('thermo-proj') === '1'; } catch (e) { /* noop */ }
  document.body.classList.toggle('proj', on);
  const b = document.getElementById('btn-proj');
  if (b) {
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => {
      on = !on;
      document.body.classList.toggle('proj', on);
      b.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem('thermo-proj', on ? '1' : '0'); } catch (e) { /* noop */ }
      window.dispatchEvent(new Event('resize'));
    });
  }
}

/** ΔU = Q + W の帳簿表示を更新 */
export function updateLedger(prefix, s, d = 1) {
  const set = (k, v) => { const el = $(prefix + k); if (el) el.textContent = fmtSigned(v, d); };
  set('dU', s.dU); set('Q', s.Q); set('W', s.W);
}

/**
 * 再生速度スライダー（対数目盛）。×1 = 1フレームあたり時間 0.1 進む。
 * HTML: <input type="range" id=.. min="-0.7" max="1.6" step="0.05" value="0">
 * fn には 1フレームで進める時間を渡す
 */
export function bindSpeed(id, fn) {
  const el = $(id), out = $(id + '-val');
  const show = (m) => '×' + (m < 1 ? m.toFixed(1) : m < 10 ? m.toFixed(1).replace(/\.0$/, '') : m.toFixed(0));
  const h = () => { const m = Math.pow(10, parseFloat(el.value)); if (out) out.textContent = show(m); fn(0.1 * m); };
  el.addEventListener('input', h);
  h();
  return { set(mult) { el.value = Math.log10(mult); h(); } };
}
