#!/usr/bin/env sh
set -eu

command -v pas2js >/dev/null 2>&1 || {
  echo 'pas2js not found; install Pas2JS and add it to PATH.' >&2
  exit 1
}

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RTL_DIR="${PAS2JS_RTL_DIR:-}"
PACKAGES_DIR="${PAS2JS_PACKAGES_DIR:-}"

if [ -z "$RTL_DIR" ] || [ ! -f "$RTL_DIR/system.pas" ]; then
  echo 'Pas2JS RTL not found. Set PAS2JS_RTL_DIR to the directory containing system.pas.' >&2
  exit 1
fi

cd "$ROOT/web"

# Add the Pas2JS core RTL and package units to the compiler search path.
RTL_FLAGS="-Fu$RTL_DIR"
if [ -n "$PACKAGES_DIR" ] && [ -d "$PACKAGES_DIR" ]; then
  RTL_FLAGS="$RTL_FLAGS -Fu$PACKAGES_DIR/*"
fi

if [ -f "$RTL_DIR/rtl.js" ]; then
  cp "$RTL_DIR/rtl.js" ./rtl.js
elif [ -f "$PACKAGES_DIR/rtl/rtl.js" ]; then
  cp "$PACKAGES_DIR/rtl/rtl.js" ./rtl.js
else
  echo 'rtl.js was not found in the Pas2JS RTL checkout.' >&2
  exit 1
fi

# Keep each -Fu as its own argument.
# shellcheck disable=SC2086
pas2js -Tbrowser -Jc -Jirtl.js -dPCUBES_WEB \
  -Fu"$ROOT/webcompat" -Fu"$ROOT/source" $RTL_FLAGS \
  pcubes_web.pas -opcubes_web.js
