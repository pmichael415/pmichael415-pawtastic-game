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
