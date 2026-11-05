// The customer-growth loop, through the real screen (customer-growth requirement §6).
// A SCRIPTED player — not a person, not a real iPhone: Chromium with iPhone 13 emulation. A genuinely fresh game
// (cleared storage, no coins, experience or customers injected — every family arrives through the simulation). It
// plays at NORMAL speed (1×) through the guide, the first family and the first retention decision (a free thank-you
// call), then switches to an ACCELERATED 4× clock — labelled as such in the log — only so the next active days come
// sooner for this test. It taps what the game puts forward: the guide, the front desk, the pup panel's next step, the
// pickup sheet, the Objectives button, and the Marketing screen (the thank-you, then Local flyers once it unlocks and
// the coins cover it with a reserve). Whether a campaign or a call brings anyone is up to the simulation; the log says
// what happened either way.
// Screenshots, a video and log.json go in qa/out/customers-session/. Needs the dev server.
// Run: NODE_PATH=/opt/node-tools/node_modules node qa/customers-session.cjs [base-url]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.env.CUST_OUT || path.join(__dirname, 'out', 'customers-session');
const LIMIT_MS = Number(process.env.CUST_LIMIT_MIN || 30) * 60 * 1000;
const FAST = Number(process.env.CUST_FAST || 4);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });

const t0 = Date.now();
const log = [];
const milestones = {};
const m = { taps: 0, failedTaps: 0, errors: [], toasts: [] };
let shots = 0;
let speed = 1;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], recordVideo: { dir: path.join(OUT, 'video'), size: { width: 390, height: 844 } } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => m.errors.push(e.message));
  const st = () => page.evaluate(() => window.__tycoonState());
  const hm = (c) => (c == null ? '' : `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(Math.floor(c % 60)).padStart(2, '0')}`);
  let lastSeen = { day: null, clock: null, coins: null };
  const note = (what, extra = {}) => {
    const line = { realS: Math.round((Date.now() - t0) / 1000), speed: `${speed}×`, day: lastSeen.day, time: hm(lastSeen.clock), coins: lastSeen.coins, what, ...extra };
    log.push(line);
    console.log(`[${line.realS}s ${line.speed}] day ${line.day} ${line.time} · ${line.coins} coins · ${what}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
  };
  const mark = (key, what, extra = {}) => { if (!milestones[key]) { milestones[key] = { realS: Math.round((Date.now() - t0) / 1000), speed: `${speed}×`, day: lastSeen.day, time: hm(lastSeen.clock), what, ...extra }; note(`MILESTONE ${key}: ${what}`, extra); } };
  const shot = async (name, what) => {
    const file = `${String(++shots).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
    note(`screenshot ${file} — ${what}`);
  };
  async function toasts() {
    const ts = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
    for (const t of ts) if (!m.toasts.some((x) => x.text === t)) { m.toasts.push({ realS: Math.round((Date.now() - t0) / 1000), text: t }); note(`toast: ${t}`); }
    return ts;
  }
  async function tap(loc, label) {
    try {
      await loc.tap({ timeout: 3000 });
      m.taps++;
      note(`tap: ${label}`);
      await page.waitForTimeout(350);
      await toasts();
      return true;
    } catch (e) {
      m.failedTaps++;
      note(`FAILED tap: ${label} — ${String(e).split('\n')[0].slice(0, 120)}`);
      return false;
    }
  }
  async function usable(sel) {
    const loc = page.locator(sel);
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if ((await el.isVisible().catch(() => false)) && (await el.isEnabled().catch(() => false))) return el;
    }
    return null;
  }
  const textOf = async (loc) => ((await loc.getAttribute('aria-label').catch(() => null)) || (await loc.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
  const sheetOpen = async () => (await page.locator('[role="dialog"]').filter({ has: page.locator('h2:has-text("Marketing")') }).count()) > 0;
  async function closeSheet() { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
  async function openMarketing(tab) {
    const btn = await usable('button[aria-label^="Marketing"]');
    if (!btn) return false;
    await tap(btn, `Marketing (status bar)`);
    await page.waitForTimeout(500);
    if (tab && tab !== 'Customers') await tap(page.getByRole('tab', { name: tab }), `${tab} tab`);
    return sheetOpen();
  }

  // ================= a genuinely fresh game =================
  await page.goto(BASE + '/help', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true, analytics: false, sound: false, music: false })); });
  for (let i = 0; i < 4; i++) {
    try {
      await page.goto(BASE + '/daycare-next', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__tycoonState?.(), null, { timeout: 15000 });
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await page.evaluate(() => { window.__tycoonSpeed = 1; });
  const fresh = await st();
  mark('0 fresh game', `${fresh.coins} coins, ${fresh.xp} XP, ${fresh.facilities.f1.guestBook.length} families in the guest book`);
  await tap(page.locator('section[aria-label="Start your daycare"] button:has-text("Quick start")'), 'Quick start');
  await page.waitForTimeout(800);

  const seen = new Set();
  let thanked = null; // { family, msg }
  let campaign = null; // { uid, at }
  let attributed = null; // the first paid visit that came from outreach or a campaign
  let resultsSeen = false;

  async function dialogs() {
    const report = await usable('button:has-text("Start day")');
    if (report) {
      if (!seen.has('report')) { seen.add('report'); await shot('day-report', 'the end-of-day report'); }
      return tap(report, 'Start the next day (day report)');
    }
    const cont = await usable('[role="dialog"] button:has-text("Continue"), [role="alertdialog"] button:has-text("Continue")');
    if (cont) return tap(cont, `Continue (${await textOf(page.locator('[role="dialog"] h2, [role="alertdialog"] h2').first())})`);
    return false;
  }
  async function pickupSheet() {
    const sheet = page.locator('[aria-label^="Pickup — "]');
    if (!(await sheet.count()) || !(await sheet.first().isVisible().catch(() => false))) return false;
    const answer = await usable('[aria-label^="Pickup — "] .grid button');
    if (answer) return tap(answer, `answer the concern: ${await textOf(answer)}`);
    const pay = await usable('[aria-label^="Pickup — "] button:has-text("say goodbye")');
    if (pay) return tap(pay, 'pay and say goodbye');
    return false;
  }
  /** The daily care: what the game puts forward, in the same order as the first-session script. */
  async function care(state) {
    if (state.tour && !state.tour.done && !state.tour.skipped) {
      if (state.tour.beat === 'upgrade') {
        const bin = await usable('section[aria-label="Guide"] button[aria-label^="Toy Bin"]');
        if (bin) return tap(bin, 'Toy Bin (guide)');
      } else if (state.tour.beat === 'decision') {
        const build = page.locator('section[aria-label="Guide"] button[aria-label^="Build a "]');
        const rest = await usable('section[aria-label="Guide"] button:has-text("rest")');
        if ((await build.count()) && (await build.first().isEnabled())) return tap(build.first(), 'Build the playroom (guide)');
        if (rest) return tap(rest, await textOf(rest));
      }
    } else {
      // a family the panel says has no free spot: offer another day (free) — or, if they've moved twice, can't take today
      const panelFull = await page.locator('[data-testid="panel-sheet"]').getByText(/right now — they'd wait in the lobby/).count();
      if (panelFull) {
        const another = await usable('[data-testid="panel-sheet"] button:has-text("Offer another day")');
        if (another) return tap(another, 'Offer another day (no free spot)');
        const away = await usable('[data-testid="panel-sheet"] button:has-text("Can\'t take today")');
        if (away) return tap(away, "Can't take today (no free spot)");
      } else if (!(await page.locator('[data-testid="panel-sheet"]').count())) {
        const fullAtDesk = page.locator('section[aria-label="Front desk"] li').filter({ hasText: '⚠️ no free' }).locator('button').first();
        if ((await fullAtDesk.count()) && (await fullAtDesk.isVisible().catch(() => false))) return tap(fullAtDesk, `open ${await textOf(fullAtDesk)} (no free spot)`);
      }
    }
    for (const sel of ['[data-testid="next-action"] button', 'section[aria-label="Front desk"] button:has-text("Check out")', 'section[aria-label="Front desk"] button:has-text("Check in")', 'section[aria-label="Rooms"] button:has-text("Move ")', 'section[aria-label="Rooms"] button:has-text("wants to play")', 'section[aria-label="Rooms"] button:has-text("bath is booked")']) {
      const el = await usable(sel);
      if (el) return tap(el, await textOf(el));
    }
    const close = await usable('[data-testid="panel-sheet"] button[aria-label="Close panel"]');
    if (close) return tap(close, 'Close panel (nothing to do for this pup)');
    return false;
  }

  /** The first retention decision, as the Objectives bar puts it: open Marketing and thank the family (free). */
  async function thankYou(state) {
    if (thanked) return false;
    const btn = await usable('section[aria-label="Objectives"] button:has-text("Open Marketing")');
    if (!btn) return false;
    const next = (await page.getByTestId('objective-next').innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    mark('3 the first retention decision is offered', next);
    await shot('objective-thank', `Next: ${next}`);
    await tap(btn, 'Open Marketing (objective)');
    await page.waitForTimeout(600);
    await shot('customers', 'Marketing → Customers: the first family, its status and story, and a free thank-you');
    const fam = page.locator('ul[aria-label="Families"] li').first();
    const story = (await fam.innerText().catch(() => '')).replace(/\s+/g, ' ');
    mark('2 the family is in the customer history', story);
    const thank = await usable('ul[aria-label="Families"] button[aria-label^="Say thank you to"]');
    if (!thank) { await closeSheet(); return false; }
    const coins = (await st()).coins;
    await tap(thank, await textOf(thank));
    await page.waitForTimeout(500);
    const msg = m.toasts.at(-1)?.text ?? '';
    const after = await st();
    thanked = { family: story.slice(0, 80), msg, coinsBefore: coins, coinsAfter: after.coins, bookings: after.facilities.f1.bookings };
    mark('4 thank-you made (free)', msg, { coinsChanged: after.coins - coins, bookings: after.facilities.f1.bookings.map((b) => `${b.name} day ${b.day} ${hm(b.min)} (${b.source.kind})`) });
    await shot('thanked', `after the call: ${msg}`);
    await closeSheet();
    // from here, the clock runs faster — for this test only, so the next active days come sooner
    speed = FAST;
    await page.evaluate((x) => { window.__tycoonSpeed = x; }, FAST);
    note(`ACCELERATED: the game clock now runs ${FAST}× for testing (a person plays at 1×)`);
    return true;
  }

  /** A small campaign, once it unlocks and the coins cover it with a reserve for the night. */
  async function launch(state) {
    if (campaign || !thanked) return false;
    const lv = (await page.locator('section[aria-label="Daycare status"]').innerText().catch(() => '')).match(/Lv (\d+)/)?.[1];
    if (Number(lv) < 2 || state.coins < 150 + 250) return false;
    if (!(await openMarketing('Campaigns'))) return false;
    const card = page.locator('article[aria-label="Local flyers"]');
    const text = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await shot('campaign-card', `Local flyers before paying: ${text.slice(0, 220)}`);
    const go = await usable('article[aria-label="Local flyers"] button:has-text("Launch Local flyers")');
    if (!go) { note('Local flyers not launchable yet', { text }); await closeSheet(); campaign = { skipped: text }; return true; }
    const coins = state.coins;
    await tap(go, 'Launch Local flyers · 150 coins');
    await page.waitForTimeout(500);
    const s = await st();
    const run = s.facilities.f1.campaignRuns.at(-1);
    campaign = { uid: run.uid, startDay: run.startDay, untilDay: run.untilDay, coinsBefore: coins, coinsAfter: s.coins };
    mark('5 campaign launched', `${run.name}: ${coins - s.coins} coins, days ${run.startDay}–${run.untilDay - 1}`, { card: text.slice(0, 300) });
    await shot('campaign-running', (await page.locator('[role="status"]').first().innerText().catch(() => '')).replace(/\s+/g, ' '));
    await closeSheet();
    return true;
  }

  async function results(label) {
    if (!(await openMarketing('Results'))) return null;
    await page.waitForTimeout(400);
    const panel = page.getByRole('tabpanel', { name: 'Results' });
    const text = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
    await shot(`results-${label}`, `Marketing → Results (${label})`);
    const next = page.locator('section[aria-label="What next"]');
    await next.scrollIntoViewIfNeeded().catch(() => {});
    await shot(`what-next-${label}`, (await next.innerText().catch(() => '')).replace(/\s+/g, ' '));
    await closeSheet();
    return text;
  }

  let idleSince = Date.now();
  while (Date.now() - t0 < LIMIT_MS) {
    const state = await st().catch(() => null);
    if (!state) { await page.waitForTimeout(500); continue; }
    const f = state.facilities.f1;
    lastSeen = { day: f.day, clock: f.clockMin, coins: state.coins };
    await toasts();
    if (!milestones['1 first family served'] && f.outcomes.some((o) => o.how === 'checkout' && o.total > 0)) {
      const o = f.outcomes.find((x) => x.how === 'checkout' && x.total > 0);
      mark('1 first family served', `${o.owner} paid ${o.total} for ${o.dog} (${o.mood}); first visit: ${o.firstVisit}; came: ${o.source?.kind}`);
    }
    // a booked family (from the thank-you or the campaign) at the desk
    const booked = f.dogs.find((d) => d.visit?.booking && !d.checkedIn && d.place.kind === 'lobby');
    if (booked && !seen.has(`desk-${booked.id}`)) {
      seen.add(`desk-${booked.id}`);
      mark('6 a booked family arrives', `${booked.name}: ${JSON.stringify(booked.visit.source)}`);
      await page.locator('section[aria-label="Front desk"]').scrollIntoViewIfNeeded().catch(() => {});
      await shot(`desk-booked-${booked.name}`, `${booked.name} at the desk — booked (${booked.visit.source.kind})`);
    }
    // the first paid visit that came from outreach or a campaign, and whether it was credited exactly once
    if (!attributed) {
      const o = f.outcomes.find((x) => x.how === 'checkout' && (x.revenue ?? 0) > 0 && x.source && (x.source.kind === 'campaign' || x.source.kind === 'outreach' || (x.source.kind === 'referral' && x.source.run)));
      if (o) {
        const run = o.source.kind === 'outreach' ? null : f.campaignRuns.find((r) => r.uid === o.source.run);
        const same = f.outcomes.filter((x) => JSON.stringify(x.source) === JSON.stringify(o.source) && x.how === 'checkout');
        const credited = run ? { visits: run.visits, revenue: run.revenue, costs: run.costs } : { visits: f.outreach.stats.visits, revenue: f.outreach.stats.revenue, costs: f.outreach.stats.costs };
        const fromOutcomes = { visits: same.filter((x) => (x.revenue ?? 0) > 0).length, revenue: same.reduce((a, x) => a + (x.revenue ?? 0), 0) };
        attributed = { dog: o.dog, owner: o.owner, total: o.total, revenue: o.revenue, source: o.source, credited, fromOutcomes, creditedOnce: credited.visits === fromOutcomes.visits && credited.revenue === fromOutcomes.revenue };
        mark('7 attributed visit paid once', `${o.owner} paid ${o.total} for ${o.dog} — ${o.source.kind === 'campaign' ? o.source.name : o.source.kind}`, attributed);
        await shot('receipt-attributed', `the attributed visit's receipt`);
      }
    }
    let did = (await dialogs()) || (await pickupSheet());
    if (!did && !(await sheetOpen())) did = await thankYou(state);
    if (!did && !(await sheetOpen())) did = await launch(state);
    if (!did) did = await care(state);
    // the campaign has run its days: compare what it brought with what it cost, then stop
    if (!did && campaign?.uid && f.day >= campaign.untilDay && attributed && !resultsSeen) {
      resultsSeen = true;
      const text = await results('after');
      mark('8 results compared with cost', text?.slice(0, 900) ?? '');
      break;
    }
    if (did) idleSince = Date.now();
    else if (Date.now() - idleSince > 20000) { note('idle 20s', { offered: (await page.locator('button:visible').allInnerTexts().catch(() => [])).slice(0, 8) }); idleSince = Date.now(); }
    await page.waitForTimeout(did ? 150 : 500);
  }
  if (!resultsSeen) mark('8 results compared with cost', (await results('at-limit'))?.slice(0, 900) ?? '(could not open)');

  const end = await st();
  const f = end.facilities.f1;
  const summary = {
    note: `Scripted play in Chromium with iPhone 13 emulation — not a person, not a real iPhone. 1× through the guide, the first family and the thank-you; then ${FAST}× (accelerated, for testing only). No customers, coins or bookings injected.`,
    realMinutes: +((Date.now() - t0) / 60000).toFixed(1),
    taps: m.taps, failedTaps: m.failedTaps, pageErrors: m.errors,
    milestones,
    thanked, campaign, attributed,
    runs: f.campaignRuns,
    outreach: f.outreach,
    bookings: f.bookings,
    footfall: f.footfall,
    guestBook: f.guestBook.map((g) => ({ name: g.name, visits: g.visits, lastDay: g.lastDay, sat: g.sat, source: g.source, issue: g.issue ?? null })),
    final: { day: f.day, clock: hm(f.clockMin), coins: end.coins, xp: end.xp },
    toasts: m.toasts,
  };
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ summary, log }, null, 1));
  await ctx.close();
  await browser.close();
  console.log('\n' + JSON.stringify({ ...summary, toasts: summary.toasts.length, footfall: undefined, guestBook: summary.guestBook.length }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
