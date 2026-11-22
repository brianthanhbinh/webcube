#!/usr/bin/env sh
set -eu

command -v pas2js >/dev/null 2>&1 || {
  echo 'pas2js not found; install Pas2JS and add it to PATH.' >&2
  exit 1
}

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RTL_DIR="${PAS2JS_RTL_DIR:-}"
PACKAGES_DIR="${PAS2JS_PACKAGES_DIR:-}"
FCL_XML_DIR="${PAS2JS_FCL_XML_DIR:-}"
FCL_BASE_DIR="${PAS2JS_FCL_BASE_DIR:-}"

if [ -z "$RTL_DIR" ] || [ ! -f "$RTL_DIR/system.pas" ]; then
  echo 'Pas2JS RTL not found. Set PAS2JS_RTL_DIR to the directory containing system.pas.' >&2
  exit 1
fi

if [ -z "$FCL_XML_DIR" ] || [ ! -f "$FCL_XML_DIR/dom.pp" ]; then
  echo 'FPC fcl-xml sources not found. Set PAS2JS_FCL_XML_DIR to the directory containing dom.pp.' >&2
  exit 1
fi

cd "$ROOT/web"

# Add the Pas2JS core RTL, FPC XML parser, and supporting package units.
RTL_FLAGS="-Fu$RTL_DIR -Fu$FCL_XML_DIR"
if [ -n "$FCL_BASE_DIR" ] && [ -d "$FCL_BASE_DIR" ]; then
  RTL_FLAGS="$RTL_FLAGS -Fu$FCL_BASE_DIR"
fi
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
