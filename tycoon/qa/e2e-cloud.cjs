// Per-game cloud saves, end to end on an iPhone 13 profile, against an in-memory stand-in for the sign-in service
// and the game_saves table (same requests and answers as the real one). Real Google sign-in isn't covered here.
//   node qa/e2e-cloud.cjs [base]
const { chromium, devices } = require("playwright");
const fs = require("fs");
const BASE = process.argv[2] || "http://127.0.0.1:5173";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const SB = env.VITE_SUPABASE_URL.replace(/\/+$/, "");
const KEY = "pawtastic-tycoon-save-v1", GKEY = "pawtastic-gd-wallet-v1";
let pass = 0, fail = 0;
const out = [];
const check = (n, ok, d = "") => { ok ? pass++ : fail++; out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };

// ---------- the stand-in server ----------
const users = { "phil@example.com": { id: "11111111-1111-1111-1111-111111111111", password: "correct-horse-1" } };
const tokens = new Map(); // access token → user id
const saves = new Map(); // `${uid}:${game}` → { data, revision, updated_at }
const recoverCalls = [];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const userOf = (id, email) => ({ id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" });
function session(email) {
  const u = users[email];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: "s" + Math.random() })}.sig`;
  tokens.set(access, u.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r" + Math.random(), user: userOf(u.id, email) };
}
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  const uid = tokens.get((req.headers()["authorization"] || "").replace(/^Bearer /i, ""));
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const u = users[body.email];
    if (!u || u.password !== body.password) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return json(200, session(body.email));
  }
  if (url.pathname === "/auth/v1/user") return uid ? json(200, userOf(uid, "phil@example.com")) : json(401, { code: 401, msg: "invalid JWT" });
  if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
  if (url.pathname === "/auth/v1/recover") { recoverCalls.push(body.email); return json(200, {}); }
  if (url.pathname === "/rest/v1/game_saves") {
    if (!uid) return json(200, []);
    return json(200, [...saves.entries()].filter(([k]) => k.startsWith(uid + ":")).map(([k, v]) => ({ game: k.split(":")[1], ...v })));
  }
  if (url.pathname === "/rest/v1/rpc/save_game_progress") {
    if (!uid) return json(401, { code: "42501", message: "permission denied" });
    const k = `${uid}:${body._game}`, row = saves.get(k), now = new Date().toISOString();
    const conflict = () => json(400, { code: "P0409", details: null, hint: null, message: "save conflict" });
    if (body._expected_revision === 0) { if (row) return conflict(); saves.set(k, { data: body._data, revision: 1, updated_at: now }); return json(200, 1); }
    if (!row || row.revision !== body._expected_revision) return conflict();
    saves.set(k, { data: body._data, revision: row.revision + 1, updated_at: now });
    return json(200, row.revision + 1);
  }
  if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
  return json(404, { msg: "not in stand-in" });
}

// ---------- phones ----------
const nyDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const st = (admitted) => ({ admitted, baths: 3, plays: 9, earned: 900, checkouts: 8, cleans: 1, boarders: 0, shares: 0, runs: 2, scuffles: 0 });
const tycoon = (coins, admitted, best) => ({ v: 4, coins, dogs: [], staff: [{ id: "s0", name: "Phil", energy: 100 }], tutorial: -1, stats: st(admitted), missionBase: st(admitted), missionDay: nyDay(), gameDay: 4, upgrades: ["boarding"], recessBest: best, recessDay: nyDay(), recessCoinsToday: 40 });
const levels = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 2, score: 500 }]));
const wallet = (n) => ({ version: 1, dog: { name: "Nugget", breed: "lab", coat: "#c68642" }, progress: { unlocked: n + 1, levels: levels(n), badges: [] } });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function phone(storage = {}) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    await ctx.route(SB + "/**", handle);
    await ctx.addInitScript(() => sessionStorage.setItem("pawtastic-team-dismissed", "1"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/help");
    await page.evaluate((s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem("pawtastic-settings-v1", JSON.stringify({ view: "list", seenWalkHelp: true })); }, storage);
    return page;
  }
  const local = (page, k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), k);
  const toastText = async (page, re, ms = 10000) => { try { await page.getByText(re).first().waitFor({ timeout: ms }); return true; } catch { return false; } };
  async function signIn(page, password = "correct-horse-1") {
    if (!page.url().includes("/account")) await page.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill("phil@example.com");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).tap();
  }
  const card = (page, name) => page.getByRole("article", { name: `${name} cloud save` });

  // A: a phone with progress in all three games signs in → each game is saved to the account
  const A = await phone({ [KEY]: JSON.stringify(tycoon(1840, 30, 420)), [GKEY]: JSON.stringify(wallet(8)) });
  await A.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
  await A.getByRole("button", { name: "Continue with Google" }).waitFor({ timeout: 15000 });
  check("the sign-in screen offers Google, email and 'Forgot password?'", (await A.getByRole("button", { name: "Continue with Google" }).isVisible()) && (await A.getByRole("button", { name: "Forgot password?" }).isVisible()));
  await signIn(A, "wrong-password");
  check("a wrong password gets a plain-language message", await toastText(A, /email and password don't match/));
  await A.getByLabel("Password").fill("correct-horse-1");
  await A.getByRole("button", { name: "Sign in", exact: true }).tap();
  check("signing in saves each game's progress to the account", await toastText(A, /Saved to your account: Daycare Tycoon, Recess Rush, Graduation Day/));
  const uid = users["phil@example.com"].id;
  const row = (g) => saves.get(`${uid}:${g}`);
  check("…three separate cloud saves", row("daycare")?.data.coins === 1840 && row("recess")?.data.best === 420 && Object.keys(row("graduation")?.data.progress.levels || {}).length === 8,
    JSON.stringify({ d: row("daycare")?.data.coins, r: row("recess")?.data, g: !!row("graduation") }));
  check("Recess Rush's best score isn't stored in the Daycare save", row("daycare")?.data.recessBest === 0);
  await A.waitForTimeout(800);
  check("each game shows it's saving to the account", (await card(A, "Daycare Tycoon").getByText("✓ Saving").isVisible()) && (await card(A, "Graduation Day").getByText("✓ Saving").isVisible()));
  check("the header says cloud saves are on", await A.locator("header").getByText("Signed in · cloud saves on").isVisible());

  // B: a brand-new phone signs in → every game loads by itself
  const B = await phone({});
  await B.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await B.waitForTimeout(1200);
  await B.getByRole("region", { name: "Cloud saves" }).scrollIntoViewIfNeeded(); await B.screenshot({ path: "qa/out/cloud-1-home-guest.png" });
  check("a guest sees 'Save your progress' on the home page", await B.getByRole("region", { name: "Cloud saves" }).getByText("Save your progress").isVisible());
  check("…and the header says progress isn't backed up", await B.locator("header").getByText("Guest · not backed up").isVisible());
  await B.getByRole("region", { name: "Cloud saves" }).getByRole("link", { name: "Sign in" }).tap();
  await B.waitForURL(/\/account/);
  await B.getByRole("button", { name: "Continue with Google" }).waitFor({ timeout: 15000 }); await B.screenshot({ path: "qa/out/cloud-2-sign-in.png" });
  await signIn(B);
  check("a new phone loads every game from the account", await toastText(B, /Loaded from your account: Daycare Tycoon, Recess Rush, Graduation Day/));
  const bt = await local(B, KEY), bg = await local(B, GKEY);
  check("…the daycare, Recess Rush best and Graduation Day levels are all back", bt?.coins === 1840 && bt?.recessBest === 420 && Object.keys(bg?.progress?.levels || {}).length === 8, JSON.stringify({ coins: bt?.coins, best: bt?.recessBest }));
  await B.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await B.waitForTimeout(1200);
  check("the home page shows the loaded progress", (await B.getByText("8/40").isVisible()) && (await B.getByText(/Day 4/).first().isVisible()));

  // C: a phone with different daycare progress → only Daycare asks; the others load
  const C = await phone({ [KEY]: JSON.stringify(tycoon(300, 12, 0)) });
  await signIn(C);
  check("only the game with progress in both places asks", await toastText(C, /Choose which progress to keep for Daycare Tycoon/));
  await C.waitForTimeout(800);
  check("…Daycare shows the choice; Recess Rush and Graduation Day loaded", (await card(C, "Daycare Tycoon").getByText("Choose", { exact: true }).isVisible()) && (await card(C, "Recess Rush").getByText("✓ Saving").isVisible()) && (await card(C, "Graduation Day").getByText("✓ Saving").isVisible()));
  check("…nothing was overwritten while asking", (await local(C, KEY)).coins === 300 && row("daycare").data.coins === 1840);
  await card(C, "Daycare Tycoon").scrollIntoViewIfNeeded(); await C.screenshot({ path: "qa/out/cloud-3-choose.png" });
  const keepBtn = card(C, "Daycare Tycoon").getByRole("button", { name: /Load my account's progress/ });
  const kb = await keepBtn.boundingBox();
  check("the choice buttons are big enough to tap", kb && kb.height >= 44, JSON.stringify(kb));
  await keepBtn.tap();
  await C.waitForTimeout(1500); await C.evaluate(() => scrollTo(0, 0)); await C.screenshot({ path: "qa/out/cloud-4-saved.png" });
  check("choosing the account's progress loads it", await toastText(C, /Daycare Tycoon: cloud progress loaded/));
  check("…on this phone", (await local(C, KEY)).coins === 1840);

  // Automatic saving and a stale phone: B saves newer daycare progress; A (stale) is paused instead of overwriting
  await B.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.coins = 2500; s.stats.admitted = 31; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await B.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
  await B.waitForTimeout(800);
  await B.getByRole("button", { name: "Save now" }).tap();
  await B.waitForTimeout(1200);
  check("'Save now' saves newer progress (new revision)", row("daycare").revision === 2 && row("daycare").data.coins === 2500, `rev ${row("daycare").revision}`);
  await A.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.coins = 1900; s.stats.admitted = 32; s.recessBest = 600; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await A.getByRole("button", { name: "Save now" }).tap();
  await A.waitForTimeout(1500);
  check("a stale phone is paused for Daycare instead of overwriting newer progress", row("daycare").data.coins === 2500 && (await card(A, "Daycare Tycoon").getByText("Choose", { exact: true }).isVisible()));
  check("…while its Recess Rush still saves", row("recess").data.best === 600, JSON.stringify(row("recess").data));

  // Forgot password and sign out
  const D = await phone({});
  await D.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
  await D.getByRole("button", { name: "Forgot password?" }).tap();
  await D.getByLabel("Email").fill("phil@example.com");
  await D.getByRole("button", { name: /Email me a reset link/ }).tap();
  check("'Forgot password?' sends a reset link", (await toastText(D, /we've sent a link to choose a new password/)) && recoverCalls.includes("phil@example.com"));
  await B.getByRole("button", { name: "Sign out" }).tap();
  await B.waitForTimeout(800);
  check("signing out keeps the progress on the phone and goes back to guest", (await B.locator("header").getByText("Guest · not backed up").isVisible()) && (await local(B, KEY)).coins === 2500);

  const W = await phone({});
  await W.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
  check("no sideways scrolling on the account page", (await W.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(out.join("\n")); console.error(e); process.exit(2); });
