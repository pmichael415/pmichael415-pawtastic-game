# PAWtastic Games — status (31 October 2026)

## Where things are

| What | State |
|---|---|
| Lovable project **PAWtastic Daycare Tycoon** (preview behind Lovable login, not published) | Linked to GitHub `pmichael415/pawtastic-daycare-tycoon` (branch `main`). The new code was pushed there on 1 Nov (`bb84f32`, then `f52e504` with the current Graduation Day and its music, then `a296f4f` with per-game cloud saves; the files in `SYNC-MANIFEST.txt`). Migration 0006 applied and checked (7 recorded; players read only their own saves, no direct writes). Lovable's preview shows the new hub. Not published. |
| GitHub `pmichael415/pmichael415-pawtastic-game`, branch `claude/pawtastic-games-unified`, folder `tycoon/` | The new code. |
| Private review build (claude.ai artifact, owner-only) | Guest play of the new code. Sign-in, cloud saves and purchases are switched off there. |
| Live game database (Lovable Cloud / Supabase) | Migrations 0002–0005 applied on 1 Nov (each in its own transaction, recorded in `drizzle.__drizzle_migrations` with the file hash, so they won't run twice). Checked: 6 migrations recorded, events table private (RLS on, no anon/player access), team totals start at 0. |
| Customer app (app.pawtasticacademy.com), its database and Stripe | Not touched. |

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
