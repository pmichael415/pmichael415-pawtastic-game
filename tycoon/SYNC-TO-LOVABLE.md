# Bringing this work into the Lovable project

This folder is a copy of the Lovable project **PAWtastic Daycare Tycoon**
(`acd6158e-ca42-414d-a979-e8b24d27b4b1`, imported from Lovable commit `c3a69bd`), developed and
tested here. The Lovable project is **not connected to GitHub**, so pushing here does not change it.

Every changed or new file is listed with its SHA-256 in `SYNC-MANIFEST.txt`
(regenerate with `scripts/make-sync-manifest.sh`). Nothing was deleted.

**Never overwrite** in Lovable: `.env`, `public/favicon.png`, `src/assets/daycare-room.jpg`
(the connector could not export those binaries; they are untouched).

## Option A — one Lovable agent message (uses Lovable credits)

Send this to the project's agent, replacing `<COMMIT>` with the commit to deploy:

> Sync code from GitHub without writing or changing any code yourself. Download
> https://codeload.github.com/pmichael415/pmichael415-pawtastic-game/tar.gz/<COMMIT> and extract it.
> From its `tycoon/` folder, copy every path listed in `tycoon/SYNC-MANIFEST.txt` into this project at
> the same relative path, overwriting existing files. Do not touch `.env`, `public/favicon.png` or
> `src/assets/daycare-room.jpg`. Then run `sha256sum -c` on the manifest lines (ignore lines starting
> with `#`) and report any mismatch. Run `bun install`, `bunx vitest run` and `bunx tsc --noEmit` and
> report the exact counts. Apply the new drizzle migrations `0002_game_measurement` and
> `0003_payment_refunds_hardening` (both are written to be safe to re-run). Do not publish, do not
> change visibility, do not add or change secrets, do not enable live payments.

## Option B — connect the Lovable project to GitHub

Lovable can sync a project with a GitHub repository (Project → GitHub). Once connected, pushing to the
connected branch updates the project. This needs the owner to connect it in the Lovable editor; it
creates/links a repository the owner chooses.

## After syncing

1. Open the preview and run through `/daycare` on a phone.
2. Payments stay locked until these are set in **Project Settings → Secrets** (never in chat):
   `STRIPE_SECRET_KEY` (test key, `sk_test_…`), `PAYMENT_WEBHOOK_SECRET` (`whsec_…`),
   `APP_ORIGIN` (the public https address) and `STRIPE_EXPECTED_ACCOUNT` (the `acct_…` id of the
   **PAWtastic Games** Stripe account, confirmed in the Stripe dashboard).
3. In Stripe **test mode**, add a webhook endpoint at `<APP_ORIGIN>/api/public/payments/webhook` for:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.

## Database migrations (already dry-run on the live game database)

`0002_game_measurement.sql` and `0003_payment_refunds_hardening.sql` were executed against the live
game database inside a transaction that was rolled back (nothing persisted). All checks passed: grant,
duplicate event, refund revocation, closed checkout, least-privilege grants, the restore policy and the
measurement views. The existing webhook code keeps working after 0003 (the new function parameter is
optional).
