// The old game's service flow vs the new one, action by action (milestone "Make PAWtastic feel like a daycare
// tycoon", §2). A scripted player — NOT a person — serves one family in each game on an iPhone 13 profile, tapping
// only the button each game itself puts forward as the next step. Each tap is logged with what was on screen: the
// panels open, how much of the screen they cover, and the buttons offered. Screenshots go in qa/out/flow-compare/.
// Needs the dev server. Run: NODE_PATH=/opt/node-tools/node_modules node qa/flow-compare.cjs [base-url]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'flow-compare');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

async function screen(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const panels = [...document.querySelectorAll('[role="dialog"], [data-testid="panel-sheet"], section[aria-label]')].filter(vis).map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute('aria-label') || el.getAttribute('role') || el.dataset.testid, cover: Math.round((100 * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top)) * Math.min(r.width, innerWidth)) / (innerWidth * innerHeight)) };
    });
    const overlays = [...document.querySelectorAll('[role="dialog"], [data-testid="panel-sheet"]')].filter(vis).map((el) => el.getAttribute('aria-label') || el.dataset.testid || 'dialog');
    const buttons = [...document.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
    return { panels, overlays, buttons };
  });
}

async function run(label, url, prep, steps) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/help');
  await page.evaluate(prep);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const log = [];
  let n = 0;
  const shot = async (what) => page.screenshot({ path: path.join(OUT, `${label}-${String(++n).padStart(2, '0')}.png`) }).then(() => what);
  const t0 = Date.now();
  for (const s of steps) {
    const before = await screen(page);
    const did = await s.do(page).catch((e) => `FAILED: ${String(e).split('\n')[0]}`);
    await page.waitForTimeout(s.wait ?? 600);
    const after = await screen(page);
    const opened = after.overlays.filter((x) => !before.overlays.includes(x));
    const closed = before.overlays.filter((x) => !after.overlays.includes(x));
    log.push({ step: s.name, tap: did, realS: Math.round((Date.now() - t0) / 100) / 10, opened, closed, cover: after.panels.filter((p) => after.overlays.includes(p.name)).reduce((a, p) => a + p.cover, 0), offered: after.buttons.slice(0, 14) });
    await shot(s.name);
  }
  await browser.close();
  return { label, log, errors };
}

/** Taps the first visible, enabled element of `sels` (in priority order); returns what it tapped, or null. */
async function tapFirst(page, sels) {
  for (const sel of sels) {
    const loc = page.locator(sel);
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false)) || !(await el.isEnabled().catch(() => false))) continue;
      const name = ((await el.getAttribute('aria-label')) || (await el.innerText().catch(() => '')) || sel).trim().replace(/\s+/g, ' ').slice(0, 60);
      try {
        await el.tap({ timeout: 3000 });
      } catch {
        tapFirst.failed = (tapFirst.failed ?? 0) + 1; // something covered it, or it went away: a failed tap
        continue;
      }
      return name;
    }
  }
  return null;
}

/** One family served end to end, following only the game's own next-step buttons. Logs every tap and wait. */
async function serveOne(label, url, prep, game) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/help');
  await page.evaluate(prep);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const log = [];
  let shots = 0;
  const t0 = Date.now();
  const note = async (kind, what, extra = {}) => {
    const sc = await screen(page);
    log.push({ realS: Math.round((Date.now() - t0) / 100) / 10, kind, what, overlays: sc.overlays, cover: sc.panels.filter((p) => sc.overlays.includes(p.name)).reduce((a, p) => a + p.cover, 0), ...extra });
    await page.screenshot({ path: path.join(OUT, `${label}-${String(++shots).padStart(2, '0')}.png`) });
  };
  for (const s of game.setup) {
    const did = await tapFirst(page, s);
    await page.waitForTimeout(1200);
    if (did) await note('setup', did);
  }
  const start = await game.coins(page);
  let pup = null;
  let waitedS = 0;
  for (let i = 0; i < 160; i++) {
    const tapped = await tapFirst(page, game.next(pup));
    if (tapped) {
      await page.waitForTimeout(900);
      if (!pup) pup = await game.pupName(page, tapped);
      await page.evaluate(() => { window.__tycoonSpeed = 1; });
      await note('tap', tapped);
    } else {
      await game.idle(page);
      await page.waitForTimeout(1000);
      waitedS += 1;
      if (waitedS % 10 === 0) await note('wait', `nothing to tap for ${waitedS}s (offered: ${(await screen(page)).buttons.slice(0, 8).join(' | ')})`);
    }
    if (pup && (await game.gone(page, pup))) {
      await page.waitForTimeout(800);
      await note('paid', `${pup} went home`, { coins: (await game.coins(page)) - start });
      break;
    }
  }
  await browser.close();
  const failedTaps = tapFirst.failed ?? 0;
  tapFirst.failed = 0;
  return { label, pup, taps: log.filter((x) => x.kind === 'tap').length, failedTaps, waitedS, log, errors };
}

const LEGACY_KEY = 'pawtastic-tycoon-save-v1';
const legacy = {
  setup: [['button:has-text("Skip tutorial")']],
  coins: (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"coins":0}').coins, LEGACY_KEY),
  pupName: (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"dogs":[]}').dogs.find((d) => d.checkedIn)?.name ?? null, LEGACY_KEY),
  gone: (page, name) => page.evaluate(([k, n]) => !JSON.parse(localStorage.getItem(k) || '{"dogs":[]}').dogs.some((d) => d.name === n), [LEGACY_KEY, name]),
  next: (pup) =>
    pup
      ? [`section[aria-label="Care for ${pup}"] [data-testid="primary-action"]`, `[role="button"][aria-label*="safe match for ${pup}"]`, `button[aria-label^="${pup},"]`]
      : ['[data-testid^="quick-checkin-"]'],
  idle: async () => {},
};
const fresh = {
  setup: [['section[aria-label="Start your daycare"] button:has-text("Quick start")'], ['button:has-text("Skip guide")'], ['button:has-text("Continue")'], ['button:has-text("Continue")']],
  coins: (page) => page.evaluate(() => window.__tycoonState?.().coins ?? 0),
  pupName: (page) => page.evaluate(() => window.__tycoonState?.().facilities.f1.dogs.find((d) => d.checkedIn)?.name ?? null),
  gone: (page, name) => page.evaluate((n) => !window.__tycoonState?.().facilities.f1.dogs.some((d) => d.name === n), name),
  next: (pup) =>
    pup
      ? [
          // a family with a concern: answer it (the first choice offered), then pay
          `[aria-label="Pickup — ${pup}"] .grid button`,
          `[aria-label="Pickup — ${pup}"] button:has-text("say goodbye")`,
          `section[aria-label="Front desk"] button:has-text("Check out ${pup}")`,
          `[data-testid="next-action"] button`,
          `section[aria-label="Rooms"] button:has-text("Move ${pup}")`,
          `section[aria-label="Rooms"] button:has-text("${pup} wants to play")`,
          `section[aria-label="Rooms"] button:has-text("${pup}'s bath is booked")`,
        ]
      : ['section[aria-label="Front desk"] button:has-text("Check in")'],
  // nothing to do for this pup until their family comes back: let game time pass faster (recorded as such)
  idle: async (page) => page.evaluate(() => { window.__tycoonSpeed = 6; }),
};

module.exports = { run, screen, serveOne };
if (require.main === module) {
  (async () => {
    const prep = () => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true, analytics: false, sound: false, music: false })); };
    const a = await serveOne('legacy', '/daycare', prep, legacy);
    const b = await serveOne('new', '/daycare-next', prep, fresh);
    for (const r of [a, b]) {
      console.log(`\n=== ${r.label}: ${r.pup} · ${r.taps} taps · ${r.failedTaps} failed taps · ${r.waitedS}s with nothing to tap · errors ${r.errors.length}`);
      for (const x of r.log) console.log(`  ${String(x.realS).padStart(5)}s ${x.kind.padEnd(5)} ${x.what}${x.coins !== undefined ? ` (coins ${x.coins >= 0 ? '+' : ''}${x.coins})` : ''} · open: ${x.overlays.join(', ') || '—'} · covers ${x.cover}%`);
    }
    fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ legacy: a, fresh: b }, null, 1));
  })();
}
