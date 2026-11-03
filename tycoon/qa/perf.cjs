// Repeatable performance measurement (phone readiness plan, task 1). Builds the private review build (production),
// serves it with the preview's security rules, and in a FRESH browser profile per run (never a player's save) starts
// a test save — a normal day or the busy scene — with private diagnostics on. After a warm-up it samples 10 seconds:
// frame intervals (average, p50/p95/p99, slow frames), 3D update+draw time, simulation time per tick and screen render
// time. A second pass on the dev server records a CPU profile of the busy scene to find the hot functions.
// Run: node qa/perf.cjs [label]   (writes qa/out/perf-<label>.json)
const { chromium, devices } = require('playwright');
const { execSync } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const LABEL = process.argv[2] || 'run';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'review/dist');
const OUT = path.join(__dirname, 'out');
const SAMPLE_MS = 10000, WARM_MS = 4000;

if (!process.env.SKIP_BUILD) execSync('npx vite build --config review/vite.config.ts', { cwd: ROOT, stdio: 'ignore' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data: 'self'; img-src 'self' data: blob:; connect-src 'none'" });
  fs.createReadStream(p).pipe(res);
}).listen(5183);

async function measure(browser, { scenario, device, lowPower, url }) {
  const ctx = await browser.newContext(device === 'iphone' ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([scenario, lowPower]) => {
    try {
      sessionStorage.setItem('pawtastic-team-dismissed', '1');
      sessionStorage.setItem('pawtastic-test-save', scenario);
      sessionStorage.setItem('pawtastic-diag', '1');
      if (!localStorage.getItem('pawtastic-settings-v1')) localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false, lowPower }));
    } catch {}
  }, [scenario, lowPower]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonDiagReport && typeof window.__tycoonDiagReport.pups === 'number', null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('section[aria-label="3D daycare view"] canvas')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(WARM_MS);
  await page.evaluate(() => window.__tycoonDiag.reset());
  await page.waitForTimeout(SAMPLE_MS);
  await page.waitForTimeout(600); // let the overlay refresh its report
  const report = await page.evaluate(() => window.__tycoonDiagReport);
  await ctx.close();
  return { scenario, device, graphics: lowPower ? 'battery saver' : 'standard', errors, report };
}

async function profile(browser) {
  // Dev server (readable function names). Dev builds are slower than production: use for WHERE time goes, not how much.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); sessionStorage.setItem('pawtastic-test-save', 'busy'); } catch {} });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173/daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonWorld, null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(8000);
  const { profile: p } = await cdp.send('Profiler.stop');
  await ctx.close();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = p.timeDeltas; let total = 0;
  p.samples.forEach((id, i) => { const n = byId.get(id); const d = dt[i] / 1000; total += d; const f = n.callFrame; const key = `${f.functionName || '(anonymous)'} ${f.url.replace(/^.*\/(src|node_modules\/\.vite\/deps)\//, '').replace(/\?.*$/, '')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + d); });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: Math.round(v), pct: Math.round((1000 * v) / total) / 10 }));
  const byFile = new Map();
  for (const [k, v] of self) { const file = k.split(' ').slice(1).join(' ').replace(/:\d+$/, '') || '(native)'; byFile.set(file, (byFile.get(file) || 0) + v); }
  const files = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ file: k, pct: Math.round((1000 * v) / total) / 10 }));
  return { totalMs: Math.round(total), top, files };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const env = { browser: `Chromium ${browser.version()} (headless, Playwright)`, graphics: 'SwiftShader software rendering (no GPU)', machine: 'cloud container CPU, no graphics hardware', build: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(), date: new Date().toISOString(), note: 'Emulated screen sizes. NOT phone measurements.' };
  const runs = [];
  for (const scenario of ['normal', 'busy'])
    for (const [device, lowPower] of [['iphone', true], ['iphone', false], ['desktop', false]]) {
      runs.push(await measure(browser, { scenario, device, lowPower, url: 'http://127.0.0.1:5183/index.html#daycare-next' }));
      const r = runs.at(-1).report;
      console.log(`${scenario.padEnd(6)} ${device.padEnd(7)} ${runs.at(-1).graphics.padEnd(13)} ${String(r.fps).padStart(5)} fps · p95 ${r.frameMs.p95} · worst ${r.frameMs.longest} · slow>50 ${r.slowFrames.over50ms}/${r.slowFrames.of} · 3D ${r.view3dMs.avg} · sim ${r.simulationMs.avg}/tick · screen ${r.screenMs.avg} (${r.screenMs.renders}) · calls ${r.drawCalls} · ${r.canvas}`);
    }
  let prof = null;
  if (!process.env.SKIP_PROFILE) prof = await profile(browser).catch((e) => ({ error: String(e) }));
  await browser.close(); srv.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `perf-${LABEL}.json`), JSON.stringify({ env, runs, profile: prof }, null, 1));
  if (prof && prof.files) { console.log('\nCPU by file (dev server, busy scene):'); prof.files.forEach((x) => console.log(`  ${String(x.pct).padStart(5)}%  ${x.file}`)); console.log('\nHot functions:'); prof.top.slice(0, 15).forEach((x) => console.log(`  ${String(x.pct).padStart(5)}%  ${x.fn}`)); }
})();
