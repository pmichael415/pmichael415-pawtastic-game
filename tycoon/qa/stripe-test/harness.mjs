#!/usr/bin/env node
// The real Stripe TEST-MODE harness for in-game purchases (spec: "Testing"). One purchase goes through Stripe's own
// test infrastructure — a real test Checkout Session paid on Stripe's hosted page with the 4242 test card, Stripe's
// own events, a real test refund — and through the hub's own webhook code, against a local throwaway database.
// It never touches production: test-mode keys only, the games account only, and no hub database.
//
//   node qa/stripe-test/harness.mjs             real Stripe test mode. Needs STRIPE_TEST_SECRET_KEY (sk_test_… or
//                                               rk_test_…) and network access to api.stripe.com, checkout.stripe.com,
//                                               js.stripe.com and m.stripe.network. Otherwise prints SKIPPED, exit 0.
//   node qa/stripe-test/harness.mjs --dry-run   the same steps against qa/mock-stripe.cjs (no network, no key).
//
// STRIPE_TEST_EXPECTED_ACCOUNT (default acct_1UWfxx58XGeAL8Pr, Pawtastic Academy II LLC's games account): the key
// must belong to it, or the harness refuses to run. The key itself is never printed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dry = process.argv.includes("--dry-run");
const EXPECTED = process.env.STRIPE_TEST_EXPECTED_ACCOUNT || "acct_1UWfxx58XGeAL8Pr";
const skip = (why) => {
  console.log(`SKIPPED: STRIPE_TEST_SECRET_KEY or network not available (${why}). Nothing was tested against Stripe.`);
  process.exit(0);
};
const refuse = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

let base, key, account, mock = null;
if (dry) {
  base = "http://127.0.0.1:8898";
  key = "sk_test_mock";
  account = "acct_1Mock000000";
  mock = spawn(process.execPath, ["qa/mock-stripe.cjs"], {
    cwd: ROOT,
    env: { ...process.env, MOCK_STRIPE_PORT: "8898", HUB_DEV: "none", STRIPE_SECRET_KEY: key, MOCK_LIVEMODE: "0", STRIPE_EXPECTED_ACCOUNT: account },
    stdio: "ignore",
  });
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    up = await fetch(`${base}/v1/account`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) refuse("the Stripe stand-in didn't start");
  console.log("DRY RUN against qa/mock-stripe.cjs (no real Stripe).");
} else {
  key = process.env.STRIPE_TEST_SECRET_KEY || "";
  if (!key) skip("STRIPE_TEST_SECRET_KEY is not set");
  if (!/^(sk|rk)_test_/.test(key)) refuse("STRIPE_TEST_SECRET_KEY must be a TEST-mode key (sk_test_… or rk_test_…)");
  base = "https://api.stripe.com";
  let res;
  try {
    res = await fetch(`${base}/v1/account`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  } catch {
    skip("api.stripe.com can't be reached from here");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) refuse(`Stripe refused the test key (${res.status} ${body?.error?.type ?? ""}); it needs read access to the account`);
  account = body?.id;
  if (account !== EXPECTED) refuse(`the test key belongs to ${account}, not the games account ${EXPECTED}`);
  console.log(`Stripe TEST mode, account ${account} (Pawtastic Academy II LLC games account).`);
}

const run = spawn("npx", ["vitest", "run", "--config", "qa/stripe-test/vitest.config.mts"], {
  cwd: ROOT,
  env: { ...process.env, HARNESS_STRIPE_BASE: base, HARNESS_KEY: key, HARNESS_ACCOUNT: account, HARNESS_PAY: dry ? "mock" : "stripe" },
  stdio: "inherit",
});
run.on("exit", (code) => {
  mock?.kill();
  console.log(code === 0 ? `PASS${dry ? " (dry run)" : ""}` : `FAIL${dry ? " (dry run)" : ""}`);
  process.exit(code ?? 1);
});
