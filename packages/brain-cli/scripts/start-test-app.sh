#!/bin/sh
# Boot a test app the way a deployed brain boots: the bundled CLI, run from
# the app's own directory so its .env loads and its brain.yaml is the one in
# use. Usage: sh scripts/start-test-app.sh <app>
set -e
app="$1"
if [ -z "$app" ] || [ ! -f "test-apps/$app/brain.yaml" ]; then
  echo "usage: sh scripts/start-test-app.sh <app>  (one of test-apps/*)" >&2
  exit 1
fi
# The UI build runs turbo, which otherwise reports telemetry to Vercel.
export TURBO_TELEMETRY_DISABLED=1
bun run build:ui
bun scripts/build.ts
cd "test-apps/$app"
# A seed outside this repository reaches the app only through a remote built
# from a copy with every agent withheld.
bun ../../scripts/prepare-test-app-remote.ts
INIT_CWD="$PWD" exec bun --no-orphans ../../dist/brain.js start
