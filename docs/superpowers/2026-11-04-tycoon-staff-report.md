# New Daycare (`/daycare-next`) — staff, a living campus and the first expansion: report

Owner brief of 4 Nov. Design and plan: `docs/superpowers/specs/2026-11-04-tycoon-staff-expansion-design.md`.
Branch `claude/pawtastic-games-unified`, folder `tycoon/`, built on the audited service work (`09f3016`, `a1f7b18`).

**Status:** committed, pushed and tested here, and in the private preview (version 8). **Not in the Lovable hub
project and not published.** Stripe, purchases, DNS, app.pawtasticacademy.com and the other games were not touched.

## The scenario you asked for (verified in a browser, iPhone 13 and desktop sizes)

`qa/e2e-staff.cjs` plays this with the real UI and the real engine:

1. **Hire from the Team sheet:** a receptionist, a daycare attendant and a bath attendant.
   - Sign-on fees are charged once (250, 500 and 750).
   - The sheet shows the daily wages.
2. **A family arrives** with daycare + a bath.
   - The receptionist walks to the desk and checks Luna in. It takes 5 game minutes, not an instant.
   - Luna goes to the matching Small & Gentle playroom.
3. **The attendant plays with Luna.** In 3D the attendant stands beside her and Luna bounces. Her happiness rises.
4. **The bath attendant does the booked bath.**
   - Luna stands in a real tub, with the attendant beside it, for the full 40 game minutes.
5. **The family returns.** The receptionist sends Luna home.
   - The bill is daycare 78 + bath 35, each charged once.
   - Coins rose by exactly the bill, and a receipt appears.
6. **Wages come out of profit.**
   - The Today strip shows the day's wages (tonight's 160 plus the 1,500 in sign-on fees).
   - At 18:00 the day's ledger charges them, and the profit is income minus all costs.
7. **An expansion is bought and used.**
   - The card offers a Small & Active playroom wing for 540 coins.
   - The coins spent match the quote exactly.
   - The next Small & Active family is settled in the new wing by the receptionist, and the wing appears in 3D.
8. **A reload keeps everything:** the team, their roles, the wing, the pup in it, the coins and the visit record.

58/58 checks pass, including no page errors and no sideways scrolling on either size. Screenshots are in
`tycoon/qa/out/staff-*.png`.

## What's new

### 1. Staff who do real work
- **Roles:**
  - **Receptionist:** check-ins only when a matching spot or bed is free; routine pickups only. A family with a
    concern waits for you.
  - **Daycare attendant:** plays with pups who haven't played or are under 70% happy, and halves scuffle risk in
    their rooms.
  - **Bath attendant:** works the booked bath queue only, one pup per free tub.
  - **Cleaner:** mops the dirtiest of their rooms.
- **Phil, your founding partner,** still does whatever you tap. Hired staff do their role on their own.
- **Team sheet** (Team in the status bar):
  - hire by role, with the recommended role marked;
  - change role, rooms and priority (two choices per role, e.g. "Pickups first" or "Arrivals first");
  - each person's wage, energy and live status;
  - let someone go (their wage stops from that night).
- **Statuses** also show over their heads and in the staff panel (tap a person):
  - "Walking to the front desk", "Checking in Luna", "Bathing Luna — 12 min left", "Cleaning Playroom 2";
  - "Available", "On a break", "Off duty — the daycare is closed";
  - "Available — No free Large & Active spot for Bruno — needs you".
- **Rules they follow:**
  - Jobs take walking time plus work time.
  - Two people never take the same pup, tub, room or spot.
  - A job you overtake (you check the pup out, move it to the calm room, or take the tub) is dropped with a note.
  - No new jobs while closed or during the guided tour.
  - Staff use the same actions you do, so billing stays exactly-once.
- **Staff never decide** placements in mismatched rooms, complaints, exit baths, scuffles or prices.
- **One exception, found in testing:** a family with no matching spot is your call until they're upset (40
  minutes, after two warnings). Then the receptionist kindly reschedules them, which is free. Without this, a
  hands-off daycare's reputation sank to its floor of 40.

### 2. A living campus
- **Staff:** they walk door to door along real routes (never through walls; straight there if no route exists) and
  stand at their work: behind the desk, beside the pup, beside the tub, in the room.
- **Pups:**
  - a pup in the bath stands in its tub for the whole bath;
  - pups bounce while being played with, lie down in beds and the calm room, and sit while waiting.
- **Families** keep walking in for pickup and leaving.
- **Tapping:**
  - Tap a pup: its room and that room's cleanliness, its needs, its booked services, who's looking after it, and how
    long its family has waited.
  - Tap a person: their role, rooms, priority, wage and current task.
  - People can't be tapped while you're building.
- **Safety:** reduced motion keeps the same positions without walking animation. The 3D view only draws the game; it
  never changes it.

### 3. The first expansion
- **When:** from level 2, with two real options plus "Save for now".
- **Playroom wing:** a new 3×3 playroom for the size-and-temperament group most often waiting or turned away.
- **Bath station:** a bath room with a tub; with one already, a second tub.
- **Each option shows:**
  - the price in game coins (from a dry run of the real build);
  - the capacity added;
  - the staffing it needs;
  - the daily upkeep added;
  - what it makes possible.
- **Placement:** it's built next to an existing room with a door into it, and it works straight away.
- **A second purchase** improves the existing one rather than duplicating it.
- **"Expansion options"** stays in the objectives afterwards.
- **What the simulation shows (a seeded week with the same three staff, no player taps):**
  - with the playroom wing, profit is about +120 to +310 coins a day;
  - with a bath station and a bath attendant instead, about +30 to +70, because playroom space is still the limit.
  - So the choice is real.

### 4. Money, objectives and the first session
- **Today strip:** revenue so far, wages (tonight's plus any sign-on fees today), other costs, building when any,
  and the net. It's labeled game coins, and it matches the day report.
- **Objective bar (always):** one next objective and one longer-term goal.
  - **Next objective order:** open the daycare → fix what's blocking income → a family needs you → check out your
    first pup → **hire your first employee** (recommended role, sign-on and wage) → give staff a role → **choose
    your first expansion** → keep growing.
  - **Goal ladder:** a profitable day → a team of 3 and a bath station → level 6 with 2 playrooms ("ready to plan a
    second PAWtastic location").
- **Unchanged:** the guided tour (first arrival, check-in, care, checkout and the first upgrade), and the free
  recovery from the 44-coin stall.

### 5. Families kept waiting
- **At drop-off:** "waiting", "getting impatient" from 20 minutes, "upset" from 40 with a countdown. At 60 they take
  their pup home: upset, no charge, a reputation cost.
- **At pickup:** a complaint from 30 minutes, a warning at 45, and they leave at 60 (as before).
- **Warnings** show as chips on the pup's tag and panel, and as toasts.
- **Still free:** turning a family away and calm-room safety moves.
- **Never on load:** a pup saved at the desk in an older save counts as just arrived, so nobody leaves when a save
  loads.

### 6. Rooms
- Each room now has its own cleanliness. Pups dirty the room they're in.
- The Mop button still mops every room.
- A dirty-room complaint names the pup's room.

## Tests

| Check | Result |
|---|---|
| Unit tests | **883 / 883** |
| Typecheck | clean |
| New staff, room, bath, waiting, path, expansion and objective tests, the hands-off team week, and the Team UI | all pass (part of the 883) |
| `qa/e2e-staff.cjs`: the scenario on iPhone 13 and desktop sizes, plus the busy scene | **58 / 58** |
| Other browser suites, rerun | service 46/46 · onboarding 100/100 · hub 37/37 · games 35/35 · today's Daycare 36/36 · audio 17/17 · Tycoon 36/37 |
| Private preview build, under the preview's security rules | loads, quick start works, no page errors |

**The one Tycoon miss** is the frame-rate check: 28.8 fps against 30 with 12 rooms, 200 things and 30 pups, on this
machine's software renderer. It varies from run to run here (24.5–32 fps across this week's runs) and isn't specific
to this milestone.

**Busy scene** (desktop size, this machine's software graphics): 30 pups and 6 staff.
- 12–15 fps, 4–5 ms of drawing a frame, about 740 draw calls.
- The engine uses about 1.4 ms per second of play.
- The drawing is software-bound here. Real phones and computers with graphics hardware will differ, and haven't been
  measured.

**What's verified where:**
- Everything above ran in this session's Chromium only, with iPhone 13 and desktop emulation and software graphics.
- **No real iPhone, no Safari, no real graphics hardware, and no human playtest** took place.
- An attentive bot finishing the game is no evidence that beginners understand it.

## Manual test script (real iPhone, about 10 minutes)

Open the preview link on the iPhone in Safari, tap **Daycare (preview)**, then **Quick start**.

1. Follow the guide: tap Biscuit, check in, place, play, and check out. Expect a receipt with the bill and the
   reputation change.
2. The next objective should say **Hire your first employee — a receptionist**. Tap **Open Team** and hire one.
   - Expect "Team 2" in the status bar and the Today strip's wages to rise by 290 (250 sign-on + 40).
3. Leave the phone alone for a minute.
   - Expect the receptionist to walk to the desk when a family arrives, show "Checking in …", and settle the pup.
   - A family with no matching playroom should show "needs you"; check that you can still turn them away for free.
4. Tap the receptionist in the 3D view. Expect a panel with the role, the current task and the wage.
5. Tap a pup. Expect its room, cleanliness, needs, booked services and "Looked after by".
6. Play until level 2 (or wait). Expect **Choose your first expansion** with two options.
   - Build one and check it appears in 3D and gets used.
7. Pull to refresh (reload). Expect everything to be as you left it.
8. Note anything confusing, slow or hard to tap. The first-session timings are targets to check with real players.

## Not done yet (honest list)

- **Deeper relationships and events (brief part 5):** not built. The design (§9) says where they plug in:
  - returning families and personalities;
  - relationships from visit history;
  - birthdays, rain and referral surges;
  - staff absences and breakdowns, once players have tools to respond;
  - longer goals toward Hawthorne and Hillsdale;
  - decorations and shareable pictures.
- **Cleaning while you're away:** the cleaner and attendants work only while the game is on screen and open, like
  everything else (time away never costs anything).
- **Per-room cleanliness isn't on the map yet:** the HUD shows the daycare's average; the pup panel shows each room.
- **Staff don't carry pups:** the bath attendant walks to the tub, and the pup appears there when the bath starts (one
  walking leg, not two).
- **Unverified:** real iPhone Safari, real graphics hardware and human playtesting.
- **Not published:** releasing it to the live hub is your decision, along with the earlier held releases.
