# In-game purchases in the PAWtastic Games hub — design

Date: 2 Nov 2026. Revision 3: the owner's eight corrections (2 Nov) are folded in. The catalog and prices are
unchanged.

## Goal

Players can buy things **inside each game**, with real money, so the games earn money. Every game sells something
different. The new Daycare has the biggest shop ("I want that game to be explosive too"). Graduation Day keeps its own
live in-game Shop.

## Owner decisions

- Each game sells something different. The Daycare sells coins and "things to get you ahead".
- Coin packs only in the **new Daycare**, which becomes the main daycare.
- **Today's Daycare** sells its pup looks in place.
- **Recess Rush** sells power-ups and runner looks.
- The new Daycare also gets Mega Vault, the Starter Bundle, Boosts, premium items, themes and the VIP Daycare Pass.
- **No spending limit** in the hub games. Graduation Day keeps its shop but drops its $100-a-month limit.
- **Real payments** on the games Stripe account (Pawtastic Academy II LLC, `acct_1UWfxx58XGeAL8Pr`). Production is
  **live-only**; test data is excluded.
- **Corrections (2 Nov), all binding:**
  - delivery reserved on the server per account and installation before delivery;
  - complete VIP rules;
  - exact boost maths;
  - an earned path for every functional item;
  - the Starter Bundle as a mixed purchase;
  - refunds for things in use;
  - gameplay protection, with team scores never bought;
  - tests for every new product type, with isolated Stripe test infrastructure alongside mocks.
- **Delivery:** three phases, with a report after each. Live payment verification is a separate milestone.

## Standing rules

- **Free play:**
  - Core gameplay stays free. **Every room, item, building and upgrade that changes play can be earned through
    play**: purchases bring it sooner or speed it up.
  - Only looks (themes, outfits, gold or celebrity versions of items) are exclusive to purchases.
  - **All dog-safety functions are free:** calm room, separating, beds, water, staff rest, check-in and check-out.
- **No pressure tactics:** no paid random rewards (no mystery boxes), no limited-time offers or countdowns, no penalty
  for missing a day.
- **Server confirmation:** nothing is unlocked from the browser or a return address alone, only after Stripe's signed
  confirmation reaches the server.
- **Game coins** are virtual. They never become cash, discounts or daycare credit, and stay separate from the customer
  app.
- **Team scores can't be bought** (see "Protecting play").
- **Ruling C1** still holds for Deluxe Daycare Decor and the theme packs (looks only).

## Catalog (prices unchanged)

| Game | Item (id) | Price | Gives | Kind |
|---|---|---|---|---|
| New Daycare | `coins-2500` | $0.99 | 2,500 coins | consumable |
| New Daycare | `coins-8000` | $2.99 | 8,000 coins | consumable |
| New Daycare | `coins-20000` | $5.99 | 20,000 coins | consumable |
| New Daycare | `coins-50000` | $12.99 | 50,000 coins | consumable |
| New Daycare | `coins-150000` (Mega Vault) | $29.99 | 150,000 coins | consumable |
| New Daycare | `starter-bundle` | $1.99 | 10,000 coins + 1 Land Deed + 3 game days of Flyers (consumable part) and the Golden Dog Bed (permanent part) | mixed, once per account |
| New Daycare | `golden-leash` | $4.99 | +25% on eligible earnings | permanent boost |
| New Daycare | `grooming-pro` | $2.99 | baths and exit baths pay ×2 | permanent boost |
| New Daycare | `night-shift` | $2.99 | +2 staff slots (6 → 8) | permanent boost |
| New Daycare | `big-welcome-back` | $1.99 | welcome-back bonus ×3 | permanent boost |
| New Daycare | `land-deed` | $1.99 | one free next land lot | consumable |
| New Daycare | `celebrity-visit` | $0.99 | arrivals ×2 for the next 3 game days | consumable |
| New Daycare | `vip-spa-suite` | $3.99 | VIP Spa Suite boarding bed: boarders in it pay ×1.5 | permanent item |
| New Daycare | `celebrity-splash-park` | $4.99 | Celebrity Splash Park (outdoor): Fun 10/15/20, Appeal 6/8/10 | permanent item |
| New Daycare | `royal-agility` | $2.99 | Royal Agility Course (playroom): Fun 7 | permanent item |
| New Daycare | `theme-beach` | $2.99 | Beach Bash floors, walls and decor | looks |
| New Daycare | `theme-winter` | $2.99 | Winter Wonderland floors, walls and decor | looks |
| New Daycare | `deluxe-daycare-decor` (exists) | $6.99 | Cloud Bed, Lighthouse Fort and decor | looks (C1) |
| New Daycare | `vip-pass` | $4.99/month | +50% eligible earnings while paid, and 5,000 coins per eligible week | subscription |
| Recess Rush | `shield-starts-5` | $0.99 | 5 Shield Starts | consumable |
| Recess Rush | `extra-lives-5` | $0.99 | 5 Extra Lives | consumable |
| Recess Rush | `power-pack` | $2.99 | 10 Shield Starts + 10 Extra Lives | consumable |
| Recess Rush | `runner-looks` | $1.99 | Rainbow Trail + Rocket Cape | looks |
| Today's Daycare | `blue-ribbon-style` (exists) | $2.99 | Blue Ribbon Collar, Navy Star Bandana, Sparkle Trail | looks |
| Graduation Day | unchanged | — | Treat packs, Starter Pack, Pup Pass | its own server |

### Earned twins (correction 4)

Each functional permanent purchase has a free twin earned by play. A purchase gives the same function **now**, plus
any exclusive look. Owning both the purchase and the twin never doubles the effect: each function counts once.

| Purchase | Free twin (how it's earned) | Same function | Exclusive to the purchase |
|---|---|---|---|
| Golden Leash (+25%) | **Top Daycare**: reach level 20 | +25% eligible earnings | gold leash badge |
| Grooming Pro (baths ×2) | **Master Groomer** trophy: 300 baths given | baths and exit baths ×2 | — |
| Night Shift (+2 staff) | **Staff Wing**: reach level 15 | +2 staff slots | — |
| Big Welcome Back (×3) | **Loyal Regulars**: reach level 10 | welcome-back ×3 | — |
| Golden Dog Bed (Starter) | **Deluxe Dog Bed** (exists; free, level 5) | the Golden Dog Bed gets exactly the Deluxe Dog Bed's function (1 spot, Fun 2) | gold look |
| VIP Spa Suite | **Spa Suite**: level 12, 1,200 coins | boarders pay ×1.5 | VIP look |
| Celebrity Splash Park | **Grand Splash Park**: level 10, 2,000 coins | Fun 10/15/20, Appeal 6/8/10 | celebrity look |
| Royal Agility Course | **Pro Agility Course**: level 8, 600 coins | Fun 7 | royal look |

The VIP Pass's +50% and weekly coins are a subscription perk with no twin. Consumables (coins, deeds, Celebrity
Visit, power-ups) only speed up what play already gives:
- coins are earned by playing;
- every lot can be bought with coins;
- campaigns raise arrivals;
- shield balls appear in every run.

## Buying inside a game

- **New Daycare:** a **Daycare Shop** button (and a tap on the coin counter) opens the in-game shop:
  - Tabs: Coins (packs, Mega Vault, Starter Bundle while available), Boosts, Items & themes, VIP Pass.
  - The "not enough coins" message offers "Get coins".
  - Locked paid items in the build catalog open their buy sheet.
  - Owned boosts and earned twins show as active.
- **Recess Rush:** the start screen shows Shield Starts and Extra Lives (count left; switch on for this run) with
  "Get more", and the runner looks with Equip or Buy.
- **Today's Daycare:** a "Pup style" button opens the Blue Ribbon pieces with Equip (owned) or Buy.
- **Buy sheet** (one shared component):
  - Shows the item, what it gives, the price, and "Real money — charged by Stripe to your card."
  - VIP Pass: "**$4.99/month, automatically renews until cancelled.** Cancel any time in Manage VIP Pass; benefits last
    until the end of the paid month."
  - Signed out: the player signs in first (hub account).
  - Stripe Checkout opens in the same tab and returns to the same game page:
    - after paying: "+8,000 coins added" (or the item);
    - after backing out: "Checkout cancelled — nothing was charged."
- **The hub Shop tab** lists everything, grouped by game.

## Delivery: reserve, apply, confirm (correction 1)

Applies to every consumable, the consumable part of the Starter Bundle, and VIP weekly coins.

- **Installation id:** each browser install of the hub has a random installation id (`pawtastic-install-v1`, created
  once, never sent anywhere but our server).
- **Delivery rows:** every paid consumable and every earned VIP week creates a row in `deliveries`. Columns:
  - `id`, `mode`, `user_id`, `game`;
  - `source` (purchase or VIP week) and `contents` (e.g. `{coins: 8000}`);
  - `status`: `ready` → `reserved` → `delivered`, or `void`;
  - `reserved_by` (installation) and `reserved_at`, `delivered_at`.
- **Reserve:**
  - The game calls `reserve_deliveries(user, installation, game)`.
  - Under a per-user advisory lock, every `ready` row of that user and game becomes `reserved` for this installation.
  - The call returns every row reserved for this installation and not yet delivered, including older ones (the retry
    path).
  - Rows reserved by another installation are never returned and never re-reserved automatically.
- **Apply:**
  - The game takes a cross-tab lock (Web Locks `pawtastic-delivery-<game>`).
  - Inside it, the game re-reads the **latest save from storage** and adds each reserved delivery whose id is not yet in
    the save's `deliveries.applied`.
  - It writes the new balance **and** the delivery ids in **one** storage write.
  - Then it replaces the in-memory game state with that save.
- **Confirm:**
  - The game calls `ack_deliveries(user, installation, ids)`, which sets `delivered` only where the row is reserved for
    this installation.
  - If the confirm fails, the next reserve returns the same rows, the saved ids stop a second add, and the game confirms
    again.
- **Tabs and stale writes:**
  - Each game's save writer refuses to overwrite a stored save whose `deliveries.applied` contains ids its in-memory
    state lacks. It adopts the stored save instead, so an older tab can't erase a delivery.
  - Two tabs share one installation id. The lock plus the applied-ids check makes them deliver once.
- **Crashes:**
  - A crash before the write: the next reserve returns the rows again.
  - A crash after the write: the ids are saved, so nothing is added twice, and the confirm is retried.
- **Lost saves:**
  - A delivered consumable can't be recovered automatically if the local save is lost (cleared storage, new phone).
  - A row reserved by a lost installation stays reserved; support can release it by hand after checking.
  - We don't promise automatic recovery of consumables.
  - Permanent purchases (boosts, items, looks, the Golden Dog Bed) are entitlements on the account and restore
    everywhere.

## VIP Daycare Pass rules (correction 2)

- **Checkout:** Stripe Checkout in subscription mode (monthly, $4.99), tagged `game=pawtastic-games-hub`.
- **No duplicate subscriptions:**
  - A new VIP checkout is refused if the account already has a subscription that isn't ended (`active`, `trialing`,
    `past_due`, `incomplete`, `unpaid`) or an open VIP checkout. This is decided under a per-user advisory lock with a
    reservation row, and the checkout expires in 30 minutes.
  - Safety net: if a second subscription still becomes active, the webhook cancels it at once and refunds its invoice.
    It never grants anything.
- **Paid periods:**
  - Benefits come only from **verified paid billing periods**: `invoice.paid` with `amount_paid` > 0 for our VIP
    subscription.
  - Each is stored in `vip_periods` with its invoice id (unique), `period_start` and `period_end` (from the invoice line).
- **VIP is active** while `period_start ≤ now < period_end` for a period not refunded. The game receives `vip_until` from
  the server and applies +50% only while its clock is before `vip_until`, refreshing when it can. Offline past
  `vip_until`, the boost stops.
- **Weekly coins:**
  - Weeks are Monday 00:00 → next Monday 00:00 **America/New_York** (the engine's `weekKey`).
  - A week is **eligible** if any non-refunded paid period covers any moment of it.
  - **First partial week:** the signup week is eligible, granted when the first invoice is paid.
  - **Later weeks:** granted at **Monday 00:00 New York**.
  - Grants are created when the server first sees the week due: on the next reserve call or the next webhook.
  - One delivery row per (account, week), unique, so renewals, resubscriptions and duplicate events never grant a week
    twice.
- **Failed renewal:**
  - `invoice.payment_failed` adds no period. Benefits end at the last paid `period_end`.
  - If Stripe's retry later succeeds, that invoice's period counts from then on, and any of its weeks not yet granted
    become eligible.
- **Cancellation:**
  - Done in Stripe's billing portal ("Manage VIP Pass"). It stops renewal and changes nothing else: benefits and
    eligible weeks continue to the paid-through date.
  - An immediate cancellation by Stripe also keeps the paid period, unless that period is refunded.
  - **Earned, unclaimed weekly coins stay collectible after cancellation.**
- **Resubscribing:** allowed once the previous subscription has ended. New paid periods grant new weeks; weeks already
  granted stay granted once.
- **Refund of a VIP invoice:**
  - The period is marked refunded and its +50% stops at once.
  - Its weekly grants are voided if not yet delivered. Delivered ones are reversed (see Refunds).
  - Partial refunds are acknowledged only.

## How boosts combine (correction 3)

- **Eligible gameplay earnings:** money from serving pups. That is daycare checkout pay, boarding pay, bath pay,
  exit-bath pay and tips.
- **Never multiplied:**
  - purchased coins and VIP weekly coins;
  - level-up rewards, trophies and weekly-challenge rewards;
  - the welcome-back bonus;
  - refunds and reversals;
  - Recess Rush transfers, and any other transfer.
- **Order of calculation**, for one payment:
  1. the engine's base pay for that service (price, satisfaction, tip rules as today);
  2. service multiplier:
     - baths and exit baths ×2 with Grooming Pro or Master Groomer;
     - boarding ×1.5 for a boarder in a VIP Spa Suite or Spa Suite bed;
     - otherwise ×1;
  3. global multiplier `G = 1 + 0.25·[Golden Leash or Top Daycare] + 0.50·[VIP active]`, added, never multiplied: 1.00,
     1.25, 1.50 or 1.75;
  4. result = `round(base × service × G)`, to the nearest coin, halves up.
- **Examples (tested):**
  - Bath 25, Grooming Pro + Golden Leash + VIP: 25 × 2 × 1.75 = 87.5 → **88**.
  - Bath 25, Grooming Pro only: 25 × 2 × 1 = **50**.
  - Boarding 90 in a VIP Spa Suite, Golden Leash: 90 × 1.5 × 1.25 = 168.75 → **169**.
  - Boarding 90 in a regular bed, VIP: 90 × 1 × 1.5 = **135**.
  - Daycare 40, nothing: **40**. Daycare 40, Golden Leash + VIP: 40 × 1.75 = **70**.
  - Tip 5, Golden Leash + VIP: 5 × 1.75 = 8.75 → **9**.
  - A 8,000-coin pack while VIP is active: **8,000**, never 12,000.
- **Welcome-back bonus:**
  - Calculated separately, never by G.
  - `away` = seconds since the save's `lastSeen`. Bonus = 0 if `away` ≤ 300.
  - Otherwise `min(cap, floor(away/60) × 2)`, with cap 150, or `min(450, floor(away/60) × 6)` with Big Welcome Back or
    Loyal Regulars (×3; counted once).
  - It is granted inside the same storage write that sets `lastSeen = now`, after re-reading the latest save. A second
    tab or reload sees a recent `lastSeen` and gets 0.
  - Device clock jumps: `away` is capped by the bonus cap; a backward clock gives 0.

## Starter Bundle (correction 5)

- **Mixed purchase:**
  - The webhook creates one delivery row: 10,000 coins + 1 Land Deed + 3 game days of Flyers, delivered once by the
    reserve/apply/confirm path.
  - In the same transaction it grants the permanent entitlement `golden-dog-bed`, which restores on every device.
- **Once per account:**
  - Under a per-user advisory lock, a new Starter checkout is refused if the account has a Starter purchase that is
    paid or refunded, or a Starter checkout still open.
  - Every Starter checkout records a reservation row before Stripe is called and expires in 30 minutes.
  - **Expired** (`checkout.session.expired`) or **definitively unpaid** (`checkout.session.async_payment_failed`)
    releases the reservation, and another attempt is allowed.
  - Before refusing, the server asks Stripe for the open session's status, and releases it if Stripe says expired.
- **Recovery:** if the game is lost after delivery, the Golden Dog Bed restores (entitlement); the consumable part
  doesn't (see Delivery).

## Refunds, including things in use (correction 6)

Full refunds only; partial refunds are acknowledged and change nothing. No refund ever deletes a dog, removes unrelated
progress, or leaves a dog in an unsafe place.

| Refunded | Not yet delivered | Already delivered or in use |
|---|---|---|
| Coins (any pack, Starter coins, VIP week) | voided | reversal: subtract from the current balance, never below 0 (no debt) |
| Land Deed | voided | unused deed: removed. Used deed: the lot **stays** (buildings on it are kept); the lot's coin price is taken back from the balance, never below 0 |
| Celebrity Visit | voided | ends at once: no more boosted arrivals. Pups already here stay and are served normally |
| Flyers (Starter) | voided | the campaign ends at once; arrivals already made stay |
| Shield Starts / Extra Lives | voided | unused ones removed, never below 0; used ones not reversed |
| Boosts (Golden Leash, Grooming Pro, Big Welcome Back) | — | stop applying from now. Past earnings kept. An earned twin still applies |
| Night Shift | — | no one is fired. Staff above the limit stay, but nobody can be hired until the team is under the limit (an earned Staff Wing keeps the slots) |
| Golden Dog Bed, Royal Agility, Celebrity Splash Park | — | if the player has unlocked the item's earned twin, the placed item keeps working as that twin. Otherwise it stays placed but works only as decor (existing "Pack no longer active" rule). Dogs on a bed that stops working move to free spots in the same room, then the calm room, then the lobby (`normalisePlaces`), never deleted |
| VIP Spa Suite (occupied) | — | with the Spa Suite twin unlocked it keeps working as a Spa Suite. Otherwise current boarders stay in it **as a regular boarding bed** (no ×1.5) until they check out; then it works only as decor. Nobody is moved overnight |
| Themes and looks | — | switch back to the default look |
| VIP invoice | — | see VIP rules |

- **Reversals:**
  - A reversal is a delivery row (`contents` negative, `source` = the refunded delivery).
  - It goes to the installation that holds the original delivery, through the same reserve/apply/confirm path.
  - If the original was never applied there, both are recorded as void and nothing changes.
- **Entitlements:** refunding a permanent purchase sets `revoked_at`, as today.

## Protecting play (correction 7)

- **Arrivals:** extra arrivals (Celebrity Visit, Flyers, campaigns) only raise the arrival chance. Each arrival still
  passes `createArrival`'s checks:
  - the daycare is open and the lobby is within its hours;
  - the lobby has a waiting spot (otherwise no arrival);
  - the stacked boost is capped at ×2.5;
  - room capacity, staffing and dog compatibility are still enforced at assignment.
- **Team scores can't be bought:**
  - The new Daycare awards no team points; this stays.
  - Today's Daycare sells only looks.
  - **Recess Rush team points become a flat 5 per finished run** instead of score-based, so power-ups can't raise them.
  - **Graduation Day gives a flat 6 team points on a day with at least one new level cleared** instead of 2 per level,
    so bought moves can't raise them.
  - Capacity, earnings and coins never convert to team points. The daily team cap (60) stays.
- **Gate before the Daycare Shop (start of phase 2):**
  - check-in, room assignment, building, saving and returning to the game are re-verified in the browser with paid
    effects off and on (the boosts must not change those flows);
  - the e2e-tycoon suite is green.

## Server and data

- **Catalog:** one catalog (`src/lib/catalog.ts`) with every product's game, kind, price and contents. Prices come only
  from it. The item name is `PAWtastic Games · <name>`, with metadata `game=pawtastic-games-hub` and `product_id`.
- **Checkout:**
  - Takes a catalog product id; signed-in players only.
  - Success and cancel addresses return to the product's game page (`/daycare-next`, `/recess`, `/daycare`, `/shop`)
    with `?checkout=returned|cancelled`.
  - Permanent purchases already owned can't be bought again.
- **Webhook:**
  - Signed, mode-checked, atomic and idempotent per event.
  - Grants entitlements; creates delivery rows; records `vip_periods` and subscription state; handles expiries, failed
    payments and refunds as above.
- **Mode:**
  - `PAYMENT_MODE = "live"` in the production build.
  - Only live keys, live events and `cs_live_` sessions count.
  - Every payment table has a `mode` column, and every read filters by it.
  - Existing test-mode rows are retired at go-live and never shown.
- **Saves:**
  - The new Daycare save gains `deliveries.applied`, `deeds`, and `celebrity` (active visit days).
  - The hub save gains Recess power-up counts and `deliveries.applied`.
  - Both are validated on load like the rest of the save; the applied-ids list is bounded and keeps only ids.

## Graduation Day

- Treat packs, Starter Pack, Pup Pass and in-game spending stay as they are.
- **The $100-a-month limit is removed:**
  - The server's reservation function stops checking it (new Graduation migration).
  - In the game, the default becomes no limit, and a player can still set a limit for themselves, which the game keeps
    to.
- Team points for Graduation in the hub change as described in "Protecting play".

## Testing (correction 8)

- **Automated (every commit):**
  - unit tests and SQL tests on PGlite through the real webhook route with signed event fixtures shaped like Stripe's
    (`2026-01-28.clover`);
  - a local Stripe stand-in for browser checks.
- **Covered:**
  - catalog and prices;
  - live-only keys, events and sessions;
  - checkout return addresses;
  - delivery: two installations racing, two tabs, retry after a failed confirm, crash before and after the write,
    stale-tab write refused;
  - Starter once, expiry and failed payment allow a retry, simultaneous Starter checkouts;
  - mixed delivery and Golden Dog Bed restore;
  - boost combinations (all examples above) and the welcome-back cases;
  - refunds of each kind, including used deeds, active visits, placed and occupied items, extra staff;
  - VIP: signup, first partial week, Monday grants, renewal, failed payment and later success, cancellation (benefits
    to the paid-through date, unclaimed weeks still collectible), resubscription, duplicate subscription attempts
    (refused, and the safety net), refund of a period, duplicate events;
  - arrivals within hours, lobby space and caps;
  - team points flat;
  - Graduation without the cap.
- **Isolated Stripe test infrastructure:**
  - The same server code runs in **test mode only inside the test harness**, never in the production build.
  - It runs with a separate local database, against Stripe's **test mode** on the games account:
    - real Checkout Sessions;
    - subscriptions on **test clocks** (renewal, failed card `4000 0000 0000 0341`, cancellation, refund);
    - events fetched from Stripe and passed through the real webhook handler.
  - Needs the owner to allow `api.stripe.com` in this cloud environment and to add a test-mode restricted key as
    `STRIPE_TEST_SECRET_KEY`.
  - Until then, these runs are reported as not done; they are never replaced with made-up results.
- **Production:** live-only, test data excluded.

## Build order and milestones

1. **Phase 1, backbone and first items:**
   - live mode;
   - mode columns and retiring test data;
   - catalog, buy sheet and checkout back to the game;
   - delivery (reserve, apply, confirm) and reversals;
   - coin packs including Mega Vault;
   - Recess Rush power-ups and looks, with flat team points;
   - today's Daycare Blue Ribbon in place;
   - Graduation without the $100 cap, with flat team points.
   - Report.
2. **Phase 2, the Daycare Shop:**
   - gate (gameplay re-verified), then the Starter Bundle (mixed, once);
   - boosts with earned twins;
   - Land Deed, Celebrity Visit;
   - premium items with earned twins, themes;
   - refunds of things in use.
   - Report.
3. **Phase 3, VIP Daycare Pass:**
   - subscriptions, paid periods, weekly coins, billing portal;
   - duplicate protection, refunds.
   - Report.
4. **Milestone, live payment verification** (separate):
   - the owner adds the live key and webhook secret, and the subscription events;
   - Claude publishes;
   - a real purchase of each kind is made and its delivery checked (coins arrive once; an entitlement restores; VIP
     shows paid-through date and a week's coins).

## Go-live (owner steps)

1. In Stripe (games account, **live** mode), add a webhook endpoint at
   `https://paw-sitive-playhouse-rush.lovable.app/api/public/payments/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`

   Allow cancellation in the customer portal settings.
2. In Lovable → Project Settings → Secrets, set `STRIPE_SECRET_KEY` (live) and `PAYMENT_WEBHOOK_SECRET` (that
   endpoint's signing secret). Never in chat.
3. Until then, the hub's buy buttons stay locked and nothing can be charged.

## Not in this build

- Server-held coin balances.
- Automatic recovery of consumables after a lost local save.
- Delivery of one consumable to several devices.
- A spending limit in the hub games.
- Coin packs in today's Daycare.
- New Graduation Day items.
