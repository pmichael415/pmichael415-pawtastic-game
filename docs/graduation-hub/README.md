# Graduation Day's Weekly Challenge, leaderboard and Shop inside the hub

The PAWtastic Games hub plays a copy of Graduation Day at `/graduation`. Until now that copy was free play only:
the Weekly Challenge card was hidden, nobody could sign in, and the Shop said "coming soon". The game needs
Graduation Day's own server for all of those, and that server only answers its own site.

This change lets the hub's copy use Graduation Day's server, so players in the hub can:

- play the Weekly Challenge, with scores replayed on the server and counted for this week's prizes;
- see the leaderboard;
- sign in with their Graduation Day email code (a separate sign-in from the hub's own, for now);
- buy in the Shop. **This is Graduation Day's live Stripe store, so these are real purchases** on the games
  Stripe account (acct_1UWfxx58XGeAL8Pr). Stripe Checkout opens in the whole tab, then returns the buyer to the
  hub's Graduation page, where the purchase is added.

## Two parts

**1. The hub and the game (done, in this repo).**
- `src/net/embed.js`: the game reads `<meta name="pawtastic-api">` and accepts only
  `https://pawtastic-graduation.lovable.app`. Checkout and billing open outside the frame.
- `tycoon/scripts/update-graduation.sh` adds that tag to the hub copy. The Weekly Challenge card shows only when the
  server answers (`<html class="server-on">`).
- `tycoon/src/routes/graduation.tsx` hands Stripe's return and the email sign-in link to the game, and shows the
  "on Graduation Day's site" link only while the server can't be reached.

**2. Graduation Day's server (`graduation-hub.patch`, NOT applied yet).** This needs a change in the
`pmichael415/pawtastic-graduation` repository (Lovable project f53c6548). It does three things:
- new `src/lib/game/hub.ts`, which allows exactly three hub addresses to call `/api/public/game/*` from a browser:
  - `https://paw-sitive-playhouse-rush.lovable.app`
  - `https://id-preview--acd6158e-ca42-414d-a979-e8b24d27b4b1.lovable.app`
  - `https://play.pawtasticacademy.com`

  Staff routes (`/api/public/game/staff*`) and the Stripe webhook stay closed to them;
- `src/server.ts` answers the browser's permission check from those addresses and adds the permission header to
  their game API answers;
- `src/lib/game/checkout.server.ts`: a purchase started in the hub returns to `<hub>/graduation`. Purchases
  started on Graduation Day's own site return to `/play/index.html` as before. `approvedOrigin` is unchanged.

Sign-in is a bearer token, never a cookie, so allowing these addresses doesn't let any page act for a player who
didn't sign in on it. Return addresses can only ever be one of the three hub addresses or Graduation Day's own site.

Until part 2 is live, nothing changes for players: the game in the hub can't reach the server and stays free play.
This is the same as today. The two parts can be published in either order.

## Applying part 2

Either:
- allow this Claude Code session to push to `pmichael415/pawtastic-graduation`. The session's permission check
  refused that, so it needs a permission rule for the `add_repo` tool or your approval when asked; or
- in a checkout of that repository: `git apply graduation-hub.patch`, run `bunx vitest run` (the new
  `src/lib/game/hub.test.ts` has 5 tests), then commit and push (Lovable syncs from GitHub).

Then publish Graduation Day in Lovable, sync and publish the hub, and try one purchase from the hub.

Optional: in Graduation Day's Lovable Cloud auth settings, add `https://paw-sitive-playhouse-rush.lovable.app/graduation`
(and later `https://play.pawtasticacademy.com/graduation`) to the allowed redirect URLs. Then the link in the
sign-in email opens the hub instead of Graduation Day's site. Typing the code works either way.

## Tests

- `src/lib/game/hub.test.ts` (in the patch): 5 tests, passing against the current Graduation Day files.
- `tycoon/qa/e2e-graduation-hub.cjs`: 27 browser checks. `tools/mock-pay-server.mjs` with `MOCK_HUB_ORIGINS` acts as
  the patched server, and without it as today's server (the game must stay free play). Covered: Weekly Challenge
  replayed after signing in, leaderboard, checkout in the whole tab, return to the hub, Treats added once,
  a cancelled checkout, and the email sign-in link.

  Playwright answers the browser's permission check (OPTIONS) itself, so that check is covered by `hub.test.ts`
  and a direct request to the mock, not by the browser run.
- Graduation Day's own suites still pass: e2e-payments 35/35, e2e-compete 27/27, and the tools/test-*.mjs unit
  tests.
