// Serves review/dist with a strict CSP (like the artifact frame) and plays the first minutes.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '../review/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'none'" });
  fs.createReadStream(p).pipe(res);
}).listen(5181);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const rctx = await browser.newContext({ ...devices['iPhone 13'] });
  await rctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await rctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await page.goto('http://127.0.0.1:5181/index.html');
  await page.waitForTimeout(1500);
  const hub = await page.getByText('Daycare Tycoon').isVisible();
  await page.getByRole('link', { name: /Open your daycare/ }).tap();
  await page.waitForFunction(() => !!window.__daycareWorld, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const btn = page.locator('[data-testid^="quick-checkin-"]').first();
  await btn.waitFor({ timeout: 8000 });
  await btn.tap();
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-tycoon-save-v1')));
  await page.screenshot({ path: 'qa/out/review-daycare.png' });
  await page.getByRole('link', { name: 'Shop' }).tap();
  await page.waitForTimeout(800);
  const locked = await page.getByText(/Private review build — purchases are turned off/).first().isVisible();
  await page.getByRole('link', { name: 'Graduation' }).tap();
  const gd = await page.frameLocator('iframe[title="Graduation Day match-3 game"]').getByText(/ENROLL YOUR PUP|Tap to start|GRADUATION DAY/i).first().isVisible({ timeout: 15000 }).catch(() => false);
  await page.waitForTimeout(1500);
  const graduation = await page.frameLocator('iframe[title="Graduation Day match-3 game"]').getByText(/ENROLL YOUR PUP|Tap to start|GRADUATION DAY/i).first().isVisible().catch(() => false);
  await page.getByRole('button', { name: 'Share and invite friends' }).tap();
  await page.waitForTimeout(800);
  const share = await page.getByText(/Private review build: invite links point here/).isVisible();
  console.log(JSON.stringify({ hub, checkedIn: s?.stats?.admitted === 1, coins: s?.coins, locked, graduation: gd || graduation, share, errors: errs }, null, 1));
  await browser.close(); srv.close();
})();
