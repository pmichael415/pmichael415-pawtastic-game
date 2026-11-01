// Lays the overview screenshots out on one sheet: qa/out/overview/PAWtastic-Games-overview.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = path.resolve('qa/out/overview');
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
const font = (w) => 'data:font/woff2;base64,' + fs.readFileSync(path.resolve(`src/assets/fonts/dm-sans-${w}.woff2`)).toString('base64');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.resolve('src/assets/pawtastic-logo.png')).toString('base64');
const shots = [
  ['01-pick-team.png', '1 · Pick your team', 'New players choose Team Hawthorne or Team Hillsdale, or "Not sure yet".'],
  ['02-home.png', '2 · Home', 'All three games, your team, invites, and visit / book / get the app.'],
  ['03-daycare-overhead.png', '3 · Daycare: overhead 3D', 'Check pups in and place them by size and temperament.'],
  ['04-daycare-walk.png', '4 · Daycare: walk mode', 'Walk the floor in first person with the touch stick.'],
  ['05-recess-rush.png', '5 · Recess Rush', '60-second runner. Earns capped daycare coins.'],
  ['06-graduation.png', '6 · Graduation Day', 'The match-3 game inside the hub (free play).'],
  ['07-shop.png', '7 · Shop', 'Free bandanas earned across all three games. Paid packs below stay locked until payments are set up.'],
  ['08-share.png', '8 · Share', 'Invite friends or recommend PAWtastic.'],
  ['09-visit.png', '9 · Visit', 'Visit us, book a free evaluation, or open the PAWtastic app.'],
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'DM Sans';font-weight:400;src:url(${font(400)})}@font-face{font-family:'DM Sans';font-weight:700;src:url(${font(700)})}
  body{margin:0;background:#FAF8F5;font-family:'DM Sans',system-ui,sans-serif;color:#312721}
  .wrap{padding:48px 56px 40px}
  header{display:flex;align-items:center;gap:20px;margin-bottom:8px}
  header img{width:84px;height:84px;border-radius:18px;background:#0068D6}
  h1{margin:0;font-size:46px;letter-spacing:-.5px}
  .eyebrow{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#70645C;margin:0}
  .sub{margin:4px 0 32px;font-size:20px;color:#70645C}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px 36px}
  figure{margin:0;display:flex;flex-direction:column;align-items:center}
  .phone{width:330px;padding:10px;border-radius:44px;background:#312721;box-shadow:0 10px 30px rgba(49,39,33,.18)}
  .phone img{display:block;width:100%;border-radius:34px}
  figcaption{width:340px;margin-top:14px;text-align:center}
  figcaption b{display:block;font-size:22px;color:#312721}
  figcaption span{display:block;font-size:17px;color:#70645C;margin-top:4px;line-height:1.3}
  footer{margin-top:36px;font-size:16px;color:#70645C;text-align:center}
</style></head><body><div class="wrap">
  <header><img src="${logo}" alt=""><div><p class="eyebrow">PAWtastic Academy</p><h1>PAWtastic Games: how it looks</h1></div></header>
  <p class="sub">Real screenshots of the combined app at iPhone size, taken 1 Nov 2026 from the code waiting to go into the Daycare Tycoon project in Lovable. Daycare layouts are fictional, not floor plans.</p>
  <div class="grid">${shots.map(([f, t, d]) => `<figure><div class="phone"><img src="${img(f)}"></div><figcaption><b>${t}</b><span>${d}</span></figcaption></figure>`).join('')}</div>
  <footer>Team totals and friend counts appear once the game server is connected; this preview isn't connected, so it shows "not available" instead of made-up numbers.</footer>
</div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1250, height: 1000 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(DIR, 'PAWtastic-Games-overview.png'), fullPage: true });
  await browser.close();
  console.log('wrote', path.join(DIR, 'PAWtastic-Games-overview.png'));
})();
