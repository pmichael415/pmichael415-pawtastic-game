# PAWtastic Daycare Tycoon: Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new daycare tycoon game, previewed at `/daycare-next` next to today's game:
- Players start on an empty lot, draw rooms Sims-style (walls, doors, furniture, paint) and lay paths and outdoor items
  tycoon-style.
- They run the dog-care loop in the rooms they built and control prices and expenses.
- They level up, with big, satisfying feedback.

**Architecture:**
- **Engine:** pure, tested TypeScript in `tycoon/src/tycoon/` (geometry, build actions, connectivity, effects,
  progression, business, run loop, guide, trophies). An external store copies today's `src/game/store.ts` pattern.
- **Renderer:** a new three.js renderer in `src/tycoon/render/` reuses `src/world/models.ts` primitives and rigs. Today's
  `src/world/*` and `src/game/*` behaviour stay unchanged.
- **UI:** React components in `src/components/tycoon/` and one route. Every action is also playable in a list view
  without 3D.

**Tech Stack:** TypeScript, React 19, TanStack Router/Start, three.js, Tailwind/shadcn, Vitest + Testing Library,
Playwright (`require("playwright")`), PGlite for the migration test.

**Spec:** `docs/superpowers/specs/2026-11-01-daycare-tycoon-stage1-build-from-scratch-design.md` (owner-approved 1 Nov
2026). Section numbers below (§) refer to it. All paths are relative to `tycoon/` unless they start with `docs/`.

## Global Constraints

**Fairness (§2):**
- Building, upgrading, buying land, moving and painting are instant. Nothing decays, breaks or charges while the player
  is away; the game clock only runs while playing.
- No energy limits, paid timers, mystery boxes, countdown pressure, streak penalties or "buy now" prompts.
- Nothing is sold in stage 1. Paid packs only appear when the server says they're owned.
- The daycare is a fictional game daycare.
- Services named are only daycare, boarding, baths and exit baths. All prices are game coins.
- Booking, app and directions clicks are clicks, never bookings.
- Fights are never rewarded, never tied to a breed, and safety is never paid for.

**Numbers (copied exactly from §4):**
- **Grid:** tile 2 world units, 36 columns × 28 rows, tile (c, r) covering x ∈ [−36 + 2c, −34 + 2c], z ∈ [−36 + 2r,
  −34 + 2r]. Entrance at (18, 27). Start coins 3,000; guide reward 200.
- **Rooms:** 2–10 tiles a side, wall 20 per segment, floor 10 per tile, door 30, at most 4 doors per room, no corner
  doors, at most 12 rooms.
- **Things:** at most 200 per facility (outdoor items, furniture, paths). Sell refund 75%.
- **Upgrades:** to level 2 = base × 1.8, to level 3 = base × 3.2, rounded to the nearest 10.
- **Fun and Appeal:** Fun cap 60, decay multiplier `1 − fun/200`, combined slowdown cap 50%, playtime bonus
  `floor(fun/6)`. Appeal cap 50, arrivals × `(1 + appeal/100)`, tip `floor(appeal/4)`.
- **XP:** check-in 5, playtime 2, bath 3, clean 1, checkout 10 (+5 at happiness 80 or more), `floor(coins/10)` for
  build, upgrade or land. Level N starts at `50·N·(N − 1)` XP. Level-up reward `25 × N`.
- **Prices:** daycare 40 (20–80), boarding 90 (50–160), bath 25 (10–50), exit bath 30 (10–60).
- **Pay:** checkout `round(daycare × (0.6 + 0.4 × happiness/100))` + tip (+ boarding) (+ exit bath). Bath = price, +10
  with a Deluxe Tub.
- **Fair price and demand:** `fair = default × (0.7 + 0.6 × rep/100) × (1 + appeal/200)`. Demand
  `clamp((fairDaycare / daycarePrice)^1.5, 0.3, 1.6)`. Bath or exit bath refused above 1.5 × fair.
- **Wages:** Standard 40 per staff per day. Lean 30 (energy recovers 20% slower). Generous 60 (energy recovers 25%
  faster, reputation +0.01 per game minute).
- **Upkeep:** `ceil(0.02 × spent)` per open room or thing per day. Paths, fences and the sign are free; closed = 0.
- **Supplies:** Basic 2 per check-in. Premium 5, with +5 happiness at check-in and +5 per bath.
- **Marketing:** Flyers 150, +20% for 3 days, level 2. Online ads 400, +40% for 3 days, level 5. Open house 800, +60%
  for 2 days and reputation +5, level 8. One at a time.
- **Money below zero:** pauses building, upgrading, land, hiring and marketing; the daycare keeps running; no loans or
  interest.

**Other:**
- Every user-facing string follows the spec's wording where the spec gives it.
- Reduced motion turns off confetti, screen shake and coin flight.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_019f4PwZn7y5xuGatgGz23Wo`.

## Review Focus

1. **A player sells the only path, or a door, while dogs are inside connected rooms.** The rooms go "Not connected".
   Dogs already inside stay safe and can still be checked out; only new placements are blocked. (Test: Task 8.)
2. **A player changes a playroom's group or closes a room while dogs are inside.** Changing the group is refused with a
   reason; closing keeps the dogs and only stops new ones. (Test: Task 3 for the group; Task 7 for closing.)
3. **Coins go below zero at day end, then the player tries to build, hire or start marketing.** Each is refused with
   "Paused until your coins are back above zero". Check-ins, care and checkouts still work, and income recovers.
   (Test: Task 7.)
4. **Moving a room onto land that would leave its furniture off-grid or overlapping.** The whole move is refused, and
   nothing is half-moved. (Test: Task 3.)
5. **A save edited by hand,** with an overlapping room, a tub in a playroom, or 2 front counters. It loads with only the
   invalid parts dropped, never a crash or a corrupt state. (Test: Task 2.)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/tycoon/catalog.ts` | All constants and catalogs: grid, parcels, room types, furniture, outdoor items, prices, paints, wages, supplies, campaigns, trophies list |
| `src/tycoon/types.ts` | Every state type (`TycoonState`, `Facility`, `Room`, `Placed`, `TDog`, `Ledger`…) and `Result` |
| `src/tycoon/grid.ts` | Geometry: tiles, footprints, rotation, room outlines and edges, doors, ownership, occupancy |
| `src/tycoon/state.ts` | `newTycoon`, `parseTycoon` (validation and repair), the active-facility helpers `fac` and `withFac` |
| `src/tycoon/build.ts` | Build actions on rooms, doors, furniture, items, paths, land, paint, close/open |
| `src/tycoon/connect.ts` | Connectivity search, room status, capabilities, `canOpen` |
| `src/tycoon/effects.ts` | Fun and Appeal totals and their derived multipliers |
| `src/tycoon/progress.ts` | XP, levels, rewards, unlock checks |
| `src/tycoon/business.ts` | Prices, fair price, demand, pay, expenses, marketing, ledger, day close, spend gate |
| `src/tycoon/run.ts` | Run loop ported from `src/game/engine.ts`: tick, arrivals, check-in, assign, care, checkout, separate, hire, open, welcome back, rush bonus |
| `src/tycoon/guide.ts` | Guided-start steps and reward |
| `src/tycoon/trophies.ts` | Milestone trophies |
| `src/tycoon/store.ts` | External store, save key `pawtastic-daycare-next-v1`, 250 ms tick, `useTycoon()` |
| `src/tycoon/render/models.ts` | Low-poly furniture, outdoor items, rooms and paths, built from `src/world/models.ts` |
| `src/tycoon/render/world.ts` | `TycoonWorld` three.js renderer: camera, picking, ghosts, overlay, dogs and staff, effects |
| `src/components/tycoon/*.tsx` | Stage, build toolbar, catalog, edit panel, paint, land, run HUD, dog panel, list view, finances, day report, guide, level-up, trophies, sign card |
| `src/tycoon/sound.ts` | Small Web Audio sound effects and music on/off |
| `src/routes/daycare-next.tsx` | The preview page |
| `drizzle/migrations/0008_tycoon_events.sql` | Adds the stage 1 event names to the `game_events` check |
| `qa/e2e-tycoon.cjs` | Phone-size browser checks |

Today's code changes only:
- `src/game/engine.ts`: export `NAMES` and `GUESTBOOK_MAX`.
- `src/lib/analytics.ts`: new `EVENT_NAMES`.
- `src/lib/settings.ts`: the `sound` and `music` switches.
- The hub (`src/routes/index.tsx`) and `src/routes/daycare.tsx`: preview links.

---

### Task 1: Catalog and grid geometry

**Files:**
- Create: `src/tycoon/catalog.ts`, `src/tycoon/grid.ts`, `src/tycoon/types.ts`
- Test: `src/tycoon/grid.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `RoomType = "lobby"|"playroom"|"calm"|"bath"|"boarding"|"staff"`
  - `Side = "N"|"E"|"S"|"W"`, `Door = { side: Side; i: number }`, where `i` is the index along that side from the
    room's top-left corner
  - `FloorStyle = "wood"|"tile"|"rubber"|"carpet"`
  - `Room = { uid; c; r; w; d; type: RoomType|null; group: GroupId|null; doors: Door[]; floor: FloorStyle; wall: string; spent; closed }`
  - `Placed = { uid; kind: ThingKind; c; r; rot: 0|1|2|3; level: 1|2|3; spent; room: string|null; closed }`
  - `ParcelId = "starter"|"west"|"east"|"north"|"northwest"|"northeast"`
  - The other state types are listed in Task 2.
- Produces, in `catalog.ts`:
  - **Constants:** `TILE=2`, `COLS=36`, `ROWS=28`, `ENTRANCE={c:18,r:27}`, `START_COINS=3000`, `GUIDE_REWARD=200`,
    `WALL_PRICE=20`, `FLOOR_PRICE=10`, `DOOR_PRICE=30`, `ROOM_MIN=2`, `ROOM_MAX=10`, `MAX_ROOMS=12`, `MAX_DOORS=4`,
    `MAX_THINGS=200`, `SELL_RATE=0.75`.
  - `PARCELS: { id: ParcelId; name; c0; c1; r0; r1; level; price }[]` (§4.1 table: starter 10–26 × 16–28 at 0; west
    0–10 × 16–28 at level 3 for 1,500; east 26–36 × 16–28 at 3 for 1,500; north 10–26 × 0–16 at 6 for 4,000; northwest
    0–10 × 0–16 at 10 for 6,000; northeast 26–36 × 0–16 at 12 for 8,000).
  - `FURNITURE`: the 15 rows of §4.2, each `{ id; name; w; d; allowed: RoomType[] | "any"; unlock; price; spots?; waiting?; boarder?; tub?: "basic"|"deluxe"; staffBoost?; fun?; appeal?; maxPerFacility?; required? }`.
  - `OUTDOOR`: the §4.3 rows, each `{ id; name; tab: "play"|"comfort"|"scenery"|"paths"; w; d; unlock; price; fun?: [n,n,n]; appeal?: [n,n,n]; levels: 1|3; free?: true; maxPerFacility? }`. The sign is free, one per facility,
    Appeal 1. `path` and `fence` have free upkeep.
  - `ThingKind` is the union of `FURNITURE` and `OUTDOOR` ids.
  - `FLOORS: FloorStyle[]`; `WALL_COLORS` (8 hex strings, starting with `"#F4EDE4"`).
  - `upgradePrice(base, toLevel: 2|3): number`
- Produces, in `grid.ts`:
  - `tileKey(c, r): string` (`"c,r"`), `tileCenter(c, r): { x; z }`, `tileAtWorld(x, z): { c; r } | null`
  - `rotatedSize(w, d, rot): { w; d }`, `thingTiles(p: { kind; c; r; rot }): { c; r }[]`
  - `roomTiles(room): { c; r }[]`
  - `roomOutline(room): { c; r; side: Side }[]`: every perimeter segment, as the inside tile plus the side it faces
  - `isCornerDoor(room, door): boolean`
  - `doorInside(room, door): { c; r }`, `doorOutside(room, door): { c; r }`
  - `parcelAt(c, r): ParcelId | null`, `isOwned(land: ParcelId[], c, r): boolean`
  - `roomPrice(w, d): number` (`(2w + 2d) × 20 + w × d × 10`)

- [ ] **Step 1: Write the failing tests**

```ts
expect(tileCenter(0, 0)).toEqual({ x: -35, z: -35 });
expect(tileCenter(18, 27)).toEqual({ x: 1, z: 19 });
expect(tileAtWorld(1.2, 19.9)).toEqual({ c: 18, r: 27 });
expect(tileAtWorld(100, 0)).toBeNull();
expect(rotatedSize(2, 1, 1)).toEqual({ w: 1, d: 2 });
expect(thingTiles({ kind: "agility", c: 12, r: 18, rot: 0 })).toHaveLength(6); // 3×2
expect(thingTiles({ kind: "agility", c: 12, r: 18, rot: 1 }).map((t) => t.c)).toEqual(expect.arrayContaining([12, 13]));
expect(roomPrice(4, 3)).toBe(400);
expect(roomOutline({ c: 10, r: 16, w: 4, d: 3 } as Room)).toHaveLength(14);
expect(isCornerDoor({ c: 10, r: 16, w: 4, d: 3 } as Room, { side: "S", i: 0 })).toBe(true);
expect(isCornerDoor({ c: 10, r: 16, w: 4, d: 3 } as Room, { side: "S", i: 1 })).toBe(false);
expect(doorOutside({ c: 10, r: 16, w: 4, d: 3 } as Room, { side: "S", i: 1 })).toEqual({ c: 11, r: 19 });
expect(parcelAt(18, 27)).toBe("starter");
expect(parcelAt(5, 20)).toBe("west");
expect(isOwned(["starter"], 5, 20)).toBe(false);
expect(upgradePrice(200, 2)).toBe(360);
expect(upgradePrice(200, 3)).toBe(640);
expect(upgradePrice(450, 2)).toBe(810);
```

- [ ] **Step 2: Run** `npx vitest run src/tycoon/grid.test.ts`. Expected: FAIL (the modules are missing).
- [ ] **Step 3: Implement `types.ts`, `catalog.ts` and `grid.ts` with the signatures above.** Rotation turns the
  footprint about its top-left tile: rot 1 and 3 swap w and d, and the tiles stay at `c..c+w'-1, r..r+d'-1`. "S" is +r.
- [ ] **Step 4: Run** `npx vitest run src/tycoon/grid.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: catalog and grid geometry".

### Task 2: State, new game and safe loading

**Files:**
- Create: `src/tycoon/state.ts`
- Modify: `src/tycoon/types.ts`; `src/game/engine.ts` (only add `export` to `NAMES` and `GUESTBOOK_MAX`)
- Test: `src/tycoon/state.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `TPlace = { kind: "lobby" } | { kind: "room"; room: string } | { kind: "calm"; room: string } | { kind: "bed"; room: string; bed: string }`
  - `TDog = Omit<Dog, "site"|"place"|"x"|"y"> & { place: TPlace }`. `Dog`, `Staff`, `Regular`, `Stats`, `GroupId` and
    `emptyStats` come from `src/game/engine.ts`.
  - `Prices = { daycare; boarding; bath; exitBath }`
  - `Wage = "lean"|"standard"|"generous"`, `Supplies = "basic"|"premium"`
  - `CampaignId = "flyers"|"online"|"openhouse"`
  - `IncomeKey = "daycare"|"boarding"|"baths"|"exitBaths"|"tips"|"bonus"`
  - `ExpenseKey = "wages"|"upkeep"|"supplies"|"marketing"|"building"`
  - `DayLedger = { day; income: Record<IncomeKey, number>; expenses: Record<ExpenseKey, number>; checkIns: number }`
  - `TReport = { day; income; expenses; profit; record: boolean; tip: string; admitted; checkouts; avgHappy }`
  - `Facility = { name; land: ParcelId[]; rooms: Room[]; items: Placed[]; dogs: TDog[]; staff: Staff[]; clockMin; day; reputation; cleanliness; stats: Stats; guestBook: Regular[]; open: boolean; prices: Prices; wage: Wage; supplies: Supplies; campaign: { id: CampaignId; untilDay: number } | null; ledger: DayLedger[]; scuffles: { room: string }[]; report: TReport | null; rush: { day: number; peak: number; since: number | null; awarded: boolean } }`
  - `TycoonState = { v: 1; coins; xp; seq; lastSeen; guide: { done: boolean; skipped: boolean; painted: boolean }; active: string; facilities: Record<string, Facility>; trophies: string[]; bestProfit: number; pendingLevel: number | null }`
  - `TResult = { ok: true; state: TycoonState; msg?: string; earned?: number } | { ok: false; error: string }`
- Produces, in `state.ts`:
  - `newTycoon(now: number): TycoonState`: facility `"f1"` named "My Daycare", land `["starter"]`, an entrance path
    item at (18, 27) with uid `"entrance"`, staff `[{ id: "s0", name: "Phil", energy: 100 }]`, clock 07:00, day 1,
    reputation 80, cleanliness 100, default prices, standard wage, basic supplies, `open: false`, coins 3,000
  - `parseTycoon(raw: unknown): TycoonState | null`: returns null for non-objects or a wrong `v`. It repairs instead of
    failing: it drops invalid rooms and items using Task 3/4 validators, `validRoomAt` and `validThingAt`, and re-adds a
    missing entrance.
  - `fac(s): Facility` and `withFac(s, f): TycoonState`

- [ ] **Step 1: Write the failing tests:**
  - `newTycoon(0)` has coins 3,000, one facility with only the entrance item, `open` false, and level 1 (xp 0).
  - Review Focus 5: a hand-edited save (two overlapping rooms, a `bath_tub` in a playroom, two `front_counter`s, an item
    off owned land, a door on a corner) parses to a state where:
    - the first room is kept and the overlapping one dropped
    - the tub is dropped
    - one counter is kept
    - the off-land item is dropped
    - the corner door is dropped
  - `parseTycoon("x")` is null; `parseTycoon({ v: 2 })` is null.
  - A save missing the entrance gets it back.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/state.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Validation calls `validRoomAt` and `validThingAt`, written in this task in `build.ts` as
  exported helpers that Tasks 3 and 4 then use. Rooms are checked in array order, then furniture, then outdoor items, so
  "first wins" is deterministic.
- [ ] **Step 4: Run** the test, then `npx vitest run src/game`. Expected: PASS. Today's game is unaffected by the
  export change.
- [ ] **Step 5: Commit** with the message "Tycoon: state, new game and safe save loading".

### Task 3: Build rooms, doors, room types and paint

**Files:**
- Modify: `src/tycoon/build.ts`
- Test: `src/tycoon/build-rooms.test.ts`

**Interfaces:**
- Consumes: Task 1 geometry, Task 2 `fac` and `withFac`.
- Produces, all returning `TResult`:
  - Uses `validRoomAt(f, room, ignoreUid?): string | null` (the reason, or null if valid), created in Task 2
  - `drawRoom(s, c, r, w, d)`, `addDoor(s, roomUid, door)`, `removeDoor(s, roomUid, door)`
  - `setRoomType(s, roomUid, type, group?)`, `paintRoom(s, roomUid, floor, wall)`
  - `moveRoom(s, roomUid, c, r)`, `sellRoom(s, roomUid)`
  - Building spends coins through `spend(s, amount, "building")` from Task 7. Until then it is a local stub inside
    `build.ts` that Task 7 replaces.

- [ ] **Step 1: Write the failing tests:**

```ts
const s0 = newTycoon(0);
const a = drawRoom(s0, 10, 16, 4, 3); // ok, cost 400
expect(a.ok && a.state.coins).toBe(2600);
expect(a.ok && fac(a.state).rooms[0]).toMatchObject({ w: 4, d: 3, type: null, doors: [] });
expect(drawRoom(s0, 10, 16, 1, 3)).toEqual({ ok: false, error: "Rooms are 2–10 squares a side." });
expect(drawRoom(s0, 2, 20, 3, 3)).toMatchObject({ ok: false, error: "Buy this land first." });
// overlap and shared walls
const b = drawRoom((a as Ok).state, 12, 16, 3, 3); // overlaps
expect(b).toMatchObject({ ok: false, error: expect.stringMatching(/Overlaps/) });
expect(drawRoom((a as Ok).state, 14, 16, 3, 3).ok).toBe(true); // shares the x=14 wall line, no tile overlap
```

  Doors:
  - `addDoor` on a corner fails with "Doors can't go on corners."
  - The 5th door fails with "A room can have up to 4 doors."
  - A door costs 30.

  Types:
  - A lobby is limited to one per facility.
  - Review Focus 2: `setRoomType` on a playroom with a dog inside fails with "Move the dogs out first."
  - Changing the type of an empty room is free.

  Paint is free and only accepts `FLOORS` and `WALL_COLORS`.

  `moveRoom`:
  - moves its furniture by the same offset
  - Review Focus 4: it's refused, with state unchanged, if any tile or furniture would land off owned land or
    overlapping
  - it's refused while dogs are inside

  `sellRoom` refunds `floor(0.75 × (room.spent + spent of its furniture))` and removes its furniture.

  Doors and paint add to `room.spent`; moves are free.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/build-rooms.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Occupancy for overlap checks covers room tiles, outdoor item tiles and path tiles (not
  furniture, which lives inside rooms). The entrance tile counts as a path.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: draw rooms, doors, types, paint, move and sell".

### Task 4: Furniture, outdoor items, paths, land, upgrades and limits

**Files:**
- Modify: `src/tycoon/build.ts`
- Test: `src/tycoon/build-things.test.ts`

**Interfaces:**
- Produces, all returning `TResult`:
  - Uses `validThingAt(f, thing, ignoreUid?): string | null`, created in Task 2 and extended here with the furniture
    rules
  - `placeThing(s, kind, c, r, rot)`. Furniture's `room` is set to the room containing all its tiles.
  - `moveThing(s, uid, c, r, rot)`, `upgradeThing(s, uid)`, `sellThing(s, uid)`
  - `paintPaths(s, tiles: { c; r }[])`, which places every valid path tile and returns the count in `msg`
  - `buyLand(s, parcel)`
  - `setClosed(s, uid, closed)`, which works for rooms and things
  - `level(s)` comes from Task 6. Until then it is a local helper that Task 6 replaces.

- [ ] **Step 1: Write the failing tests:**
  - **Furniture rules:**
    - a `bath_tub` in a playroom fails with "Bath tubs go in a Bath Room."
    - furniture outside any room fails with "Furniture goes inside a room."
    - a second `front_counter` fails with "Only one Front Desk Counter per daycare."
    - a `staff_couch` unlocks at level 5, so at level 1 it fails with "Unlocks at level 5."
  - **Outdoor items** can't overlap rooms or paths. A `play_yard` costs 200. `upgradeThing` takes it to level 2 for 360,
    then level 3 for 640, and a 4th upgrade fails with "Already at the top level." Scenery and furniture can't be
    upgraded.
  - **Selling:** a level-3 play yard refunds `floor(0.75 × (200 + 360 + 640)) = 900`. The entrance can't be sold
    ("The entrance stays."). Things with dogs on them can't be sold (furniture whose room holds dogs).
  - **Paths:** `paintPaths` over 5 tiles, 1 of which is occupied, places 4 and costs 40.
  - **Land:** `buyLand("west")` at level 1 fails with "Unlocks at level 3." At level 3 with 1,500 coins it succeeds, and
    building on the west parcel then succeeds.
  - **Limit:** the 201st thing fails with "This daycare is full (200 things)."
- [ ] **Step 2: Run** `npx vitest run src/tycoon/build-things.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Furniture overlap is checked against other furniture in the same room. Outdoor overlap is
  checked against rooms, outdoor items and paths.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: furniture, outdoor items, paths, land, upgrades, limits".

### Task 5: Connectivity, room status and capabilities

**Files:**
- Create: `src/tycoon/connect.ts`
- Test: `src/tycoon/connect.test.ts`

**Interfaces:**
- Produces:
  - `connectedRooms(f): Set<string>`. A breadth-first search from `ENTRANCE` over path tiles (4-way). A room is
    entered through a door whose `doorOutside` is a reached path tile, or through a door on a shared wall from a reached
    room. Both rooms' doors count, so a door on either side of the shared edge works. Rooms are passable.
  - `roomStatus(f, room): { connected: boolean; working: boolean; reason: string | null }`. Reasons, in this order:
    "Closed", "Not connected", "Choose a room type", "Needs a Front Desk Counter", "Needs a dog bed or play mat",
    "Needs a bath tub", "Needs a boarding bed", "Needs a staff couch".
  - `caps(f): { lobby: Room | null; waiting: number; playrooms: { room: Room; group: GroupId; spots: number }[]; calm: Room[]; bath: { room: Room; tub: "basic" | "deluxe" } | null; beds: { room: string; bed: string }[]; staffBoost: number }`.
    It covers working rooms only.
    - `waiting = min(10, 2 + 2 × benches)`
    - `spots = min(floor(w × d / 2), beds + mats + deluxe beds)`
    - `staffBoost = min(1.5, 0.5 × couches)`
    - the best tub wins
    - closed furniture doesn't count
  - `canOpen(f): { ok: boolean; missing: string[] }`. Missing entries are "A connected Lobby with a Front Desk Counter",
    "A connected Playroom with a dog spot" and "A connected Calm-Down Room".

- [ ] **Step 1: Write the failing tests:**
  - A lobby with a south door and a path from the door to the entrance is connected.
  - A playroom sharing the lobby's east wall with a door on that wall is connected through the lobby.
  - Removing that door disconnects it.
  - Selling one path tile in the chain disconnects both.
  - A playroom with 2 dog beds on 3 × 3 has 2 spots. With 6 beds on 3 × 3 it has 4 spots (area / 2).
  - 5 benches give 10 waiting spots, not 12.
  - `canOpen` lists all three missing things on a new game, and is ok after the guided build (built in a test helper
    `guidedBuild(s)`, reused by later tasks).
- [ ] **Step 2: Run** `npx vitest run src/tycoon/connect.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `src/tycoon/testkit.ts` with exports `guidedBuild(s): TycoonState` and
  `richState(): TycoonState`, test-only fixtures used by Tasks 5–10. `guidedBuild` builds:
  - a 4 × 3 lobby at (16, 22) with a south door and a path to (18, 27), plus a counter and a bench
  - a 3 × 3 playroom east of it at (20, 22), small-gentle, with a door on the shared wall, 2 dog beds and a water bowl
  - a 2 × 2 calm room west of it at (14, 22) with a door on the shared wall
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: connectivity, room status, capabilities, open rules".

### Task 6: Fun and Appeal, XP and levels

**Files:**
- Create: `src/tycoon/effects.ts`, `src/tycoon/progress.ts`
- Modify: `src/tycoon/build.ts` (XP for building and use of `level()`)
- Test: `src/tycoon/effects.test.ts`, `src/tycoon/progress.test.ts`

**Interfaces:**
- Produces, in `effects.ts`:
  - `funAppeal(f): { fun: number; appeal: number }`. It sums open outdoor items (by level) and furniture in working
    rooms, capped at 60 and 50.
  - `decayMultiplier(fun: number, decorSlow = 1): number` (`max(0.5, decorSlow × (1 − fun/200))`)
  - `playBonus(fun)`, `arrivalMultiplier(appeal)`, `tip(appeal)`
- Produces, in `progress.ts`:
  - `xpForLevel(n)`, `levelOf(xp)`, `level(s)`
  - `gainXp(s, amount): TycoonState`. It applies a `25 × N` coin reward for each level crossed, sets
    `pendingLevel = N` (the highest) and records `tycoon_level` through an injectable `onLevel` hook. Task 11 wires
    analytics.
  - `unlocksAt(n): string[]`, the names newly unlocked at level n, for the celebration cards.
  - `XP = { checkIn: 5, playtime: 2, bath: 3, clean: 1, checkout: 10, happyCheckout: 5 }`
  - `buildXp(coins) = floor(coins/10)`

- [ ] **Step 1: Write the failing tests:**
  - `levelOf(0)=1`, `levelOf(99)=1`, `levelOf(100)=2`, `levelOf(1000)=5`, `levelOf(4500)=10`, `levelOf(10500)=15`.
  - `gainXp` from 90 to 1,010 XP crosses levels 2–5, with coins `+ (50 + 75 + 100 + 125)` and `pendingLevel = 5`.
  - Fun: 70 raw is capped at 60, giving `decayMultiplier(60) = 0.7` and `playBonus(60) = 10`.
  - Appeal: 50 gives `arrivalMultiplier = 1.5` and `tip = 12`.
  - A closed fountain adds nothing. Furniture in a "Not connected" room adds nothing.
  - Building a 400-coin room gives 40 XP. Selling removes no XP.
  - `unlocksAt(5)` includes "Agility Course", "Mini Hurdles", "Deluxe Dog Bed" and "Staff Couch".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace Task 4's local `level` helper with `progress.level`, and add `gainXp` to every
  build spend.
- [ ] **Step 4: Run** `npx vitest run src/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: Fun/Appeal effects, XP and levels".

### Task 7: The business

**Files:**
- Create: `src/tycoon/business.ts`
- Modify: `src/tycoon/build.ts` (use the real `spend`)
- Test: `src/tycoon/business.test.ts`

**Interfaces:**
- Produces:
  - `PRICE_DEFAULTS`, `PRICE_RANGES`
  - `setPrice(s, service: keyof Prices, value): TResult`. It clamps to the range.
  - `fairPrice(service, reputation, appeal): number`, `demand(f): number`, `refuses(service, f): boolean`
  - `checkoutPay(f, dog: TDog, exitBath: boolean): { total; parts: Partial<Record<IncomeKey, number>> }`
  - `bathPay(f): number`
  - `earn(s, parts): TycoonState`. It adds coins and today's ledger income.
  - `spend(s, amount, key: ExpenseKey): TResult`. It refuses with "Paused until your coins are back above zero" when
    `coins < 0`, and with "Need N more coins" when short.
  - `upkeepOf(thing | room): number`, `dayExpenses(f): Record<ExpenseKey, number>`
  - `setWage(s, wage)`, `setSupplies(s, supplies)`
  - `startCampaign(s, id): TResult`, `campaignBoost(f): number`
  - `closeDay(s): TycoonState`. It charges wages, upkeep and supplies (which may take coins below 0), writes the
    `TReport` (with a `record` flag versus `bestProfit` and a money tip), keeps 14 ledger days and starts the next day's
    ledger.
  - `moneyTip(f, report): string`. The rule: the open thing with the highest upkeep per point of Fun + Appeal is
    named, as in "Your Fountain costs 16 a day and adds Appeal 6 — worth it while you have room for more dogs". If that
    ratio is above 4 coins per point, the tip instead suggests closing it.
  - `wageRecovery(wage): number` (0.8, 1, 1.25)

- [ ] **Step 1: Write the failing tests** (exact values):
  - **Pay:**
    - `checkoutPay` at default prices, happiness 50, appeal 0 = `round(40 × 0.8) = 32`.
    - A boarder with an exit bath = `32 + 90 + 30`.
    - At appeal 40, the tip adds +10.
    - `bathPay` with a deluxe tub = 35.
  - **Fair price and demand:**
    - `fairPrice("daycare", 80, 0) = 40 × 1.18 = 47.2`.
    - `demand` at a price of 40 with fair 47.2 = `min(1.6, (47.2/40)^1.5) ≈ 1.282`.
    - At a price of 80, demand = 0.3 (the floor).
    - A bath priced 80 with fair 29.5 is refused.
  - **Expenses:**
    - Upkeep: a level-1 small playroom costing 600 → 12. A path → 0. A closed fountain → 0. A room spent 430 → 9.
    - `closeDay` with 1 standard staff member, upkeep 30 and 8 basic check-ins charges `40 + 30 + 16 = 86`.
    - The report profit equals the ledger income minus all expenses (building included).
    - `record` is true only when the profit beats `bestProfit`, and the record is then updated.
  - **Review Focus 3:**
    - From coins 50 with expenses 86, `closeDay` leaves −36.
    - `spend` for building, hiring and marketing then fails with "Paused until your coins are back above zero".
    - `earn` of 40 brings coins to 4, after which `spend(10)` works.
  - **Marketing:**
    - `startCampaign("online")` at level 4 fails with "Unlocks at level 5".
    - At level 5 it costs 400, and `campaignBoost` = 1.4 until `untilDay` passes.
    - A second campaign while one runs fails with "One campaign at a time."
  - **Wages:** `wageRecovery("lean")` = 0.8, and "generous" costs 60 per staff member.
  - **Review Focus 2 (closing):** `setClosed` on an occupied playroom keeps its dogs, and its `upkeepOf` is 0 at the
    next `closeDay`.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/business.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and replace the Task 3 `spend` stub.
- [ ] **Step 4: Run** `npx vitest run src/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: prices, demand, expenses, marketing, ledger, below-zero rules".

### Task 8: Run loop ported from today's engine

**Files:**
- Create: `src/tycoon/run.ts`
- Test: `src/tycoon/run.test.ts`

**Interfaces:**
- Consumes: `src/game/engine.ts` exports: `BREEDS`, `NAMES`, `REGULAR_CHANCE`, `GUESTBOOK_MAX`, `friendshipLevel`,
  `personalityOf`, `FAVORITE_LABEL`, `mismatchWarning`, `lobbyStatus`, `DAY_OPEN`, `DAY_CLOSE`, `GAME_MIN_PER_SEC`,
  `ARRIVAL_CHANCE_PER_MIN`, `SCUFFLE_CHANCE_PER_SEC`, `REP_MIN`, `MAX_OFFLINE_REWARD`, `hireCost`, `MAX_STAFF`,
  `STAFF_NAMES`, `groupOf`.
- Produces, all returning `TResult` unless noted:
  - `setOpen(s, open)`. Opening needs `canOpen`.
  - `tick(s, seconds, rand = Math.random): TycoonState`
  - `createArrival(s, rand)`
  - `checkIn(s, dogId)`. It pays nothing, gives check-in XP and counts 1 for supplies; premium supplies add +5
    happiness.
  - `assignRoom(s, dogId, roomUid, confirmMismatch = false)`, `assignBed(s, dogId, bedUid)`, `toCalm(s, dogId)`
  - `playtime(s, dogId)`, `bath(s, dogId)`, `clean(s)`, `checkout(s, dogId, exitBath)`
  - `separate(s, roomUid)`, `hireStaff(s)`, `welcomeBack(s, now): { state; bonus }`

**Port rules (§4.5):**
- The same decay and gain numbers as today's `tick`, `playtime`, `bath` and `clean`. Happiness decay is multiplied by
  `decayMultiplier(fun)`. Playtime happiness gets `+ playBonus(fun)`.
- **Arrivals:** they roll only when `open` and the lobby is open, with chance
  `ARRIVAL_CHANCE_PER_MIN × rep/80 × arrivalMultiplier(appeal) × demand(f) × campaignBoost(f)`. They need a free waiting
  spot. Boarders arrive with probability `0.25 × min(1.6, (fairBoarding/boardingPrice)^1.5)` when a free bed exists.
- **Playtime** pays no coins.
- **Staff energy** regenerates `2 × wageRecovery × (1 + staffBoost)` per second.
- **Mismatches:** the `scuffle` and `separate` behaviour per room id, as today. A mismatched assignment needs
  confirmation. Dogs in a scuffle can be moved to calm.
- **End of day:** at `DAY_CLOSE` the clock wraps and `closeDay` runs.
- **Checkout** pays `checkoutPay`, gives XP, updates the guest book (as today) and frees the bed or spot.
- **Doors:** dogs keep their place even if the room becomes disconnected (Review Focus 1); assigning to a disconnected
  room fails with "Not connected".
- **Rush:** when the lobby reaches 3 or more waiting and then 0 within 30 game minutes, add a once-per-day bonus of
  `round(0.1 × daycarePrice × peak)` coins to the "bonus" income, with the message "Smooth operator! +N".

- [ ] **Step 1: Write the failing tests.** These are today's `src/game/engine.test.ts` care cases, rewritten for placed
  rooms using `guidedBuild`, plus:
  - Arrivals need `open`; `setOpen(true)` on a new game fails with the missing list.
  - Check-in pays 0, adds 5 XP and counts 1 supply.
  - Assigning a small-gentle dog to a small-active room needs confirmation. A large dog in a 2-spot room that's full
    fails with "That playroom is full."
  - Baths without a working bath room fail with "Build a Bath Room with a tub first."
  - Checkout at happiness 50 pays 32 and adds 10 XP. At happiness 85 it adds 15 XP.
  - A boarder needs a free connected bed; `assignBed` to a taken bed fails.
  - With a seeded `rand` (`mulberry(seedFrom("t"))`), 660 game minutes of `tick` with the guided build produce between
    4 and 14 arrivals at default prices, and fewer than 4 at price 80.
  - **Review Focus 1:** after selling the only path while a dog is in the playroom, `checkout` of that dog still works,
    and a new `assignRoom` there fails with "Not connected".
  - `welcomeBack` after 1 hour gives the bonus (capped at 150), charges no expenses and doesn't advance the day.
  - The rush bonus is awarded once per game day.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: run loop in player-built rooms (ported rules)".

### Task 9: Guided start and trophies

**Files:**
- Create: `src/tycoon/guide.ts`, `src/tycoon/trophies.ts`
- Test: `src/tycoon/guide.test.ts`, `src/tycoon/trophies.test.ts`

**Interfaces:**
- Produces, in `guide.ts`:
  - `GUIDE_STEPS`, with the five §3 titles
  - `guideProgress(s): { step: 1|2|3|4|5|6; checks: boolean[] }`, where 6 means done. A step is complete when the state
    shows it:
    1. A connected lobby with a counter and a bench.
    2. A connected playroom with a group, 2 or more dog beds, and a water bowl.
    3. A connected calm room.
    4. `guide.painted`, or the step was skipped.
    5. `stats.checkouts >= 1`.
  - `markPainted(s)`, `skipGuide(s)`
  - `claimGuide(s): TResult`. It gives +200 once.
- Produces, in `trophies.ts`:
  - `TROPHIES: { id; name; reward }[]`:
    - `first_dog` 50, `dogs_10` 100, `dogs_50` 200, `dogs_250` 400
    - `profit_1000` 300
    - `first_boarder` 100, `fully_booked` 150
    - `all_room_types` 250, `all_land` 500
  - `checkTrophies(s): { state; unlocked: Trophy[] }`. Each trophy unlocks once and pays its reward.

- [ ] **Step 1: Write the failing tests:**
  - `guidedBuild` gives steps 1–3 done and step 4 pending. `markPainted` moves it to step 5. After one checkout it is
    done, and `claimGuide` pays 200 once.
  - `skipGuide` hides the guide without paying.
  - `first_dog` unlocks on the first checkout and pays 50, once.
  - `fully_booked` unlocks when every playroom spot and every bed is taken at once.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: guided start and trophies".

### Task 10: First-week balance check

**Files:**
- Create: `src/tycoon/balance.test.ts`

**Interfaces:**
- Consumes everything above. The test plays a deterministic bot:
  - It runs `guidedBuild`, then opens and plays 7 game days with `mulberry(seedFrom("week1"))`.
  - It checks in each arrival and assigns it to a matching room (building one more playroom for a group when none
    fits), gives playtime once, bathes when a bath room exists, and checks out at 16:30.
  - Building: a bath room with a basic tub at level 2, a ball pit and a water station as soon as affordable, then land
    at level 3.

- [ ] **Step 1: Write the test.** Assert:
  - The guided build costs ≤ 1,700.
  - Day 1 profit (excluding building) ≥ 0, and day 2 profit ≥ 0.
  - Level 3 is reached by day 4.5 at the latest (3 ± 50%), and level 5 by day 7.5.
  - Every day's non-building profit is ≥ 0.
  - Coins never drop below 0.
  Print the daily ledger with `console.log` for tuning.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/balance.test.ts`. Expected: PASS, or failing on a target.
- [ ] **Step 3: If a target fails,** tune only these constants: `ARRIVAL` multipliers are off-limits, but the following
  may change, within ±25% of the spec value: the default daycare price, the bath price, the XP checkout value, and the
  upkeep rate. Record each change as a ledger ruling with the before and after numbers. If ±25% isn't enough, stop and
  report.
- [ ] **Step 4: Run** `npx vitest run src/tycoon`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: first-week balance check".

### Task 11: Store, preview route, list view and analytics

**Files:**
- Create: `src/tycoon/store.ts`, `src/routes/daycare-next.tsx`
- Create: `src/components/tycoon/RunHud.tsx`, `ListView.tsx`, `DogPanel.tsx`, `GuideCard.tsx`
- Create: `drizzle/migrations/0008_tycoon_events.sql`, plus its meta snapshot and journal entry (idx 8, when
  1793650000000)
- Modify:
  - `src/lib/analytics.ts`: add `tycoon_build`, `tycoon_land`, `tycoon_level`, `tycoon_guide`, `tycoon_open`,
    `tycoon_price`, `tycoon_marketing`, `tycoon_day`, `tycoon_trophy` to `EVENT_NAMES`
  - `src/test/migrations.test.ts`: the file list
  - `src/routes/index.tsx` and `src/routes/daycare.tsx`: a "Try the new Daycare (preview)" link to `/daycare-next`
- Test: `src/tycoon/store.test.tsx`, `src/components/tycoon/ListView.test.tsx`, and a migration assertion in
  `src/test/notifications-db.test.ts` style (a new file `src/test/tycoon-events-db.test.ts`)

**Interfaces:**
- Produces:
  - In `store.ts`: `KEY = "pawtastic-daycare-next-v1"`, `TICK_MS = 250`, `useTycoon(): { state; act(fn: (s) => TResult, opts?: { quiet?: boolean; event?: { name: EventName; props: Record<string, string | number | boolean> } }); set(fn); paused; setPaused }`.
    - `act` applies `checkTrophies`. On success it sends `opts.event` through `track`, plus `tycoon_trophy { id }` for
      each new trophy.
    - The store sends `tycoon_day { day, income, expenses }` when a new `report` appears, and wires `gainXp`'s `onLevel`
      hook to `tycoon_level { level }`.
    - **Event senders:**
      - Build UI (Task 13): `tycoon_build { kind, action }` on place, upgrade, move, sell and paint; `tycoon_land
        { parcel }` on land.
      - Finances (Task 14): `tycoon_price { service, price }` and `tycoon_marketing { campaign }`.
      - This task: `tycoon_open { day }` when opening and `tycoon_guide { step }` on each guide step completed.
    - Loading uses `parseTycoon`. An unreadable save is set aside as `${KEY}-unreadable-<ts>` and a new game starts.
    - It pauses on `visibilitychange` and calls `welcomeBack` on activation.
  - `ListView` shows the lobby, rooms with status reasons, dogs with every run action, and a Build list with "Place in
    first free spot". It uses `placeFirstFree(s, kind)`, which this task adds to `build.ts`: the first valid tile
    scanning rows top to bottom, then columns left to right, rotation 0 then 1. For rooms, a default size is chosen per
    type (lobby 4×3, playroom 3×3, calm 2×2, bath 3×2, boarding 3×3, staff 2×2). For furniture, it targets the first
    working room that allows it.
  - `RunHud` shows coins (rolling number), `Lv N` with an XP bar, `Day N 09:15`, an Open/Closed toggle (with the
    missing list when it can't open) and a pause button.

- [ ] **Step 1: Write the failing tests:**
  - The store round-trips a game through localStorage.
  - A corrupt save is set aside.
  - `ListView` can run the whole guided start: draw the lobby with "Place in first free spot", type it, add a door,
    paths, counter, bench, playroom, beds, bowl, calm room, open, check in, assign, playtime and checkout.
  - The migration test accepts all 9 new names in `game_events`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `placeFirstFree` also adds a door facing the nearest path, and paths along the shortest route to the entrance
    (breadth-first over free owned tiles), charging their price.
  - The route renders the list view when the 3D view is off or unavailable. The 3D stage comes in Task 12.
  - Migration 0008 replaces `game_events_name_check` with the 0007 list plus the 9 names.
- [ ] **Step 4: Run** `npx vite build` (which regenerates the route tree), then `npx vitest run` and
  `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 5: Commit** with the message "Tycoon: store, preview route, list view, preview links, events migration".

### Task 12: 3D renderer

**Files:**
- Create: `src/tycoon/render/models.ts`, `src/tycoon/render/world.ts`, `src/components/tycoon/TycoonStage.tsx`
- Test: `src/tycoon/render/models.test.ts`

**Interfaces:**
- Consumes: from `src/world/models.ts`: `mat`, `part`, `GEO`, `buildDog`, `coatFor`, `buildPerson`, `makeTag`,
  `makeSign`, `blobShadow`.
- Produces:
  - In `models.ts`:
    - `buildThing(kind: ThingKind, level: 1|2|3): THREE.Group`, centred on its footprint, with
      `userData.pick = { kind: "thing", uid }` set by the caller
    - `buildRoom(room, status): THREE.Group`, with: a floor in the chosen style and wall colour (playrooms add a stripe
      in their `GROUP_COLORS` colour); wall height 1.1; a door gap with a frame; a name tag; and a grey reason badge when
      not working. It skips walls already drawn by a neighbour, using a `drawnEdges: Set<string>` argument.
    - `buildPath(c, r)`
  - In `world.ts`:
    - `class TycoonWorld { constructor(canvas, opts: { onPick(p: TPick | null): void; reducedMotion: boolean; lowPower: boolean }); setSnapshot(snap: { state: TycoonState; selected: string | null; ghost: Ghost | null; overlay: boolean; looks: WorldLooks }); resetCamera(); zoom(f: number); fx(kind: "drop" | "sparkle" | "coins" | "confetti" | "puff", at: { c: number; r: number } | "hud"); dispose() }`
    - `TPick = { kind: "tile"; c; r } | { kind: "edge"; c; r; side: Side } | { kind: "room"; uid } | { kind: "thing"; uid } | { kind: "dog"; id }`
    - `Ghost = { kind: "room"; c; r; w; d; ok: boolean; label: string } | { kind: "door"; room: string; door: Door; ok: boolean } | { kind: "thing"; thing: ThingKind; c; r; rot; ok: boolean }`

**How it works:**
- The camera copies `DaycareWorld`'s overhead model (pitch 56°, FOV 42, distance clamp 9–60, pan and pinch). Reset
  frames the owned land.
- **Picking:** dogs by screen distance first, then a ground-plane raycast to a tile. In build mode an "edge" pick is
  returned when the point is within 0.35 units of a tile edge.
- **Rebuilds:** static groups (ground, road, entrance gate) are built once. The rooms, things and paths groups are rebuilt
  only when their JSON key changes (as `syncDynamic` does today).
- **Dogs and staff** stand at slot positions inside their room, the lobby or a bed, with today's idle wag and bob.
- **Overlay:** owned land in light green, unowned in grey with "For sale" signs.
- **Effects:** short-lived tweens. `reducedMotion` turns them into nothing (confetti and coins) or an instant change.
- **Loop:** pauses when hidden.

- [ ] **Step 1: Write the failing tests** (jsdom, no WebGL):
  - `buildThing` returns a Group with at least one Mesh for every `ThingKind` and level.
  - A level-3 play yard's bounding box is bigger than level 1's.
  - `buildRoom` for a 4 × 3 room with one south door has 13 wall segments plus a door frame.
  - Neighbouring rooms don't double-draw a shared edge.
- [ ] **Step 2: Run** `npx vitest run src/tycoon/render`. Expected: FAIL.
- [ ] **Step 3: Implement** `models.ts`, `world.ts` and `TycoonStage.tsx`. The stage lazy-loads `world.ts`, like
  `DaycareStage`, and falls back to the list view when `webglAvailable()` is false. Mount it in the route.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit -p .` and `npx vite build`. Expected: pass.
- [ ] **Step 5: Commit** with the message "Tycoon: 3D renderer (rooms, walls, doors, furniture, items, dogs, picking,
  ghosts)".

### Task 13: Build mode UI

**Files:**
- Create: `src/components/tycoon/BuildToolbar.tsx`, `CatalogSheet.tsx`, `EditPanel.tsx`, `PaintSheet.tsx`,
  `LandSheet.tsx`
- Modify: `src/routes/daycare-next.tsx`
- Test: `src/components/tycoon/build-ui.test.tsx`

**Interfaces:**
- Consumes: the Task 3/4 actions, `validRoomAt`, `validThingAt`, `roomStatus` and `unlocksAt`. Task 12 provides
  `TPick` and `Ghost`.
- **The flow:**
  - **Toolbar** tools: Rooms, Doors, Furniture, Outdoor, Paths, Paint, Land, Sell, with the catalog in a bottom sheet.
    Locked entries show "Unlocks at level N".
  - **Rooms:** the first tile tap sets a corner and the second tap sets the opposite corner (or drag on desktop). The
    ghost shows "W × D" and the price, green or red with the reason. **Build**, then a type picker (a group picker for
    playrooms).
  - **Doors:** tapping an edge adds a door, with a ghost first.
  - **Furniture and outdoor:** the ghost follows taps, with **Rotate**, **Place** and **Cancel**.
  - **Paths:** "paint" mode; each tapped tile is added to a pending list shown as ghosts, and **Done** calls
    `paintPaths`.
  - **Paint:** tap a room, pick from `FLOORS` and `WALL_COLORS`, which calls `paintRoom` and `markPainted`.
  - **Land:** sheet with each parcel's state.
  - **Edit panel** (tapping a room or thing with no tool active): level and effect, status reason, and Upgrade, Move,
    Rotate (things), Change type (rooms), Close/Open, Paint (rooms) and Sell, with a confirmation showing the refund.

- [ ] **Step 1: Write the failing tests** (the Testing Library route with a stubbed stage that emits `TPick`s):
  - Draw a 4 × 3 room by two tile picks, see "4 × 3 · 400" and Build.
  - The type picker sets Lobby.
  - An edge pick adds a door.
  - A furniture placement of a `bath_tub` in a lobby shows the red reason.
  - Selling a room asks to confirm and shows the refund.
  - A locked item shows "Unlocks at level 5".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: Sims-style build mode UI".

### Task 14: Run UI, finances and day report

**Files:**
- Create: `src/components/tycoon/FinancesSheet.tsx`, `DayReport.tsx`, `MoneyBanner.tsx`, `SignCard.tsx`
- Modify: `src/routes/daycare-next.tsx`, `DogPanel.tsx`
- Test: `src/components/tycoon/finances.test.tsx`

**Interfaces:**
- **Finances**, with five tabs (§3):
  - **Summary:** today, yesterday and 7 days by category, plus a 14-day profit bar chart in plain SVG bars, labelled.
  - **Prices:** sliders with the range, a fair marker and the hint "Above fair: fewer dogs will come" or "Below fair:
    more dogs, less per dog"; calls `setPrice` and tracks `tycoon_price`.
  - **Staff:** the wage choice with its effects; hire.
  - **Upkeep:** a list with daily cost and an Open/Closed switch.
  - **Marketing:** campaigns with cost, effect and days; one at a time; locked ones show their level.
- **Day report:** the existing wrap-up content plus income, expenses and profit, a "New record!" banner when `record`,
  and the money tip.
- **Money banner:** when coins are below 0, it reads "Coins below zero: building is paused until income brings you back
  above zero" and lists one saving idea from `moneyTip`.
- **Sign card:** each location's "Book a free evaluation" link from `src/lib/locations.ts` and the
  `CUSTOMER_APP_URL`. Clicks are tracked as `booking_click`, `app_click` or `directions_click` with
  `from: "tycoon-sign"`. Tapping the sign thing (no tool active) opens it.

- [ ] **Step 1: Write the failing tests:**
  - Moving the daycare slider to 80 shows "Above fair: fewer dogs will come".
  - Closing an item updates the Upkeep total.
  - Starting Flyers spends 150, and Online ads is locked at level 4.
  - The day report shows profit and "New record!" when `record`.
  - The money banner appears at −36.
  - The sign card links have the right hrefs, and clicking records `booking_click` with `from: "tycoon-sign"`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: finances screen, day report with profit, money banner, sign card".

### Task 15: Game feel and sound

**Files:**
- Create: `src/tycoon/sound.ts`, `src/components/tycoon/LevelUp.tsx`, `TrophyShelf.tsx`, `CoinCounter.tsx`
- Modify: `src/lib/settings.ts` (`sound: boolean` default true, `music: boolean` default true),
  `src/components/game/GameHeader.tsx` (two switches), the route, and `world.ts` calls to `fx`
- Test: `src/components/tycoon/feel.test.tsx`

**Interfaces:**
- Produces:
  - `sound.play(name: "thunk" | "sparkle" | "coins" | "fanfare" | "drumroll" | "pop")`. Synthesized with Web Audio (no
    files), and it does nothing when the setting is off or the AudioContext is unavailable.
  - `music.setIntensity(0 | 1)` for normal play or rush hour; a simple looping arpeggio.
  - `CoinCounter` rolls from the old value to the new over 600 ms (instant with reduced motion).
  - `LevelUp` is a full-screen overlay for `pendingLevel`. It shows confetti (not with reduced motion), "Level N!", the
    `unlocksAt(N)` cards flipping in, "+25×N coins", and a Continue button that clears `pendingLevel`.
  - `TrophyShelf` sits in the Finances Summary tab.
  - Toasts:
    - checkout: "+N", with a floating number over the dog and coin flight to the HUD
    - trophy: "Trophy: …"
    - rush: "Rush hour!" when 3 or more are waiting, then "Smooth operator! +N"

- [ ] **Step 1: Write the failing tests:**
  - `LevelUp` shows for `pendingLevel = 5` and lists "Agility Course".
  - With `reducedMotion` it renders no confetti element.
  - `sound.play` with sound off doesn't create an AudioContext.
  - `CoinCounter` shows the final value immediately under reduced motion.
  - The trophy toast shows once.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: level-up celebration, coin roll, trophies, rush hour, sound and
  music".

### Task 16: Paid packs in the new game

**Files:**
- Modify: `src/tycoon/catalog.ts` (two entitlement-only furniture entries), `src/components/tycoon/CatalogSheet.tsx`,
  `src/tycoon/render/world.ts`
- Test: `src/components/tycoon/paid.test.tsx`

**Interfaces:**
- `FURNITURE` gains `cloud_bed` (1×1, Playroom, Fun +2, +1 spot) and `lighthouse_fort` (2×2, Playroom, Fun +5), both
  with `paid: "deluxe-decor"` and price 0.
  - The spec (§4.8) lists them under the Play tab. They are placed as playroom furniture instead, because beds belong
    inside rooms. Record this as a ledger ruling at execution.
- `CatalogSheet` shows them only when `useEntitlements()` says the visual `"deluxe-decor"` is owned. Otherwise they show
  locked with "Part of the Deluxe Daycare Decor pack" and no buy button.
- Dog bandanas use `looks.bandana` like `DaycareWorld` (`"navy-star-bandana"`).
- **Saves never mark paid things as owned.** If the entitlement disappears (for example a refund), placed paid things
  render greyed with "Pack no longer active", count nothing, and can still be sold for 0.

- [ ] **Step 1: Write the failing tests:**
  - Without the entitlement, `placeThing("cloud_bed")` fails with "Part of the Deluxe Daycare Decor pack".
  - With it, placement works at price 0.
  - After the entitlement is removed, `funAppeal` excludes it.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** `placeThing` takes an `owned: ReadonlySet<PaidItemId>` argument, passed from the store
  (`act` reads the current entitlements).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Tycoon: owned paid packs appear in the new game".

### Task 17: Browser checks and performance

**Files:**
- Create: `qa/e2e-tycoon.cjs`

- [ ] **Step 1: Write the script** (Pixel 7 Chromium plus iPhone 13, using `check()` like `qa/e2e-hub.cjs`):
  - The full guided start in 3D by tapping tiles: lobby, door, path, counter, bench, playroom, beds, bowl, calm room,
    paint, open, check in, assign, playtime, checkout. Then the guide reward.
  - A red ghost on overlap.
  - A door between rooms connects the inner room, and selling a path shows "Not connected".
  - Upgrade, move and sell.
  - Finances: change a price and see the hint, close an item, start Flyers. Play 3 days at 8× speed through
    `window.__tycoonSpeed` (a test hook in `store.ts`, honoured only when `import.meta.env.DEV`), then check the profit
    chart has 3 bars.
  - Below-zero banner.
  - Buy West land at level 3 (set the XP through `window.__tycoonSet`, DEV only).
  - The level-up overlay, with reduced motion on and off.
  - The list view plays the same loop.
  - The sign card click is recorded.
  - Frame rate with 12 rooms and 200 things: ≥ 30 fps measured over 3 s with `requestAnimationFrame` timing.
  - No page errors.
- [ ] **Step 2: Run** against `exec npx vite --host 127.0.0.1 --port 5173 --strictPort`:
  `node qa/e2e-tycoon.cjs`. Expected: all PASS.
- [ ] **Step 3: Run the existing suites:** `qa/e2e-hub.cjs`, `e2e-daycare.cjs`, `e2e-teams.cjs`, `e2e-cloud.cjs` and
  `e2e-notify.cjs`. Expected: all pass, with today's game unchanged.
- [ ] **Step 4: Commit** with the message "QA: tycoon browser checks and performance".

### Task 18: Release the preview

- [ ] **Step 1: Full verification:** `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build` and every
  `qa/e2e-*.cjs`. Expected: all green.
- [ ] **Step 2: Apply migration 0008** to the Daycare database with `mcp__Lovable__query_database` in one transaction,
  recording its sha256 with `created_at` 1793650000000. Verify that 9 migrations are recorded and the check lists the
  new names. This comes **before** publishing.
- [ ] **Step 3: Sync to `/home/user/pawtastic-daycare-tycoon`:**
  1. Run `bash scripts/make-sync-manifest.sh`, copy the files and check their sha256.
  2. Run `diff -rq`; only the known differences may remain.
  3. tsc, vitest and build there.
  4. Commit and push `main`.
- [ ] **Step 4: Ask the owner to try the preview and to approve publishing** (a release decision). Publish only on his
  yes.
- [ ] **Step 5: Update `STATUS.md` and `AGENTS.md`** with the new engine's rules (the fairness constraints, the preview
  status, the save key), commit and push.
