# New Daycare preview (stage 1) — decisions made during the build

From the build ledger of `docs/superpowers/plans/2026-11-01-daycare-tycoon-stage1.md` (2 Nov 2026). Each ruling is a call made
where the plan and spec didn't settle something, with what it costs if it was wrong. Deferred minors are small review
findings left for later, on purpose.

## Rulings (63)

- Task 1: Ruling: the spec uses id "bench" for both the lobby Waiting Bench (furniture) and the outdoor Bench (scenery); ids must be unique, so the outdoor one is "park_bench" (name "Bench") — cost if wrong: one rename.
- Task 2: Ruling: PRICE_DEFAULTS/PRICE_RANGES live in catalog.ts (state.ts needs them for loading); business.ts (Task 7) re-exports them — cost if wrong: none.
- Task 4: Ruling: dogs waiting in the lobby (place.kind "lobby") now count as inside the Lobby room for move/sell checks (Task 3's dogsIn ignored them) — spec §4.4 "Nothing with dogs in it can be moved or sold" — cost if wrong: players can't sell the Lobby or its bench while dogs wait.
- Task 4: Ruling: paintPaths paves as many valid squares as the coins cover (in drag order) rather than all-or-nothing — spec silent; partial paving matches square-by-square painting — cost if wrong: one rule change.
- Task 5: Ruling: connectivity ignores open/closed (a closed room or path still connects what's behind it; a closed room's own status is "Closed") — spec says closed things "do nothing" but closing to save money shouldn't silently disconnect a wing — cost if wrong: one filter in connectedRooms.
- Task 5: Ruling: guidedBuild puts the counter at (16,24) and the bench at (16,22) so no door's inside square is covered; the Calm room's door is the Lobby's west door (a 2 × 2 room has no non-corner wall segment) — cost if wrong: fixture positions only.
- Task 6: Ruling: the plan's test lists "Mini Hurdles" in unlocksAt(5), but spec §4.2 sets hurdles' unlock to 4; the spec wins — unlocksAt(4) has Mini Hurdles, unlocksAt(5) doesn't — cost if wrong: one catalog number.
- Task 6: Ruling: CAMPAIGNS (Flyers/Online ads/Open house with price, boost, days, level, reputation) live in catalog.ts so unlocksAt can name them; Task 7's business.ts uses that table — cost if wrong: none.
- Task 6: Ruling: building XP can cross a level and pay its 25 × N reward, so Task 4's upgrade test now starts at player level 2 to keep exact coin checks — cost if wrong: none (test setup only).
- Task 6: Ruling: gainXp calls onLevel once per level crossed (2, 3, 4, 5), not only the highest — each tycoon_level event matches one level reached — cost if wrong: analytics counts.
- Task 7: Ruling: the plan expects demand 0.3 at price 80, but the spec formula clamp((47.2/80)^1.5, 0.3, 1.6) gives ≈0.453 (the floor needs price ≥ 105, above the 80 max); the spec formula stands and the test checks the floor at reputation 0 — cost if wrong: one balance number.
- Task 7: Ruling: the plan's Review Focus 3 says "earn 40 brings coins to 4, then spend(10) works" — 4 coins can't pay 10; the test shows the pause lifts (spend(10) now says "Need 6 more coins.", spend(4) works) — cost if wrong: none.
- Task 7: Ruling: furniture inside a closed room costs no upkeep (closing a room closes its contents) — spec "Closed things cost nothing"; Review Focus 2 — cost if wrong: small upkeep difference.
- Task 7: Ruling: DayLedger gains `checkouts` (parsed from saves, default 0) so the day report can count checkouts; countToday(s, "checkIns"|"checkouts") is the run loop's counter — cost if wrong: none (additive field).
- Task 7: Ruling: error messages keep the house style with a full stop ("Paused until your coins are back above zero.", "Unlocks at level 5.") — cost if wrong: copy only.
- Task 7: Ruling: closeDay advances `day` and starts the next ledger day; the run loop (Task 8) resets the clock — cost if wrong: Task 8 wiring.
- Task 8: Ruling: the plan expects 4–14 arrivals at default prices and <4 at price 80 over 660 game minutes, which the spec formula can't give (0.04/min × 540 open minutes × demand ≈ 28 at 40, ≈ 10 at 80; with nobody taking pups in, the 4 waiting spots cap both at 4). The test takes every pup straight in and checks 14–42 at 40 (seeded: 25) and under half that at 80 (seeded: 10); a separate test shows arrivals stop at the waiting cap — cost if wrong: arrival tuning (Task 10's playthrough is the check).
- Task 8: Ruling: the day clock (and so day-end expenses) runs only while the daycare is open; care (decay, scuffles, staff rest) runs whenever the game is on screen — spec "expenses are only charged for game days actually played"; building before opening never costs wages — cost if wrong: one condition in tick.
- Task 8: Ruling: calming down always works — a working Calm-Down Room, else any Calm-Down Room, else the lobby desk — safety never depends on connections or money — cost if wrong: none.
- Task 8: Ruling: assignRoom to a disconnected room says "Not connected — link this room to the entrance with doors and paths." (starts with the plan's "Not connected") — cost if wrong: copy only.
- Task 8: Ruling: hiring is recorded as a "wages" expense (paused below zero like building); the welcome-back bonus and friendship milestones are "bonus" income — cost if wrong: ledger category only.
- Task 9: Ruling: "fully booked" needs at least one working playroom with every spot taken and every working boarding bed taken (a daycare with no beds can still be fully booked); "first boarding night" counts a checked-in boarder — spec names them only — cost if wrong: trophy timing.
- Task 9: Ruling: the optional paint step's "Skip this step" uses markPainted (guide.painted means painted or skipped); trophy and guide rewards are "bonus" income — cost if wrong: none.
- Task 10: Ruling (found by the balance bot): checkout pays only when a pup leaves a playroom or boarding bed; from the lobby or calm-down room it goes home free (no pay, no XP, no penalty). Without this, check-in → checkout at the desk (or via the unlimited calm room) paid ~35 coins a pup with no playroom at all, so dog spots wouldn't matter — spec §4.2 makes dog spots the capacity — cost if wrong: one rule; the owner should hear about it. Test: run.test "only pups leaving a playroom or bed pay…" RED→GREEN.
- Task 10: Ruling: no constants tuned. Seed "week1": guided build 1,600; non-building profit 179–689 every day; lowest coins 92; level 3 at day 1.19 (earlier than the spec's "around day 3", driven by day-1 building XP, which the allowed knobs don't touch), level 5 at day 4.87 — the plan's assertions (by 4.5 / by 7.5) pass — cost if wrong: early levels come faster than designed.
- Task 11: Ruling: placeFirstFree uses 3 × 2 (not 2 × 2) for Calm-Down and Staff rooms — a 2 × 2 room has no non-corner wall segment, so it couldn't get a door of its own — cost if wrong: a slightly bigger default room in the list view.
- Task 11: Ruling: placeFirstFree builds a room in one step (draw, type, door, paths): the door goes into a connected neighbour when one is adjacent (no path needed), else the cheapest door + shortest free route to a reached path square; the full price is checked before anything is spent — cost if wrong: list-view behaviour only.
- Task 11: Ruling (found by the list-view test): furniture goes first to a room that needs it to start working (e.g. each new playroom's first dog bed), then working rooms, then the rest — the brief's "first working room" put every dog bed in the first playroom — cost if wrong: list-view placement only. Test: build-first-free "an item goes first to a room that needs it" RED→GREEN.
- Task 11: Ruling: the hub's logo alt text said "daycare, boarding and grooming"; changed to "daycare, boarding and baths" (owner: services are daycare, boarding, baths/exit baths; no haircuts) — cost if wrong: alt text only.
- Task 11: Ruling: the list view's waiting area is "Front desk" (the Lobby room keeps its own card) so screen readers don't hear two "Lobby" regions — cost if wrong: copy only.
- Task 12: Ruling: the world snapshot gains an optional `pickMode` ("objects" | "tiles" | "edges") so the build UI decides what a tap means (no tool: dog → thing → room → tile; placing: tiles; door tool: edges within 0.35) — the brief's snapshot had no way to tell build mode from edit taps — cost if wrong: one field.
- Task 12: Ruling: buildRoom takes an optional doorEdges set (every room's door edges) so a door on either side of a shared wall leaves a gap whichever room draws the edge first — cost if wrong: none.
- Task 12: Ruling: webglAvailable is copied into tycoon/render/world.ts so the new stage's chunk doesn't pull in today's whole renderer — cost if wrong: none.
- Task 13: Ruling: the playable page body moved into components/tycoon/TycoonPlay.tsx (the route keeps the header and links), so build mode can be tested without a router — cost if wrong: none.
- Task 13: Ruling: beside the 3D view the list view is compact (front desk + pups by room); the full list view (rooms, builder) shows when 3D is off or unavailable, as the plan says — otherwise the page had two of every build control — cost if wrong: layout only.
- Task 13: Ruling: Ghost gains a "paths" kind for the pending path squares — the single-ghost union couldn't show a painted run — cost if wrong: one union member.
- Task 13: Ruling: Doors are ghost-first with an "Add door · 30" button (and "Remove door · +22" on an existing door), rather than adding on the tap itself — a stray tap shouldn't spend coins — cost if wrong: one extra tap.
- Task 13: Ruling: the 3D view's zoom/reset/list buttons moved to the bottom-right — the sticky status bar covered the top-right on phones (found in the browser smoke check) — cost if wrong: none.
- Task 14: Ruling: Finances adds a sixth "Trophies" tab — spec §3 puts the trophy shelf in the Finances screen — cost if wrong: one tab.
- Task 14: Ruling: Supplies (basic/premium) live on the Staff tab next to wages — spec §4.7 has them but §3 names no tab for them — cost if wrong: placement only.
- Task 14: Ruling: price sliders are native range inputs (labelled, keyboard and touch friendly, testable) with a fair-price tick; tycoon_price is sent when the slider is released, not on every step — cost if wrong: event volume.
- Task 14: Ruling: the 14-day profit chart uses the dataviz reference diverging pair (blue #2a78d6 profit, red #d0473f loss; validator: all checks pass), bars ≤16px with rounded tips square at the zero line, value label on the latest day, per-bar focus/hover labels, and an aria-label listing every day — cost if wrong: styling only.
- Task 14: Ruling: tapping the sign (no tool) opens the sign card, which has "Move or sell the sign" for its edit panel — cost if wrong: one extra tap to edit the sign.
- Task 15: Ruling: the trophy shelf moved into the Finances Summary tab (TrophyShelf), replacing Task 14's sixth "Trophies" tab — the brief and spec §3 ("five tabs") put it there — cost if wrong: none.
- Task 15: Ruling: music only starts after the player's first tap on the page (browsers block audio before a gesture) and stops when the tab is hidden or Music is switched off; sound effects play on actions (taps) — cost if wrong: music starts a tap later than the page.
- Task 15: Ruling: the checkout "+N" is the existing toast text ("… went home happy! +N") plus a coin burst over the pup's room in 3D; a separate floating number over the dog is left for stage 2's walking dogs — cost if wrong: one more effect.
- Task 16: Ruling: Cloud Bed and Lighthouse Fort are playroom furniture (price 0, paid: "deluxe-decor"), not Play-tab outdoor items as spec §4.8 lists them — beds belong inside rooms (pre-planned in the brief) — cost if wrong: two catalog rows.
- Task 16: Ruling: ownership lives in an in-memory registry (src/tycoon/paid.ts) that the page fills from fresh server entitlements (status "ready" and the pack owned) and empties when it unmounts; engine functions (placeThing, moveThing, caps, roomStatus, funAppeal) take an optional `owned` set defaulting to it, so nothing paid counts unless the server says so (fails closed for guests, errors and tests) — cost if wrong: a refactor to thread `owned` explicitly.
- Task 16: Ruling: pack ownership uses the owned pack (not the "show it" preference toggle) for placing decor; the navy star bandana uses the preference (visuals) like today's game — cost if wrong: one condition.
- Task 17: Ruling (found by e2e): the sign and other low/thin items couldn't be tapped (the ray to a square's centre misses them); with no tool, a tap now resolves by square — dog (on screen) → item on that square (paths last) → the room around it → the square. Rooms, furniture and paths are baked into one mesh per material (draw calls 554 → 165; 12 rooms + 200 things: 34.5 fps in SwiftShader), so picking no longer raycasts meshes — cost if wrong: tall items are picked by their footprint, not their top.
- Task 17: Ruling (found by e2e): the level-up overlay is portalled to <body> at z-70 — buying land (XP) can level you up while the Land sheet is open, which hid the celebration — cost if wrong: none.
- Task 17: Ruling: DEV-only hooks in store.ts (window.__tycoonSpeed up to 64×, __tycoonSet, __tycoonState, __tycoonArrive, __tycoonStress), guarded by import.meta.env.DEV; the QA plays 3 days at 64× (8× would take ~2 minutes a day) — cost if wrong: QA runtime only.
- Task 17: Ruling (found by e2e-daycare): the "Try the new Daycare (preview)" links are 44px tall, and on today's Daycare page the link sits in the footer, not under the header (it pushed the 3D view down and made pups land under the check-in strip) — cost if wrong: link placement only.
- Task 20: Ruling: the hub card doesn't show the week's prize lineup — the hub can't read Graduation Day's approved lineup (different server; the sandbox can't reach it to check CORS), and copying prize text would risk an outdated promotion — cost if wrong: a less specific card.
- Task 19: Ruling: goals open by player level (serve/plays/check-ins at 1, profit day at 2, baths and Fun at 3, Appeal and boarders at 4), so a new daycare always gets one it can finish; the goal is fixed when the week starts — cost if wrong: goal mix.
- Task 19: Ruling: a "profit day" counts finished game days this week with income minus wages, upkeep, supplies and marketing (building is an investment, not counted) — cost if wrong: one formula.
- Task 19: Ruling: a finished but unclaimed goal pays automatically when the next week starts (missing a week never loses a reward); the week is checked on load and once a minute — cost if wrong: none.
- Task 19/20: Ruling: migration 0008 (not yet applied) also allows tycoon_weekly and graduation_weekly_open — cost if wrong: two names.
- Final: Ruling (C1): the Deluxe Daycare Decor pack is sold as cosmetic-only, and the owner's rules keep gameplay free; its items become skins with no advantage — Cloud Bed = Dog Bed (60 coins, level 1, +1 spot), Lighthouse Fort = Mini Hurdles (180 coins, level 4, Fun +4) on a bigger 2 × 2 footprint — cost if wrong: two catalog rows.
- Final: Ruling (I6): level 3 at day 1.2 (spec "around day 3") is reported to the owner rather than tuned: the allowed knobs don't move it, and fast early levels suit his "make it addicting" brief — cost if wrong: the owner asks for slower early levels (build XP floor(coins/10) → /20).
- Final: Ruling (Graduation in the hub): GitHub push access to pmichael415/pawtastic-graduation was refused by the session's permission check; the Graduation server change is prepared as a patch for the owner, and the hub/client side ships fail-safe (free play until that server answers) — cost if wrong: none until applied.
- Final: Ruling (declined-to-judge lines): localStorage write per tick, welcome-back on reload, build-then-sell XP, hand-edited coins/XP, no auto-resume, overnight daycare pups, easy "fully booked", building in daily profit, hiring as wages — all stand as the reviewer set them aside (same as today's game or per plan) — cost if wrong: none now.
- Task 18: Ruling: e2e-tycoon 30/31 in the restarted container (2 Nov) — the 30-dog frame-rate check measured 29.9 and 28.1 fps (render 1.7–2.0 ms) against ≥30, with no change to any code /daycare-next renders since 3a800c8, where it measured 30.4–32.5; software-rendering speed of this container, not a regression; threshold left as is, flagged to the owner — cost if wrong: a busy daycare runs just under 30 fps on slow phones (stage-2 tuning). All other suites green: daycare 36, games 35, hub 33, notify 20, teams 27, cloud 25.

## Deferred minors (17)

- M1 paths say "Need N more coins" instead of "Paused…" below zero.
- M2 upkeep can be dodged by closing everything just before 18:00.
- M3 reputation keeps growing while closed.
- M4 "Smooth operator" counts pups sent home free.
- M5 level-up coin rewards aren't in the ledger.
- M6 tycoon_level can fire for a result that's then discarded.
- M7 reduced motion / battery saver apply when the 3D view next opens.
- M8 remainder — catalog "Choose" button's accessible name is the item name; LevelUp has no focus trap; tabs lack aria-controls/arrow keys.
- M9 music doesn't restart after a tab switch until the next tap… (listener is once-only).
- M11 drag-to-draw rooms not implemented (two taps only).
- M12 closed items render in the red ghost colour.
- M13 tycoon_price fires on any key-up (e.g. Tab).
- M14 a second lobby/staff room in a loaded save is dropped whole; a playroom with an invalid group loads as working.
- M15 Build-room picks the new uid from render-time seq.
- M16 browser checks missing for: trophy once, Smooth operator once a day, Not-connected fixed by a path, rotating, upkeep drop on the next report.
- M17 (ghost dispose hook) — fixed in passing by clear() deleting the group's hook.
- M18 ownership set during render.
