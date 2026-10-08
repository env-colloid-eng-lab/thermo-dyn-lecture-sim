// =============================================================
//  i18n.js ― 日本語／英語の切り替え（DOM がなくても動く）
//  ページの <html lang="en"> を見て英語にする。Node のテストでは日本語。
// =============================================================
const htmlLang = typeof document !== 'undefined' ? document.documentElement.lang || 'ja' : 'ja';
export const LANG = htmlLang.startsWith('en') ? 'en' : 'ja';

/** tr('日本語', 'English') ― いまの言語の方を返す */
export const tr = (ja, en) => (LANG === 'en' ? en : ja);
