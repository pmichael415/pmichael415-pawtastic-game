# New Daycare (`/daycare-next`) — Stage A report: the first 15 minutes, the world first, the fallback

2 November 2026. Plan `docs/superpowers/plans/2026-11-02-tycoon-stage-a.md`, spec
`docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md` §3. Branch `claude/pawtastic-games-unified`
(GitHub `pmichael415/pmichael415-pawtastic-game`, folder `tycoon/`).

**Where this is:** committed and pushed to the branch, and tested in this session's dev server. It is **not** in the
Lovable hub project and **not** published: play.pawtasticacademy.com/daycare-next still runs the earlier preview.
Today's Daycare (`/daycare`), Recess Rush, Graduation Day, saves and purchases are unchanged.

## What a new player gets now

1. **Two ways to start.** A brand-new save shows "Start your daycare": **Quick start** builds a small working daycare
   with the normal build rules (Lobby with a Front Desk Counter, a Small & Gentle playroom, a Calm-Down Room, a play
   mat, a sign and flowers) and opens it. **Build from scratch** starts on the empty lot with the building steps.
   Saves from before the tour (rooms already built) get no start card and play as before.
2. **A guided tour, one action at a time** (`src/tycoon/tour.ts`). The coach names one thing to do next, in words
   that match the controls (3D: "Tap Biscuit in the daycare"; 2D map: "Tap Biscuit on the map"; list: "find Biscuit
   on the list"). The beats are:
   - **Meet Biscuit:** the first pup fits the first playroom.
   - **Care:** check in, the matching playroom, playtime, check out. The **first payout** comes at checkout.
   - **First upgrade:** a Toy Bin (80 coins, +6 happiness at every playtime in its room) or a Play Yard (200 coins,
     +4 for every pup). Both show their price and exact benefit before buying, and the choice is placed for you.
   - **See the benefit:** Daisy arrives, and her playtime says "(+N from your Toy Bin)".
   - **A real decision:** Rocket is Large & Active and can't share with Small & Gentle pups. You either build him a
     playroom (the price is shown; the guide then says to take him there) or let him rest in the calm room and go home
     free. **Safety is free either way.**
   - **Next goals:** the guide pays its 200-coin reward once, then drop-offs and the day clock start.
   - Nothing is timed. Random drop-offs and the clock wait until the tour ends. "Skip guide" works at any beat and
     pays nothing.
3. **Nothing interrupts the first minute.** Purchase prompts (Daycare Shop, Get coins) and the level-up
   celebration wait until the tour ends. The level and its coins are already earned; only the celebration waits.
   The hub's Shop tab is always there.
4. **The world first.** The screen goes: status bar, the coach directly above the daycare (never over it), then the
   3D view or map. When a tour starts, the page scrolls so the coach lands just below the status bar.
   - Dog, room and item panels open as a bottom sheet over the world.
   - Build is hidden during the tour, except while building from scratch.
   - The goals strip, the weekly card and the list sit below the world.
5. **When 3D can't load:** a one-line reason ("3D isn't available in this browser (WebGL is turned off or not
   supported)…" or "3D couldn't start on this device…"), a **Try 3D again** button and a **2D map**.
   - The map frames the daycare, with short room names and counts ("Lobby 1/4", "Small & Gentle 0/3") and pups as
     tappable markers.
   - Tapping on the map opens the same panels as 3D. No "drag" wording appears.
6. **Placement shows the full cost** while drawing a room: walls and floor, plus a door, plus the estimated path
   (e.g. "4 × 3 · Room 400 + door 30 + path ×4 = 40 → 470").
7. **Next goals** (up to three, worked out from the save): the next building (Bath Room, then Boarding Room, then an
   outdoor play area), the next lot and its price, a profitable day, and the next level and what it unlocks.
8. **Home page:** a full card, "New: build your own PAWtastic daycare". It is labelled Preview, says the current
   Daycare stays as it is, and has a "Play the new Daycare" button. Today's Daycare keeps its own card.
9. **Measurement** (no database change):
   - `tycoon_guide` events for: the start (mode and controls), each beat reached (seconds since the start), a skip
     (and the beat it was skipped at), and a return on a later New York day (days away and how far the tour got).
   - Stage A's events carry their own build label, `2026-11-02.tycoon-stage-a`.
   - Ready-made read-only queries are in `tycoon/docs/tycoon-tour-measurement.sql`: starts by mode, the funnel,
     time to first payout and first upgrade, skips, drop-off and return visits.

## Tests run (this session)

| Check | Result |
|---|---|
| Unit tests (`npx vitest run`) | RESULT_VITEST |
| Typecheck (`npx tsc --noEmit -p .`) | RESULT_TSC |
| Production build (`npx vite build`) | RESULT_BUILD |
| New: `qa/e2e-onboarding.cjs` — iPhone 13 and 1280 × 800 desktop; 3D and Chromium with WebGL disabled; both decision branches; Build from scratch to the first payout; reload mid-tour | RESULT_ONBOARDING |
| Existing browser suites | RESULT_SUITES |

The onboarding checks found five phone problems, and each was fixed test-first:
1. The level-up overlay covered Biscuit right after Quick start.
2. A coach drawn over the 3D view hid the pups on a phone.
3. The sticky status bar covered the coach after scrolling.
4. On the 2D map, the daycare sat off-screen at the bottom of the whole lot, and room labels ran into each other.
5. After building Rocket's room, the coach still offered to build one.

## Timings: automation, not players

These times are from a script tapping as fast as the page allows. They show that nothing forces a wait, but they
are **not** how long a person takes. Milliseconds from tapping Quick start (or Build from scratch):

TIMINGS_TABLE

The targets ("meet a dog by 1 minute, first payout by 2, first upgrade by 5, a decision by 10, a next goal by 15")
are about people, and only real play data can show them. The queries in `tycoon/docs/tycoon-tour-measurement.sql`
measure exactly these once Stage A has players.

## Observed player data (live game database, read-only)

Up to 2 Nov, before Stage A, every event carried the old build label `2026-10-31.games-hub-1`:
- 18 devices started a session and 16 opened the hub.
- In the new Daycare, 2 devices built something, 1 opened its daycare and 1 sent 2 guide steps.

These are tiny numbers, very likely the owner's and testers' own devices, so they say nothing about players yet.
There is **no Stage A player data**, because Stage A isn't published.

## Not verified

- **Real phones and tablets.** All checks ran in Playwright's Chromium with iPhone 13 and Pixel 7 profiles (touch,
  viewport and user agent) and a 1280 × 800 desktop. Real iOS Safari, Android Chrome, a slow phone, a notch, the
  on-screen keyboard and long sessions are untested.
- **Real 3D hardware.** WebGL ran on Chromium's software renderer. "3D couldn't start" (as opposed to "WebGL off")
  was only exercised in unit tests.
- **The published site.** This session can't reach lovable.app or play.pawtasticacademy.com.
- **How people actually play:** comprehension, enjoyment, time per beat and whether they return. That needs
  published play data or watching people play.

## Spec items done differently (rulings, each in the ledger)

- **Coach position.** The coach sits **directly above** the daycare, not pinned over the bottom of the map: on a
  phone, the overlay hid the pups.
- **Status bar.** It stays in two rows (coins and level, then day, time and Open). Build stays as its own button,
  hidden during the tour. A one-row bar is left for a later pass.
- **Build from scratch** was checked end to end with the map and list controls ("Place in first free spot"). 3D
  drag-building is covered by the older `qa/e2e-tycoon.cjs`.
- **Old guide events.** The older building checklist's step events are not sent while a tour runs, since that
  checklist is hidden.

## Next

- **Stage B:** activities (agility, splash, rest, the bath queue, boarding suites), dog preferences (water-loving,
  energetic, shy, older) and staff roles (reception, playroom supervision, bath, cleaning), with workload and
  bottleneck feedback. This keeps size and temperament grouping, individual boarding beds and the noon–2 PM lobby
  closure.
- **To put Stage A in front of players:** copy the code into the Lovable hub project and publish. That's the owner's
  release decision, together with the held purchases release (migration 0009).
