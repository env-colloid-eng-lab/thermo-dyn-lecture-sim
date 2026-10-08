// ブラウザでの操作テスト（Playwright が必要）
//   node tests/smoke-browser.mjs          … 全ページの全操作でエラーが出ないか
//   node tests/smoke-browser.mjs --shots  … あわせて tests/screenshots/ にスクショを保存
//
// 初回のみ:  npm install && npx playwright install chromium
// 既にある Chromium を使う場合:  CHROMIUM_PATH=/path/to/chrome node tests/smoke-browser.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv.includes('--shots');
const PAGES = ['index.html', 'sims/01-operations.html', 'sims/02-equilibrium.html',
  'sims/03-processes.html', 'sims/04-isothermal.html', 'sims/05-extensive.html'];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright が見つかりません。npm install && npx playwright install chromium を実行してください。');
  process.exit(2);
}

// --- 簡易静的サーバ ---
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;


const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = 0;
if (shots) fs.mkdirSync(path.join(root, 'tests/screenshots'), { recursive: true });

for (const pg of PAGES) {
  for (const width of shots ? [1400, 390] : [1400]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('requestfinished', async (rq) => { const r = await rq.response(); if (r && r.status() >= 400) errs.push(`${r.status()} ${rq.url().replace(base, '')}`); });
    page.on('requestfailed', (rq) => errs.push(`読み込み失敗 ${rq.url().replace(base, '')}`));
    await page.goto(base + pg);
    await page.waitForTimeout(600);
    if (width === 1400) {
      // すべてのボタンを2巡クリック → チェックボックス切替 → スライダーを最大・最小に
      const n = await page.$$eval('button', (bs) => bs.length);
      for (let rep = 0; rep < 2; rep++) for (let i = 0; i < n; i++) {
        await page.evaluate((i) => { const b = document.querySelectorAll('button')[i]; if (b && !b.disabled) b.click(); }, i);
        await page.waitForTimeout(100);
      }
      await page.evaluate(() => {
        for (const c of document.querySelectorAll('input[type=checkbox]')) c.click();
        for (const r of document.querySelectorAll('input[type=range]')) { r.value = r.max; r.dispatchEvent(new Event('input')); }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => { for (const r of document.querySelectorAll('input[type=range]')) { r.value = r.min; r.dispatchEvent(new Event('input')); } });
      await page.waitForTimeout(1200);
    } else {
      await page.waitForTimeout(1500);
    }
    const bad = await page.evaluate(() => (document.body.innerText.match(/NaN|undefined|Infinity/g) || []).length);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const ok = !errs.length && !bad && !hscroll;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${pg} @${width}px` +
      (errs.length ? `  エラー: ${errs.join(' | ')}` : '') + (bad ? `  NaN等の表示: ${bad}` : '') + (hscroll ? '  横スクロールあり' : ''));
    if (shots) {
      const name = pg.replace(/[\/.]/g, '_') + `_${width}.png`;
      await page.screenshot({ path: path.join(root, 'tests/screenshots', name), fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} 件失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
