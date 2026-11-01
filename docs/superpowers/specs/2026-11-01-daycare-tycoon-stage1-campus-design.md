# PAWtastic Daycare Tycoon: stage 1, campus builder. Design

Date: 1 Nov 2026 · Owner: Phil (PAWtastic Academy) · Status: **withdrawn** (1 Nov). The owner chose to build from scratch on a new engine; see
`2026-11-01-daycare-tycoon-stage1-build-from-scratch-design.md`

## 1. Where this fits

**What the owner asked for (1 Nov):** turn PAWtastic Daycare into a build-and-upgrade management game in the style of
theme-park tycoon games, as an original PAWtastic game. Players:
- build anywhere on a grid
- care for dogs with moods and star ratings
- run the business
- complete goals

When one facility succeeds, they buy another and repeat. It makes money through themes and cosmetics, a monthly
membership, coin packs and PAWtastic promos. It stays a web game: installable, using the owner's Stripe account, not the
App Store.

**Roadmap.** Each stage is its own spec, plan and release, and each is playable on its own:

| Stage | What players get |
|---|---|
| **1 (this spec)** | An outdoor campus around each daycare building: build anywhere on a grid, upgrade items, buy land, player levels and XP, and a PAWtastic Academy sign |
| 2 | Dogs walk the campus and use what you built, with thought bubbles and a 1–5 star rating |
| 3 | Run the business: set game-coin prices for daycare, boarding, baths and exit baths; demand responds; staff wages and training; a daily money chart |
| 4 | The facility chain: meet a facility's goal, buy the next (fictional) facility with your coins, and repeat; earlier facilities earn a capped amount while you're away; awards |
| Money 1–3 | Premium looks for buildings and dogs; the monthly membership; coin packs (free-play only, after coins move to the server, with spending limits and an age check) |

**Why stage 1 first:** money only follows once people enjoy building. Stage 1 also sets up the data layout (a campus for
each location, keyed by id) that stage 4's new facilities reuse.

## 2. Owner rules this stage keeps

- **No waiting:** building, upgrading, moving and buying land are instant. Nothing withers, breaks or decays while you
  are away. Dogs are always safe. No energy limits, no paid timers, no mystery boxes.
- **Free:** every item and every piece of land can be earned with free game coins. Nothing paid is sold in this stage.
- **Fictional:** the campus is clearly a game daycare. It is never presented as the real Hawthorne or Hillsdale
  facilities. The existing in-game note about fictional layouts stays.
- **PAWtastic's real services only:** daycare, boarding, baths and exit baths. Nothing mentions haircuts or grooming
  services, and no real prices appear.
- **Booking clicks are clicks,** never bookings.

## 3. Player experience

- **Build button.** The daycare screen gains a **Build** button, next to the existing view controls. It opens a bottom
  sheet with tabs for **Play**, **Comfort**, **Scenery** and **Land**. Each item shows its price, size, what it does and,
  if locked, "Unlocks at level N".
- **Placing:**
  1. Choose an item. The overhead camera zooms out and the grid appears over owned land.
  2. Tap a square to see a ghost of the item: green if it fits, red if it doesn't, with a reason ("Overlaps the Ball
     Pit", "Buy this land first").
  3. Use **Rotate**, then **Place** (coins are taken and the item appears) or **Cancel**.
- **Editing.** In build mode, tap a placed item to see its level, its effect and three choices:
  - **Upgrade** (shows the cost and the next effect; up to level 3)
  - **Move**, which works like placing and is free
  - **Sell**, which refunds 75% of everything spent on it, after a confirmation
- **Land.** Unowned land shows a "For sale" sign with its price and the level it needs. Tapping it buys it, after a
  confirmation.
- **Levels and XP.** The header shows **Lv N** with a progress bar. A level-up shows a toast ("Level 5! New: Agility
  Course, East Yard land") and gives `25 × level` coins.
- **Views:**
  - Overhead (3D): full building and editing.
  - Walk view: the campus is visible but can't be edited.
  - List view: a **Campus** list of placed items with Upgrade and Sell. Players can place a new item there by tapping
    "Place in first free spot". This keeps the game playable without the 3D view, which matters for accessibility.
- **PAWtastic Academy Sign:** free, one per location, available from level 1. Tapping it (outside build mode) opens a
  card with each location's "Book a free evaluation" link and the PAWtastic app link, as on the Visit page. Taps are
  tracked as `booking_click`, `app_click` or `directions_click` with `from: "campus-sign"`.

## 4. Rules (engine)

### 4.1 The grid and land

- Tiles are **2 × 2 world units**. The grid covers x from −44 to 44 and z from −20 to 20; the origin tile (0, 0) is at
  world (−44, −20). Items are stored in tile coordinates.
- **Never buildable:** the building zone (x −18 to 18, z −8 to 20, covering the building, the entrance walkway and the
  road side).
- **Parcels**, the same layout for each location:

| Parcel | World rect (x0, z0, x1, z1) | Tiles | Needs level | Price |
|---|---|---|---|---|
| West Yard (starter, owned) | −30, −8, −18, 16 | 6 × 12 | — | 0 |
| East Yard | 18, −8, 30, 16 | 6 × 12 | 3 | 1,000 |
| Back Yard | −18, −20, 18, −8 | 18 × 6 | 6 | 2,500 |
| Far West | −44, −20, −30, 16 | 7 × 18 | 10 | 5,000 |
| Far East | 30, −20, 44, 16 | 7 × 18 | 15 | 9,000 |

- **Placement is valid only if** every tile of the rotated footprint is inside an owned parcel of that location, outside
  the building zone, and not covered by another item. Rotation 1 or 3 swaps the width and depth.
- **Limit:** at most **80 items per location**. Paths and fences count.

### 4.2 Catalog (stage 1)

Upgrade prices are the price of each step: going to level 2 costs level-1 cost × 1.8, and going to level 3 costs
level-1 cost × 3.2, both rounded to the nearest 10. For example, a Play Yard costs 200, then 360, then 640. Scenery,
the sign, paths and fences have one level.

| id | Name | Tab | Size (w × d) | Unlock level | Level-1 cost | Effect per level (L1 / L2 / L3) |
|---|---|---|---|---|---|---|
| play_yard | Play Yard | Play | 2×2 | 1 | 200 | Fun 4 / 7 / 10 |
| ball_pit | Ball Pit | Play | 2×2 | 2 | 300 | Fun 5 / 8 / 12 |
| splash_pool | Splash Pool | Play | 2×2 | 3 | 450 | Fun 6 / 10 / 14 |
| agility | Agility Course | Play | 3×2 | 5 | 700 | Fun 8 / 13 / 18, Appeal 2 / 3 / 4 |
| water | Water Station | Comfort | 1×1 | 1 | 80 | Fun 1 / 2 / 3, Appeal 1 / 2 / 3 |
| shade_tree | Shade Tree | Comfort | 1×1 | 2 | 120 | Appeal 2 / 3 / 4 |
| nap_cabana | Nap Cabana | Comfort | 2×1 | 4 | 350 | Fun 3 / 5 / 7, Appeal 2 / 3 / 4 |
| bath_house | Bath House | Comfort | 2×2 | 6 | 900 | Baths and exit baths +5 / +10 / +15 coins |
| bench | Bench | Scenery | 1×1 | 1 | 40 | Appeal 1 |
| flowers | Flower Bed | Scenery | 1×1 | 1 | 50 | Appeal 1 |
| fence | Fence | Scenery | 1×1 | 1 | 15 | none (looks) |
| path | Path | Scenery | 1×1 | 1 | 10 | none (looks) |
| lights | String Lights | Scenery | 1×1 | 3 | 90 | Appeal 2 |
| fountain | Fountain | Scenery | 2×2 | 7 | 800 | Appeal 6 |
| sign | PAWtastic Academy Sign | Scenery | 2×1 | 1 | 0 | Appeal 1; opens the visit card; one per location |

### 4.3 What the campus does (per location; stage 2 makes dogs use it physically)

Fun and Appeal are summed over the location's placed items, with caps so nothing runs away:
- **Fun** (capped at 60):
  - Dogs' happiness falls more slowly: the multiplier is `1 − fun/200`, so up to 30% slower. It combines with the
    existing décor slowdown, and the combined slowdown is capped at 50%.
  - Playtime gives `+floor(fun/6)` extra happiness (up to +10).
- **Appeal** (capped at 50):
  - Arrival chance × `(1 + appeal/100)` (up to +50%).
  - Checkout pays `+floor(appeal/4)` extra coins (up to +12).
- **Bath House:** its bonus adds to the existing Splash Bath Station bonus. The campus part is capped at +15 per bath.
- **Existing items stay as they are:** the 5 building upgrades, in-room décor and staff. They appear in the Build sheet's
  **Building** section.

### 4.4 XP and levels

- **XP is earned from:** check-in 5, playtime 2, bath 3, clean 1, checkout 10 (+5 if the dog's happiness is 80 or more),
  and building, upgrading or buying land at `floor(coins spent / 10)`. Selling never takes XP away.
- **Levels:** level N starts at total XP `50 × N × (N − 1)` (level 2 at 100, level 5 at 1,000, level 10 at 4,500, level
  15 at 10,500). There is no top level.
- **Level-up reward:** `25 × N` coins.

### 4.5 Saves

- Save version **5**, with two new fields:
  - `xp: number`
  - `campus: Record<string, { land: string[]; items: Placed[] }>`, keyed by location id (stage 4 adds facility ids to the
    same map)
  - where `Placed = { uid, kind, x, z, rot: 0–3, level: 1–3, spent }`
- **Migrating v1–v4 saves:**
  - Every unlocked location gets `{ land: ["west"], items: [] }`.
  - Existing players start at the level their history earned: `xp = admitted × 5 + plays × 2 + baths × 3 + cleans × 1 +
    checkouts × 10`.
  - Nothing is taken away.
- **Loading checks:** an item is dropped if its kind is unknown, it's out of bounds, it's not on owned land, it overlaps
  another item, or it's beyond the 80-item limit. Land ids must be known parcels. The save still holds free progress only.
- **Cloud saves:** the existing `daycare` cloud save carries the campus. A 60-item campus is about 5 KB, well under the
  100 KB limit.

## 5. Rendering

- **Campus models:** simple low-poly shapes, like today's props, built in the renderer's rebuilt-on-change "dynamic"
  group. The key includes the campus. Each kind gets one model per level (bigger or more detailed at levels 2–3).
- **In build mode:**
  - A tile overlay shows owned land in light green and unowned parcels in grey, with a "For sale" sign.
  - A ghost model follows the chosen tile.
  - Tile picking uses the existing pointer and raycast handling on the ground plane.
- **Decorative trees:** the existing trees that sit inside a parcel move to just outside the grid.
- **Camera:** the overhead zoom-out limit grows to fit the owned parcels, and "Reset view" frames them.
- **Performance budget:** 80 items at 30 fps or better on a mid-range phone (checked in a headless Chromium phone profile).
  Battery-saver mode drops item detail.

## 6. Measurement

New events (migration **0008** extends the `game_events` check; apply it before publishing, as with 0007):
- `campus_build { kind, action: place | upgrade | move | sell }`
- `land_buy { parcel }`
- `level_up { level }`

## 7. Testing

- **Engine unit tests:**
  - footprints and rotation
  - bounds, owned land, the building zone, overlaps and the 80-item limit
  - costs, level-2 and level-3 prices, and the 75% sell refund (including the XP-not-removed rule)
  - land prices and levels
  - XP from each action, level thresholds and rewards
  - Fun and Appeal sums and caps, and their effects on decay, playtime, arrivals, checkout and baths
  - v4 → v5 migration and the XP back-fill
  - rejecting invalid saved items
- **No-timer tests:** placing or upgrading changes state immediately, and returning after time away never removes or
  damages anything.
- **Browser checks** (phone size, Playwright):
  - open Build, place a Play Yard, see a red ghost when overlapping, rotate, upgrade, move and sell
  - buy the East Yard at level 3
  - the level-up toast
  - the list-view "Place in first free spot"
  - the sign opens the visit card and records `booking_click` with `from: "campus-sign"`
  - the frame rate with 80 items
  - no page errors
- **Existing suites stay green:** daycare, hub, teams, cloud, notifications and unit tests.
- **A first-week playthrough** using the game rules. Expected pace: level 5 around game day 5, East Yard by day 3–4. The
  numbers in §4 are tuned if the playthrough is off by more than ±50%.

## 8. Out of scope for stage 1

- Dogs walking the campus, thought bubbles and star ratings (stage 2).
- Prices, wages and the money chart (stage 3).
- New facilities, goals and awards (stage 4).
- Anything paid (the money steps).
- Free placement inside the main building.
