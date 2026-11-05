# New Daycare (`/daycare-next`) — making it feel like a daycare tycoon: report

Owner brief "MILESTONE — MAKE PAWtastic FEEL LIKE A DAYCARE TYCOON" (5 Nov). Branch `claude/pawtastic-games-unified`,
code from `2a05fac` (the audit-fixes report) to `bf82029`; after it only this report changed. Private preview only: nothing was published, released or
merged. Game coins only. Not touched: the legacy game (`/daycare`) and its save, Stripe, purchases and deliveries,
DNS, app.pawtasticacademy.com, the live hub and the other games (§7 says how that was checked). Decisions I made on
Phil's behalf are in `docs/superpowers/2026-11-05-tycoon-feel-rulings.md`.

## In short — status: ready for Phil's iPhone playtest of the private preview (v17)

- **The seven audit gaps (A–G) were each reproduced, then fixed.** Today's regression tests were run against the
  code from before the fixes: 14 of them fail there (A 2, B 2, C 4, D 1, E 3, F 1, plus the guide's two queued taps),
  and the old ListView the auditor restored fails both new ListView tests (G). All pass now. Gap B also needed a
  second fix that only a real browser showed (§2).
- **The service loop is the old game's, on the new world screen.** Check in → the safe room → play → all set: three
  taps, and the pup's panel closes by itself and says when the family is back.
  - A pup that wants to play again while it waits says so on its room, and one tap plays.
  - Measured against legacy for one family: new 8 taps (the visit is 4, plus 4 optional one-tap replays while the pup
    waited for its family), legacy 6.
- **Connecting a room is one flow:** choose the room → tap a spot → see the door, the route and the full total →
  confirm. The checks pass on a 375-pt-wide iPhone SE and an iPhone 13, including a blocked spot, changing your mind,
  another entrance, Cancel, reopening and reloading half-way. The new room's panel tells *connected*, *furnished*,
  *staffed* and *operating* apart.
- **Growth is earned now.** A new game starts with 1,900 coins (was 3,000). The guide leaves about 300–350 against a
  540 playroom wing, so the first expansion needs the day's earnings. The wing and a bath station carry labelled
  estimates from today's real demand, and neither always wins.
- **The first session, through the real screen, from a genuinely fresh game.** The scripted player reached the first
  building decision after 4.5 minutes of scripted real time (4.1 minutes of running game clock), and
  completed all ten steps with 0 failed taps, no page errors and no upset family. A first-time person reads and taps more
  slowly; my estimate is **7–10 minutes** to that decision. That is an estimate, not a measurement.
- **One honest money note:** in the first hour, game rewards (the guide, level-ups, two trophies) pay more than
  families do. In the final UI play-through the wing was paid from 350 left by the guide + 74 from families + 225 in
  rewards. Families' money matters, but rewards matter more early on. §5 gives the lever if Phil wants it otherwise.
- **A warning from the long play session (§7).** The older scripted player opens pups by tapping them in 3D, at 2×
  game speed. It ran a busy daycare alone for days, missed about 30 taps, and families waited 60 game minutes at
  pickup. Reputation fell from 80 to about 40 in both runs, whereas with the old 3,000-coin start it hired staff early
  and ended at 94. The desk-based first-session player had no such waits. A real solo player in a busy afternoon is
  the thing to watch in Phil's playtest.
- **Not verified:** a real iPhone, a real person playing, and how it feels. Everything here is Chromium with iPhone
  emulation and software graphics.

## 1. What now feels better, and why

| Before | Now | Why it's better |
|---|---|---|
| The pup's panel covered 42–46% of a phone screen for the whole visit and never closed | Compact panel: who, where, what they need, when the family is back, and **one next step**. Details are behind "More about <pup>". After a care action that leaves the pup all set, it closes itself: "Hazel is all set — Taylor picks up at 16:00." | The daycare stays in view. Routine care is check in → room → play, three taps, with no re-selecting (legacy: 6–8). |
| A pup drifting below happy gave no sign until its family complained | The rooms strip says "🎾 Biscuit wants to play · Play" / "🛁 Pip's bath is booked · Start it", and **one tap does it** | You see what needs you, and routine care needs no menu. |
| A family was checked in although their kind's playroom was full; they waited in the lobby all day and left upset (found by the play-through) | Before check-in the desk says "⚠️ no free Small & Gentle spot", and the pup's panel says "No free Small & Gentle spot right now — they'd wait in the lobby. “Can't take today” costs nothing." | Why a room is unavailable, and the free way out, before it costs anything. |
| In the guide, the coach said "Check out" while the panel said "All set — picks up at 16:00", with no checkout step (found by the play-through) | When the guide asks for a checkout, the family is there: the panel leads with Check out and the desk lists the pickup | Coach, panel and desk say the same thing. |
| Connecting rooms: place, then fix the door, the path and the price separately | Choose the room → tap a spot → the outline shows the door, the route to the entrance and the total → "◀ Entrance 2 of 4 ▶" → Build here. A blocked spot says why next to the placement, and the room you picked stays picked. | Phil's biggest complaint. Nothing is charged until you confirm, and Cancel is free. |
| A new room was "built" and that was it | Its panel lists ✓/○ **Connected**, **Furnished** ("Needs a dog bed or play mat to work"), **Staffed** ("Run by you for now"), **Operating** ("serving Juno, Pip now"). Build leads straight to "Choose furniture for the Playroom 2". | Each state has its own fix. |
| The guide left ~1,500 coins against a 540 wing: the first expansion was free | 1,900 to start and 100 from the guide; families' payments make up the rest. Before the first opening, selling gives everything back. | The first wing is a goal you work towards, with a free way out of a poor first layout. |
| Expansion options said what they cost | They also say what they'd earn **from today's demand**, after upkeep and supplies, labelled as an estimate with its assumptions: "8 Large & Gentle families asked today, so about 3 could stay each day × about 36 = 108, minus 14 upkeep and 6 supplies ≈ +88 a day". | The choice is between real numbers, not a guess. |
| Bath demand was invisible | Families of pups who love bath time ask for a bath. With no bath room it's counted (the desk says "asked for a bath (no bath room yet)"); with one, they book. | The bath station's case comes from your own daycare. |
| Personality was hidden behind "More" | One line, with the rules' own numbers: "Loves bath time 🫧 — a bath cheers them up +15 (other pups +5); playtime only +25 before toys." Fetch, tug and zoomies fans get +35 from play. | A bath-time fan is a real care decision, and a reason to build a bath station. |
| Returning families were just "visit #3" | "Parker is back with Biscuit for visit #3 (Pal) — last time Biscuit went home delighted, yesterday." A family that left disappointed adds "A good day today wins them back." | The familiar faces from the old game, now with a memory. |
| The savings line said what and how much | It also says why, e.g. "1 Large & Gentle family asked today — you have no room for them yet"; a finished wing says "+3 spots … open and working. Rex can stay — check them in." | Anticipation, and a benefit you see straight away. |

## 2. The audit defects — reproduced, then fixed

Each regression test was run against the code from before its fix (`2a05fac`, in a separate worktree) and fails
there; all pass on the final code.

| Gap | What happened | Reproduced by | Fix |
|---|---|---|---|
| A. Multi-tab pause | A watching tab read and cleared the playing tab's "came back held" marker, so a reopened daycare could run its clock after a mid-build close | `store-holds.test.tsx`: "tab A builds; tab B opens to watch and closes; A closes mid-build; reopening later stays paused" and "a watching tab's own screens never write or clear the marker" — **both fail on old code** | The marker belongs to the playing tab; spectators never read or write it; taking over from a tab that went away mid-build comes in paused; overlapping holds stop time until all end; the pause preference is kept |
| B. Blocked storage | Getting `localStorage` itself can throw | `storage-blocked.test.tsx` (getter throws; writes fail) — **both fail on old code** | The game's store guards getting storage, plays from memory and says "Progress can't be saved in this browser"; it never claims to save. **Second fix, found only in a real browser** (`qa/e2e-storage.cjs`): with the getter throwing, the app *around* the game never rendered ("This page didn't load"), because the auth client's storage choice and the cloud-save links read touched storage unguarded. Both are guarded now (unit tests failed first); the browser check passes 10/10 |
| C. Fifth doorway | A new room's own doorway could open a fifth way into the receiving room | `connection-edges.test.ts` A3: Add door, connected building and Connect it each give the full lobby a fifth way in on old code (3 fail), plus the neighbour-wall case (1) | Every doorway counts for both rooms; validation checks both. Trap protection for lobby, calm-room, boarding and bath pups is unchanged |
| D. Older-save refunds | A refund could be booked on yesterday's entry, or without one | `reconcile.test.ts`: "a refund larger than the bill, on a day with no ledger entry yet, is booked on today's entry — never yesterday's — and the books still add up after a reload" — **fails on old code** | Every refund finds or creates today's entry; sales stay apart from revenue; the purchase system is unchanged |
| E. Exact confirmations | The spot bar sent coordinates and the purchase was recomputed, so a "Large & Gentle" playroom could be built as "Small & Active" | `expansion-quote.test.ts`: the quote names room, group, door, furnishings and total; a changed waiting family refuses with nothing charged; a replay does nothing — **3 fail on old code** | Every confirmation (world builder, list builder, Connect it, expansion "Build here", the guide's "Build a playroom") is bound to the complete purchase shown. A changed quote needs a fresh confirmation and charges nothing; queued double taps run once |
| F. Money figure | "Change in coins" subtracted tonight's costs before they were paid | `money-screens.test.tsx` — **fails on old code** | "Change in coins so far" is what was actually paid in and out; "Operating profit by closing" is the labelled projection. Today, Yesterday, 7 days, reports and goals share the same calculations |
| G. Weak tests | The auditor restored the old ListView and every ListView test still passed | Today's ListView tests against the **old ListView**: "a genuinely stale confirmation … charges nothing" and "two taps queued before the screen updates build once" **both fail** | Stale-confirmation and two-queued-taps tests for the list builder, world builder, Connect it, the spot bar and the guide; each fails with its fix removed |

The play-throughs also found and fixed four more problems:
- **The guide's checkout step** (§1): the coach said "Check out" while the panel offered no checkout step.
- **A tie that flipped the target group:** with equal demand for two kinds of pup, Next named one kind and the card,
  seconds later, the other. Ties now always break the same way. What was built was what the spot bar showed and
  charged, so the exact-quote binding held.
- **Check-ins with nowhere to go:** families were checked in while their playroom was full and left upset (§1).
- **Two-tap replays:** each "wants to play" replay took two taps (found by `qa/flow-compare.cjs`, §1).

## 3. The first session, through the real screen

`qa/first-session.cjs` is a **scripted player, not a person**: Chromium with iPhone 13 emulation and software graphics,
**at normal speed (1×)** all the way. It starts from cleared storage and injects nothing: no coins, no experience, no
erased books. It taps only what the game puts forward: the start card, the guide's buttons, the front desk, the pup
panel's next step, the rooms strip, the pickup sheet, the Objectives' "See options", the ways-to-grow card, the spot
bar and the new room's panel. Its one judgement: buy the option whose labelled estimate pays back sooner, once the
coins cover it without the "tonight's costs" warning.

Final run (code `bf82029`), each step with its scripted real time and running clock:

| # | Step (what the screen showed) | Scripted real time | Running clock | Taps so far | Game time |
|---|---|---|---|---|---|
| 1 | A genuinely fresh game: 1,900 coins, 0 XP, no rooms; the start card | 0:03 | 0:00 | 0 | day 1 07:00 |
| 2 | Check in and place safely: Quick start, "Check in Biscuit", "To Small & Gentle (0/3)" — the matching playroom | 0:08 | 0:00 (the guide holds the clock) | 3 | 07:00 |
| 3 | Care and an itemised payment: Playtime → Check out → "😊 Parker is delighted — Biscuit had a great day! Paid 40 · Reputation +2 · New 5★ review · See the bill" | 0:13 | 0:00 | 5 | 07:00 |
| 4 | A real limit: the guide's Rocket can't stay ("Build a Large & Active playroom · 420 coins — You have 250, 170 more to earn"; he rests free); then in free play "2 Small & Active families asked today — give them a playroom", and when the Small & Gentle room filled, the desk said "⚠️ no free Small & Gentle spot" (4 families turned away free) | 0:20 / 1:01 | 0:00 / 0:39 | 10 / 12 | 07:00 / 08:14 |
| 5 | Two choices, on the game's own labelled estimates: the playroom wing 540 (≈ +88 a day from today's demand) against the bath station 830 (≈ +8 a day: one bath ask) | 4:30 | 4:06 | 46 | 15:06 |
| 6 | Earnings used: 649 on hand = 350 left by the guide + 74 paid by families since + 225 in game rewards | 4:33 | 4:07 | 48 | 15:08 |
| 7 | Placed and connected without confusion: "Spot 1 of 3 — behind the Lobby · Builds a 3 × 3 playroom … with its door and 3 Dog Beds — 540 game coins in all · Time waits while you choose" → Build here; charged 540 = shown | 4:34 | 4:07 | 48 | 15:08 |
| 8 | Furnished and staffed: it came furnished; its panel read ✓ Connected · ✓ Furnished · ○ Run by you for now · ✓ Operating ("Hire a daycare attendant · 250, then 40 a day" offered; the coins left didn't cover it that day) | 4:36 | 4:07 | 48 | 15:08 |
| 9 | Serving demand through the new room: a Large & Gentle pup in the wing, and its family paid 40; 3 families paid from it in the session | 7:35 | 7:08 | 70 | day 2 09:57 |
| 10 | The financial result and the next goal: the day-1 report (families paid 264, running costs 109, operating profit +155, rewards 450, building 2,370), then Finances and the Objectives' next goal | 6:06 / 7:42 | 5:39 / 7:13 | 57 / 75 | day 2 07:00 / 10:08 |

Walkthrough video: `first-session-4x.mp4` (sent with this report; 116 seconds) — the whole run, sped up 4× (scripted play, not a person).

## 4. Timings, and what they don't tell you

| Measure | Scripted run (measured) |
|---|---|
| Actual elapsed time to the first building decision | 4.5 minutes |
| Running game-clock time to it (1× = 2 game minutes a second) | 4.1 minutes |
| Paused or held time (the guide 0.3 min, building 0.0 min (the spot bar was open about 3 seconds), dialogs under 0.1 min) | 0.4 minutes |
| Whole session (through the new room's first paying family, day 2) | 7.7 min real, 7.3 min running |
| Taps / panel changes (a sheet, dialog or bar opening or closing) | 75 / 46 |
| Failed taps / abandoned placements / stretches with the clock stopped and nothing to tap | 0 / 0 / 0 |

Across four complete runs (game randomness differs each time), the first building decision came at 3.8–5.4
minutes of scripted real time (3.4–4.9 minutes of running clock), always on day 1 (13:38–16:47 game time).
- The earlier runs' 5 failed taps were the script's fault: it tried the front desk's button while a pup's panel
  covered it. A person would tap the panel's own step, and the script now does.

**What this isn't.** The script reads nothing and taps at machine speed. A person's reading and decision time is
not measured, and it is not multiplied in. Estimate, labelled as such:
- the guide, with the clock held: about 2–3 minutes of reading;
- then the clock has to run about 4–5 minutes before the wing is affordable (the same as scripted, because the coins
  come from the clock);
- reading the two options and choosing a spot: about 1–2 minutes.

So about **7–10 minutes to the first building decision**, inside the 10–15-minute target. It needs a person to
confirm.

## 5. Starting balance, first expansion cost, and how earnings contribute

- **Start:** 1,900 coins (was 3,000). Quick start builds a working daycare for 1,750 and its first level-up pays 50,
  leaving 200.
- **The guide:**
  - Biscuit's and Daisy's visits pay about 80;
  - the Toy Bin upgrade costs 80;
  - the guide's reward is 100 (was 200);
  - level 2 pays 50;
  - so the guide ends with **about 350**.
- **Its decision:** a Large & Active playroom for Rocket costs 420, so the button says "You have 250 — 170 more to
  earn", and letting him rest free is the way on.
- **First expansion:** a playroom wing is **540** (3 × 3 room, door, 3 beds); a bath station 830.
- **How it was paid, in the UI runs:** on day 1, 649–691 on hand = **350** left by the guide + **74–116** paid by
  families since + **225** in game rewards (level 3, the "10 pups served" trophy, friendship milestones). In these
  runs the guide's coins plus the rewards would have covered the 540 on their own.
- **In the engine proof:** the same rules with a player who taps less (`business-loop-real.test.ts`, seeded): 700 =
  300 + **300** + 100. Without the families' 300 it was out of reach.
- **The honest note:** in the first hour, rewards pay more than families do. Day 1's books in the final UI run show
  264 paid by families against 450 in rewards. Families' money is visible on every receipt and in Finances, but in
  the UI play-through it was not *needed* for the first wing; in the engine proof it was.
  - **Why the two differ:** the scripted UI player taps every cue, so it earns XP, level-ups and trophies faster than
    the engine proof's player, or than a typical person probably would.
  - **The lever:** the two early trophies (50 + 100) and the level-up rewards (25 × level).
  - **The trade-off:** cutting them makes families' money the main source, but pushes the first expansion towards
    day 2 (over the 10–15-minute target).
  - **My recommendation:** leave them until Phil has played it, because how they feel is the deciding factor.
- **Free recovery:**
  - before the first opening, selling gives everything back (and says so);
  - after that, 75%;
  - pups stay safe at any balance, and calming down is free;
  - no loans, no automatic selling.
- **Every money screen separates things the same way:**
  - what families paid (revenue);
  - what running the daycare cost (wages, upkeep, supplies, refunds);
  - operating profit;
  - building investment;
  - game rewards;
  - sales;
  - the actual change in coins.
- Ledger note for the balance change: `2026-11-05-tycoon-feel-rulings.md`. `balance.test.ts` (seeded first week) and
  `staff-balance.test.ts` are green.

## 6. The expansion serves demand and earns after operating costs

- **In the final UI run:** the wing was for the group families had asked for (Large & Gentle), and the spot bar said
  so before it charged.
  - It was built connected and furnished; its panel read ✓ Connected · ✓ Furnished · ○ Run by you for now · ✓
    Operating.
  - A Large & Gentle pup was in it on day 2 at 09:57, and its family paid 40; 3 families paid from it in the
    session. (In the run before the last change, 4 had paid from it by closing on day 1.)
- **Over ten days, from a real new game** (`business-loop-real.test.ts`; same rules, seeded, nothing injected, no
  reserve policy):
  - the wing (540) served **37 families who paid 1,395**;
  - after its upkeep 140, supplies 74, and the attendant's wages and sign-on 610, it **netted 571**, so it has more
    than paid for itself.
  - The same player on the same seed **without** the wing makes about 40 less operating profit a day and ends day 10
    with **374 fewer coins**, even after paying 540 for it.
  - Every day after it is profitable, except the day the attendant's one-off sign-on was paid (−23).
- Both options' estimates show their assumptions. When the options first appeared (day 1, 07:04), the wing estimated
  +20 a day (one family turned away) and the bath station nothing (no bath asks yet). It took the day's demand to
  decide, which is why neither is always the obvious pick.

## 7. Checks run, results and remaining failures

All browser suites below were rerun on the final code (`bf82029`) after the last change, in one sequence. Browser checks are Chromium with device emulation and software graphics
(SwiftShader), run against the private development server with isolated test saves (cleared storage per run), never
Phil's save.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx vitest run` | **156 files, 1,176 tests passed**, exit code 0 |
| Gap regression tests against the pre-fix code (`2a05fac`) | 14 fail there, as they should (§2); all pass now |
| Today's ListView tests against the old ListView the auditor restored | 2 fail there, as they should (G) |
| `qa/first-session.cjs` (new; the ten steps at 1×) | final run: all 10 steps, 0 failed taps, 0 page errors, no upset family. Earlier runs: run 1 got stuck in the guide (fixed — §2); run 2 had 5 failed taps, all the script's own order (fixed in the script); runs 3–4 clean, but 5 families left upset after being checked in to a full room (fixed — §1); run 5 was stopped (a script bug kept it from ending, and it tapped the desk under an open panel; both fixed in the script) |
| `qa/e2e-connect.cjs` (new; iPhone SE and iPhone 13) | 28/28 |
| `qa/e2e-storage.cjs` (new; getter throws / writes fail) | 10/10 after the second gap-B fix (was 5/6) |
| `qa/e2e-empire.cjs` | 29/29 |
| `qa/e2e-service.cjs` | 46/46. (Earlier in the milestone: once 7 of 11 failed because the 3D world wasn't there yet — it loads fine alone, not reproduced since; then 45/46, a check that still read the booking from the compact panel, updated to open "More about") |
| `qa/e2e-tycoon.cjs` | 44/45 in the final sequence, **45/45 alone** right after. The one failure, "finance checks ran", timed out tapping the day report's "Start day" button because it was "not stable" while the suite fast-forwards days; it failed the same way once earlier in the milestone and passed alone both times. Not caused by this milestone's changes as far as I can tell (the day report wasn't touched), but it is intermittent and I haven't fixed it. (Before that: 42/45 until coins were added with the DEV hook before the play yard and its upgrade, which a new game can't afford at that point) |
| `qa/e2e-staff.cjs` | 58/58 |
| `qa/e2e-onboarding.cjs` | 102/102 — its "build" branch now first checks that a new game's playroom says "M more to earn" and waits, then stands for an older 3,000-coin save |
| `qa/e2e-phone.cjs` (iPhone 13 portrait and landscape) | 40/40 after one check followed the compact panel ("More about" for who looks after a pup; was 38/40) |
| Legacy `/daycare`: `qa/e2e-daycare.cjs` | 36/36; legacy code and save untouched (no change under its route, `src/game/engine.ts` or `src/game/store.ts`) |
| `qa/flow-compare.cjs` (legacy vs new, one family) | legacy 6 taps; new **8 taps** (the visit is 4: check in → room → play → check out; 4 more were optional one-tap replays while the pup waited for its family). Before this milestone's last fix each replay took 2 taps (11 in all) |
| `qa/play-session.cjs` against the dev build (older 3D-tapping player, 2× between beats, ~16 min real) | Ran to day 6 with no page errors; all 8 of its milestones reached (wing built and connected day 1, served day 2). **But the daycare struggled in both runs.** Run A: never hired (it waited for 650 coins, a number from the 3,000-coin start) and bought a second wing despite the spot bar's below-zero warning, ending at −111 coins, reputation 40, 13 families leaving upset. Run B (hires when the sign-on and a night's costs are covered, heeds the warning): hired a receptionist on day 4 and ended at +169, but still reputation 42, with 19 waiting and 21 attention complaints. Both missed about 30 taps on pups in 3D, and families waited 60 game minutes at pickup. The previous milestone's run, with 3,000 to start, hired 2 staff early and ended at +957, reputation 94 |
| `balance.test.ts`, `staff-balance.test.ts` | green (part of the vitest run) |

**Performance** (the panels changed, so this was compared, not assumed). The review build from before this milestone
(`2a05fac`) and the final one, served side by side, 3 repetitions **interleaved** (order rotating), fresh profile per
run, 4 s warm-up, 10 s sample, frames per second as ranges:

| Scene | Before (`2a05fac`) | Final |
|---|---|---|
| Normal day, iPhone, battery saver | 53.6–56.8 (mean 55.2) | 54.5–55.2 (54.9) |
| Normal day, iPhone, standard | 39.4–40.5 (40.0) | 41.2–41.6 (41.4) |
| Normal day, desktop | 27.6–28.1 (27.9) | 25.7–30.2 (27.9) |
| Busy, iPhone, battery saver | 32.2–33.4 (32.7) | 30.7–33.4 (32.4) |
| Busy, iPhone, standard | 23.5–25.9 (25.0) | 22.8–27.3 (25.8) |
| Busy, desktop | 14.0–15.5 (14.8) | 13.6–14.5 (14.1) |

Every final range overlaps its "before" range. (The comparison measured `99037ce`; the last change, the full-room
warning, is two lines of text. One smoke pass of the published `bf82029` build loaded all six scenes, no errors.) The one consistent difference: in the busy desktop scene a screen
update takes 5.5–5.9 ms against 4.2–5.3 (about 4 updates a second, so ~2–4 ms a second), most likely the panels'
extra lines (care tip, memory, the expansion estimates). Small, real, and reported rather than called drift. The 3D
update and the simulation are unchanged (3D 2.0–2.9 ms busy; sim 1.0–1.4 ms). SwiftShader isn't an iPhone GPU.

**Not run / not verified:** a real iPhone or Safari; a real person playing; sound (unchanged this milestone).

## 8. Deferred work and owner decisions

- **Owner decision — early rewards vs earnings (§5).** Families' payments are visible and needed in the engine
  proof, but in the UI play-through the guide's coins plus level-up and trophy rewards would have covered the first
  wing without them. The levers: the "First happy pup" (50) and "10 pups served" (100) trophies, and level rewards
  (25 × level). Cutting them makes families' money the main source, and pushes the first expansion later in day 1 or
  into day 2. My recommendation: Phil plays it first and says whether the first wing came too easily.
- **The receipt card** (6 seconds, taps pass through) can sit over the bottom of the guide's decision or the
  ways-to-grow card. Kept deliberately (§2 ruling): waiting for the inline card would hide payment feedback.
- **Bath station estimate** counts only families who asked (fans of bath time); other families also book once there
  is a bath room (about 3 in 10). It is conservative by design and says so.
- **Solo busy afternoons (the play-session runs).** At the previous milestone the 3,000-coin start let the old
  script hire staff early, which hid its slow, error-prone 3D tapping. Now it has to serve alone for days, and
  pickups outpace it. The desk-based first-session player had no waits, and the desk shows each waiting family with
  its own Check out button. Whether a real person keeps up is the main thing to watch in the playtest.
  - **If they don't, the levers are:** a little more pickup patience before a family is upset, or a cheaper first
    hire.
  - **Also to do:** `qa/play-session.cjs` should use the front desk like a player does.
- **Not started, as the brief asked:** a large event system, staff absences, breakdowns, referral surges.
- **Legacy `/daycare` under fully blocked storage** wasn't changed (its code is off-limits); the new game is covered.
- **Lovable could regenerate** `src/integrations/supabase/previewAuthStorage.ts` and drop the storage guard; its
  unit test and `qa/e2e-storage.cjs` would catch it.

## 9. Version tested

- Code: `bf82029` on `claude/pawtastic-games-unified` (the commit after it adds only this report).
- Private preview: **version 17** of https://claude.ai/artifact/Nyuw3aGUoE3Mani6HUgfeP (version id `1793895235-0220`).
  - it is the production review build of `bf82029`, private to Phil's account;
  - the dev-only test hooks aren't in it (checked), and neither are any keys (checked);
  - a smoke pass of this build loaded normal and busy scenes on iPhone and desktop, no page errors.

## 10. Status

**Ready for Phil's iPhone playtest** of the private preview (v17, `/daycare-next`). Nothing known blocks it.

What the playtest should answer, because nothing here can:
- **Keeping up alone:** can you keep up with a busy afternoon before your first hire? (§7, play session: the scripted
  player couldn't; that's the risk I'd watch most.)
- **The first wing:** does it come too easily, or at the right moment? (§5 — the early-rewards lever.)
- **The timing:** is the 7–10-minute estimate to the first building decision right for a first-time player?
- **Connecting rooms:** does it feel natural on the real phone? (Phil's biggest complaint; the checks pass on emulated
  iPhone SE and iPhone 13.)
- **The bottom of the screen:** does the receipt card or the pup panel get in the way on a real screen?

Not done and not claimed:
- a real iPhone or Safari;
- a person playing;
- how it feels.

Nothing was published, released or merged: the preview is private and only Phil can share it.
