# Daycare Tycoon replayability, Stage B: activities, dog preferences, staff roles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pups have plain-word likes; equipment becomes activities that suit some pups more than others, and you can see a pup busy at one; the bath becomes a queue; and from level 4 you manage a team with roles, workloads and named bottlenecks. Size and temperament groups, individual boarding beds, the noon–2 PM lobby break and free safety stay exactly as they are.

**Architecture:**
- **Rules:** pure functions in `src/tycoon/`, each tested:
  - `traits.ts`: what a pup likes;
  - `activities.ts`: which activity a playtime uses and how well it suits the pup;
  - `bath.ts`: the bath queue;
  - `team.ts`: roles, the work they do in `tick`, workload and bottlenecks.
- **Screen:** small additions to `DogPanel`, `TycoonMap`, the build lists and the 3D dog actors, plus a new Team sheet and a "What's slowing you down" strip below the world.
- **Save:** gains optional fields. Older saves load without them.

**Tech stack:** TanStack Start, React 19, Vitest with Testing Library, and Playwright (`qa/`).

**Spec:** `docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md` §4, with §6 (monetization), §7 (testing) and the owner's brief part 5 ("caretaker to manager").

## Global constraints

- `tycoon/AGENTS.md` fairness rules apply:
  - game coins only;
  - no forced waiting or paying to skip;
  - calm-down and separating always work, free, without coins, staff energy or a connected calm room;
  - time away never costs anything;
  - checkout pays only from a playroom or a boarding bed.
- Unchanged: size-and-temperament groups and scuffle rules, individual boarding beds, and `lobbyStatus` (no drop-offs 12:00–14:00).
- Staff roles never block the player: every manual action still works, and roles only add automatic work.
- No new purchase, price or prompt. Nothing paid changes how activities, baths or staff work.
- Any change to prices, upkeep, XP or happiness gains needs `src/tycoon/balance.test.ts` green and a ledger note with the before and after numbers.
- Traits never mention aggression and are never tied to a breed (they come from the same name-and-breed hash as `personalityOf`, like favourites). Names stay fictional.
- Older saves (no `busy`, `loved`, `bathQueue`, `bathing` or `role`) load and play as before. Stage A's tour still completes: tour tests stay green.
- While the tour holds the clock, anything with a duration (busy pups, baths) counts real seconds, so nothing gets stuck.

## Review focus

1. **A save from before Stage B with a pup mid-bath, or one queued twice.** It loads, nothing is paid twice, and a pup who leaves (checkout) is removed from the queue. Tests in Task 6.
2. **Roles during the noon break and with a full lobby.** Reception never checks in more than the player could, and drop-offs still pause 12:00–14:00. Test in Task 9.
3. **A supervisor and the player both giving playtime.** Energy is spent once per playtime, and a pup is never double-paid or pushed over 100. Test in Task 9.
4. **A shy or senior pup in a room with only agility.** The best activity is still general play or rest, never a forced mismatch. Test in Task 3.
5. **Balance.** The seeded first week (`balance.test.ts`) and a level-4+ team week stay within the stated ranges. Tests in Tasks 3 and 9.

---

### Task 1: What a pup likes (`src/tycoon/traits.ts`)

**Files:** create `src/tycoon/traits.ts`; modify `src/components/tycoon/DogPanel.tsx`; test `src/tycoon/traits.test.ts`.

**Interfaces:**
- `type Traits = { water: boolean; energetic: boolean; shy: boolean; senior: boolean }`.
- `traitsOf(d: { name: string; breed: number; temper: Temper }): Traits`:
  - **water:** favourite is `splash`, or the trait is "Water lover";
  - **energetic:** temperament `active`, or favourite `zoomies` or `fetch`;
  - **shy:** temperament `gentle` and the trait "Shy at first";
  - **senior:** `seedFrom(name|breed|senior) % 8 === 0` (about one pup in eight, the same on every visit).
- `likesLine(d): string`, plain words, e.g. "Loves water · favourite: bath time 🫧" or "Senior — enjoys quiet naps".

**Steps:**
- [ ] Write the tests:
  - each trait follows its rule on hand-picked pups;
  - over 800 generated pups, seniors are 8–17%;
  - the same pup gets the same traits on every visit;
  - `likesLine` never contains "aggress", "bite" or a breed name.
- [ ] DogPanel shows `likesLine` under the name (screen test: "Loves water" appears for a water-loving pup).
- [ ] Red, implement, green. Commit "Tycoon: pups' likes in plain words".

Ruling to ledger: the spec says senior "from the dog's id", but ids change on every visit. Using name and breed keeps a returning regular the same age.

### Task 2: Equipment is an activity — shown before you pay (`src/tycoon/activities.ts`)

**Files:** create `src/tycoon/activities.ts`; modify `src/components/tycoon/BuildToolbar.tsx` and `ListView.tsx` (catalog rows); test `src/tycoon/activities.test.ts` and a build-list screen test.

**Interfaces:**
- `type ActivityKind = "play" | "agility" | "water" | "rest"`.
- `ACTIVITY_OF: Partial<Record<ThingKind, Exclude<ActivityKind, "play">>>`:
  - `hurdles`, `agility` → agility;
  - `splash_pool` → water;
  - `nap_cabana`, `dog_bed`, `deluxe_bed`, `cloud_bed` → rest.
- `ACTIVITY_LABEL: Record<ActivityKind, { name: string; suits: string }>`, e.g. water → "Water play", "water-loving pups love it".
- `activityLine(kind: ThingKind): string | null`, e.g. "Adds: Water play — water-loving pups love it".

**Steps:**
- [ ] Tests:
  - every mapped kind exists in FURNITURE or OUTDOOR;
  - `activityLine("splash_pool")` names Water play;
  - a Toy Bin has no activity line;
  - the build catalog row for the Splash Pool shows the line before any tap.
- [ ] Red, implement, green. Commit.

### Task 3: Playtime uses the best activity in reach

**Files:** modify `src/tycoon/effects.ts` (`playGain`), `src/tycoon/run.ts` (`playtime`), `src/tycoon/activities.ts`; tests in `src/tycoon/activities.test.ts`; `src/tycoon/balance.test.ts` stays green.

**Interfaces:**
- `MATCH_BONUS = 8` and `NEUTRAL_BONUS = 3`.
- `bestActivity(f: Facility, dog: TDog): { kind: ActivityKind; thing: string | null; name: string; bonus: number }`.
- **In reach:**
  - furniture in the pup's own working room;
  - outdoor items for any pup in a working playroom (as yard fun works today);
  - closed items never count.
- **Bonus:**
  - `MATCH_BONUS` when the activity suits a trait (energetic → agility; water → water; shy or senior → rest);
  - `NEUTRAL_BONUS` for agility or water with no matching trait;
  - 0 for rest without a matching trait, and 0 for agility for a shy or senior pup (never chosen over play).
- **General play** has bonus 0 and is always available.
- **Ties:** the higher bonus wins, then the item with more fun.
- `playGain` gains `activity` and `fromActivity`, and `total` includes it.
- `playtime`:
  - sets `dog.busy = { kind, thing, left: BUSY_SEC }` with `BUSY_SEC = 8` real seconds;
  - sets `dog.loved = name` when the bonus is `MATCH_BONUS`;
  - message, e.g. "Rocket raced the Agility Course — full of energy! (+8, a great match)".
- Room and yard fun keep the Stage A numbers (Toy Bin +6, Play Yard +4).

**Steps:**
- [ ] Tests:
  - an energetic pup in a room with Mini Hurdles gets agility +8;
  - a shy pup in the same room gets rest (beds) or play, never agility;
  - a water-loving pup with a Splash Pool outside gets water +8;
  - a closed Splash Pool doesn't count;
  - the Stage A benefit test (Toy Bin +6) is unchanged;
  - `balance.test.ts` is green. If its numbers move, update its ranges with a ledger note giving the before and after numbers.
- [ ] Red, implement, green. Commit.

### Task 4: Busy time, and checkout says why the visit went well

**Files:** modify `src/tycoon/types.ts`, `state.ts` (`parseTycoon`), `run.ts` (`tick` both paths, `checkout`); test `src/tycoon/busy.test.ts`.

**Interfaces:**
- `TDog.busy?: { kind: ActivityKind; thing: string | null; left: number } | null`.
- `TDog.loved?: string | null`.
- `tick` lowers `left` by real seconds, in the held path too, and clears `busy` at 0.
- `checkout`'s message ends with " Loved the {loved}." when set.

**Steps:**
- [ ] Tests:
  - busy clears after 8 s, both when open and when the tour holds the clock;
  - an old save without the fields parses with them null;
  - a bad `busy` (unknown kind, negative left) parses to null;
  - checkout says "Loved the Splash Pool";
  - busy never blocks checkout, calm-down or separating.
- [ ] Red, implement, green. Commit.

### Task 5: You can see a pup busy (map and 3D)

**Files:** modify `src/components/tycoon/TycoonMap.tsx` and `src/tycoon/render/world.ts` (`syncDogs`); test `src/components/tycoon/map.test.tsx`.

**Interfaces:**
- **Map:** a busy pup's marker sits on its item's square with an icon (🏁 agility, 💦 water, 💤 rest, 🎾 play). Its button name ends "…, at the Splash Pool".
- **3D:** a busy pup's actor walks to the item's tile and plays a hop (agility), splash bob (water) or lie-down (rest) using the existing rig phase. Reduced motion means no hop, only the position.

**Steps:**
- [ ] Map tests: the name and position of a busy pup.
- [ ] 3D check in Task 12's browser script: a busy pup's actor is within 1.5 tiles of its item.
- [ ] Red, implement, green. Commit.

### Task 6: The bath queue (`src/tycoon/bath.ts`)

**Files:** create `src/tycoon/bath.ts`; modify `run.ts` (`bath` becomes "join the queue"; `tick` runs it; `checkout` removes a queued pup), `types.ts`, `state.ts`, `DogPanel.tsx`, the bath room's panel in `ListView.tsx` and the map label; test `src/tycoon/bath.test.ts`, then update the existing bath tests.

**Interfaces:**
- `Facility.bathQueue?: string[]` (dog ids).
- `Facility.bathing?: { dog: string; tub: string; left: number }[]`.
- `BATH_SEC = 10` real seconds; one pup per working tub.
- `joinBathQueue(s, dogId): TResult` keeps today's bath checks: checked in, placed, not bathed, a working bath room, and a price the owners will pay.
- `runBaths(f, seconds): { f: Facility; paid: number }`:
  - a free tub starts the first queued pup when some staff member has 15 energy (bath-role staff first, Task 9);
  - finishing pays `bathPay`, sets `bathed` and `clean` 100, and gives the happiness bonus exactly as today.
- `bathQueueLabel(f)`: "Bath queue: 3 waiting".

**Steps:**
- [ ] Tests:
  - two tubs bath two pups at once;
  - a third waits and the label says 1 waiting;
  - pay happens once, at the end;
  - a pup checked out while queued or bathing leaves the queue and is never paid;
  - an old save without the fields works;
  - a duplicate id in a saved queue is dropped on load;
  - exit baths at checkout are unchanged.
- [ ] Update the existing bath tests for the queue. Ledger each changed expectation.
- [ ] Red, implement, green. Commit.

### Task 7: Staff roles — data and the Team sheet

**Files:** modify `types.ts` (`TStaff = Staff & { role?: Role | null; room?: string | null }`), `state.ts`; create `src/tycoon/team.ts` and `src/components/tycoon/TeamSheet.tsx`; open it from the status bar and from Finances; test `src/tycoon/team.test.ts` and `src/components/tycoon/team.test.tsx`.

**Interfaces:**
- `type Role = "reception" | "playroom" | "bath" | "cleaning"`.
- `ROLE_LEVEL = 4`.
- `setRole(s, staffId, role: Role | null, room?: string): TResult`:
  - refuses below level 4 ("Staff roles unlock at level 4");
  - refuses a `playroom` role without a working playroom.
- The Team sheet lists each staff member with an energy bar, a role picker (44 px targets) and the hire button (existing `hireStaff`).
- `unlocksAt(4)` includes "Staff roles".

**Steps:**
- [ ] Tests:
  - the level gate;
  - a playroom role needs a room;
  - a role survives a save and load;
  - an old save's staff have no role;
  - the sheet shows "Staff roles unlock at level 4" below level 4.
- [ ] Red, implement, green. Commit.

### Task 8: Manual actions prefer unassigned staff

**Files:** modify `run.ts` (`spendStaff`); test in `team.test.ts`.

**Interfaces:** `spendStaff(f, cost)` picks unassigned staff first, then anyone. The player is never refused while someone has the energy.

**Steps:** test the order, then red, implement, green. Commit.

### Task 9: Roles do their work in `tick`

**Files:** modify `team.ts` (`runRoles(s, seconds)`), `run.ts` (`tick` calls it after care decay); tests in `team.test.ts`.

**Work, at most one task per staff member every `ROLE_EVERY_SEC = 3` real seconds, paid from that member's own energy at today's costs:**
- **reception:** checks in the longest-waiting pup in the lobby (the same `checkIn`).
- **playroom:** gives playtime (the same `playtime`) to a pup in their room that has played 0 times, then to the least happy one under 60.
- **bath:** is the staff the bath queue uses first.
- **cleaning:** mops (`clean`) when cleanliness is below 60.

Roles never place pups, check pups out or set prices: layout, pricing, services and safety stay with the player. During the tour, roles wait like drop-offs do.

**Steps:**
- [ ] Tests:
  - reception checks in one pup per 3 s with energy and stops at 0 energy;
  - no drop-offs 12:00–14:00 with or without reception;
  - a supervisor plays only in their room;
  - a pup isn't double-played in the same 3 s;
  - roles do nothing while the tour holds;
  - a seeded "level 5, 4 staff, all roles" week stays within ranges recorded in the ledger;
  - `balance.test.ts` is green.
- [ ] Red, implement, green. Commit.

### Task 10: Workload and "What's slowing you down"

**Files:** extend `team.ts`; create `src/components/tycoon/Bottlenecks.tsx`; modify `TycoonPlay.tsx` (below the world, before the goals) and `business.ts` (count exit baths declined on price today); tests in `team.test.ts` and `src/components/tycoon/bottlenecks.test.tsx`.

**Interfaces:**
- `workload(f): { staff: string; role: Role | null; waiting: number; energy: number }[]`.
- `bottlenecks(f): string[]`, most urgent first, at most 3. Examples:
  - "Bath queue: 3 waiting";
  - "Small & Gentle playroom is full (3/3)";
  - "2 boarding beds unused";
  - "Owners declined 2 exit baths today (too pricey)";
  - "Sam is overloaded and Jo has spare time" (role staff under 20 energy with work waiting, while another has over 80).
- `DayLedger.declined?: { exitBath: number }`, counted when checkout with an exit bath is refused on price.

**Steps:**
- [ ] One test per message, plus the ordering test.
- [ ] Screen test: the strip lists the messages and is absent when there are none.
- [ ] Red, implement, green. Commit.

### Task 11: Goals know about Stage B

**Files:** modify `goals.ts`; test `goals.test.ts`.

At level 4 or above with 2 or more staff and no roles, the goal is "Give your team roles". With a bath room and nobody in the bath role, at 3 or more queued it is "Put someone on baths". Still at most 3 goals.

**Steps:** red, implement, green. Commit.

### Task 12: Browser checks and the Stage B report

**Files:** create `qa/e2e-stage-b.cjs` (iPhone 13 and a 1280 × 800 desktop; 3D and no-WebGL map).

**Checks:**
- A pup's likes show.
- The Splash Pool's catalog row names Water play before buying.
- A water-loving pup's playtime uses the pool, and you can see the pup at it on the map and in 3D.
- Bath queue: two pups queue, and the label counts down.
- Level 4: assign reception and see check-ins happen. The noon break still stops drop-offs.
- The bottleneck strip shows a full playroom.
- Older saves (a Stage A save and a pre-Stage-A save) load and play.

**Steps:**
- [ ] Red, then green.
- [ ] Run all `qa/e2e-*.cjs` suites, `npx vitest run`, `npx tsc --noEmit -p .` and `npx vite build`.
- [ ] Commit, then write the Stage B report: what was built, tests with counts, what is not verified on real devices, and the balance changes with numbers.
