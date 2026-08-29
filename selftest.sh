#!/bin/sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --virtual-time-budget="${1:-30000}" \
  --allow-file-access-from-files --window-size=760,1348 \
  --dump-dom "file://$PWD/index.html?selftest=1" 2>/dev/null |
python3 -c "
import sys,re,html
s=sys.stdin.read()
m=re.search(r'<pre id=\"selftest\"[^>]*>(.*?)</pre>', s, re.S)
print(html.unescape(m.group(1)) if m else 'NO SELFTEST OUTPUT')
"
