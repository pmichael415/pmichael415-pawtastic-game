// In-game purchases end to end on an iPhone 13 profile, against DEVELOPMENT-ONLY stand-ins: qa/mock-stripe.cjs for
// Stripe, qa/stubs for the database (a local Postgres with every migration, so the real SQL runs) and an in-memory
// sign-in service. The page runs on https://hub.test (APP_ORIGIN must be https), routed to the stub dev server.
//   PAWTASTIC_E2E_STUB=1 STRIPE_API_BASE=http://127.0.0.1:8899 STRIPE_SECRET_KEY=sk_live_mock PAYMENT_WEBHOOK_SECRET=whsec_mock \
//     APP_ORIGIN=https://hub.test STRIPE_EXPECTED_ACCOUNT=acct_1Mock000000 npx vite dev --host 127.0.0.1 --port 5174
//   node qa/mock-stripe.cjs
//   node qa/e2e-purchases.cjs https://hub.test
const { chromium, devices } = require("playwright");
const fs = require("fs");
const BASE = (process.argv[2] || "https://hub.test").replace(/\/+$/, "");
const DEV = process.env.HUB_DEV || "http://127.0.0.1:5174";
const MOCK = process.env.MOCK_STRIPE || "http://127.0.0.1:8899";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const SB = env.VITE_SUPABASE_URL.replace(/\/+$/, "");
const NEXT = "pawtastic-daycare-next-v1", HUB = "pawtastic-tycoon-save-v1";
let pass = 0, fail = 0;
const out = [];
const check = (n, ok, d = "") => { ok ? pass++ : fail++; out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); console.log(out.at(-1)); };
fs.mkdirSync("qa/out", { recursive: true });

// ---------- sign-in stand-in (same requests and answers as the real service) ----------
const UID = require("crypto").randomUUID(); // a new account each run, so earlier runs' purchases never count
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const userOf = () => ({ id: UID, aud: "authenticated", role: "authenticated", email: "phil@example.com", email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" });
const tokens = new Set();
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: "phil@example.com", role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: "s" + Math.random() })}.sig`;
  tokens.add(access);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r" + Math.random(), user: userOf() };
}
const saves = new Map();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
async function auth(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  const signed = tokens.has((req.headers()["authorization"] || "").replace(/^Bearer /i, ""));
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password")
    return body.password === "correct-horse-1" ? json(200, session()) : json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  if (url.pathname === "/auth/v1/user") return signed ? json(200, userOf()) : json(401, { code: 401, msg: "invalid JWT" });
  if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
  if (url.pathname === "/rest/v1/game_saves") return json(200, signed ? [...saves.entries()].map(([game, v]) => ({ game, ...v })) : []);
  if (url.pathname === "/rest/v1/rpc/save_game_progress") {
    if (!signed) return json(401, { code: "42501", message: "permission denied" });
    const row = saves.get(body._game), now = new Date().toISOString();
    if ((row?.revision ?? 0) !== body._expected_revision) return json(400, { code: "P0409", message: "save conflict" });
    saves.set(body._game, { data: body._data, revision: (row?.revision ?? 0) + 1, updated_at: now });
    return json(200, (row?.revision ?? 0) + 1);
  }
  if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
  return json(404, { msg: "not in stand-in" });
}

// ---------- https://hub.test → the stub dev server ----------
const HOP = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "expect", "content-length"]);
async function proxy(route) {
  const req = route.request();
  const u = new URL(req.url());
  const headers = {};
  // Like a reverse proxy: the server sees its own address as the page's origin (its cross-site guard compares them).
  for (const [k, v] of Object.entries(await req.allHeaders())) if (!k.startsWith(":") && !HOP.has(k)) headers[k] = k === "origin" || k === "referer" ? v.split(BASE).join(DEV) : v;
  let res;
  try {
    res = await fetch(DEV + u.pathname + u.search, { method: req.method(), headers, body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined, redirect: "manual" });
  } catch (e) {
    return route.abort("connectionrefused");
  }
  const h = {};
  res.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) h[k] = v.split(DEV).join(BASE); });
  return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) });
}

const sql = async (q, params = []) => {
  const r = await fetch(DEV + "/__stub/sql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: q, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.rows;
};

let last = null; // the page in use, for a screenshot if something throws
const calls = []; // recent server-function answers, printed if something throws
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function phone() {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
    await ctx.route(SB + "/**", auth);
    await ctx.route(BASE + "/**", proxy);
    await ctx.addInitScript(() => {
      sessionStorage.setItem("pawtastic-team-dismissed", "1");
      if (!localStorage.getItem("pawtastic-settings-v1")) localStorage.setItem("pawtastic-settings-v1", JSON.stringify({ view: "list", seenWalkHelp: true }));
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", async (r) => {
      if (!r.url().includes("/_serverFn/")) return;
      const t = await r.text().catch(() => "");
      calls.push(`${r.request().method()} ${r.status()} ${t.slice(0, 400)}`);
      if (calls.length > 12) calls.shift();
    });
    last = page;
    return page;
  }
  const local = (page, k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), k);
  const seen = async (page, re, ms = 15000) => { try { await page.getByText(re).first().waitFor({ timeout: ms }); return true; } catch { return false; } };
  async function signIn(page) {
    await page.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continue with Google" }).waitFor({ timeout: 60000 }); // a cold dev server compiles first
    await page.getByLabel("Email").fill("phil@example.com");
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign in", exact: true }).tap();
    await page.locator("header").getByText("Signed in · cloud saves on").waitFor({ timeout: 15000 });
  }
  async function openNext(page, url = BASE + "/daycare-next") {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Daycare Shop" }).waitFor({ timeout: 30000 });
  }
  const coins = async (page) => (await local(page, NEXT))?.coins;
  /** Taps until a sheet opens: server-rendered buttons show before the page has started and can miss a first tap. */
  async function openSheet(page, button) {
    for (let i = 0; i < 6; i++) {
      await button.tap();
      if (await page.getByRole("dialog").first().waitFor({ timeout: 3000 }).then(() => true, () => false)) return;
    }
    throw new Error("the sheet didn't open");
  }
  /** Buy from an open buy sheet; returns the session id the stand-in made. */
  async function payOn(page, price, how = "Pay") {
    last = page;
    await page.getByRole("dialog").getByRole("button", { name: `Buy ${price}` }).tap();
    await page.waitForURL(/127\.0\.0\.1:8899\/pay\//, { timeout: 15000 });
    const id = page.url().split("/pay/")[1];
    await page.getByRole("button", { name: how, exact: true }).tap();
    await page.waitForURL((u) => u.href.startsWith(BASE), { timeout: 20000 });
    return id;
  }

  // Warm-up: a freshly started dev server optimises its dependencies on the first browser visit and reloads once.
  {
    const w = await phone();
    for (const p of ["/", "/account", "/daycare-next", "/recess", "/daycare", "/shop"]) {
      await w.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
      await w.waitForTimeout(2500);
    }
    await w.context().close();
  }

  // ---------- the new Daycare: coins ----------
  const A = await phone();
  await signIn(A);
  await openNext(A);
  await A.waitForTimeout(1500);
  const c0 = await coins(A);
  await A.getByRole("button", { name: "Daycare Shop" }).tap();
  await A.getByRole("button", { name: "8,000 Coins, $2.99" }).tap();
  check("the buy sheet says it's real money", await seen(A, "Real money — charged by Stripe to your card.", 5000));
  await A.screenshot({ path: "qa/out/purchases-1-buy-sheet.png" });
  const s1 = await payOn(A, "$2.99");
  check("after paying, the player is back in the new Daycare", new URL(A.url()).pathname === "/daycare-next", A.url());
  check("…'+8,000 coins added'", await seen(A, "+8,000 coins added"));
  await A.screenshot({ path: "qa/out/purchases-2-coins-added.png" });
  const c1 = await coins(A);
  check("…the counter went up by exactly 8,000", c1 === c0 + 8000, `${c0} → ${c1}`);
  const d1 = await sql("SELECT status, reserved_by FROM public.deliveries WHERE source = 'purchase' AND source_ref = $1", [s1]);
  const installA = await A.evaluate(() => localStorage.getItem("pawtastic-install-v1"));
  check("…the server shows it delivered to this phone only", d1.length === 1 && d1[0].status === "delivered" && d1[0].reserved_by === installA, JSON.stringify(d1));

  await openNext(A);
  await A.waitForTimeout(4000);
  check("reloading changes nothing", (await coins(A)) === c1, `${await coins(A)}`);

  const B = await phone();
  await signIn(B);
  await openNext(B);
  await B.waitForTimeout(4000);
  const bSave = await local(B, NEXT);
  check("a second installation on the same account gets nothing", bSave?.coins === c0 && !(bSave?.deliveries?.applied || []).length, `${bSave?.coins}`);

  await A.getByRole("button", { name: "Daycare Shop" }).tap();
  await A.getByRole("button", { name: "2,500 Coins, $0.99" }).tap();
  await payOn(A, "$0.99", "Back");
  check("backing out shows the cancel message", await seen(A, "Checkout cancelled — nothing was charged."));
  await A.waitForTimeout(1500);
  check("…and nothing changes", (await coins(A)) === c1, `${await coins(A)}`);

  // ---------- the Shop tab, straight after backing out of the same pack in the game ----------
  await A.goto(BASE + "/shop", { waitUntil: "domcontentloaded" });
  const pack = A.getByRole("article").filter({ has: A.getByRole("heading", { name: "2,500 Coins" }) });
  await pack.getByRole("button", { name: "Buy $0.99" }).waitFor({ timeout: 20000 });
  await openSheet(A, pack.getByRole("button", { name: "Buy $0.99" }));
  const before = await coins(A);
  await payOn(A, "$0.99");
  check("buying in the Shop tab returns to /shop", new URL(A.url()).pathname === "/shop", A.url());
  check("…which says the purchase is on its way", await seen(A, "Payment received — your purchase is on its way", 25000));
  await openNext(A);
  check("…and the new Daycare collects it on its next open", await seen(A, "+2,500 coins added"));
  await A.waitForTimeout(500);
  check("…+2,500 in the counter", (await coins(A)) === before + 2500, `${before} → ${await coins(A)}`);

  const c2 = await coins(A);
  const refund = await (await fetch(MOCK + "/mock/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: s1 }) })).json();
  check("the hub accepts the refund notice", refund.status === 200, JSON.stringify(refund));
  await openNext(A);
  await A.waitForTimeout(5000);
  check("after a refund, the next open takes the 8,000 coins back", (await coins(A)) === c2 - 8000, `${c2} → ${await coins(A)}`);
  const d2 = await sql("SELECT status FROM public.deliveries WHERE source = 'reversal' AND user_id = $1", [UID]);
  check("…as one reversal, delivered once", d2.length === 1 && d2[0].status === "delivered", JSON.stringify(d2));

  // ---------- Stripe confirms after the player is back (review finding), and the same pack twice in a row ----------
  await openNext(A);
  const c3 = await coins(A);
  await openSheet(A, A.getByRole("button", { name: "Daycare Shop" }));
  await A.getByRole("button", { name: "20,000 Coins, $5.99" }).tap();
  await payOn(A, "$5.99", "Pay (Stripe confirms late)");
  check("a late confirmation: the game keeps checking and says '+20,000 coins added'", await seen(A, "+20,000 coins added", 25000));
  await A.waitForTimeout(500);
  check("…+20,000 in the counter", (await coins(A)) === c3 + 20000, `${c3} → ${await coins(A)}`);
  await openSheet(A, A.getByRole("button", { name: "Daycare Shop" }));
  await A.getByRole("button", { name: "Deluxe Daycare Decor, $6.99" }).tap();
  await payOn(A, "$6.99", "Pay (Stripe confirms late)");
  check("a look confirmed late: 'Deluxe Daycare Decor unlocked'", await seen(A, "Deluxe Daycare Decor unlocked", 25000));
  await openSheet(A, A.getByRole("button", { name: "Daycare Shop" }));
  check("…and the Daycare Shop shows it Owned without a reload", await A.getByRole("region", { name: "Items & themes" }).getByText("Owned").waitFor({ timeout: 8000 }).then(() => true, () => false));
  await A.keyboard.press("Escape");
  const c4 = await coins(A);
  for (let i = 0; i < 2; i++) {
    await openSheet(A, A.getByRole("button", { name: "Daycare Shop" }));
    await A.getByRole("button", { name: "2,500 Coins, $0.99" }).tap();
    await payOn(A, "$0.99");
    await seen(A, "+2,500 coins added");
    await A.waitForTimeout(800);
  }
  check("the same pack bought twice in a row is two purchases: +5,000", (await coins(A)) === c4 + 5000, `${c4} → ${await coins(A)}`);

  // ---------- Recess Rush: power-ups and runner looks ----------
  await A.goto(BASE + "/recess", { waitUntil: "domcontentloaded" });
  await A.getByRole("button", { name: "Get more power-ups" }).waitFor({ timeout: 20000 });
  await openSheet(A, A.getByRole("button", { name: "Get more power-ups" }));
  await payOn(A, "$2.99");
  check("after a Power Pack, the player is back in Recess Rush", new URL(A.url()).pathname === "/recess", A.url());
  check("…'+10 Shield Starts and +10 Extra Lives added'", await seen(A, "+10 Shield Starts and +10 Extra Lives added"));
  check("…the start screen shows 10 of each", (await seen(A, "Shield Start · 10 left", 5000)) && (await seen(A, "Extra Life · 10 left", 5000)));
  await A.getByRole("switch", { name: "Use a Shield Start this run" }).tap();
  await A.getByRole("switch", { name: "Use an Extra Life this run" }).tap();
  await A.screenshot({ path: "qa/out/purchases-3-power-ups.png" });
  await A.getByRole("button", { name: "Start run" }).tap();
  await A.waitForTimeout(300);
  const hud = await A.locator("main").getByText(/❤️/).first().textContent();
  check("a run with both starts with 4 lives and a shield", (hud.match(/❤️/g) || []).length === 4 && hud.includes("🔵"), hud);
  const pw = (await local(A, HUB))?.recessPowerups;
  check("…and uses one of each (9 and 9 left)", pw?.shield === 9 && pw?.life === 9, JSON.stringify(pw));
  await A.getByRole("button", { name: "Pause" }).tap();

  await A.goto(BASE + "/recess", { waitUntil: "domcontentloaded" });
  await A.getByRole("button", { name: "Runner Looks Pack, $1.99" }).waitFor({ timeout: 20000 });
  await openSheet(A, A.getByRole("button", { name: "Runner Looks Pack, $1.99" }));
  await payOn(A, "$1.99");
  check("Runner Looks: 'Runner Looks Pack unlocked'", await seen(A, "Runner Looks Pack unlocked"));
  const equip = A.getByRole("button", { name: "Equip Rainbow Trail" });
  check("…with Equip buttons on the start screen", await equip.isVisible().catch(() => false) || (await equip.waitFor({ timeout: 8000 }).then(() => true, () => false)));
  await equip.tap();
  check("…Equip puts it on", await A.getByRole("button", { name: "Unequip Rainbow Trail" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await A.screenshot({ path: "qa/out/purchases-4-runner-looks.png" });

  // ---------- Today's Daycare: Blue Ribbon from Pup style ----------
  await A.goto(BASE + "/daycare", { waitUntil: "domcontentloaded" });
  await A.getByRole("button", { name: "Pup style" }).waitFor({ timeout: 20000 });
  await openSheet(A, A.getByRole("button", { name: "Pup style" }));
  await A.getByRole("button", { name: "Buy the Blue Ribbon Style Pack, $2.99" }).tap();
  await payOn(A, "$2.99");
  check("Blue Ribbon: back in today's Daycare, 'Blue Ribbon Style Pack unlocked'", new URL(A.url()).pathname === "/daycare" && (await seen(A, "Blue Ribbon Style Pack unlocked")), A.url());
  await openSheet(A, A.getByRole("button", { name: "Pup style" }));
  const putOn = A.getByRole("button", { name: /^Put on / }).first();
  check("…Pup style now offers Put on", await putOn.waitFor({ timeout: 8000 }).then(() => true, () => false));
  await putOn.tap();
  check("…and Put on wears it", await A.getByRole("button", { name: /^Take off / }).first().waitFor({ timeout: 5000 }).then(() => true, () => false));
  await A.screenshot({ path: "qa/out/purchases-5-pup-style.png" });

  // ---------- a guest ----------
  const G = await phone();
  await openNext(G);
  await G.getByRole("button", { name: "Daycare Shop" }).tap();
  await G.getByRole("button", { name: "8,000 Coins, $2.99" }).tap();
  check("a guest is asked to sign in to buy", await G.getByRole("link", { name: "Sign in to buy" }).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await G.screenshot({ path: "qa/out/purchases-6-guest.png" });

  const bad = errors.filter((e) => !/ResizeObserver|WebSocket|vite/i.test(e));
  check("no page errors", !bad.length, bad.slice(0, 3).join(" | "));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  if (last) {
    await last.screenshot({ path: "qa/out/purchases-fail.png" }).catch(() => {});
    console.error("dialogs:", await last.getByRole("dialog").allInnerTexts().catch(() => []));
    console.error("server answers:\n" + calls.join("\n"));
  }
  console.log(out.join("\n"));
  process.exit(1);
});
