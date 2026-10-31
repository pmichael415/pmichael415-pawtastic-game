#!/usr/bin/env bash
# Refreshes the embedded copy of Graduation Day (public/graduation/index.html) from a built
# single-file Graduation Day page — normally the one the PAWtastic Graduation Lovable project serves at
# public/play/index.html (its newest build), or this repo's ../dist/index.html.
# Usage: scripts/update-graduation.sh <path-to-built-index.html>
# The only change: the install-manifest link is dropped (the hub isn't that app's install target).
set -euo pipefail
src="${1:?path to a built Graduation Day index.html}"
cd "$(dirname "$0")/.."
grep -q 'content="free-play"' "$src" || { echo "refusing: not a free-play build" >&2; exit 1; }
sed '/<link rel="manifest" href="\/manifest.webmanifest">/d' "$src" > public/graduation/index.html
sha256sum "$src" public/graduation/index.html
