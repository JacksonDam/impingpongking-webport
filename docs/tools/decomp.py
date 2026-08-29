#!/usr/bin/env python3
"""IL -> pseudo-C#.  Stack simulation with spill-to-temp at block boundaries.

Not a real decompiler: no loop or if/else structuring, just gotos.  But it turns
a stack machine into readable expressions, which is the whole difficulty when
reading 4000 methods by hand.  Every line keeps its IL offset so a reading can
always be checked against `fn.py`.
"""
import sys, os, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dnasm import load, Assembly
from dnsig import SigReader

BIN = {'add':'+','sub':'-','mul':'*','div':'/','div.un':'/','rem':'%','rem.un':'%',
       'and':'&','or':'|','xor':'^','shl':'<<','shr':'>>','shr.un':'>>>',
       'add.ovf':'+','sub.ovf':'-','mul.ovf':'*','add.ovf.un':'+','sub.ovf.un':'-','mul.ovf.un':'*'}
CMP = {'ceq':'==','cgt':'>','cgt.un':'>','clt':'<','clt.un':'<'}
BR2 = {'beq':'==','bne.un':'!=','bge':'>=','bgt':'>','ble':'<=','blt':'<',
       'bge.un':'>=','bgt.un':'>','ble.un':'<=','blt.un':'<'}
CONV = {'conv.i1':'(sbyte)','conv.i2':'(short)','conv.i4':'(int)','conv.i8':'(long)',
        'conv.r4':'(float)','conv.r8':'(double)','conv.u1':'(byte)','conv.u2':'(ushort)',
        'conv.u4':'(uint)','conv.u8':'(ulong)','conv.i':'(IntPtr)','conv.u':'(UIntPtr)',
        'conv.r.un':'(float)'}


class Decompiler:
    def __init__(self, asm):
        self.a = asm
        self.im = asm.im
        self._argcache = {}

    # ---- how many arguments does the callee pop, and is it an instance call?
    def callee_info(self, tok):
        if tok in self._argcache: return self._argcache[tok]
        im, t, rid = self.im, tok >> 24, tok & 0xFFFFFF
        hasthis, n, ret = False, 0, 'void'
        try:
            if t == 0x06:
                r = im.table(0x06)[rid-1]; blob = r.Signature
            elif t == 0x0A:
                r = im.table(0x0A)[rid-1]; blob = r.Signature
            elif t == 0x2B:
                r = im.table(0x2B)[rid-1]
                mt, mrid = im.decode_coded('MethodDefOrRef', r.Method)
                return self.callee_info(((0x06 if mt == 0x06 else 0x0A) << 24) | mrid)
            else:
                self._argcache[tok] = (False, 0, 'void'); return self._argcache[tok]
            sr = SigReader(im, im.blob_at(blob))
            cc = sr.byte()
            hasthis = bool(cc & 0x20)
            if cc & 0x10: sr.compressed()
            n = sr.compressed()
            ret = sr.type()
        except Exception:
            pass
        self._argcache[tok] = (hasthis, n, ret)
        return self._argcache[tok]

    def param_names(self, m):
        im = self.im
        md = im.table(0x06); pd = im.table(0x08)
        rid = m.row._rid
        p0 = m.row.ParamList
        p1 = md[rid].ParamList if rid < len(md) else len(pd)+1
        names = {}
        for j in range(p0, p1):
            r = pd[j-1]
            names[r.Sequence] = im.str_at(r.Name)
        out = []
        for k in range(1, len(m.params)+1):
            out.append(names.get(k) or 'a%d' % k)
        return out

    # ------------------------------------------------------------------ main
    def run(self, m):
        code = m.body()
        if not code: return ['// no body (abstract / extern)']
        locals_ = self.a.last_locals
        pnames = self.param_names(m)
        argn = (['this'] if not m.static else []) + pnames
        targets = set()
        for i in code:
            if i.op in ('br','br.s','leave','leave.s') or i.op.startswith('b') and isinstance(i.arg, int):
                if isinstance(i.arg, int): targets.add(i.arg)
            if i.op == 'switch':
                targets.update(i.arg)
        out = []
        if locals_:
            out.append('// locals: ' + ', '.join('%s V_%d' % (t, k) for k, t in enumerate(locals_)))
        st = []
        ntmp = [0]

        def spill():
            """Force everything on the stack into named temps so a jump can land here."""
            for k, e in enumerate(st):
                if e.startswith('S_'): continue
                t = 'S_%d' % k
                out.append('    %s = %s;' % (t, e))
                st[k] = t

        for idx, i in enumerate(code):
            if i.off in targets:
                if st: spill()
                out.append('IL_%04X:' % i.off)
            op, arg, txt = i.op, i.arg, i.txt
            E = lambda s: st.append(s)
            def P(n=1):
                if n == 0: return []          # st[-0:] is the whole stack, not nothing
                if len(st) < n:
                    for _ in range(n - len(st)): st.insert(0, '<underflow>')
                v = st[-n:]; del st[-n:]; return v

            if op == 'nop': continue
            elif op.startswith('ldarg'):
                k = arg if arg is not None else int(op.split('.')[-1]) if op[-1].isdigit() else 0
                E(argn[k] if k < len(argn) else 'arg%d' % k)
            elif op.startswith('ldarga'):
                k = arg; E('&' + (argn[k] if k < len(argn) else 'arg%d' % k))
            elif op.startswith('starg'):
                v, = P(); out.append('    %s = %s;' % (argn[arg] if arg < len(argn) else 'arg%d'%arg, v))
            elif op.startswith('ldloca'): E('&V_%d' % arg)
            elif op.startswith('ldloc'):
                k = arg if arg is not None else int(op.split('.')[-1]); E('V_%d' % k)
            elif op.startswith('stloc'):
                k = arg if arg is not None else int(op.split('.')[-1])
                v, = P(); out.append('    V_%d = %s;' % (k, v))
            elif op == 'ldnull': E('null')
            elif op.startswith('ldc.i4') or op.startswith('ldc.i8'):
                if arg is not None: E(str(arg))
                elif op.endswith('m1'): E('-1')
                else: E(op.split('.')[-1])
            elif op in ('ldc.r4','ldc.r8'): E(txt + 'f' if op == 'ldc.r4' else txt)
            elif op == 'ldstr': E(txt)
            elif op == 'dup':
                v, = P(); E(v); E(v)
            elif op == 'pop':
                v, = P()
                if '(' in v: out.append('    %s;' % v)
            elif op == 'ret':
                if m.ret != 'void' and st:
                    v, = P(); out.append('    return %s;' % v)
                else: out.append('    return;')
            elif op in BIN:
                b, c = P(2); E('(%s %s %s)' % (b, BIN[op], c))
            elif op == 'neg': v, = P(); E('(-%s)' % v)
            elif op == 'not': v, = P(); E('(~%s)' % v)
            elif op in CMP:
                b, c = P(2); E('(%s %s %s)' % (b, CMP[op], c))
            elif op in CONV:
                v, = P(); E('%s%s' % (CONV[op], v))
            elif op.startswith('conv.ovf'):
                v, = P(); E('checked(%s)' % v)
            elif op in ('call','callvirt','newobj'):
                hasthis, n, ret = self.callee_info(arg)
                if op == 'newobj':
                    args = P(n)
                    ty = txt.rsplit('::', 1)[0]
                    E('new %s(%s)' % (ty, ', '.join(args)))
                else:
                    args = P(n)
                    recv = None
                    if hasthis:
                        r, = P(); recv = r
                    nm = txt.rsplit('::', 1)[-1]
                    owner = txt.rsplit('::', 1)[0]
                    if nm.startswith('get_') and not args:
                        e = '%s.%s' % (recv if hasthis else owner, nm[4:])
                    elif nm.startswith('set_') and len(args) == 1:
                        out.append('    %s.%s = %s;' % (recv if hasthis else owner, nm[4:], args[0]))
                        continue
                    elif nm == 'op_Equality':  e = '(%s == %s)' % tuple(args)
                    elif nm == 'op_Inequality':e = '(%s != %s)' % tuple(args)
                    elif nm == 'op_Addition':  e = '(%s + %s)' % tuple(args)
                    elif nm == 'op_Subtraction':e= '(%s - %s)' % tuple(args)
                    elif nm == 'op_Multiply':  e = '(%s * %s)' % tuple(args)
                    elif nm == 'op_Division':  e = '(%s / %s)' % tuple(args)
                    elif nm == 'op_Implicit' or nm == 'op_Explicit': e = args[0] if args else '?'
                    elif nm == 'get_Item' and hasthis: e = '%s[%s]' % (recv, ', '.join(args))
                    elif nm == 'set_Item' and hasthis:
                        out.append('    %s[%s] = %s;' % (recv, ', '.join(args[:-1]), args[-1])); continue
                    elif hasthis: e = '%s.%s(%s)' % (recv, nm, ', '.join(args))
                    else:         e = '%s(%s)' % (txt, ', '.join(args))
                    if ret == 'void': out.append('    %s;' % e)
                    else: E(e)
            elif op == 'ldfld':
                o, = P(); E('%s.%s' % (o, txt.rsplit('::',1)[-1]))
            elif op == 'ldflda':
                o, = P(); E('&%s.%s' % (o, txt.rsplit('::',1)[-1]))
            elif op == 'stfld':
                o, v = P(2); out.append('    %s.%s = %s;' % (o, txt.rsplit('::',1)[-1], v))
            elif op == 'ldsfld':  E(txt)
            elif op == 'ldsflda': E('&' + txt)
            elif op == 'stsfld':
                v, = P(); out.append('    %s = %s;' % (txt, v))
            elif op == 'newarr':
                n, = P(); E('new %s[%s]' % (txt, n))
            elif op == 'ldlen':
                o, = P(); E('%s.Length' % o)
            elif op.startswith('ldelem'):
                o, k = P(2); E('%s[%s]' % (o, k))
            elif op.startswith('stelem'):
                o, k, v = P(3); out.append('    %s[%s] = %s;' % (o, k, v))
            elif op == 'ldelema':
                o, k = P(2); E('&%s[%s]' % (o, k))
            elif op in ('box','unbox.any','unbox','castclass','isinst'):
                v, = P()
                E(v if op == 'box' else '(%s)%s' % (txt, v) if op != 'isinst' else '(%s as %s)' % (v, txt))
            elif op == 'ldtoken': E('typeof(%s)' % txt)
            elif op == 'ldftn' or op == 'ldvirtftn':
                if op == 'ldvirtftn': P()
                E('&' + txt)
            elif op == 'initobj':
                o, = P(); out.append('    %s = default(%s);' % (o.lstrip('&'), txt))
            elif op == 'ldobj':
                o, = P(); E('*%s' % o)
            elif op == 'stobj':
                o, v = P(2); out.append('    *%s = %s;' % (o, v))
            elif op.startswith('ldind'):
                o, = P(); E('*%s' % o)
            elif op.startswith('stind'):
                o, v = P(2); out.append('    *%s = %s;' % (o, v))
            elif op in ('br','br.s'):
                if st: spill()
                out.append('    goto IL_%04X;' % arg)
            elif op in ('leave','leave.s'):
                st.clear(); out.append('    leave IL_%04X;' % arg)
            elif op in ('brtrue','brtrue.s'):
                v, = P(); spill(); out.append('    if (%s) goto IL_%04X;' % (v, arg))
            elif op in ('brfalse','brfalse.s'):
                v, = P(); spill(); out.append('    if (!%s) goto IL_%04X;' % (v, arg))
            elif op.rstrip('.s') in BR2 or op.replace('.s','') in BR2:
                o2 = op[:-2] if op.endswith('.s') else op
                b, c = P(2); spill()
                out.append('    if (%s %s %s) goto IL_%04X;' % (b, BR2[o2], c, arg))
            elif op == 'switch':
                v, = P(); spill()
                out.append('    switch (%s) {' % v)
                for k, t in enumerate(arg): out.append('        case %d: goto IL_%04X;' % (k, t))
                out.append('    }')
            elif op == 'throw':
                v, = P(); st.clear(); out.append('    throw %s;' % v)
            elif op == 'rethrow': out.append('    rethrow;')
            elif op == 'endfinally': st.clear(); out.append('    endfinally;')
            elif op == 'endfilter': P(); out.append('    endfilter;')
            elif op in ('constrained.','volatile.','readonly.','tail.','unaligned.','no.'): continue
            elif op == 'sizeof': E('sizeof(%s)' % txt)
            elif op == 'ckfinite': pass
            elif op == 'localloc': P(); E('stackalloc')
            elif op == 'arglist': E('__arglist')
            elif op == 'cpobj': P(2)
            elif op == 'initblk' or op == 'cpblk': P(3)
            else:
                out.append('    // ?? %s %s' % (op, txt))
        return out


def main():
    if len(sys.argv) < 2:
        print('usage: decomp.py <Type::Method | Type:: | substring> [-all]'); return
    a = load()
    pat = sys.argv[1]
    d = Decompiler(a)
    hits = a.find(pat)
    if not hits: print('no match for %r' % pat); return
    for m in hits:
        print('\n// ---- %s   %s   (rva 0x%X)' % (m.type.name, m.sig(), m.rva))
        if not m.rva:
            print('//   abstract/extern'); continue
        for line in d.run(m): print(line)

if __name__ == '__main__':
    main()
