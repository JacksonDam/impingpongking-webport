#!/usr/bin/env python3
"""Query analysis/scene.json: resolve GameObject names and print components."""
import json, os, sys, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(root, 'analysis', 'scene.json')))

def build(fn):
    objs = S[fn]
    go = {int(k): v for k, v in objs.items() if v.get('_class') == 'GameObject'}
    tr = {int(k): v for k, v in objs.items() if v.get('_class') in ('Transform', 'RectTransform')}
    comp = {int(k): v for k, v in objs.items()
            if v.get('_class') == 'MonoBehaviour'}
    go_tr = {v['gameObject']: k for k, v in tr.items()}
    def path(gid, depth=0):
        n = go.get(gid, {}).get('name', '?')
        t = tr.get(go_tr.get(gid))
        if t and t.get('father') and depth < 20:
            fgo = tr.get(t['father'], {}).get('gameObject')
            if fgo: return path(fgo, depth+1) + '/' + n
        return n
    return objs, go, tr, comp, go_tr, path

def main():
    fn = sys.argv[1] if len(sys.argv) > 1 else 'level1'
    pat = sys.argv[2] if len(sys.argv) > 2 else None
    objs, go, tr, comp, go_tr, path = build(fn)
    for pid, c in sorted(comp.items()):
        script = c.get('script') or ''
        p = path(c['gameObject'])
        if pat and pat.lower() not in (script + ' ' + p).lower(): continue
        if 'data' not in c and not any(k in c for k in ('sprite', 'text')): 
            if pat is None: continue
        print('--- #%d %s   %s' % (pid, script, p))
        d = c.get('data', {})
        for k, v in d.items():
            print('      %-26s %s' % (k, json.dumps(v)[:170]))
        if 'sprite' in c: print('      %-26s %s' % ('sprite', c['sprite']))
        if 'text' in c:   print('      %-26s %r' % ('text', c['text']))

if __name__ == '__main__':
    main()
