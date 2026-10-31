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
- Cloud saves (public.player_saves) are owner-isolated by RLS and hold free progress only; always validate with parseSave on load.
- Paid entitlements are written only by the signed webhook via the service-role-only SQL function public.grant_entitlement (atomic event dedupe + checkout-session match); clients may only read their own rows.
- Payments fail closed: paymentsConfig() requires both STRIPE_SECRET_KEY (test key only) and PAYMENT_WEBHOOK_SECRET, plus APP_ORIGIN for checkout; otherwise buy buttons stay locked.
- Cloud saves are written only via public.save_player_progress (conditional on the device's last-seen revision); a mismatch pauses sync and asks the player — prevents stale devices overwriting newer progress.
- Paid cosmetic visuals render only from in-memory, freshly fetched server entitlements (src/lib/entitlements.tsx); localStorage stores equip preferences only — tampering can't confer ownership.
