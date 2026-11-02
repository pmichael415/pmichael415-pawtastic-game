// DEVELOPMENT-ONLY stand-in for the few Stripe requests the hub makes, for qa/e2e-purchases.cjs and the dry run of
// qa/stripe-test/harness.mjs. No real money and no real Stripe: the hub dev server is pointed here with
// STRIPE_API_BASE (honoured only when PAWTASTIC_E2E_STUB=1 under `vite dev`, see src/lib/payments/verify.ts stripeApi()).
//   node qa/mock-stripe.cjs            (port 8899; hub webhook at http://127.0.0.1:5174)
// Settings (environment): MOCK_STRIPE_PORT, HUB_DEV (the hub to notify, or "none" to only record events),
// STRIPE_SECRET_KEY (the key it accepts), PAYMENT_WEBHOOK_SECRET, STRIPE_EXPECTED_ACCOUNT, MOCK_LIVEMODE ("0" = test).
// Routes:
//   GET  /v1/account                    → the confirmed account id (acct_1Mock000000)
//   POST /v1/checkout/sessions          → a session (cs_live_mock_<run>_<n>, or cs_test_… in test mode); the same
//                                         Idempotency-Key reuses it, and refuses (400 idempotency_error) if the
//                                         parameters differ, as Stripe does
//   GET  /v1/events?type=&created[gte]= → the events made so far, newest first
//   POST /v1/refunds payment_intent=    → a full refund: a charge.refunded event
//   GET  /pay/<id>                      → a pay page with Pay and Back
//   POST /pay/<id>/pay                  → checkout.session.completed (signed, to the hub webhook), then on to success_url
//   POST /pay/<id>/back                 → checkout.session.expired (signed, to the hub webhook), then on to cancel_url
//   POST /mock/refund {session}         → as /v1/refunds, for a session id; answers with the hub's reply
//   GET  /mock/sessions                 → every session made, for checks
const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.MOCK_STRIPE_PORT || 8899);
const HUB = process.env.HUB_DEV || "http://127.0.0.1:5174";
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "whsec_mock";
const KEY = process.env.STRIPE_SECRET_KEY || "sk_live_mock";
const ACCOUNT = process.env.STRIPE_EXPECTED_ACCOUNT || "acct_1Mock000000";
const LIVE = process.env.MOCK_LIVEMODE !== "0";

const sessions = new Map(); // id → session
const byIdem = new Map(); // idempotency key → id
const events = []; // every event made, oldest first
let n = 0;
const RUN = crypto.randomBytes(4).toString("hex"); // session ids stay unique across restarts of this stand-in

const send = (res, status, body, headers = {}) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json", ...headers });
  res.end(text);
};
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const authed = (req) => (req.headers["authorization"] || "") === `Bearer ${KEY}`;
const refused = (res) => send(res, 401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });

/** Form fields → nested object for the parts the hub sends (metadata[...], line_items[0][...]). */
function parseForm(raw) {
  const f = Object.fromEntries(new URLSearchParams(raw));
  const metadata = {};
  for (const [k, v] of Object.entries(f)) { const m = /^metadata\[(\w+)\]$/.exec(k); if (m) metadata[m[1]] = v; }
  const qty = Number(f["line_items[0][quantity]"] || 1);
  return {
    mode: f.mode,
    success_url: f.success_url,
    cancel_url: f.cancel_url,
    client_reference_id: f.client_reference_id,
    metadata,
    currency: f["line_items[0][price_data][currency]"],
    amount_total: Number(f["line_items[0][price_data][unit_amount]"]) * qty,
    name: f["line_items[0][price_data][product_data][name]"],
  };
}

/** Records an event and, unless HUB_DEV=none, sends it signed to the hub's webhook. */
async function postEvent(type, object) {
  const evt = { id: `evt_mock_${crypto.randomUUID().replace(/-/g, "")}`, object: "event", type, livemode: LIVE, created: Math.floor(Date.now() / 1000), data: { object } };
  events.push(evt);
  if (HUB === "none") return { status: 200, body: "{}", eventId: evt.id };
  const body = JSON.stringify(evt);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  const res = await fetch(`${HUB}/api/public/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` }, body });
  return { status: res.status, body: await res.text(), eventId: evt.id };
}

const sessionObject = (s, extra = {}) => ({
  id: s.id, object: "checkout.session", livemode: LIVE, mode: s.mode, metadata: s.metadata, client_reference_id: s.client_reference_id,
  amount_total: s.amount_total, currency: s.currency, payment_status: "unpaid", payment_intent: null, ...extra,
});

async function refund(s) {
  const r = await postEvent("charge.refunded", {
    id: `ch_mock_${s.id.slice(-6)}`, object: "charge", livemode: LIVE, payment_intent: s.payment_intent,
    amount: s.amount_total, amount_refunded: s.amount_total, refunded: true, currency: s.currency, metadata: s.metadata,
  });
  s.state = "refunded";
  return r;
}

// Back to the hub by a page navigation (like Stripe's hosted page), not an HTTP redirect: the browser checks route
// https://hub.test to the dev server, and a browser follows redirects without consulting those routes.
const backTo = (res, url) => send(res, 200, `<!doctype html><title>Returning…</title><a href="${url}">Return</a><script>location.replace(${JSON.stringify(url)})</script>`);
const payPage = (s) => `<!doctype html><meta name="viewport" content="width=device-width"><title>Stripe stand-in</title>
<body style="font-family:sans-serif;padding:16px"><h1>Stripe stand-in (no real money)</h1>
<p>${s.name} · $${(s.amount_total / 100).toFixed(2)}</p>
<form method="post" action="/pay/${s.id}/pay"><button style="min-height:44px;width:100%">Pay</button></form>
<form method="post" action="/pay/${s.id}/back" style="margin-top:12px"><button style="min-height:44px;width:100%">Back</button></form>
</body>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/v1/account" && req.method === "GET") {
      if (!authed(req)) return refused(res);
      return send(res, 200, { id: ACCOUNT, object: "account" });
    }
    if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
      if (!authed(req)) return refused(res);
      const idem = req.headers["idempotency-key"];
      const raw = await readBody(req);
      if (idem && byIdem.has(idem)) {
        // Like Stripe: the same key returns the same session, but only for the same parameters.
        const prev = sessions.get(byIdem.get(idem));
        if (prev.raw !== raw) return send(res, 400, { error: { type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters they were first used with." } });
        return send(res, 200, sessionObject(prev, { url: `http://127.0.0.1:${PORT}/pay/${prev.id}` }));
      }
      const s = { id: `cs_${LIVE ? "live" : "test"}_mock_${RUN}_${++n}`, ...parseForm(raw), raw, state: "open" };
      sessions.set(s.id, s);
      if (idem) byIdem.set(idem, s.id);
      return send(res, 200, sessionObject(s, { url: `http://127.0.0.1:${PORT}/pay/${s.id}` }));
    }
    if (url.pathname === "/v1/events" && req.method === "GET") {
      if (!authed(req)) return refused(res);
      const type = url.searchParams.get("type");
      const since = Number(url.searchParams.get("created[gte]") || 0);
      const data = events.filter((e) => (!type || e.type === type) && e.created >= since).reverse();
      return send(res, 200, { object: "list", data, has_more: false });
    }
    if (url.pathname === "/v1/refunds" && req.method === "POST") {
      if (!authed(req)) return refused(res);
      const pi = new URLSearchParams(await readBody(req)).get("payment_intent");
      const s = [...sessions.values()].find((x) => x.payment_intent && x.payment_intent === pi);
      if (!s) return send(res, 400, { error: { type: "invalid_request_error", message: "No such payment_intent" } });
      await refund(s);
      return send(res, 200, { id: `re_mock_${s.id.slice(-6)}`, object: "refund", status: "succeeded", payment_intent: pi, amount: s.amount_total });
    }
    const pay = /^\/pay\/([\w]+)(?:\/(pay|back))?$/.exec(url.pathname);
    if (pay) {
      const s = sessions.get(pay[1]);
      if (!s) return send(res, 404, "<p>No such session</p>");
      if (!pay[2]) return send(res, 200, payPage(s));
      if (pay[2] === "pay") {
        s.payment_intent = `pi_mock_${s.id.slice(-6)}_${n}`;
        const r = await postEvent("checkout.session.completed", sessionObject(s, { payment_status: "paid", payment_intent: s.payment_intent, status: "complete" }));
        s.state = "paid";
        s.webhook = r;
        if (r.status !== 200) return send(res, 502, `<p>Hub webhook answered ${r.status}: ${r.body}</p>`);
        return backTo(res, s.success_url);
      }
      const r = await postEvent("checkout.session.expired", sessionObject(s, { status: "expired" }));
      s.state = "expired";
      s.webhook = r;
      return backTo(res, s.cancel_url);
    }
    if (url.pathname === "/mock/refund" && req.method === "POST") {
      const { session } = JSON.parse((await readBody(req)) || "{}");
      const s = sessions.get(session);
      if (!s || !s.payment_intent) return send(res, 404, { error: "no paid session" });
      return send(res, 200, await refund(s));
    }
    if (url.pathname === "/mock/sessions") return send(res, 200, [...sessions.values()]);
    return send(res, 404, { error: "not in stand-in" });
  } catch (e) {
    return send(res, 500, { error: String(e && e.message) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`mock Stripe (${LIVE ? "live" : "test"} mode) on http://127.0.0.1:${PORT} → hub ${HUB}`));
