# PAWtastic Daycare Tycoon: replayability design

**Status:** design. Owner brief of 2 Nov 2026 (Phillip Michael).
**Applies to:** the new buildable game at `/daycare-next` (code in `tycoon/src/tycoon/` and `tycoon/src/components/tycoon/`).
**Leave unchanged:** today's Daycare (`/daycare`), Recess Rush, Graduation Day, existing saves, and phase 1 purchases. The new game becomes the main daycare only after a separate navigation and save plan is approved (section 9).

## 1. What the owner wants

**Goal:** a game people want to come back to, share, and optionally spend on. The test is a player thinking, "I want to finish this upgrade and see what my daycare becomes next."

**Constraints:**
- Keep the PAWtastic logo and brand colours.
- No changes to the real customer app, its payments, DNS or email.
- No secrets exposed and no services bought.
- Fictional dogs and customers only, and no invented "real" facility layouts.
- Keep the approved purchase catalog and rules: free progression always works, no paid random rewards, no urgency or punishment for missing days, no paid safety, and team points never come from purchases.

**What the review found:**
- **Missing pieces:** building, land, furniture, upgrades, prices, wages, marketing, regulars, friendship, levels and trophies all exist but feel disconnected.
- **Home page:** it pushes the older daycare and gives the new one only a small link.
- **Slow start:** players face several build steps before meeting a dog.
- **Repetitive care:** the care loop is repeated tapping.
- **Equipment:** most items only add to two totals, Fun and Appeal.
- **Fallback:** a browser without 3D fell back to a list view while the guide still said "drag out a room".

## 2. What exists today (inspected 2 Nov)

**Rules** are pure functions in `src/tycoon/`, each with tests:
- **Building:** `build.ts` (rooms, doors, furniture, outdoor items, paths, moving, selling, land); `connect.ts` (connected rooms and what each room provides).
- **Care loop:** `run.ts`, which covers:
  - arrivals, but only while open and outside the noon to 2 PM lobby break;
  - check-in, playroom placement by size and temperament group, and boarding beds;
  - calm-down, which always works;
  - playtime, baths, checkout pay and friendship;
  - staff energy, scuffles and rush hour.
- **Business:** `business.ts` (prices, demand, wages, supplies, day close); `effects.ts` (Fun and Appeal); `progress.ts`, `trophies.ts`, `weekly.ts`.
- **The current guide** (`guide.ts`) is a five-step checklist (lobby, playroom, calm room, paint, open) with a reward of 200 coins.

**Screen:** `TycoonPlay.tsx` stacks, from the top:
1. the status bar;
2. the money banner;
3. the guide checklist;
4. the weekly card;
5. a Build button and the build toolbar;
6. the 3D stage;
7. the dog and edit panels, below the stage;
8. the list view.

If WebGL is missing, `TycoonStage` silently switches to the list view.

**Save:** `TycoonState` v1 in localStorage under `pawtastic-daycare-next-v1`. It is always parsed by `parseTycoon`, and delivery ids are kept in the same write.

## 3. Stage A: the first 15 minutes, the world first, and the fallback

### 3.1 Two ways to start

A brand-new save shows a start card over the map. A brand-new save means no rooms, the guide neither done nor skipped, and no checkouts.

**Quick start: "a small working daycare, ready for your first pup".** It is built with the real build rules, so every coin is actually spent. Quick start and Build from scratch therefore end up with the same value: what you own plus what you have left.
- **Layout:**
  - **Lobby (4 × 3):** Front Desk Counter, Waiting Bench, a door to the road with a path to the entrance.
  - **Small & Gentle playroom (4 × 3):** two Dog Beds, a Water Bowl and a Play Mat, with a door into the lobby.
  - **Calm-Down Room (2 × 2):** a Dog Bed, with a door.
  - **Outside:** the PAWtastic sign and two flower beds.
- **Cost:** about 1,900 of the 3,000 starting coins, leaving roughly 1,100 for the first upgrade and the next choices.

**Build from scratch: "an empty lot and the building guide".** It keeps today's build steps, with instructions that match the controls the player has (3.3). After that it joins the same tour from the "first dog" beat. The first dog's group matches the player's first playroom.

Saves that already exist keep their state. They never see the start card or the tour. If their old checklist is still running, it stays, but its text now matches their controls.

### 3.2 The guided tour (`src/tycoon/tour.ts`)

The tour moves through beats. Each beat waits for the real game state to show it is complete.

**Arrivals and the clock during the tour:**
- Only scripted arrivals happen.
- Random drop-offs are held back.
- The day clock doesn't run until the tour reaches free play.
- Nothing is skipped or forced. The timings below are playtest targets, not countdowns.

| Beat | Target | What happens | Done when |
|---|---|---|---|
| `meet` | 1 min | Biscuit (small, gentle; or matching the first playroom) is dropped off. The daycare opens automatically in tour mode. | Biscuit is in the lobby |
| `checkin` | | "Tap Biscuit, then Check in." | Biscuit is checked in |
| `place` | | "Move Biscuit to the Small & Gentle playroom." | Biscuit is in a matching playroom |
| `play` | | "Give Biscuit playtime." | Biscuit has had playtime |
| `checkout` | 2 min | "Check Biscuit out." The first payout is celebrated. | The first checkout is done |
| `upgrade` | | Choose one of two upgrades, each showing its exact benefit and price:<br>• Toy Bin (80): +2 Fun, so every playtime gives more happiness.<br>• Play Yard (200): +4 Fun outside.<br>Then place it. | The upgrade is placed |
| `benefit` | 5 min | Daisy arrives, a scripted dog matching the playroom. Her playtime message names the upgrade: "+33 happy (+8 from your Toy Bin)". | Daisy is checked out |
| `decision` | 10 min | Rocket arrives: large and active, which doesn't match the playroom. A decision card offers:<br>• **Build a Large & Active playroom**, showing the full cost including door and path. The guide helps place it.<br>• **Let Rocket rest in the calm room today.** He goes home free of charge, and safety comes first.<br>The tour never suggests mixing groups. | Rocket goes home either way, or a matching playroom is built and he is placed |
| `goals` | 15 min | Free play starts: random arrivals and the clock resume. A Goals strip shows three next goals (3.6). The guide reward of +200 is paid once. | Shown |

The tour can be skipped at any time, without the reward. The "Getting started" checklist and the tour never both show. Purchase suggestions are hidden until the tour reaches free play or is skipped (section 8): the shop stays reachable from the hub, but the game doesn't promote it during the first lesson.

### 3.3 Instructions that match the controls

There are three control modes:
- **3D:** the stage loaded.
- **Map:** the lightweight 2D fallback (3.4), when 3D can't load.
- **List:** chosen in Settings.

Every tour and guide line has wording for each mode. For example, "Drag out a 4 × 3 room" in 3D becomes "Tap Build, then Lobby" on the map and in the list. The mode is passed in. Tests check that no map or list text mentions dragging.

### 3.4 When 3D can't load

`TycoonStage` already reports `onUnavailable`. Instead of quietly showing the list, the game:
1. **Explains** in one line, with the reason: "3D isn't available in this browser (WebGL is off or unsupported). You're on the map view, and your progress is the same." It offers a "Try 3D again" button.
2. **Shows a lightweight map** (`TycoonMap.tsx`), an SVG drawing of the lot:
   - Rooms appear in their type's colour, with their name and how full they are ("2/3").
   - Furniture and outdoor items appear as small icons.
   - Dogs appear as coloured markers with a name and status: waiting, happy %, calming or bath.
   - Positions animate with CSS transitions.
   - Tapping a dog, room or item selects it, the same as in 3D.
   - Building uses the existing list builder ("first free spot").

The list view stays available in Settings. Progress is the same save in every mode.

### 3.5 The world first

The screen is reordered so the daycare map is the main thing:
- **Status bar:** coins, day and time, open/closed, pause and Build, in one row.
- **The map**, taller.
- **A coach bubble** pinned to the bottom of the map. It holds the current tour beat or guide step: one line and one button.
- **Dog, room and item panels** open as a bottom sheet over the lower part of the map, so the map stays visible. Today they open below it.
- **Below the map:** the Goals strip (3.6), the weekly card and the money banner. Not above it.
- **The list view** stays below as the detailed view on mobile, and as the main view in list mode.

**Placement shows the full cost.** While drawing a room, the preview shows walls and floor, plus one door, plus the estimated path to the nearest connected path or room. The estimate is `connectionEstimate`, a shortest path over free squares. For example: "Room 400 + door 30 + path ×4 = 40 → 470". Placement errors keep the existing plain-language messages.

### 3.6 The next goals

`goals.ts` picks up to three goals the player can see. Each is computed from the save, so nothing new is stored:
- the next level unlock;
- a building to add: Bath Room, then Boarding Room, then an outdoor play area;
- the next land parcel and its price;
- a business goal, such as a profitable day.

Stage C turns these into the owner's milestone path (5.1).

### 3.7 The home page

The home page gets a full-size card for the new daycare ("New: build your own PAWtastic daycare") next to today's Daycare, replacing the small preview link. Today's Daycare stays the default "Play" until the switch in section 9.

### 3.8 Measurement

There is no database change. The existing `tycoon_guide` event is accepted live, and its properties are free-form. Tour beats send it with:
- `beat`: the beat's name;
- `sec`: seconds since the tour started;
- `mode`: quick or scratch;
- `controls`: 3D, map or list.

Extra beat values cover the first checkout, the first upgrade, tour complete, and tour skipped. Returning to the game sends `beat: "return"` with the days since the last visit.

Reports separate what was observed (rows in `game_events`) from automated timings in the browser checks. Automated timings are not player data.

## 4. Stage B: activities, dog preferences and staff roles

These are outlines, detailed in Stage B's plan.

**Dog preferences** come from existing data. Personality and favourite stay as they are (`personalityOf`). The new traits:
- **Water-loving:** favourite is bath or splash.
- **Energetic:** active temperament, or favourite zoomies or fetch.
- **Shy:** gentle temperament with a shy trait.
- **Senior:** taken from the dog's id, about one dog in eight.

A dog's card shows its likes in plain words.

**Equipment becomes activities.** Each major item has an activity that suitable dogs in reach use: their own room, or the yard for outdoor items. While in use, the dog is visibly busy on the 3D stage and on the map.

| Item | Activity | Notes |
|---|---|---|
| Agility Course, Mini Hurdles | Agility | Energetic dogs gain the most |
| Splash Pool | Water play | Water-loving dogs gain the most |
| Nap Cabana, beds | Rest | Seniors and shy dogs, quieter |
| Bath Tub | A queue with a waiting count | Baths take time |
| Boarding beds | Overnight stays | Beds assigned individually, unused capacity shown |

How much happiness an activity gives depends on how well the dog matches it. Checkout explains why the visit went well, e.g. "Loved the Splash Pool". Buying an item shows the activity it adds before you pay. Fun and Appeal stay as the general background boost, smaller.

**Staff roles:**
- **Unlock:** level 4.
- **Roles:** reception (checks in), playroom supervision (playtime for pups in that room), baths (works the queue) and cleaning.
- **Bottlenecks shown:** each role shows its workload, plus "bath queue: 3 waiting", "playroom full", "2 boarding beds unused", "customers declined the exit bath (too pricey)" and "Sam is overloaded and Jo has spare time".
- **What stays with the player:** layout, pricing, services, staffing and safety. Calm-down and separating dogs stay free and always available. Groups, beds and the noon break are unchanged.

## 5. Stage C: milestones, scenarios, relationships and sharing

**5.1 Milestones**, in order, each with a reward and a new opportunity:

| Milestone | Unlocks |
|---|---|
| First happy customer | The dog album |
| First returning regular | Customer requests |
| First profitable day | Pricing tips |
| First outdoor activity area | Activities in the yard |
| First boarding wing | Overnight bookings |
| Successful bath service | Exit-bath upsell |
| Five-star academy | Photo mode frames |
| Second location | Hillsdale |

The Goals strip shows the next two or three.

**5.2 Scenarios:** fictional challenges, labelled as game stories rather than the real locations.
- **Hawthorne:** "Fix an inefficient layout".
- **Hillsdale:** "Busy boarding weekend".
- **Both:** "Keep service quality through a rush".

**5.3 The dog album and stories:**
- **Album:** dogs met, favourites, visits, friendship milestones and memorable moments.
- **Requests:** short recurring customer requests, for example "Daisy's family asks for an exit bath".
- **Relationship stories:** a line for each friendship level.

**5.4 Sharing:**
- **Photo mode:** hides the interface and adds a PAWtastic frame and the game link.
- **Before-and-after:** builds on the existing sheets.
- **Achievement cards:** for milestones.
- **Showcase:** a public daycare showcase only later, opt-in, and with no account details.
- **Booking:** "Book a real evaluation" stays reachable from the hub and never interrupts play.

## 6. Monetization, shared by all stages

- **When suggestions appear:** purchase suggestions appear only after the tour reaches free play. They live in the shop and the build catalog, with a preview and the exact benefit.
- **Approved catalog:** the coin packs, Deluxe Daycare Decor, the Starter, boosts, premium items and the VIP Pass stay as in spec 2026-11-02-in-game-purchases (rev 3). Phase 2 items stay out of every purchase flow until they are built.
- **Economy check:** Stage C adds an economy check, a seeded simulation for a free player and a player with the strongest permitted boosts. Paid progress must still leave meaningful goals: each milestone stays at least half as far away. Team points stay flat.

## 7. Testing, every stage

**Unit tests** for each new pure function:
- tour beats and their completion;
- the quick-start facility (valid, open-able, matching the first dog, coins spent equal to the build cost);
- held arrivals;
- control-aware wording;
- `connectionEstimate`;
- goals;
- save parsing (old saves load without a tour, and a tour survives a reload).

**Browser checks** (Playwright, phone and desktop):
- quick start to the first payout, timed by the automation;
- build from scratch;
- 3D turned off (`--disable-webgl`): the explanation and map view appear, and the guide text doesn't say drag;
- the existing tycoon suite still passes: saves, check-in, placement, care, checkout, building, finances, land.

Reports never describe untested device behaviour as verified.

## 8. Not in Stage A

- Activities, preferences and staff roles (Stage B).
- Milestones beyond the Goals strip, scenarios, the album, requests and sharing (Stage C).
- The walk-through camera, which comes after the core runs reliably.
- Any purchase-flow change.

## 9. Switching the main daycare (prepared, not done)

When the owner approves, the home page "Play" and the bottom bar's "Daycare" point to `/daycare-next`, and `/daycare` stays as "Classic Daycare".

**Saves:** players keep their current save. A one-time card offers to start the new daycare with a welcome gift based on their classic progress: coins equal to 25% of classic coins, capped at 2,000. The classic save is never deleted. Cloud saves get a separate slot, `daycare-next`, so the two are never mixed. This plan is written up for approval before anything switches.
