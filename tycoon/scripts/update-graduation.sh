#!/usr/bin/env bash
# Refreshes the embedded copy of Graduation Day (public/graduation/index.html) from a built single-file
# Graduation Day page made from this repo's game (repo root: node tools/build-single.mjs . dist/index.html).
# Older builds (without src/net/embed.js) are refused.
# Usage: scripts/update-graduation.sh <path-to-built-index.html>
# Changes made to the copy (nothing else):
#  1. the install-manifest link is dropped (the hub isn't that app's install target);
#  2. <meta name="pawtastic-api" content="https://pawtastic-graduation.lovable.app">: the game uses Graduation
#     Day's own server for sign-in, the Weekly Challenge, the leaderboard and the Shop (src/net/embed.js
#     allowlists that one address). That server must allow the hub's address (docs/graduation-hub/); until it
#     does, the game can't reach it and stays free play, exactly as before;
#  3. one style rule hides what doesn't belong inside the hub: the "Add to Home Screen" card, "Invite friends"
#     (the hub has its own Invite) and, while the server can't be reached, the Weekly Challenge card (the game
#     marks <html class="server-on"> once it can). Music: copy public/play/static/audio/*.mp3 to
#     public/graduation/static/audio/.
set -euo pipefail
src="${1:?path to a built Graduation Day index.html}"
cd "$(dirname "$0")/.."
grep -q 'content="free-play"' "$src" || { echo "refusing: not a free-play build" >&2; exit 1; }
grep -q 'pawtastic-api' "$src" || { echo "refusing: this build can't use Graduation Day's server from the hub (rebuild from the game repo)" >&2; exit 1; }
grep -q 'server-on' "$src" || { echo "refusing: this build never marks server-on (rebuild from the game repo)" >&2; exit 1; }
for cls in install-card weekly-card invite-btn; do
  grep -q "$cls" "$src" || { echo "refusing: class $cls not found — check what the hub should hide in this build" >&2; exit 1; }
done
node -e '
const fs = require("fs");
const [src, out] = process.argv.slice(1);
let html = fs.readFileSync(src, "utf8").replace(/<link rel="manifest" href="\/manifest.webmanifest">\n?/, "");
const api = "<meta name=\"pawtastic-api\" content=\"https://pawtastic-graduation.lovable.app\">";
const style = "<style data-hub-embed>/* PAWtastic Games hub copy (tycoon/scripts/update-graduation.sh) */ .install-card,.invite-btn{display:none!important} html:not(.server-on) .weekly-card{display:none!important}</style>";
if (!html.includes("</head>")) { console.error("no </head>"); process.exit(1); }
html = html.replace("</head>", api + style + "</head>");
fs.writeFileSync(out + ".tmp", html);
fs.renameSync(out + ".tmp", out);
' "$src" public/graduation/index.html
grep -q 'data-hub-embed' public/graduation/index.html || { echo "failed to add the hub style" >&2; exit 1; }
grep -q '<meta name="pawtastic-api" content="https://pawtastic-graduation.lovable.app">' public/graduation/index.html || { echo "failed to add the server address" >&2; exit 1; }
sha256sum "$src" public/graduation/index.html
