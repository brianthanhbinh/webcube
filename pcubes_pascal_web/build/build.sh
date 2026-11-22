#!/usr/bin/env sh
set -eu
command -v pas2js >/dev/null 2>&1 || { echo 'pas2js not found; install Pas2JS and add it to PATH.' >&2; exit 1; }
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"
pas2js -Tbrowser -Jc -Jirtl.js -dPCUBES_WEB -Fu"$ROOT/webcompat" -Fu"$ROOT/source" pcubes_web.pas -opcubes_web.js
