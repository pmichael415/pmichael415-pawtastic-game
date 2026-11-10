// Competing end to end against tools/mock-pay-server.mjs (Chromium): home location, the Weekly Challenge,
// leaderboards, prizes and their redemption at the front desk, and the home-location adventure.
//   node tools/mock-pay-server.mjs dist 8862 &   then   node tools/e2e-compete.cjs http://127.0.0.1:8862

const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8862';
const GAME = `${base}/play/index.html`;
const results = [];
const check = (ok, label, extra = '') => { results.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
const state = async () => (await fetch(`${base}/mock/state`)).json();
const text = page => page.innerText('body');

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(600);
    const b = await page.$(['Collect', "Let's go", 'OK', 'Yay!', 'Play the game', 'Keep playing here'].map(n => `.sheet button:text-is("${n}")`).join(', '));
    if (!b) return;
    await b.click({ force: true });
  }
}
async function enroll(page, name, home) {
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', name);
  if (home) await page.click(`.home-choice:has-text("${home}")`);
  await page.click('text=Start school');
  await page.waitForTimeout(700);
  await closeSheets(page);
}
async function signIn(page, email) {
  await page.waitForSelector('#signin-email');
  await page.fill('#signin-email', email);
  await page.click('.sheet button:text-is("Email me a code")');
  await page.waitForSelector('#signin-code');
  await page.fill('#signin-code', '123456');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('.sheet button:text-is("Sign in")')]);
  await page.waitForTimeout(1500);
  await closeSheets(page);
}
// Plays the challenge through the board's own swap handler (debug mode exposes it).
async function playChallenge(page, { greedy = false } = {}) {
  await page.goto(`${GAME}?debug=1`, { waitUntil: 'networkidle' });
  await closeSheets(page);
  await page.click('.weekly-card button:has-text("Play")');
  await page.waitForFunction(() => !!window.__pawtasticChallenge);
  for (let i = 0; i < 25; i++) {
    await page.evaluate(async greedyMove => {
      const c = window.__pawtasticChallenge;
      const m = greedyMove ? c.validMove() : c.validMove();
      await c.swap(m.a, m.b);
    }, greedy);
  }
  await page.waitForSelector('.sheet .big-score', { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return page;
  };

  // 1. A new player picks Hawthorne while enrolling; the map shows the challenge and the local road.
  const a = await newPage();
  await enroll(a, 'Max', 'Hawthorne');
  check(await a.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1')).home) === 'hawthorne', 'setup: picking Hawthorne saves the home location');
  const mapText = await text(a);
  check(/Weekly Challenge/i.test(mapText) && /free day of daycare/i.test(mapText), 'map: Weekly Challenge card with the prizes', mapText.replace(/\n/g, ' | ').slice(0, 300));
  check(/Hawthorne Adventure/.test(mapText), 'map: switch to the Hawthorne Adventure');
  await a.click('.seg-btn:has-text("Hawthorne Adventure")');
  await a.waitForTimeout(500);
  check(/Opens after Orientation \(Level 8\)/.test(await text(a)) && /Hawthorne Walkabout/.test(await text(a)), 'local road: locked until Orientation is done');

  // 2. The challenge, before signing in: the score is kept and the player is asked to sign in.
  await playChallenge(a);
  const sheet = await a.innerText('.sheet');
  const score = Number((await a.$eval('.sheet .big-score', el => el.textContent)).replace(/\D/g, ''));
  check(score > 0 && /Run complete/.test(sheet) && /first run this week sets the mark/.test(sheet) && /Professor Paws' tip/.test(sheet), 'challenge: 25 moves give a score, the first run sets the mark, a tip follows', String(score));
  check(/Save your progress/.test(sheet), 'challenge: signed out, asks to sign in for the leaderboard');
  check((await a.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1')).weekly.best)) === score, 'challenge: best kept on this phone');
  await a.click('.sheet button:text-is("Sign in")');
  await signIn(a, 'max@example.com');
  const s1 = await state();
  check(s1.weekly.length === 1 && s1.weekly[0].score === score && s1.weekly[0].location === 'hawthorne', 'after sign-in the run is sent and replayed on the server', JSON.stringify(s1.weekly.map(w => w.score)));
  check(Object.values(s1.players)[0]?.dogName === 'Max', 'leaderboard profile saved (dog name and location)');

  // 3. A second player at Hillsdale, picking the home later from the map card.
  const b = await newPage();
  await enroll(b, 'Bella', null);
  check(/Which PAWtastic is yours\?/.test(await text(b)), 'map: players without a home are asked to pick one');
  await b.click('.home-card .home-choice:has-text("Hillsdale")');
  await b.waitForTimeout(600);
  await closeSheets(b);
  await b.click('button[aria-label="Sound and effects"]', { force: true });
  await b.waitForTimeout(300);
  await b.click('.sheet button:text-is("Save progress to the cloud")');
  await signIn(b, 'bella@example.com');
  await playChallenge(b);
  await b.waitForFunction(() => /#\d+ at Hillsdale/.test(document.querySelector('.sheet')?.innerText ?? ''), null, { timeout: 15000 }).catch(() => {});
  check(/#1 at Hillsdale/.test(await b.innerText('.sheet')), 'challenge: signed in, the result shows the rank at Hillsdale');
  // A made-up score is refused by the server.
  const token = await b.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-session-v1')).access_token);
  const fake = await fetch(`${base}/api/public/game/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ week: s1.weekly[0].week, moves: Array(25).fill([0, 0, 7, 7]) }) });
  check(fake.status === 400, 'server: a made-up run is refused');

  // 4. Leaderboards.
  await b.click('.sheet button:text-is("Leaderboard")');
  await b.waitForSelector('.lb-row');
  const board = await text(b);
  check(/Max/.test(board) && /Bella/.test(board) && /Team battle this week/i.test(board), 'weekly board: both players and the team battle');
  check(await b.$('.lb-row.me'), 'weekly board: your row is highlighted');
  await b.click('.seg-btn:text-is("Hawthorne")');
  await b.waitForTimeout(800);
  check(/Max/.test(await b.innerText('.lb-list')) && !/Bella/.test(await b.innerText('.lb-list')), 'location filter: Hawthorne only');
  await b.click('.seg-btn:text-is("All-time")');
  await b.waitForTimeout(800);
  await b.click('.seg-btn:text-is("Everyone")');
  await b.waitForTimeout(800);
  check(/All-time/.test(await text(b)) && (await b.$$('.lb-row')).length === 2, 'all-time board lists both players');

  // 4b. This week's prizes change only when the owner approves a lineup: a draft is never shown.
  const setLineup = (body) => fetch(`${base}/mock/week-prizes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const LINEUP = ['Two free days of daycare', 'Two free baths', 'A free bath'];
  const weeklyText = async () => { await a.goto(GAME, { waitUntil: 'networkidle' }); await closeSheets(a); await a.waitForTimeout(800); return a.innerText('.weekly-card').catch(() => ''); };
  await setLineup({ labels: LINEUP, approved: false });
  let card = await weeklyText();
  check(/Win a free day of daycare/.test(card) && !/Two free days/.test(card), 'a draft lineup isn\'t shown: the standard prizes are', card.replace(/\n/g, ' | '));
  await setLineup({ labels: LINEUP, approved: true });
  card = await weeklyText();
  check(/Win two free days of daycare/.test(card) && /1st two free days of daycare, 2nd two free baths, 3rd a free bath/.test(card), 'an approved lineup is shown on the map', card.replace(/\n/g, ' | '));
  await setLineup({ next: true, labels: ['A free night of boarding', 'Two free baths', 'A free bath'], approved: true });
  card = await weeklyText();
  check(/Next week: 1st a free night of boarding/.test(card), "next week's approved lineup is teased", card.replace(/\n/g, ' | '));

  // 5. The week ends: this week's approved prizes for #1 at each location, shown to the winner with a code.
  await fetch(`${base}/mock/award-week`, { method: 'POST' });
  const prize = (await state()).prizes.find(p => p.location === 'hawthorne');
  check(prize?.reward === 'custom' && prize.label === 'Two free days of daycare' && prize.rank === 1, "week end: #1 at Hawthorne wins this week's 1st prize", JSON.stringify(prize && { reward: prize.reward, label: prize.label }));
  await a.goto(GAME, { waitUntil: 'networkidle' });
  await a.waitForSelector('.sheet .prize-card', { timeout: 15000 }).catch(() => {});
  const won = await a.innerText('.sheet').catch(() => '');
  check(/placed in the Weekly Challenge/.test(won) && won.includes(prize.code) && /Two free days of daycare/.test(won), 'winner is told, with the prize and its code', won.replace(/\n/g, ' | ').slice(0, 160));
  // Growth (owner, 10 Nov 2026): a readable week, Copy code, a free-evaluation booking link for new clients, and no
  // long-press text selection on the prize card (the iPhone Copy/Look Up menu covered it).
  check(/week of [a-z]{3} \d{1,2}\b/i.test(won) && !/week of \d{4}-\d{2}-\d{2}/i.test(won), 'prize card: the week reads "Week of Mon D"', won.replace(/\n/g, ' | ').slice(0, 120));
  check(!!(await a.$('.sheet .prize-card button:has-text("Copy code")')), 'prize card: a Copy code button');
  const book = await a.$eval('.sheet .prize-card a[href*="booking-page"]', el => el.getAttribute('href')).catch(() => '');
  check(/^https:\/\/pawtasticacademy\.com\/booking-page-ht\?.*utm_campaign=free_evaluation.*utm_content=prize-hawthorne/.test(book), 'prize card: "Book your free evaluation" for Hawthorne, tagged', book);
  check(/Already a client\? Just show this code at the front desk/.test(won), 'prize card: existing clients just show the code');
  check(await a.$eval('.sheet .prize-card', el => getComputedStyle(el).userSelect === 'none' || getComputedStyle(el).webkitUserSelect === 'none').catch(() => false), 'prize card: no long-press text selection');
  await closeSheets(a);

  // 6. The front desk redeems it, and can hide a player.
  const desk = await newPage();
  await desk.goto(`${base}/staff/index.html`, { waitUntil: 'networkidle' });
  await desk.fill('#email', 'info@pawtasticacademy.com');
  await desk.click('button:text-is("Email me a sign-in code")');
  await desk.fill('#code', '123456');
  await desk.click('button:text-is("Sign in")');
  await desk.waitForTimeout(900);
  check(/Weekly Challenge prizes/.test(await text(desk)) && (await text(desk)).includes(prize.code), 'staff: prize list shows the winner and code');
  await desk.fill('#lookup', prize.code.toLowerCase());
  await desk.click('button:text-is("Look up")');
  await desk.waitForTimeout(700);
  check(/Two free days of daycare for Max/.test(await text(desk)), 'staff: looking up the code shows the prize in its own words');
  await desk.click('button:text-is("Mark redeemed")');
  await desk.waitForTimeout(700);
  check((await state()).prizes.find(p => p.id === prize.id).status === 'redeemed' && /Redeemed/.test(await text(desk)), 'staff: prize marked redeemed');
  await desk.reload({ waitUntil: 'networkidle' });
  await desk.waitForTimeout(800);
  await desk.click('section:has-text("This week\'s leaderboard") li:has-text("Bella") button:text-is("Hide")');
  await desk.waitForTimeout(800);
  const lb = await (await fetch(`${base}/api/public/game/leaderboard?board=weekly&location=all`)).json();
  check(!lb.entries.some(e => e.dogName === 'Bella'), 'staff: a hidden player leaves the leaderboard');

  // 7. The home-location adventure opens after Orientation.
  await a.evaluate(() => {
    // A signed-in player's save lives under per-account keys (Lovable's owner-save hook: <key>:<mode>:<user id>).
    const uid = JSON.parse(localStorage.getItem('pawtastic-gd-session-v1') || 'null')?.user_id;
    const key = k => (uid ? `${k}:test:${uid}` : k);
    const w = JSON.parse(localStorage.getItem(key('pawtastic-gd-wallet-v1')));
    for (let i = 1; i <= 8; i++) w.progress.levels[i] = { stars: 2, score: 15000 };
    w.progress.unlocked = 9;
    localStorage.setItem(key('pawtastic-gd-wallet-v1'), JSON.stringify(w));
    localStorage.setItem(key('pawtastic-gd-saved-at-v1'), JSON.stringify({ at: Date.now() + 60000, provisional: false }));
  });
  await a.goto(GAME, { waitUntil: 'networkidle' });
  await a.click('body');
  await a.waitForSelector('.map-nav', { timeout: 10000 });
  await closeSheets(a);
  await a.click('.seg-btn:has-text("Hawthorne Adventure")', { timeout: 8000 });
  await a.waitForTimeout(600);
  await closeSheets(a);
  await a.click('.node.current', { force: true, timeout: 8000 });
  await a.waitForTimeout(1200);
  const title = await a.innerText('.level-title').catch(() => '');
  check(/Hawthorne Walkabout/i.test(title) && /Level 1\b/.test(title), 'local road: Level 1 of the Hawthorne Walkabout plays', title.replace(/\n/g, ' | '));

  check(errors.length === 0, 'no page errors', errors.join(' / '));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
