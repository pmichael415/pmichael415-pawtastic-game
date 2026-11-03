// A continuous 15-minute session of the busy scene (phone readiness plan, task 7): the private review build in
// Chromium with iPhone 13 emulation and battery-saver graphics (the phone default). Every minute: frame rate, p95,
// slow frames, the longest frame, JS heap (Chromium only), page size, and the game's progress. Looks for slowdown
// over time, leaks and errors. NOT a real iPhone. Run: node qa/soak.cjs [minutes]   (needs review/dist built)
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const MIN = Number(process.argv[2] || 15);
const DIST = path.resolve(__dirname, '../review/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(5184);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); sessionStorage.setItem('pawtastic-test-save', 'busy'); sessionStorage.setItem('pawtastic-diag', '1'); if (!localStorage.getItem('pawtastic-settings-v1')) localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false, lowPower: true })); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => errors.push('PAGE CRASHED'));
  await page.goto('http://127.0.0.1:5184/index.html#daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonDiagReport && typeof window.__tycoonDiagReport.pups === 'number', null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('section[aria-label="3D daycare view"] canvas')?.scrollIntoView({ block: 'center' }));
  const rows = [];
  console.log(`Chromium ${browser.version()} · iPhone 13 emulation · battery-saver graphics · busy test save · ${MIN} minutes (software graphics, not a real iPhone)`);
  // act like a player: close the day's report and level-ups as they appear (they pause the clock while open)
  const closeDialogs = async () => {
    for (const name of [/^Start day/, /^Continue$/]) {
      const b = page.getByRole('button', { name }).first();
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }
  };
  for (let m = 1; m <= MIN; m++) {
    await page.evaluate(() => window.__tycoonDiag.reset());
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(10000);
      await closeDialogs();
    }
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const d = window.__tycoonDiagReport;
      const s = window.__tycoonDiag.summary();
      // the game's own state isn't exposed in production; read the HUD
      const hud = document.querySelector('section[aria-label="Daycare status"]')?.textContent ?? '';
      return { fps: Math.round(s.fps * 10) / 10, p95: Math.round(s.frameP95 * 10) / 10, slow50: s.slow50, frames: s.frames, longest: Math.round(s.longestFrame), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : 'n/a', nodes: document.getElementsByTagName('*').length, pups: d.pups, staff: d.staff, calls: d.drawCalls, sim: Math.round(s.tickAvg * 100) / 100, screen: Math.round(s.uiAvg * 10) / 10, hud: hud.replace(/\s+/g, ' ').slice(0, 60) };
    });
    rows.push({ minute: m, ...r });
    console.log(`min ${String(m).padStart(2)}: ${r.fps} fps · p95 ${r.p95} ms · slow>50ms ${r.slow50}/${r.frames} · worst ${r.longest} ms · heap ${r.heapMB} MB · DOM ${r.nodes} · pups ${r.pups} staff ${r.staff} calls ${r.calls} · sim ${r.sim} ms · screen ${r.screen} ms · ${r.hud}`);
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'soak.json'), JSON.stringify({ rows, errors }, null, 1));
  console.log(`errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
})();
