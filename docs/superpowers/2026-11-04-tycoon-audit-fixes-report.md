# New Daycare (`/daycare-next`) — the audit findings fixed, and the daycare loop proven: report

Owner brief "MILESTONE: FIX THE AUDIT FINDINGS AND PROVE THE DAYCARE LOOP" (4 Nov). The independent audit covered
`9e1e506..dc8fc14`. This milestone is `dc8fc14..3974827` (code), plus this report, on `claude/pawtastic-games-unified`. Private preview only:
nothing was published, released or merged. Game coins only. The legacy game (`/daycare`), its save, Stripe,
purchases, DNS, app.pawtasticacademy.com and the other games were not touched (checked below).

## In short

- **Every defect the audit reported was reproduced on the audited code before fixing.** This includes the exact −29
  vs +50 "Profit" from finding 5, and Resume restarting time with Build open.
  - The exception is finding 4C (never cutting pups off): it already held, and is now pinned with valid fixtures.
  - Every fix has a regression test that failed before the fix.
- **The proof now starts from a real new game.** A fresh save, then Quick start, the guide, and ten days of
  hands-on play, with nothing injected or erased:
  - **expansion:** a playroom wing bought on day 3, paid for from service operating profit;
  - **the wing's own result:** 48 more families, netting 1,033 coins after its upkeep, furniture, supplies,
    attendant's wage and sign-on (it cost 540);
  - **operating profit:** 257 a day before, 357 a day after.
  - The old proof is kept, labelled as a zero-liquidity recovery scenario.
- **One honest balance note:** after Quick start and the guide, a new player holds 1,500 coins. A playroom wing costs
  540, so the *first* expansion doesn't have to be earned. The proof deliberately keeps that reserve. The fix
  (smaller reserve, or pricier first wing) is a design choice for Phil, so I didn't change it.
- **A new defect, found while rewriting a misleading test.** Connect it could add a doorway on a neighbour's wall
  into a room that already had four doors (a fifth way in). Fixed.
- **An independent reviewer** (a fresh agent that hadn't written the code) read the whole diff. It confirmed five
  more defects, all fixed with failing-first tests, and five tests that checked less than their names (all
  tightened). Details in §1b, including what I deferred and why.
- **Commands (final code):**
  - `tsc` clean;
  - `vitest run` 147 files / **1,114 tests passed** (default workers);
  - every browser suite run passed, after one outdated check was updated (§2).
- **Performance:** the battery-saver "regression" doesn't reproduce under comparable, interleaved conditions; the
  current build is level with the pre-empire build. The earlier gap was drift between separate sessions plus a
  vsync-locked p95 (§2).
- **Not verified:** a real iPhone, a person playing, and how it feels. Browser numbers are headless Chromium with
  software graphics.

## 1. The audit findings

### Finding 1 — Building's pause wasn't reliable

- **Reproduced on `dc8fc14`:** with the day running, open Build and then tap the HUD's Resume. The store reported
  `paused=false` while Build was still open, so time restarted mid-build. (This came from a scratch test on a
  checkout of the audited commit; the new tests' first failures were only "the hold API doesn't exist yet", so I
  re-checked the behaviour itself.)
- **Fix (`1e39957`):**
  - **Hold vs pause:** the store now keeps the player's *pause preference* apart from *mandatory holds* (building,
    choosing a spot, a level-up, a new stage, the day's report). Time runs only when the player hasn't paused
    **and** nothing holds it.
  - **The HUD while held:** Pause/Resume is disabled and says why ("Time waits while you build").
  - **Overlapping holds:** they wait for the last one to end.
  - **Leaving a blocking screen:** the earlier preference comes back unchanged.
  - **Reload, background or a closed tab while held:** the game comes back paused, and nothing is caught up.
  - **An unconfirmed build:** it leaves nothing and charges nothing.
- **Tests:**
  - `store-holds.test.tsx`:
    - running → hold → Resume refused → release → running;
    - already paused → hold → release → still paused;
    - overlapping holds;
    - reload while held comes back paused, with no catch-up.
  - `frontdesk-ui` — while building, the HUD can't restart time.
  - `builder-flow` — reload mid-build: nothing built, nothing charged, paused.
  - The empire browser suite.

### Finding 2 — Not every coin was on the books

- **Reproduced:**
  - door, room and item sales went straight to coins, unrecorded;
  - a level reward on a day with no ledger entry yet was lost from the books.
  - The four new tests in `reconcile.test.ts` failed on the old code with assertion errors.
- **Fix (`c635e7b`):**
  - **Sales:** each day's books gain a `sales` field (sale proceeds: money in, but not service revenue), and
    `recordSale` books every sale.
  - **Level rewards:** they create today's entry when there is none.
  - **Loyalty rewards:** a loyalty milestone is now a game reward shown *apart from* the bill, so a receipt's total is
    exactly what the family paid.
  - **Checked:** guide rewards, trophies, welcome-back rewards, refunds and staff checkouts are all on the books.
  - **Boundary:** Shop coin packs (paid purchases) are recorded by the purchase system's own delivery log, which I
    did not change, as instructed.
- **Tests:** `reconcile.test.ts`:
  - sales are proceeds, not revenue;
  - a level reward on a fresh day;
  - a mixed run (services, building, buying and selling, a room and a door sold, the guide, a welcome back,
    trophies, refunds, nights) and then a reload never leaves a coin unexplained;
  - an old save without `sales` loads and adds up.

### Finding 3 — Confirming the exact build the player saw

- **Reproduced:** replaying the list builder's confirmation built a second room at a different price (360, then
  310).
- **Fix (`394e891`):**
  - **What's checked at confirmation:** building (3D and list) and Connect it re-check the footprint, room
    type/group, doorway, route and total against what was shown.
  - **A plan that changed:** it's refused with nothing charged, and the new price is shown.
  - **Replays and double taps:** the list builder confirms its on-screen quote, so a replay does nothing; furniture
    goes to the spot shown; a second tap is ignored.
  - **Deliberate further purchases** still work.
- **Tests:**
  - `confirm-quote.test.ts`: replayed list build; route grew (path sold meanwhile); same price but different
    doorway; Connect it replayed and stale; furniture replayed.
  - UI tests read the price from the screen: `ListView` (stale quote and double tap); `builder-flow` (Connect it
    double tap, price read from the button); the empire browser suite (Build here and Put it in double-tapped:
    one each, charged once).

### Finding 4 — Connection edge cases

- **A, reproduced:** a 2 × 2 room beside the lobby, whose doorway is on the lobby's wall, couldn't be reconnected
  once that doorway was removed. **Fix:** Connect it can restore a doorway on a connected neighbour's wall, for
  exactly the price shown, never as the neighbour's fifth door.
- **B, reproduced:** with the daycare at 200 things, `firstFreeRoomPlan` gave up at the first spot whose route
  wouldn't fit. **Fix:** it keeps looking for a spot that needs no new path squares.
- **C, already held; now pinned with valid fixtures:** pups are never cut off — a family waiting in the lobby, a pup
  in the calm room, a boarder in its bed, a pup in the bath. Doors removed, path squares sold or moved, and rooms
  sold or moved are all checked.
- **Commit:** `fe86bc3`. **Tests:** `connection-edges.test.ts`. Everything is placed through the real build rules;
  the full daycare is filled with real fences.

### Finding 5 — The money screens disagreed

- **Cause confirmed:** the Today strip included tonight's costs while Finances' Today column didn't, both labelled
  "Profit". On the audited code the same Quick Start state reads:
  - **The Today strip:** "revenue 50, wages 40, other costs 39, profit −29". The "revenue" was the level-up reward.
  - **Finances:** "Profit +50".
- **Fix (`9380fa6`):** one shared calculation (`dayMoney` / `todayMoney`) for the Today strip, Finances, the day
  report, the record and the "profitable day" goal:
  - **Revenue** — from serving families.
  - **Operating costs** — so far, plus what's due tonight.
  - **Operating profit** — what the day will close with.
  - **Bonuses** — game rewards, kept apart.
  - **Sale proceeds.**
  - **Invested.**
  - **Change in coins.**
  - Bonuses no longer count as running the daycare.
  - The next expansion's cost and savings progress stay in view.
- **Tests:** `money-screens.test.tsx`:
  - the shared calculation;
  - the day report's operating profit equals the projection;
  - the strip and Finances show the same number for the same state.

### Finding 6 — The "credit next visit" remedy

- **Reproduced:** `PickupSheet` offered "Credit … next visit", and `pickup.ts` / `assess.ts` / `run.ts` carried
  credits forward in the guest book.
- **Fix (`12fb515`):**
  - **Removed:** the remedy and every future-credit promise.
  - **A missed bath:** it can now be put right with a **game-coin goodwill refund** off today's daycare (a quarter),
    alongside finishing the bath or explaining.
  - **When nothing was charged, so there's nothing to refund:** an honest explanation now settles the complaint
    (added after the independent review; §1b).
- **Migration** (see §4).
- **Tests:**
  - `pickup.test` — no credit option; a goodwill refund pays once.
  - `service-review` — I4, refunds never exceed what was paid.
  - `credit-migration.test.ts`.
  - `service-ui` — the sheet shows no Credit button and no "next visit" text, and the refund is labelled in game
    coins. I watched that test fail on the old code: the Credit button was there.

### Finding 7 — The business-loop proof and the misleading tests

- **Verified:** the old proof built Quick Start, set coins to 0 and cleared the starter accounting. It is now
  labelled the **zero-liquidity recovery scenario**. Its "pays its way" check now counts furniture upkeep and
  supplies too.
- **New:** `business-loop-real.test.ts` starts from the actual new-game state (§3).
- **Misleading tests fixed (`d65203c`):**
  - **"boarding is per night":** it had no boarder. Now a real boarder sleeps in a bed and is charged "Boarding — 1
    night" the next morning, recorded as boarding income. A playroom instead of a bed is refused.
  - **"working room":** now requires operational furniture. A new bath room is connected but **not working** until
    it has a tub, then it is.
  - **"once":** now replays the same confirmation. It's refused and charged once, and a deliberate second purchase
    still works.
  - **Four-door test:** now starts from a disconnected room built by the rules and exercises the door-limit branch:
    - with three doors, the cheapest fix is a new doorway into the lobby;
    - with four, the plan reuses one of its doors and paves a path.
    This found a **real defect**: with four doors of its own, Connect it still put a doorway on the lobby's wall into
    the room (a fifth way in). `connectionPlan` now counts every opening into a room. I watched the test fail first.
  - **Displayed-price tests:**
    - the expansion "Build here" test compared against the rules' own spot list with 1,000 coins of slack. It now
      reads the price off the button and requires exactly that building charge;
    - Connect it reads its button too;
    - the front-desk "pays exactly once" test is a real double tap of the same button.

### Finding 8 — Verification

See §2 for the actual commands and results, performance and pacing.

## 1b. Independent review of this milestone

A separate agent (fresh context, read-only) reviewed `dc8fc14..3974827~1`. I re-graded each finding by its effect on a
player.

**Fixed (`3974827`), each with a test I watched fail first:**

| Finding | Fix | Test |
|---|---|---|
| The build hold's "came back held" flag wrote to storage unguarded. Full or blocked storage threw inside the play screen when entering Build. | It's best effort now; the hold itself always stands | `store-holds` — storage throws, the hold still stops time |
| Finances' chart showed today's bar without tonight's costs, while the Today column beside it counted them: **+38 vs −40** | Today's bar is the same operating profit by closing | `money-screens` |
| The weekly "Have a 300-coin profit day" counted game rewards and ignored refunds | It uses the day's operating profit, as the day report does | `weekly` — a 500 reward no longer completes it |
| A doorway on a neighbour's wall could give the *neighbour* a fifth way in (only its own doors were counted) | `neighbourDoor` counts every opening into it | `connection-edges` A2 |
| Without "credit next visit", a complaint about something that **wasn't charged** (a pup that never got a playroom) had no answer that settled it. That meant a forced extra reputation loss, and an upset family staying away 3 days. | When there's nothing to refund, an honest explanation settles it. The poor visit still shows in how the family felt (and so in reputation), but there's no double penalty. No coins are paid out. | `pickup` |

**Tests that claimed more than they checked, now tightened:**
- **`ListView`:** the stale quote is asserted to have changed, with no if/else. The double tap is described
  honestly: the row closes after the first tap. The stale-plan refusal itself is tested in the rules, in
  `confirm-quote`.
- **`confirm-quote`:** the stale Connect it plan is refused unconditionally, and an unrelated change still connects
  for the price shown.
- **`reconcile`:** the mixed run includes a real game-coin refund.
- **`team-ui`:** the level-up test checks that the game clock stands still and runs again, not just a flag.
- **`frontdesk-ui`:** a comment that claimed a double tap lands "before anything re-renders" is corrected.

**Deferred (minor), with reasons:**
- **The full-daycare reason text.** At exactly 200 things, with spots whose new path squares won't fit,
  "Build from the list" says "buy more land or make space" rather than "sell something". My fixture could only
  produce the case where there is genuinely no reachable spot, where that text is right. I didn't ship a wording
  change I couldn't test.
- **"Best day" records in old saves** were set when bonuses still counted as running the daycare, so an old record
  may be higher than the new definition can beat. Recomputing it isn't possible from the 14 days of books a save
  keeps.
- **The credit settlement message across two tabs.** It is shown by the tab that loads the game. If another tab or
  a Shop delivery writes the save first, the coins are settled correctly but the message can be missed or shown
  twice. Coins are right in every case.
- **The guide's "Build a playroom · N coins" button** (the decision step) isn't bound to its shown price. The button
  disappears after the first tap, and the price is computed from the same state.
- **Shop coin packs** are deliberately recorded by the purchase system (not touched), not the day's books. So
  "Change in coins" excludes them.
- **A refund booked with no ledger entry for today** would go on the last entry. This is unreachable today: a
  check-in always creates today's entry first.

## 2. Commands and results (actual)

**Environment:**
- **Where:** a cloud container with 4 CPU cores and no GPU.
- **Browsers:** Chromium headless (Playwright) with an iPhone 13 profile.
- **Not a phone, not a person.**

**Type check and unit tests:**

| Command | Result |
|---|---|
| `npx tsc --noEmit -p .` | Clean (exit 0) |
| `npx vitest run` (default workers), before the review fixes | **147 files, 1,109 tests passed**, exit 0, 79 s. No worker was lost on this machine. The stderr lines "Not implemented: HTMLCanvasElement.getContext / navigation" are jsdom notices, not failures. |
| `npx vitest run` (default workers), final code (`3974827`) | **147 files, 1,114 tests passed**, exit 0, 74 s |

**Browser suites** (dev server, Chromium headless, iPhone 13 profile; desktop too where the suite has it):

| Suite | Result | Notes |
|---|---|---|
| `e2e-empire` | **29 passed, 0 failed** | — |
| `e2e-service` | **46 passed, 0 failed** | — |
| `e2e-tycoon` | **45 passed, 0 failed** | — |
| `e2e-staff` | First run: **56 passed, 2 failed**. After the fix: **58 passed, 0 failed** | **The 2 failures were an outdated check.** It looked for the old wages-only figure ("−1,660") on the Today strip. Since finding 5 the strip shows operating costs: 1,756, of which 1,500 is the sign-on paid so far and 256 is due tonight (wages 160, upkeep and supplies). The check now reads that breakdown (`0a79ad4`). No game code changed for it. |
| `e2e-daycare` (legacy `/daycare`) | **36 passed, 0 failed** | — |
| `e2e-onboarding` | **100 passed, 0 failed** | — |
| `e2e-phone` | **40 passed, 0 failed** | — |
| `e2e-purchases` | **Not run** | It needs its own stub harness: mock Stripe, a stub database and a dev server with stub settings. It stopped at `ERR_CONNECTION_REFUSED`. Purchase code is unchanged in this milestone, and its unit and SQL tests are among the 1,109. |

- **Rerun on the final code (`3974827`, after the review fixes):** service 46/0, empire 29/0, staff 58/0, tycoon
  45/0.
- **Who ran these:** I did, in this container. They are **not independently verified**. The audit's own browser
  checks couldn't launch in its environment.

**Reproductions on the audited code** (a scratch checkout of `dc8fc14`; nothing committed):
- **Finding 1:** running → Build → tap Resume left `paused=false` while Build was still open.
- **Finding 5:**
  - **The Today strip:** "revenue 50, wages 40, other costs 39, profit −29". The "revenue" was actually the
    level-up reward.
  - **Finances' Today column:** "Profit +50".
  - **With the fix, the same state reads:** revenue 0, bonuses 50 (apart), operating costs 79 due tonight, operating
    profit by closing −79, change in coins −1,700. Both screens show −79.

### Performance (`9e1e506` vs `dc8fc14` vs now, interleaved)

**Method — comparable conditions:**
- **Builds:** three production review builds, served side by side:
  - before the empire milestone (`9e1e506`);
  - its end (`dc8fc14`);
  - this milestone's code (`0a79ad4`; the later review fixes don't touch rendering).
- **Measurement:** the same as `qa/perf.cjs` — a fresh profile per run, the test save, a 4 s warm-up, then a 10 s
  sample.
- **Repeats:** each scenario was measured three times. Runs were interleaved, and the build order rotated each
  repetition, so machine drift hits every build alike. The script is in the scratchpad, not the repo.
- **Graphics:** Chromium headless with SwiftShader (software graphics, no GPU). **Not phone numbers.**

| Scenario | `9e1e506` fps (mean, range) | `dc8fc14` fps | now fps | p95 frame ms per run (9e1e506 / dc8fc14 / now) | Screen update ms × updates per 10 s |
|---|---|---|---|---|---|
| Normal day · iPhone · battery saver | 55.5 (52.6–57.1) | 52.6 (51.4–53.8) | 55.3 (54.5–56.2) | 33,17,33 / 33,33,33 / 33,33,33 | 4.5×42 / 5.0×41 / 4.6×42 |
| Normal day · iPhone · standard | 37.1 (36.5–37.8) | 38.5 (37.0–40.6) | 36.1 (35.2–36.6) | 50,50,50 / 50,50,50 / 50,50,50 | 5.3×42 / 4.9×42 / 5.4×41 |
| Normal day · desktop | 27.3 (25.7–29.0) | 27.1 (26.3–28.2) | 26.9 (25.8–27.8) | 83,67,67 / 67,83,67 / 67,67,83 | 4.8×42 / 4.9×42 / 5.1×42 |
| Busy scene · iPhone · battery saver | 32.7 (32.0–33.5) | 32.1 (31.5–32.9) | 32.2 (30.7–34.0) | 67,67,50 / 67,67,67 / 67,50,50 | 7.7×42 / 5.0×41 / 4.7×41 |
| Busy scene · iPhone · standard | 25.6 (24.7–26.1) | 25.8 (25.3–26.6) | 24.6 (23.7–25.6) | 83,83,67 / 83,67,67 / 67,83,83 | 8.6×42 / 5.0×41 / 5.5×42 |
| Busy scene · desktop | 14.4 (14.1–14.7) | 14.0 (13.6–14.9) | 14.6 (14.4–14.9) | 133,150,133 / 133,150,133 / 117,133,133 | 8.1×42 / 4.9×42 / 5.0×42 |

No run had a page error.

**The battery-saver "regression" — what I found:**
- **The last report** compared `9e1e506` measured in one session (59.1 fps, p95 16.8 ms) with `dc8fc14` measured in
  another (54.5 fps, p95 33.3 ms).
- **Interleaved, it doesn't reproduce as a regression:**
  - the base build itself reads 52.6–57.1 fps today;
  - this milestone's build (55.3 mean) is level with the base (55.5).
  - `dc8fc14` averaged about 3 fps lower in battery saver (52.6). That's a little outside the base's range but within
    the spread of the other scenarios, and it isn't present in the current code.
- **Why p95 jumped from 16.8 to 33.3:**
  - the frame timer counts `requestAnimationFrame` intervals, which headless Chromium locks to a 60 Hz vsync. A frame
    is 16.7, 33.3 or 50 ms; nothing in between;
  - p95 therefore flips from 16.7 to 33.3 as soon as more than 5% of frames miss one vsync;
  - at 59 fps about 1.5% of frames are doubled; at 55 fps about 9%;
  - even the base build showed p95 33 in two of its three runs here.
  - **So p95 is a threshold reading in this setup, and fps is the fairer comparison.**
- **Where the main-thread time goes (all three builds):**
  - the 3D update and draw take about 1.1–1.3 ms a frame (normal day) or 2.1–2.6 ms (busy);
  - the simulation about 0.5–1 ms a tick;
  - React screen updates about 5 ms, about 4 times a second.
  - None of that grew. The busy scene's screen updates got cheaper since the base (8 ms → 5 ms, the long list is
    gone), and the page has fewer elements (normal day 378 → 250; busy 944 → 337).
- **Conclusion:** no battery-saver regression in the current code under comparable conditions. The earlier gap was
  measurement drift between sessions plus p95's vsync threshold.
- **Not verified:** a real iPhone's GPU behaves differently from SwiftShader. Phil's iPhone check (§7) is the real
  test.

### First-session pacing (scripted, real new game)

**Method — and what changed:**
- **The old way was wrong.** The play session used to multiply *all* real time by the speed-up factor, including
  reading, tapping and paused time.
- **Now it records two measures, never multiplied together:**
  - **Actual elapsed time** of the scripted run (wall clock);
  - **Running game time:** the minutes the game clock actually advanced, from the clock itself. The guide and pauses
    add nothing.
- **Converting game time:** the normal-speed equivalent of running time is game minutes ÷ 2 per second. An open day
  (07:00–18:00) is 5.5 minutes.
- **The session:** `qa/play-session.cjs`, on a fresh save:
  - Quick start, then the guide;
  - then following the game's own Next objective;
  - 2× game speed between beats;
  - Chromium headless, iPhone 13 profile.

**Measured (scripted AI play — taps far faster than a person):**

| Milestone | Actual elapsed (script) | Running game time | Same at normal speed |
|---|---|---|---|
| First visit complete (Biscuit, in the guide) | 7 s | 0 (the guide holds the clock) | 0 |
| First capacity problem (Rocket has no room, in the guide) | 10 s | 0 | 0 |
| Expansion chosen, placed and connected (playroom wing) | 73 s | 179 game min (day 1, 09:59) | 1.5 min |
| Furnished, staffed (attendant hired), first pup served there | 76–81 s | 181–202 game min | 1.5–1.7 min |
| Back to hands-on care; saving toward the next expansion | 94 s | 251–254 game min | 2.1 min |
| Whole session: 6 game days, 3 expansions, 1 hire | 16.5 min | 3,615 game min | 30.1 min |

- **Counts:** 53 check-ins, 28 checkouts, 34 moments answered, 11 complaints answered, 35 families turned away.
  No page errors.

**Estimated for a person (not measured):**
- **The guide:** about 3–5 minutes of reading and tapping (the clock waits).
- **The first building decision:** reading the options and choosing a spot adds about 1–2 minutes.
- **First visit:** about 3–5 minutes in.
- **A meaningful building decision:** about 5–8 minutes in. That's 1.5 minutes of running clock plus that time.
- These are my estimates. Only Phil's session on a real iPhone can measure them.

**What the scripted run shows:**
- **The first expansion comes very early (09:59 on day 1).** The Next objective recommends it as soon as families
  ask, and the reserve the guide leaves pays for it. This is the balance note above, seen in play.
- **The rules-level proof waits for earnings by choice.** It reaches the same purchase on day 3.

## 3. A reconciled example: earn → costs → expansion → more service revenue

From `business-loop-real.test.ts`, deterministic (seeded), run on the real rules. Every row below is asserted in the
test, not just printed.

**The player's rules:**
- follow the guide (buy the Toy Bin it suggests, and let Rocket rest at home free);
- then care for each pup by hand with its next-action button;
- keep the coins the guide leaves as a reserve;
- expand only when **service operating profit since then** covers it, *after* tonight's not-yet-charged costs, while
  families are asking for a kind of pup the daycare can't take;
- compare the playroom wing with the bath room by estimated payback;
- staff the new room with its own one-tap plan only if its estimated takings cover the wage.

**Start (day 1):**

| Step | Coins | On the books |
|---|---|---|
| Fresh save | 3,000 | — |
| Quick start (lobby, small-gentle playroom, calm room, decor) | 1,300 | Invested 1,750 · bonus 50 (level-up) |
| The guide: Biscuit and Daisy paid; Toy Bin bought; the guide reward and level-ups | **1,500** (the reserve) | Revenue 80 · invested 80 more · bonuses 200 more |

**Day by day** (each night, coins = morning coins + revenue + bonuses + sales − operating costs − invested,
exactly):

| Day | Revenue (families) | Operating costs | **Operating profit** | Bonuses (game rewards) | Invested | Change in coins | Coins |
|---|---|---|---|---|---|---|---|
| 1 | 380 | 103 | **277** | 350 | 1,830 | −1,203 | 1,797 |
| 2 | 336 | 99 | **237** | 150 | 0 | +387 | 2,184 |
| 3 (wing bought 15:18) | 376 | 411 | **−35** | 125 | 540 | −450 | 1,734 |
| 4 | 528 | 165 | **363** | 200 | 0 | +563 | 2,297 |
| 5 | 561 | 169 | **392** | 325 | 0 | +717 | 3,014 |
| 6 | 481 | 169 | **312** | 275 | 0 | +587 | 3,601 |
| 7 | 577 | 165 | **412** | 50 | 0 | +462 | 4,063 |
| 8 | 568 | 167 | **401** | 275 | 0 | +676 | 4,739 |
| 9 | 530 | 169 | **361** | 62 | 0 | +423 | 5,162 |
| 10 | 418 | 161 | **257** | 475 | 0 | +732 | 5,894 |

- **Day 1 starts from the fresh save:** its 1,830 invested includes Quick start and the Toy Bin.
- **Day 3's operating costs include the attendant's 250 sign-on**, which the game books as wages.

**The decision, on day 3 at 15:18:**
- **The limit:** families had asked all morning for **Large & Gentle** pups, and the daycare has no room for them.
  Nobody of that kind had paid before this point. There were no baths at all, because there was no bath room.
- **The comparison:**

  | Option | Cost | Upkeep a day | Estimated takings a day | Estimated payback |
  |---|---|---|---|---|
  | Playroom wing | 540 | 14 | 120 | 5.1 days |
  | Bath room | 830 | 17 | 75 | 14.3 days |

  - **Playroom estimate:** 3 spots × families turned away a day × 40.
  - **Bath estimate:** check-ins a day × 30% bath bookings × 25.
- **Earned, not reserved:**
  - since the reserve: revenue 861 − operating costs 202 − tonight's 105 = **554** service operating profit, ≥ 540;
  - bonuses since then (325) are shown apart and were not counted;
  - coins at that moment: 1,500 + 861 − 202 + 325 = **2,484**, exactly.
- **Bought (`buyExpansion`, the real build):**
  - a 3 × 3 Large & Gentle playroom with a door into the building and three dog beds, for exactly the 540 shown;
  - connected and working;
  - staffed by its own plan: hire an attendant, 250 sign-on plus 40 a day.

**After:**
- **Served there:** 48 Large & Gentle families paid **1,811** from the new room over 8 nights.
- **The room's own costs over those nights:**
  - room and furniture upkeep 112;
  - supplies 96;
  - the attendant's wages plus sign-on 570.
- **The room's net: 1,033.** It has already paid back its 540 build cost.
- **Whole business:** operating profit averaged **257 a day** before the expansion (days 1–2) and **357 a day**
  after (days 4–10). That's after the new wage and upkeep; every day after was positive.
- **Hands-on play continued:** after building and hiring, the player still checked families in, played and checked
  out by hand: 616 hands-on actions after the purchase. All 143 checkouts in the run were done by hand; the
  attendant plays with the pups.
- **Saving for the next expansion:** the game names a bath station (830) as the next expansion, and coins toward it
  grew every day: 1,734 → 5,894.
- **Every payment:** its lines add up to its total, and that is exactly what service revenue gained. Game rewards
  (level-ups, loyalty, trophies) went to bonuses, never into a bill.

## 4. Old-save migrations

| What | How an old save loads | Test |
|---|---|---|
| Day books without `sales` (finding 2) | `sales` = 0 | `reconcile.test.ts` — "an old save whose ledger has no sale field still loads and adds up" |
| Credits a family was owed "next visit" (finding 6) | Settled **once**, on load, as a game-coin refund recorded on today's books (each capped at 500, as credits were). The promise is removed from the guest book; the families are kept. The player is told once ("Credits promised for a next visit (N coins) were settled as refunds today — the game no longer offers credit."). Coins still match the books. A second load settles nothing. | `credit-migration.test.ts` — settled once, books still add up, and a reload adds nothing |
| A visit in progress whose complaint was answered with "credit" | The answer is dropped, so checkout asks again (refund, finish or explain) | `credit-migration.test.ts` |
| A day report without `bonuses` / `sales` | Reports aren't saved (`report: null` on load); the screen treats missing fields as 0 | — |
| A page closed while held (building etc.) | Comes back paused; nothing is caught up | `store-holds.test.tsx` |

## 5. Legacy and protected systems unchanged

- **Files changed:** every file changed in `dc8fc14..3974827` is in the new game, under
  - `tycoon/src/tycoon/`,
  - `tycoon/src/components/tycoon/`,
  - `tycoon/qa/`,
  - or is this report.
- **Not touched:** `src/game/` (the legacy game and its save), `purchases.ts`, Stripe, webhooks, server functions,
  `.env`, DNS or hosting files, or other games.
- **Legacy browser suite (`e2e-daycare`):** 36 passed, 0 failed.

## 6. Private preview

- **Private preview:** https://claude.ai/artifact/Nyuw3aGUoE3Mani6HUgfeP — **version 15**, built from commit
  `3974827` (branch `claude/pawtastic-games-unified`). It's private to you until you share it; nothing was published
  or released, and the live hub is unchanged.
- **Smoke test of that exact build** (Chromium, iPhone 13 profile): loads with no page errors; Quick start shows
  1,300 coins, level 2 and the guide's "Meet Biscuit!".
- **Commits this milestone:**
  - `1e39957` — finding 1;
  - `c635e7b` — finding 2;
  - `394e891` — finding 3;
  - `fe86bc3` — finding 4;
  - `9380fa6` — finding 5;
  - `12fb515` — finding 6;
  - `d65203c` — finding 7;
  - `0a79ad4` — QA: pacing method and the staff check;
  - `3974827` — independent review fixes;
  - then this report.

## 7. Phil's iPhone checklist (about 15 minutes, private preview)

Use a **fresh daycare**: Test tools → Reset, or a private tab. Note anything that feels slow, confusing or unfair.

1. **Start:** tap Quick start and follow the guide. Biscuit's receipt lists each line, and the total is what you were
   paid. The guide's reward shows as a game reward, not as part of a bill.
2. **Build holds time:**
   - with the day running, open **Build**. The clock button says "Time waits while you build" and can't be tapped;
   - leave Build: time runs again;
   - pause first, then open and leave Build: it stays paused.
3. **Reload mid-build:** open Build, start a room (outline and price showing), then lock the phone or reload. The
   game comes back paused; no room appeared and no coins went.
4. **The price you see is the price you pay:**
   - build a room from the list and from the 3D view; compare the coins spent (Finances → Invested) with the button;
   - double-tap Build here and Put it in: you should get one of each, charged once.
5. **Connect it:** remove a room's door with nobody inside, then tap Connect it. It costs exactly the number on the
   button, and the room says how it's reached.
6. **Money screens agree:** the Today strip's "Profit by closing" equals Finances → Summary → Operating profit.
   Bonuses (game rewards) are listed apart.
7. **Pickup complaint:** let a booked bath slip. At pickup, the choices are finish, a refund in game coins, or
   explain. There's **no credit for next time**.
8. **The loop:**
   - when families ask for a kind of pup you can't take, open the options and compare the playroom wing with the bath
     room;
   - build one, furnish it, and staff it if it suggests;
   - check the next pups in there yourself;
   - watch the "saving toward" line for the next expansion.
9. **Feel:** is the day too fast or slow? Is the first expansion too easy to afford (the balance note above)? Does it
   run smoothly in standard and battery-saver graphics (Settings)?
