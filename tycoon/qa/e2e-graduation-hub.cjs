// Graduation Day's Weekly Challenge, leaderboard, sign-in and Shop inside the hub (Chromium, phone size).
// Graduation Day's server is played by tools/mock-pay-server.mjs (repo root), twice:
//   patched   — MOCK_HUB_ORIGINS=http://127.0.0.1:5173: what docs/graduation-hub/ makes the real server do;
//   unpatched — today's real server: the hub's address can't use it, so the hub copy must stay free play.
// Requests the game makes to https://pawtastic-graduation.lovable.app are routed to the mock; nothing reaches
// the real site.
//   (repo root) MOCK_HUB_ORIGINS=http://127.0.0.1:5173 node tools/mock-pay-server.mjs <dir> 8791 &
//   (repo root) node tools/mock-pay-server.mjs <dir> 8792 &
//   (tycoon) npm run dev &   then   node qa/e2e-graduation-hub.cjs http://127.0.0.1:5173 8791 8792
// Start both mock servers fresh for each run: they keep accounts and purchases in memory.
const { chromium } = require("playwright");

const HUB = process.argv[2] || "http://127.0.0.1:5173";
const PATCHED = `http://127.0.0.1:${process.argv[3] || 8791}`;
const UNPATCHED = `http://127.0.0.1:${process.argv[4] || 8792}`;
const SITE = "https://pawtastic-graduation.lovable.app";
const results = [];
const check = (ok, label, extra = "") => {
  results.push({ ok: !!ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};
const game = (page) => page.frame({ url: /\/graduation\/index\.html/ });
async function gameFrame(page, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = game(page);
    if (f && (await f.$("body").catch(() => null))) return f;
    await page.waitForTimeout(200);
  }
  throw new Error("no game frame");
}
const serverOn = (f, timeout = 12000) =>
  f
    .waitForFunction(() => document.documentElement.classList.contains("server-on"), null, {
      timeout,
    })
    .then(
      () => true,
      () => false,
    );

async function closeSheets(f) {
  for (let i = 0; i < 8; i++) {
    await f.waitForTimeout(600);
    const b = await f.$(
      ["Collect", "Let's go", "OK", "Yay!", "Play the game", "Keep playing here"]
        .map((n) => `.sheet button:text-is("${n}")`)
        .join(", "),
    );
    if (!b) return;
    await b.click({ force: true });
  }
}
async function signIn(page, f, email) {
  await f.waitForSelector("#signin-email");
  await f.fill("#signin-email", email);
  await f.click('.sheet button:text-is("Email me a code")');
  await f.waitForSelector("#signin-code");
  await f.fill("#signin-code", "123456");
  await f.click('.sheet button:text-is("Sign in")');
  await page.waitForTimeout(2500); // the game reloads its frame once signed in
  const g = await gameFrame(page);
  await g.waitForLoadState("networkidle").catch(() => {});
  await serverOn(g);
  await closeSheets(g);
  return g;
}
async function toast(f, re, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await f.$eval(".toast", (el) => el.innerText).catch(() => "");
    if (re.test(t)) return true;
    await f.waitForTimeout(250);
  }
  return false;
}
const mockState = (server) => fetch(`${server}/mock/state`).then((r) => r.json());

// Playwright adds a permissive Access-Control-Allow-Origin to any routed answer that has none, which would hide
// exactly what is being tested. So: answers from the patched mock must carry the hub's address themselves
// (recorded in `seen`), and the unpatched server's answers are marked as allowed for Graduation Day's own site
// only — to the browser that is the same refusal as today's real server, which sends no such header.
async function contextFor(browser, server, seen, { unpatched = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(`${SITE}/**`, async (route) => {
    const req = route.request();
    const response = await route.fetch({ url: req.url().replace(SITE, server) });
    const allowed = response.headers()["access-control-allow-origin"] || "-";
    seen.push(`${req.method()} ${new URL(req.url()).pathname} ${allowed}`);
    if (unpatched)
      await route.fulfill({
        response,
        headers: { ...response.headers(), "access-control-allow-origin": SITE },
      });
    else await route.fulfill({ response });
  });
  return ctx;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // 1. Today's Graduation Day server (no hub permission): the hub copy stays free play, nothing breaks.
  {
    const seen = [];
    const page = await (await contextFor(browser, UNPATCHED, seen, { unpatched: true })).newPage();
    page.on("pageerror", (e) => errors.push(`unpatched: ${e.message}`));
    await page.goto(`${HUB}/graduation`, { waitUntil: "networkidle" });
    const f = await gameFrame(page);
    check(
      !(await serverOn(f, 9000)),
      "unpatched server: the game can't use it from the hub (stays free play)",
    );
    check(
      seen.some((s) => /\/config /.test(s)),
      "unpatched server: the game did ask Graduation Day's server",
      seen.join(", "),
    );
    check(
      !(await f.isVisible(".weekly-card").catch(() => false)),
      "unpatched server: no Weekly Challenge card inside the game",
    );
    check(
      await page.isVisible('a:has-text("Weekly Challenge for real prizes")'),
      "unpatched server: the hub still links to Graduation Day's site",
    );
    check(
      /Free play here/.test(await page.innerText("main")),
      "unpatched server: the hub says free play",
    );
    await page.context().close();
  }

  // 2. With docs/graduation-hub/ applied.
  const seen = [];
  const ctx = await contextFor(browser, PATCHED, seen);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${HUB}/graduation`, { waitUntil: "networkidle" });
  let f = await gameFrame(page);
  check(await serverOn(f), "patched server: the game reaches Graduation Day's server from the hub");
  await page.waitForTimeout(800);
  check(
    !(await page.isVisible('a:has-text("Weekly Challenge for real prizes")')),
    "the hub's 'on its own site' link is gone",
  );
  check(
    /use Graduation Day's own sign-in/.test(await page.innerText("main")),
    "the hub says the Shop and Weekly Challenge use Graduation Day's own sign-in",
  );

  await f.fill("input[type=text]", "Biscuit");
  await f.click('.home-choice:has-text("Hawthorne")');
  await f.click("text=Start school");
  await closeSheets(f);
  check(await f.isVisible(".weekly-card"), "Weekly Challenge card shows inside the game");

  // Weekly Challenge: 25 moves, then sign in so the run is replayed on the server.
  await f.goto(`${f.url().split(/[?#]/)[0]}?debug=1`, { waitUntil: "networkidle" });
  await serverOn(f);
  await closeSheets(f);
  await f.click('.weekly-card button:has-text("Play")');
  await f.waitForFunction(() => !!window.__pawtasticChallenge);
  for (let i = 0; i < 25; i++)
    await f.evaluate(async () => {
      const c = window.__pawtasticChallenge;
      const m = c.validMove();
      await c.swap(m.a, m.b);
    });
  await f.waitForSelector(".sheet .big-score", { timeout: 15000 });
  const score = Number(
    (await f.$eval(".sheet .big-score", (el) => el.textContent)).replace(/\D/g, ""),
  );
  check(
    score > 0 && /Save your progress/.test(await f.innerText(".sheet")),
    "challenge played; asks to sign in for the leaderboard",
    String(score),
  );
  await f.click('.sheet button:text-is("Sign in")');
  f = await signIn(page, f, "hubplayer@example.com");
  const s1 = await mockState(PATCHED);
  check(
    s1.weekly.length === 1 && s1.weekly[0].score === score && s1.weekly[0].location === "hawthorne",
    "signed in inside the hub: run replayed on Graduation Day's server",
    JSON.stringify(s1.weekly.map((w) => w.score)),
  );
  check(
    s1.codesSent.some(
      (c) => c.email === "hubplayer@example.com" && c.redirectTo === `${HUB}/graduation`,
    ),
    "the sign-in email link comes back to the hub's Graduation page",
    JSON.stringify(s1.codesSent.map((c) => c.redirectTo)),
  );

  // Leaderboard.
  await f.click('.weekly-card button:has-text("Leaderboard")');
  await f.waitForTimeout(1500);
  const board = await f.innerText("body");
  check(
    /Biscuit/.test(board) && board.includes(score.toLocaleString("en-US")),
    "leaderboard shows the hub player and score",
  );
  await f.goto(`${f.url().split(/[?#]/)[0]}`, { waitUntil: "networkidle" });
  await serverOn(f);
  await closeSheets(f);

  // Shop: Stripe takes the whole tab, then brings the buyer back to the hub.
  await f.click('button:has-text("Shop")', { force: true });
  await f.waitForTimeout(600);
  check(
    /Secure checkout by Stripe/.test(await f.innerText("body")),
    "Shop inside the hub offers Stripe checkout",
  );
  await f.click('button.shop-item:has-text("100 Treats")', { force: true });
  await f.click('.sheet button:text-is("Continue to checkout")');
  await page.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 10000 });
  check(
    /\/mock-stripe\/checkout\//.test(page.url()),
    "checkout opens in the whole tab (not inside the frame)",
    page.url(),
  );
  const item = await page.innerText("#item");
  check(/100 Treats — \$4\.99/.test(item), "Stripe page shows 100 Treats $4.99", item);
  await Promise.all([page.waitForURL(/\/graduation/, { timeout: 15000 }), page.click("#pay")]);
  check(
    page.url().startsWith(`${HUB}/graduation`),
    "after paying, the buyer is back on the hub's Graduation page",
    page.url(),
  );
  f = await gameFrame(page);
  check(await toast(f, /Thanks! 100 Treats added/), "toast: Thanks! 100 Treats added");
  await page.waitForTimeout(500);
  check(!/checkout=|session_id=/.test(page.url()), "hub address cleaned", page.url());
  const w = await page.evaluate(() => JSON.parse(localStorage.getItem("pawtastic-gd-wallet-v1")));
  check(
    w.treats.paid === 100 && w.purchases.applied.length === 1,
    "wallet: 100 paid Treats, applied once",
    JSON.stringify(w.treats),
  );
  await page.reload({ waitUntil: "networkidle" });
  f = await gameFrame(page);
  await serverOn(f);
  await page.waitForTimeout(2500);
  const w2 = await page.evaluate(() => JSON.parse(localStorage.getItem("pawtastic-gd-wallet-v1")));
  check(w2.treats.paid === 100, "reload: still exactly 100 paid Treats");

  // Cancelled checkout comes back to the hub too.
  await f.click('button:has-text("Shop")', { force: true });
  await f.waitForTimeout(600);
  await f.click('button.shop-item:has-text("55 Treats")', { force: true });
  await f.click('.sheet button:text-is("Continue to checkout")');
  await page.waitForURL(/\/mock-stripe\/checkout\//, { timeout: 10000 });
  await Promise.all([page.waitForURL(/\/graduation/, { timeout: 15000 }), page.click("#back")]);
  f = await gameFrame(page);
  await serverOn(f);
  await page.waitForTimeout(1500);
  const w3 = await page.evaluate(() => JSON.parse(localStorage.getItem("pawtastic-gd-wallet-v1")));
  check(
    page.url().startsWith(`${HUB}/graduation`) && w3.treats.paid === 100,
    "cancelled checkout: back on the hub, nothing added",
    page.url(),
  );
  await ctx.close();

  // 3. The email sign-in link, opened on the hub's Graduation page.
  {
    const link = await fetch(`${PATCHED}/mock/magic-link?email=linkplayer@example.com`).then((r) =>
      r.json(),
    );
    const hash = link.url.slice(link.url.indexOf("#"));
    const c2 = await contextFor(browser, PATCHED, []);
    const p2 = await c2.newPage();
    p2.on("pageerror", (e) => errors.push(`link: ${e.message}`));
    await p2.goto(`${HUB}/graduation${hash}`, { waitUntil: "networkidle" });
    const g = await gameFrame(p2);
    await serverOn(g);
    await p2.waitForTimeout(1500);
    const session = await p2.evaluate(() => localStorage.getItem("pawtastic-gd-session-v1"));
    check(
      !!session && /access_token/.test(session),
      "email link: signed in to Graduation Day inside the hub",
    );
    check(
      !/access_token/.test(p2.url()) && !/access_token/.test(g.url()),
      "email link: the session is taken off both addresses",
      `${p2.url()} | ${g.url()}`,
    );
    await c2.close();
  }

  const api = seen.filter((s) => s.includes("/api/public/game/"));
  check(
    api.length > 10 && api.every((s) => s.endsWith(` ${HUB}`)),
    "every game API answer carried the hub's permission itself",
    api.filter((s) => !s.endsWith(` ${HUB}`)).join(", ") || `${api.length} answers`,
  );
  console.log(
    `      (permission checks seen by the route: ${seen.filter((s) => s.startsWith("OPTIONS")).length})`,
  );

  // 4. A different site can't use the hub's permission (the mock refuses it like the patched server would).
  {
    const pre = await fetch(`${PATCHED}/api/public/game/checkout`, {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.invalid", "Access-Control-Request-Method": "POST" },
    });
    check(!pre.headers.get("access-control-allow-origin"), "another site gets no permission");
  }

  check(errors.length === 0, "no page errors", errors.join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
