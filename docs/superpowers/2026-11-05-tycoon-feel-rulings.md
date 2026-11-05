# Tycoon "feel like a daycare tycoon" milestone — rulings and ledger notes

Decisions made on Phil's behalf during the milestone, with what each costs if it turns out wrong.

## §4 Growth that's earned — BALANCE CHANGE (ledger note per tycoon/AGENTS.md)

- **What changed:** a new game starts with **1,900 coins** (was 3,000) and the guide pays **100** (was 200). Until the
  daycare first opens (no intro day yet and no checkout), selling a room, a thing or a door gives back **everything**
  spent (`saleRate` in build.ts); after that it's 75% as before. The sell confirmation says so ("Everything back until
  you first open — after that, selling gives back 75%").
- **Why:** with 3,000 the guide left about 1,500 coins against a ~540 first playroom wing, so the first expansion needed
  no earnings at all (audit finding, milestone §4). Prices were not raised and nothing makes the player wait: the
  shortfall is filled by serving families. The full refund before opening is the free recovery path from a poor
  first layout (a scratch builder can undo a mistake at no cost); once open, the usual 75% applies.
- **Simulated before choosing** (natural player, Quick start, the guide, then care by hand; first wing bought as soon
  as affordable with tonight's costs covered):

  | Start / guide reward | Reserve after the guide | First wing bought | Share paid by service profit |
  |---|---|---|---|
  | 3,000 / 200 | 1,500 | day 1, 07:24 | 0% |
  | 2,000 / 200 | 500 | ~13:30 | 12% |
  | 2,000 / 100 | 400 | ~14:40–16:00 | 28% |
  | **1,900 / 100** | **300** | **day 1, 17:30** | **≈45–55%** |
  | 1,800 / 100 | 200 | — | rejected: a first-free scratch start reached 0 coins (risk of getting stuck) |

- **balance.test.ts (seeded first week): 6/6 green** — guided build 1,600; level 3 at day 1.96, level 5 at day 4.81;
  lowest balance 119 coins; every day's non-building profit ≥ 0. staff-balance.test.ts 3/3 green.
- **business-loop-real.test.ts** (a real new game, no injected coins or XP, no reserve policy): the guide leaves 300;
  the wing (540) is bought on day 1 at 17:30 with 700 on hand = 300 reserve + 300 service profit + 100 game rewards
  — without the families' 300 it was out of reach. The same player on the same seed without the wing ends day 10
  with 374 fewer coins and ~40 less operating profit a day.
- **Old saves keep their coins**: the constants apply only to `newTycoon`; nothing in a loaded save is touched.
- **Cost if wrong:** the first hour is slightly tighter; a player who spends everything on decoration before opening
  can sell it back in full, and after opening is never stuck (dogs stay safe at any balance; calming down is free).

## Rulings

- Ruling: bath demand is "demonstrated" by families of pups whose favourite is bath time (splash): with no bath room
  they ask (counted per day, nothing booked or lost); with one they always book. No dice are added, so arrivals and
  every other roll are unchanged — cost if wrong: with a bath room, bookings rise from ~30% to ~46% of families.
- Ruling: the expansion estimates use only today's demonstrated demand (turned-away families of one kind, bath asks)
  and say so in their text ("Estimate, if today's demand holds: …"); the bath estimate counts only families who asked,
  so it is conservative — cost if wrong: a bath station can out-earn its estimate.
- Ruling: at the guide's decision, an unaffordable playroom is shown disabled with "You have N — M more to earn", and
  the coach says to let Rocket rest free and that families' payments will get you there — cost if wrong: one fewer
  building lesson inside the guide for a new player; they meet it on day 1 instead.
- Ruling: tests whose fixtures built more than a new game can afford (a second playroom for placement rules, four
  playrooms in the list view, a grown daycare's hire) now set their coins explicitly, each with a comment; tests of the
  75% sale rate open the daycare first, and new tests cover the full refund before opening — cost if wrong: none.
- Ruling (§5): personality stays the existing mechanic — a pup's favourite already set playtime (+35 fetch, tug and
  zoomies fans; +30 cuddles; +25 bath-time fans) and a bath (+15 for a bath-time fan, +5 for others). Nothing new was
  added; the compact pup panel now says it with those numbers (one 💡 line), because the decision it changes (a bath
  for a bath-time fan, and whether to build a bath station) was invisible behind "More" — cost if wrong: one more line
  in the compact panel.
- Ruling (§5): returning families "remember" from the guest book the checkout already writes (visits, friendship, last
  satisfaction, last day): the desk shows "visit #N · went home delighted yesterday", the pup's panel the full line,
  and a family that left disappointed adds "a good day today wins them back" — no new state — cost if wrong: an
  older guest-book entry without a score shows only "back for visit #N".
- Ruling (§5): the savings line adds one line of why (the option's "Good if …", e.g. "3 Large & Active families asked
  today — you have no room for them yet"); the labelled estimate with its numbers stays on the expansion card — cost
  if wrong: the reason, not the arithmetic, is what's in view.
- Ruling (§5): a finished expansion's message names what it adds ("+3 spots for Large & Active pups, open and working")
  and, for a wing, the family already waiting who can now stay ("Rex can stay — check them in.") — cost if wrong: none.
- Ruling (§6, found by the first-session play-through): when the guide says "Check out" (its pup has played), that
  pup's family arrives for pickup — so the pup's panel leads with "Check out — their family is here" and the front desk
  lists the pickup, instead of the panel saying "All set — picks up at 16:00" with no checkout step while the coach
  said check out. A closed panel left the pup findable only by tapping it in 3D — cost if wrong: none (the guide holds
  the clock, so the family never waits).
