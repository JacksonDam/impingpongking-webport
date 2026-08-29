#!/bin/sh
# frozen screenshot of the port -> shots/<name>.png
# usage: ./shot.sh <name> ["<query>"] [waitms]
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
N="${1:-shot}"; Q="${2:-}"; MS="${3:-1200}"
mkdir -p shots
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --window-size=760,1348 --screenshot="shots/$N.png" \
  --virtual-time-budget="$MS" --allow-file-access-from-files \
  "file://$PWD/index.html?$Q" >/dev/null 2>&1
echo "shots/$N.png"
