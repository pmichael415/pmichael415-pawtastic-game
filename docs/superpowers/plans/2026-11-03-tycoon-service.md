# New Daycare — service and consequences: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps are red, green, commit.

**Goal:** visits with owners, booked services and pickups; honest receipts; complaints with real remedies;
reputation, reviews and loyalty earned by service; no stalled games; one tab plays at a time; 3D failures explained
and recoverable.

**Spec:** `docs/superpowers/specs/2026-11-03-tycoon-service-design.md`. The owner's brief of 3 Nov is binding.

## Global constraints

- `tycoon/AGENTS.md` fairness rules:
  - safety (calm-down, separating) is always free;
  - no forced waiting or paying to skip;
  - time away costs nothing;
  - no loans or interest.
- Older saves load. Purchases, today's Daycare, Recess Rush and Graduation Day are untouched. Never touch Stripe,
  DNS or app.pawtasticacademy.com.
- Any change to prices, gains or XP: `balance.test.ts` green, with a ledger note giving numbers.
- Owners and dogs are fictional names from `NAMES` and the owner list.
- Never charge twice. A checkout can happen only once per visit.

## Review focus

1. **Double checkout:** two taps, or a tick that collects the pup while the sheet is open. Exactly one bill, and
   coins change once (task 4).
2. **A prepaid bath:** charged once at check-in, refunded at most once (tasks 1 and 4).
3. **An owner arriving while the bath runs, and "finish the bath":** the pup goes home when the bath completes, not
   before, and is billed once (task 4).
4. **An old save:** pups on site overnight from before this change get a visit and are collected at 18:00 (tasks 1
   and 6).
5. **The stalled save:** reproduced, and recoverable through play (task 6).

## Tasks

1. **Visit model.** `TDog.visit`, `Facility.repLog`, `reviews`, `referralUntil`; guest-book fields. `createArrival`
   gives requests, the prepaid share and pickup; `checkIn` charges prepaid services once; `parseTycoon` gives older
   pups a default visit.
2. **Timed bath.** `bath()` starts `bathing` (40 game min). `tick` finishes it, in the held path too.
3. **`assessVisit`** in `src/tycoon/visit.ts`: receipt lines, complaints, satisfaction, mood; `turnAway`; the calm
   room counts as protective.
4. **Pickup and remedies.** The owner arrives at pickup time and is collected after 60 min, or at 18:00 for
   non-boarders. `checkout(s, id, { exitBath, remedies })` bills from the assessment and is refused for a pup already
   gone. `remedy(s, id, complaint, kind)` applies; "finish" holds the pup until the service is done.
5. **Reputation and reviews.** Passive growth removed; outcome deltas and scuffle −3 go to `repLog`; seeded reviews,
   `reviewFactor`, referrals; loyalty (lost, credit, return chance).
6. **Stalls.** Reproduce the 44-coin save as a test. `incomeBlockers(s)` names the cause; regrouping an empty
   playroom is free.
7. **UI.**
   - `PickupSheet`: the receipt, complaints with remedy buttons, and charge-and-goodbye.
   - DogPanel shows "Owner is here"; the owner's arrival gets a toast and a doorbell.
   - `ReputationSheet` (log and reviews), opened from the reputation shown in the header.
   - An `IncomeBlockers` card.
   - The checkout message matches the mood.
8. **World.** The map shows owner markers in the lobby, the desk queue and a mood emoji at pickup; 3D shows owner
   figures in the lobby.
9. **One tab plays.** A lease in the store; a spectator banner with "Play here".
10. **3D diagnostics and layout.** Separate failure reasons, details, and "Try 3D again" that remounts. The
    checklist and weekly card become collapsible chips; the stage is taller.
11. **Balance and browser checks.**
    - Update the balance simulation for the new lifecycle.
    - `qa/e2e-service.cjs` (iPhone 13 and desktop):
      - the daycare-plus-bath scenario with an early owner, a complaint and a remedy;
      - a successful visit;
      - a reload mid-visit;
      - double-tap checkout;
      - opening `/daycare-next` directly;
      - an old save.
    - Run all suites, then write the report and republish the preview.
