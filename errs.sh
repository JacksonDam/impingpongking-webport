#!/bin/sh
# dump every uncaught error the page hit: ./errs.sh "<query>" <ms>
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --window-size=760,1348 \
  --virtual-time-budget="${2:-6000}" --allow-file-access-from-files \
  --dump-dom "file://$PWD/index.html?$1" 2>/dev/null \
  | sed -n 's/.*<pre id="errs"[^>]*>\(.*\)<\/pre>.*/\1/p'
