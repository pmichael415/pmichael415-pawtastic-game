// End-to-end QA for the PAWtastic Games hub, navigation, Recess Rush, shop, visit links and save migration.
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const KEY = 'pawtastic-tycoon-save-v1';
const nyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let pass = 0, fail = 0; const out = [];
const check = (n, ok, d = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pawtastic-team-dismissed', '1'); } catch {} }); // team picker has its own suite
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  async function fresh(save, path) {
    await page.goto(BASE + '/help');
    await page.evaluate(([k, v]) => { localStorage.clear(); if (v !== undefined) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('pawtastic-settings-v1', JSON.stringify({ view: 'overhead', seenWalkHelp: true })); }, [KEY, save]);
    await page.waitForTimeout(300);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  }

  // Hub & navigation
  await fresh(undefined, '/');
  check('hub shows both games', await page.getByText('Daycare Tycoon').isVisible() && await page.getByText('Recess Rush', { exact: true }).first().isVisible());
  const navLabels = await page.locator('nav[aria-label="Game tabs"] a').allInnerTexts();
  check('one bottom navigation for every game', navLabels.join('|') === 'Home|Daycare|Recess Rush|Graduation|Shop', navLabels.join('|'));
  await page.getByRole('link', { name: /Open your daycare/ }).tap();
  await page.waitForURL(/\/daycare/);
  await page.waitForTimeout(800);
  await page.getByRole('link', { name: 'Back to PAWtastic Games home' }).tap();
  await page.waitForURL((u) => new URL(u).pathname === '/');
  check('daycare → back button returns to the hub', new URL(page.url()).pathname === '/');
  for (const p of ['/recess', '/graduation', '/shop', '/account', '/visit', '/help']) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    check(`${p} has a visible way back to the hub`, await page.getByRole('link', { name: 'Back to PAWtastic Games home' }).isVisible());
  }

  // Recess Rush: old challenge links still work; a real run pays capped coins
  await fresh({ v: 4, coins: 500, dogs: [], staff: [], recessDay: nyDay(), recessCoinsToday: 0, missionDay: nyDay() }, '/recess?seed=2026-10-31&challenge=420');
  check('existing challenge links still open the challenge', await page.getByText(/challenged you to beat 420/).isVisible());
  await page.getByRole('button', { name: /Start run/ }).tap();
  await page.waitForTimeout(2500);
  const t = await page.locator('text=/⏱ \\d+s/').innerText();
  check('the run starts and the timer counts down', /⏱ 5\ds/.test(t), t);
  await page.getByRole('button', { name: /^Run again|Share & challenge/ }).first().waitFor({ timeout: 75000 });
  let s = await read();
  check('finishing a run records it and pays at most 120 coins', s.stats.runs === 1 && s.coins - 500 <= 120 && s.recessCoinsToday === s.coins - 500, `coins ${s.coins}, today ${s.recessCoinsToday}`);
  // daily cap
  await fresh({ v: 4, coins: 500, dogs: [], staff: [], recessDay: nyDay(), recessCoinsToday: 300, missionDay: nyDay() }, '/recess');
  check('shows how many daily coins are left', await page.getByText(/\(0 left today\)/).isVisible());
  await page.getByRole('button', { name: /Start run/ }).tap();
  await page.getByRole('button', { name: /^Run again/ }).waitFor({ timeout: 75000 });
  s = await read();
  check('after the daily cap, runs pay 0 coins but still count', s.coins === 500 && s.stats.runs === 1);
  check('the player is told why', await page.getByText(/Daily coin limit reached/).first().isVisible());

  // Shop: locked with a reason; 3D preview is labelled and temporary
  await fresh(undefined, '/shop');
  check('paid packs show "Purchases coming soon" (no live charging)', (await page.getByRole('button', { name: /Purchases coming soon/ }).count()) === 2);
  check('the lock reason is visible', await page.getByText(/Locked: Payment provider not configured yet/).first().isVisible());
  await page.getByRole('link', { name: /Preview in my 3D daycare/ }).last().tap();
  await page.waitForURL(/preview=deluxe/);
  await page.waitForTimeout(1500);
  check('3D preview is clearly labelled as not owned', await page.getByText(/Previewing Deluxe Daycare Decor for 90 seconds — not owned, not saved/).isVisible());
  const owned = await page.evaluate(() => JSON.stringify(localStorage));
  check('preview stores no ownership on the device', !/deluxe-daycare-decor|entitle/i.test(owned));
  await page.getByRole('button', { name: 'End preview' }).tap();
  await page.waitForTimeout(400);
  check('ending the preview removes it', !(await page.getByText(/Previewing Deluxe/).isVisible()) && !page.url().includes('preview'));

  // Visit: verified booking links per location; clicks are only clicks
  await page.goto(BASE + '/visit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const hrefs = await page.locator('a', { hasText: 'Book free evaluation' }).evaluateAll((as) => as.map((a) => a.href));
  check('Hawthorne link opens its evaluation form', hrefs.some((h) => h.startsWith('https://pawtasticacademy.com/booking-page-ht?') && h.includes('utm_content=hawthorne')), hrefs[0]);
  check('Hillsdale link opens its evaluation form', hrefs.some((h) => h.startsWith('https://pawtasticacademy.com/booking-page?') && h.includes('utm_content=hillsdale')), hrefs[1]);
  await ctx.route('https://pawtasticacademy.com/**', (r) => r.fulfill({ status: 200, body: 'stub' }));
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('a', { hasText: 'Book free evaluation' }).nth(1).click()]);
  await popup.close();
  const ev = await page.evaluate(() => (window.__pawtasticEvents || []).filter((e) => e.name === 'booking_click'));
  check('a booking click is recorded with its location (as a click only)', ev.length === 1 && ev[0].props.location === 'hillsdale', JSON.stringify(ev));

  // Visit: directions per location and the PAWtastic customer app (plain links only)
  const dirs = await page.locator('a', { hasText: 'Directions' }).evaluateAll((as) => as.map((a) => a.href));
  check('each location has directions to its own address', dirs.length === 2 && dirs.some((h) => new URL(h).searchParams.get('query') === 'PAWtastic Academy, 100 Braen Ave, Hawthorne, NJ') && dirs.some((h) => new URL(h).searchParams.get('query') === 'PAWtastic Academy, 550 Piermont Ave, Hillsdale, NJ'), dirs.join(' | '));
  const app = page.getByRole('link', { name: /Open the PAWtastic app/ });
  check('the PAWtastic app link opens app.pawtasticacademy.com in a new tab', (await app.getAttribute('href')) === 'https://app.pawtasticacademy.com/' && (await app.getAttribute('target')) === '_blank');
  const ab = await app.boundingBox();
  check('the app and directions buttons are big enough to tap', ab && ab.height >= 44, JSON.stringify(ab));
  await ctx.route('https://app.pawtasticacademy.com/**', (r) => r.fulfill({ status: 200, body: 'stub' }));
  await ctx.route('https://www.google.com/**', (r) => r.fulfill({ status: 200, body: 'stub' }));
  const [p2] = await Promise.all([page.waitForEvent('popup'), app.click()]);
  await p2.close();
  const [p3] = await Promise.all([page.waitForEvent('popup'), page.locator('a', { hasText: 'Directions' }).first().click()]);
  await p3.close();
  const ev2 = await page.evaluate(() => (window.__pawtasticEvents || []).filter((e) => e.name === 'app_click' || e.name === 'directions_click').map((e) => e.name + ':' + (e.props.from || e.props.location)));
  check('app and directions clicks are measured (as clicks only)', ev2.includes('app_click:visit') && ev2.some((x) => x.startsWith('directions_click:')), JSON.stringify(ev2));
  // Both PAWtastic Academy logos load (not broken images)
  const loaded = (alt) => page.locator(`img[alt^="${alt}"]`).first().evaluate((im) => im.complete && im.naturalWidth > 0).catch(() => false);
  check('Visit shows the grad-cap logo (Hillsdale and Hawthorne, NJ)', await loaded('PAWtastic Academy, Hillsdale and Hawthorne'));
  // Home: Visit us · Book an eval · Get the app
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const visitCard = page.getByRole('region', { name: 'Visit the real PAWtastic' });
  check('home shows the sitting-dog logo', await loaded('PAWtastic Academy: daycare'));
  check('home offers Visit us, Book an eval and Get the app', (await visitCard.getByRole('link', { name: /Visit us/ }).isVisible()) && (await visitCard.getByRole('link', { name: /Book an eval/ }).isVisible()) && (await visitCard.getByRole('link', { name: /Get the app/ }).getAttribute('href')) === 'https://app.pawtasticacademy.com/');

  // Saves: old v1 save migrates; corrupted save is kept aside, not destroyed
  await fresh({ v: 1, coins: 777, dogs: [{ id: 'x', name: 'Oldie', breed: 2, happiness: 50, clean: 50 }], staff: [] }, '/daycare');
  s = await read();
  check('a v1 save loads with coins and pups kept (checked in, in the lobby)', s.coins === 777 && s.dogs[0].name === 'Oldie' && s.dogs[0].checkedIn === true && s.v === 4, `coins ${s.coins}`);
  await fresh('{"v":4,"coins":', '/daycare');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check('a corrupted save is set aside for recovery and a fresh game starts', keys.some((k) => k.startsWith(KEY + '-unreadable-')) && (await read()).coins >= 500);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(2); });
