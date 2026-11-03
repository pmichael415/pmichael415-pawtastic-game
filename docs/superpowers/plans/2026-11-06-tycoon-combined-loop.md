# Daycare Tycoon — the first complete combined loop: design and plan

Owner brief of 6 Nov ("Quality target"). Ambition: an experience as enjoyable, well presented and rewarding to
progress through as the best management games on phones (the owner names Last Asylum as the bar). It is a quality bar
only: nothing of that game's content, layout, art or mechanics is copied — every system here is PAWtastic's own,
built on what the daycare already has. Private preview only; standing rules unchanged (game coins only, free core
play, no forced waiting, no Stripe/purchases/DNS/app/other games changes, PAWtastic branding).

## The loop to finish

**Care personally → earn → hire and delegate → choose how to grow → see the daycare change → new kinds of families
and moments → care personally again.** Most parts exist (care, complaints, billing, staff, expansion, objectives). The
gaps that keep it from feeling like one living game:

| Owner priority | Gap today | This milestone |
|---|---|---|
| 1 Living daycare | Families only appear at pickup; you read tags to know what a pup is doing; pups stand still | Families walk in at drop-off and wait at the desk until checked in, then wave and leave; a small activity bubble over every pup (🎾 playing, 🫧 bath, 💤 resting, ⏳ waiting, ❗ needs you, ✨ a moment for you); pups wander and use their room, energetic pups move more, gentle ones lie down |
| 2 Growth you can see | Two expansion paths | Five ways to grow, each a real room built by the build rules: **Playroom wing** (capacity), **Bath station** (service), **Boarding wing** (overnight guests), **Play yard** (comfort: happier pups, better tips), **Staff room** (team: faster recovery). Facility stages (Starter → Growing → Full-service → Campus) celebrated when reached |
| 3 Freedom to build | Expansions place themselves | Pick where it goes: up to three candidate spots, previewed in the 3D view before you pay; manual build mode stays for full freedom |
| 4 Hands-on at scale | With staff hired, little is left that only you can do | **Personal moments**: a pup asks for you (fetch, tug, zoomies, a cuddle, a splash — its favourite). Tap it, give it your attention: hearts, a happier pup, XP and a "they told me about it" tip at pickup. Staff never take these. Missing one costs nothing |
| 5 Dogs with personality | Traits exist but barely show | Favourite and trait in the pup's panel and moments; movement by temperament; a moment speaks in the pup's voice |
| 6 A compelling next goal | Objectives exist | The plan shows what each option enables; the goal ladder follows facility stages; the next stage's requirement is always visible |
| 7 Polish | — | Sounds and feedback for moments, stages and placement; phone layout; performance re-measured with `qa/perf.cjs` |

## Rules for new systems
- Personal moments: at most one per pup at a time and at most 3 open at once; they appear only while the daycare is
  open and the pup is settled (room or bed), never during the guided tour; each lasts 60 game minutes then fades with
  no penalty. Answering: +15 happiness (not above 100), +5 XP, and the family adds a tip of 5 game coins at pickup
  (once per visit, on the receipt as "Tip — <name> told them about <activity>"). Billing stays exactly-once.
- Facility stages are worked out from the layout (pure function), never stored, so they can't drift.
- Expansions use only the existing build functions; prices are the coins spent on building (dry run); the chosen spot
  must be one of the offered candidates.

## Proving it through play
`qa/play-session.cjs`: Claude plays a fresh daycare in the browser like a player (iPhone 13 emulation) for a real-time
session: the guided start, personal care, moments, the first hire, the first and second expansions with chosen spots,
a full day, then a grown daycare. Screenshots at each beat and a short video go in `qa/out/`; Claude looks at every
screenshot and writes down what reads well and what doesn't, then fixes what the play reveals. This is AI play in an
emulator — labelled as such; human play and a real iPhone remain pending.

## Tasks
1. Personal moments — engine (`moments.ts`), tick, checkout tip line, tests.
2. Personal moments — UI (pup panel button, toast, objective hint) and 3D bubble + hearts; sound.
3. Living world — drop-off families, activity bubbles, wandering by temperament (renderer only; rules untouched).
4. Ways to grow — boarding wing, play yard, staff room in `expansion.ts`; candidate spots + 3D ghost preview; tests.
5. Facility stages — pure `stages.ts`, celebration, goal ladder; tests.
6. Play session — script, screenshots, video, Claude's play notes; fixes from what play shows.
7. Verification — full suite, browser suites, perf, preview republish, report, independent review and fix pass.
