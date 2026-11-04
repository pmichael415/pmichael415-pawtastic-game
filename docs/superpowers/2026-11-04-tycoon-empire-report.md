# New Daycare (`/daycare-next`) — the old game's flow + a daycare empire: report

Owner brief of 4 Nov ("THE OLD GAME'S FLOW + A DAYCARE EMPIRE"). RollerCoaster Tycoon, FarmVille and Last Asylum are
inspiration only: nothing of their content, layout, art or mechanics is copied. Private preview only: no release, no
change to the live hub, Stripe, purchases, DNS, app.pawtasticacademy.com or the other games. Game coins only; core
play free; no forced waiting. The legacy game (`/daycare`) and its save are untouched.

## In short

<!-- IN-SHORT -->

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

<!-- SESSION -->

## Checks completed

<!-- CHECKS -->

## Performance

<!-- PERF -->

## Independent review

<!-- REVIEW -->

## Limitations and what's not done

<!-- LIMITS -->

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

## Commits (since `9e1e506`)

<!-- COMMITS -->
