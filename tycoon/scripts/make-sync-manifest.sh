#!/usr/bin/env bash
# Lists every file in tycoon/ that differs from the Lovable source this branch was imported from
# (Lovable commit c3a69bd = git commit 8eefe2e here), with its SHA-256, so a sync can be verified.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=8eefe2e
{
  echo "# PAWtastic Games — files to sync into the Lovable project (relative to the project root)"
  echo "# Source: github.com/pmichael415/pmichael415-pawtastic-game, folder tycoon/. Base: Lovable c3a69bd."
  echo "# Format: <sha256>  <path>. Deleted files: none. Never sync: .env, public/favicon.png, src/assets/daycare-room.jpg"
  # changed/added since the base, plus new files not committed yet (ignored files excluded)
  { git diff --name-only --relative --diff-filter=AM "$BASE" -- . ':!SYNC-MANIFEST.txt' ':!qa/out' ':!review/dist'
    git ls-files --others --exclude-standard -- . ':!SYNC-MANIFEST.txt' ':!qa/out' ':!review/dist'; } \
    | sort -u | while read -r f; do [ -f "$f" ] && sha256sum "$f"; done
} > SYNC-MANIFEST.txt
echo "wrote $(grep -vc '^#' SYNC-MANIFEST.txt) entries to SYNC-MANIFEST.txt"
