# In-game purchases in the PAWtastic Games hub — design

Date: 2 Nov 2026. Status: approved in conversation by the owner; this spec awaits his review.

## Goal

Players can buy things **inside each game**, with real money, so the games earn money. Every game sells something
different. Graduation Day already has its own live in-game Shop and keeps it.

## Owner decisions (2 Nov)

- "Every game should have something different… tycoon should be selling things like coins or money to get you ahead."
- Coin packs in the **new Daycare** only (it becomes the main daycare). Today's Daycare sells its pup looks in place.
- Recess Rush sells **power-ups and runner looks**.
- **No spending limit** in the hub games. Graduation Day: shop unchanged, but its $100-a-month limit is removed.
- Delivery: **once, to the device** (Graduation Day's proven way), not server-held balances.
- **Real payments** once built and tested, on the games Stripe account (Pawtastic Academy II LLC,
  `acct_1UWfxx58XGeAL8Pr`). The owner adds the live key and live webhook secret himself in Lovable Secrets.
- Prices and items as listed below ("Yes, write it up").
- Then: "for the daycare tycoon game should give more things to buy, I want that game to be explosive too". He chose
  all four extra groups for the new Daycare: Mega Vault + Starter Bundle, Boosts, Premium items + themes, VIP Daycare
  Pass.

## Rules that still apply (owner's standing rules)

- Core gameplay stays free; nothing paid keeps dogs safe; no paid random rewards (no mystery boxes); no limited-time offers or countdowns; no penalty
  for missing a day.
- Nothing is unlocked from the browser or a return address alone: only after Stripe's signed confirmation reaches
  the server.
- Game coins are virtual. They never become cash, discounts or daycare credit, and are separate from the customer app.
- Team points come only from playing (capped daily), so buying never changes Team Hawthorne vs Team Hillsdale.
  Recess Rush's daycare coins stay capped (120 a run, 300 a day).
- Ruling C1 still holds for the Deluxe Daycare Decor pack and the theme packs (looks only). Coin packs, boosts,
  premium items, the VIP Pass and Recess power-ups do help progress, as the owner asked. Everything stays earnable or
  playable for free; nothing is needed to keep dogs safe.

## What each game sells

| Game | Item (id) | Price | Gives | Kind |
|---|---|---|---|---|
| New Daycare | `coins-2500` | $0.99 | 2,500 daycare coins | bundle |
| New Daycare | `coins-8000` | $2.99 | 8,000 daycare coins | bundle |
| New Daycare | `coins-20000` | $5.99 | 20,000 daycare coins | bundle |
| New Daycare | `coins-50000` | $12.99 | 50,000 daycare coins | bundle |
| New Daycare | `coins-150000` (Mega Vault) | $29.99 | 150,000 daycare coins | bundle |
| New Daycare | `starter-bundle` | $1.99 | 10,000 coins, 1 Land Deed, 3 days of Flyers, and the Golden Dog Bed | once per player |
| New Daycare | `golden-leash` | $4.99 | +25% on everything the daycare earns, forever | pack (boost) |
| New Daycare | `grooming-pro` | $2.99 | baths and exit baths pay double, forever | pack (boost) |
| New Daycare | `night-shift` | $2.99 | 2 extra staff slots, forever | pack (boost) |
| New Daycare | `big-welcome-back` | $1.99 | the welcome-back bonus is 3× (cap 3×), forever | pack (boost) |
| New Daycare | `land-deed` | $1.99 | unlocks the next land lot for free (one per purchase) | bundle |
| New Daycare | `celebrity-visit` | $0.99 | double customers for the next 3 game days | bundle |
| New Daycare | `vip-spa-suite` | $3.99 | VIP Spa Suite (boarding): boarders pay +50% | pack (item) |
| New Daycare | `celebrity-splash-park` | $4.99 | Celebrity Splash Park (outdoor): more Fun and Appeal than any free item | pack (item) |
| New Daycare | `royal-agility` | $2.99 | Royal Agility Course (playroom): more Fun than Mini Hurdles | pack (item) |
| New Daycare | `theme-beach` | $2.99 | Beach Bash floors, walls and decor (looks only) | pack |
| New Daycare | `theme-winter` | $2.99 | Winter Wonderland floors, walls and decor (looks only) | pack |
| New Daycare | `deluxe-daycare-decor` (exists) | $6.99 | Cloud Bed, Lighthouse Fort and other decor (looks only) | pack |
| New Daycare | `vip-pass` | $4.99 a month | +50% earnings and 5,000 coins for every week subscribed | subscription |
| Recess Rush | `shield-starts-5` | $0.99 | 5 Shield Starts | bundle |
| Recess Rush | `extra-lives-5` | $0.99 | 5 Extra Lives | bundle |
| Recess Rush | `power-pack` | $2.99 | 10 Shield Starts + 10 Extra Lives | bundle |
| Recess Rush | `runner-looks` | $1.99 | Rainbow Trail + Rocket Cape | pack |
| Today's Daycare | `blue-ribbon-style` (exists) | $2.99 | Blue Ribbon Collar, Navy Star Bandana, Sparkle Trail | pack |
| Graduation Day | unchanged (Treat packs, Starter Pack, Pup Pass) | — | — | its own server |

- **Pack:** owned forever on the account, restores on any device, switched off if refunded.
- **Bundle:** used up in play; delivered once to the device that collects it.
- **Once per player:** a bundle the server sells to each account only once (paid or refunded), like Graduation Day's
  Starter Pack.
- **Boost / item packs:** owned forever on the account like looks, but they change play. The game reads them from the
  server's list of what the player owns (the same fail-closed way as the Deluxe Decor pack). Boosts stack:
  Golden Leash +25% and the VIP Pass +50% add to +75%.
- **Subscription (VIP Daycare Pass):** Stripe monthly billing. Active while Stripe says the subscription is paid up.
  While active, earnings get +50%. For every week (New York, Monday start) the player was subscribed, 5,000 coins wait
  on the server until the game collects them: nothing is lost by not opening the game. The player cancels in Stripe's
  billing page, opened from the game.
- Golden Dog Bed: a dog bed with 2 spots (looks gold), from the Starter Bundle only.
- Land Deed: a free next lot (the lots stay in their order); deeds not yet used are kept in the save.
- Celebrity Visit: works like a marketing campaign (×2 arrivals) for 3 game days; it stacks with a running campaign
  up to ×2.5.
- Premium items and theme packs need new 3D models and materials; theme packs change only colours and decor models.
- **Shield Start:** the run begins with a shield (as if a shield ball had been picked up).
- **Extra Life:** the run begins with 4 lives instead of 3.
- Before a run, the player may switch on a Shield Start and/or an Extra Life; each one switched on is used when the
  run starts. Nothing is used if they don't switch it on.
- Rainbow Trail and Rocket Cape are drawn on the runner pup; equipped on Recess Rush's start screen and in the Shop.

## Buying inside a game

- **New Daycare:** a **Daycare Shop** button in the game (and tapping the coin counter) opens the in-game shop with tabs:
  Coins (packs, Mega Vault, Starter Bundle while available), Boosts, Items & themes, VIP Pass. The "not enough coins"
  message offers "Get coins". Locked paid items in the build catalog open their buy sheet. Owned boosts show as active.
- **Recess Rush:** the start screen shows the power-ups (count left, switch for this run) with "Get more", and the runner
  looks with Equip or Buy.
- **Today's Daycare:** a "Pup style" button opens the Blue Ribbon pieces with Equip (owned) or Buy.
- **The buy sheet** (one shared component) shows the item, what it gives, the price, and "Real money — charged by
  Stripe to your card." Not signed in: it asks the player to sign in first (hub account). Then Stripe Checkout opens in
  the same tab and returns to the **same game page**:
  - after paying: "+8,000 coins added" (or the item);
  - after backing out: "Checkout cancelled — nothing was charged."
- The hub Shop tab lists everything too, grouped by game.

## Server and safety

- **One catalog** (`src/lib/catalog.ts`) lists every product with its game, kind, price and contents. The server
  takes the price only from it, never from the browser. The Stripe item name is `PAWtastic Games · <name>`, tagged
  `game=pawtastic-games-hub` as now.
- **Checkout** (`createCheckout`) takes a product id from the catalog. Success and cancel addresses return to that
  product's game page (`/daycare-next`, `/recess`, `/daycare`, or `/shop`), with `?checkout=returned|cancelled`.
  Only signed-in players can buy. Packs already owned can't be bought twice.
- **Webhook:**
  - grants packs into `entitlements` as now;
  - records paid bundles in a new `bundle_purchases` table: user, product, session, payment, status, `claimed_at`,
    `refund_acked_at`;
  - is atomic and idempotent per event, like `grant_entitlement`.
- **Collecting bundles:**
  1. A signed-in game asks the server for unclaimed paid bundles (and refunded ones it already collected).
  2. It adds them to its save, recording each purchase id in the save so it is never added twice.
  3. It saves, then confirms to the server, which sets `claimed_at` (or `refund_acked_at`).
  - A bundle claimed by one device is not offered to another.
  - If the confirmation fails, the next collection offers it again, and the recorded id stops a double add.
- **Refunds (full):**
  - a pack is switched off, as now;
  - an unclaimed bundle is never delivered;
  - a claimed bundle is taken back from what's left (coins, or power-ups), never below zero.
- **Mode:**
  - One explicit `PAYMENT_MODE = "live"`, as in Graduation Day.
  - Only live keys are accepted, and only Stripe events and sessions of that mode count (`cs_live_…`).
  - Test purchases made before go-live are retired: test entitlements switched off, and test bundles never offered.
- **Once per player:** the server refuses a second `starter-bundle` for the same account (paid, refunded or a
  checkout still open).
- **VIP Pass:** Stripe Checkout in subscription mode. The webhook keeps a `subscriptions` row (status, current period
  end, customer) from `customer.subscription.*` and `invoice.paid` events. The weekly coins are claimed per (account,
  week), once each, only for weeks inside a paid period. "Manage VIP Pass" opens Stripe's billing portal for that
  customer.
- **Records per game:** the purchase rows keep the product, so sales per game can be read from the database.
  Stripe's list shows the game in each item name.
- **Saves:** the new Daycare save gains its applied purchase ids. The hub's game save gains Recess power-up counts and
  applied purchase ids. Both are validated on load, like the rest of the save.

## Graduation Day

- Its Treat packs, Starter Pack, Pup Pass and in-game spending stay as they are.
- **The $100-a-month limit is removed.** The server's reservation function stops checking it (new Graduation
  migration). The game's spending-limit setting changes:
  - default: no limit;
  - a player can still choose a limit for themselves, and the game still keeps to it.

## Go-live (owner steps, after the build is tested)

1. In Stripe (games account, **live** mode), add a webhook endpoint at
   `https://paw-sitive-playhouse-rush.lovable.app/api/public/payments/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - for the VIP Pass: `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`

   In Stripe's customer portal settings, allow customers to cancel subscriptions.
2. In Lovable → Project Settings → Secrets, set:
   - `STRIPE_SECRET_KEY` to the live key;
   - `PAYMENT_WEBHOOK_SECRET` to that endpoint's signing secret.
   Never in chat.
3. Claude publishes, then the owner makes one small real purchase per kind (a coin pack, a power-up, a look) to
   confirm.

Until step 2, the hub's buy buttons stay locked and nothing can be charged.

## Testing

- Tests first for every rule:
  - catalog and prices;
  - live-mode keys, events and sessions;
  - checkout return addresses per game;
  - SQL (PGlite): grant, claim, double claim, refund before and after claim, and test purchases retired;
  - save validation;
  - power-ups at run start;
  - buy sheets;
  - Graduation without the cap.
- Browser checks for each game against a stand-in for Stripe:
  - buy, return to the same game, delivered once;
  - reload doesn't add it again;
  - cancel adds nothing;
  - signed-out players are asked to sign in.
- The full existing suites stay green.

## Build order (one plan, three phases; each phase is tested and can be published on its own)

1. **Backbone and first items:**
   - live mode;
   - catalog, buy sheet and checkout back to the game;
   - bundle collection and refunds;
   - coin packs (incl. Mega Vault);
   - Recess Rush power-ups and looks;
   - today's Daycare Blue Ribbon in place;
   - Graduation Day without the $100 cap.
2. **The Daycare Shop:** Starter Bundle (once per player), Boosts, Land Deed, Celebrity Visit, premium items and theme
   packs.
3. **VIP Daycare Pass:** monthly billing, weekly coins, billing portal.

## Not in this build

- Server-held coin balances, and delivery of the same bundle to several devices.
- A spending limit in the hub games (the owner chose none).
- Coin packs in today's Daycare.
- New Graduation Day items.
