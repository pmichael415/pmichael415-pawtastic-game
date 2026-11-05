# Tycoon customer growth and retention — rulings and ledger notes

Decisions I made on Phil's behalf while building the customer loop (spec:
`docs/superpowers/specs/2026-11-05-tycoon-customers-design.md`), with what each costs if it turns out wrong.

## Ledger note (tycoon/AGENTS.md: balance)

- **No price, upkeep or XP changed.** What changed is where demand comes from:
  1. The old campaign **arrival multiplier is gone** (flyers ×1.2, online ×1.4, open house ×1.6 on every drop-off).
     Natural drop-offs are now identical with or without a campaign (tested: same seed, same walk-ins). A campaign brings
     its own bookings instead.
  2. **Returning families are weighted.** The 35% returning share now scales with how happy the guest book is (full
     35% once the families' combined return weight reaches 3; one delighted family gives ~16%). Within it, happier and
     closer families come more often; an upset family with nothing put right still stays away 3 days and then comes
     back at 30% of the weight until someone follows up. The dice are drawn exactly as before (none for an empty book,
     one for the share, one more to pick), so nothing else in a seeded day shifts.
  3. **"Kindly rescheduled" is now a real booking.** The introductory-day grace, families still at the desk at
     closing, and the receptionist's reschedule used to send the family home with the word "rescheduled"; now they
     book the next active day (at most twice per family, then they're lost and counted as unmet demand).
- **balance.test.ts (seeded first week) 6/6, staff-balance.test.ts 3/3, business-loop-real.test.ts green** after
  each change (full suite 161 files / 1,228 tests).
- Cost if wrong: early days could have fewer returning families than before (the share starts below 35%), and days
  after a busy closing could start busier (rescheduled families come back).

## Families

- **Status thresholds:** inactive after **4 active days** without a visit (or while staying away after an unresolved
  problem); regular at 3+ visits and at least *Pal* (friendship 25). Active days only — `f.day` never moves while the
  daycare is closed or off screen, so time away never ages a family. *Cost if wrong:* a family can look inactive
  sooner or later than a player expects.
- **What counts as a problem on their record:** the first complaint not put right at pickup when the family left
  disappointed or upset. A good later visit clears it; a follow-up call marks it followed up (and ends a stay-away).
- **A family who leaves the desk before check-in isn't added to the guest book** (as before). It is counted in the
  day's footfall instead.

## Outreach

- **Limits:** 2 free calls each active day; one contact per family every 3 active days; one thank-you per visit,
  offered only within a day of that visit. The answer is decided once from the family, the day and the kind of call
  (re-trying can't re-roll); a yes is a booking for the next active day, never coins.
- **Chances shown nowhere as promises:** thank-you 60% after a delighted visit (40% after a happy one), invitation by
  how the last visit went (15–70%), follow-up 35%, suggestion 50%, each plus a little for closeness (≤ +15%).
- **Staff outreach:** any hired team member (not the founding partner) can be assigned; they call up to **3 families
  in each midday break** (problems first, then inactive families, then thank-yous and suggestions), under the same
  per-family limits, without using the player's free calls. No energy cost (the lobby is closed then).
- **The first-session decision:** after the first family is served well, the next objective is "Thank {owner} — it's
  free", until the player has made any call. It sits after recovery objectives (fix a blocker, a waiting family, a
  closed room) and before hiring.

## Bookings and the desk

- **Booking times** are on the hour and half hour outside the lobby's midday break (08:00–11:30, 14:00–14:30). A
  booked pup arrives on its own dice, so it never changes which walk-ins come that day.
- **A booked family comes even if its room is full**; the desk then offers **Another day** (free, next active day,
  twice at most) or **Can't take today** (recorded as unmet demand with the reason). A booking that couldn't get into a
  full lobby by the last drop-off moves to the next active day (twice at most).
- **Unmet-demand reasons** are the plain ones the desk already uses: "no Large & Active playroom", "Small & Gentle
  playroom full", "lobby full", "boarding beds full", "no bath room", "booked, but the lobby was full", and the same
  reasons for campaign enquiries that were declined.

## Campaigns

| Campaign | Coins | Days | Level | Targets | Activity | Estimated responses |
|---|---|---|---|---|---|---|
| Local flyers | 150 | 3 | 2 | new families | 200 flyers a day | 4–11 |
| Welcome-back letters | 60 | 2 | 3 | inactive families | one letter each, day 1 | 25–45% of them |
| Boarding awareness | 250 | 3 | 4 | overnight stays | vet / pet-shop posters, 120 a day | 2–6 |
| Bath promotion | 120 | 3 | 4 | daycare + bath | a board and a page note, regular price | 2–6 |
| Online ads | 400 | 3 | 5 | new families | 600 households a day | 10–26 |
| Referral outreach | 100 | 3 | 6 | happy regulars | a card to pass on (no reward) | 30–50% of them |
| Open house | 800 | 2 | 8 | new families | 150 families tour a day, +5 reputation | 15–27 |

- The flyers, online ads and open house keep their old prices, days and levels; the open house keeps its +5
  reputation. **Response rates were raised once after the browser play-through** (flyers 0.5–1.5% → 0.7–1.8% a
  household a day, online ads 0.3–0.8% → 0.6–1.4%, open house 3–6% → 5–9%, referral 25–40% → 30–50%). With the first
  rates, flyers needed about 70% of responders to be bookable just to break even, so even a daycare with a playroom for
  every kind of pup usually lost coins, which teaches "never market". Now, at the default daycare price (~36 coins a visit after
  supplies), the middle of the range breaks even at about half the responders bookable: a one-playroom daycare (a quarter
  of new families bookable) still loses on flyers, two kinds roughly breaks even, four kinds earns. *Cost if wrong:* a
  first pass — easy to retune in `catalog.ts`.
- **The card says how many responders the daycare could take:** "You have playrooms for 1 of the 4 kinds of pup, so you
  could take about 1–3 of them; the rest … would be declined". (Each kind of pup is a quarter of new families.)
- **Readiness blocks only what can't be served at all** (no boarding bed, no bath room with a tub, no playroom, no
  inactive families, no happy regulars). Being often full (2+ families turned away for space in the last 3 active
  days, or every spot taken now) shows a warning before paying but doesn't block: the choice stays the player's.
- **Families with a kind of pup that has no playroom** are declined at enquiry time and recorded as unmet demand (the
  card says so before paying).
- **A welcome-back letter doesn't fix a problem:** a family with an unresolved, un-followed-up problem answers at 20%
  of the rate; one staying away doesn't answer.
- **Referral outreach friends are new families** credited to the referral campaign ("recommended by X's family").
- **Word of mouth from a 5★ review** (the existing referral boost, ×1.5 drop-offs that day): a third of that day's
  first-time walk-ins are credited as "recommended by" the reviewer's family (decided from the pup, not the day's
  dice). They're not credited to any campaign.
- **Old saves:** a campaign that was running under the old multiplier has no run record; it simply runs out on its
  day with no effect.

## Results

- **Revenue credited to a visit** = anything prepaid at check-in + the bill at pickup (never a loyalty bonus or other
  game reward). **Direct costs** = that visit's supplies (the per-check-in supply cost) + any refund paid out beyond
  the bill. A **completed paid visit** = served in a playroom or bed with revenue above zero.
- **One source per visit**, set when the family arrives (a booking's source, or walk-in / recommended), credited once
  at settlement. A family rescheduled at the desk isn't a second arrival for its campaign.
- **Contribution after campaign cost** = credited revenue − direct costs − the campaign's coins. Wages and upkeep on
  the campaign's days are shown beside it as overhead "paid for every family", never subtracted, and nothing on the
  screen is called profit.
- **Walk-ins with vs without a campaign** compares finished days only, labelled "a comparison, not proof". Families
  who come back on a day the desk offered are counted as *rescheduled*, not as new bookings.
- **New families who joined the guest book from a campaign** are shown on its result ("visits they make later on their
  own aren't counted here") — the lifetime value is visible but never credited.

## Things I didn't do

- **No new analytics event names.** The `game_events` table only accepts a fixed list (a database check
  constraint), so new names would need a migration applied at release. Outreach and "another day" reuse the existing
  `tycoon_marketing` event with a property instead.
- **The Finances screen lost its Marketing tab** — marketing has one place now (the status bar's Marketing button).
