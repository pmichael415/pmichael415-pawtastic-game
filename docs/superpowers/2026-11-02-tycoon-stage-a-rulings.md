# New Daycare, Stage A — decisions made during the build

From the build ledger of `docs/superpowers/plans/2026-11-02-tycoon-stage-a.md` (2 Nov 2026). Each ruling is a call made where the plan and spec didn't settle something, with what it costs if it was wrong. Deferred minors are small review findings left for later, on purpose. Report: `docs/superpowers/2026-11-02-tycoon-stage-a-report.md`.

## Rulings (23)

- Task 2: Ruling: Quick start reuses the tested guided layout (3 × 3 playroom, not the spec's 4 × 3) plus a Play Mat, sign and two flower beds; the layout moved from testkit into start.ts (testkit re-exports it) — cost if wrong: a slightly smaller first playroom (3 dog spots).
- Task 3: Ruling: the tour also holds care decay (not only arrivals and the clock) — staff energy still recovers — so a slow reader isn't punished by falling happiness — cost if wrong: one line in tick.
- Task 3: Ruling: if every group already has a playroom (possible for a scratch builder), there is no decision pup and the decision beat completes at once — cost if wrong: that player skips one lesson.
- Task 4: Ruling: GUIDE_STEPS titles stay in guide.ts; the step details for each control mode live in controls.ts (guideText), used by the checklist in Task 9 — cost if wrong: none.
- Task 5: Ruling: BALANCE CHANGE (ledger note per AGENTS.md) — at current numbers a Toy Bin (Fun 2) or Play Yard (Fun 4) added nothing visible (playBonus = floor(total Fun / 6)), so the tour's "see the benefit" beat would show nothing. Added a local rule: +3 happiness per Fun point of furniture in the pup's own working room (cap +12) and outdoor play areas' Fun (cap +8) at each playtime; the old global playBonus stays. Happiness is capped at 100, so pay rises little; balance.test 6/6 green (profits ≥ 0, L3 ≤ 4.5 days, L5 ≤ 7.5 days, coins ≥ 0) — cost if wrong: slightly faster early income; Stage B replaces this with activities.
- Task 6: Ruling: the toolbar change is covered by the existing build-ui test (label now 'Room 400 + door 30 + path N × 10 = total'), not a separate toolbar test; the not-enough-coins check now uses the full total — cost if wrong: none.
- Task 9: Ruling: tourActions helpers (buildPlayroomFor, playroomCost, restAtHome) were written together with their unit test rather than red-first; the screen tests that drive them (onboarding.test.tsx) were red first — cost if wrong: a helper edge case not covered by a failing-first test.
- Task 9: Ruling: the dog/room panels became a fixed bottom sheet over the map (data-testid panel-sheet) instead of a block below the stage — the brief asks for contextual panels without leaving the world — cost if wrong: the sheet can cover part of the map on short phones (max-height min(48svh,440px)).
- Task 9: Ruling: the coach bubble is overlaid on the stage/map (absolute, bottom) in 3D and map modes, inline in list mode — cost if wrong: it may cover dogs at the bottom of the map; T12 checks this on iPhone 13.
- Task 9: Ruling: controls.ts place-beat wording changed from "Move to" to “To <group>” to match the dog panel's button label — cost if wrong: none beyond copy.
- Task 10: Ruling: the card is labelled Preview and says the current Daycare stays as it is — /daycare-next is not yet the main entry — cost if wrong: one line of copy to drop at the switch.
- Task 11: Ruling: tour events are sent from the store's commit (any change, not only act), by comparing the tour before and after — beats reached inside startTour (checkin) and several beats passed in one change are all reported once, in order — cost if wrong: none; one event per beat.
- Task 11: Ruling: the old building checklist's tycoon_guide {step} events are suppressed while a tour exists, because that checklist is hidden — cost if wrong: step-based dashboards see fewer events from new players (they get beat events instead).
- Task 11: Ruling: "return" is sent on opening a stored save on a later New York calendar day, with days and the tour state (none/done/skipped/<beat>); a same-day reopen sends nothing — cost if wrong: return counts are per opening on a new day, not per session.
- Task 11: Ruling: the controls reach the store through setTourControls(c) set by TycoonPlay (default "3d") — cost if wrong: events sent before the screen mounts say 3d.
- Task 12: Ruling: the browser checks found 5 phone problems; each was fixed test-first inside Task 12 rather than as a new task — level-up overlay held during the tour (it covered Biscuit); coach moved from an overlay to just above the stage and scrolled into view below the sticky status bar (the overlay hid pups on a phone); Build hidden during the tour except the scratch building beat; decision coach switches to "Rocket's room is ready" after building; 2D map frames the built daycare (land when no rooms) with short labels drawn above things — cost if wrong: the spec's "coach pinned to the world" becomes "coach directly above the world".
- Task 12: Ruling: Build from scratch is checked end to end with the map/list controls (Place in first free spot); 3D drag-building stays covered by qa/e2e-tycoon.cjs's guided start — cost if wrong: a 3D-only scratch regression is caught by e2e-tycoon rather than e2e-onboarding.
- Task 12: Ruling: analytics BUILD_ID changed from 2026-10-31.games-hub-1 to 2026-11-02.tycoon-stage-a, so Stage A players' events can be separated from the earlier preview's — cost if wrong: none; older rows keep their label.
- Final: Ruling: re-graded 5 Minors to Important by effect on players — benefit message credited +9 to a Toy Bin whose card promised +6 (explaining benefits is the brief's point); return events said "3d" before the screen knew (wrong measurement data); an empty bottom panel stayed after every checkout; map pup markers ~26 px (under the 44 px target); map/list step text said "Tap Build" where there is no Build button — cost if wrong: five small extra fixes.
- Final: Ruling: build-ui.test.tsx's empty-lot fixture now carries a skipped scratch tour (free building), because a brand-new save rightly shows only the start card; e2e-tycoon picks Build from scratch, checks the step line, and skips the guide for its free-play checks instead of claiming the old checklist's +200 — cost if wrong: the old checklist reward path is now exercised only for pre-tour saves that already have rooms.
- Final: Ruling: reviewer partly disagreed with T5 (Water Bowl now adds +3 at every playtime for all saves). It stands — balance.test.ts is green and the effect is small — but it goes to the owner in the report as a balance change — cost if wrong: one constant.
- Final: Ruling: reviewer's "Declined to judge" — sec counts wall-clock time including time away: stands (it is the time a person took from start, the thing the 15-minute targets are about) — cost if wrong: long gaps inflate medians; the funnel query reports medians and p90, not means.
- Final: Ruling: "Declined" — two tabs running the tour, a scratch player out of coins before opening, selling the lobby mid-tour: unchanged behaviour from before this branch, no dead end — cost if wrong: rare edge cases.

## Review fixes

- Final: fixed upgrade beat could freeze a short-of-coins player — review-fixes.test.tsx "short of coins at the upgrade, 'Not now' carries on" RED→GREEN; tour-events.test.ts "'Not now' … reports upgrade_passed" RED→GREEN, suite 690/690.
- Final: fixed paid "Get it" rows in the 3D build catalog during the tour — review-fixes.test.tsx "the building step stays on screen in build mode, and the catalog offers nothing paid" RED→GREEN, suite 690/690.
- Final: fixed fresh save showed start card beside the old checklist, Shop, Get coins and Build — review-fixes.test.tsx "only the start card…" RED→GREEN, suite 690/690.
- Final: fixed scratch building in 3D hid the building step — review-fixes.test.tsx (same test as the catalog) RED→GREEN; e2e-tycoon "the building step stays on screen while building" PASS, suite 690/690.
- Final: fixed "Let Rocket rest (free)" counted a check-in (supplies) — tourActions.test.ts "an unchecked pup goes home without counting a check-in" RED→GREEN, suite 690/690.
- Final: fixed benefit message credit — benefit.test.ts expects "(+6 from your Toy Bin)" RED→GREEN, suite 690/690.
- Final: fixed return events' controls guess — tour-events.test.ts "return … the event doesn't guess" RED→GREEN, suite 690/690.
- Final: fixed empty panel after a pup leaves — review-fixes.test.tsx "the panel closes when its pup goes home" RED→GREEN, suite 690/690.
- Final: fixed small map tap targets — review-fixes.test.tsx "invisible hit area at least 0.9 squares" RED→GREEN, suite 690/690.
- Final: fixed map/list "Tap Build" wording and "you can move it later" outside 3D — controls.test.ts "map and list building steps point at the Build list's Place buttons…" RED→GREEN, suite 690/690.

## Deferred minors

- Final: minor (deferred): parseTour accepts beat "goals" with done false (a hand-edited save holds until Skip); a missing startedAt gives a huge sec.
- Final: minor (deferred): quick start on an old save with outdoor items but no rooms can fail or not open, without a message.
- Final: minor (deferred): upgrade buttons' aria-label hides the benefit from screen readers; the coach isn't a live region.
- Final: minor (deferred): playroomCost simulates a build on every render; TycoonMap computes caps twice per room.
- Final: minor (deferred): the goals beat text is never shown; "Skip guide" is one tap with no undo; the home card says "Start from an empty lot" though Quick start exists; buildPlayroomFor can leave a room with no bed when coins cover only the room (Rest stays available).
