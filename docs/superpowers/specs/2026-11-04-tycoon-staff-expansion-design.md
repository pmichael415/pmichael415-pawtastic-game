# Daycare Tycoon — staff who do real work, a living campus, the first expansion: design and plan

4 November 2026 (game-dev calendar). Owner brief of 4 Nov (7 parts). Builds on the audited service loop
(`2026-11-03-tycoon-service-design.md`, commits `09f3016`, `a1f7b18`). Folder `tycoon/`, branch
`claude/pawtastic-games-unified`. Private preview only; Stripe, purchases, DNS, app.pawtasticacademy.com and the
other games are untouched.

**Success test (owner's words):** "I can hire someone, watch them handle real work, earn a profit and expand into a
visibly busier daycare."

## 1. Principles

- **One simulation.** Staff work is engine state (`src/tycoon/team.ts`), advanced by `tick`. The 3D world only
  draws it. A hidden tab, a 3D failure or reduced motion never changes what happens.
- **Staff reuse the player's actions.** Check-in, placement, play, baths, checkout and mopping already exist and
  are audited. Staff call the same effects, so billing stays exactly-once and the rules stay identical.
- **Staff never take consequential decisions.** They don't place a pup in a mismatched room, answer a complaint,
  sell an exit bath, turn a family away, separate a scuffle or set prices. Those stay with the player, who is told
  when something needs them.
- **Every manual action still works.** Roles only add automatic work. When the player acts on a pup a staff member
  was heading for, that job is cancelled cleanly.

## 2. Staff

**Roles:** `reception`, `attendant`, `bath`, `cleaner`. Phil, the founding partner, has no role: he helps when you
tap (the shared energy pool, as today). Hired staff take a role at hire and can change it any time.

| Role | Takes jobs | Work time (game min) | Focus choices (priority) |
|---|---|---|---|
| Receptionist | check in a waiting family **only if** a compatible playroom spot (same size-and-temperament group, under capacity) or a free boarding bed exists, then settle the pup there; send home a family at pickup **only if** there is no complaint | 4 per family | Pickups first · Arrivals first |
| Daycare attendant | play with a pup in their assigned playrooms (all, if none chosen) who hasn't played yet or is under 70% happy; never in a scuffle or the calm room; their presence halves scuffle risk in those rooms | 10 | Neediest pup first · Newest arrivals first |
| Bath attendant | the **booked** bath queue only (pups whose family booked a bath), one pup per free tub; stays at the tub for the full 40-minute bath | 40 (the bath itself) | Soonest pickup first · In booking order |
| Cleaner | mops the dirtiest of their assigned rooms (all, if none chosen) under 80% clean | 12 per room | Dirtiest first · Busiest first |

- **Walking:** 1 tile per game minute (Manhattan distance from where they last worked), at least 1 minute. A job
  has a `walk` phase and a `work` phase; nothing finishes instantly.
- **Claims:** a pup, a tub or a room can be the target of one job at a time. Two staff never take the same job.
- **Cancelled jobs:** each tick re-checks every job (pup still here and still eligible, room still working, tub
  still free). If not, the job is dropped and the staff member is free, with a note ("Biscuit went home").
- **Energy:** a job costs its worker energy (desk 4, play 10, bath 15, mop 10). Below that they take a break until
  40 ("On a break"). Recovery follows wages and the Staff Room, as today.
- **Hours:** new jobs only while the daycare is open and the guided tour isn't holding. A job in progress finishes
  (a bath already running always finishes).
- **Hiring:** a sign-on fee (250 × current team size, as today) and the daily wage (lean 30, standard 40,
  generous 60; already charged at 18:00). **Let go:** any hired staff member (not Phil); wages stop at the next
  close. Up to 6 people.
- **Statuses** (shown in the Team sheet, the staff panel and over their heads in 3D): "Walking to the front desk",
  "Checking in Luna", "Sending Luna home", "Walking to Playroom 2", "Playing with Luna", "Walking to bath station
  1", "Bathing Luna — 12 min left", "Cleaning Playroom 2", "Available", "On a break", "Off duty — closed", plus a
  "needs you" note when they skipped a job only the player can decide.

## 3. Rooms, tubs, cleanliness

- **Bath stations:** every working tub is a station (`caps(f).tubs`). A bath needs a free tub, records it on the pup
  (`bathTub`) and holds it for exactly `BATH_MIN` (40). The manual Bath button follows the same rule ("Both tubs are
  busy — Luna is next"). The **bath queue** is the booked baths not yet started.
- **Cleanliness per room:** `roomClean[uid]`. A room gets dirtier with the pups in it (the same 0.08/s per pup as
  the old daycare-wide value), and a pup's happiness drops faster in a dirty room. The daycare's cleanliness shown
  in the status bar is the average weighted by (pups in room + 1). A family's "dirty" complaint now names their
  pup's room. The Mop button still mops every room (+35).

## 4. Waiting families (fair warnings, no surprise penalties)

- **At drop-off:** waiting under 20 minutes; "getting impatient" from 20; "upset" from 40 with a warning that they
  will leave; at 60 they take their pup home. That visit is recorded as upset (a wait complaint), with no charge.
- **At pickup:** waiting; impatient from 30 (a complaint, as today); a warning at 45; they leave at 60, as today.
- A refusal ("Can't take today") and a calm-room safety move stay free. A booking that never arrives can't happen
  in this game (families exist only once they walk in), so it can never count against the player.
- Chips on the pup's tag, map and panel; toasts at each stage.

## 5. The first expansion

- **When:** level 2 (achievable on day 1–2). The card stays visible until a choice is made; "Save for now" is a real
  third option.
- **Options, each priced by a dry run of the real build:**
  - **Playroom wing:** a new 3×3 playroom with 3 beds (3 spots) for the group most often waiting or turned away
    (else a group with no room yet). Once built, the same option **improves** it (+1 bed up to its maximum, then a
    toy) instead of building another.
  - **Bath station:** with no bath room, a 4×3 bath room with a tub (unlocks bath bookings: about 30% of families
    ask). With one, a second tub (two baths at once). After that, an upgrade to a deluxe tub.
- **Shown:** the coin cost, the capacity added, the staffing it needs ("one bath attendant runs one tub; two tubs
  at once need two"), the daily upkeep added, and what it makes possible.
- **Placement:** the first free spot next to an existing room on owned land, with a door into it. If no spot fits,
  the card says so and points to buying land or building by hand. Purchases are game coins only.

## 6. Money on screen

A "Today" strip: revenue so far, wages due tonight, other costs (upkeep, supplies, marketing, refunds), and net.
Tapping it opens Finances. The Team sheet shows each person's wage and the team total. Hiring and expansion cards
show the effect on the daily bill. Game coins are labeled as game coins and never as PAWtastic prices.

## 7. First session and objectives

- The guided tour (Stage A) is unchanged: first arrival, check-in, placement, play, checkout and the first upgrade.
- **Objective bar (always):** one **next objective** and one **longer-term goal**, worked out from the save:
  1. Open the daycare. 2. Fix what's blocking income (the existing blocker card's fix). 3. A family needs you
  (complaint or no compatible room). 4. Check out your first pup. 5. **Hire your first employee** (a recommended
  role for what's slowing you down). 6. Give a role to staff who have none. 7. **Choose your first expansion**
  (with coins progress). 8. The existing next goal.
- **Longer-term ladder:** a profitable day → a team of 3 with a bath station → level 6 and 2 playrooms ("ready to
  plan a second PAWtastic location", the hook for Hawthorne and Hillsdale; no real floor plans).
- The 44-coin stall recovery stays free and is still the top objective when it applies.
- These timings are targets to check with real players, not facts.

## 8. The living campus (3D)

- Staff walk door-to-door along a path (grid search through doors; straight line if no path) to the desk, a pup's
  room or a tub, and stand where the work happens: behind the desk, beside the pup, beside the tub.
- A pup in the bath stands **in its tub** for the whole bath. A pup being played with bounces with its attendant
  beside it. Pups in beds or the calm room lie down. Waiting pups sit in the lobby.
- Name tags over staff show the short status. Owners keep arriving and leaving.
- Tapping a staff member opens their panel (role, rooms, focus, current job, wage). Tapping a pup shows needs, room,
  booked services and who is responsible for them now (the staff member on a job for them, else their room's
  attendant, else "You").
- Reduced motion: people move without walking animation, but stand in the same places. If 3D fails, the 2D map and
  lists still show statuses.

## 9. Ready for the next milestone (not built now)

- **Families and relationships:** `guestBook` already keys regulars by pup with friendship, credit and last
  satisfaction. Next: an owner id on `TRegular`, and returning pups whose `personalityOf` favorite changes which
  care helps most.
- **Events:** a pure `events.ts` with one active event per day (birthday, rain, referral surge, then staff absence
  and breakdown), each a choice with a reward. Staff absence uses a `TStaff.offUntil` field; a breakdown uses the
  existing `Placed.closed`. Events start only after the first expansion, so new players learn the basics first.
- **Locations:** the long-term goal ladder ends at "plan a second location", the hook for Hawthorne and Hillsdale
  as fictional layouts.
- **Decorations and pictures:** the existing décor and share card.

## 10. Tests

Focused tests for assignment conflicts, interrupted jobs, bath queues, capacity changes, wage accounting and
old-save migration. A browser scenario (`qa/e2e-staff.cjs`) on iPhone and desktop sizes: a family arrives → the
receptionist checks in → the attendant plays → the bath attendant completes the booked bath → checkout charges
correctly → wages affect profit → an expansion is bought and used → reload keeps everything. Busy-scene
performance is measured and reported. No real device, Safari, real graphics hardware or human playtest is claimed.

## Plan

| # | Task | Tests |
|---|---|---|
| 1 | Data model and old-save migration: `TStaff` (role, rooms, focus, job, at, founder), `Job`, `roomClean`, `TDog.bathTub`, `caps.tubs` | `team-model.test.ts` |
| 2 | Cleanliness per room; Mop mops all; dirty complaint names the room | `room-clean.test.ts` |
| 3 | Bath stations: free tub required, held for the full bath, queue; extract `playEffect`, `startBath` | `bath-stations.test.ts` |
| 4 | Team management: hire with role, set role/rooms/focus, let go, founder rule, wages | `team.test.ts` |
| 5 | Staff work engine `runStaff` in `tick`: jobs, claims, walking, effects, cancellations, hours, breaks, statuses | `team-work.test.ts` |
| 6 | Waiting families: stages, warnings, desk give-up at 60 | `waiting.test.ts` |
| 7 | Paths and the living campus: staff on jobs, pups in tubs, play/rest, staff picking, tags | `paths.test.ts`, e2e |
| 8 | The first expansion: options, dry-run prices, placement, buy and improve | `expansion.test.ts` |
| 9 | UI: Team sheet, staff panel, dog panel details, Today strip, expansion card, waiting chips and toasts | `team-ui.test.tsx` |
| 10 | Objective bar: next objective and longer-term goal | `objectives.test.ts` |
| 11 | Balance check with staff; browser scenario, reload, layouts, busy-scene performance; preview; report with a manual test script | e2e |
| 12 | Independent review and one fix pass | — |
