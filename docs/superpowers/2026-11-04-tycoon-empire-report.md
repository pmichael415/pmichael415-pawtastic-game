# New Daycare (`/daycare-next`) — the old game's flow + a daycare empire: report

Owner brief of 4 Nov ("THE OLD GAME'S FLOW + A DAYCARE EMPIRE"). RollerCoaster Tycoon, FarmVille and Last Asylum are
inspiration only: nothing of their content, layout, art or mechanics is copied. Private preview only: no release, no
change to the live hub, Stripe, purchases, DNS, app.pawtasticacademy.com or the other games. Game coins only; core
play free; no forced waiting. The legacy game (`/daycare`) and its save are untouched.

## In short

- **Private preview:** https://claude.ai/artifact/Nyuw3aGUoE3Mani6HUgfeP — **version 14** (branch
  `claude/pawtastic-games-unified`, commit `cd04e29`). Nothing was published or released.
- **The old game's flow is back on the world screen:**
  - a front desk above the daycare;
  - rooms at a glance, with a green ✓ where a waiting pup can safely go;
  - one big next-action button in a pup's panel;
  - the camera moves to the pup you select.
  Every familiar interaction is kept, and the legacy game and its save are untouched.
- **The builder works the way you described:**
  - choose a room → see its footprint, door and route in green and the itemised price → confirm → it's built,
    connected and typed for exactly that price;
  - furnish a room you chose; see and fix how each room is reached;
  - pups can never be cut off; the build pause restores your pause state.
  All six symptoms your tester saw are traced to causes and fixed (they tested the hub's older Lovable build).
- **The combined session plays through:** visit → capacity problem → playroom wing or bath station → place → furnish →
  staff → serve → back to hands-on care → save toward the next step. On the game clock (measured) plus an estimate of
  reading and tapping time, it reaches a meaningful building decision in about 7–13 minutes.
- **Earn → reinvest → expand is clear and proven:**
  - profit is shown apart from what you invest, and receipts explain each line;
  - coins match the books to the coin, and staff payments pay once, with coin feedback;
  - the next expansion's price and your progress are always in view, and a purchase that would leave too little for
    tonight's costs warns you first;
  - a run starting from 0 coins bought a playroom wing on day 3 from earnings, and that room then took 691 coins from
    17 families it couldn't serve before.
- **Not proven yet:** a person playing it and a real iPhone. Everything here is tests and AI play in an emulator.

## The build that was tested

- **What your tester played:** the hub's linked `/daycare-next` — the Lovable project's own build (Lovable commit
  `69d4eba`, published 2 Nov). That project tracks a separate copy of the code, so it is **older than the private
  preview** (version 13, branch commit `9e1e506`) and does not contain the last milestones.
- **What I did:** reproduced each of the six symptoms on the current code, found the cause in the code (all six causes
  were still present or had a close cousin), and fixed them there. The hub was not updated — that would be a release.

| Symptom you saw | Cause | Fix |
|---|---|---|
| No layout, door or path tools, even after reload | Build was hidden during the guided tour ("one thing at a time"); in the map and list views the builder is a list of "first free spot" buttons, not tools | **Build is always there** once you've started. In 3D: Rooms (by type, then tap where), Doors, Paths, Furniture (room first). The list builder now quotes and confirms (below) |
| Instructions said "draw rooms and add doors" while the buttons placed rooms in the first free spot | The guide's wording was written for drawing; it didn't match the tools on screen | The guide names the real tools ("Rooms → Lobby, tap a spot by the entrance path — it comes with its door and path. Then furnish it…"), with list/map wording for those views |
| Rooms said "connected" but connections couldn't be inspected or controlled | Nothing showed how a room is reached | Placing a room shows its **door and route in green** and says which ("its door opens into the Lobby — no path needed" / "a new path of 4 squares"). Every room's panel says **"Way in: …"**, or why not, with **Connect it · price** |
| A Water Bowl went into the Lobby while the guide asked for the Playroom | "First free spot" put any-room items in the first working room (the lobby) | **You choose the room first** (3D and list). "First free spot" now prefers where an item does its job (fun → playroom) |
| Open, but the guide's "Open for business" step unfinished | That step ticked on the first **checkout**, not on opening | Renamed **"Serve your first family"**; once open it says "✓ You're open. Now check the first pup in…" |
| Lobby charged 570 against "from 430", with no final quote | The listing showed room + door; the path squares were added at payment | Each listing shows the **exact price** ("Room 400 + door 30 + path 14 × 10 = 570") and where it goes, and **asks before charging**. The new browser test reproduces the very 570 |

## What changed

### 1. The old game's flow, on the world screen

I compared the two games side by side first. The old `/daycare` has the better flow because the next thing to do is
always in front of you. The new game had the same rules but hid them in a long list under the 3D view.

What's on the 3D screen now, above the daycare:

- **The front desk** (the old game's yellow bar): every family dropping off — name, temperament, what they booked
  ("daycare + bath"), how long they've waited — with **Check in** right there. Families back for pickup show
  **Check out**, which uses the same pickup sheet as before (receipt, concerns, exit bath), so it pays once.
- **Rooms at a glance:** a chip per room with how full it is ("Playroom 1 · Small & Gentle · 2/3", "1/1 tubs busy").
  When the pup you've selected is waiting, the rooms it can safely go to turn green — **"✓ Move Biscuit to Playroom 1"** —
  one tap moves it, using the same rules staff use.
- **A pup's panel** leads with one big button for the next thing: Check in → its matching playroom → the bath it
  booked → Playtime → Check out. The other actions are still underneath. When there's nothing to do, it says why
  ("All set — Parker picks up at 14:09", or "No free Large & Active spot — a playroom for them would take Rocket").
- **Selecting a pup moves the camera to it,** so you see where it is.
- The long list under the 3D view is gone. It is still the whole game in the list view, and when 3D can't run.

**Old interactions kept, unchanged:** check-in at the desk, choosing a safe matching room, playtime, calm down, baths
and exit baths, mopping, the pickup sheet with receipts and concerns, check-out paying once, moments ("✨ Luna wants to
play fetch"), turning a family away for free. The legacy `/daycare` game and its save were not touched; the two saves are
never merged.

### 2. Building a room you can use

**In 3D:** Build → **Rooms** → choose the type (Playroom asks which pups) → tap where it goes. The outline shows the
room, **its door in green** and, if it needs one, **the new path to the entrance in green**, with the whole price
itemised ("Bath Room 3 × 2 · Room 300 + door 30 + path 2 × 10 = 350"). Then:

- **Build here · 350** builds the room, its door, the path and its type in one step, for exactly that price;
- next to a room you can reach, the door **snaps into that room** — no path, no path cost;
- a spot with no way in, or on top of something, is **red and says why**, and there is nothing to confirm;
- **Cancel** costs nothing; Turn / Smaller / Bigger change the outline before you pay;
- a double tap builds one room;
- the old two-corner drawing still works, and now also builds the door and path it quoted (it used to charge only the
  walls and leave the room unconnected).

**Furniture:** choose the room first (from a list, or tap it in the daycare). A new room leads straight into furnishing
it. The catalog offers what fits that room and says where the rest goes ("Goes in a Bath Room"). The item waits at the
room's first free spot (tap another square to move it); **Put it in Playroom 3** places it there and only there.

**Connections you can see and control:** every room's panel says how you get in ("✓ Way in: a door into the Lobby") or
why you can't ("Its door opens onto the grass — pave a path…"), with **Connect it · 30** for the cheapest door or path.

**Never trapping pups:** removing a door, selling a path or a room, or moving a room is refused if it would cut off a
room with pups inside ("That would cut off the Playroom with pups inside — move them out first, or add another way
in"). With nobody inside it's your call.

**Building pauses the day,** and Done building restores whatever it was (running stays running, paused stays paused).

**The list builder** (list view, and when 3D can't run) shows each room's exact price and where it would go, asks
**"Build it for 570?"** before charging, and asks which room furniture goes in, suggesting the one where it does its job.

### 3. Running what you built

After a new room opens — from **Expansion options** or from the Rooms tool — its panel finishes the job:

- **What it does for families:** "1 tub — families who book a bath or an exit bath get one here", "3 spots for Small &
  Active pups — check one in and it's offered here", "3 overnight beds".
- **Who runs it**, with one tap: "Make Sam your bath attendant" (someone free), "Add it to Alex's rooms" (an attendant
  who looks after other playrooms), or "Hire a daycare attendant · 250, then 40 coins a day". When covered: "✓ Sam runs
  the baths." Hands-on stays valid: "No one runs baths yet — you can bath pups yourself."
- **Furnish it** goes straight into furnishing that room.

Staff use the player's own actions (check-in, rooms, play, bath, checkout), so a handoff can't double a charge or a
reward; that rule and its tests are unchanged.

### 4. Earn → cover costs → reinvest → serve more (your follow-up brief)

Most of the money loop already existed (visits pay at checkout, nightly wages/upkeep/supplies, the ledger, the Today
strip, Finances, expansions with exact quotes). What changed:

- **Profit means what running the daycare made:** revenue − running costs (wages, upkeep, supplies, marketing,
  refunds). Building is shown on its own as **what you invested**. Before, a day you expanded showed as a red "loss"
  and couldn't count as a "profitable day" — even though the goal's own words said "more than the day's wages, upkeep
  and supplies". Now the day report ("Running the daycare +404 · You invested 540"), the Today strip
  (Revenue · Wages · Other · **Profit** · **Invested**), Finances (Profit, Invested in building, Change in coins; the
  14-day chart) and the records all use it.
- **The day report says where the money came from and went:** "Earned: daycare 420 · baths 60 · tips 22 · Running
  costs: wages 80 · upkeep 37 · supplies 18".
- **Receipts explain each line:** "Daycare — 85% happy, so 46 of 50", "Tip — delighted with the day (Appeal 6)",
  "Boarding — 1 night", "Bath — deluxe tub (+10)". A loyalty milestone bonus is now a receipt line too, so the
  receipt total is exactly what the family paid.
- **Coins always follow the books:** level-up rewards were added to coins without being recorded; they are now
  bonus income, so the ledger and your coins match to the coin.
- **Staff checkouts look and sound paid:** coins fly at the desk and the receipt shows, as when you do it yourself.
  They were already paid exactly once under the same rules; that's now proven again (below).
- **The next expansion is always in view:** the objectives show "💰 Saving for Playroom wing for Large & Active pups ·
  350 of 540 coins" with a progress bar — what families asked for first, otherwise the cheapest unlocked option.

**Proved by a deterministic run** (`business-loop.test.ts`, a player pressing each pup's next-action button, in a
daycare that starts with **every starting coin spent — 0 coins**):

| Day | Income | Running profit | Invested | Coins at night |
|---|---|---|---|---|
| 1 | 334 | +239 | 0 | 239 |
| 2 | 351 | +254 | 0 | 493 |
| 3 | 523 | +404 | **540** (playroom wing for Large & Gentle pups, bought at 14:00 with 669 earned coins) | 357 |
| 4 | 519 | +406 | 0 | 763 |
| 5 | 866 | +743 | 0 | 1,506 |
| 6 | 540 | +421 | 0 | 1,927 |

- **A visit earns coins:** the first checkout (Willow, Small & Gentle, 13:42 on day 1) paid 36, and today's income rose
  by exactly 36. All 68 payments in the run matched their receipts exactly.
- **Costs are accounted for:** every night wages, upkeep and supplies were charged, and coins at night equal the
  morning's coins + income − every expense, to the coin, every day.
- **The expansion was bought with earned profits** on day 3: the daycare had started at 0.
- **It served demand that was being turned away:** no Large & Gentle family could stay before it; in the three and a
  half days after, **17 families paid 691 coins from that room** — against about 32 coins of its upkeep. Payments went
  from 18 in the first two and a half days to 50 in the rest.
- **Staff checkouts:** a receptionist's checkout paid the receipt once (income and coins both rose by exactly the
  total), and the pup can't be charged again.
- **A free way back:** at −150 coins building pauses, letting an employee go is free, care and checkouts still
  work, and serving by hand brought coins back above zero within two days. Dog safety never depended on coins.
- **Opportunity, not a guarantee:** a new room costs upkeep from its first night and earns only when pups are served
  in it.

## The combined session, played

**How this was played:** AI play — Claude driving the real screen in Chromium with iPhone 13 emulation (software
WebGL). It is **not a person and not a real iPhone**. Game time ran 2× faster between beats, and the script taps far
faster than a person, so the pacing below separates what was measured from what is estimated.

**The session (fresh save, Quick start), beat by beat:**

1. **A familiar hands-on visit.** The guide brings Biscuit: Check in at the desk → ✓ Move to Playroom → Playtime →
   Check out, paid with a receipt. Then Daisy, and a choice of first upgrade (Toy Bin).
2. **A capacity problem.** Rocket arrives with no room for a Large & Active pup ("build or let him rest"). After the
   guide, families of kinds with no playroom book elsewhere and are counted: "9 Small & Active families asked today
   — give them a playroom".
3. **The choice.** The ways-to-grow card compares a **Playroom wing** ("+3 spots for Small & Active pups… each worth
   about 40 coins a day") with a **Bath station** ("families can book baths, about 3 in 10 do, 25 coins each") and
   others, each with price, upkeep and what it needs to run.
4. **Place and connect.** The session chose the playroom wing, flipped through the offered spots (each shown as an
   outline in the daycare), and built at spot 2 — 540, connected, charged once. The other path, Build → Rooms →
   type → tap, was played in the browser checks.
5. **Furnish it** from the new room's panel: a Toy Bin, put in that room.
6. **Assign staff** from the same panel: "Hire a daycare attendant · 250, then 40 coins a day".
7. **Serve arrivals there:** Bear, a Small & Active pup, was checked in and played in the new room the next morning.
8. **Back to personal care:** checking Scout in and answering ✨ moments by hand.
9. **Save toward the next expansion:** the objectives show the next step and its progress. On day 4 the session
   bought a **Bath station (830)**, and baths were booked and paid that day (25) and the next (75).

**Measured (game clock — exact at normal speed, where an open game day is 5.5 real minutes):**

| Beat | When (game time) | Running clock to get there |
|---|---|---|
| First visit complete (Biscuit) | during the guide (the clock waits) | 0 |
| First "no room" family | day 1 08:38 | 49 s |
| Families-asked objective | day 1 16:20 (this run) · 08:49 (the run before) | 4.6 min · 55 s |
| Expansion built, furnished, staffed | day 1 16:27–16:34 (the clock waits while building) | 4.7 min · 1.3 min |
| First family served in the new room | day 2 07:10 (this run) · day 1 10:14 (the run before) | — |

**Estimated for a person:** the guide takes about 3–5 minutes of reading and tapping (it waits for you). Taps and
choices while the clock is paused add roughly 2–3 minutes. So the **first visit lands in about 3–5 minutes and the
first meaningful building decision in about 7–13 minutes**, within your 10–15 minute target. This is an estimate
from the game clock plus a count of actions, not a stopwatch on a person — your iPhone test is the real measure.

**What the session also showed (honestly):**

- **Spending everything has consequences.** The script bought a second playroom wing at 16:57 with 558 coins and was
  left with 18, then started day 2 at **−115**. Building paused while caring and checkouts went on, and by day 3's
  morning it was back at **+532** — the free way back working in play. Since then, a purchase that would leave less
  than tonight's costs says so before you confirm.
- **Over-expanding without staff hurts service.** By day 3 it had four playrooms, one attendant and no receptionist,
  and the script (which can't keep up like a person) let families wait 60 minutes at the desk and rooms get dirty.
  Reputation fell from 84 to 40 and fewer families came (day 4 income 198). That's the economy doing what you asked:
  more rooms are an opportunity, not a guarantee. The game names each cause ("waited 60 minutes at the front desk",
  "Playroom 4 looked dirty"). It also shows that a hire would have helped, but the script's early hire failed (a
  pup's panel covered the Team button; the script now closes it first).
- **Two script slips fixed along the way:** it once left build mode open, which pauses the day, and it once tried
  to furnish with no coins. Neither was a game bug.

## Checks completed

| Check | Result |
|---|---|
| Unit and UI tests | **1,065 / 1,065** (987 before this milestone). New suites: builder flow, connected building, next action, front desk, room care, business loop, review fixes |
| Typecheck | clean |
| Browser suites (Chromium, **simulated** iPhone 13 / Pixel 7 / desktop, software WebGL) | **empire 29/29** (new: snap/path/blocked, double taps and coins, furniture targeting, both investments then serving there, build pause, reload, landscape) · tycoon 45/45 · onboarding 100/100 (both starts, all views) · staff 58/58 (handoffs) · service 46/46 (old save, reload, double-tapped checkout) · phone 40/40 (background pause, portrait) · legacy daycare 36/36 · hub 37/37 · games 35/35 |
| First-week balance bot and hands-off team | pass |
| Preview security check | passes, apart from the same three blocked self-hosted font loads as before (the page falls back to the system font) |
| Play sessions (AI play, iPhone 13 emulation) | three: two cut short (one by my own code reload, one restarted for a script slip), one complete to day 6 |
| **Not tested** | a person playing; **real iPhone Safari** (all phone checks above are simulated) |

**What each part of your test list was checked by:**

| Your test list | Covered by |
|---|---|
| Fresh and existing saves | onboarding suite (fresh saves); service suite (an old save loads; a reload mid-visit); saves parse through the same validator as before; the legacy `/daycare` save is untouched |
| Both starts | onboarding suite (Quick start and Build from scratch, in 3D, map and list); the tycoon suite builds from scratch in 3D the new way |
| Both investments | empire suite (playroom wing and bath station, each furnished, staffed and serving); play session (both, bought in that order) |
| Doors, paths, blocked routes | empire suite and unit tests: snap into a neighbour, an 11-square path, an overlap refused, Connect it, a neighbour's door for small rooms |
| Furniture targeting | builder-flow, build-ui and list tests; empire suite (tub in the bath room only) |
| Double taps and coins | empire suite (Build here and Put it in double-tapped: one each, charged once); service suite (double-tapped checkout); business-loop proof (68 payments, each exactly once) |
| Player/staff handoffs | staff suite 58/58; staff-checkout proof |
| Save/reload and background pause | empire suite (reload after building); phone suite (hidden tab pauses, resumes) |
| Familiar interactions after expansion | empire suite (check in at the desk → the new room → play → out); play session |
| Portrait and landscape | every phone suite is portrait; the empire suite builds in landscape |
| Normal and busy performance | below |

## Performance

**Environment:**
- **Browser:** Chromium headless, SwiftShader software rendering, no GPU.
- **Screen:** iPhone 13 size.
- **Build:** the private review build.
- **Method:** 10-second samples after a warm-up.

**These are not phone numbers.** This machine was slower today than for the last report, so I measured the build from
before this milestone on the same machine, for a fair comparison:

| Scenario | Before this milestone (`9e1e506`) | Now |
|---|---|---|
| Normal day, battery saver | 59.1 fps · p95 16.8 ms | 54.5 fps · p95 33.3 ms · 1/574 frames over 50 ms |
| Normal day, standard | 39.7 fps | 40.9 fps |
| Normal day, desktop | 26.6 fps | 27.1 fps |
| Busy scene, battery saver | 33.5 fps · p95 50 ms | 31.2 fps · p95 66.6 ms |
| Busy scene, standard | 25.4 fps | 24.1 fps |
| Busy scene, desktop | 14.4 fps | 14.5 fps |

- **Comparable:** four scenarios are within about ±5%. The two battery-saver scenarios are 7–8% lower.
- **Screen updates:** they got cheaper in the busy scene (8 ms → 5 ms a render) because the long list is gone.
- **The savings line:** it is now worked out only when something it depends on changes.
- **On a physical iPhone:** still not verified.

## Independent review

A separate reviewer (a fresh agent that hadn't written the code) read the whole milestone diff and probed it with
throwaway tests. It found **11 defects, 9 confirmed**. All 11 are fixed, each with a test that failed first
(`review-empire.test.ts` and UI tests):

1. **Connect it could half-apply** near the 200-thing limit (said "Connected!", charged less, still not connected).
   Routes are now checked against the limit up front, and Connect it verifies it connected for exactly the price
   shown, or changes nothing.
2. **A quick double tap on Put it in bought two items.** One per tap now (the button stays, on purpose, for placing
   another).
3. **A pup in the bath didn't count as inside the bath room,** so its door could be removed mid-bath. It counts now.
4. **Moving a path square could cut off pups.** Refused now, like selling it.
5. **"Add it to X's rooms" could be refused** when one of their rooms had been retyped. Only playrooms are listed now.
6. **Connect it could offer a fifth door.** Never now.
7. **A 2 × 2 room couldn't be built** (no wall long enough for a door). It now gets a door on a connected
   neighbour's wall, as the starter calm room has.
8. **"Way in" listed rooms reached *through* this room,** and called a blocked door "onto the grass". Now: "Way in: a
   door onto the path to the entrance", and "Its door is blocked…".
9. **A price could change between quote and tap** (hard to reach). Building now refuses, with nothing charged,
   if the price isn't the one you saw.
10. **The playroom group picker had no Back.** It has one.
11. **A pup waiting inside with no free spot** could be lost once its panel closed. The front desk lists them too
    ("waiting for a spot", "in the calm room").

The reviewer also checked and found correct:
- no partial building;
- already-paved squares aren't charged;
- the trap check covers lobby, calm and boarding pups;
- Build here, Connect it, Hire and Check in all ignore a second tap;
- checkout pays once;
- the build pause restores your pause state.

## Limitations and what's not done

- **A person and a real iPhone:** everything here is tests and AI play in an emulator. The pacing is the game clock
  plus an estimate of reading and tapping time, not a stopwatch on a player.
- **A player working alone still gets overwhelmed when they over-expand:** with four playrooms and one attendant,
  families waited at the desk and rooms got dirty, and reputation fell. The game explains each cause and suggests
  hiring. But nothing yet nudges a player *before* they over-build (for example, "your team can look after about N
  pups"). It is worth watching in your test.
- **The list builder still picks the first free spot from the top-left.** It now quotes it exactly and asks first; in
  3D you choose the spot yourself.
- **The stage celebration** can appear while you're furnishing (the moment a room starts working). Continue returns
  you to where you were.
- **On the next-milestone roadmap, as you asked:** relationships with returning families, collections, more
  customization, new land beyond today's parcels, and other fictional locations.
- **Nothing published:** the live hub, the Lovable project, Stripe, purchases, DNS, app.pawtasticacademy.com and the
  other games were not touched. The preview is private.

## Phil's iPhone test (about 15 minutes, private preview)

1. Open the preview and choose **Quick start**; follow the guide with Biscuit. Is it clear where Biscuit is and
   what to do next (the big button in the panel, the green ✓ room)?
2. Watch the **front desk** above the daycare during the first morning. Check families in from there.
3. When Next says families asked for a kind of pup you can't take, open the options and compare a **Playroom wing**
   with a **Bath station**. Build one at a spot you like.
4. In the new room's panel: **Furnish it**, then hire or assign someone to run it. Then serve a family there.
5. Tap **Build** → **Rooms** → a type → tap the grass in a few places: does the green door and path make sense? Try a
   spot next to a room (the door snaps in). Cancel, then build one for real.
6. Tap a room and read "Way in". Try selling the path in front of the lobby while pups are inside (it should refuse).
7. Tell me: did the familiar care feel as good as in the old game? Did building feel free and clear? Did you finish
   wanting to build the next thing?

## Decisions made for you

1. **Build is available during the tour.** The earlier "one thing at a time" rule hid every building tool; your brief
   asks to step into building freely, so it now replaces that rule. **If wrong:** a first-time player can wander off
   the tour (the coach stays and still guides).
2. **A new room is always built with its way in** (door, and path if needed), for the quoted total, and a spot with no
   way in can't be built. **If wrong:** someone who wanted to wall in a room first and connect it later can't; Connect
   it covers rooms that lose their connection.
3. **Never trap pups** is a hard rule: changes that would cut off an occupied room are refused. One older test (selling
   the only path with a pup inside was allowed) was updated to the new rule.
4. **"Open for business" became "Serve your first family"** — renamed to match what ticks it, rather than ticking it on
   opening, so the guide still walks through a whole first visit.
5. **The list builder keeps its spot choice** (the first free spot from the top-left) and now quotes it exactly and asks
   first. In 3D you choose the spot yourself. **If wrong:** in the list view a room can land far from the entrance
   with a long path; the quote shows it before you pay.
6. **The front desk and rooms strip are for the 3D screen.** The list view keeps its own front desk (two would repeat).
7. **Staffing from a room's panel** only offers someone free, or adding a room to an attendant's rooms, or a new hire —
   it never takes someone off another job (that's a trade-off you make in Team).
8. **Fun items go where pups play** when you use "first free spot"; your own choice of room always wins.
9. **"Profit" is running profit** (before building); building is "invested". The report still keeps the change in coins
   (profit after building), which an older audited test pins. Records and the "profitable day" goal use running profit,
   as the goal's wording already said. **If wrong:** a record can come on a day your coins went down because you built.
10. **Level-up rewards are recorded as bonus income** (they were added to coins silently), so the books always match
    coins. One older test that read the day's whole bonus income now reads the rush-hour bonus alone.
11. **A loyalty milestone bonus is a line on the receipt,** so the receipt total is exactly what the family paid.
12. **The low-coins warning never blocks.** It explains tonight's costs; you can still buy. **If wrong:** players can
    still spend down to below zero, then recover by serving families, with building paused until they do.
13. **"Saving for" picks Next's expansion first,** then what families asked for, then the cheapest unlocked option. It
    hides when Next already shows that progress.
14. **Waiting pups at the desk:** pups checked in but waiting for a spot (or in the calm room) are listed at the front
    desk, so they're never lost behind a closed panel.

## Commits (since `9e1e506`)

- `4da3fa9` The old game's flow on the world screen: front desk, rooms at a glance, next-action button, camera focus.
- `fe9ac42` Building by type → spot → door and route → price → confirm; furnish a chosen room.
- `cc11acc` Exact quotes and a confirm step in the list builder; the guide names the real tools; Build always there;
  "Way in" and Connect it; never cut off pups.
- `01cfefa` One front desk in the list view; the browser walkthrough builds the new way.
- `acb74bd` A new room's panel: what it does, who runs it, Furnish it.
- `5ee1b9e` Objective buttons close a covering pup panel; pacing measurement; the empire browser check.
- `1093810` Economy: running profit vs invested; receipts that explain; coins follow the books; the loop proven.
- `36799d1` The independent review's 11 fixes.
- `7d1dd0d` Staff payments fly coins; "Saving for" the next expansion.
- `2bd3fc2` Smart-spending warning; the savings line follows Next.
- `cd04e29` Performance: the savings line and rooms strip do less work.
- Plus QA script updates and this report.
