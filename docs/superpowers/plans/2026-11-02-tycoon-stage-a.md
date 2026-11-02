# Daycare Tycoon replayability, Stage A: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new player meets a dog in the first minute, earns a payout within two minutes, places an upgrade and sees its benefit within five, makes a real choice within ten, and sees the next goal within fifteen. The daycare map is the main screen, and a browser without 3D gets an explained 2D map.

**Architecture:**
- **Rules:** pure functions in `src/tycoon/` (`tour.ts`, `goals.ts`, `controls.ts`, an extended `build.ts`), each with tests.
- **Screen pieces:** new React components (`StartCard`, `CoachBubble`, `TycoonMap`, `GoalsStrip`, `FallbackNotice`). `TycoonPlay.tsx` is re-ordered so the map comes first.
- **Save:** gains one optional field, `tour`. Older saves load without it.

**Tech stack:** TanStack Start, React 19, Vitest with Testing Library, and Playwright (`qa/`).

**Spec:** `docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md`, sections 3, 6, 7 and 8.

## Global constraints

- `tycoon/AGENTS.md` (Tycoon fairness rules) applies:
  - game coins only;
  - no forced waiting;
  - calm-down always works without coins, staff energy or a connected calm room;
  - time away never costs anything;
  - checkout pays only from a playroom or a boarding bed.
- Any change to prices, upkeep or experience points needs `src/tycoon/balance.test.ts` green and a ledger note.
- The noon to 2 PM lobby break, size-and-temperament groups and individual boarding beds stay exactly as they are.
- Old saves (no `tour`) load as before and never get the start card or the tour.
- No purchase prompts during the tour. The shop and "Get coins" buttons are hidden until free play; the hub Shop tab is unchanged.
- Dogs and customers are fictional (`NAMES` from `@/game/engine`). Scripted dogs are named Biscuit, Daisy and Rocket.
- Measurement uses the existing `tycoon_guide` event with properties `beat`, `sec`, `mode` and `controls`. No database change.

## Review focus

1. **Reloading mid-tour.** The tour resumes at the same beat and never duplicates a scripted dog. Test in Task 3.
2. **A player who doesn't follow the tour,** for example moving Biscuit to the calm room or checking him out from the lobby. The tour still progresses or recovers, with no dead end. Test in Task 3.
3. **Skipping the tour at any beat.** Arrivals and the clock return to normal, no reward is paid, and the shop buttons come back. Test in Task 3.
4. **No 3D and a narrow phone.** The explanation and map appear, nothing says "drag", and the coach is readable. Browser check in Task 12.
5. **A build-from-scratch player whose first playroom isn't small and gentle.** Biscuit matches whatever group they built. Test in Task 3.

---

### Task 1: The save field `tour`

**Files:**
- Modify `src/tycoon/types.ts` and `src/tycoon/state.ts` (`newTycoon`, `parseTycoon`).
- Test `src/tycoon/tour-save.test.ts`.

**Interfaces:** `Tour = { mode: "quick" | "scratch"; beat: TourBeat; startedAt: number; upgrade: "toy_bin" | "play_yard" | null; done: boolean; skipped: boolean }`, where:
- `TourBeat = "meet" | "checkin" | "place" | "play" | "checkout" | "upgrade" | "benefit" | "decision" | "goals"`;
- `TycoonState.tour?: Tour | null`;
- `newTycoon` sets `tour: null`. A null tour means "not started"; the start card decides.

**Steps:**
- [ ] Write the tests:
  - an old save (no field) parses to `tour: null`;
  - a valid tour round-trips through JSON and `parseTycoon`;
  - an invalid beat or mode becomes `null`.
- [ ] Run them and watch them fail. Implement. Run green. Commit "Tycoon: save field for the guided tour".

### Task 2: Quick start, built with the real build rules

**Files:**
- Create `src/tycoon/start.ts`.
- Move the guided-build layout from `testkit.ts` into `start.ts` (testkit re-exports it, so its tests are unchanged).
- Test `src/tycoon/start.test.ts`.

**Interfaces:**
- `quickStart(s: TycoonState): TResult` adds:
  - the guided-build layout;
  - a Play Mat in the playroom;
  - the PAWtastic sign and two flower beds outside.
- Everything is paid through the build functions.
- `isFreshSave(s): boolean` is true when there are no rooms, the guide is neither done nor skipped, checkouts are 0 and the tour is null.

**Steps:**
- [ ] Write the tests:
  - after `quickStart`, `canOpen(fac(s)).ok` is true;
  - the playroom group is `small-gentle`;
  - coins equal `START_COINS` minus the sum of `spent` on rooms and items;
  - `guideProgress(s).step` is 4;
  - `isFreshSave` is true for `newTycoon(0)` and false after `quickStart` and for `richState()`.
- [ ] Red, then implement, then green. Commit.

### Task 3: The tour (`src/tycoon/tour.ts`)

**Files:**
- Create `src/tycoon/tour.ts`.
- Modify `src/tycoon/run.ts` (`tick` holds random arrivals and the clock while the tour holds them; `playtime` reports the upgrade's share, see Task 5).
- Test `src/tycoon/tour.test.ts`.

**Interfaces:**
- `startTour(s, mode, now): TycoonState` sets `tour`. In quick mode it calls `quickStart` first, opens the daycare and drops off Biscuit.
- `tourHolds(s): boolean` is true while a tour is running and before the `goals` beat.
- `syncTour(s, now): { state; reached: TourBeat[] }` moves to the next beat when the state shows the current one done. It drops off the scripted dog a beat needs (once, by name), pays the guide reward once at `goals`, and returns the beats reached, for measurement.
- `firstDogGroup(f): GroupId` is the group of the first working playroom, else `small-gentle`.
- `chooseUpgrade(s, kind): TycoonState`.
- `skipTour(s): TycoonState` sets `skipped` and `guide.skipped`. Nothing is paid.

**Beat completion:**
- `meet` → a dog named Biscuit is in the lobby;
- `checkin` → Biscuit is checked in;
- `place` → Biscuit is in a playroom;
- `play` → Biscuit has `played ≥ 1`;
- `checkout` → `stats.checkouts ≥ 1`;
- `upgrade` → an item of the chosen kind exists;
- `benefit` → Daisy has gone home;
- `decision` → Rocket has gone home, or is in a large-active playroom.

If Biscuit goes home early (from the lobby or calm room), `place` and `play` count as done once checkouts reach 1 or Biscuit is gone. No dead end.

**Steps:**
- [ ] Write the tests, each red first:
  - the full quick run: drive the real actions and see each beat in order;
  - reload mid-way: JSON round-trip, then `syncTour` doesn't add a second Biscuit;
  - while held, `tick` for 600 seconds adds no random dog and doesn't move the clock;
  - skipping at `play` stops the hold, pays nothing, and sets `guide.skipped`;
  - a scratch player with a large-active playroom gets a Biscuit of size large and temperament active;
  - the reward is paid exactly once.
- [ ] Implement. Green. Commit.

### Task 4: Instructions that match the controls

**Files:**
- Create `src/tycoon/controls.ts`, holding the wording for each beat and each guide step, with the guide's text moved there.
- Test `src/tycoon/controls.test.ts`.

**Interfaces:**
- `type Controls = "3d" | "map" | "list"`.
- `beatText(beat, controls, ctx): { title: string; action: string }`.
- `guideText(step, controls): string`.

**Steps:**
- [ ] Write the tests:
  - no `map` or `list` text matches `/drag|draw/i`;
  - every beat has text for all three modes;
  - the 3D wording keeps "Drag out" for rooms.
- [ ] Red, implement, green. Commit.

### Task 5: Showing what an upgrade added

**Files:**
- Modify `src/tycoon/run.ts` (`playtime`) and `src/tycoon/effects.ts`.
- Test `src/tycoon/benefit.test.ts`.

**Interfaces:** `playGain(f, dog): { total: number; base: number; fromFun: number; topItem: string | null }`. `playtime`'s message, when `fromFun > 0`, ends with "(+N from your Toy Bin)" (the largest open contributor).

**Steps:**
- [ ] Write the tests:
  - with a Toy Bin, the message names it and the number equals `playBonus(fun)`;
  - without Fun items, no "from your" appears;
  - happiness changes are identical to before for the same state (balance unchanged).
- [ ] Red, implement, green. Run `balance.test.ts`. Commit.

### Task 6: Full placement cost

**Files:**
- Modify `src/tycoon/build.ts` (export `connectionEstimate`, built on `cheapestDoor`) and `src/components/tycoon/BuildToolbar.tsx` (the room preview line).
- Test `src/tycoon/connection.test.ts`.

**Interfaces:** `connectionEstimate(f, rect: {c,r,w,d}): { room: number; door: number; paths: number; total: number } | null`. `paths` is the number of new path squares × 10. Null means no route.

**Steps:**
- [ ] Write the tests:
  - a room next to the lobby has paths 0 and door 30;
  - a room 3 squares from the network costs paths of 3 × 10;
  - a room boxed in by other rooms returns null.
  - The toolbar test shows "Room 270 + door 30 + path 3 × 10 = 330".
- [ ] Red, implement, green. Commit.

### Task 7: Next goals

**Files:** create `src/tycoon/goals.ts`; test `src/tycoon/goals.test.ts`.

**Interfaces:** `nextGoals(s): { id: string; title: string; detail: string; progress?: [number, number] }[]` returns at most 3, chosen in this order:
1. the next building missing: Bath Room, then Boarding Room, then an outdoor play item;
2. the next land parcel, when its level is within 2 of the player's;
3. a profitable day, if none yet;
4. the next level's unlocks.

**Steps:**
- [ ] Write the tests: a fresh quick start gets bath, land and profit goals; `richState()` gets none of the building goals; never more than 3.
- [ ] Red, implement, green. Commit.

### Task 8: The 2D map and the fallback explanation

**Files:**
- Create `src/components/tycoon/TycoonMap.tsx` and `src/components/tycoon/FallbackNotice.tsx`.
- Test `src/components/tycoon/map.test.tsx`.

**Interfaces:**
- `TycoonMap({ state, selected, onPick })` is an SVG `viewBox` of the 36 × 28 lot:
  - rooms are `<g role="button" aria-label="Playroom · Small & Gentle, 1 of 3">`;
  - dogs are `role="button" aria-label="Biscuit, waiting to check in"`;
  - `onPick` uses the same `TPick` shape as the 3D world.
- `FallbackNotice({ reason: "no-webgl" | "failed" | "list", onRetry })`.

**Steps:**
- [ ] Write the tests:
  - rooms and dogs render with those labels;
  - clicking a dog calls `onPick({ kind: "dog", id })`;
  - the notice for `no-webgl` says "3D isn't available in this browser" and that progress is the same.
- [ ] Red, implement, green. Commit.

### Task 9: The world-first screen

**Files:**
- Modify `TycoonPlay.tsx` and `RunHud.tsx`.
- Create `StartCard.tsx`, `CoachBubble.tsx` and `GoalsStrip.tsx`.
- Test `src/components/tycoon/onboarding.test.tsx`.

**Order:**
1. the status bar (one row);
2. the stage: 3D, or the map plus the notice;
3. the coach bubble, overlaid on the stage;
4. the dog and edit panels, as a fixed bottom sheet;
5. the Goals strip, the weekly card and the money banner;
6. the list view.

The start card shows on a fresh save. The Daycare Shop and "Get coins" buttons are hidden while `tourHolds(s)`.

**Steps:**
- [ ] Write the tests:
  - a fresh save shows the start card with "Quick start" and "Build from scratch";
  - choosing Quick start shows the coach "Meet Biscuit";
  - while the tour holds, no "Daycare Shop" button;
  - an old save (rooms built, no tour) shows no start card;
  - with WebGL unavailable, the notice and the map render.
- [ ] Red, implement, green. Commit.

### Task 10: The home page card

**Files:** modify `src/routes/index.tsx`; test `src/components/game/home-new-daycare.test.tsx` (or extend the existing home test).

**Steps:**
- [ ] Write the test: the home page shows a card with the heading "New: build your own PAWtastic daycare" and a 44 px "Play the new Daycare" link to `/daycare-next`; today's Daycare stays.
- [ ] Red, implement, green. Commit.

### Task 11: Measurement

**Files:** modify `src/tycoon/store.ts`, where tour beats reached in `act` and the start send `tycoon_guide`; test `src/tycoon/tour-events.test.ts`.

**Steps:**
- [ ] Write the tests:
  - starting quick sends `{ beat: "start", mode: "quick", controls }`;
  - each beat reached sends once, with `sec`;
  - skipping sends `beat: "skipped"` with the beat it was skipped at;
  - opening the game on a later day sends `beat: "return"` with `days`.
- [ ] Red, implement, green. Commit.

### Task 12: Browser checks and the Stage A report

**Files:**
- Create `qa/e2e-onboarding.cjs`, for an iPhone 13 and a 1280 × 800 desktop.
- Modify `qa/e2e-tycoon.cjs` if it relied on the old screen order.

**Checks:**
- Quick start to the first payout, timing every beat (automation timings, labelled as such).
- Upgrade choice, then placement, then Daisy's message naming it.
- The Rocket decision, both branches.
- Goals visible.
- Build from scratch through the first checkout.
- Chromium with `--disable-webgl`: the notice, the map, no "drag" text, and the tour still completes.
- Reload mid-tour: same beat.

**Steps:**
- [ ] Write the checks. Run them against the dev server; they fail first, on the missing start card.
- [ ] Run them green. Run every other `qa/e2e-*.cjs`, `npx vitest run`, `npx tsc --noEmit -p .` and `npx vite build`.
- [ ] Commit. Write the Stage A report: what was built; tests with counts; automation timings versus the targets; what is not verified on real devices; the next stage.
