# PAWtastic Academy: Graduation Day

**Play it:** https://pawtastic-graduation.lovable.app

A free match-3 game for PAWtastic Academy. Players enrol their dog and work through five areas named after the real
services: Orientation, Recess Yard (daycare), Ivy-League Spa, Dorms & Graduate Suites (boarding) and Graduation.

## Where this code came from

This copy was recovered on 31 October 2026 from the claude.ai artifact "PAWtastic Academy: Graduation Day", because
the full git backup (`pawtastic-game.bundle`, with the tests, notes and history) was not available. Every file was
checked byte for byte against the artifact. When the backup turns up, restore it here and keep this copy on a branch.

Not in this copy (they were never in the artifact): the automated tests, `src/net/supabase-api.js` and the
`server/` folder that the customer (sign-in) version needs.

## Two versions in one codebase

- **Public free-play site** (what is live on Lovable). `index.html` carries
  `<meta name="pawtastic-release" content="free-play">`, which turns off demo purchases, the Pup Pass and the Treat Jar.
  Those screens say "Coming soon", so nothing on the public site looks like a real charge or a real prize.
  Progress is saved in the player's browser. The sound menu (speaker button) links to a short "Game rules & privacy"
  page written for this version (`src/ui/screens/rules.js`).
- **claude.ai demo**: the same code without that line, with simulated purchases and the demo Treat Jar.
- **Customer version (server mode)**: built with `VITE_BACKEND=server`; players sign in through
  app.pawtasticacademy.com. Not ready yet: see "Not in this copy" above.

## How the Lovable site is put together

- `dist/index.html` is the whole game in one file (scripts, styles, fonts and logo inlined), built with
  `npm install && npm run build:single`. Rebuild it after changing anything in `src/` or `index.html`.
- In the Lovable project "PAWtastic Graduation" it lives at `public/play/index.html`, next to the music in
  `public/play/static/audio/`. The home page (`src/routes/index.tsx`) sends visitors straight to `/play/index.html`.
- To update the live game: rebuild `dist/index.html`, push it here, then ask the Lovable agent to download the new
  file from this repo's raw URL into `public/play/index.html` unchanged (and check its sha256), then publish.
  The Lovable project is not linked to GitHub, so pushing here alone does not change the site.

## Music

Made with Creative Claw (ElevenLabs Music and Sound Effects) on 31 October 2026. The game expects these files in
`static/audio/` next to the page; they are kept in the Lovable project rather than here:

| File | What it is | Creative Claw asset |
|---|---|---|
| `map-theme.mp3` | Map background loop, 60 s | 35679683-5d6f-4d59-9c8b-ef2a3ab04b98 |
| `level-theme.mp3` | In-level background loop, 60 s | 6d9a472a-dc66-491f-b804-63e97027b80d |
| `graduation-jingle.mp3` | Level-complete fanfare, 5 s | 696ef3ef-5552-4310-8a71-e6a42dd762ac |
| `jar-fanfare.mp3` | Treat Jar win flourish, 4 s (Treat Jar is off on the public site) | dee31eee-540e-4068-8f83-4047f4de7d8e |
| `happy-bark.mp3` | Happy bark on the results screen, 1.5 s | 2012fa1b-4a60-4c6d-97a0-d52aad295016 |

Sound effects (matches, swaps, boosters) need no files: the game synthesizes them (`src/audio/sfx.js`).

## Running it locally

Serve the folder with any static web server, for example `python3 -m http.server`, and open `/index.html`.
Add `?debug=1` for staff tools (for example `?debug=1&odds=1` forces a Treat Jar win in the demo).
