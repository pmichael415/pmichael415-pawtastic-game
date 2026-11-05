# Season 1: Top Dog — design (Graduation Day challenge + PAWtastic Games hub)

Owner decisions (Phil, in chat, 5 Nov 2026), in his words where possible:
- "Change it to monthly challenges" → **everything monthly from 1 Dec** (challenge, leaderboard, prizes, team challenge,
  the check-in).
- "One long round, 9 Nov–5 Dec", ending **Sat 5 Dec, 11:59 pm New York**.
- "Something like Fortnite, like a season, to get customers in both locations engaged" → **a season**, named
  **Season 1: Top Dog**.
- Prizes for it: the lineup he approved for the week of 9 Nov — **1st "A free night of boarding", 2nd "A free day of
  daycare and a free exit bath", 3rd "A free exit bath"**, top 3 at each location (up to 6 winners).
- He approved this design ("Approve, build it"): Phase 1 for Monday 9 Nov, badges by about 16 Nov; he is asked again
  before anything goes live and before each message is sent.

## What players get

1. **Four chapters.** Each week of the season is a chapter with its own fresh challenge layout, exactly as weeks work
   today ("Chapter 2 of 4"). Chapter 4 runs Mon 30 Nov – Sat 5 Dec.
2. **Season score** = the player's best score in each chapter, added up. Coming back each chapter counts; missing one
   only adds nothing. No streaks, no "you missed" wording.
3. **Season leaderboard** at each location (Hawthorne, Hillsdale), and an **all-locations** view.
4. **Team bar: Hawthorne vs Hillsdale** — the average of each location's top 10 season scores (fewer than 10 players:
   the average of those who played), so a busier location doesn't win by size. The winning team's players get a free,
   game-only **"Season 1 Champions"** badge.
5. **Prizes once, at the end** (Sat 5 Dec 11:59 pm New York): the approved lineup to the top 3 at each location. No
   prizes are awarded on the Sundays inside the season (15, 22, 29 Nov).
6. **Free season badges** (Phase 2): **Rookie / Pro / Legend** at season-score milestones. Cosmetic, earned by play,
   never sold, nothing random.
7. **What's shown**: "Season 1: Top Dog · ends Sat 5 Dec" with a countdown, the chapter, the player's season rank and
   the team bar — in Graduation Day and in the hub.
8. **Messages** (each approved by Phil before it's scheduled; the existing limits apply — at most 2 a week, quiet
   hours): a launch push Mon 9 Nov 10:00 New York, and a final-chapter push Mon 30 Nov.

## Rules kept

Engaged, not compelled: no streak or guilt wording, no paid random rewards, no pay-to-win (a season score comes only from
replayed, validated runs, as today), nothing sold that affects the season. Prizes are PAWtastic services only
(daycare, boarding, baths, exit baths), approved by Phil. Outside the season (before 9 Nov), weeks work exactly as
before. After 5 Dec: monthly seasons; Season 2's dates are Phil's decision.

## Implementation (from the code map, 5 Nov)

Where things live today:
- **Graduation Day server:** `/home/user/pawtastic-graduation`, branch `main`, which syncs to its Lovable project;
  the owner publishes it.
  - `src/lib/game/compete.server.ts`: submission, `closeWeeks`, `challengeInfo`, `leaderboard`, staff actions.
  - `src/lib/game/challenge-engine.js`: a generated bundle of the game engine; its `.d.ts` is hand-written.
  - Emails: `email-delivery.server.ts`, `game-prize.tsx`, `game-weekly-summary.tsx`.
- **The game's own source:** the root of `pmichael415/pmichael415-pawtastic-game`, on branch `claude/increment-2`
  (which nobody can reach to coordinate with; it's what Graduation `main` was last built from).
  - Engine: `src/engine/challenge.js`.
  - Client: `src/net/pay-api.js`, `src/ui/compete.js`, `src/ui/screens/challenge.js`, `leaderboard.js`,
    `collection.js`.
  - Staff page: `src/staff/main.js`.
  - Built with `tools/build-engine.mjs`, `npm run build:single` and `build:staff`, then copied to Graduation
    `public/play` and `public/staff`.
- **Hub:** `tycoon/` of the same repo.
  - `GraduationWeeklyCard.tsx`: static text.
  - The hub's own Team Hawthorne vs Team Hillsdale challenge: activity points in the hub's database, weekly.
  - `public/graduation/index.html`: an old copy of the game, refreshed only by `scripts/update-graduation.sh`.

Decisions:
1. **Season 1 is a constant in the engine**, so the server and the game agree:
   `SEASONS = [{ id: 's1', name: 'Season 1: Top Dog', weeks: ['2026-11-09','2026-11-16','2026-11-23','2026-11-30'],
   endsAt: '2026-12-06T04:59:59.999Z' }]` (Sat 5 Dec, 11:59:59 pm New York), with helpers `seasonFor(week)`,
   `chapterOf(week)` and `seasonEndsAt(season)`. No new table and no third unapplied migration. Monthly seasons from
   December can move this to a table later.
2. **Chapters are ordinary weeks.** Each keeps its own layout and its `game_weekly_scores` row, unchanged.
   - Season score = the sum of a player's chapter scores, hidden players left out.
   - Ties go to whoever reached their latest counted score first.
   - Rows are paged past the 1,000-row API limit.
   - **Season 1 plays the version 1 rules (the High score run) in every chapter.** The three-challenge format would
     need migration 0011 applied and scheduled before Monday 00:00, and switching mid-season would mix score scales.
3. **Location is fixed by the player's first run in the season.**
4. **Team bar** = the average of each location's top 10 season scores; with fewer than 10, the average of those who
   played.
5. **Submissions:** runs for a season week are refused after the season's end plus the usual 5-minute grace period
   ("week-over"). Chapter 4 ends Saturday, not Sunday.
6. **`challengeInfo`** returns a `season` field: `{ id, name, chapter, chapters, endsAt, prizes }`. During the season,
   the prizes come from the season's lineup (week `2026-11-09`) and `next` is null.
7. **`leaderboard`** gains `board=season` with the team bar. `board=weekly` stays as the chapter board, so old
   clients keep working.
8. **`closeWeeks` skips season weeks:** no weekly prizes, prize emails or summaries on 15, 22 or 29 Nov.
   - A new `closeSeason` runs first. When the season has ended and isn't closed yet, it:
     - awards the top 3 per location by season score the lineup of `2026-11-09`, using the existing `game_prizes`
       rows with `week = '2026-11-09'`, `expires_at` = the season end + 30 days;
     - writes `game_weeks('2026-11-09')`, which starts the prize emails and one owner summary;
     - marks the other three chapter weeks closed, with their summary marked sent.
   - Weeks outside the season work exactly as before.
9. **Wording:**
   - Prize email, summary email, `prizeCard` and staff page say "Season 1: Top Dog" for the season.
   - The game shows "Season 1: Top Dog · Chapter N of 4 · season ends Sat 5 Dec", with a countdown from the
     **server's** `endsAt`, the season leaderboard and the team bar.
   - Outside the season, the text stays as it is.
10. **Tests:** fix the clock in `compete.test.ts`, never relying on today's date, and cover:
    - season scores, ties and the team bar;
    - closing: nothing weekly inside the season, one award at the end, weeks outside unchanged;
    - submission refused after the end;
    - `challengeInfo` and `leaderboard` shapes;
    - the emails' wording.
11. **Branches:**
    - Game source: a new branch `claude/season-1`, cut from `origin/claude/increment-2` (that branch isn't
      touched).
    - Graduation Day: a branch `claude/season-1`, merged to `main` only with the owner's go-ahead (`main` syncs to
      Lovable).
    - Nothing is published by us; the owner publishes in Lovable.

**Deadlines:**
- **Launch target:** Mon 9 Nov, 10:00 New York (the launch message is sent only after the season is live, and only
  with his approval).
- **Hard deadline: Sun 15 Nov, 11:59 pm New York.** Until the new closing is live, today's code gives the 9 Nov lineup
  to week 1's top 3 at Mon 16 Nov 00:05.
- **Season close:** with no cron, the season closes on the first leaderboard, prizes or staff-page request after
  Sat 5 Dec 11:59 pm plus the 5-minute grace period. Staff should open the staff page on Sunday 6 Dec.

**Phase 2 (by about 16 Nov):**
- Rookie / Pro / Legend badges and the Champions badge.
- The hub's Graduation card shows the season (and the hub copy of the game is refreshed).
- The weekly check-in task becomes the season and monthly check-in.
