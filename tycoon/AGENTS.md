<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Game rules live as pure functions in src/game/engine.ts (tested in engine.test.ts); UI only calls them — keeps rules testable and consistent across Tycoon and Recess Rush.
- Guest progress is saved in localStorage only and must never contain paid entitlements — paid items may only be granted by a verified server-side webhook into an account-bound store.
- Paid product prices/currency come only from src/lib/catalog.ts; the webhook validates against it.
- Graduation Day in the hub: refresh public/graduation/index.html only with scripts/update-graduation.sh, from a build of this repo's game. It adds the `pawtastic-api` tag that lets the copy use Graduation Day's own server (Weekly Challenge, leaderboard, sign-in, live Shop) once that server allows the hub (docs/graduation-hub/). Without that permission the copy stays free play. Never point the tag anywhere else: src/net/embed.js allowlists the one address.
- Cloud saves are per game (public.game_saves: daycare, recess, graduation — see src/game/cloudSlots.ts), owner-only by RLS, free progress only; always validate (parseSlot) before loading. public.player_saves is the old single save, unused.
- Purchases are written only by the signed webhook via service-role-only SQL (migration 0009): public.grant_purchase (atomic event dedupe + checkout-session match; looks become entitlements, coins and power-ups become a delivery) and public.refund_purchase (looks switch off; consumables not yet collected are voided; collected ones get a reversal for the same installation). Clients may only read their own entitlements.
- Coins and power-ups reach a game only through reserve_deliveries / ack_deliveries for one (account, installation): the game writes the balance change and the delivery ids in one save write (under a Web Lock), and only then confirms. Never add bought items to a save any other way, and never copy them through cloud saves.
- Payments fail closed and are live-only: PAYMENT_MODE = "live" in src/lib/payments/verify.ts; paymentsConfig() requires a live key (sk_live_/rk_live_), PAYMENT_WEBHOOK_SECRET, an https APP_ORIGIN and STRIPE_EXPECTED_ACCOUNT (the games account); otherwise buy sheets say purchases are paused. Test-mode rows and events never count. "test" mode exists only in qa/stripe-test.
- Emails look like Graduation Day's (its src/lib/email-templates/layout.tsx): logo tile, DM Sans, brand blue #0068D6, reward gold #F6A823, warm page #FAF8F5; the hub's weekly email (src/lib/notify/email.ts) follows it, and its test checks.
- The purchase browser checks' stand-ins (qa/stubs, qa/mock-stripe.cjs) load only under `vite dev` with PAWTASTIC_E2E_STUB=1 (vite.config.ts); never import them from src.
- Cloud saves are written only via public.save_game_progress (per game, conditional on the device's last-seen revision); a mismatch pauses that game and asks the player — a stale device never overwrites newer progress, and one game never touches another.
- Paid cosmetic visuals render only from in-memory, freshly fetched server entitlements (src/lib/entitlements.tsx); localStorage stores equip preferences only — tampering can't confer ownership.
- Notifications (phone + email) send only owner-approved messages. All delivery rules live in migration 0007's service-role-only SQL functions (approval gate, once per subscription/email, at most 2 distinct messages per person per New York week); src/lib/notify/sender.server.ts adds quiet hours (20:00–09:00 New York) and never logs endpoints or addresses. Never insert a notify_messages row as approved without the owner's explicit yes.
- Daycare Tycoon (new engine, preview at /daycare-next): rules are pure functions in src/tycoon/ (build.ts, connect.ts, business.ts, run.ts, progress.ts, guide.ts, trophies.ts), tested in src/tycoon/*.test.ts; the UI and the 3D world (src/tycoon/render/) only call them. Its save is localStorage `pawtastic-daycare-next-v1`, separate from today's Daycare (`/daycare`, src/game/engine.ts), which is unchanged. Loading always goes through parseTycoon (drops only invalid rooms/items).
- Tycoon fairness rules (owner): game coins only, never real prices; no forced waiting or paying to skip; no paid random rewards; dogs stay safe with no money (calming down always works, even with no coins, no staff energy or no connected calm room); time away never costs anything (the day clock and day-end expenses run only while the daycare is open and on screen); below zero only pauses building/hiring/marketing — no loans, interest or automatic selling; trophies reward playing; checkout pays only from a playroom or boarding bed.
- Tycoon paid packs (Cloud Bed, Lighthouse Fort) count only while src/tycoon/paid.ts's in-memory owned set (filled from fresh server entitlements by the page) has the pack; never store ownership in the save.
- Music and sound: one shared engine, src/lib/audio/ (engine.ts, songs.ts, sfx.ts, instruments.ts), all synthesized with Web Audio — no audio files, no licensed or generated tracks. Tunes are original; never copy an existing game or song melody or a well-known sound (e.g. a famous coin chime). Audio waits for the player's first tap, follows the Sound and Music switches (and the header's mute button), and pauses in a hidden tab. Listen before shipping a change: `node qa/audio-preview.cjs` renders qa/out/audio-*.wav; `node qa/e2e-audio.cjs` checks what plays.
- Tycoon balance: src/tycoon/balance.test.ts plays a seeded first week; change prices/upkeep/XP only with it green and a ledger note.

## Sending a notification (owner approval required)
1. Draft (title ≤ 50, body ≤ 140, path like `/` or `/recess`; services named only daycare, boarding, baths, exit baths; no guilt or streak wording):
   `INSERT INTO notify_messages (kind, title, body, path, channels, send_at) VALUES ('weekly', '…', '…', '/', '{push}', (date_trunc('week', now() AT TIME ZONE 'America/New_York') + interval '7 days 10 hours') AT TIME ZONE 'America/New_York') RETURNING id;`
   (that `send_at` is next Monday 10:00 New York time; drafts are never sent).
2. Show the owner the exact text. Only after his explicit yes:
   `UPDATE notify_messages SET approved_at = now(), approved_by = 'Phil (owner), approved in chat', status = 'scheduled' WHERE id = '<id>';`
3. The database scheduler (drizzle/manual/notify_schedule.sql, pg_cron every 15 minutes) calls `/api/public/notifications/run`, which sends it. To cancel before it goes: `UPDATE notify_messages SET status = 'cancelled' WHERE id = '<id>' AND status = 'scheduled';`
- A test message for one person: set `kind = 'test'` and `audience_user = '<their user id>'`. Test messages don't count toward the weekly limit.
- Approved messages can't be edited (a database trigger refuses it): cancel and draft a new one.
- Each sender run claims people 20 at a time and stays within `NOTIFY_MAX_SUBREQUESTS` outgoing requests (default
  budget 40, safe for Cloudflare's free-plan limit of 50); a big audience is finished over several 15-minute runs. Raise
  the setting once the hosting plan's real limit is known.
- When the custom domain changes, update together: `notify_config.origin`, `src/lib/site.ts` PUBLIC_ORIGIN, `APP_ORIGIN`, and the Stripe webhook URL.
