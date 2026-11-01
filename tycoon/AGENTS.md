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
- Cloud saves are per game (public.game_saves: daycare, recess, graduation — see src/game/cloudSlots.ts), owner-only by RLS, free progress only; always validate (parseSlot) before loading. public.player_saves is the old single save, unused.
- Paid entitlements are written only by the signed webhook via the service-role-only SQL function public.grant_entitlement (atomic event dedupe + checkout-session match); clients may only read their own rows.
- Payments fail closed: paymentsConfig() requires both STRIPE_SECRET_KEY (test key only) and PAYMENT_WEBHOOK_SECRET, plus APP_ORIGIN for checkout; otherwise buy buttons stay locked.
- Cloud saves are written only via public.save_game_progress (per game, conditional on the device's last-seen revision); a mismatch pauses that game and asks the player — a stale device never overwrites newer progress, and one game never touches another.
- Paid cosmetic visuals render only from in-memory, freshly fetched server entitlements (src/lib/entitlements.tsx); localStorage stores equip preferences only — tampering can't confer ownership.
- Notifications (phone + email) send only owner-approved messages. All delivery rules live in migration 0007's service-role-only SQL functions (approval gate, once per subscription/email, at most 2 distinct messages per person per New York week); src/lib/notify/sender.server.ts adds quiet hours (20:00–09:00 New York) and never logs endpoints or addresses. Never insert a notify_messages row as approved without the owner's explicit yes.

## Sending a notification (owner approval required)
1. Draft (title ≤ 50, body ≤ 140, path like `/` or `/recess`; services named only daycare, boarding, baths, exit baths; no guilt or streak wording):
   `INSERT INTO notify_messages (kind, title, body, path, channels, send_at) VALUES ('weekly', '…', '…', '/', '{push}', (date_trunc('week', now() AT TIME ZONE 'America/New_York') + interval '7 days 10 hours') AT TIME ZONE 'America/New_York') RETURNING id;`
   (that `send_at` is next Monday 10:00 New York time; drafts are never sent).
2. Show the owner the exact text. Only after his explicit yes:
   `UPDATE notify_messages SET approved_at = now(), approved_by = 'Phil (owner), approved in chat', status = 'scheduled' WHERE id = '<id>';`
3. The database scheduler (drizzle/manual/notify_schedule.sql, pg_cron every 15 minutes) calls `/api/public/notifications/run`, which sends it. To cancel before it goes: `UPDATE notify_messages SET status = 'cancelled' WHERE id = '<id>' AND status = 'scheduled';`
- A test message for one person: set `kind = 'test'` and `audience_user = '<their user id>'`.
- When the custom domain changes, update together: `notify_config.origin`, `src/lib/site.ts` PUBLIC_ORIGIN, `APP_ORIGIN`, and the Stripe webhook URL.
