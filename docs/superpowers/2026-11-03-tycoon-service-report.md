# New Daycare (`/daycare-next`) — service, consequences and recovery: report

3 November 2026. Owner brief of 3 Nov. Design: `docs/superpowers/specs/2026-11-03-tycoon-service-design.md`; plan:
`docs/superpowers/plans/2026-11-03-tycoon-service.md`. Branch `claude/pawtastic-games-unified`, folder `tycoon/`.

**Status:** committed, pushed and tested here, and in the private preview. **It is not in the Lovable hub project
and not published**, so play.pawtasticacademy.com still runs the older preview. Purchases, today's Daycare, Recess
Rush and Graduation Day are unchanged. Stripe, DNS and app.pawtasticacademy.com were not touched.

## The scenario you asked for (verified in a browser, iPhone 13 and desktop)

1. A family books **daycare + bath** for Biscuit. Biscuit is checked in, settled in the matching playroom and
   played with.
2. The bath **takes 40 game minutes** and isn't paid when it starts.
3. Taylor **arrives at pickup time while Biscuit is still in the bath.**
   - A toast and a doorbell sound.
   - "Taylor is here for pickup" on the pup's panel.
   - Taylor stands in the 3D lobby (desktop check: owners 1).
4. **Check out → a complaint**: "Biscuit is still in the bath". The choices are wait for the bath, a credit, or
   explain. (A refund is offered when something was prepaid.)
5. The player asks Taylor to **wait for the bath**. Checkout stays locked ("Waiting for the bath…") until it's done.
6. When the bath finishes, Biscuit goes home with Taylor.
   - The **bill has daycare 75 + bath 35, charged once.** Coins rose by exactly 110.
   - The complaint is recorded as put right.
   - Satisfaction is 91, reputation +2, and the guest book records satisfaction 91.
   - An itemized receipt appears.
7. **A good visit:** Morgan collects Daisy on time after playtime. It checks out at once with no sheet: "delighted",
   reputation +2.

Evidence: `qa/e2e-service.cjs` (46/46). Screenshots are in `tycoon/qa/out/service-*-1-complaint.png` and
`service-*-2-receipt.png`.

## What changed

1. **Reputation reflects service.** Time no longer raises it.
   - **Visits:** each pickup moves it by how the family felt: +2, +1, 0, −2 or −4. A complaint that wasn't put right
     costs 1 more.
   - **Scuffles:** −3 when one starts. The old steady drain is gone.
   - **Open house:** +5.
   - Every change is logged with its reason. Tap "Rep" in the status bar to see the reasons, reviews and recent
     pickups.
   - Generous wages no longer raise reputation; they still speed up staff recovery.
2. **Customers, complaints and reviews.**
   - **Each visit records:** an owner, the services booked (a bath on about 30%, some of them prepaid), drop-off and
     pickup times, and a visit history.
   - **Complaints come only from what happened:**
     - the owner waited over 30 minutes;
     - a booked bath wasn't done;
     - a prepaid bath wasn't done (a billing complaint);
     - not enough attention, or never given a playroom;
     - dirty rooms.
   - **Answers:**
     - finish the service while they wait (a bath, a quick playtime, mopping);
     - a refund (recorded as an expense, "Refunds");
     - a credit off the next visit;
     - an explanation.
   - **An apology never clears** a bath, billing or attention complaint.
   - **Reviews:** delighted families sometimes post 4–5★, and a 5★ review brings referrals that day. Upset families
     post 1–2★, less often if the problem was fixed. Recent reviews raise or lower drop-offs by up to about 12%
     (×0.8 to ×1.12).
   - **Loyalty:** a family who left upset with nothing fixed stays away for 3 days. A credit makes a return more
     likely. Friendship grows with satisfaction.
3. **Honest checkout.**
   - The words, tip and loyalty follow the real outcome. "Delighted" appears only when it's earned, and an owner who
     gave up waiting is never pleased.
   - **The bill is itemized:**
     - daycare is charged only if a playroom or bed was provided;
     - the bath only if it was done (a prepaid bath is never charged twice);
     - boarding only with a bed (a bug found and fixed);
     - the tip only for a happy family;
     - credits and refunds appear as their own lines.
   - Turning a pup away before check-in ("Can't take today") is free, with nothing held against you.
   - A pup kept safe in the calm room pays nothing, with no penalty.
   - A pup checked in but never given a playroom gets a complaint.
   - Each visit can be checked out **once**: a double tap is ignored and doesn't fall through to the page underneath.
4. **The campus.**
   - **3D failures are told apart:**
     - WebGL off or not supported;
     - the 3D code didn't load;
     - a renderer error;
     - the graphics context was lost.
   - Each shows a plain line, a working "Try 3D again" (it starts a fresh 3D view) and "Copy details" (browser,
     graphics renderer, error message; nothing personal). An anonymous `client_error` event records the reason.
   - The 3D view is taller, and the weekly card is a single row.
   - **In the world:** owners walk into the lobby and wait at the desk, then leave. The map shows owner and bath
     markers.
5. **No stalled games.**
   - **The audit's save is reproduced as a test** (44 coins, two unhappy Large & Active pups, one Small & Gentle
     playroom). Three things caused it:
     - daycare pups were never collected, so they stayed forever;
     - nothing hinted how to fix a group mismatch;
     - a full lobby blocked all new drop-offs while daily costs kept running.
   - **Fixes:**
     - families collect their pups at pickup, or at 18:00 at the latest (boarders stay until morning);
     - a **"What's blocking income"** card names the cause and a fix the player can do;
     - regrouping an empty playroom is free, and the card points to it.
   - **Coins below zero** never block serving pups.
   - **Closed or hidden:** while closed, no time or costs pass. A hidden tab pauses, as before.
   - **One tab plays:** a second tab watches without running the clock, costs or saves, with a "Play here" button.
     A reload keeps its tab, and a watching tab takes over when the other closes.

## Tests (this session)

| Check | Result |
|---|---|
| Unit tests | **778 / 778** |
| Typecheck | clean |
| New `qa/e2e-service.cjs` — scenario, good visit, double tap, reload, direct link, old save, second tab (iPhone 13 and desktop) | **46 / 46** |
| Other browser suites, run on their own | onboarding 100/100 · audio 17/17 · hub 37/37 · games 35/35 · today's Daycare 36/36 · Tycoon 36/37 (the frame-rate check read 27.4 fps against 30 on this machine's software renderer; it varies from run to run here and passed in earlier runs) |

Problems found by these tests and fixed:
- boarding was billed without a bed;
- an owner who gave up waiting showed as "delighted";
- a reload locked a tab out;
- the receipt card blocked taps;
- a double tap fell through to the bottom navigation.

## Not done yet (honest list)

- **Part 6, events** (staff absences, boarding rushes, birthdays, rain, breakdowns, referral surges): not started. The
  core loop comes first, as you asked.
- **Showing staff doing jobs and pups playing in 3D:** owners are shown; staff walking to each job and play
  animations tied to activities are not.
- **iPhone Safari is not verified.** This session has only Chromium (with iPhone and desktop profiles). Real iOS
  Safari, real 3D hardware, and the published site are untested.
- **Balance needs a look with real play.** Happiness wears off over a 4–7 game-hour visit, so a pup needs about 3
  playtimes to leave delighted. The seeded first-week balance test still passes, but busy days may feel hard until
  staff can help (staff roles, Stage B).
- **The pickup sheet is skipped for visits with no complaint;** they check out at once with a receipt card. Tell me
  if you'd rather see the sheet every time.
- **Recovery cost** is shown only as "build a playroom from about N coins"; there's no finer cost breakdown.
- **Not published:** releasing it to the live hub is your decision, along with the earlier held releases.
