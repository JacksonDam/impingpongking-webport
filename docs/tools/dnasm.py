"""CIL disassembly + a navigable view of an assembly.

Analogue of SaveMyPC's annotate.py: decodes method bodies and resolves every
token to a readable name, inlining string literals from #US the way annotate.py
inlined CFStrings.
"""
import struct, sys
from dnmeta import Image, TABLES
from dnsig import SigReader, method_sig, field_sig

# opcode -> (name, operand kind)
#   '' none | 'u8' 'i8' 'u16' 'i32' 'i64' 'r4' 'r8' | 'tok' | 'br1' 'br4' | 'switch'
OPS = {}
def _o(c, n, k): OPS[c] = (n, k)
for c, n in [(0x00,'nop'),(0x01,'break'),(0x02,'ldarg.0'),(0x03,'ldarg.1'),(0x04,'ldarg.2'),
             (0x05,'ldarg.3'),(0x06,'ldloc.0'),(0x07,'ldloc.1'),(0x08,'ldloc.2'),(0x09,'ldloc.3'),
             (0x0A,'stloc.0'),(0x0B,'stloc.1'),(0x0C,'stloc.2'),(0x0D,'stloc.3'),(0x14,'ldnull'),
             (0x15,'ldc.i4.m1'),(0x16,'ldc.i4.0'),(0x17,'ldc.i4.1'),(0x18,'ldc.i4.2'),(0x19,'ldc.i4.3'),
             (0x1A,'ldc.i4.4'),(0x1B,'ldc.i4.5'),(0x1C,'ldc.i4.6'),(0x1D,'ldc.i4.7'),(0x1E,'ldc.i4.8'),
             (0x25,'dup'),(0x26,'pop'),(0x2A,'ret'),
             (0x46,'ldind.i1'),(0x47,'ldind.u1'),(0x48,'ldind.i2'),(0x49,'ldind.u2'),(0x4A,'ldind.i4'),
             (0x4B,'ldind.u4'),(0x4C,'ldind.i8'),(0x4D,'ldind.i'),(0x4E,'ldind.r4'),(0x4F,'ldind.r8'),
             (0x50,'ldind.ref'),(0x51,'stind.ref'),(0x52,'stind.i1'),(0x53,'stind.i2'),(0x54,'stind.i4'),
             (0x55,'stind.i8'),(0x56,'stind.r4'),(0x57,'stind.r8'),
             (0x58,'add'),(0x59,'sub'),(0x5A,'mul'),(0x5B,'div'),(0x5C,'div.un'),(0x5D,'rem'),
             (0x5E,'rem.un'),(0x5F,'and'),(0x60,'or'),(0x61,'xor'),(0x62,'shl'),(0x63,'shr'),
             (0x64,'shr.un'),(0x65,'neg'),(0x66,'not'),(0x67,'conv.i1'),(0x68,'conv.i2'),(0x69,'conv.i4'),
             (0x6A,'conv.i8'),(0x6B,'conv.r4'),(0x6C,'conv.r8'),(0x6D,'conv.u4'),(0x6E,'conv.u8'),
             (0x76,'conv.r.un'),(0x7A,'throw'),(0x8E,'ldlen'),
             (0x90,'ldelem.i1'),(0x91,'ldelem.u1'),(0x92,'ldelem.i2'),(0x93,'ldelem.u2'),(0x94,'ldelem.i4'),
             (0x95,'ldelem.u4'),(0x96,'ldelem.i8'),(0x97,'ldelem.i'),(0x98,'ldelem.r4'),(0x99,'ldelem.r8'),
             (0x9A,'ldelem.ref'),(0x9B,'stelem.i'),(0x9C,'stelem.i1'),(0x9D,'stelem.i2'),(0x9E,'stelem.i4'),
             (0x9F,'stelem.i8'),(0xA0,'stelem.r4'),(0xA1,'stelem.r8'),(0xA2,'stelem.ref'),
             (0xB3,'conv.ovf.i1'),(0xB4,'conv.ovf.u1'),(0xB5,'conv.ovf.i2'),(0xB6,'conv.ovf.u2'),
             (0xB7,'conv.ovf.i4'),(0xB8,'conv.ovf.u4'),(0xB9,'conv.ovf.i8'),(0xBA,'conv.ovf.u8'),
             (0xC3,'ckfinite'),(0xD1,'conv.u2'),(0xD2,'conv.u1'),(0xD3,'conv.i'),(0xD4,'conv.ovf.i'),
             (0xD5,'conv.ovf.u'),(0xD6,'add.ovf'),(0xD7,'add.ovf.un'),(0xD8,'mul.ovf'),(0xD9,'mul.ovf.un'),
             (0xDA,'sub.ovf'),(0xDB,'sub.ovf.un'),(0xDC,'endfinally'),(0xDF,'stind.i'),(0xE0,'conv.u'),
             (0x82,'conv.ovf.i1.un'),(0x83,'conv.ovf.i2.un'),(0x84,'conv.ovf.i4.un'),(0x85,'conv.ovf.i8.un'),
             (0x86,'conv.ovf.u1.un'),(0x87,'conv.ovf.u2.un'),(0x88,'conv.ovf.u4.un'),(0x89,'conv.ovf.u8.un'),
             (0x8A,'conv.ovf.i.un'),(0x8B,'conv.ovf.u.un')]:
    _o(c, n, '')
for c, n in [(0x0E,'ldarg.s'),(0x0F,'ldarga.s'),(0x10,'starg.s'),(0x11,'ldloc.s'),
             (0x12,'ldloca.s'),(0x13,'stloc.s')]: _o(c, n, 'u8')
_o(0x1F,'ldc.i4.s','i8'); _o(0x20,'ldc.i4','i32'); _o(0x21,'ldc.i8','i64')
_o(0x22,'ldc.r4','r4');  _o(0x23,'ldc.r8','r8')
for c, n in [(0x27,'jmp'),(0x28,'call'),(0x29,'calli'),(0x6F,'callvirt'),(0x70,'cpobj'),
             (0x71,'ldobj'),(0x72,'ldstr'),(0x73,'newobj'),(0x74,'castclass'),(0x75,'isinst'),
             (0x79,'unbox'),(0x7B,'ldfld'),(0x7C,'ldflda'),(0x7D,'stfld'),(0x7E,'ldsfld'),
             (0x7F,'ldsflda'),(0x80,'stsfld'),(0x81,'stobj'),(0x8C,'box'),(0x8D,'newarr'),
             (0x8F,'ldelema'),(0xA3,'ldelem'),(0xA4,'stelem'),(0xA5,'unbox.any'),
             (0xC2,'refanyval'),(0xC6,'mkrefany'),(0xD0,'ldtoken')]: _o(c, n, 'tok')
for c, n in [(0x2B,'br.s'),(0x2C,'brfalse.s'),(0x2D,'brtrue.s'),(0x2E,'beq.s'),(0x2F,'bge.s'),
             (0x30,'bgt.s'),(0x31,'ble.s'),(0x32,'blt.s'),(0x33,'bne.un.s'),(0x34,'bge.un.s'),
             (0x35,'bgt.un.s'),(0x36,'ble.un.s'),(0x37,'blt.un.s'),(0xDE,'leave.s')]: _o(c, n, 'br1')
for c, n in [(0x38,'br'),(0x39,'brfalse'),(0x3A,'brtrue'),(0x3B,'beq'),(0x3C,'bge'),(0x3D,'bgt'),
             (0x3E,'ble'),(0x3F,'blt'),(0x40,'bne.un'),(0x41,'bge.un'),(0x42,'bgt.un'),
             (0x43,'ble.un'),(0x44,'blt.un'),(0xDD,'leave')]: _o(c, n, 'br4')
_o(0x45,'switch','switch')

OPS2 = {}
for c, n in [(0x00,'arglist'),(0x01,'ceq'),(0x02,'cgt'),(0x03,'cgt.un'),(0x04,'clt'),(0x05,'clt.un'),
             (0x0F,'localloc'),(0x11,'endfilter'),(0x13,'volatile.'),(0x14,'tail.'),(0x17,'cpblk'),
             (0x18,'initblk'),(0x1A,'rethrow'),(0x1D,'refanytype'),(0x1E,'readonly.')]:
    OPS2[c] = (n, '')
for c, n in [(0x06,'ldftn'),(0x07,'ldvirtftn'),(0x15,'initobj'),(0x16,'constrained.'),(0x1C,'sizeof')]:
    OPS2[c] = (n, 'tok')
for c, n in [(0x09,'ldarg'),(0x0A,'ldarga'),(0x0B,'starg'),(0x0C,'ldloc'),(0x0D,'ldloca'),(0x0E,'stloc')]:
    OPS2[c] = (n, 'u16')
OPS2[0x12] = ('unaligned.', 'u8'); OPS2[0x19] = ('no.', 'u8')


class Insn:
    __slots__ = ('off', 'op', 'arg', 'txt')
    def __init__(self, off, op, arg, txt):
        self.off, self.op, self.arg, self.txt = off, op, arg, txt
    def __repr__(self):
        return 'IL_%04X: %s %s' % (self.off, self.op, self.txt)


class Method:
    def __init__(self, asm, row, typ):
        self.asm, self.row, self.type = asm, row, typ
        self.name = asm.im.str_at(row.Name)
        self.rva = row.RVA
        self.flags = row.Flags
        self.impl = row.ImplFlags
        try:    self.cc, self.ret, self.params, self.gen = method_sig(asm.im, row.Signature)
        except Exception: self.cc, self.ret, self.params, self.gen = 0, '?', [], 0
        self.static = bool(row.Flags & 0x10)
        self.abstract = bool(row.Flags & 0x400)
        self._body = None
        self.token = 0x06000000 | row._rid

    @property
    def full(self):
        return '%s::%s' % (self.type.name, self.name)

    def sig(self):
        return '%s%s %s(%s)' % ('static ' if self.static else '', self.ret, self.name,
                                ', '.join(self.params))

    def body(self):
        if self._body is None:
            self._body = self.asm.disasm(self.rva)
        return self._body


class Field:
    def __init__(self, asm, row, typ):
        self.asm, self.row, self.type = asm, row, typ
        self.name = asm.im.str_at(row.Name)
        self.ftype = field_sig(asm.im, row.Signature)
        self.static = bool(row.Flags & 0x10)
        self.literal = bool(row.Flags & 0x40)
        self.initonly = bool(row.Flags & 0x20)          # readonly
        self.public = (row.Flags & 0x07) == 0x06
        self.token = 0x04000000 | row._rid
        self.const = asm.constants.get(self.token)

    @property
    def attrs(self):
        return self.asm.attrs.get(self.token, [])


class Type:
    def __init__(self, asm, row):
        self.asm, self.row = asm, row
        im = asm.im
        ns, nm = im.str_at(row.Namespace), im.str_at(row.Name)
        self.namespace, self.shortname = ns, nm
        self.name = (ns + '.' + nm) if ns else nm
        self.flags = row.Flags
        self.fields, self.methods = [], []
        self.token = 0x02000000 | row._rid
        self.base = ''
        self.interfaces = []
        self.enum_values = {}

    @property
    def is_enum(self):
        return self.base == 'System.Enum'

    @property
    def attrs(self):
        return self.asm.attrs.get(self.token, [])


class Assembly:
    def __init__(self, path):
        self.im = im = Image(path)
        self._constants()
        self._build()

    # ------------------------------------------------------------- indexing
    def _constants(self):
        im = self.im
        self.constants = {}
        HC = ['Field', 'Param', 'Property']
        for r in im.table(0x0B):
            t, rid = im.decode_coded('HasConstant', r.Parent)
            if t is None or rid == 0: continue
            tok = (t << 24) | rid
            self.constants[tok] = decode_const(im, r.Type, r.Value)

    def _build(self):
        im = self.im
        td, md, fd = im.table(0x02), im.table(0x06), im.table(0x04)
        self.types, self.by_name = [], {}
        for i, r in enumerate(td):
            t = Type(self, r)
            self.types.append(t)
        for i, r in enumerate(td):
            t = self.types[i]
            nxt = td[i+1] if i+1 < len(td) else None
            f0, f1 = r.FieldList, (nxt.FieldList if nxt else len(fd)+1)
            m0, m1 = r.MethodList, (nxt.MethodList if nxt else len(md)+1)
            for j in range(f0, f1): t.fields.append(Field(self, fd[j-1], t))
            for j in range(m0, m1): t.methods.append(Method(self, md[j-1], t))
            if r.Extends:
                tt, rid = im.decode_coded('TypeDefOrRef', r.Extends)
                if rid:
                    # a generic base (Singleton<GameMgr>, UnityEvent<T>) is a TypeSpec;
                    # resolving it is what lets us recognise UnityEvent subclasses.
                    t.base = (im.typedef_name(rid) if tt == 0x02 else
                              im.typeref_name(rid) if tt == 0x01 else
                              self.resolve(0x1B000000 | rid))
            self.by_name[t.name] = t
        for r in im.table(0x09):
            t = self.types[r.Class-1]
            tt, rid = im.decode_coded('TypeDefOrRef', r.Interface)
            if rid: t.interfaces.append(im.typedef_name(rid) if tt == 0x02 else
                                       im.typeref_name(rid) if tt == 0x01 else '?')
        # nesting
        self.enclosing = {}
        for r in im.table(0x29):
            self.enclosing[r.NestedClass] = r.EnclosingClass
        for t in self.types:
            if t.is_enum:
                for f in t.fields:
                    if f.literal and f.const is not None:
                        t.enum_values[f.const] = f.name
        # method index
        self.methods = [m for t in self.types for m in t.methods]
        self.mtok = {m.token: m for m in self.methods}
        self.ftok = {f.token: f for t in self.types for f in t.fields}
        # custom attributes, indexed by the token they decorate
        self.attrs = {}
        for r in im.table(0x0C):
            pt, prid = im.decode_coded('HasCustomAttribute', r.Parent)
            if pt is None or prid == 0: continue
            tok = (pt << 24) | prid
            ct, crid = im.decode_coded('CustomAttributeType', r.Type)
            if ct is None: continue
            nm = self.resolve(((0x06 if ct == 0x06 else 0x0A) << 24) | crid)
            self.attrs.setdefault(tok, []).append(nm.rsplit('::', 1)[0])


    def display_name(self, t):
        """Nested types read Outer/Inner."""
        rid = t.row._rid
        parts = [t.shortname]
        while rid in self.enclosing:
            rid = self.enclosing[rid]
            parts.append(self.types[rid-1].shortname)
        base = '/'.join(reversed(parts))
        ns = self.types[rid-1].namespace
        return (ns + '.' + base) if ns else base

    # ------------------------------------------------------------- tokens
    def resolve(self, tok):
        im = self.im
        t, rid = tok >> 24, tok & 0xFFFFFF
        if t == 0x70:
            s = im.us_at(rid)
            return '"%s"' % s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
        if t == 0x02: return im.typedef_name(rid) if rid <= len(im.table(0x02)) else '?'
        if t == 0x01: return im.typeref_name(rid) if rid <= len(im.table(0x01)) else '?'
        if t == 0x1B:
            rows = im.table(0x1B)
            if rid > len(rows): return 'TypeSpec#%d' % rid
            try: return SigReader(im, im.blob_at(rows[rid-1].Signature)).type()
            except Exception: return 'TypeSpec#%d' % rid
        if t == 0x06:
            m = self.mtok.get(tok)
            return m.full if m else 'MethodDef#%d' % rid
        if t == 0x04:
            f = self.ftok.get(tok)
            return '%s::%s' % (f.type.name, f.name) if f else 'Field#%d' % rid
        if t == 0x0A:
            rows = im.table(0x0A)
            if rid > len(rows): return 'MemberRef#%d' % rid
            r = rows[rid-1]
            pt, prid = im.decode_coded('MemberRefParent', r.Class)
            if   pt == 0x01: owner = im.typeref_name(prid)
            elif pt == 0x02: owner = im.typedef_name(prid)
            elif pt == 0x1B: owner = self.resolve(0x1B000000 | prid)
            else:            owner = '?'
            return '%s::%s' % (owner, im.str_at(r.Name))
        if t == 0x2B:
            rows = im.table(0x2B)
            if rid > len(rows): return 'MethodSpec#%d' % rid
            r = rows[rid-1]
            mt, mrid = im.decode_coded('MethodDefOrRef', r.Method)
            base = self.resolve(((0x06 if mt == 0x06 else 0x0A) << 24) | mrid)
            try:
                sr = SigReader(im, im.blob_at(r.Instantiation)); sr.byte()
                n = sr.compressed()
                return '%s<%s>' % (base, ', '.join(sr.type() for _ in range(n)))
            except Exception: return base
        if t == 0x11: return 'StandAloneSig#%d' % rid
        return 'tok(%02X:%d)' % (t, rid)

    # ------------------------------------------------------------ disasm
    def disasm(self, rva):
        if not rva: return []
        im = self.im
        d = im.data
        o = im.rva2off(rva)
        b0 = d[o]
        if (b0 & 3) == 2:                                   # tiny header
            size = b0 >> 2
            code = o + 1
            self.last_locals = []
        else:                                               # fat header
            fl = struct.unpack_from('<H', d, o)[0]
            hsz = (fl >> 12) * 4
            size = struct.unpack_from('<I', d, o + 4)[0]
            lvt = struct.unpack_from('<I', d, o + 8)[0]
            code = o + hsz
            self.last_locals = self.local_types(lvt)
        out, p, end = [], code, code + size
        while p < end:
            off = p - code
            c = d[p]; p += 1
            if c == 0xFE:
                c2 = d[p]; p += 1
                name, kind = OPS2.get(c2, ('fe.%02x' % c2, ''))
            else:
                name, kind = OPS.get(c, ('op.%02x' % c, ''))
            arg, txt = None, ''
            if kind == '': pass
            elif kind == 'u8':  arg = d[p]; p += 1; txt = str(arg)
            elif kind == 'i8':  arg = struct.unpack_from('<b', d, p)[0]; p += 1; txt = str(arg)
            elif kind == 'u16': arg = struct.unpack_from('<H', d, p)[0]; p += 2; txt = str(arg)
            elif kind == 'i32': arg = struct.unpack_from('<i', d, p)[0]; p += 4; txt = str(arg)
            elif kind == 'i64': arg = struct.unpack_from('<q', d, p)[0]; p += 8; txt = str(arg)
            elif kind == 'r4':  arg = struct.unpack_from('<f', d, p)[0]; p += 4; txt = fmtf(arg)
            elif kind == 'r8':  arg = struct.unpack_from('<d', d, p)[0]; p += 8; txt = fmtf(arg)
            elif kind == 'tok':
                arg = struct.unpack_from('<I', d, p)[0]; p += 4; txt = self.resolve(arg)
            elif kind == 'br1':
                delta = struct.unpack_from('<b', d, p)[0]; p += 1
                arg = (p - code) + delta; txt = 'IL_%04X' % arg
            elif kind == 'br4':
                delta = struct.unpack_from('<i', d, p)[0]; p += 4
                arg = (p - code) + delta; txt = 'IL_%04X' % arg
            elif kind == 'switch':
                n = struct.unpack_from('<I', d, p)[0]; p += 4
                deltas = struct.unpack_from('<%di' % n, d, p); p += 4*n
                base = p - code
                arg = [base + x for x in deltas]
                txt = ', '.join('IL_%04X' % t for t in arg)
            out.append(Insn(off, name, arg, txt))
        return out

    def local_types(self, tok):
        if (tok >> 24) != 0x11: return []
        rows = self.im.table(0x11)
        rid = tok & 0xFFFFFF
        if rid == 0 or rid > len(rows): return []
        try:    return SigReader(self.im, self.im.blob_at(rows[rid-1].Signature)).locals()
        except Exception: return []

    # ------------------------------------------------------------ lookup
    def find(self, pattern):
        """'Type::Method', 'Type::', '::Method' or a substring."""
        pat = pattern.lower()
        hits = []
        for m in self.methods:
            if pat in m.full.lower(): hits.append(m)
        return hits


def fmtf(v):
    if v != v or v in (float('inf'), float('-inf')): return repr(v)
    if v == int(v) and abs(v) < 1e15: return '%g' % v
    return repr(v)


def decode_const(im, ctype, blob_idx):
    b = im.blob_at(blob_idx)
    try:
        if ctype == 0x02: return bool(b[0])
        if ctype == 0x03: return struct.unpack_from('<H', b, 0)[0]
        if ctype == 0x04: return struct.unpack_from('<b', b, 0)[0]
        if ctype == 0x05: return b[0]
        if ctype == 0x06: return struct.unpack_from('<h', b, 0)[0]
        if ctype == 0x07: return struct.unpack_from('<H', b, 0)[0]
        if ctype == 0x08: return struct.unpack_from('<i', b, 0)[0]
        if ctype == 0x09: return struct.unpack_from('<I', b, 0)[0]
        if ctype == 0x0a: return struct.unpack_from('<q', b, 0)[0]
        if ctype == 0x0b: return struct.unpack_from('<Q', b, 0)[0]
        if ctype == 0x0c: return struct.unpack_from('<f', b, 0)[0]
        if ctype == 0x0d: return struct.unpack_from('<d', b, 0)[0]
        if ctype == 0x0e: return b.decode('utf-16-le', 'replace')
    except Exception: pass
    return None


DEFAULT = 'extracted/assets/bin/Data/Managed/Assembly-CSharp.dll'

def load(path=None):
    import os
    if path is None:
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(here, DEFAULT)
    return Assembly(path)
