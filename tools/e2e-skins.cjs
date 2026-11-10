// Season skins at phone size (owner, 10 Nov 2026): buy a Season 1 skin with Treats in the Shop, it's worn right away
// (map dog, Closet), the dog's picture is published for the hub, and taking it off brings the costume back.
//   node tools/e2e-skins.cjs http://127.0.0.1:PORT [shots dir]   (mock server; MOCK_NOW inside Season 1)
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const [base, shots] = process.argv.slice(2);
const GAME = `${base}/play/index.html`;
const NOW = process.env.MOCK_NOW;
let pass = 0, fail = 0;
const check = (ok, n, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };
async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    const b = await page.$('.sheet button:text-is("Collect"), .sheet button:text-is("Let\'s go"), .sheet button:text-is("OK"), .sheet button:text-is("Yay!"), .sheet button:text-is("Play the game"), .sheet button:text-is("Not now")');
    if (!b) return; await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
  }
}
const wallet = page => page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1') ?? 'null'));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  if (NOW) await ctx.clock.setSystemTime(new Date(NOW));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME, { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', 'Biscuit');
  await page.click('.home-choice:has-text("Hawthorne")').catch(() => {});
  await page.click('text=Start school');
  await page.waitForTimeout(800); await closeSheets(page);
  // A player with Treats to spend (free Treats from gifts and levels).
  await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('pawtastic-gd-wallet-v1')); w.treats.free = 250; w.inventory.costumes = ['bandana']; w.inventory.equipped = 'bandana'; localStorage.setItem('pawtastic-gd-wallet-v1', JSON.stringify(w)); });
  await page.reload({ waitUntil: 'networkidle' }); await closeSheets(page);

  await page.click('button:has-text("Shop")', { force: true }); await page.waitForTimeout(600);
  const shop = await page.innerText('body');
  check(/Season 1 skins/.test(shop) && /Sold during Season 1, until Sat 5 Dec\. Yours to keep\./.test(shop), 'Shop: Season 1 skins section, factual wording');
  check((await page.$$('.skin-item')).length === 3, 'Shop: three skins');
  check(!/last chance|hurry|don.t miss|only \d+ (days|hours) left/i.test(shop), 'Shop: no pressure wording');
  if (shots) await page.screenshot({ path: `${shots}/skins-01-shop.png` });
  await page.click('.skin-item[data-skin="s1-varsity-star"]');
  await page.click('.sheet button:text-is("Confirm")');
  await page.waitForTimeout(800);
  let w = await wallet(page);
  check(w.inventory.skins.includes('s1-varsity-star') && w.inventory.skin === 's1-varsity-star' && w.treats.free === 130, 'bought with 120 Treats and worn right away', JSON.stringify({ skins: w.inventory.skins, skin: w.inventory.skin, free: w.treats.free }));
  check(await page.$('.skin-item.owned[data-skin="s1-varsity-star"]') !== null, 'Shop: shows Owned');

  await page.click('.topbar button[aria-label="Back"], button:has-text("Back")').catch(() => {});
  await page.goto(GAME, { waitUntil: 'networkidle' }); await closeSheets(page);
  await page.waitForSelector('.map-dog', { timeout: 8000 }).catch(() => {});
  const mapDog = await page.evaluate(() => { const d = document.querySelector('.map-dog'); return d ? { skin: !!d.querySelector('[data-skin="s1-varsity-star"]'), html: d.innerHTML.slice(0, 80) } : null; });
  check(mapDog?.skin === true, 'map: the dog wears the skin', JSON.stringify(mapDog));
  const pup = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-my-pup-v1') ?? 'null'));
  check(pup?.v === 1 && pup.name === 'Biscuit' && pup.skin === 's1-varsity-star' && /data-skin="s1-varsity-star"/.test(pup.svg ?? ''), 'the dog\'s picture is published for the hub', JSON.stringify({ name: pup?.name, skin: pup?.skin, len: pup?.svg?.length }));
  if (shots) await page.screenshot({ path: `${shots}/skins-02-map.png` });

  await page.click('button:has-text("Closet")', { force: true }).catch(() => {}); await page.waitForTimeout(600);
  const closet = await page.innerText('body');
  check(/Your skins/.test(closet) && /Biscuit is in the Varsity Star skin/.test(closet), 'Closet: skin shelf and preview');
  if (shots) await page.screenshot({ path: `${shots}/skins-03-closet.png` });
  // Review fixes: while a skin is worn, "Take it off" takes the skin off (the costume comes back) ...
  await page.click('.closet-preview button:text-is("Take it off")'); await page.waitForTimeout(600);
  w = await wallet(page);
  let pup2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-my-pup-v1') ?? 'null'));
  check(w.inventory.skin === null && w.inventory.equipped === 'bandana' && pup2?.skin === null && /data-costume="bandana"/.test(pup2?.svg ?? ''), '"Take it off" takes the skin off; the costume is back, picture updated', JSON.stringify({ skin: w.inventory.skin, equipped: w.inventory.equipped, pup: pup2?.skin }));
  // ... and choosing a costume while a skin is worn takes the skin off.
  if ((await wallet(page)).inventory.skin !== 's1-varsity-star') { await page.click('.skin-item[data-skin="s1-varsity-star"]'); await page.waitForTimeout(600); }
  const pre = (await wallet(page)).inventory.skin;
  await page.click('section[aria-label="Your costumes"] .shop-item:has-text("Bandana")'); await page.waitForTimeout(600);
  w = await wallet(page);
  pup2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pawtastic-my-pup-v1') ?? 'null'));
  check(pre === 's1-varsity-star' && w.inventory.skin === null && w.inventory.equipped === 'bandana' && pup2?.skin === null, 'choosing a costume takes the skin off', JSON.stringify({ pre, skin: w.inventory.skin, equipped: w.inventory.equipped }));
  check(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 200));
  console.log(`${pass}/${pass + fail} passed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
