// The service loop in a real browser (owner brief, 3 Nov): daycare + bath → check-in → care → the owner arrives
// before the bath is done → a complaint → a remedy → the bill, satisfaction, reputation and loyalty update. Also a
// visit that goes well, a double-tapped checkout, a reload mid-visit, a direct link, an old save, and a second tab.
// iPhone 13 and a 1280 × 800 desktop. Needs the dev server (DEV-only hooks). Run: node qa/e2e-service.cjs [base-url]
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-daycare-next-v1';
const OUT = path.join(__dirname, 'out');
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const SKIPPED = { mode: 'scratch', beat: 'meet', startedAt: 0, upgrade: null, done: false, skipped: true };

/** Runs a page step, retrying if a freshly started dev server reloads the page while optimising dependencies. */
async function steady(page, fn) {
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!/context was destroyed|navigation/i.test(String(e)) || i === 3) throw e;
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

/** A visit as the game stores it. */
const visit = (over) => ({ owner: 'Taylor', requests: ['daycare'], prepaid: [], arrivedDay: 1, arrived: 480, pickupDay: 1, pickup: 940, ownerHere: null, waitedLobby: 0, checkedInAt: 480, history: [], scuffle: false, safeMove: false, finishing: null, remedies: {}, paid: 0, ...over });

/**
 * A pup's panel, opened the way a player does now (the list under the 3D view is gone): from the front desk when the
 * family is there, otherwise by tapping the pup in the daycare.
 */
async function cardOf(page, name) {
  const open = () => page.getByRole('article', { name });
  if (await open().count()) return open();
  const desk = page.getByRole('region', { name: 'Front desk' }).getByRole('button', { name: new RegExp(`(🐕 ${name}\\b| for ${name}\\b|^${name} · )`) });
  if (await desk.count()) { await desk.first().click(); if (await open().first().waitFor({ timeout: 1500 }).then(() => true, () => false)) return open(); }
  const id = await page.evaluate((n) => window.__tycoonState().facilities.f1.dogs.find((d) => d.name === n)?.id, name);
  for (let i = 0; i < 8 && id; i++) {
    for (const block of ['center', 'start', 'end']) {
      await page.evaluate((b) => document.querySelector('section[aria-label="3D daycare view"] canvas')?.scrollIntoView({ block: b }), block);
      await page.waitForTimeout(100);
      const p = await page.evaluate((id) => {
        const w = window.__tycoonWorld;
        const a = w.debugInfo().dogs.find((x) => x.id === id);
        if (!a) return null;
        const q = w.project(a.x, 0.3, a.z);
        const el = document.elementFromPoint(q.x, q.y);
        return { ...q, onCanvas: !!el && el.tagName === 'CANVAS' };
      }, id);
      if (!p || !p.visible || !p.onCanvas) continue;
      await page.mouse.click(p.x, p.y);
      if (await open().first().waitFor({ timeout: 700 }).then(() => true, () => false)) return open();
    }
    await page.waitForTimeout(200);
  }
  return open();
}

async function run(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const f = async () => (await st()).facilities.f1;
  const dog = async (id) => (await f()).dogs.find((d) => d.id === id);
  const card = (name) => cardOf(page, name);

  // A daycare with a bath room (the test kit's fixture), the guide skipped, opened straight from a direct link.
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await steady(page, () => page.evaluate(async ([KEY, SKIPPED]) => {
    localStorage.clear();
    localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', sound: false, music: false }));
    const kit = await import('/src/tycoon/testkit.ts');
    localStorage.setItem(KEY, JSON.stringify({ ...kit.richState(), tour: SKIPPED }));
  }, [KEY, SKIPPED]));
  await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
  const play = await page.evaluate(() => window.__tycoonState().facilities.f1.rooms.find((r) => r.type === 'playroom' && r.group === 'small-gentle').uid);
  const pup = (id, name, v, over = {}) => ({ id, name, breed: 1, size: 'small', temper: 'gentle', visits: 1, place: { kind: 'room', room: play }, checkedIn: true, happiness: 90, clean: 80, boarding: false, played: 1, bathed: false, visit: v, ...over });
  // prices up so random drop-offs stay rare during the checks; the clock at 15:20
  const setPups = (dogs, clock = 920) => page.evaluate(([dogs, clock]) => window.__tycoonSet((s) => ({ ...s, facilities: { f1: { ...s.facilities.f1, open: true, clockMin: clock, cleanliness: 95, prices: { ...s.facilities.f1.prices, daycare: 80 }, dogs } } })), [dogs, clock]);

  try {
    // ---------- 1. the owner brief's scenario ----------
    await setPups([pup('e1', 'Biscuit', visit({ requests: ['daycare', 'bath'], pickup: 940 }))]);
    await (await card('Biscuit')).getByRole('button', { name: 'Bath', exact: true }).click();
    check(`${label}: the bath starts and takes time (not paid yet)`, (await dog('e1')).bathing > 0 && (await dog('e1')).bathed === false);
    const coins0 = (await st()).coins;
    // reload mid-visit: the visit and the running bath survive
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    const r = await dog('e1');
    check(`${label}: a reload keeps the booking and the running bath`, !!r && r.visit.requests.includes('bath') && r.bathing > 0);
    await page.evaluate(() => { window.__tycoonSpeed = 8; });
    await page.waitForFunction(() => window.__tycoonState().facilities.f1.dogs.find((d) => d.id === 'e1')?.visit.ownerHere != null, null, { timeout: 15000 });
    await page.evaluate(() => { window.__tycoonSpeed = 1; });
    check(`${label}: the owner arrives at pickup time, before the bath is done`, (await dog('e1')).bathing > 0);
    check(`${label}: the panel says Taylor is here`, (await (await card('Biscuit')).getByText(/Taylor is here for pickup/).count()) > 0);
    if (opts.viewport && opts.viewport.width > 500) {
      const owners = await page.evaluate(() => window.__tycoonWorld?.debugInfo().owners ?? -1);
      check(`${label}: Taylor is standing in the 3D lobby`, owners >= 1, `owners ${owners}`);
    }
    await (await card('Biscuit')).getByRole('button', { name: /^Check out/ }).click();
    const sheet = page.getByRole('dialog', { name: /Pickup — Biscuit/ });
    await sheet.waitFor();
    check(`${label}: the pickup sheet shows the complaint`, (await sheet.getByText(/still in the bath/).count()) > 0);
    await page.screenshot({ path: path.join(OUT, `service-${label.replace(/\W+/g, '-')}-1-complaint.png`) });
    await sheet.getByRole('button', { name: /wait for the bath/ }).click();
    check(`${label}: the owner agrees to wait`, (await sheet.getByText(/I'll wait for the bath/).count()) > 0);
    check(`${label}: checkout waits for the bath`, await sheet.getByRole('button', { name: /Waiting for the bath/ }).isDisabled());
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__tycoonSpeed = 8; });
    await page.waitForFunction(() => !window.__tycoonState().facilities.f1.dogs.some((d) => d.id === 'e1'), null, { timeout: 20000 });
    await page.evaluate(() => { window.__tycoonSpeed = 1; });
    const o1 = (await f()).outcomes.at(-1);
    check(`${label}: handed over when the bath finished`, o1.how === 'finished' && o1.dog === 'Biscuit', o1.how);
    check(`${label}: the bill has the bath, once`, o1.lines.filter((l) => /^Bath( — deluxe tub \(\+\d+\))?$/.test(l.label)).length === 1, JSON.stringify(o1.lines));
    check(`${label}: the complaint is recorded as put right`, o1.complaints.some((c) => c.kind === 'bath' && c.remedy === 'finish' && c.resolved));
    check(`${label}: satisfaction, reputation and loyalty updated`, o1.satisfaction > 0 && typeof o1.repDelta === 'number' && (await f()).guestBook.some((g) => g.name === 'Biscuit' && g.sat === o1.satisfaction), `sat ${o1.satisfaction}, rep ${o1.repDelta}`);
    const receipt = page.getByRole('region', { name: 'Receipt' });
    check(`${label}: an itemized receipt appears`, (await receipt.count()) === 1 && (await receipt.getByText(/^Bath( — deluxe tub \(\+\d+\))?$/).count()) === 1);
    await page.screenshot({ path: path.join(OUT, `service-${label.replace(/\W+/g, '-')}-2-receipt.png`) });
    check(`${label}: coins rose by exactly the bill (plus any friendship bonus)`, (await st()).coins - coins0 >= o1.total, `${(await st()).coins - coins0} vs ${o1.total}`);

    // ---------- 2. a visit that went well ----------
    await setPups([pup('e2', 'Daisy', visit({ owner: 'Morgan', ownerHere: 940 }))], 945);
    const n2 = (await f()).outcomes.length;
    await (await card('Daisy')).getByRole('button', { name: /^Check out/ }).click();
    await page.waitForTimeout(300);
    check(`${label}: a good visit checks out at once (no sheet)`, (await page.getByRole('dialog', { name: /Pickup/ }).count()) === 0);
    const o2 = (await f()).outcomes.at(-1);
    check(`${label}: …delighted, with a positive outcome`, (await f()).outcomes.length === n2 + 1 && o2.mood === 'delighted' && o2.repDelta >= 1, `${o2.mood}, rep ${o2.repDelta}`);

    // ---------- 3. a double-tapped checkout charges once ----------
    await page.evaluate(() => { window.__tycoonSpeed = 1; });
    await setPups([pup('e3', 'Rocket', visit({ owner: 'Casey', ownerHere: 905 }))], 940); // waited 35 min → a complaint (gives up at 60)
    const n3 = (await f()).outcomes.length;
    const c3 = (await st()).coins;
    await (await card('Rocket')).getByRole('button', { name: /^Check out/ }).click();
    const s3 = page.getByRole('dialog', { name: /Pickup — Rocket/ });
    await s3.waitFor();
    await s3.getByRole('button', { name: /^Refund/ }).click();
    const payBtn = s3.getByRole('button', { name: /say goodbye/ });
    await payBtn.dblclick().catch(() => {});
    await page.waitForTimeout(400);
    const o3 = (await f()).outcomes.at(-1);
    check(`${label}: a double tap stays in the game`, new URL(page.url()).pathname === '/daycare-next', page.url());
    check(`${label}: a double tap settles the visit once`, (await f()).outcomes.length === n3 + 1 && !(await dog('e3')), `${(await f()).outcomes.length - n3} outcomes`);
    check(`${label}: …and the refund shows on the bill`, o3.lines.some((l) => /Refund/.test(l.label) && l.amount < 0) && (await st()).coins - c3 <= o3.total + 50);

    // ---------- 4. reputation explains itself ----------
    await page.getByRole('button', { name: /^Reputation/ }).click();
    const rep = page.getByRole('dialog', { name: /Reputation/ });
    check(`${label}: the reputation sheet shows why it moved`, (await rep.getByText(/delighted with Daisy's day/).count()) > 0);
    await page.keyboard.press('Escape');

    // ---------- 5. a second tab watches ----------
    const p2 = await ctx.newPage();
    await p2.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await p2.getByRole('region', { name: 'Open in another tab' }).waitFor({ timeout: 8000 }).catch(() => {});
    check(`${label}: a second tab shows "open in another tab"`, (await p2.getByRole('region', { name: 'Open in another tab' }).count()) === 1);
    await p2.close();
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    check(`${label}: service checks ran`, false, String(e).split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, `service-${label.replace(/\W+/g, '-')}-error.png`) }).catch(() => {});
  }
  await ctx.close();
}

async function oldSave(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
    await steady(page, () => page.evaluate(async ([KEY, SKIPPED]) => {
      localStorage.clear();
      const kit = await import('/src/tycoon/testkit.ts');
      const s = kit.richState();
      const f = s.facilities.f1;
      const room = f.rooms.find((r) => r.type === 'playroom').uid;
      // a pup saved before visits existed (no visit, no bathing)
      const old = { id: 'd77', name: 'Pepper', breed: 1, size: 'small', temper: 'gentle', visits: 1, place: { kind: 'room', room }, checkedIn: true, happiness: 70, clean: 60, boarding: false, played: 0, bathed: false };
      const saved = { ...s, tour: SKIPPED, facilities: { f1: { ...f, dogs: [old] } } };
      delete saved.facilities.f1.repLog; delete saved.facilities.f1.reviews; delete saved.facilities.f1.outcomes; delete saved.facilities.f1.referralUntil;
      localStorage.setItem(KEY, JSON.stringify(saved));
    }, [KEY, SKIPPED]));
    await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__tycoonState && !!window.__tycoonState());
    const d = await page.evaluate(() => window.__tycoonState().facilities.f1.dogs[0]);
    check('old save: a pup from before visits loads with a plain daycare booking', !!d && d.visit.requests.join() === 'daycare' && d.visit.pickup === 1050);
    const card = (name) => cardOf(page, name);
    check('old save: its panel shows the booking', (await (await card('Pepper')).getByText(/Booked daycare/).count()) > 0);
    check('old save: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    check('old save checks ran', false, String(e).split('\n')[0]);
  }
  await ctx.close();
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await run(browser, 'iPhone 13', { ...devices['iPhone 13'] });
  await run(browser, 'Desktop', { viewport: { width: 1280, height: 800 } });
  await oldSave(browser);
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
