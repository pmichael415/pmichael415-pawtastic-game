# New Daycare — service, consequences and a livelier campus (design)

Owner brief of 3 Nov 2026: make reputation reflect service; put customers, complaints and reviews into the visit
cycle; make checkout honest, with a receipt; make the campus the main experience; prevent stalled games; then add
paced events. **This design covers parts 1–5. Part 6, events, comes after the core loop works.**

## What the audit found (code as of 3ed10a8)

1. **Reputation rises on its own.** `tick` adds +0.02 reputation per second whenever no scuffle is running, plus
   more with generous wages. Unhappy pups and dirty floors still drift up to 100.
2. **A visit has no customer.** A pup has a name and a boarding flag, but no owner, booked services, pickup time or
   history.
3. **Daycare pups are never picked up.** `closeDay` leaves every pup on site overnight. Pups left in the lobby keep
   filling it. New drop-offs then stop (a full lobby means "the customer rebooks"), so income stops too. Wages and
   upkeep are still charged at 18:00.
   - This is the stalled save: 44 coins, two unhappy pups waiting and daily losses. It is reproduced as a test (task 6).
4. **A bath pays the moment it starts and finishes instantly,** so an owner can never arrive mid-bath.
5. **Checkout always says "went home happy",** whatever happened. Checking out from the lobby or calm room is always
   free, with no difference between turning a pup away fairly, separating it for safety and neglecting it.
6. **3D failures share one vague reason.** A failed module load and a renderer exception both show as "failed", and
   a lost WebGL context isn't handled. No details are kept, so nothing can be diagnosed.
7. **Two tabs both run the clock.** Each tab ticks and saves on its own; the save guard only adopts purchases.

## The visit

Each pup carries a `visit`:
- `owner`: a fictional first name, e.g. "Sam".
- `requests`:
  - always `daycare`;
  - a bath on about 30% of visits, only when a working Bath Room exists;
  - boarders also book `boarding`.
- `prepaid`: services paid at check-in. A prepaid bath is about 40% of bath requests.
- `arrived` and `pickup`: the arrival day and minute, and the expected pickup.
  - Daycare pickup is 4–7 game hours after arrival, between 2 hours later and 17:30 at the latest.
  - Boarders are picked up the next day at 10:00.
- `ownerHere`: when the owner arrived for pickup, or null.
- `waitedLobby`: game minutes the pup waited at the desk before check-in.
- `history`: short lines such as "Checked in 08:10", "Playtime in Small & Gentle", "Bath started 15:20".
- `scuffle` and `safeMove`: whether the pup was in a scuffle, and whether it was moved to calm down to keep it safe.

Older saves get a plain daycare visit on load, with pickup at 17:30.

**Bath (timed):** starting a bath (same checks, 15 staff energy) sets `bathing` for 40 game minutes. The pup is only
"bathed" when the bath finishes. Baths are charged on the receipt, never when they start. A prepaid bath is never
charged twice.

**Pickup:**
- At `pickup`, the owner arrives (`ownerHere` is set), with a doorbell and a toast. They are drawn in the lobby on
  the map and in 3D.
- The player checks the pup out, which opens the pickup sheet.
- An owner who waits 60 game minutes takes the pup and pays for what was done. That counts as an unresolved wait
  complaint.
- At 18:00 every non-boarding pup is collected the same way, so no daycare pup stays overnight and the lobby clears
  every day.

## Satisfaction, receipt, complaints

`assessVisit(f, dog, now)` is a pure function. It returns the receipt lines, any complaints, satisfaction and mood.

**Satisfaction** = `0.6 × happiness + 30`, then:
- +15 if played, −15 if not;
- −25 for a requested bath that isn't finished;
- −15 if cleanliness is under 40;
- −15 if the owner waited over 30 minutes;
- −10 if the pup waited over 60 minutes at the desk;
- −20 for a scuffle during the visit.

It is clamped to 0–100. Moods: delighted ≥ 80, content 60–79, disappointed 40–59, upset < 40.

**Receipt lines:**
- daycare at today's formula (`price × (0.6 + 0.4 × happiness/100)`), or "not provided" (0) if the pup was never in
  a playroom or bed;
- the bath, if done and not prepaid;
- the exit bath, if chosen;
- boarding;
- a tip: the full tip if delighted, half if content, none otherwise;
- a credit from last visit, shown as a negative line;
- refunds, shown as negative lines.

A pup protected in the calm room after a mismatch or scuffle pays nothing and loses no satisfaction. A pup turned
away before check-in (`turnAway`) leaves with no charge and no reputation change; the reason is logged.

**Complaints** come only from what happened:

| Complaint | When | Remedies |
|---|---|---|
| `wait` | the owner waited over 30 min | explain, refund 25% of daycare, credit |
| `bath` | a requested bath isn't finished | **finish it** (the owner waits for it), refund if prepaid, credit, explain |
| `billing` | a prepaid service wasn't done | refund it, credit, explain |
| `attention` | no playtime, or happiness under 45 | **quick playtime now**, refund 50% of daycare, credit, explain |
| `dirty` | cleanliness under 40 | **mop now**, refund 25%, credit, explain |

Remedy effects on satisfaction:
- **Complete the service:** removes that complaint's penalty, minus 5 for the extra wait.
- **Refund:** +20, at the stated cost in coins (recorded as an expense, "refunds").
- **Credit:** +12. It costs nothing now; the next visit's bill is reduced by half a daycare price, and the customer
  is more likely to return.
- **Explain:** +5 for a short wait (≤ 45 min). Otherwise +0, and the owner says why it isn't enough.

An apology never clears a bath, billing or attention complaint.

## Reputation, reviews, loyalty

- **No passive growth.** Reputation changes only through:
  - **Visit outcomes**, after remedies: ≥ 85 → +2, 70–84 → +1, 50–69 → 0, 35–49 → −2, under 35 → −4. An unresolved
    complaint is a further −1.
  - **Scuffles:** −3 when one starts (replacing the per-second drain), still never below 40.
  - **Open house:** +5, as now.
- Every change goes into `repLog` with a plain reason, shown in a Reputation panel.
- **Reviews.** Odds are seeded per visit, so tests are repeatable:
  - satisfaction ≥ 88: a 5★ review 35% of the time;
  - 75–87: a 4★ review 15% of the time;
  - under 45: a 1–2★ review 50% of the time (25% if the complaint was fixed by completing the service or a refund).
  - The last 10 reviews set `reviewFactor = 1 + (average stars − 3.5) × 0.08`, which multiplies arrivals.
  - A 5★ review also adds a referral: +50% arrivals for the rest of that day.
- **Loyalty.** Guest-book entries gain `sat` (the last satisfaction), `credit` and `lost` (set after an upset visit
  with nothing fixed).
  - Lost regulars don't come back until 3 days have passed.
  - Credit raises the chance they return.
  - Friendship grows by satisfaction, not happiness.

## Stalls, tabs and the campus

- **What's blocking income:** `incomeBlockers(s)` names the cause and a fix. Possible causes:
  - closed;
  - lobby full;
  - no playroom for a waiting group (with a free fix, regrouping an empty playroom, and the cost of building one);
  - playrooms full;
  - staff tired;
  - coins below zero.
  It shows as a card once no income has come in by 10:00, or when coins are below zero.
- **Regrouping** an empty playroom is free.
- **One tab plays:** a lease (`pawtastic-daycare-next-lease`, refreshed every 2 s, stale after 6 s) lets only one
  tab run the clock and save. Another tab shows "Your daycare is open in another tab", with a "Play here" button.
- **3D diagnostics:** the reasons are `no-webgl`, `load-failed` (the 3D module didn't load), `renderer-error` (an
  exception) and `context-lost`. Each shows a plain line with "Try 3D again" and "Copy details" (browser, renderer
  name, error message; nothing personal). It is also sent as a `client_error` event with the reason only.
- **Layout:** the stage is taller (`clamp(320px, 62svh, 620px)`). The checklist and weekly card collapse to one-line
  chips that open on tap.
- **In the world:** owners stand in the lobby when they come for pickup and walk out with their pup. Pups waiting at
  the desk queue in a line. A pup's marker shows its mood at pickup.

## Not in this design

- Events: staff absences, boarding rushes, birthdays, rain, breakdowns, referral surges (part 6).
- Staff walking to each job.
- Several locations.
