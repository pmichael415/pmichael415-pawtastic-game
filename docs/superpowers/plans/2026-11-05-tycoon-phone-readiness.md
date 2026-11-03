# Daycare Tycoon — phone readiness and first-session polish: plan

Owner brief of 5 Nov (7 parts). Builds on `bff981b`. Private preview only; no publishing, no Stripe/purchases/DNS/
app.pawtasticacademy.com/other games. Tasks run in order; each ends with tests and a ledger line
(`.superpowers/sdd/2026-11-05-tycoon-phone/progress.md`).

| # | Task | Evidence |
|---|---|---|
| 1 | Measure first: `qa/perf.cjs` runs a normal day and the busy scene (30 pups, 6 staff) in fresh browser contexts (never a player's save), records environment, frame times (avg, p95, slow frames), render vs simulation vs interface time, and a CPU profile of hot functions | before-numbers in the ledger |
| 2 | Engine fixes: time jumps run as normal 1-second steps; unique staff names; staff baths obey the price refusal; unserved arrivals at closing get a courtesy reschedule once; no module-level hidden state (job carries the pup's name; the expansion quote memo is explicit and covered by tests) | unit tests RED→GREEN |
| 3 | The introductory day: on the first day the daycare opens, a family that reaches the departure limit is rescheduled with no upset outcome, fine or reputation loss, and a short "next time" tip; saved in the facility so reloads agree; time shown as game time with the next useful action | unit + UI tests |
| 4 | Suspend safely: no simulation while hidden, locked, or a blocking dialog is up; no catch-up on return | unit + browser tests |
| 5 | Performance: fix only measured bottlenecks; a graphics quality setting (auto / light) that keeps pups, staff, rooms and alerts readable; rules identical across settings | after-numbers, rules-equivalence test |
| 6 | Private diagnostics and test saves: a diagnostic overlay and test scenarios (separate save key) reachable only from the review build's settings or dev | UI test + browser check |
| 7 | Phone checks (Chromium emulation, labeled): portrait/landscape, camera drag doesn't act, selection, panels, the full visit with a complaint, hiring/let go/rehire, both expansions (card closes and shows the upgrade), waiting warnings, intro day, departure, overnight, reload, background/resume, old saves, rapid taps, second tab; a 15-minute busy soak | `qa/e2e-phone.cjs` |
| 8 | Hands-off scenarios re-run; report with Phil's walkthrough and the three playtest questions; preview republished; independent review and fix pass | report |
