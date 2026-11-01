# Bringing this work into the Lovable project

This folder is a copy of the Lovable project **PAWtastic Daycare Tycoon**
(`acd6158e-ca42-414d-a979-e8b24d27b4b1`, imported from Lovable commit `c3a69bd`), developed and
tested here.

**Since 1 Nov the Lovable project is linked to GitHub `pmichael415/pawtastic-daycare-tycoon` (branch `main`).**
To update it (no Lovable credits): copy every path in `SYNC-MANIFEST.txt` from this folder into that repository,
check the fingerprints, run the type check / tests / build there, and push to `main`. Don't push while Lovable's
agent is mid-job. New database migrations must also be applied (each in a transaction, recorded in
`drizzle.__drizzle_migrations` with the file's sha256 and its journal `when`). Publishing stays the owner's call.
The options below were the routes used before the link existed.

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
> report the exact counts. Apply the new drizzle migrations `0002_game_measurement`,
> `0003_payment_refunds_hardening`, `0004_referrals` and `0005_teams` (all are written to be safe to
> re-run). Do not publish, do not change visibility, do not add or change secrets, do not enable live
> payments.

## Option B — connect the Lovable project to GitHub

Lovable can sync a project with a GitHub repository (Project → GitHub). Once connected, pushing to the
connected branch updates the project. This needs the owner to connect it in the Lovable editor; it
creates/links a repository the owner chooses.

## After syncing

1. Open the preview and run through `/daycare` on a phone.
2. Payments use **the same Stripe account as Graduation Day**: the separate games account, Pawtastic Academy II LLC
   (`acct_1UWfxx58XGeAL8Pr`), never the daycare's accounts. Hub checkouts are tagged `game=pawtastic-games-hub`
   (checkout and payment) and named "PAWtastic Games · …"; Graduation Day's are tagged `game=pawtastic-graduation`.
   Each game's server ignores the other's notifications. The hub's checkout is **test mode only** until live
   activation is authorized (a code change, on purpose).
   Payments stay locked until these are set in **Project Settings → Secrets** (never in chat):
   `STRIPE_SECRET_KEY` (the games account's **test** key, `sk_test_…`), `PAYMENT_WEBHOOK_SECRET` (`whsec_…`, step 3),
   `APP_ORIGIN` (the public address, e.g. `https://play.pawtasticacademy.com`) and `STRIPE_EXPECTED_ACCOUNT`
   (`acct_1UWfxx58XGeAL8Pr`). The hub checks the key really belongs to that account before any checkout.
3. Publish, then in the games account's Stripe dashboard (**test mode**) add a webhook endpoint at
   `<APP_ORIGIN>/api/public/payments/webhook` for: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`. Save its signing secret as `PAYMENT_WEBHOOK_SECRET`.

## Graduation Day inside the hub

`public/graduation/index.html` is the Graduation Day build the PAWtastic Graduation project serves at
`public/play/index.html` (currently sha256 `18d4200c…`, identical to this repo's `dist/index.html`), with two changes
made by `scripts/update-graduation.sh`: the install-manifest link is dropped, and one style rule hides the parts that
need Graduation Day's own server or would mislead inside the hub (the "Add to Home Screen" card, the Weekly
Challenge prize card and "Invite friends"). Its music is in `public/graduation/static/audio/` (copied from the
Graduation project). When Graduation Day changes, run `scripts/update-graduation.sh <built index.html>` and sync.
The Graduation project itself is not changed by any of this.

## Database migrations (already dry-run on the live game database)

`0002_game_measurement.sql`, `0003_payment_refunds_hardening.sql`, `0004_referrals.sql` and `0005_teams.sql` were executed against the live
game database inside a transaction that was rolled back (nothing persisted). All checks passed: grant,
duplicate event, refund revocation, closed checkout, least-privilege grants, the restore policy and the
measurement views. The existing webhook code keeps working after 0003 (the new function parameter is
optional).

## Notifications release order (migration 0007)

1. Apply `drizzle/migrations/0007_notifications.sql` on the Daycare database **before** publishing: the new event names
   (notify_prompt, notify_optin, notify_open, email_optin) are rejected by the old `game_events` check, which would drop
   whole event batches.
2. Publish.
3. Apply `drizzle/manual/notify_schedule.sql` (pg_cron + pg_net, every 15 minutes). It waits until the notification
   keys exist; the server creates them the first time anyone taps "Notify me".
4. Email updates stay off until `NOTIFY_EMAIL_ENABLED=true`, `NOTIFY_MAILING_ADDRESS` and an email service
   (`src/lib/notify/email-transport.server.ts`) are set up — owner gates.
