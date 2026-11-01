# PAWtastic Daycare Tycoon (new engine): stage 1, build from scratch (Sims-style rooms) and run the business. Design

Date: 1 Nov 2026 · Owner: Phil (PAWtastic Academy) · Status: approved by the owner (1 Nov), with the game-feel section added at his request. **Sims-style building was then
added at his request (1 Nov) and needs his OK.**
Replaces: `2026-11-01-daycare-tycoon-stage1-campus-design.md` (the campus around a fixed building), which is withdrawn.

## 1. Where this fits

**What the owner asked for (1 Nov):** an original PAWtastic daycare game in the style of theme-park tycoon games.
- Players start from an empty lot and build the whole daycare themselves.
- They care for dogs with moods and star ratings, run the business and meet goals.
- When one facility succeeds, they buy another and repeat.
- It makes money through themes and cosmetics, a monthly membership, coin packs and PAWtastic promos.
- It's a web game, not the App Store.

The owner wants players to keep coming back and to spend. We do that fairly (§2). Players also control expenses, as in
theme-park tycoon games (owner, 1 Nov). The owner also asked for a mix of The Sims and theme-park tycoon games: players
draw their own rooms with walls and doors, furnish and decorate them (Sims-style), and run the business around them
(tycoon-style). Because prices and expenses shape every building decision, the business is part
of stage 1, not a later stage.

**How it ships.** The new game is built on its own engine and starts as a **preview**: the route `/daycare-next`, linked
as "Try the new Daycare (preview)" from the hub and from today's Daycare page. Today's Daycare Tycoon stays live. When
the owner says the new game is better (expected after stage 2):
- it takes over the Daycare tab and the `daycare` cloud save;
- game progress starts fresh, which is acceptable because there are only test players today;
- paid packs stay owned, since they live on the server.

**Roadmap.** Each stage gets its own spec, plan and release:

| Stage | What players get |
|---|---|
| **1 (this spec)** | An empty lot and entrance; build rooms, paths and outdoor items on a grid; path connections; a guided start; the full dog-care loop in player-built rooms; **the business: prices, demand, expenses (wages, upkeep, supplies, marketing), closing things to save money, and a finances screen with a profit chart**; XP, levels and land; the PAWtastic Academy sign |
| 2 | Dogs come alive, Sims-style: each dog has need bars (thirst, energy, fun, social, cleanliness) and walks the paths, rooms and yards to meet them using the furniture and items you placed; thought bubbles (including "a bit pricey!"); a 1–5 star rating that feeds demand; walk view. Then it replaces today's game |
| 3 | The facility chain: meet a facility's goal, buy the next fictional facility with coins, and repeat; earlier facilities earn a capped amount while you're away; awards |
| Money 1–3 | Premium looks for buildings and dogs; the monthly membership; coin packs (free play only, after coins move to the server, with spending limits and an age check) |

## 2. Owner rules, and fair engagement

**What keeps players coming back:**
- clear goals and level-ups that unlock new rooms, items and land
- the satisfaction of building a daycare that works better each day
- new facilities to buy (stage 3)
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
1. **Draw a Lobby:** drag out a 4 × 3 room. Add a **door** on the road side and connect it to the entrance with a
   **path**. Place the **Front Desk Counter** and a **Waiting Bench**.
2. **Draw a Playroom** next to the lobby and pick its group (Small & Gentle, Small & Active, Large & Gentle or Large &
   Active). Add a door into the lobby, then place **2 Dog Beds** and a **Water Bowl**.
3. **Draw a small Calm-Down Room** with a door.
4. **Paint** the lobby: pick a floor and a wall colour. This step is optional.
5. Tap **Open for business**. The first dog arrives: check it in, put it in the playroom, give it playtime, then check
   it out.

Finishing the checklist gives **+200 coins**. "Skip guide" hides it. The guided build costs about 1,650 coins.

### Build mode (Sims-style rooms, tycoon-style grounds)
**Build** opens a toolbar with eight tools: **Rooms**, **Doors**, **Furniture**, **Outdoor** (Play, Comfort and Scenery),
**Paths**, **Paint**, **Land** and **Sell**. Each catalog entry shows its price, size, what it does and where it can go;
locked entries show "Unlocks at level N".
- **Drawing a room:**
  1. Tap one corner tile, then the opposite corner (or drag). Ghost walls show the size ("4 × 3") and the price, green
     or red with a reason ("Overlaps the Splash Pool", "Rooms are 2–10 squares a side").
  2. Tap **Build**.
  3. Choose the room type: **Lobby**, **Playroom** (pick a group), **Calm-Down Room**, **Bath Room**, **Boarding Room**
     or **Staff Room**. A room without a type is just an empty room.
  - Rooms can share a wall with a neighbour, which is how players make wings of connected rooms.
- **Doors:** tap a wall segment to add a door. A door on a shared wall links the two rooms; a door on an outside wall
  opens onto the grounds.
- **Furniture:** choose an item and tap a square inside a room. It must fit and suit the room type ("Bath tubs go in a
  Bath Room"). **Rotate**, then **Place**. What's inside decides what the room can do (§4.2).
- **Outdoor items and paths:** placed on the grounds like the yard items, rotated and placed. Paths can be painted square
  by square until **Done**.
- **Paint:** tap a room, then pick one of 4 floor styles (wood, tile, soft rubber, carpet) and one of 8 wall colours.
  Painting is free.
- **Editing a room:**
  - **Move** the whole room, with its furniture, to a free spot.
  - **Change type**, free, only while the room is empty.
  - **Paint**.
  - **Sell** the room and everything in it for 75% back, after a confirmation.
- **Editing furniture or an outdoor item:** **Move** (free) and **Sell** (75% back). Outdoor items also have **Upgrade**
  (up to level 3).
- Nothing with dogs in it can be moved or sold.
- **Land:** unowned land shows "For sale" with its price and the level it needs.

### Running the daycare
The run controls follow today's game:
- **Open / closed.** You can open once there is a connected Lobby with a Front Desk Counter, a connected Playroom with at
  least one dog spot, and a connected Calm-Down Room.
- **Daily rhythm:** a game clock with open hours, a midday lobby break and an end-of-day wrap-up.
- **Dogs:** arrive at the Front Desk Counter and wait in the lobby. Tap a dog to check it in and choose a matching
  playroom (or a Boarding Bed, for boarders). Then give playtime and baths, clean, and check it out with an optional exit bath.
- **Staff:** have energy, and you can hire more.
- **The calm-down room** is always available for overwhelmed dogs.
- **Header:** coins, **Lv N** with an XP bar, the day and clock, and open/closed. A level-up shows a toast with the new
  unlocks and gives `25 × N` coins.

### Finances (the business)
A **Finances** button (a coin icon in the header) opens a screen with five tabs:
- **Summary:** today, yesterday and the last 7 game days, showing:
  - income by service (daycare, boarding, baths, exit baths, tips)
  - expenses by type (wages, upkeep, supplies, marketing, building)
  - profit, with a 14-day profit bar chart
- **Prices:** a slider for each service (daycare day, boarding night, bath, exit bath). Each shows the current price, a
  "fair price" marker, and a plain hint ("Above fair: fewer dogs will come").
- **Staff:** the wage level (Lean, Standard or Generous) and what it does; hire.
- **Upkeep:** every room and item with its daily cost and an **Open/Closed** switch. Closed things cost nothing and do
  nothing. A closed room keeps the dogs already inside but takes no new ones.
- **Marketing:** campaigns to buy, with how much they help and for how long. One runs at a time.

The day wrap-up adds income, expenses and profit for the day, plus one money tip ("Your Fountain costs 16 a day and adds
Appeal 6 — worth it while you have room for more dogs").

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

### Game feel (owner, 1 Nov: "make it addicting and insane")
Big, satisfying moments, all within §2:
- **Building:** a bouncy drop-in with a dust puff and a "thunk" sound. Upgrades get a sparkle burst and the model grows.
  Selling shows a coin shower.
- **Money:** coins fly from the dog to the coin counter, and the counter rolls up. Dogs that check out happy leave a
  floating "+52". The day's profit ticks up in the wrap-up with a drum roll, and a **"New record!"** banner appears when
  it beats the best day.
- **Level-ups:** a full-screen celebration (confetti, a fanfare, new unlocks shown as cards that flip over) and the
  `25 × N` coin reward.
- **Milestones**, as one-time trophies with a small coin reward each:
  - first dog, 10, 50 and 250 dogs served
  - first 1,000-coin profit day
  - first boarding night, first fully booked day
  - every room type built, every parcel of land owned
  - 4 stars or better in a day (from stage 2)
  
  A **Trophy shelf** in the Finances screen shows them. Trophies reward playing, never spending.
- **Busy-day buzz:** when the lobby has 3 or more dogs waiting, music picks up and a "Rush hour!" badge shows. Clearing
  the lobby fast gives a **"Smooth operator!"** bonus of +10% on those check-ins, at most once per game day.
- **Sound:** sound effects and music, with separate on/off switches in Settings. Reduced motion turns off confetti,
  screen shake and coin flight, and shows plain toasts instead.
- **Not used:** fake urgency, countdowns to buy, streak penalties and loss-aversion prompts.

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
- **Limit:** at most **200 placed things per facility** (outdoor items, furniture and paths), plus up to 12 rooms
  (§4.2).

### 4.2 Rooms, doors and furniture (Sims-style)
**Rooms:**
- A room is a rectangle of 2–10 tiles a side, on owned land, not overlapping other rooms, outdoor items or paths. Walls
  run along its edge.
- **Price:** 20 per wall segment (one tile edge of its outline) plus 10 per floor tile. For example, a 4 × 3 room costs
  14 × 20 + 12 × 10 = 400.
- Two rooms may share a wall edge. Each pays for its own outline, which keeps prices simple.
- **Limit:** at most **12 rooms per facility**.

**Doors:** 30 each, on a wall segment.
- A door on an outside wall connects the room to the outdoor tile in front of it.
- A door on a shared wall connects the two rooms.
- Doors can't sit on room corners.
- At most 4 doors per room.

**Room types**, chosen after drawing and changeable for free while the room is empty:

| Type | Needs inside to work | Provides | Max per facility |
|---|---|---|---|
| Lobby | 1 Front Desk Counter | Waiting spots: 2, plus 2 per Waiting Bench (up to 10) | 1 |
| Playroom (choose a group) | at least 1 dog spot | Dog spots = Dog Beds + Deluxe Dog Beds + Play Mats, up to `floor(area / 2)` | — |
| Calm-Down Room | nothing | Unlimited space for overwhelmed dogs (as today) | — |
| Bath Room | a Bath Tub or Deluxe Bath Tub | Baths and exit baths; Deluxe Tub adds +10 bath pay | — |
| Boarding Room | at least 1 Boarding Bed | 1 boarder per Boarding Bed; boarders only arrive when a connected bed is free | — |
| Staff Room | at least 1 Staff Couch | Staff energy recovers +50% per Staff Couch (up to +150%) | 1 |

**Furniture** goes inside rooms. Fun and Appeal count toward the facility totals in §4.4. Furniture has one level;
better versions are separate items, as in Sims games.

| id | Furniture | Size | Allowed in | Unlock | Price | Effect |
|---|---|---|---|---|---|---|
| front_counter | Front Desk Counter | 2×1 | Lobby | 1 | 300 | required; 1 per facility |
| bench | Waiting Bench | 2×1 | Lobby | 1 | 120 | +2 waiting spots |
| dog_bed | Dog Bed | 1×1 | Playroom, Calm-Down | 1 | 60 | +1 dog spot (playroom) |
| play_mat | Play Mat | 1×1 | Playroom | 1 | 50 | +1 dog spot |
| water_bowl | Water Bowl | 1×1 | any room | 1 | 20 | Fun +1 |
| rug | Rug | 1×1 | any room | 1 | 40 | Appeal +1 |
| plant | House Plant | 1×1 | any room | 1 | 60 | Appeal +1 |
| toy_bin | Toy Bin | 1×1 | Playroom | 2 | 80 | Fun +2 |
| bath_tub | Bath Tub | 2×1 | Bath Room | 2 | 400 | enables baths |
| boarding_bed | Boarding Bed | 1×1 | Boarding Room | 3 | 150 | +1 boarder |
| couch | Comfy Couch | 2×1 | Lobby, Calm-Down, Staff | 3 | 200 | Appeal +2 |
| hurdles | Mini Hurdles | 2×1 | Playroom | 4 | 180 | Fun +4 |
| deluxe_bed | Deluxe Dog Bed | 1×1 | Playroom | 5 | 150 | +1 dog spot, Fun +2 |
| staff_couch | Staff Couch | 2×1 | Staff Room | 5 | 180 | staff energy recovery +50% |
| deluxe_tub | Deluxe Bath Tub | 2×1 | Bath Room | 7 | 900 | enables baths, +10 bath pay |

**Paint:** floor style and wall colour, per room, free. Premium paint sets are a later money step.

**Connected:** walkable spaces are path tiles, the entrance and room floors.
- A path tile connects to its 4 neighbouring path tiles.
- A room connects to an outdoor path tile through a door on that side.
- Two rooms connect through a door on their shared wall.
- A room is **connected** when it can be reached from the entrance.

Rooms that aren't connected, and rooms missing what their type needs, show greyed with the reason ("Not connected",
"Needs a Front Desk Counter"). They can't take dogs, and their furniture's effects don't count.

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
    arrivals when a free connected Boarding Bed exists.
  - **Happiness and cleanliness:** the same decay and gain numbers.
  - **Matching groups:** the mismatch warning and confirmation, and the "overwhelmed → calm-down room" handling (today's
    `scuffle` and `separate` rules).
  - **Staff:** energy costs (playtime 10, bath 15, exit bath 15, clean 10), hire costs, and a maximum of 6.
  - **Checkout pay** is replaced by prices (§4.7). **Playtime no longer pays coins directly.** It raises happiness, which
    raises checkout pay and reputation.
  - **The rest:** the day wrap-up report, the welcome-back bonus (capped at 150) and the guest book.
- **Baths and exit baths** need a connected Bath Room with a tub. Without one, the buttons explain why.
- **Moving or selling** a room isn't allowed while dogs are inside it.
- **Staff** start at 1, with a 250-coin step for each hire (as today).

### 4.6 XP and levels
- **XP is earned from:** check-in 5, playtime 2, bath 3, clean 1, checkout 10 (+5 if happiness is 80 or more), and
  building, upgrading or buying land at `floor(coins/10)`. Selling never removes XP.
- **Levels:** level N starts at total XP `50 × N × (N − 1)`, with no top level.
- **Level-up reward:** `25 × N` coins.

### 4.7 The business (prices, demand, expenses)
All amounts are game coins, never real money or real PAWtastic prices.

**Prices:**

| Service | Default | Range |
|---|---|---|
| Daycare day | 40 | 20–80 |
| Boarding night (added for boarders) | 90 | 50–160 |
| Bath | 25 | 10–50 |
| Exit bath | 30 | 10–60 |

**What the player is paid:**
- **Checkout:** `round(daycare price × (0.6 + 0.4 × happiness/100))` + the Appeal tip (§4.4), plus the boarding price for
  boarders and the exit-bath price if chosen.
- **A bath** pays the bath price, plus +10 with a Deluxe Bath Tub.

**Fair price and demand.** Each service has a fair price:
- `fair = default × (0.7 + 0.6 × reputation/100) × (1 + appeal/200)`
- Arrivals are multiplied by the demand factor `clamp((fairDaycare / daycarePrice)^1.5, 0.3, 1.6)`.
- The share of boarders is multiplied by the same factor for boarding.
- Baths and exit baths offered at more than 1.5 × fair are refused ("Too pricey"). There is no other penalty.

**Expenses, charged once at the end of each game day played:**
- **Wages:** 40 per staff member per day.
  - Lean: 30, and staff energy recovers 20% slower.
  - Generous: 60, and staff energy recovers 25% faster, and reputation rises by +0.01 per game minute.
- **Upkeep:** each open room or item costs `ceil(2% of coins spent on it)` per day (for example, a level-1 Small
  Playroom costs 12 a day). Paths, fences and the sign cost nothing. Closed things cost 0.
- **Supplies,** per dog checked in:
  - Basic: 2.
  - Premium: 5, with +5 happiness at check-in and +5 more from each bath.
- **Marketing,** one campaign at a time, paid when started:
  - Flyers: 150, arrivals +20% for 3 game days.
  - Online ads: 400, +40% for 3 days.
  - Open house: 800, +60% for 2 days, and reputation +5.
  - Unlocks: Flyers at level 2, Online ads at level 5, Open house at level 8.
- **Building, upgrades and land** are shown as building spending, not as daily expenses.

**When money runs short:**
- Day-end expenses may take coins below 0.
- While coins are below 0, building, upgrading, buying land, hiring and marketing are paused. The daycare keeps running
  normally, and income pays the shortfall back.
- There are no loans, no interest and no automatic selling. A banner suggests ways to save (close the costliest
  low-value item, lower wages, change prices).

**Time away:** expenses are only charged for game days actually played. The clock doesn't run while you're away, so
leaving never costs anything.

### 4.8 Saves
- **Where:** a new local save key `pawtastic-daycare-next-v1`. Cloud saving comes when the new game takes over the
  `daycare` slot.
- **Shape:**
  - `{ v: 1, coins, xp, guide, active: "f1", facilities: { f1: Facility } }`
  - where `Facility = { name, land[], items: Placed[], dogs[], staff[], clockMin, day, reputation, cleanliness, stats,
    guestBook, open, prices, wage, supplies, campaign, ledger, rooms: Room[] }`
  - and `Room = { uid, c, r, w, d, type?, group?, doors: { side: N | E | S | W, i }[], floor, wall, spent, closed? }`
  - and `Placed = { uid, kind, c, r, rot: 0–3, level: 1–3, spent, room?, closed? }`. Furniture records the `room` it is
    in; outdoor items and paths don't.
  - and `ledger` keeps the last 14 game days of income and expenses by category
- Keying everything by facility from day one lets stage 3 add more facilities without changing the save format.
- **Loading checks:**
  - A room is dropped if it's out of bounds, off owned land, overlapping, the wrong size, or past the 12-room limit.
    Its doors must sit on its own walls and not on corners.
  - An item is dropped if its kind is unknown, it's out of bounds or off owned land, it overlaps, it's furniture outside
    its room or in a room type that doesn't allow it, it breaks a one-per-facility limit, or it's past the item limit. Corrupt saves are set aside and a
  fresh game starts (as today).
- **Paid packs** are never stored as owned. Deluxe Daycare Decor and the Blue Ribbon Style Pack appear from fresh server
  entitlements:
  - Deluxe Daycare Decor: owners get "Cloud Beds" and "Lighthouse Fort" in the Play tab, with price 0 and marked "Owned".
  - Blue Ribbon Style Pack: dog bandanas.

## 5. Rendering (`src/tycoon/render/`)
- **Reused from `src/world/models.ts`:** materials and parts, dog and person rigs, tags, signs and blob shadows. The
  camera and controls come from today's renderer. The fixed-building code in `src/world/` isn't changed (today's game
  still uses it).
- **Rooms** are drawn from placed data, as a Sims-style cutaway:
  - the chosen floor style and wall colour (playrooms add a stripe in their group colour)
  - low walls along the outline, a little over waist height, so you can see inside, with door gaps and frames
  - shared walls drawn once
  - a name tag
  - greyed rooms with a reason badge when not working
  - **Furniture** as simple low-poly models (beds, mats, toy bins, tubs, couches, counter, benches, plants, rugs)
- **Paths** are drawn as flat tiles. **Outdoor items** are simple low-poly models, one variant per level.
- **Build overlay:** owned land is light green and unowned land grey with "For sale" signs. A ghost follows the chosen
  tile (a ghost outline for rooms, a ghost door on the nearest wall segment, a ghost model for furniture and items).
  Tiles and wall segments are picked with a ground-plane raycast.
- **Dogs and staff** stand inside their rooms and the lobby, as today. Walking between places is stage 2.
- **Performance:** 12 rooms, 200 placed things and 30 dogs at 30 fps or better in a phone-sized headless Chromium; battery-saver
  mode lowers detail.

## 6. Measurement
New events (migration **0008** extends the `game_events` check; apply it before publishing):
- `tycoon_build { kind, action: place | upgrade | move | sell | paint }` (kind includes `room`, `door` and furniture ids)
- `tycoon_land { parcel }`
- `tycoon_level { level }`
- `tycoon_guide { step }`
- `tycoon_open { day }`
- `tycoon_price { service, price }`
- `tycoon_marketing { campaign }`
- `tycoon_day { day, income, expenses }` (one per game day, for balancing)
- `tycoon_trophy { id }`

## 7. Testing
- **Engine unit tests:**
  - room drawing:
    - size limits, owned land and overlaps with rooms, items and paths
    - price from outline and floor
    - shared walls, and doors (outside, shared, never on corners, 4 per room)
  - footprints, rotation and door tiles
  - bounds, owned land, overlaps, one-per-facility limits and the item cap
  - connectivity:
    - path breadth-first search from the entrance through doors and rooms, including a room reached through another room
    - a disconnected room greys out and comes back after a path or door is added
    - selling a path or door disconnects rooms
  - room types: what each needs (counter, tub, beds, couch), capacities from furniture (dog spots capped at area / 2,
    waiting spots, boarders), furniture allowed only in its room types, change type only when empty, move room with its
    furniture, sell room refunds 75% of the room and contents, paint is free
  - prices, upgrade steps, the 75% refund, and XP not being removed on sale
  - land levels and prices; XP per action, levels and rewards
  - Fun and Appeal caps and their effects
  - the business:
    - checkout and bath pay at given prices
    - fair-price and demand factors at given reputation and appeal
    - refusals above 1.5 × fair
    - wages at each level and their energy effects
    - upkeep (2% of spend, closed = 0, free paths)
    - supplies per check-in and premium happiness
    - marketing effect, duration and the one-at-a-time rule
    - day-end ledger totals
    - below-zero pauses spending without stopping the daycare and recovers from income
    - no expenses while away
  - running rules ported from today's engine, with the same expected numbers. Today's `engine.test.ts` cases are ported
    to placed rooms: check-in, matching, mismatch confirmation, calm-down, playtime, bath, exit bath, boarding, checkout
    pay, staff energy, the day wrap-up and welcome-back.
  - can't open until the requirements are met
  - can't move or sell occupied rooms
  - save validation and dropping bad items
  - paid items only from entitlements
- **No-timer tests:** building, upgrading and buying land are immediate, and time away never removes or damages anything.
- **Browser checks** (phone size, Playwright, `qa/e2e-tycoon.cjs`):
  - the whole guided start from an empty lot (draw lobby, door, path, counter, bench, playroom, beds, calm-down room,
    paint) to the first checkout
  - a door between two rooms connects the inner room
  - a red ghost on overlap, rotating, a "Not connected" room fixed by a path
  - upgrade, move and sell
  - buy West land at level 3
  - the level-up toast
  - the list view playing the same loop
  - the sign card and its click event
  - the Finances screen: change a price and see the demand hint, close an item and see its upkeep drop on the next day's
    report, start Flyers, and the profit chart after 3 days
  - the below-zero banner
  - a level-up celebration with reduced motion off and on
  - a trophy unlocking once
  - the "Smooth operator" bonus no more than once per game day
  - frame rate with 12 rooms and 200 things
  - no page errors
- **Existing suites stay green**, and today's Daycare Tycoon is untouched.
- **A first-week playthrough** using the game rules. Targets: the guided start in under 5 minutes, level 3 (West or East
  land) around game day 3, level 5 around day 5, and profit positive on every day of a sensible first week. Default
  prices must break even with the guided-start build and 1 staff member by day 2. Numbers are tuned if the playthrough is off by more than ±50%.

## 8. Out of scope for stage 1
- Dogs walking between places, thought bubbles, star ratings and walk view (stage 2).
- More facilities, goals and awards (stage 3).
- Anything paid, apart from showing already-owned packs (the money steps).
- Cloud saves for the preview.
- Replacing today's game.
