// Reproduces the reported "can't check in dogs" problem on an iPhone-sized touch screen.
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dog = (id, name, extra = {}) => ({ id, name, breed: 1, size: 'small', temper: 'gentle', site: 'hawthorne', place: { kind: 'lobby' }, checkedIn: false, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false, x: 0.5, y: 0.5, ...extra });
const save = (clockMin, dogs) => ({ v: 4, coins: 500, dogs, staff: [{ id: 's0', name: 'Phil', energy: 100 }], cleanliness: 100, upgrades: [], decor: [], tutorial: 0, stats: { admitted: 0, baths: 0, plays: 0, earned: 0, checkouts: 0, cleans: 0, boarders: 0, shares: 0, runs: 0 }, achievements: [], missionDay: day, missionBase: { admitted: 0, baths: 0, plays: 0, earned: 0, checkouts: 0, cleans: 0, boarders: 0, shares: 0, runs: 0 }, missionsClaimed: [], recessBest: 0, cosmetics: [], equipped: null, lastSeen: Date.now(), seq: 10, site: 'hawthorne', clockMin, gameDay: 1, reputation: 80, scuffles: [] });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.evaluate((s) => localStorage.setItem('pawtastic-tycoon-save-v1', JSON.stringify(s)), save(9 * 60, [dog('d1', 'Biscuit'), dog('d2', 'Luna', { breed: 4 })]));
  await page.reload();
  await page.waitForSelector('text=Lobby');
  await page.screenshot({ path: 'qa/out/repro-1-initial.png' });
  const vh = page.viewportSize().height;
  // 1) Is any "Check in" control visible without scrolling?
  const checkInVisible = await page.locator('button:has-text("Check in")').count();
  console.log('Check-in buttons in DOM before selecting a dog:', checkInVisible);
  // 2) Tap the waiting dog, as the tutorial says
  const chip = page.getByRole('button', { name: /^Biscuit,/ });
  await chip.tap();
  await page.waitForTimeout(300);
  const btn = page.locator('button:has-text("Check in")').first();
  const box = await btn.boundingBox();
  console.log('After tapping Biscuit: Check in button box =', box, 'viewport height =', vh, '=> visible without scrolling:', !!box && box.y >= 0 && box.y + box.height <= vh);
  await page.screenshot({ path: 'qa/out/repro-2-after-tap.png' });
  // 3a) Are dog buttons being destroyed and recreated while you look at them?
  const replaced = await page.evaluate(() => new Promise((res) => {
    const find = () => [...document.querySelectorAll('button')].find((b) => /^Luna,/.test(b.getAttribute('aria-label') || ''));
    const first = find(); let swaps = 0; let cur = first;
    const iv = setInterval(() => { const now = find(); if (now && now !== cur) { swaps++; cur = now; } }, 20);
    setTimeout(() => { clearInterval(iv); res(swaps); }, 5000);
  }));
  console.log('Times the Luna button element was replaced in 5 s:', replaced);
  // 3b) Realistic finger taps (~120-280 ms) while the clock ticks: how many register?
  const cdp = await ctx.newCDPSession(page);
  let ok = 0, tried = 0; const N = 30;
  for (let i = 0; i < N; i++) {
    const loc = page.getByRole('button', { name: /^Luna,/ });
    const b = await loc.boundingBox().catch(() => null);
    if (!b) { await page.waitForTimeout(100); continue; }
    tried++;
    const before = await loc.getAttribute('aria-pressed');
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(120 + Math.random() * 160);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
    const after = await loc.getAttribute('aria-pressed');
    if (after !== before) ok++;
  }
  console.log(`Realistic finger taps that toggled selection: ${ok}/${tried}`);
  // 4) Lobby at 11:58 with a waiting dog: what happens at noon?
  await page.goto(URL + 'visit');
  await page.evaluate((s) => localStorage.setItem('pawtastic-tycoon-save-v1', JSON.stringify(s)), save(11 * 60 + 58, [dog('d3', 'Milo')]));
  await page.goto(URL);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /^Milo,/ }).tap();
  await page.waitForTimeout(300);
  console.log('At/after noon the check-in button says:', await page.locator('section[aria-label^="Care for"] button').first().innerText());
  // 5) Switching apps (tab hidden) pauses the game; where is Resume?
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  const resume = await page.getByRole('button', { name: 'Resume' }).last().boundingBox();
  console.log('After returning to the app: Resume button box =', resume, '=> on screen at top of page:', !!resume && resume.y + resume.height <= vh);
  const lobbyTapTarget = await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => /^Milo,/.test(b.getAttribute('aria-label') || '')); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top === el || el.contains(top) ? 'dog chip receives taps' : 'tap blocked by: ' + (top?.className || top?.tagName); });
  console.log('Lobby dog while paused:', lobbyTapTarget);
  await page.screenshot({ path: 'qa/out/repro-3-paused.png' });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
