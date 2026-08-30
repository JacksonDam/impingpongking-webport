#!/usr/bin/env python3
"""Extract constant array initialisers from a method body.

C# compiles `new[]{a,b,c}` to newarr + a run of dup/ldc/stelem, and assigns the
result with stfld.  Walking the IL recovers the array and the field it lands in,
which is where several of this game's tables live (the opponent roster, the
things each rival says when beaten, and their on-screen positions).

Three shapes, not one, and missing either of the last two silently yields an
empty list:
  reference elements   dup / ldc.i4 idx / ldstr / stelem.ref
  struct elements      dup / ldc.i4 idx / ldelema T / ...values / newobj / stobj
  primitive elements   dup / ldtoken <PrivateImplementationDetails>::$field-...
                       / call RuntimeHelpers::InitializeArray   -- the payload
                       lives at the field's FieldRVA, not in the IL at all.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dnasm import load

LD = {'ldc.i4.0': 0, 'ldc.i4.1': 1, 'ldc.i4.2': 2, 'ldc.i4.3': 3, 'ldc.i4.4': 4,
      'ldc.i4.5': 5, 'ldc.i4.6': 6, 'ldc.i4.7': 7, 'ldc.i4.8': 8, 'ldc.i4.m1': -1}


ELEM = {'System.Int32': ('i', 4), 'System.Single': ('f', 4), 'System.Byte': ('B', 1),
        'System.Int16': ('h', 2), 'System.Int64': ('q', 8), 'System.Boolean': ('?', 1)}


def field_rva_data(a, field_name):
    """Bytes behind a <PrivateImplementationDetails> initialiser field."""
    im = a.im
    rows = im.table(0x1D)
    if not rows: return None
    for r in rows:
        fi = r['Field']
        f = im.table(0x04)[fi - 1]
        if im.str_at(f['Name']) == field_name:
            off = im.rva2off(r['RVA'])
            return im.data[off:off + 4096]
    return None


def decode_primitive(ty, data, n):
    import struct as _s
    k = ELEM.get(ty)
    if not k or not n: return {}
    fmt, sz = k
    vals = _s.unpack_from('<%d%s' % (n, fmt), data, 0)
    return {i: (round(float(v), 5) if fmt == 'f' else v) for i, v in enumerate(vals)}


def extract(a, full):
    m = next((x for x in a.methods if x.full == full), None)
    if not m or not m.rva: return {}
    code = m.body()
    out, cur, arr = {}, None, None
    pend = []                                  # values seen since the last stelem
    last_int = 0                               # the length pushed just before newarr
    i = 0
    while i < len(code):
        ins = code[i]
        op, txt, arg = ins.op, ins.txt, ins.arg
        if op == 'newarr':
            arr = {'type': txt, 'items': {}, 'len': last_int}
            pend = []
        elif arr is not None and op == 'ldstr':
            pend.append(a.im.us_at(arg & 0xFFFFFF))
        elif op in LD or op in ('ldc.i4', 'ldc.i4.s'):
            v = LD[op] if op in LD else arg
            last_int = v
            if arr is not None: pend.append(v)
        elif arr is not None and op in ('ldc.r4', 'ldc.r8'):
            pend.append(round(float(txt), 5))
        elif arr is not None and op == 'newobj' and ('Vector3' in txt or 'Vector2' in txt):
            n = 3 if 'Vector3' in txt else 2
            v = pend[-n:] if len(pend) >= n else list(pend)
            del pend[len(pend) - len(v):]
            pend.append(list(v))
        elif arr is not None and op == 'ldtoken':
            arr['blob'] = txt.rsplit('::', 1)[-1]
        elif arr is not None and op == 'call' and 'InitializeArray' in (txt or ''):
            data = field_rva_data(a, arr.get('blob'))
            if data is not None:
                arr['items'] = decode_primitive(arr['type'], data, arr.get('len', 0))
            pend = []
        elif arr is not None and op.startswith('stelem'):
            if len(pend) >= 2:
                idx, val = pend[-2], pend[-1]
                if isinstance(idx, int): arr['items'][idx] = val
            pend = []
        elif arr is not None and op == 'stobj':
            if len(pend) >= 2:
                idx, val = pend[-2], pend[-1]
                if isinstance(idx, int): arr['items'][idx] = val
            pend = []
        elif arr is not None and op == 'stfld':
            name = txt.rsplit('::', 1)[-1]
            n = max(max(arr['items']) + 1, arr.get('len', 0)) if arr['items'] else arr.get('len', 0)
            out[name] = [arr['items'].get(k) for k in range(n)]
            arr = None; pend = []
        elif op in ('nop', 'dup'):
            pass
        i += 1
    return out


def main():
    a = load()
    want = sys.argv[1:] or ['TestEnemyDetail::.ctor']
    all_out = {}
    for full in want:
        res = extract(a, full)
        cls = full.split('::')[0]
        all_out[cls] = res
        print('===', full)
        for k, v in res.items():
            print('   %-32s [%d] %s' % (k, len(v), json.dumps(v)[:160]))
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, 'analysis', 'arrays.json'), 'w') as f:
        json.dump(all_out, f, indent=1)
    print('-> analysis/arrays.json')

if __name__ == '__main__':
    main()
