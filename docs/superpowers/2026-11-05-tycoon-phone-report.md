# New Daycare (`/daycare-next`) — phone readiness and first-session polish: report

Owner brief of 5 Nov. Plan: `docs/superpowers/plans/2026-11-05-tycoon-phone-readiness.md`. Branch
`claude/pawtastic-games-unified`, folder `tycoon/`, starting from `bff981b` (889 tests passing, confirmed before work
began).

**Status: Ready for Phil's iPhone test — not ready for release.** Everything below ran in this session's Chromium
(headless, software graphics, iPhone 13 and desktop *emulation*). No real iPhone, no Safari, no graphics hardware and
no human playtest took place. Nothing was published; Stripe, purchases, DNS, app.pawtasticacademy.com and the other
games are untouched (one test script for Recess Rush's audio was pinned to a fixed course — see below).

## What changed, and why

### Measure first (new tools, private)
- `qa/perf.cjs`
  - Builds the private review build (production code) and serves it with the preview's security rules.
  - Runs each scenario in a fresh browser profile, so it never touches a player's save.
  - Records:
    - frame intervals: average, p50/p95/p99, frames over 50 and 100 ms, the longest frame;
    - 3D update + draw time, simulation time per tick, and screen render time;
    - a CPU profile of the busy scene.
- **Test saves** (Test tools → "Start test: A normal day" / "The busy scene"):
  - built from the real rules;
  - stored under their own key, so the player's daycare is never changed;
  - shown with a banner and "Back to my daycare".
- **Diagnostics overlay** (Test tools → Diagnostics):
  - shows fps, frame percentiles, slow frames, 3D/simulation/screen times, pups, staff, draw calls, resolution and the
    GPU name;
  - **Copy** puts the numbers on the clipboard so a phone tester can paste them back;
  - GPU time is labeled unavailable, because browsers don't expose it.
- Test tools exist only in the private preview and the dev server, never in the public hub build.

### Performance: two measured fixes, no rule changes
1. **Each pup was 20 separate draws; each person 15.**
   - The busy scene drew 751 things per frame, 600 of them pup parts.
   - Each pup's and person's still parts are now merged into one piece that carries its colors.
   - The moving parts stay separate, so every animation looks the same: a pup's body bob, tail and bandana; people's
     arms and legs.
   - The busy scene now draws 241.
2. **"Battery saver graphics" switched on antialiasing.**
   - This existing setting, on by default for phones, drew at 1x with antialiasing, which cost more than 1.5x without
     it.
   - Battery saver now also turns antialiasing off.

### A fair first day
- **The introductory day** is the first day the daycare opens. It's saved, so reloads agree.
  - A family that waits to the limit is kindly rescheduled: no upset visit, no fine, no reputation loss.
  - A notice says what to do next time.
  - After that day, the 60-game-minute rule applies.
- **Waiting labels:** times say "game min" and name the next action ("Next: Check in, or Can't take today").
- **Rules unchanged:**
  - the receptionist's free reschedule at 40 minutes;
  - pickup complaints;
  - turning a family away stays free;
  - a checked-in pup never disappears on an arrival timer.
- **Phil** still only helps when you tap.

### Suspending safely
- **In the background (hidden or locked):** time stops and the game saves. Coming back shows "Paused — game time stops
  while you're away" with **Resume**, and nothing catches up. This was already the rule; the notice is new.
- **While a level-up or the day's report covers the screen,** time stops.

### The six small review items
1. **Names:** staff names stay unique after Let go and rehiring. People are identified by ids, never names.
2. **Bath price:** staff baths obey the same price check as the Bath button, and stop for a scuffle. The player
   decides.
3. **Time jumps:** a big time jump now runs as one-second steps, exactly like play. A test shows one 45-second jump
   equals 45 one-second steps across closing time.
4. **Families still at the desk at closing,** including late boarders, are kindly rescheduled once. No visit is judged
   and there's no charge.
5. **The expansion card** closes after a purchase and shows the new or improved room. A refused purchase keeps the card
   open with the reason.
6. **Hidden state:**
   - The job now records the pup's name, replacing a module-level name map.
   - The expansion price memo is documented and clearable.
   - A test shows two games with the same layout get the same answer, and a changed layout never reuses a stale one.

### Found by the new phone checks, and fixed
- **Notice:** the "rescheduled" notice was swallowed the first time it happened.
- **Double tap on Hire:** a quick double tap could hire two people. It's now guarded.
- **Paused state:** there was no visible paused state after returning from the background.

## Performance — before and after (exact environment)

- **Environment:** Chromium 153 (headless, Playwright) with SwiftShader **software** rendering in a cloud container, no
  GPU.
- **Screens:** iPhone 13 emulation (390×844, the 3D view at 364×412) and desktop 1280×800.
- **Build:** the private review build.
- **Method:** 10-second samples after a 4-second warm-up.
- **These are not phone numbers.**

| Scenario | Screen, graphics | Before (`45ae5b5`) | After (final) |
|---|---|---|---|
| Normal day | iPhone size, battery saver (phone default) | 38.2 fps · p95 50 ms · 11/400 frames over 50 ms | **60.0 fps · p95 16.7 ms · 0/600 over 50 ms** |
| Normal day | iPhone size, standard | 43.9 fps · p95 33 ms | 43.3 fps · p95 33.5 ms |
| Normal day | desktop, standard | 28.3 fps | 29.2 fps |
| Busy (30 pups, 6 staff) | iPhone size, battery saver | 16.8 fps · p95 133 ms · 91/175 over 50 ms · 751 draw calls | **34.3 fps · p95 50 ms · 17/365 over 50 ms · 241 draw calls** |
| Busy | iPhone size, standard | 25.4 fps · p95 67 ms | 26.8 fps · p95 67 ms |
| Busy | desktop, standard | 14.2 fps · p95 133 ms | 14.3 fps · p95 133 ms |

- **Where the time goes** (main thread, after):
  - 3D update + draw: 1–2.4 ms a frame;
  - simulation: 0.5–1 ms a tick;
  - screen render: 4–8 ms, about 4 times a second.
- **Bottleneck:** the CPU profile shows the main thread idle most of the time. The remaining cost is software rasterizing
  pixels, which a phone's GPU does instead.
- **Desktop:** desktop "standard" draws at 1x with antialiasing, which is slow only in software rendering.
- **The 30 fps target on a physical iPhone is not verified.**

**15-minute continuous session** (`qa/soak.cjs`, busy scene, iPhone size, battery saver, same software environment):
SOAK_RESULT

## Checks completed

| Check | Result |
|---|---|
| Unit and UI tests | **TESTS_RESULT** (was 889; new tests for the six items, the introductory day, test saves, rules across step sizes, the paused clock, the card) |
| Typecheck | clean |
| `qa/e2e-phone.cjs` (new). Portrait and landscape: layouts, camera drag vs taps, pup and staff panels, scrolling sheets, hire / let go / rehire, a double tap on Hire, both expansions, waiting warnings, the introductory day, a normal departure, closing time, background and resume, reload, an old save | **38 / 38** |
| `qa/e2e-service.cjs`: the full visit (a booked bath, the owner arriving before it's done, a complaint answered, checkout, receipt), a double-tapped checkout, reload, the second-tab protection | **46 / 46** |
| `qa/e2e-staff.cjs`: hire → staff work → booked bath → checkout → wages → expansion → reload, plus the busy scene | **58 / 58** |
| Onboarding · Tycoon · hub · games · today's Daycare · audio | 100/100 · 37/37 · 37/37 · 35/35 · 36/36 · 17/17 |
| Hands-off economics (seeded week, no taps) | unchanged from last milestone, day by day: playroom wing +123 to +309 a day; bath station +31 to +72; every family delighted |

**Intentional expectation changes:**
- The audio check now plays a fixed Recess Rush course (`?seed=2026-11-02`). Recess Rush's daily course is seeded by
  the date, and today's course made the unsteered test run end in seconds. On the fixed course it passes 17/17, and
  the game itself is unchanged.
- The staff scenario's check-in timing allows for one tick of granularity.
- One hub check failed once ("/shop has a visible way back") and passed on the rerun.
- No coverage was removed.

## Not checked (pending)

- **A real iPhone in Safari:** pending Phil's test. This session has no device and no WebKit browser.
- **Physical-device frame rate and slowdown over time:** pending. The emulated soak above is not a substitute.
- **Human playtesting:** pending, including whether beginners understand the first session.

## Remaining defects and release blockers

- **Release blocker:** Phil's iPhone test (below) and his release decision.
- **Known limits:**
  - per-room cleanliness isn't shown on the map;
  - staff don't carry pups to the tub (the pup appears there when the bath starts);
  - standard graphics at 1.5x is heavier than battery saver;
  - desktop 1x standard uses antialiasing (fine on real graphics hardware).

## Phil's iPhone test (about 15 minutes)

Open the private preview on the iPhone in Safari, tap **Daycare (preview)**, scroll to the bottom and open **Test tools
(private preview)**.

1. **Measure first:**
   - Turn **Diagnostics on**.
   - Tap **Start test: The busy scene**. This is a separate save; your own daycare isn't changed.
   - Let it run for 2 minutes.
   - Tap **Copy** on the dark diagnostics box and paste the result to Claude.
   - Note the iPhone model and iOS version.
2. **Play it for 10 minutes:**
   - Drag to move the camera and pinch to zoom.
   - Tap a pup, then a staff member.
   - Open **Team**, hire someone and let them go.
   - Watch the staff work.
   - Turn the phone sideways once.
3. **Lock and come back:** lock the phone for 30 seconds and unlock it. You should see **Paused** with **Resume**, and
   nothing should have happened while you were away.
4. **First day:** tap **Back to my daycare**, or start fresh, and play your first day.
   - Let a family wait at the desk until the warnings appear. They should say "game min" and what to do next.
5. **Copy the diagnostics again** at the end of the session.

**Three things to note for the playtest:**
1. Was the next useful action clear?
2. Was there enough meaningful work for you after hiring staff?
3. Did the bath expansion offer an understandable reason to choose it?

## Decisions made for you
- Battery saver now also turns antialiasing off. If edges look too jagged, switch it off in the gear menu.
- Families still at the desk at closing are rescheduled rather than judged.
- The introductory day covers drop-off waits only; pickup waits keep their complaint.
- Dialogs pause the clock through the screen, not the rules, so tests and balance are unchanged.
- The test tools appear in the private preview only.
