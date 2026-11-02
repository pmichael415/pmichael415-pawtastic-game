# Stripe test-mode harness (in-game purchases)

`node qa/stripe-test/harness.mjs` runs one coin pack (2,500 Coins) through Stripe's own **test mode**.
It never uses production.

## What it checks

1. **Checkout.** Stripe creates a test Checkout Session from the hub's exact request (`checkoutParams` and the same idempotency key).
2. **Payment.** A browser pays on Stripe's hosted page with the `4242 4242 4242 4242` test card. Stripe sends back a paid `checkout.session.completed`.
3. **Grant.** That event, re-signed with a local secret, goes to the hub's own webhook code (`processWebhook` in `"test"` mode). It is granted exactly once, even when the same event is sent twice.
4. **Delivery.** One installation reserves and confirms the delivery. A second installation on the same account gets nothing.
5. **Refund.** A real test refund (`POST /v1/refunds`) produces `charge.refunded`. The webhook code reverses the purchase once, and the reversal goes back to the installation that had it.

## Safety

- **Isolated database.** It uses a local throwaway database (`qa/stubs`, every migration applied). The hub's real database is never touched.
- **Test keys only.** A live key is refused. The key must belong to the games account, `acct_1UWfxx58XGeAL8Pr` (Pawtastic Academy II LLC). Otherwise the harness refuses to run. The key is never printed.
- **No lasting Stripe changes.** It makes no Stripe products, prices, webhooks or subscriptions. It creates only one test checkout and one test refund per run, and those live in Stripe's test data.
- **Test mode stays here.** Production stays live-only. `"test"` mode exists only inside this harness.

## What it needs (the owner's decision)

1. **The key.** A test-mode restricted key (`rk_test_…`) or a test secret key (`sk_test_…`) for the games account, in the environment as `STRIPE_TEST_SECRET_KEY`. In Claude Code on the web, add it as an environment variable or secret in the environment settings, never in chat.
   - A restricted key needs these permissions: Checkout Sessions (write), Events (read), Refunds (write), and read access to the account.
2. **Network access** to `api.stripe.com`, `checkout.stripe.com`, `js.stripe.com` and `m.stripe.network`.

Without either, it prints `SKIPPED: …` and exits 0. A skipped run has tested nothing against Stripe.

## Dry run

`node qa/stripe-test/harness.mjs --dry-run` runs the same steps against `qa/mock-stripe.cjs`, in test mode with no network. Only Stripe's hosted card form isn't exercised.

## If Stripe changes its checkout page

The card fields are Stripe's own: `#email`, `#cardNumber`, `#cardExpiry`, `#cardCvc`, `#billingName` and `#billingPostalCode`. If Stripe renames them, update `pay()` in `purchase.harness.ts`.
