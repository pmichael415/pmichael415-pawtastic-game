# New Daycare (`/daycare-next`) — customer growth and retention: report

Owner requirement "CUSTOMER GROWTH AND RETENTION" (5 Nov), from Phil's feedback: "There's no marketing to bring
customers back. It's not running like a real daycare tycoon."

- **Branch and code:** `claude/pawtastic-games-unified`, code from `e5e9cfe` (the previous report) to `9c2eee2` (after it only this report changed).
- **Design and decisions:** the design is in `docs/superpowers/specs/2026-11-05-tycoon-customers-design.md`. The
  decisions I made on Phil's behalf, with what each costs if wrong, are in
  `docs/superpowers/2026-11-05-tycoon-customers-rulings.md`.
- **Private preview only:** the private preview artifact was updated (v18, still private). Nothing went to the live hub, and nothing was released or merged.
- **Rules kept:** game coins only — no discounts, credit, cash, prizes or real messages.
- **Not touched:** the legacy game (`/daycare`) and its save, Stripe, purchases and deliveries, DNS,
  app.pawtasticacademy.com, real marketing accounts or customer communications, the live hub and the other games.
  `git diff e5e9cfe..HEAD` changes only `tycoon/src/tycoon/`, `tycoon/src/components/tycoon/`, `tycoon/qa/` and these
  docs.

## In short — status: the first loop and the extensions are built and tested; ready for Phil's playtest of the private preview

- **Families now have a history.** The guest book remembers each family's pup, first visit, what they book, how they
  found you and any problem left unresolved. Status (new / returning / regular / inactive) and a one-line story are
  worked out from that. Happy, close families come back more often. An upset family with nothing put right stays away
  until you follow up. Inactivity counts active days only: time away never ages anyone.
- **Retention is playable and free.**
  - **Calls:** Thank, Invite back, Follow up and Suggest a service, from each family's row. 2 free calls a day; a
    family can be contacted once every 3 active days.
  - **Answers:** each is decided once; a yes is a **booking**, never coins.
  - **Staff:** a hired team member can take up to 3 calls each midday break.
  - **First session:** after the first happy family, the next objective is "Thank … — it's free".
- **Marketing is a real choice.** Seven campaigns each buy a defined activity for game coins. Each card shows:
  - who it targets and how many active days it runs;
  - an estimated response range, "not guaranteed";
  - how many of those families you could actually take;
  - ✓/✗ for Rooms, Equipment and Team.

  A campaign the daycare can't serve can't be launched. A full daycare is warned before paying. Responses become
  bookings that come through the ordinary desk, or are declined as unmet demand. The old "×1.6 every drop-off"
  multiplier is gone: natural drop-offs are the same with or without a campaign.
- **Results.**
  - **Per campaign:** coins spent, families reached, responses, arrivals, completed paid visits, attributed service
    revenue, direct costs and **contribution after the campaign's cost**.
  - **Each visit is credited once** to the one source that brought it. Overhead is shown apart, nothing is called
    profit, and a note says attribution isn't proof.
  - **Also shown:** new vs returning families, regulars, inactive families, unmet demand by service and kind, why
    families couldn't come, and "What next?" (more customers, capacity or better service).
- **The desk can say "another day".** A family with no spot can book the next active day, free (twice at most), or be
  turned away, recorded with the reason. Families the game used to "reschedule" now really come back.
- **Shown in a real browser from a fresh game, nothing injected (§3):**
  - serve a first family;
  - see them in the customer history;
  - thank them, and launch Local flyers;
  - a booked family arrives, is served and pays once;
  - compare that with the 150 coins it cost.

  In a one-playroom daycare the flyers lost coins (−114 and −150 in two runs), because most responders had a kind of
  pup it couldn't take — the card said so before paying. Free calls brought a family back at no coin cost, and the
  Results pointed at making room first.
- **Checked:**
  - 161 test files / 1,235 tests and the typecheck pass, including the seeded first-week balance check;
  - the browser suites pass (§5);
  - an independent review found no breach of the money rules, plus five issues, which I fixed with tests that failed
    first;
  - private preview **v18** is up (still private).
- **Not verified:** a real iPhone, a real person, and how it feels. Online ads, open house, welcome-back letters,
  boarding awareness, bath promotion, referral outreach and staff calls are tested in unit and screen tests, not in a
  browser play-through.

## 1. What existed, and what was extended (not duplicated)

| Existing system | What it did before | Now |
|---|---|---|
| Guest book (`TRegular`) | Pup, visits, friendship, last satisfaction; an upset family with nothing put right stayed away 3 days | The same entry is the family's **history**: first visit, services booked, how they first found you, a problem left unresolved (and whether you followed up), last contact. Status (**new, returning, regular, inactive**) and a plain-language **story** are worked out from it, never stored. |
| Returning families | 35% of drop-offs picked a guest-book family **at random** | Still up to 35%, but **weighted** by how the last visit went and how close the family is. An upset family with nothing put right still stays away 3 days, then rarely comes back until someone follows up. |
| Marketing (Flyers / Online ads / Open house in Finances) | Multiplied **every** drop-off by 1.2–1.6 for 2–3 days; nothing said who came because of it | **Seven defined activities**, each with a stated cost, audience, days, estimated response range ("not guaranteed") and readiness. Each active day, responses are drawn and become **bookings** — or are declined as unmet demand. The multiplier is gone: natural drop-offs are identical with or without a campaign. |
| 5★ review referrals | ×1.5 drop-offs that day | Unchanged, and now a third of that day's first-time walk-ins are credited "recommended by" the reviewer's family. |
| Demand (`asked`) | Families turned away by pup kind, bath asks | Kept, plus a 14-day **footfall** record: who came (first-time walk-ins, came back on their own, booked, rescheduled) and who couldn't, by reason. |
| "Kindly rescheduled" | The family went home | They now **book the next active day** (at most twice per family). |

## 2. The loop, as a player meets it

**From the main daycare.** The status bar has a **Marketing** button (it shows 📣 while a campaign runs). It opens one
screen with three tabs.

- **Customers.**
  - Counts of new, returning, regular and inactive families, and how many free calls are left today (2 each active
    day).
  - Each family's row has its status and a one-line story, for example:
    - "First visit on day 1 — heard about you from Local flyers."
    - "A regular — Biscuit went home delighted last time (visit #4, Pal)."
    - "Hasn't been back for 6 active days — an invitation may bring them back."
    - "Stopped coming after day 3: Taylor waited 60 minutes at pickup. It wasn't put right — a follow-up call can win
      them back."
  - Each row also shows the calls that fit that family: **Say thank you** after a good visit, **Invite back** when
    inactive, **Follow up** after a problem, **Suggest a bath / boarding night** when it fits their history.
  - **The answer is decided once.** A yes is a booking for the next active day ("they booked Biscuit for day 4 at
    10:30"); otherwise "they'll think about it". Never coins.
  - **Limits stop farming:**
    - one contact per family every 3 active days;
    - one thank-you per visit;
    - no call while a family is booked in or their pup is here — the row says why.
  - **Staff can take calls:** with a hired team member, you can hand them the calls. They make up to 3 in each midday
    break, follow-ups first, without using your free calls.
- **Campaigns.** Seven cards:
  - Local flyers, Welcome-back letters, Boarding awareness, Bath promotion, Online ads, Referral outreach and Open
    house.
  - **Each card states:**
    - the coins;
    - who it targets and what the coins buy ("200 flyers through letterboxes near the daycare each day");
    - its active days;
    - "About 4–11 families may respond — not guaranteed";
    - how many of them you could actually take ("You have playrooms for 1 of the 4 kinds of pup, so you could take
      about 1–3 of them; the rest … would be declined");
    - ✓/✗ for Rooms, Equipment and Team.
  - **A campaign the daycare can't serve says why and can't be launched.** Examples: no boarding bed, no bath room with
    a tub, no inactive families, or everyone inactive still staying away after a problem.
  - **A daycare that's often full says so before you pay**, but the choice stays yours ("You turned away 3 families for
    lack of space in the last 3 active days…").
  - One campaign at a time. It ends after its last active day, and the banner says so.
- **Results.**
  - **Each campaign:**
    - coins spent, families reached, responses (booked / declined, and why);
    - arrivals, completed paid visits, attributed service revenue, direct service costs;
    - **contribution after campaign cost**;
    - how many new families joined the guest book from it.
  - **Overhead shown apart:** the wages and upkeep on those days are shown beside the result ("paid for every family,
    so it's shown apart"). Nothing is called profit. A note says attribution isn't proof.
  - **Outreach's own result** (no coins spent).
  - **First-time walk-ins a day with and without a campaign** ("a comparison, not proof").
  - **Customers:** new vs returning, regulars, inactive.
  - **Families who couldn't come:** by service, by kind of pup and by reason.
  - **What next?** — more customers, more capacity or better service, each with the reason from your own numbers.

**At the front desk.**
- A booked family shows "📅 booked · Local flyers" (or "after your thank-you call", "recommended by Rex's family").
- If there's no spot for them, the desk offers **Another day**: free, they book the next active day, at most twice.
- Next to it is **Can't take today**, which is recorded as unmet demand.
- Families the daycare had to reschedule at the end of the first day or at closing now really come back the next active
  day.

**In the first session.** After the first family goes home happy, the Objectives bar says "Thank Emerson — it's free"
with **Open Marketing**. That's the first retention decision. Flyers unlock at level 2 (reached during the first
session in the play-through).

## 3. The playable demonstration

`tycoon/qa/customers-session.cjs` is a **scripted player**: Chromium with iPhone 13 emulation, not a person and not
a real iPhone.

- **A fresh game:** storage is cleared; no coins, experience, families or bookings are injected. Every family arrives
  through the simulation.
- **Speed, labelled:** it plays at **normal speed (1×)** through the guide, the first family and the first thank-you.
  It then switches the clock to **4× — for testing only**, labelled in its log — so the next active days come sooner.
- **What it taps:** what the game puts forward — the desk, the pup's next step, the pickup sheet, the Objectives
  button and the Marketing screen.
- **The decisions it makes:**
  - the thank-you the objective offers;
  - Local flyers once it unlocks and the coins cover it with 250 to spare;
  - each active day after that, the free calls the Customers list offers (follow-ups, then invitations, then
    thank-yous).
- **What it never does:** expand. The daycare keeps the guided start's single Small & Gentle playroom (3 spots), which
  is the capacity squeeze the results then point at.

**Two runs are reported.** Screenshots, video and logs are in `tycoon/qa/out/customers-session/` (git-ignored; both
runs are kept in my scratchpad).

- **Run 5 is on the final code** (`9c2eee2`): 4.6 minutes of real time, 176 taps, 0 failed taps, no page errors.
- **Run 3 was one step earlier.** It had the same rules, but before the per-save answer seed and before Marketing
  moved beside Build. It's the run where a free thank-you turned into a paid visit: 6.0 minutes, 232 taps, 0 failed,
  no page errors.

| Step (requirement §6) | Run 5 — final code | Run 3 |
|---|---|---|
| Serve a first-time family | The guide's first family: Parker paid 40 for Biscuit, delighted; marked first visit, walk-in. | Same. |
| See them in the customer history | Objectives: "Thank Emerson — it's free" → **Open Marketing** → Customers: "🐕 Daisy · Emerson's family · 1 visit · New — First visit on day 1 — walked in", with **Say thank you**. | Same. |
| A follow-up action or a small campaign | Thank-you → "they'll think about it" (0 coins changed). Local flyers launched on day 1 at 08:25 for 150 coins. The card showed "About 4–11 families may respond — not guaranteed", ✓ Rooms/Equipment/Team, that only about a quarter could be taken, and a full-playroom warning. Day 3: "You thanked Parker — they booked Biscuit for day 4 at 09:30" (after the run stopped). | Thank-you → "they'll think about it"; flyers launched day 1 at 09:25. Day 3: "You thanked Frankie — they booked Maple for day 4 at 14:30". Day 4: two follow-ups (one booked). |
| A later arrival attributed to it | Day 1: Luna at the desk, "📅 booked · Local flyers". | Day 4: Maple at the desk, "📅 booked · after your thank-you call". |
| Served, paid once | "Emerson … Paid 38" for Scout (a flyers booking). Local flyers was credited **1 paid visit, revenue 38, direct costs 2** — exactly the outcome's 38, once. | "Frankie is delighted — Maple had a great day! Paid 37." Outreach was credited **1 paid visit, revenue 37, costs 2**, once. The same checkout's loyalty bonus (+25, "You're now Pals!") is a game reward and **wasn't** credited. |
| Compare with the campaign's cost | Local flyers: 150 coins, 600 households reached, 4 responses (3 booked, 1 declined — no Small & Active playroom), 3 arrivals, 1 completed paid visit, revenue 38, costs 2, contribution **−114**. "1 new family joined your guest book from it". Overhead (wages 120, upkeep 123) shown apart. | Local flyers: 4 responses (1 booked, 3 declined), 1 arrival, 0 paid visits, contribution **−150**. Outreach (free): 5 calls, 2 booked, 1 paid visit, **+35** after direct costs. |
| Choose what's next | **What next?** points at capacity: families turned away for space, and many with no playroom for their kind of pup. | Same: "families already come — make room for them first". |

The picture both runs give is the one the requirement asks for:
- **In a one-playroom daycare, flyers don't pay for themselves.** Most responders have a kind of pup it can't take,
  and the card said so before paying.
- **Free thank-yous and follow-ups bring families back at no coin cost.**
- **The Results screen says to make room first.**

**What the earlier runs found (all fixed before runs 3 and 5):**

- **Run 1, first rules:** flyers drew 5 responses, but only 3 were bookable and the campaign lost 95. That showed three
  problems:
  - the card didn't say that only a quarter of new families would fit a one-playroom daycare;
  - the response rates were so low that flyers usually lost money even in a daycare with a playroom for every kind of
    pup;
  - families rescheduled at the desk were counted as new bookings in the with/without comparison.

  The card now says how many responders the daycare could take, the rates were raised once (rulings), and reschedules
  are counted apart.
- **Run 2:** stopped by me on day 8. The script waited only for the campaign, which on those dice brought nobody
  bookable, so a real player would have kept using free calls. The script now does that each day.
- **Run 4:** stopped by me. It was overtaken by the per-save seed change.
- **The browser suites caught one layout regression.** The Marketing button in the status bar made it 138 px tall on
  an iPhone SE (118 before), clipped the Open switch and moved the map under the sticky bar, so map taps missed
  (e2e-connect 21/25). Marketing now sits beside **Build**, and the status bar is back to 118 px.

**Honest notes:**

- **The dice are fixed.** A campaign's draws are decided from the campaign and the day, and a call's answer from the
  save, the family and the day. Nothing can be re-rolled, but different games get different answers.
- **The play-through daycare got worse.** In run 3, reputation fell from 80 to 59 by day 4, because a solo player never
  expanded the one 3-spot playroom while families kept coming. The same solo-player strain as the last report.
- **One logging slip.** One of the script's call log lines recorded a neighbouring toast instead of the call's answer
  (the answer itself is in the outreach totals above).

## 4. The requirement, point by point

Tests are in `tycoon/src/tycoon/` unless noted: `customers.test.ts` (C), `customers-run.test.ts` (R),
`customers-save.test.ts` (S), `marketing.test.ts` (M), `objectives.test.ts` (O) and
`src/components/tycoon/marketing-ui.test.tsx` (UI).

| Requirement | How it's met | Proved by |
|---|---|---|
| **§1 Families persist; new / returning / regular / inactive** | The guest-book entry is the family's history; status is derived | C "new, returning, regular and inactive…" |
| Remember dogs, preferences, visits, satisfaction | Pup and kind, services booked, visits, friendship, last satisfaction, first day, how they found you | R "first visit: first day, services, how they found you…", S round-trip |
| A plain-language reason when they return or stop | `familyStory` | C "each status has a plain-language reason", UI Customers |
| Happy families more likely to return and refer | Weighted returns; referral outreach asks happy regulars; 5★ word of mouth credited | C "a delighted family is far more likely to return…" (Biscuit > 4× Daisy over 400 drop-offs), M "referral outreach…" |
| An unresolved poor visit reduces interest, with a fair recovery | The problem stays on the record; a free follow-up ends the stay-away; a letter can't fix it | C "a follow-up after a problem…", M "welcome-back letters… rarely answers", R "an upset family…" |
| Inactivity only on active days; never punished offline | Status uses the game day, which only moves while open and on screen; nothing runs while closed | C "inactivity counts active business days only", R "nothing happens while the daycare is closed", M "nothing is drawn while the daycare is closed" |
| **§2 A clear Marketing screen from the main daycare** | Status-bar **Marketing** button; Customers · Campaigns · Results | UI tests; browser play-through |
| Distinct campaigns for game coins | Local awareness (flyers, online ads, open house), welcome-back, boarding awareness, bath promotion (no discount), referral outreach | M "every campaign is a defined activity…" |
| Each shows cost, target, days, estimate (not guaranteed), readiness | Campaign card | M, UI "Campaigns: cost, who, days…" |
| A defined activity — no prizes, mystery rewards, real messages or data | Each card names what the coins buy; families are simulated | catalog review; M "never coins" |
| A small free outreach option; recovery never needs coins or waiting offline | 2 free calls each active day; follow-up is free | C outreach tests |
| **§3 Thank / invite / follow up / suggest from a family's record** | Row buttons, each with its reason | C "the offers on a family's record fit them", UI |
| No endless tapping; staff take a workload | One tap per call; a team member makes up to 3 calls each midday break | C "staff take an outreach workload…" |
| No farming one family | 3-day cooldown, one thank-you per visit, no call while booked or here | C "one thank-you per visit…", C "no call is offered while a family can't be contacted…" |
| Outreach leads to a booking, never coins | A yes is a booking | C "thank a family after a good visit: … no coins change hands" |
| No credit, discounts, cash or real-world rewards | None exist | code review |
| **§4 Marketing uses the actual simulation** | Draws each active day → bookings → ordinary desk arrivals → ordinary care and checkout | R, M |
| Boarding campaign → boarding enquiries; bath campaign only earns if a bath can be done | Boarding bookings need a bed; bath promo needs a working bath room with a tub | M "a boarding campaign brings boarding enquiries…", M "a campaign the daycare can't serve says so…" |
| A full daycare explains the capacity problem before spending | Card warning | M "a full daycare explains the capacity problem…" |
| Decline politely or offer a later visit, dogs safe | Another day / Can't take today, before check-in only | R "Offer another day…", R "Can't take today records why", UI "the desk" |
| Good care supports retention; marketing can't make up for bad service | Returns and letters weighted by how visits went | C, M (above) |
| Effects end clearly, never stack; natural arrivals without spending | One at a time; draws stop after the last day; no multiplier | M "it ends clearly…", R "a running campaign doesn't change natural drop-offs" |
| **§5 Per campaign: coins, reached, responses, arrivals, paid visits, revenue, direct costs, contribution** | `CampaignRun` + `runResult` | M "contribution after the campaign's cost…", UI "Results…" |
| Overhead apart; never "profit" | Shown beside the result; the word isn't used | M, UI (asserts no "profit") |
| One payment never counts toward two campaigns | One source per visit, credited once at settlement | R "…credited once", R "…a returning family keeps how they first found you" |
| Attributed ≠ proof | Note on every result; the with/without comparison is labelled | M, UI |
| New vs returning, regulars, inactive, unmet demand by service/kind, why turned away | `customerSummary`, footfall | M "customers at a glance…", UI |
| **§6 One early decision, shown through the real UI** | First-session objective "Thank … — it's free" | O "after serving a first family well…", browser play-through (§3) |
| **§7 Saves; old saves; legacy untouched** | Every new field validated; an old save loads with an empty history | S (3 tests), M "a save and reload mid-campaign neither loses nor repeats a day's draw" |

## 5. Verification

- **Unit and screen tests:** `npx vitest run` on `9c2eee2` passes **161 files / 1,235 tests**. That includes:
  - the new customer and marketing tests (C 16, R 17, S 3, M 19, UI 7, plus 1 in O);
  - `balance.test.ts` (seeded first week), `staff-balance.test.ts` and `business-loop-real.test.ts`.
  - **Test-first:** tests were written before the code for each part, and watched failing before it existed.
- **Types:** `npx tsc --noEmit` is clean.
- **Lint:** no new rule errors. The new files are Prettier-formatted. Files I edited keep the formatting warnings they
  already had (the repo's eslint+prettier isn't clean today; e.g. `run.ts` had 109 before).
- **Browser suites (Chromium, iPhone SE / 13 emulation, software graphics):**
  - **On the final layout (`36c77cd`; `9c2eee2` only changes how a call's answer is seeded):** e2e-connect **28/28**,
    e2e-tycoon **45/45** (frame rate with 12 rooms, 200 things and 30 dogs ≥ 30 fps included), e2e-onboarding
    **102/102**, e2e-phone **40/40**, e2e-empire **29/29**.
  - **Earlier in this work, not re-run after the review fixes and the layout move:** e2e-storage **10/10**,
    e2e-daycare **36/36** (the legacy game, untouched), e2e-staff **58/58**, e2e-service **46/46** — all on
    `046e756`.
  - **Two failures fixed along the way:** e2e-tycoon still used the old Finances marketing tab, so its script now
    launches Local flyers from the Marketing screen. e2e-connect failed on the iPhone SE because of the status-bar
    height (§3).
- **Independent review** of the whole diff, by a separate read-only agent:
  - **Held:** credited-once, no coins from marketing, nothing advancing while closed, draws fixed after save/reload,
    malformed saves.
  - **Found and fixed:** call buttons that couldn't work during a family's cooldown, old-save families counted as
    "joined" a campaign, letters bought when no one could answer, a closing notice promising a return, a stuck
    objective, and three small number labels. The fixes are listed in the rulings.
- **The private preview:** built from `9c2eee2` with `review/vite.config.ts` and smoke-tested from the built files: a
  fresh game, Quick start, the **Marketing** button, all three tabs, and the Local flyers card, with no page errors.
  Published to the same private artifact as **v18** (version id `1793901638-5b44`). It stays private.

## 6. Known limits and things to watch in the playtest

- **Not verified:** a real iPhone, a real person, and how it feels. Everything here is Chromium emulation.
- **Campaign numbers are a first pass.** At the default price:
  - a daycare with one kind of playroom loses coins on flyers (the card says how few it could take);
  - two kinds roughly break even;
  - four kinds earn.

  Online ads and the open house were checked by arithmetic and unit tests only. They're easy to retune in
  `catalog.ts`.
- **Solo players in a busy daycare struggle (as last time).** In run 3, reputation fell from 80 to 59 in four days:
  one 3-spot playroom, families kept coming, and the player never expanded. Families rescheduled at the desk come back
  the next morning, which makes mornings busier. That's the right signal ("make room first"), but it's the thing to
  watch in Phil's playtest.
- **A campaign's long-term value isn't credited.** New families who later come back on their own count as "joined
  your guest book from it", not as revenue. That's deliberate (no double counting), but it means a campaign's result
  looks worse than its real long-term value.
- **Analytics:** calls and "another day" reuse the existing `tycoon_marketing` event with a property. New event names
  would need a database migration of `game_events`' allow-list at release.
- **Small wording nit seen in the last run:** "plus 1 arrivals from bookings", when the daily average is exactly 1.
- **Old saves:** a campaign that was running under the old multiplier runs out on its day with no effect, and
  families keep their history from now on.
- **Release:** nothing was published to the hub, merged or released. That needs Phil's approval.
