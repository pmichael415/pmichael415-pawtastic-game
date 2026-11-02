# In-game Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-money purchases inside the hub games (new Daycare, Recess Rush, today's Daycare), delivered exactly once, plus Graduation Day without its monthly cap. Built in three phases with a report after each.

**Architecture:**
- **Catalog and server:** one product catalog (`src/lib/catalog.ts`) drives checkout, the signed webhook and the in-game buy sheet.
- **Delivery:**
  - Consumables become server `deliveries` rows, reserved per (account, installation) by SQL functions under an advisory lock.
  - The game applies them in one save write together with their ids, under a cross-tab lock, then confirms.
  - Permanent purchases stay `entitlements`.
- **Mode:** production is live-only (`PAYMENT_MODE = "live"`), and every payment row carries `mode`.

**Tech Stack:**
- Hub (`tycoon/`): TanStack Start, React 19, Vitest + Testing Library, PGlite for SQL, Playwright for browser checks.
- Graduation Day: vanilla JS at the game repo root (`node --test tools/*.mjs`), and its Lovable repo `pmichael415/pawtastic-graduation` (Vitest).

**Spec:** `docs/superpowers/specs/2026-11-02-in-game-purchases-design.md` (rev 3; the owner's corrections are binding).

## Global Constraints

- **Mode and webhook:**
  - Production: `PAYMENT_MODE = "live"`. Only `sk_live_`/`rk_live_` keys, `livemode: true` events and `cs_live_` sessions count. Test-mode rows are excluded from every read.
  - Stripe API version `2026-01-28.clover`. Checkout metadata: `game=pawtastic-games-hub`, `user_id`, `product_id`. Item name: `PAWtastic Games · <name>`.
- **Prices (cents):**
  - Coins: `coins-2500` 99, `coins-8000` 299, `coins-20000` 599, `coins-50000` 1299, `coins-150000` 2999.
  - Recess Rush: `shield-starts-5` 99, `extra-lives-5` 99, `power-pack` 299 (10 + 10), `runner-looks` 199.
  - Looks: `blue-ribbon-style` 299, `deluxe-daycare-decor` 699.
- **Buy-sheet copy:** "Real money — charged by Stripe to your card." After paying: "+8,000 coins added" (or the item's name, e.g. "Runner Looks unlocked"). After backing out: "Checkout cancelled — nothing was charged."
- **Never multiplied:** purchased coins are never multiplied and never counted as daycare earnings (no ledger income, no weekly-challenge profit).
- **Team points:** Recess Rush gives a flat **5** per finished run. Graduation Day gives a flat **6** on a New York day with at least one newly cleared level. The daily team cap stays **60**.
- **Graduation Day:** the default monthly limit is none. A player can still pick $5, $10, $20, $50 or $100. The server no longer checks a monthly cap.
- **Delivery:** installation id key `pawtastic-install-v1`. Lock names `pawtastic-delivery-daycare-next` and `pawtastic-delivery-recess`.
- **Test seam:** the development-only stand-in is enabled only when `import.meta.env.DEV` and `PAWTASTIC_E2E_STUB=1`, so it can't exist in a production build.
- **Process:**
  - Tests first for every task. The suites stay green: `cd tycoon && npx vitest run`, `npx tsc --noEmit -p .`, the `qa/e2e-*.cjs` suites, and `node --test tools/*.mjs` at the repo root.
  - Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_019f4PwZn7y5xuGatgGz23Wo`.

## Review Focus

- **Stripe's confirmation arrives after the player is back in the game.** The game keeps checking briefly, says "Payment received — your purchase is on its way" if nothing has arrived, and never adds twice. Test: Task 7, `useCheckoutReturn` waits and then reports pending.
- **Storage is full or blocked (private browsing).** The save write fails, so the game must not confirm the delivery, and it must not lose the reserved row. Test: Task 6, a failed write means no ack, and the next collect returns the same row.
- **A confirmed id falls out of a bounded list while a stale reserve response is still in flight.** Dedupe must use both `applied` (not yet confirmed) and `done` (confirmed, last 500), and only confirmed ids are ever trimmed. Test: Task 5.
- **Another account signs in on the same device.** Each account's deliveries go only to that account's calls. A row reserved by account A is never returned to account B. Test: Task 3.
- **A purchase was made from the hub Shop tab rather than in a game.** Checkout returns to `/shop`, and the game collects on its next open. Test: Task 4 (`returnTo`) and Task 13 (browser).

## File Structure

| Path (under `tycoon/` unless noted) | Responsibility |
|---|---|
| `src/lib/payments/verify.ts` (modify) | mode, keys, event validation, checkout params with return path |
| `src/lib/catalog.ts` (modify) | every product: game, kind, price, contents, return path |
| `drizzle/migrations/0009_purchases.sql` (+ meta snapshot/journal) | mode columns, `deliveries`, `grant_purchase`, `reserve_deliveries`, `ack_deliveries`, `refund_purchase` |
| `src/lib/payments/webhook.server.ts` (create) | `processWebhook(request, opts)`: the route's logic, callable by tests and the Stripe test harness |
| `src/routes/api/public/payments/webhook.ts` (modify) | thin route calling `processWebhook` |
| `src/lib/payments/payments.functions.ts` (modify) | `createCheckout`, `listEntitlements`, `reserveDeliveries`, `ackDeliveries` |
| `src/lib/purchases/delivery.ts` (create) | pure planning: dedupe, reversals, applied/done lists; installation id; lock helper |
| `src/lib/purchases/collect.ts` (create) | reserve → lock → apply-and-write → ack orchestration |
| `src/tycoon/purchases.ts` (create) | apply contents to the new Daycare save |
| `src/game/purchases.ts` (create) | apply contents to the hub save (Recess power-ups) |
| `src/tycoon/store.ts`, `src/game/store.ts` (modify) | apply plan under lock with latest save; stale-writer guard (`<KEY>-rev`) |
| `src/tycoon/state.ts`, `src/tycoon/types.ts`, `src/game/engine.ts` (modify) | new save fields, validated on load |
| `src/components/purchases/BuySheet.tsx`, `src/components/purchases/useCheckoutReturn.ts` (create) | shared buy sheet and return handling |
| `src/components/tycoon/DaycareShop.tsx` (create), `RunHud.tsx`, `TycoonPlay.tsx` (modify) | in-game Daycare Shop (Coins tab in phase 1) |
| `src/routes/recess.tsx` (modify), `src/components/recess/RunStart.tsx` (create) | power-ups, runner looks, flat team points |
| `src/routes/daycare.tsx` (modify), `src/components/game/PupStyleSheet.tsx` (create) | Blue Ribbon in place |
| `src/routes/shop.tsx` (modify) | all products grouped by game, live wording |
| `src/lib/team.ts`, `src/game/linkSync.ts` (modify) | flat team points |
| `src/lib/paidVisuals.ts` (modify) | `rainbow-trail`, `rocket-cape` from `runner-looks` |
| `qa/stubs/*`, `qa/mock-stripe.cjs`, `qa/e2e-purchases.cjs` (create); `vite.config.ts` (modify) | development-only stand-in and browser checks |
| `qa/stripe-test/harness.mjs` (create) | real Stripe **test-mode** run (needs the owner to enable network and key) |
| repo root: `src/economy/*`, `src/ui/*`, `src/net/*`, `tools/mock-pay-server.mjs`, `tools/test-spending.mjs` | Graduation Day: no cap by default |
| `pawtastic-graduation`: `drizzle/migrations/0009_no_monthly_cap.sql` | Graduation server: no cap |

---

# Phase 1 — backbone and first items

### Task 1: Live-only payment mode

**Files:** Modify `src/lib/payments/verify.ts`. Create `src/lib/payments/mode.test.ts` (from the prepared `scratchpad/live-mode.test.ts`). Modify `src/lib/payments/verify.test.ts`, `src/lib/payments/checkout-rules.test.ts` and `src/test/webhook-flow.test.ts`: tests of test-mode behaviour pass `"test"` explicitly; webhook fixtures become `livemode: true` with `cs_live_` ids and the key `sk_live_flow`.

**Interfaces:**
- Produces:
  - `type PaymentMode = "test" | "live"` and `const PAYMENT_MODE: PaymentMode = "live"`
  - `sessionPrefix(mode?) => "cs_live_" | "cs_test_"`
  - `countsIn(sessionId: string, mode?) => boolean`
  - `isModeEvent(livemode: boolean, mode?) => boolean`
  - `paymentsConfig(env, mode = PAYMENT_MODE)`, which refuses other-mode keys with reason `` `Only ${mode}-mode keys are accepted` ``
  - `validatePaidEvent(e, mode = PAYMENT_MODE)`, which returns reason `"wrong payment mode"`

- [ ] **Step 1: Restore the prepared test.** Copy `scratchpad/live-mode.test.ts` to `src/lib/payments/mode.test.ts`. It asserts `PAYMENT_MODE` is `"live"`, live keys only, test keys under `"test"`, mode-matched events, `countsIn` and `sessionPrefix`.
- [ ] **Step 2: Run it.** `cd tycoon && npx vitest run src/lib/payments/mode.test.ts`. Expected: FAIL (4 failed, `sessionPrefix is not a function`).
- [ ] **Step 3: Implement the exports above in `verify.ts`.** Reuse the code that was prepared and blocked on 2 Nov. Its comment cites the owner's authorization: "Production remains live-only, with test data excluded" (2 Nov).
- [ ] **Step 4: Update the old tests.**
  - Calls that check test-mode behaviour pass `"test"`.
  - In `webhook-flow.test.ts`: `STRIPE_SECRET_KEY = "sk_live_flow"`, every fixture `livemode: true`, and session ids `cs_live_a` and `cs_live_b`.
  - The old "live-mode events are ignored" test becomes "test-mode events are acknowledged and ignored (`ignored: "other-mode"`)".
- [ ] **Step 5: Mode-check the webhook route and checkout.**
  - Webhook: `if (!isModeEvent(Boolean(evt.livemode || o.livemode === true))) return {received: true, ignored: "other-mode"}`.
  - `createCheckout`: refuse when `Boolean(session.livemode) !== (PAYMENT_MODE === "live")`, with "Checkout could not be started — the payment key is in the wrong mode."
- [ ] **Step 6: Run the payment tests.** `npx vitest run src/lib/payments src/test/webhook-flow.test.ts`. Expected: PASS.
- [ ] **Step 7: Commit.** "Payments: production is live-only (owner, 2 Nov); test-mode keys, events and sessions never count".

### Task 2: Catalog with games, kinds, contents and return paths

**Files:** Modify `src/lib/catalog.ts`. Create `src/lib/catalog.test.ts`.

**Interfaces:**
- Produces:
  - `type ProductId` = the 11 phase-1 ids (Global Constraints)
  - `type GameId = "daycare-next" | "recess" | "daycare"`
  - `type ProductKind = "consumable" | "looks"`. Phase 2 adds `"permanent" | "mixed"`; phase 3 adds `"subscription"`.
  - `type Contents = { coins?: number; shieldStarts?: number; extraLives?: number }`
  - `type ReturnPath = "/daycare-next" | "/recess" | "/daycare" | "/shop"`
  - `type PaidProduct = { id; game; kind; name; priceCents; currency: "usd"; blurb; items: string[]; contents?: Contents; returnPath: ReturnPath }`
  - `PAID_PRODUCTS: PaidProduct[]`, `productById(id: string): PaidProduct | undefined`, `PRODUCT_IDS`, `formatPrice(p)` (exists)
  - `entitles(p) => p.kind === "looks"` and `delivers(p) => p.kind === "consumable"`

- [ ] **Step 1: Write the failing tests.**
  - Every id has its exact price (Global Constraints).
  - Contents:
    - `coins-8000` → `{coins: 8000}`, `coins-150000` → `{coins: 150000}`
    - `shield-starts-5` → `{shieldStarts: 5}`, `extra-lives-5` → `{extraLives: 5}`
    - `power-pack` → `{shieldStarts: 10, extraLives: 10}`
  - Return paths:
    - coins and `deluxe-daycare-decor` → `/daycare-next`
    - power-ups and `runner-looks` → `/recess`
    - `blue-ribbon-style` → `/daycare`
  - Kinds: looks have no contents; consumables have contents.
  - `productById("free-stuff")` is undefined.
- [ ] **Step 2: Run them.** `npx vitest run src/lib/catalog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the catalog.** Names: "2,500 Coins", "8,000 Coins", "20,000 Coins", "50,000 Coins", "Mega Vault (150,000 Coins)", "5 Shield Starts", "5 Extra Lives", "Power Pack", "Runner Looks Pack". Existing entries keep their text.
- [ ] **Step 4: Fix the users.**
  - `payments.functions.ts`'s `z.enum` becomes `z.enum(PRODUCT_IDS)`.
  - `validatePaidEvent` keeps using `PAID_PRODUCTS`.
- [ ] **Step 5: Verify.** `npx vitest run src/lib && npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 3: SQL — modes, deliveries, grant, reserve, ack, refund

**Files:** Create `drizzle/migrations/0009_purchases.sql`, `drizzle/migrations/meta/0009_snapshot.json`, and the `_journal.json` entry (`when` 1793700000000). Create `src/test/purchases-db.test.ts`, using the PGlite pattern of `webhook-flow.test.ts`. Modify `src/test/migrations.test.ts` if it counts migrations.

**Interfaces:**
- Produces the SQL below. Every function is `SECURITY DEFINER`, executable by `service_role` only, and takes its mode as a parameter.
  - `checkout_sessions.mode` and `entitlements.mode`: `text NOT NULL DEFAULT 'live' CHECK (mode IN ('test','live'))`. Existing rows not starting `cs_live_` are set to `'test'`.
  - Entitlements are unique per `(user_id, product_id, mode)`.
  - Product CHECKs list the 11 ids.
  - `deliveries`:
    - columns: `id uuid pk`, `mode`, `user_id uuid`, `game text CHECK IN ('daycare-next','recess')`, `source text CHECK IN ('purchase','reversal')`, `source_ref text`, `contents jsonb`, `status text CHECK IN ('ready','reserved','delivered','void') DEFAULT 'ready'`, `reserved_by uuid`, `reserved_at`, `delivered_at`, `reverses uuid NULL REFERENCES deliveries(id)`, `created_at`
    - `UNIQUE(source, source_ref)`
    - RLS on, no policies, granted to `service_role`
  - `grant_purchase(_event_id text, _session_id text, _user_id uuid, _product_id text, _amount int, _currency text, _payment_intent text, _mode text, _entitle boolean, _game text, _contents jsonb) RETURNS text`:
    - returns `'granted'` or `'duplicate'`;
    - raises `'session mismatch'` when the mode differs too.
  - `reserve_deliveries(_user_id uuid, _installation uuid, _game text, _mode text) RETURNS jsonb`: an array of `{id, contents, reverses}` ordered by `created_at`.
  - `ack_deliveries(_user_id uuid, _installation uuid, _ids uuid[], _mode text) RETURNS int`
  - `refund_purchase(_event_id text, _payment_intent text, _mode text) RETURNS text`: returns `'revoked'`, `'duplicate'` or `'ignored'`.
  - `grant_entitlement` and `revoke_entitlement_for_refund` are dropped.

- [ ] **Step 1: Write the failing tests** (`purchases-db.test.ts`, one `it` each):
  - "a paid consumable becomes one ready delivery; the same event again is a duplicate"
  - "a looks purchase grants a live entitlement; the old test-mode entitlement of the same product doesn't block it": seed a `cs_test_` entitlement first.
  - "installation A reserves; installation B gets nothing; A gets the same rows again until it acks": reserve twice, then ack, then reserve returns `[]`.
  - "two concurrent reserves from A and B: each row goes to exactly one": `Promise.all` on two connections, or sequential calls under the advisory lock.
  - "ack by another installation changes nothing"
  - "account B never sees account A's rows"
  - Refunds:
    - "refund of a ready delivery voids it"
    - "refund of a reserved or delivered one creates one reversal reserved for the same installation"
    - "refund twice is a duplicate"
  - "test-mode rows are never returned in live mode"
- [ ] **Step 2: Run them.** `npx vitest run src/test/purchases-db.test.ts`. Expected: FAIL (functions missing).
- [ ] **Step 3: Write `0009_purchases.sql`.**
  - Lock with `pg_advisory_xact_lock(hashtextextended('hub-delivery:'||_mode||':'||_user_id::text, 0))` in reserve and refund.
  - A reversal's `contents` is the original's with each number negated. Its status is `'reserved'` with the original's `reserved_by`, or the original becomes `'void'` if it was `'ready'`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Run every SQL test.** `npx vitest run src/test`. Expected: PASS, except `webhook-flow`, which Task 4 updates.
- [ ] **Step 6: Commit.**

### Task 4: Server — webhook, checkout to any product, reserve and ack

**Files:**
- Create `src/lib/payments/webhook.server.ts`.
- Modify `src/routes/api/public/payments/webhook.ts`, `src/lib/payments/payments.functions.ts` and `src/lib/payments/verify.ts` (`checkoutParams`).
- Tests: `src/test/webhook-flow.test.ts`, `src/lib/payments/checkout-rules.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `processWebhook(request: Request, opts?: { mode?: PaymentMode; secret?: string }): Promise<Response>`
  - `checkoutParams(product: PaidProduct, userId: string, origin: string, returnTo: ReturnPath): URLSearchParams`, with
    - `success_url` = `${origin}${returnTo}?checkout=returned`
    - `cancel_url` = `${origin}${returnTo}?checkout=cancelled`
  - `createCheckout({ productId: ProductId, returnTo: ReturnPath })`. `returnTo` must be the product's `returnPath` or `"/shop"`; anything else gives "Checkout could not be started".
  - `listEntitlements()`, filtered by `mode = PAYMENT_MODE` and `revoked_at IS NULL`
  - `reserveDeliveries({ installation: string (uuid), game: "daycare-next" | "recess" }) => Delivery[]`
  - `ackDeliveries({ installation, ids: string[] (≤100 uuids) }) => { acked: number }`
  - `type Delivery = { id: string; contents: Contents; reverses: string | null }`

- [ ] **Step 1: Write the failing tests.**
  - `checkoutParams` builds both return addresses for `/recess` and for `/shop`.
  - Webhook flow:
    - a `coins-8000` session paid → one `deliveries` row with `{coins: 8000}` and game `daycare-next`;
    - a `runner-looks` session paid → an entitlement;
    - a full refund of the coins after a reserve → a reversal of `{coins: -8000}`;
    - an other-mode event is ignored;
    - another game's event is ignored.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Move the route body into `processWebhook`.** It calls `grant_purchase` with `_entitle = entitles(p)`, `_contents = delivers(p) ? p.contents : null`, `_game = p.game`; refunds call `refund_purchase`. The route becomes `POST: ({request}) => processWebhook(request)`.
- [ ] **Step 4: Add `reserveDeliveries` and `ackDeliveries`.** Both use `requireSupabaseAuth` and call the RPCs through `supabaseAdmin` with `context.userId` and `PAYMENT_MODE`.
- [ ] **Step 5: Verify.** `npx vitest run src/test src/lib && npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 5: Delivery planning (pure)

**Files:** Create `src/lib/purchases/delivery.ts` and `src/lib/purchases/delivery.test.ts`.

**Interfaces:**
- Produces:
  - `type DeliveryLog = { applied: string[]; done: string[] }`
  - `DONE_MAX = 500`
  - `planDeliveries(log: DeliveryLog, batch: Delivery[]): { steps: { id: string; contents: Contents; sign: 1 | -1 }[]; log: DeliveryLog }`
  - `confirmed(log: DeliveryLog, ids: string[]): DeliveryLog`, which moves ids from `applied` to `done`, keeping the last `DONE_MAX`
  - `installationId(storage?: Storage): string`, which creates a uuid under `pawtastic-install-v1` once and returns `""` if storage is blocked
  - `withLock<T>(name: string, fn: () => Promise<T> | T): Promise<T>`, which uses `navigator.locks.request` when present, otherwise runs `fn`

- [ ] **Step 1: Write the failing tests.**
  - New delivery → one `+1` step, and its id is added to `applied`.
  - An id in `applied` or `done` → no step.
  - A reversal R of applied O → a `-1` step with O's contents, and R is recorded.
  - A reversal R of O not yet applied → no step, and both are recorded, so O never applies later in the same or a later batch.
  - Reversals are processed before originals within one batch.
  - `confirmed` trims only `done`, never `applied`.
  - `installationId` is stable across calls and returns `""` when storage throws.
- [ ] **Step 2: Run them.** `npx vitest run src/lib/purchases`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Saves, applying, stale-writer guard, collecting

**Files:**
- Create `src/tycoon/purchases.ts`, `src/game/purchases.ts`, `src/lib/purchases/collect.ts` and `src/lib/purchases/collect.test.ts`.
- Modify `src/tycoon/types.ts` and `src/tycoon/state.ts`: `deliveries: DeliveryLog`, validated, ids matching `/^[0-9a-f-]{36}$/`, at most 2,000.
- Modify `src/game/engine.ts`:
  - `GameState.deliveries: DeliveryLog`
  - `GameState.recessPowerups: { shield: number; life: number }` (integers 0–9,999)
  - `parseSave` validates both.
- Modify `src/tycoon/store.ts` and `src/game/store.ts`.

**Interfaces:**
- Produces:
  - `applyTycoonContents(s: TycoonState, c: Contents, sign: 1 | -1): TycoonState`: coins ± and never below 0; no ledger entry.
  - `applyHubContents(s: GameState, c: Contents, sign: 1 | -1): GameState`: power-ups ±, never below 0.
  - Each store exports `applyDeliveries(batch: Delivery[]): { ok: boolean; appliedIds: string[] }`:
    1. read the latest save from storage;
    2. plan;
    3. apply the steps;
    4. persist in one write, and bump `<KEY>-rev`;
    5. adopt into memory;
    6. return `ok: false` and change nothing if the write throws.
  - Each store's `persist` checks `<KEY>-rev` against the rev it last read or wrote. If they differ, it adopts the stored save instead of writing.
  - `collectDeliveries(game: "daycare-next" | "recess", deps?: { reserve; ack; apply; installation; lock }): Promise<{ added: Delivery[]; pending: boolean }>`, which runs reserve → `withLock` → apply → ack. If the ack fails, the next call acks again.

- [ ] **Step 1: Write the failing tests.**
  - Collect adds 8,000 coins once, and a second call adds nothing.
  - The ack fails, then the next collect re-acks without adding.
  - A write failure → no ack, and the next collect returns the row again and adds it.
  - Stale tab: a store holding an older rev doesn't overwrite a save whose rev moved, and adopts it.
  - Two `collectDeliveries` running at once on one installation add once (lock).
  - A reversal subtracts, never below 0.
  - Saves with the new fields missing or hostile load with empty logs and zero power-ups.
- [ ] **Step 2: Run them.** `npx vitest run src/lib/purchases src/tycoon src/game`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx vitest run && npx tsc --noEmit -p .`. Expected: PASS, with the 529 existing tests still passing.
- [ ] **Step 5: Commit.**

### Task 7: Buy sheet and checkout return

**Files:** Create `src/components/purchases/BuySheet.tsx`, `src/components/purchases/useCheckoutReturn.ts` and `src/components/purchases/buy.test.tsx`.

**Interfaces:**
- Consumes: `createCheckout`, `getPaymentsStatus`, `useSession`, `collectDeliveries`, `useEntitlements().refresh`.
- Produces:
  - `<BuySheet product={PaidProduct} returnTo={ReturnPath} open onClose />`
  - `useCheckoutReturn(game: GameId): void`:
    - reads and removes `?checkout=`;
    - after `returned`, collects (and refreshes entitlements) up to 6 times, 2 s apart, until something arrives. For
      `"daycare"` (looks only) it refreshes entitlements only; `collectDeliveries` is called only for `"daycare-next"`
      and `"recess"`;
    - then toasts the copy, or "Payment received — your purchase is on its way" if still pending;
    - after `cancelled`, toasts the cancel copy.

- [ ] **Step 1: Write the failing tests.**
  - The sheet shows the name, contents, `$2.99` and the real-money line.
  - A guest sees "Sign in to buy", linking to `/account`.
  - With payments locked: "Purchases are paused right now — nothing can be charged."
  - Buy calls `createCheckout({productId, returnTo})` and assigns the returned URL.
  - The return hook covers: returned with a delivery arriving on the third try, returned and still pending, and cancelled.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Uses the existing `Sheet` and `Button` and 44px targets.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 8: New Daycare — Daycare Shop (Coins)

**Files:** Create `src/components/tycoon/DaycareShop.tsx`. Modify `RunHud.tsx` (a "Shop" button and the coin counter as a button) and `TycoonPlay.tsx`:
- mount the shop;
- call `useCheckoutReturn("daycare-next")`;
- collect on open when signed in;
- give the "not enough coins" refusal toast a "Get coins" action.

Find the refusal texts by `grep -n "coins" src/tycoon/build.ts src/tycoon/business.ts`. Test: `src/components/tycoon/shop.test.tsx`.

**Interfaces:**
- Consumes: `BuySheet`, the catalog (`game === "daycare-next"`), `tycoonStore`.
- Produces: `<DaycareShop open onClose initialTab="coins" />`, with the Coins tab listing the five packs. Deluxe Decor shows under "Items & themes". Phase 2 adds tabs.

- [ ] **Step 1: Write the failing tests.**
  - The coin counter opens the shop.
  - Five packs with exact prices.
  - Picking one opens the buy sheet.
  - A refused build for coins offers "Get coins".
  - Coins arriving via `applyDeliveries` update the counter and are not in the day's ledger income.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Also change the catalog's "Get it in the Shop" link to open the Deluxe Decor buy sheet in place.
- [ ] **Step 4: Run them.** `npx vitest run src/components/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: Recess Rush — power-ups, runner looks, flat team points

**Files:**
- Create `src/components/recess/RunStart.tsx`.
- Modify `src/routes/recess.tsx`, `src/game/engine.ts`, `src/lib/team.ts` and `src/lib/paidVisuals.ts`.
- Tests: `src/game/recess.test.ts`, `src/components/recess/run-start.test.tsx`, `src/game/teams.test.ts`.

**Interfaces:**
- Produces:
  - `startRun(s: GameState, use: { shield: boolean; life: boolean }): { state: GameState; lives: 3 | 4; shield: boolean }`: uses one of each switched-on power-up only if the count > 0.
  - `RECESS_TEAM_POINTS = 5` in `team.ts`.
  - `PaidItemId` adds `"rainbow-trail" | "rocket-cape"` (pack `runner-looks`).
  - `<RunStart counts onStart onBuy />`

- [ ] **Step 1: Write the failing tests.**
  - `startRun` with a shield and a life and counts 1/1 → lives 4, shield true, counts 0/0.
  - With counts 0 → lives 3, no shield, and the save is unchanged.
  - `recessMaxScore` is unchanged, so a run with power-ups still passes the score check.
  - A finished run adds exactly 5 team points whatever the score.
  - The start screen shows the counts and switches, "Get more" opens the Power Pack buy sheet, and the looks show Equip or Buy.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The run start consumes power-ups through `updateSave`.
  - Draw the Rainbow Trail as a 6-colour fading trail and the Rocket Cape as a red cape shape on the runner, when equipped and owned (`visuals`).
  - `recess.tsx` collects deliveries on open and calls `useCheckoutReturn("recess")`.
- [ ] **Step 4: Run them.** `npx vitest run src/game src/components/recess src/lib`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: Today's Daycare — Pup style; Graduation team points flat

**Files:**
- Create `src/components/game/PupStyleSheet.tsx`. Modify `src/routes/daycare.tsx` (a "Pup style" button and `useCheckoutReturn("daycare")`).
- Modify `src/game/linkSync.ts` and `src/lib/team.ts`.
- Tests: `src/components/game/pup-style.test.tsx`, `src/game/linked.test.ts`.

**Interfaces:**
- Produces:
  - `GRAD_TEAM_POINTS = 6`
  - `gradTeamPoints(team, newLevels: number, day: string, storage?): number`: 6 on the first call of a New York day with `newLevels > 0`, else 0 (key `pawtastic-team-grad-v1`).

- [ ] **Step 1: Write the failing tests.**
  - The sheet lists the Blue Ribbon Collar, Navy Star Bandana and Sparkle Trail: Equip/Unequip when owned, otherwise "Buy $2.99" opening the buy sheet with `returnTo` `/daycare`.
  - Clearing 3 levels gives 6 points once that day, and a later clear the same day gives 0.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 11: Hub Shop tab

**Files:** Modify `src/routes/shop.tsx`. Test: `src/routes/shop.test.tsx` (create).

- [ ] **Step 1: Write the failing tests.**
  - Sections "New Daycare", "Recess Rush" and "Today's Daycare", each listing its products with exact prices.
  - Buy buttons read "Buy $2.99" (never "test mode").
  - "Proposed launch prices" is gone.
  - Buy opens the buy sheet with `returnTo` `/shop`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 12: Graduation Day without the monthly cap

**Files:**
- Game repo root:
  - `src/economy/catalog.js`: `SPENDING_LIMIT = { default: null, min: 1, max: 100 }`, `LIMIT_CHOICES` adds `null` ("No limit")
  - `src/economy/wallet.js`: `spendingLimit: number | null`; a `limitChosen` flag; an unchosen 100 loads as `null`
  - `src/ui/payments.js` and `src/ui/screens/shop.js`: skip the check when `null`; the Shop shows "Spending this month: $X (no limit)"
  - `src/net/server-backend.js` and `src/net/state-map.js`: `null`
  - `tools/mock-pay-server.mjs`: no `monthly-cap`
  - `tools/test-spending.mjs` (create)
- `pawtastic-graduation`: create `drizzle/migrations/0009_no_monthly_cap.sql` (the same `reserve_game_mode_checkout` without the `spent` check), with its journal and snapshot entries; plus a test.

- [ ] **Step 1: Write the failing tests.**
  - New wallet → limit `null`.
  - Old wallet with 100 and no choice → `null`; with `limitChosen` → 100 kept.
  - `setSpendingLimit(null)` and `setSpendingLimit(20)` both work.
  - A $150 month isn't blocked with no limit, but is blocked at $100 when chosen.
  - Graduation: a test that the latest `reserve_game_mode_checkout` definition has no monthly check.
- [ ] **Step 2: Run them.** `node --test tools/test-spending.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Rebuild: `node tools/build-single.mjs . dist/index.html`, then `bash tycoon/scripts/update-graduation.sh dist/index.html`.
  - Copy the build to the Graduation repo's `public/play/index.html`.
- [ ] **Step 4: Run everything.**
  - `node --test tools/*.mjs`, `tools/e2e-payments.cjs` and `tools/e2e-out-of-moves.cjs` against a fresh mock.
  - In the Graduation repo: `bunx vitest run` and `bunx tsc --noEmit`.
  - Expected: PASS.
- [ ] **Step 5: Commit both repos.** Push the Graduation repo's `main` (Lovable-linked: no force push).

### Task 13: Browser checks against a development-only stand-in

**Files:**
- Create `qa/stubs/supabase-admin.ts`: `supabaseAdmin.rpc` and `.from(...).select/insert/eq/maybeSingle/is` over an in-process PGlite with all migrations applied, plus an HTTP `/__stub/sql` for assertions.
- Create `qa/stubs/auth-middleware.ts`: `requireSupabaseAuth` that trusts `stub:<uuid>` bearer tokens and puts the same in `context.supabase`, filtered by user.
- Create `qa/mock-stripe.cjs`:
  - `/v1/account`, `POST /v1/checkout/sessions` (`livemode: true`, `cs_live_mock_*`);
  - a pay page with Pay/Back that sends signed `checkout.session.completed` or `.expired` to the hub webhook, then redirects;
  - `POST /mock/refund`, which sends a signed `charge.refunded`.
- Create `qa/e2e-purchases.cjs`.
- Modify `vite.config.ts`: the aliases apply only when `PAWTASTIC_E2E_STUB=1` and the command is `serve`.
- Modify `verify.ts`: `stripeApi()` returns `process.env.STRIPE_API_BASE` only when `import.meta.env.DEV && process.env.PAWTASTIC_E2E_STUB === "1"`, else `https://api.stripe.com`.

**Checks (`e2e-purchases.cjs`, phone size).** The page runs on `https://hub.test`, routed to the dev server, because `APP_ORIGIN` must be https.
- In the new Daycare: buy 8,000 coins → Stripe stand-in → back on `/daycare-next` → "+8,000 coins added" → the counter goes up by 8,000.
- Reload: no change.
- A second browser context (another installation, same account) gets nothing.
- Back out → the cancel toast, and nothing changes.
- Refund → the reversal subtracts.
- Recess: buy a Power Pack → counts 10/10 → start a run with both → 4 lives and a shield → counts 9/9; buy Runner Looks → Equip.
- Today's Daycare: buy Blue Ribbon from "Pup style" → Equip.
- A guest is asked to sign in.
- Shop tab: buying returns to `/shop`, and the game collects on its next open.
- A production `npx vite build` has no `qa/stubs` or `STRIPE_API_BASE` in its output.

- [ ] **Step 1: Write `e2e-purchases.cjs`** with the checks above.
- [ ] **Step 2: Run it.** Command: `PAWTASTIC_E2E_STUB=1 STRIPE_API_BASE=http://127.0.0.1:8899 STRIPE_SECRET_KEY=sk_live_mock PAYMENT_WEBHOOK_SECRET=whsec_mock APP_ORIGIN=https://hub.test STRIPE_EXPECTED_ACCOUNT=acct_1Mock000000 npx vite dev --port 5174` with `node qa/mock-stripe.cjs`, then `node qa/e2e-purchases.cjs https://hub.test`. Expected: FAIL (stubs missing).
- [ ] **Step 3: Implement the stubs and the mock.**
- [ ] **Step 4: Run it, plus every other suite.** `e2e-purchases.cjs`, then the existing `qa/e2e-*.cjs` on the normal dev server, and `grep -c "qa/stubs\|STRIPE_API_BASE" .output -r` = 0 after `npx vite build`. Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 14: Real Stripe test-mode harness, and the phase 1 report

**Files:** Create `qa/stripe-test/harness.mjs` and `qa/stripe-test/README.md`.

What the harness does:
- It needs `STRIPE_TEST_SECRET_KEY` (a test-mode restricted key) and network access to `api.stripe.com`, `checkout.stripe.com`, `js.stripe.com` and `m.stripe.network`.
- It creates a real test Checkout Session with `checkoutParams(product, user, origin, returnTo)`.
- Playwright pays on Stripe's hosted page with `4242 4242 4242 4242`.
- It fetches the resulting events (`GET /v1/events?created[gte]=…`) and passes them, re-signed with a local secret, to `processWebhook(request, { mode: "test", secret })` against a local PGlite database.
- It asserts one delivery, reserves and acks it, refunds via `POST /v1/refunds`, and asserts the reversal.
- It never touches production. The `"test"` mode exists only inside the harness.

- [ ] **Step 1: Write the harness.** It prints "SKIPPED: STRIPE_TEST_SECRET_KEY or network not available" and exits 0 when unavailable.
- [ ] **Step 2: Run it.** `node qa/stripe-test/harness.mjs`. Expected: today, SKIPPED (reported as not done); once the owner enables it, PASS.
- [ ] **Step 3: Full verification.**
  - `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build`, every `qa/e2e-*.cjs`, and `node --test tools/*.mjs`.
  - Sync to the Lovable project (`scripts/make-sync-manifest.sh`, copy, sha256, `diff -rq`).
  - Apply migration 0009 to the Daycare database only when publishing is approved.
- [ ] **Step 4: Report to the owner**, with test counts and anything skipped. Phase 1 is not live until the live-payment milestone.

---

# Phase 2 — the Daycare Shop (detailed before it starts)

1. **Gate.** Re-verify check-in, room assignment, building, saving and returning in the browser, with paid effects off and on. e2e-tycoon must be green.
2. **Catalog and SQL:**
   - `permanent` and `mixed` kinds;
   - ids: `starter-bundle`, `golden-leash`, `grooming-pro`, `night-shift`, `big-welcome-back`, `land-deed`, `celebrity-visit`, `vip-spa-suite`, `celebrity-splash-park`, `royal-agility`, `theme-beach`, `theme-winter`;
   - Starter reservation table and `reserve_starter` (advisory lock; open, paid or refunded blocks; expired or failed releases; Stripe status check);
   - mixed grant: delivery plus the `golden-dog-bed` entitlement.
3. **Earned twins:**
   - Top Daycare at level 20, Staff Wing at level 15, Loyal Regulars at level 10;
   - the Master Groomer trophy at 300 baths;
   - Spa Suite (level 12, 1,200 coins), Grand Splash Park (level 10, 2,000 coins), Pro Agility (level 8, 600 coins);
   - the Golden Dog Bed has the same function as the Deluxe Dog Bed.
4. **Earnings formula:** `round(base × service × G)`, halves up. `G ∈ {1, 1.25, 1.5, 1.75}`. Grooming Pro gives baths ×2; Spa Suite gives boarding ×1.5. Never on purchased or VIP coins, rewards, welcome-back or reversals. Tests: every spec example.
5. **Welcome-back** recalculated: ×3 with a cap of 450 (counted once), granted in the same write as `lastSeen`. Tests: two tabs, reload, clock back.
6. **Consumables:**
   - Land Deed: a `deeds` count, used by `buyLand`;
   - Celebrity Visit: `celebrity` days, arrival boost ×2, stacked cap ×2.5;
   - Starter Flyers: 3 days, through the campaign;
   - all of them through deliveries.
7. **Premium items and themes:** catalog items with gold, celebrity, royal and VIP looks; theme materials.
8. **Refunds of things in use:** the full spec table, including occupied Spa Suites, dogs moved by `normalisePlaces`, staff above the limit kept, used deeds clawed back from coins, and visits ending.
9. **Daycare Shop tabs:** Coins (with Starter), Boosts, Items & themes. Earned twins show as active.
10. **Browser checks and report.**

# Phase 3 — VIP Daycare Pass (detailed before it starts)

1. **Checkout:** subscription mode with the copy "$4.99/month, automatically renews until cancelled." A VIP reservation under lock refuses non-ended subscriptions and open checkouts.
2. **Tables:**
   - `vip_subscriptions` (id, user, status, customer, `cancel_at_period_end`);
   - `vip_periods` (invoice id unique, `period_start`, `period_end`, `refunded_at`).
3. **Webhook:**
   - `customer.subscription.created/updated/deleted`;
   - `invoice.paid` (`amount_paid` > 0) adds a period;
   - `invoice.payment_failed` adds nothing;
   - a refund of a VIP invoice marks the period refunded;
   - the duplicate safety net cancels and refunds a second active subscription through the Stripe API.
4. **Weekly grants:** the signup week, then each Monday 00:00 America/New_York covered by a non-refunded paid period. One delivery per (account, week). Created on reserve or webhook.
5. **In the game:** `vipStatus()` returns `vip_until`; +50% only while the clock is before it; "Manage VIP Pass" opens a billing-portal session.
6. **Tests:**
   - signup, renewal, failed payment and later success, cancellation (benefits to `period_end`, unclaimed weeks still collectible), resubscription, duplicate attempts and the safety net, refund of a period, duplicate events, New York week boundaries including daylight-saving changes;
   - in the Stripe test harness, test clocks for renewal, failure (`4000 0000 0000 0341`) and cancellation.
7. **Report.**

# Milestone — live payment verification (separate)

1. The owner sets up the live webhook (all events) and the live key and secret.
2. Claude publishes.
3. The owner makes real purchases: a coin pack, a power-up, a look, the Starter and the VIP Pass.
4. Claude verifies:
   - `deliveries` reach `delivered` once;
   - entitlements restore on a second device;
   - VIP shows the paid-through date and a week's coins.
5. A report with the evidence.
