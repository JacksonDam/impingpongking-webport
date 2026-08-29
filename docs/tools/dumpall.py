#!/usr/bin/env python3
"""Decompile every type into analysis/src/<Type>.cs (SDK namespaces skipped)."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dnasm import load
from decomp import Decompiler

SKIP = ('GoogleMobileAds','GameAnalyticsSDK','Facebook','Fabric','CUDLR','SimpleJSON',
        'MiniJSON','NOGCloudData','System.','LeanTween','LTDescr','LTRect','LTGUI',
        'LTSpline','LTBezier','LTEvent','LTUtility','TweenAction','LeanTweenType','SpeedType')

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'analysis', 'src')
    os.makedirs(out, exist_ok=True)
    a = load(); d = Decompiler(a)
    n = 0
    for t in a.types:
        if t.shortname == '<Module>': continue
        dn = a.display_name(t)
        if any(dn.startswith(s) for s in SKIP): continue
        if '/' in dn: continue                       # nested: emitted with the outer type
        fn = os.path.join(out, re.sub(r'[^A-Za-z0-9_.`]', '_', dn) + '.cs')
        with open(fn, 'w') as f:
            def emit(t, indent=''):
                kind = ('enum' if t.is_enum else 'interface' if t.flags & 0x20 else
                        'struct' if t.base == 'System.ValueType' else 'class')
                bases = [b for b in ([t.base] if t.base and t.base not in
                         ('System.Object','System.ValueType','System.Enum') else []) + t.interfaces]
                f.write('%s%s %s%s {  // token 0x%08X\n' % (indent, kind, a.display_name(t),
                        (' : ' + ', '.join(bases)) if bases else '', t.token))
                if t.is_enum:
                    for fl in t.fields:
                        if fl.literal: f.write('%s    %s = %s,\n' % (indent, fl.name, fl.const))
                else:
                    for fl in t.fields:
                        mods = 'const ' if fl.literal else ('static ' if fl.static else '')
                        ex = ' = %r' % (fl.const,) if fl.const is not None else ''
                        f.write('%s    %s%s %s%s;\n' % (indent, mods, fl.ftype, fl.name, ex))
                    for m in t.methods:
                        f.write('\n%s    // rva 0x%X  token 0x%08X\n' % (indent, m.rva, m.token))
                        f.write('%s    %s {\n' % (indent, m.sig()))
                        for line in d.run(m):
                            f.write('%s    %s\n' % (indent, line))
                        f.write('%s    }\n' % indent)
                # nested
                for nt in a.types:
                    if a.enclosing.get(nt.row._rid) == t.row._rid:
                        f.write('\n')
                        emit(nt, indent + '    ')
                f.write('%s}\n' % indent)
            emit(t)
        n += 1
    print('wrote %d files to %s' % (n, out))

if __name__ == '__main__':
    main()
