# Season 1: Top Dog — pages that were already open ("old clients")

An *old client* is a copy of the game page that was loaded before the fixed build is published and is still running:
the audited season build (Graduation `7059416`, game `e152737`) or Lovable's hooked build (Graduation `8b5e0a8`), left
open in a browser tab or a Home Screen app. The hub's embedded copy (`/graduation` on play.pawtasticacademy.com) is
another copy: it changes only when the owner refreshes it with the hub's `scripts/update-graduation.sh`.

## How a player gets the new build

- The game has **no service worker and no "new version" check** (nothing in `src/` registers one). A page keeps running
  the code it loaded until it is reloaded.
- The fixed build reaches a player when they **reload**, or **open the game again** after the browser or phone discarded
  the page (a closed tab; iOS removing a Home Screen app from memory).
- Caching facts from the repositories: Graduation's `public/_headers` (at `8b5e0a8`) sets `Cache-Control: no-cache`
  only for `/owner-save-client.js` and `/owner-bridge.js`. Nothing in either repository sets a cache header for
  `/play/index.html` or `/staff/index.html`, so how long a browser may reuse a copy is the host's default, which these
  repositories do not show and which was not checked here. The game API's answers are `Cache-Control: no-store`
  (`src/lib/game/api.server.ts`), so an old page always gets the server's current answers.
- An old page does **not** pick up the new wording, clock handling or staff panel by itself.

## What an old page shows during the season (with the fixed server)

| | Old page | Fixed build |
|---|---|---|
| Rules page | The old season wording (two paragraphs, "Monday 9 November 2026 … under the rules below") **and** the ordinary weekly-prize paragraph ("When the week ends, the top 3 … a week without other prizes shown awards 1st place a free day of daycare …") | Only the owner-approved season paragraph; no weekly-prize paragraph |
| Chapter, board and countdowns | From the phone's clock: a phone that is hours or days off can show the wrong chapter or countdown and play a board the server then refuses (`week-over`). The server still decides: such a run is never counted for another chapter | The server's week and clock |
| Season prizes, lineup confirmed | The approved lineup, as today | The same |
| Season prizes, lineup not confirmed (the server sends `prizes: []`) | The old page ignores that answer and shows its general wording ("Win real PAWtastic prizes", "When the season ends, the top 3 at each location win real PAWtastic prizes."). It never shows the standard weekly prizes, and it never says "Season prizes are being confirmed" | "Season prizes are being confirmed." |
| After the end (awaiting the close, or blocked) | "Season 1: Top Dog · the season is over", "Thanks for playing! Winners hear from us in the game and by email." | "The season has ended — winners are being confirmed." |
| Team bar | Rounds each average before comparing: two averages that round to the same number show no leader, and it never says "Tied" | Leader on the unrounded averages; equal averages say "Tied" |
| Staff page left open | No season panel, no "Send pending emails" or "Close season now". Its text still says the season closes when the page is opened. If the server's staff `season` object no longer carries `chapter`, `chapters` and `ended`, the old staff page reads "Chapter undefined of undefined" and keeps the "before the end" wording after the end | The season panel (status, reason and details, lineup, winners, emails) and both buttons |

## Runs kept by an old page are not lost

- A run finished before sign-in is kept in `localStorage` under `pawtastic-gd-pending-run-v1` as
  `{"high-score": {"week", "moves", "challenge"}}` (the oldest builds kept a single `{week, moves}`). The fixed build
  reads both shapes unchanged and sends each run **with the week it was played in** (`tools/test-old-clients.mjs`).
- The High score run is still posted as the legacy body `{ week, moves }`; the server's answer is unchanged apart from
  the added `serverNow`.
- A kept run stays kept when the server can't be reached or answers with a server error; it is dropped only on the
  server's final answers (accepted, `week-over`, `bad-run`, `not-this-week`). The server accepts it while its chapter is
  still open (the acceptance boundary) and refuses it with `week-over` after that.
- One kept run per challenge: a newer finished run replaces an older kept one (unchanged behaviour).
- A signed-in player on an old page whose phone clock is wrong posts the phone's week straight away; the server refuses
  it (`week-over`) rather than count it for another chapter, so that run is not counted.
