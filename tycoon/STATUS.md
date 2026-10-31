# PAWtastic Games — status (31 October 2026)

## Where things are

| What | State |
|---|---|
| Lovable project **PAWtastic Daycare Tycoon** (preview behind Lovable login, not published) | Still on the **old** code (Lovable commit `c3a69bd`). Not updated by this work yet — see `SYNC-TO-LOVABLE.md`. |
| GitHub `pmichael415/pmichael415-pawtastic-game`, branch `claude/pawtastic-games-unified`, folder `tycoon/` | The new code. |
| Private review build (claude.ai artifact, owner-only) | Guest play of the new code. Sign-in, cloud saves and purchases are switched off there. |
| Live game database (Lovable Cloud / Supabase) | Unchanged. New migrations were only dry-run inside a rolled-back transaction. |
| Customer app (app.pawtasticacademy.com), its database and Stripe | Not touched. |

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
