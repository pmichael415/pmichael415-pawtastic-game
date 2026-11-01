# PAWtastic Daycare Tycoon (new engine): stage 1, build from scratch. Design

Date: 1 Nov 2026 · Owner: Phil (PAWtastic Academy) · Status: awaiting owner review
Replaces: `2026-11-01-daycare-tycoon-stage1-campus-design.md` (the campus around a fixed building), which is withdrawn.

## 1. Where this fits

**What the owner asked for (1 Nov):** an original PAWtastic daycare game in the style of theme-park tycoon games.
- Players start from an empty lot and build the whole daycare themselves.
- They care for dogs with moods and star ratings, run the business and meet goals.
- When one facility succeeds, they buy another and repeat.
- It makes money through themes and cosmetics, a monthly membership, coin packs and PAWtastic promos.
- It's a web game, not the App Store.

The owner wants players to keep coming back and to spend. We do that fairly (§2).

**How it ships.** The new game is built on its own engine and starts as a **preview**: the route `/daycare-next`, linked
as "Try the new Daycare (preview)" from the hub and from today's Daycare page. Today's Daycare Tycoon stays live. When
the owner says the new game is better (expected after stage 2):
- it takes over the Daycare tab and the `daycare` cloud save;
- game progress starts fresh, which is acceptable because there are only test players today;
- paid packs stay owned, since they live on the server.

**Roadmap.** Each stage gets its own spec, plan and release:

| Stage | What players get |
|---|---|
| **1 (this spec)** | An empty lot and entrance; build rooms, paths and outdoor items on a grid; path connections; a guided start; the full dog-care loop in player-built rooms; XP, levels and land; the PAWtastic Academy sign |
| 2 | Dogs walk the paths and yards and use what was built; thought bubbles; a 1–5 star rating; walk view. Then it replaces today's game |
| 3 | Run the business: game-coin prices, demand, staff wages and training, a daily money chart |
| 4 | The facility chain: meet a facility's goal, buy the next fictional facility with coins, and repeat; earlier facilities earn a capped amount while you're away; awards |
| Money 1–3 | Premium looks for buildings and dogs; the monthly membership; coin packs (free play only, after coins move to the server, with spending limits and an age check) |

## 2. Owner rules, and fair engagement

**What keeps players coming back:**
- clear goals and level-ups that unlock new rooms, items and land
- the satisfaction of building a daycare that works better each day
- new facilities to buy (stage 4)
- the weekly challenges and owner-approved notifications that already exist
- buying things players actually want (money steps)

**What the game never does:**
- forced waiting, or paying to skip waiting
- energy limits
- mystery boxes or other paid random rewards
- countdown pressure or fake scarcity
- punishing missed days (nothing decays or breaks while away; dogs are always safe)
- "buy now" prompts after a setback
- unclear currencies
- paid safety

Every room and item in this stage is earned with free game coins. Nothing is sold.

**Other rules:**
- **Fictional:** the daycare is clearly a game. It is never presented as the real Hawthorne or Hillsdale facilities.
- **Services:** only daycare, boarding, baths and exit baths. No haircuts or grooming services, and no real prices.
- **Clicks:** booking, app and directions clicks are counted as clicks, never as bookings.
- **Safety and fights:** dogs are kept safe through matching playrooms and the calm-down room. Fights are never
  rewarded, never tied to a breed, and safety is never paid for.

## 3. Player experience

### First minutes: guided start (skippable)
The lot is grass with a road along the bottom and an **entrance gate**. The player has **3,000 coins**, level 1 and one
staff member. A checklist card walks through:
1. Build a **Front Desk** and connect it to the entrance with **paths**.
2. Build a **Small Playroom**, pick its group (Small & Gentle, Small & Active, Large & Gentle or Large & Active), and
   connect it.
3. Build a **Calm-Down Room** and connect it.
4. Place a **Water Station**.
5. Tap **Open for business**. The first dog arrives: check it in, put it in the playroom, give it playtime, then check
   it out.

Finishing the checklist gives **+200 coins**. "Skip guide" hides it.

### Build mode
**Build** opens a sheet with the tabs **Rooms**, **Play**, **Comfort**, **Scenery**, **Paths** and **Land**. Each entry
shows its price, size and what it does; locked entries show "Unlocks at level N".
- **Placing:**
  1. Choose an item and tap a square. A ghost appears: green if it fits, red with a reason if not ("Overlaps the Bath
     Station", "Buy this land first").
  2. **Rotate** (rooms show where their door is), then **Place** or **Cancel**.
  3. Paths can be placed by tapping square after square ("paint" mode) until **Done**.
- **Editing:** tap a placed thing to see its level, its effect and connection status, with **Upgrade** (up to level 3),
  **Move** (free) and **Sell** (75% back, after a confirmation).
  - Playrooms also have **Change group**, which is free and only works when the room is empty.
  - Something can't be moved or sold while dogs are inside.
- **Land:** unowned land shows "For sale" with its price and the level it needs.

### Running the daycare
The run controls follow today's game:
- **Open / closed.** You can open once a connected Front Desk, a connected playroom and a connected Calm-Down Room exist.
- **Daily rhythm:** a game clock with open hours, a midday lobby break and an end-of-day wrap-up.
- **Dogs:** arrive at the Front Desk and wait in the lobby. Tap a dog to check it in and choose a matching playroom (or a
  suite, for boarders). Then give playtime and baths, clean, and check it out with an optional exit bath.
- **Staff:** have energy, and you can hire more.
- **The calm-down room** is always available for overwhelmed dogs.
- **Header:** coins, **Lv N** with an XP bar, the day and clock, and open/closed. A level-up shows a toast with the new
  unlocks and gives `25 × N` coins.

### Views
- **Overhead 3D:** build and run, with a cutaway view: no roofs and low walls, so you can see inside.
- **List view** (accessibility, and devices without 3D): the lobby, rooms and dogs with every run action. A **Build list**
  lets players place things with "Place in first free spot". Paths placed this way are laid along the shortest route to
  the entrance.
- Walk view comes in stage 2.

### PAWtastic Academy Sign
Free, one per facility, from level 1. Tapping it outside build mode opens a card with each location's "Book a free
evaluation" link and the PAWtastic app link. Taps record `booking_click`, `app_click` or `directions_click` with
`from: "tycoon-sign"`.

## 4. Rules (engine, pure functions in `src/tycoon/`)

### 4.1 Lot, grid and land
- **Grid:** tiles are 2 × 2 world units. The lot grid is **36 columns × 28 rows**, tile (c, r) covering world
  x ∈ [−36 + 2c, −34 + 2c], z ∈ [−36 + 2r, −34 + 2r]. The road runs below row 27, outside the lot.
- **Entrance:** a fixed, free path tile at **(18, 27)**. It can't be moved or sold.
- **Parcels**, as tile rectangles [c0, c1) × [r0, r1):

| Parcel | Columns | Rows | Size | Needs level | Price |
|---|---|---|---|---|---|
| Starter (owned) | 10–26 | 16–28 | 16 × 12 | — | 0 |
| West | 0–10 | 16–28 | 10 × 12 | 3 | 1,500 |
| East | 26–36 | 16–28 | 10 × 12 | 3 | 1,500 |
| North | 10–26 | 0–16 | 16 × 16 | 6 | 4,000 |
| Northwest | 0–10 | 0–16 | 10 × 16 | 10 | 6,000 |
| Northeast | 26–36 | 0–16 | 10 × 16 | 12 | 8,000 |

- **Placement is valid only if** every tile of the rotated footprint is on owned land and free. Rotation 1 or 3 swaps
  width and depth.
- **Limit:** at most **150 placed things per facility**, including paths.

### 4.2 Rooms
Each room has a **door**: on its front edge, the tile at index `floor((w − 1) / 2)` counted from the room's origin
corner. It turns with the room. The front is +z at
rotation 0; each rotation turns it 90°. Upgrade prices are per step: to level 2 costs the level-1 price × 1.8, to level 3
costs the level-1 price × 3.2, both rounded to the nearest 10.

| id | Room | Size | Unlock level | Level-1 price | Max per facility | Effect (L1 / L2 / L3) |
|---|---|---|---|---|---|---|
| front_desk | Front Desk & Lobby | 3×3 | 1 | 500 | 1 | Lobby waiting spots 4 / 6 / 8 |
| playroom_s | Small Playroom | 3×3 | 1 | 600 | — | Holds 2 / 3 / 4 dogs of its group |
| playroom_m | Medium Playroom | 4×4 | 4 | 1,200 | — | Holds 4 / 5 / 6 |
| playroom_l | Large Playroom | 5×5 | 9 | 2,200 | — | Holds 6 / 8 / 10 |
| calm_room | Calm-Down Room | 2×2 | 1 | 300 | — | Unlimited; overwhelmed dogs rest here (as today) |
| bath_station | Bath Station | 2×3 | 2 | 700 | — | Enables baths and exit baths; bath pay +0 / +5 / +10 |
| suite | Boarding Suite | 2×2 | 3 | 500 | — | 1 boarder each; boarders only arrive when a connected suite is free |
| staff_room | Staff Room | 2×2 | 5 | 600 | 1 | Staff energy recovers +50% / +100% / +150% faster |

**Connected:** a room counts as connected when a tile next to its door, outside the room, is a path tile linked through
paths (4-way adjacency) to the entrance. Rooms that aren't connected are shown greyed with "Not connected". They can't
take dogs, and their effects don't count.

### 4.3 Outdoor items
Effects use the Fun and Appeal model below. Upgrade prices follow the same rule as rooms. Scenery, paths, fences and the
sign have a single level.

| id | Item | Tab | Size | Unlock | Price | Effect (L1 / L2 / L3) |
|---|---|---|---|---|---|---|
| play_yard | Play Yard | Play | 2×2 | 1 | 200 | Fun 4 / 7 / 10 |
| ball_pit | Ball Pit | Play | 2×2 | 2 | 300 | Fun 5 / 8 / 12 |
| splash_pool | Splash Pool | Play | 2×2 | 3 | 450 | Fun 6 / 10 / 14 |
| agility | Agility Course | Play | 3×2 | 5 | 700 | Fun 8 / 13 / 18, Appeal 2 / 3 / 4 |
| water | Water Station | Comfort | 1×1 | 1 | 80 | Fun 1 / 2 / 3, Appeal 1 / 2 / 3 |
| shade_tree | Shade Tree | Comfort | 1×1 | 2 | 120 | Appeal 2 / 3 / 4 |
| nap_cabana | Nap Cabana | Comfort | 2×1 | 4 | 350 | Fun 3 / 5 / 7, Appeal 2 / 3 / 4 |
| bench | Bench | Scenery | 1×1 | 1 | 40 | Appeal 1 |
| flowers | Flower Bed | Scenery | 1×1 | 1 | 50 | Appeal 1 |
| lights | String Lights | Scenery | 1×1 | 3 | 90 | Appeal 2 |
| fountain | Fountain | Scenery | 2×2 | 7 | 800 | Appeal 6 |
| fence | Fence | Scenery | 1×1 | 1 | 15 | looks only |
| path | Path | Paths | 1×1 | 1 | 10 | connects rooms |
| sign | PAWtastic Academy Sign | Scenery | 2×1 | 1 | 0 | Appeal 1; opens the visit card; 1 per facility |

### 4.4 Fun and Appeal (per facility)
Fun and Appeal are summed over placed outdoor items (rooms don't count). Stage 2 makes dogs use the items physically.
- **Fun** (capped at 60):
  - Happiness falls more slowly, by the multiplier `1 − fun/200`, so up to 30% slower.
  - Playtime gives `+floor(fun/6)` extra happiness (up to +10).
- **Appeal** (capped at 50):
  - Arrival chance × `(1 + appeal/100)`.
  - Checkout pays `+floor(appeal/4)` extra coins (up to +12).

### 4.5 Running rules (ported from today's engine)
- **Kept the same as `src/game/engine.ts`, with rooms referenced by placed-room id instead of fixed groups:**
  - **Day rhythm:** open hours 07:00–18:00 game time, a lobby break 12:00–14:00, 2 game minutes per real second.
  - **Arrivals:** base chance per game minute 0.04 × reputation/80 × the Appeal multiplier. Boarders are 25% of
    arrivals when a free connected suite exists.
  - **Happiness and cleanliness:** the same decay and gain numbers.
  - **Matching groups:** the mismatch warning and confirmation, and the "overwhelmed → calm-down room" handling (today's
    `scuffle` and `separate` rules).
  - **Staff:** energy costs (playtime 10, bath 15, exit bath 15, clean 10), hire costs, and a maximum of 6.
  - **Checkout pay:** `10 + 0.4 × happiness`, +60 for boarders, +30 for an exit bath.
  - **The rest:** the day wrap-up report, the welcome-back bonus (capped at 150) and the guest book.
- **Baths and exit baths** need a connected Bath Station. Without one, the buttons explain why.
- **Moving or selling** a room isn't allowed while dogs are inside it.
- **Staff** start at 1, with a 250-coin step for each hire (as today).

### 4.6 XP and levels
- **XP is earned from:** check-in 5, playtime 2, bath 3, clean 1, checkout 10 (+5 if happiness is 80 or more), and
  building, upgrading or buying land at `floor(coins/10)`. Selling never removes XP.
- **Levels:** level N starts at total XP `50 × N × (N − 1)`, with no top level.
- **Level-up reward:** `25 × N` coins.

### 4.7 Saves
- **Where:** a new local save key `pawtastic-daycare-next-v1`. Cloud saving comes when the new game takes over the
  `daycare` slot.
- **Shape:**
  - `{ v: 1, coins, xp, guide, active: "f1", facilities: { f1: Facility } }`
  - where `Facility = { name, land[], items: Placed[], dogs[], staff[], clockMin, day, reputation, cleanliness, stats,
    guestBook, open }`
  - and `Placed = { uid, kind, c, r, rot: 0–3, level: 1–3, spent, group? }`
- Keying everything by facility from day one lets stage 4 add more facilities without changing the save format.
- **Loading checks:** an item is dropped if its kind is unknown, it's out of bounds, it's not on owned land, it overlaps
  another item, a one-per-facility limit is exceeded, or it's beyond the item limit. Corrupt saves are set aside and a
  fresh game starts (as today).
- **Paid packs** are never stored as owned. Deluxe Daycare Decor and the Blue Ribbon Style Pack appear from fresh server
  entitlements:
  - Deluxe Daycare Decor: owners get "Cloud Beds" and "Lighthouse Fort" in the Play tab, with price 0 and marked "Owned".
  - Blue Ribbon Style Pack: dog bandanas.

## 5. Rendering (`src/tycoon/render/`)
- **Reused from `src/world/models.ts`:** materials and parts, dog and person rigs, tags, signs and blob shadows. The
  camera and controls come from today's renderer. The fixed-building code in `src/world/` isn't changed (today's game
  still uses it).
- **Rooms** are drawn from placed data:
  - a coloured floor (group colours as today)
  - low walls with a gap at the door
  - a name tag
  - a level badge
  - "Not connected" shown in grey
- **Paths** are drawn as flat tiles. **Outdoor items** are simple low-poly models, one variant per level.
- **Build overlay:** owned land is light green and unowned land grey with "For sale" signs. A ghost follows the chosen
  tile, and tiles are picked with a ground-plane raycast.
- **Dogs and staff** stand inside their rooms and the lobby, as today. Walking between places is stage 2.
- **Performance:** 150 placed things and 30 dogs at 30 fps or better in a phone-sized headless Chromium; battery-saver
  mode lowers detail.

## 6. Measurement
New events (migration **0008** extends the `game_events` check; apply it before publishing):
- `tycoon_build { kind, action: place | upgrade | move | sell }`
- `tycoon_land { parcel }`
- `tycoon_level { level }`
- `tycoon_guide { step }`
- `tycoon_open { day }`

## 7. Testing
- **Engine unit tests:**
  - footprints, rotation and door tiles
  - bounds, owned land, overlaps, one-per-facility limits and the item cap
  - connectivity: path breadth-first search from the entrance, a disconnected room greys out and comes back after a path
    is repaired, and selling a path disconnects rooms
  - prices, upgrade steps, the 75% refund, and XP not being removed on sale
  - land levels and prices; XP per action, levels and rewards
  - Fun and Appeal caps and their effects
  - running rules ported from today's engine, with the same expected numbers. Today's `engine.test.ts` cases are ported
    to placed rooms: check-in, matching, mismatch confirmation, calm-down, playtime, bath, exit bath, boarding, checkout
    pay, staff energy, the day wrap-up and welcome-back.
  - can't open until the requirements are met
  - can't move or sell occupied rooms
  - save validation and dropping bad items
  - paid items only from entitlements
- **No-timer tests:** building, upgrading and buying land are immediate, and time away never removes or damages anything.
- **Browser checks** (phone size, Playwright, `qa/e2e-tycoon.cjs`):
  - the whole guided start from an empty lot to the first checkout
  - a red ghost on overlap, rotating, a "Not connected" room fixed by a path
  - upgrade, move and sell
  - buy West land at level 3
  - the level-up toast
  - the list view playing the same loop
  - the sign card and its click event
  - frame rate with 150 things
  - no page errors
- **Existing suites stay green**, and today's Daycare Tycoon is untouched.
- **A first-week playthrough** using the game rules. Targets: the guided start in under 5 minutes, level 3 (West or East
  land) around game day 3, level 5 around day 5. Numbers are tuned if the playthrough is off by more than ±50%.

## 8. Out of scope for stage 1
- Dogs walking between places, thought bubbles, star ratings and walk view (stage 2).
- Prices, wages and the money chart (stage 3).
- More facilities, goals and awards (stage 4).
- Anything paid, apart from showing already-owned packs (the money steps).
- Cloud saves for the preview.
- Replacing today's game.
