#!/usr/bin/env bash
# Refreshes the embedded copy of Graduation Day (public/graduation/index.html) from a built
# single-file Graduation Day page — normally the one the PAWtastic Graduation Lovable project serves at
# public/play/index.html (its newest build), or this repo's ../dist/index.html.
# Usage: scripts/update-graduation.sh <path-to-built-index.html>
# Changes made to the copy (nothing else):
#  1. the install-manifest link is dropped (the hub isn't that app's install target);
#  2. one style rule hides the parts that need Graduation Day's own server or would mislead inside the hub:
#     the "Add to Home Screen" card, the Weekly Challenge prize card (scores can't reach its leaderboard
#     from here, so no one here could win) and "Invite friends" (needs Graduation Day sign-in; the hub has
#     its own Invite). Music: copy public/play/static/audio/*.mp3 to public/graduation/static/audio/.
set -euo pipefail
src="${1:?path to a built Graduation Day index.html}"
cd "$(dirname "$0")/.."
grep -q 'content="free-play"' "$src" || { echo "refusing: not a free-play build" >&2; exit 1; }
for cls in install-card weekly-card invite-btn; do
  grep -q "$cls" "$src" || { echo "refusing: class $cls not found — check what the hub should hide in this build" >&2; exit 1; }
done
node -e '
const fs = require("fs");
const [src, out] = process.argv.slice(1);
let html = fs.readFileSync(src, "utf8").replace(/<link rel="manifest" href="\/manifest.webmanifest">\n?/, "");
const style = "<style data-hub-embed>/* PAWtastic Games hub copy: parts that need Graduation Day\u0027s own server are hidden (tycoon/scripts/update-graduation.sh) */ .install-card,.weekly-card,.invite-btn{display:none!important}</style>";
if (!html.includes("</head>")) { console.error("no </head>"); process.exit(1); }
html = html.replace("</head>", style + "</head>");
fs.writeFileSync(out + ".tmp", html);
fs.renameSync(out + ".tmp", out);
' "$src" public/graduation/index.html
grep -q 'data-hub-embed' public/graduation/index.html || { echo "failed to add the hub style" >&2; exit 1; }
sha256sum "$src" public/graduation/index.html
