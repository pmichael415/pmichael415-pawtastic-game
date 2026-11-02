# PAWtastic Games — status (31 October 2026)

## Where things are

| What | State |
|---|---|
| Lovable project **PAWtastic Daycare Tycoon** (preview behind Lovable login, not published) | Linked to GitHub `pmichael415/pawtastic-daycare-tycoon` (branch `main`). The new code was pushed there on 1 Nov (`bb84f32`, then `f52e504` with the current Graduation Day and its music, then `a296f4f` with per-game cloud saves; the files in `SYNC-MANIFEST.txt`). Migration 0006 applied and checked (7 recorded; players read only their own saves, no direct writes). Lovable's preview shows the new hub. Not published. |
| GitHub `pmichael415/pmichael415-pawtastic-game`, branch `claude/pawtastic-games-unified`, folder `tycoon/` | The new code. |
| Private review build (claude.ai artifact, owner-only) | Guest play of the new code. Sign-in, cloud saves and purchases are switched off there. |
| Live game database (Lovable Cloud / Supabase) | Migrations 0002–0005 applied on 1 Nov (each in its own transaction, recorded in `drizzle.__drizzle_migrations` with the file hash, so they won't run twice). Checked: 6 migrations recorded, events table private (RLS on, no anon/player access), team totals start at 0. |
| Customer app (app.pawtasticacademy.com), its database and Stripe | Not touched. |

## Update — music and sounds in Recess Rush and the new Daycare (2 Nov)

- **Owner:** "We need to add music and sounds on recess rush and tycoon."
- **Built and tested; not published** (same release decision as Stage A).
- **Music** (original, synthesized in the browser, no files):
  - "Daycare Day": relaxed, with a faster version in rush hour;
  - "Recess Run": upbeat;
  - jingles for run start, finish and a new best.
- **Daycare sounds:**
  - a doorbell at check-in, a yip when a pup arrives;
  - playtime, a bath and calm-down;
  - coins at checkout, building, selling and upgrades;
  - a soft "bonk" when something can't be done.
- **Recess Rush sounds:** lane swoosh, treat, shield pick-up and block, puddle splash, finish whistle.
- **Controls:** a mute button in both games' headers; Sound and Music switches in Settings (now in Recess Rush too).
  Audio starts after the first tap and pauses in a hidden tab.
- **Listening previews:** `node qa/audio-preview.cjs` renders them to qa/out/audio-*.wav.
- **Not verified:** how it sounds on real phone speakers, iOS silent-switch behaviour, Bluetooth delay.

## Update — new Daycare Stage A: the first 15 minutes, the world first, a 2D map without 3D (2 Nov)

- **Built and tested in this session; NOT in the Lovable hub project and NOT published.** Report:
  `docs/superpowers/2026-11-02-tycoon-stage-a-report.md`; rulings: `docs/superpowers/2026-11-02-tycoon-stage-a-rulings.md`.
- **What a new player gets:**
  - Quick start or Build from scratch, then a guided tour, one step at a time:
    - Biscuit, then a payout;
    - a Toy Bin or Play Yard, with its price and benefit shown first;
    - Daisy, who shows the benefit;
    - Rocket, a free-or-build decision;
    - next goals.
  - No shop prompts or level-up pop-ups until the tour ends.
  - The guide sits above the daycare.
  - Without 3D, a 2D map with a plain explanation.
  - A home page card for the new Daycare.
  - Tour measurement, with its own build label (`2026-11-02.tycoon-stage-a`); read-only queries in
    `tycoon/docs/tycoon-tour-measurement.sql`.
- **Tests:**
  - unit 690/690; typecheck clean; build OK;
  - new onboarding browser checks 100/100 (iPhone 13 and desktop; 3D and no WebGL);
  - every existing browser suite passes when run on its own.
- **Not verified:** real phones, real 3D hardware, the published site, real players. No Stage A player data exists
  yet.
- **Next:** Stage B (activities, dog likes, staff roles), plan `docs/superpowers/plans/2026-11-02-tycoon-stage-b.md`.

## Update — emails on brand (2 Nov)

- Owner: "The emails need to be within brand." Every Graduation Day email (Weekly Challenge prize, sign-in code,
  password reset, invite, email change, verification code, owner alert, weekly winners summary) now has the PAWtastic
  Academy logo tile, a gold rule, DM Sans, the brand blue and reward gold, and one footer (PAWtastic Academy ·
  Hawthorne & Hillsdale, NJ · pawtasticacademy.com). Prize terms unchanged word for word. Graduation 9f82fc2,
  published 2 Nov; tests 143/143. The logo is served at
  https://pawtastic-graduation.lovable.app/email/pawtastic-academy-logo.png (not checked from this session, which
  can't reach lovable.app).
- The hub's weekly email (still off) uses the same look. The hub's own sign-in and password-reset emails are still
  the platform's default design: branding them needs custom account emails set up for the hub project.

## Update — in-game purchases, phase 1 built and tested; NOT live yet (2 Nov)

- **What's built (plan `docs/superpowers/plans/2026-11-02-in-game-purchases.md`, spec rev 3):** the new Daycare's
  coin packs (2,500 / 8,000 / 20,000 / 50,000 / Mega Vault 150,000) and Deluxe Daycare Decor; Recess Rush's
  power-ups (5 Shield Starts, 5 Extra Lives, Power Pack) and Runner Looks; Blue Ribbon Style from "Pup style" in
  today's Daycare; the Shop tab grouped by game. Live-only payment mode; test-mode data never counts.
- **Delivery across devices (owner's correction 1):** each coin or power-up purchase is reserved on the server for
  one account and one installation before it is added; the game writes the balance and the purchase id in one save
  write under a lock, then confirms. Tabs, retries, crashes and failed confirmations can't add it twice; another
  phone gets nothing; a refund takes it back once. Cloud saves never carry bought items.
- **Team scores:** flat points per run/day, so purchases can't raise them. **Graduation Day:** no monthly spending
  limit by default (a player can still choose $5–$100) — published 2 Nov with its database update 0009 applied
  (owner's go-ahead), together with the branded emails below.
- **Tests:** unit 614/614; Graduation Day node 30/30; browser: purchases 29/29 (against development-only Stripe and
  database stand-ins), hub 37, games 35, daycare 36, teams 27, cloud 25, notify 20, Graduation in the hub 35,
  tycoon 30/31 (the known frame-rate check in this container).
- **Bugs found and fixed while testing:** backing out of a game checkout and buying the same pack from the Shop within
  a minute failed ("Checkout could not be started" — Stripe's repeat-request key); tapping a pup in today's Daycare 3D
  view on a phone also pressed "Move to recovery room" in the sheet it opened; the Shop, Recess and today's Daycare
  no longer load the new Daycare's engine at start-up.
- **Not done yet:** Stripe test-mode harness (`qa/stripe-test`) is written but SKIPPED here — it needs a test-mode key
  as `STRIPE_TEST_SECRET_KEY` and network access to Stripe. Migration 0009 is not applied to the Daycare database and
  the code is not synced to the Lovable project: both wait for the owner's go-ahead to publish (a Publish before
  0009 would break checkout). Live payment verification is a separate milestone.

## Update — new Daycare preview, and Graduation Day's Weekly Challenge, leaderboard and Shop in the hub (2 Nov)

- **New Daycare (preview) at `/daycare-next`:** the build-your-own daycare (rooms, grounds, business, levels,
  trophies, weekly challenge, Deluxe Daycare Decor pack with no gameplay advantage). Plan:
  `docs/superpowers/plans/2026-11-01-daycare-tycoon-stage1.md`; rulings and deferred minors are in that plan's
  ledger summary. Today's Daycare stays the default; the home page links to the preview.
- **Migration 0008 applied** to the Daycare database on 2 Nov (one transaction, recorded with the file hash):
  9 migrations recorded; `game_events` accepts the `tycoon_*` events and `graduation_weekly_open`.
- **Graduation Day in the hub now uses Graduation Day's own server** for the Weekly Challenge (scores replayed
  there), leaderboard, sign-in (its own email code, separate from the hub's sign-in) and Shop. **The Shop is
  Graduation Day's live Stripe store: real purchases** on the games account. Checkout opens in the whole tab and
  returns to the hub's `/graduation`. Server side: `pmichael415/pawtastic-graduation` ecff9ec (allows only the hub's
  three addresses; staff routes and the webhook stay closed). See `docs/graduation-hub/README.md`. If the hub can't
  reach that server, the copy falls back to free play with a link to Graduation Day's site.
- The home page's Weekly Challenge card now opens the hub's Graduation Day page. The Shop and "So close!" (out of
  moves) purchases work inside the hub: Stripe opens in the whole tab and the player comes back to the same level.
- Browser checks: daycare 36, games 35, hub 33, notify 20, teams 27, cloud 25, Graduation in the hub 35 (against a
  stand-in for Graduation Day's server). Tycoon 30/31: the 30-dog frame-rate check measured 28–30 fps in this
  container's software renderer (30.4–32.5 before the container restarted, same code); real phones use their GPU.
- Not verified here: this session can't reach the lovable.app sites, so the live hub ↔ Graduation Day connection
  and a real purchase from the hub haven't been tried. The owner makes the first real purchase.

## Update — Graduation Day look, and Visit / book / get the app (1 Nov)

- **Same look as Graduation Day:** warm off-white page, white cards with a thin line and soft shadow, brand blue
  #0068D6, warm dark text, gold for rewards, 12px corners, and the same DM Sans font files (bundled, no Google
  Fonts). Flat header and bottom bar; home page game cards with small uppercase labels. Game rules, wording,
  saves and payments unchanged.
- **Visit PAWtastic:** each location (your team's first) has Book free evaluation (the verified forms) and
  Directions (Google Maps search for the address); a "Get the PAWtastic app" card links to
  https://app.pawtasticacademy.com with an Add to Home Screen tip. The home page has Visit us · Book an eval ·
  Get the app. Plain links only — nothing is shared with the customer app. Clicks are measured as clicks
  (`app_click`, `directions_click`, added to migration 0002, which has not been applied anywhere yet).

Tests: 150 unit/integration; iPhone-size browser suites hub 31/31, daycare 36/36, games 32/32, teams 27/27
(two old test timing assumptions fixed: a second customer can arrive between double taps; the team box closes
with a 0.2 s animation). Production build OK.

## Update — both PAWtastic Academy logos (1 Nov)

- The owner's two logos are in the app, unaltered apart from trimming empty white margin (originals kept in
  `/brand` at the repo root): the sitting dog in a grad cap on the home page and the loading screen, and the
  dog's head in a grad cap ("Hillsdale and Hawthorne, NJ") on the Visit page. The small blue logo stays in each
  header. Directions now search "…, NJ" (the logo confirms the state). Note: both logos say
  "Daycare · Boarding · Grooming"; the game's own text keeps to daycare, boarding, baths and exit baths.

## Update — notifications and ad prep (in progress, 1 Nov)

Plan: `docs/superpowers/plans/2026-11-01-notifications-and-ad-prep.md` (spec approved by the owner).
- Ad prep: campaign tags (utm_*) and first touch are recorded on sessions and booking/app/directions clicks.
- New `/privacy` page (linked from Settings, Account and Visit), link previews (og-image) and an installable hub
  (manifest + icons). **Owner review needed:** the privacy page text must be OK'd before this is published.
- Phone notifications: opt-in "Notify me" card after a good moment (end of a Daycare day, end of a Recess Rush run),
  Settings switch, iPhone Add to Home Screen steps, background script (`public/sw.js`), encrypted Web Push signed with
  server-created keys, and a sender run every 15 minutes by the database scheduler. Only owner-approved messages; at most
  2 per person per week; nothing 8 pm–9 am New York time; never the same message twice. See AGENTS.md "Sending a
  notification".
- Email updates (18+, unsubscribe link without sign-in, business address in the footer) are built but **off** until the
  owner's gates: Lovable confirms opt-in update emails are allowed, the footer mailing address, and email set up for the hub.
- Final review (fresh reviewer): no critical issues; the important ones were fixed with tests (sender claims 20 at a
  time within a request budget, approved text locked, test messages outside the weekly limit, unsubscribe confirms only
  when saved, notification taps use the hub's own tab, subscriptions re-sent on app start, Instagram/Facebook iPhone
  visitors told to open Safari first). Unit 295/295; browser checks: notifications 20, hub 33, teams 27, daycare 36,
  cloud 25.
- **Released to the Daycare project (630d5d5, not yet published).** Migration 0007 applied and recorded on the Daycare
  database (8 migrations; tables locked to the service role, verified). Next: owner OKs the privacy text and publishes;
  then the scheduler SQL; then a test message to the owner's phone only, after his yes.

## Update — a refused test checkout now says why (1 Nov)

- The owner's first hub test purchase showed "Checkout could not be started": the settings and account check passed,
  but Stripe refused to create the checkout page and the reason was thrown away. The Shop now shows Stripe's error
  code and message (anything shaped like a key is masked), the server logs it, and it is recorded as a `client_error`
  event (`where: "/shop checkout"`) so it can be read from `game_events`. Hub payments stay test-mode only.
- The recorded reason: Stripe's newer API rejects `payment_method_types` (req_RTRzSqNxvfC6IQ, HTTP 400). The hub sent
  no API version, so it got the account's newer default; Graduation Day pins `2026-01-28.clover` and works live. Every hub
  Stripe call now pins that same version, so both games behave alike. At the owner's request the hub also stops
  sending `payment_method_types` (current API): payment methods come from the Dashboard settings, and delayed methods
  are safe because the webhook grants only once `payment_status` is "paid". Test-only, account check and webhook
  verification unchanged.
- **First test purchase verified end to end (1 Nov, 17:00 UTC, test mode):** checkout `cs_test_a1op…` for the Blue Ribbon
  Style Pack ($2.99) was created and paid; the signed webhook (`evt_1UX28q…`) granted the pack 90 s later; the Shop shows
  "Owned on your account (server-verified)" and Restore says "Restored 1 pack(s)". This ran on the pinned-version build
  (c8c125b). **Confirmed on the published build without `payment_method_types` (1e876a7):** Deluxe Daycare Decor
  ($6.99, `cs_test_a1EaG3…`, 17:09 UTC) paid; webhook `evt_1UX2I4…` returned 200 "granted" 2 min later; both packs are
  active on the same account; Restore says "Restored 2 pack(s)". Hub payments remain test-mode only.
  Still untested: a refund (revokes the pack) and cloud saves (none of the signed-in sessions has played a game yet).

## Update — Weekly Challenge prizes change every week, with the owner's approval (1 Nov)

- Graduation Day's Weekly Challenge (its own site) now awards each week's **approved lineup** (`game_week_prizes`,
  migration 0008 on the Graduation project, applied and recorded together with the already-applied 0007). A draft is
  never shown or awarded; without an approved lineup the standard prizes apply. The game, emails and staff page show
  each prize in its own words. Week of 2 Nov approved by the owner: 1st two free days of daycare, 2nd two free baths,
  3rd a free bath (top 3 at each location).
- A scheduled task runs every Thursday 2:37 pm New York time in this conversation: it drafts the next week's lineup
  (daycare, boarding, baths and exit baths only) and asks the owner before approving.
- Pushed to the Graduation project's repo (`9dddec9`); goes live when the owner publishes it.
- **Next (planned, not built):** real prizes in the hub need server-checked scores (e.g. a weekly Recess Rush run the
  server replays), plus a hub leaderboard and redemption.

## Update — every game on the same Stripe account (1 Nov)

- The owner chose one Stripe account for all games: the games account Graduation Day already uses (Pawtastic Academy
  II LLC, `acct_1UWfxx58XGeAL8Pr`). Graduation Day's server already ignores sales that aren't tagged
  `game=pawtastic-graduation`, so it needs no change.
- Hub checkouts are now tagged `game=pawtastic-games-hub` on the checkout and the payment, and named
  "PAWtastic Games · Blue Ribbon Style Pack" / "… Deluxe Daycare Decor". The hub's webhook acknowledges and ignores
  other games' notifications and live-mode notices (it stays test-only) instead of returning errors that Stripe would
  retry for days. Tests: 177 (incl. Graduation Day sales, untagged checkouts, other games' expiries and refunds).
- Still locked until the owner adds the games account's **test** key, webhook secret, address and account id in
  Lovable Secrets and publishes (see `SYNC-TO-LOVABLE.md`). Live hub payments need a separate go-ahead.
- Graduation Day's site is live on that account: 2 real $2.99 purchases (31 Oct, 1 Nov), both delivered.

## Update — sign in and load your progress: a cloud save per game (1 Nov)

- **Each game has its own cloud save** (`public.game_saves`, migration 0006): Daycare Tycoon (daycare, shared coins,
  bandanas, achievements, team), Recess Rush (best score, today's coin counter) and Graduation Day (its own save file,
  incl. Summer Camp and location adventures). Loading or keeping one game never touches another.
- **Sign in → your progress loads.** On a phone with nothing real for a game, that game loads from the account by itself;
  a phone with progress and an empty account saves it; progress in both places asks for that game only ("Keep this
  phone's progress" / "Load my account's progress"). After that each game saves automatically (every 20 s and when
  leaving the app); a stale phone is paused for that game instead of overwriting newer progress.
- **Sign-in:** Continue with Google (recommended), or email + password with "Forgot password?" (reset link by email,
  then choose a new password). Home page: "Save your progress" card; header: "Guest · not backed up" / "Signed in ·
  cloud saves on". Graduation Day isn't swapped while its screen is open (it would overwrite the load); it loads once
  the player leaves that screen.
- **Safety:** players read only their own saves; writes only through `save_game_progress` (revision-checked, three
  game names only, objects ≤ 100 KB, no direct table writes). Saves hold free progress only.
- Tests: 173 unit/integration (per-game slices and merges, sign-in decisions, multi-phone sync, the SQL on PGlite) and
  a browser suite against a stand-in sign-in server (`qa/e2e-cloud.cjs`, 25/25). **Not tested here:** real Google
  sign-in and real email delivery (password confirmation/reset emails depend on Lovable Cloud's email settings).

## Update — current Graduation Day inside the hub (1 Nov)

- The hub now embeds the same Graduation Day build that is live (Summer Camp levels 41–80, location adventures,
  milestone rewards), with its music. Free play here: no purchases, cloud saves or sign-in inside the hub.
- Hidden inside the hub only: the "Add to Home Screen" card, the Weekly Challenge prize card (its scores can't reach
  the leaderboard from the hub, so no hub player could win — prizes stay on the Graduation Day site) and
  "Invite friends" (needs Graduation Day sign-in; the hub has its own Invite).
- The hub still counts levels 1–40 for "Levels cleared" and the Honor Roll / Valedictorian bandanas; Summer Camp and
  location levels don't change those numbers (tested).
- Not done: Graduation Day asks for "your PAWtastic" separately from the hub's team pick.

## Lovable sync attempt (31 Oct, 20:32 UTC) — stopped, nothing changed

One agent message asked Lovable to copy commit `795d8e1` into the Daycare project. Its agent downloaded the
files, then stopped before copying anything: its rules don't allow overwriting generated files that the file
list includes (`drizzle/migrations/meta/*`, `src/integrations/supabase/types.ts`, `src/routeTree.gen.ts`).
No project files changed; 0.7 credits used. Next step needs the owner: link the Daycare project to GitHub
(as the Graduation project already is), or approve a second message that skips those files.

## Graduation Day fix — buying Treats at "So close!" (out of moves)

On the public site with payments on, "Get 55 Treats for $2.99" used the old claude.ai demo path: a "Demo — no
real charge" sheet, then 55 Treats added in the browser with no payment and no Stripe page. Fixed in the
Graduation source at the repo root (`src/ui/screens/level.js`, `src/backend/local.js`, `src/ui/styles.css`) and
rebuilt `dist/index.html`. First pushed to the linked repo `pmichael415/pawtastic-graduation` as `9e025b9`, but that
build was made before the browser-side guard was added; another session rebuilt it with the guard (`1fe2430`,
sha256 `517ec116…`, identical to a fresh build of this branch). The owner published it on 1 Nov.

 (Team Hawthorne vs Team Hillsdale)

- **Pick your team.** New players are asked once per visit (home page, and before their first daycare check-in):
  Team Hawthorne or Team Hillsdale, each shown with its real address. "Not sure yet" is always allowed. Switch from
  Settings or the home page, once a week.
- **Your team sets where your daycare opens.** A brand-new Team Hillsdale player's daycare opens in Hillsdale (green
  trim) and can expand to Hawthorne; Team Hawthorne the reverse. Existing players keep their daycare and are told how
  to open their team's location as the second location.
- **Team adventures (fictional stories, labelled as such):** Team Hawthorne "Rain-or-Shine Week", Team Hillsdale
  "The Great Ball Hunt". Six chapters each, different stories and order, identical difficulty and rewards (tested),
  ending in a team bandana and the Team Spirit achievement.
- **Weekly Team Hawthorne vs Team Hillsdale.** Points from check-ins, care, Recess Rush runs and Graduation Day levels;
  capped at 60 per device per day in the app and again on the server (`team_standings`, migration 0005). The home page
  shows this week's real totals and players per team, and last week's winner — or "not available" when the server
  can't be reached. Nothing is invented.
- **Your location first:** Visit and "Recommend PAWtastic" lead with your team's location. Team picks are measured.

Tests for this update: 149 automated (incl. team rules, fairness, the cap and an empty week on PGlite); browser QA
on an iPhone 13 profile: teams 27/27, games & sharing 32/32, daycare 36/36, hub 26/26. Migration 0005 dry-run on the
live game database (it caught a bug — an empty team showed 60 points — fixed and re-verified).

## Update — all three games combined, plus Share & referrals

- **One hub, three games.** Daycare Tycoon (`/daycare`), Recess Rush (`/recess`) and Graduation Day
  (`/graduation`) share one home page, one bottom navigation (Home · Daycare · Recess Rush · Graduation · Shop),
  one header with back-to-hub, Share and Settings, one profile and one achievement list.
- **Graduation Day inside the hub** is the newest build from the PAWtastic Graduation Lovable project, embedded
  as free play (`public/graduation/index.html`; refresh with `scripts/update-graduation.sh`). Its payment
  check finds no game server on the hub's site and stays off, so the hub has a single purchase system.
  Graduation Day's own public site, its Stripe setup and its saves are untouched.
- **Shared, not merged, economies.** The hub reads Graduation Day's progress on this device (read-only).
  Finishing Orientation unlocks the Honor Roll Bandana for daycare pups, graduating unlocks the Valedictorian
  Bandana; new shared achievements: Honor Roll, Valedictorian, All-Rounder (play all three) and Pack Builder.
  No coins or Treats convert between games.
- **Share button on every screen** opens one sheet: share a personal invite (card image or copy link), share
  this screen's thing (daycare card / Recess Rush challenge), or recommend PAWtastic Academy to a dog owner
  (Hawthorne or Hillsdale free-evaluation form, tagged `utm_source=pawtastic_games_referral` with the
  player's code in `utm_term`; no prices or promotions). Nothing is posted automatically.
- **Referrals.** Each device gets a random 8-character code (no personal data). A new player's first session
  through that link is counted; when they finish the first-day tutorial the inviter gets +100 daycare coins
  (up to 5 friends) and the Best Buddy Bandana. Your own link never counts; existing players opening a link
  don't count. Counts come from the server (`referral_stats`, migration 0004). The rewards are game-only and
  device-based — someone could farm them with extra devices, which is why they're small and capped.
- **Measurement added:** invite shares, PAWtastic recommendations, referral link opens, first-time players from
  referrals, and booking-link clicks by referred players. A click on the evaluation form is not a booking.

Tests for this update: unit/integration 138 passing (incl. referral counting on PGlite), browser QA on an
iPhone 13 profile: games & sharing 32/32, daycare 36/36, hub 26/26. Migrations 0002 (updated) and 0004 were
dry-run on the live game database in a rolled-back transaction.

Not included / limits: the private review link leaves Graduation Day out (I only publish files I've reviewed
in full; the embedded build wasn't written in this session). Graduation Day's music files weren't exported,
so it plays without music inside the hub. Friend counts need the deployed server (they show "not available"
in the preview).

## The check-in problem — root causes (each reproduced on an iPhone-sized touch screen first)

1. The **Check in** button existed only in a panel drawn below all four playrooms (y≈1203px on a 664px screen).
2. Returning to the app auto-paused the game and put an overlay over the lobby that blocked every tap; its
   Resume button was off-screen.
3. Dog buttons were re-created on every one-second clock tick (component defined inside the render function).
4. Two quick actions in the same tick overwrote each other (actions read state from the last render).
5. Pups already waiting at 12:00 couldn't be checked in until 14:00.
6. The tutorial told players to use "Admit pup" while random arrivals needed "Check in".

**Judgement call to confirm:** the 12:00–14:00 closure now stops *new drop-offs* only; staff can still
check in pups already inside. Earlier instructions paused check-in too. It is one line in `src/game/engine.ts`
(`checkIn`) if you prefer the old rule.

## Works — verified in this session

- Check-in: visible beside every waiting pup at the top of the daycare and at the front desk; reasons shown
  for anything unavailable; double taps pay once; quick check-ins of two pups both stick (unit + browser tests).
- 3D daycare (three.js) drawn from the same saved game state as the list view: lobby with front desk and
  waiting area, four playrooms labelled with size + temperament and occupancy, individual boarding suites,
  bath area, staff-only recovery room; animated dogs, arriving/departing customers and staff; upgrades and
  decor appear in the world.
- Overhead camera (drag, pinch, zoom buttons, area jumps, reset) and first-person walk mode (touch stick,
  drag-to-look, W A S D / arrows / Q E, contextual Interact button, e.g. walk to the desk → "Check in Maple").
  Switching cameras keeps the same pups and save. List view is the accessible fallback (and used when WebGL is missing).
- Schedule: 11:59→12:00 stops drop-offs, 13:59→14:00 resumes them; care continues during the break.
- Safety: mismatched rooms warn first and need confirmation; scuffles show warning signs and a still (not
  shaking) Separate button; separating works while closed, with a full lobby and with staff at 0% energy,
  never pays coins.
- Progression: personalities and favourite activities (never tied to temperament or breed behaviour),
  returning regulars with friendship milestones, end-of-day report, weekly challenge, next-goal card, a
  first five minutes that ends in a visible improvement.
- PAWtastic Games hub at `/` with Daycare (`/daycare`), Recess Rush, Shop, Account, How to play; one bottom
  navigation; back-to-hub on every screen; existing challenge links (`/recess?seed=…&challenge=…`) still work.
- Recess Rush rewards: ≤120 coins a run, ≤300 a day (New York day), impossible scores for the seeded course
  earn nothing. Coins are local, free progress — not server-authoritative.
- Payments code (test mode only, locked): requires test key + webhook secret + https origin + a confirmed
  receiving account id, and checks the key belongs to that account. Signed webhooks grant once, ignore
  duplicates, reject wrong amounts/buyers, handle delayed payment, record failed/expired checkouts and
  revoke on full refund. Restore shows only the signed-in player's active packs; switching accounts never
  shows another account's packs.
- Measurement: anonymous events (no personal data) and views for first sessions, check-ins, first care cycle,
  tutorial completion, return rates by cohort and build, camera choice, client errors, shop previews,
  restore failures and booking-link clicks per location (clicks only — never reported as bookings).

Automated results at the last run: 128 unit/integration tests (incl. the migrations on PGlite and signed
webhooks through the real route into the real SQL), type check clean, production build OK,
iPhone 13 browser QA: daycare 36/36 (3 repeat runs clean), hub & games 25/25.

## Not verified / known gaps

- **Real devices:** tested in Chromium with iPhone 13 emulation and touch events, not on a physical iPhone/iPad
  or Safari. Frame cost measured only with software rendering (≈3 ms/frame, 174 draw calls, ~4k triangles).
- **Live sign-in, cloud saves and conflict prompts against the real backend** were not exercised in a browser
  here (this sandbox cannot reach the game's Supabase). Logic is unit-tested; SQL is tested on PGlite and dry-run live.
- **Real Stripe checkout:** never run. I have no Stripe access, so the "pawtastic games" account id,
  receiving business and test/live status are **unverified**.
- Dogs are simple low-poly models; Hillsdale reuses the same fictional layout with different trim colours.
- The Tycoon has no sound yet. The original Recess Rush site and Graduation Day are linked, not merged.
- Two pre-existing lint errors remain in older test files; formatting lint was never enforced in this project.

## Proposed only (not built)

Server-authoritative coin balances, public leaderboards, a reviewed booking/customer-app integration,
live payments, scheduled social posts.
