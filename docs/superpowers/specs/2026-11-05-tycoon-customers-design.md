# Customers, loyalty and marketing — design (Tycoon, `/daycare-next`)

Owner requirement "CUSTOMER GROWTH AND RETENTION" (5 Nov): *attract families → a good visit → coins and trust →
repeat visits → referrals → reinvest in capacity, service and marketing.* Built by extending what exists, not beside it.

## What exists (inspected first)

- **Guest book** (`TRegular`, one entry per pup's family): visits, friendship, last satisfaction, last day, and
  `lostUntil` (an upset family with nothing put right stays away 3 days). Families come back at random:
  `REGULAR_CHANCE` (35%) of arrivals pick a family from the guest book, uniformly.
- **Marketing**: three campaigns (Flyers / Online ads / Open house) that multiply *all* arrivals for 2–3 days, one at a
  time, in a tab inside Finances. Nothing says who came because of them.
- **Referrals**: a 5★ review raises drop-offs until the day ends. **Demand**: `asked` counts families turned away per
  pup kind and bath asks. **Active days**: `f.day` only advances while the daycare is open and on screen.

## The design

1. **Families have a history** (the guest book entry, extended): first visit day, services booked, how they first
   found the daycare (walk-in, a campaign, outreach, a referral), the last unresolved problem and whether it was
   followed up, and the last contact. Status is worked out, never stored: **new** (one visit), **returning**,
   **regular** (3+ visits and at least *Pal*), **inactive** (no visit for 4 active days, or staying away after an
   unresolved problem). Every family has a plain-language story ("Stopped coming after waiting 60 minutes at pickup —
   it wasn't put right"). Spontaneous returns keep the 35% share but are weighted by how the last visit went and how
   close the family is; inactive families are less likely, an upset one with nothing put right stays away for its 3
   days (as now) and then comes back only rarely unless someone follows up.
2. **Bookings** are future arrivals: a family who answers outreach or a campaign books a visit on a stated active day
   and time. Booked families arrive through the ordinary desk flow, carrying their source. If there's no free spot when
   they arrive, the desk offers **Offer another day** (moves the booking to the next active day, no penalty) or
   **Can't take today**. Bookings wait while the daycare is closed — nothing is lost offline.
3. **Outreach** (free, from a family's record): **Thank** after a good visit, **Invite back** an inactive family,
   **Follow up** after a problem, **Suggest a service** that fits them (a bath for a bath-time fan, boarding for a
   family who boarded). Each contact is one per family per 3 active days (a thank-you once per visit); a small number
   of free calls per active day; staff (a receptionist) can take an outreach workload. The family's answer is decided
   once (seeded by family and day, so re-trying doesn't re-roll) and is a **booking**, never coins.
4. **Campaigns** become defined activities (game coins up front, one at a time): they reach a stated number of
   households (or your inactive families, or your happy regulars) per active day for their days; each day's responses
   are drawn in the simulation and become bookings. An enquiry the daycare can't serve (no playroom for that kind, no
   boarding bed, no bath room) is **declined and recorded as unmet demand** — it never becomes a stranded pup.
   Campaigns: Local flyers / Online ads / Open house (first-time families), Welcome-back letters (inactive families),
   Boarding awareness (overnight guests), Bath promotion (families who'd book a bath — no discount), Referral outreach
   (happy regulars recommend you). Each card shows cost, who it targets, days, an estimated response range ("not
   guaranteed"), and readiness (rooms, equipment, staff) — a full or unready daycare says so before you pay. The old
   arrival multiplier is removed: natural arrivals stay exactly as they were without a campaign.
5. **Results**: every visit has one source; at a completed paid visit its service revenue and direct costs (that
   visit's supplies and any refund) go to that source only. Each campaign run shows coins spent, families reached,
   responses, arrivals, completed paid visits, attributed revenue, direct costs, and contribution after the campaign's
   cost — not "profit" (wages and upkeep are shown apart as overhead). Next to it: walk-in first-time families per day
   with and without a campaign (a comparison, not proof). Also: new vs returning families, regulars, inactive
   families, unmet demand by service and pup kind, and why families were turned away.
6. **A Marketing screen** from the main daycare (Customers · Campaigns · Results). In the first session the guide's
   goals point at one retention decision: thank your first families (free) — a booking may follow.

Rules kept: game coins only; no discounts, credit, cash or real messages; no random paid prizes; dogs always safe;
nothing advances while away; daycare, boarding and baths only.
