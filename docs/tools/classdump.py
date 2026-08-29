#!/usr/bin/env python3
"""Dump an assembly's full type structure, C#-shaped.  The classdump.h analogue."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dnasm import load

TA = {0x0:'private',0x1:'public',0x2:'nested public',0x3:'nested private',
      0x4:'nested family',0x5:'nested assembly',0x6:'nested famandassem',0x7:'nested famorassem'}

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    a = load(path)
    only = sys.argv[2] if len(sys.argv) > 2 else None
    for t in a.types:
        if t.shortname == '<Module>': continue
        dn = a.display_name(t)
        if only and only.lower() not in dn.lower(): continue
        kind = ('enum' if t.is_enum else
                'interface' if t.flags & 0x20 else
                'struct' if t.base == 'System.ValueType' else 'class')
        bases = [b for b in ([t.base] if t.base and t.base not in
                 ('System.Object','System.ValueType','System.Enum') else []) + t.interfaces]
        head = '%s %s' % (kind, dn)
        if bases: head += ' : ' + ', '.join(bases)
        print('\n// token 0x%08X  flags 0x%X' % (t.token, t.flags))
        print(head + ' {')
        if t.is_enum:
            for f in t.fields:
                if f.literal: print('    %s = %s,' % (f.name, f.const))
        else:
            for f in t.fields:
                mods = 'static ' if f.static else ''
                if f.literal: mods = 'const '
                extra = ' = %r' % (f.const,) if f.const is not None else ''
                print('    %s%s %s%s;' % (mods, f.ftype, f.name, extra))
            if t.fields and t.methods: print()
            for m in t.methods:
                n = len(m.body()) if m.rva else 0
                print('    %s;%s' % (m.sig(), '' if not m.rva else
                      '   // rva 0x%X, %d insn' % (m.rva, n)))
        print('}')

if __name__ == '__main__':
    main()
