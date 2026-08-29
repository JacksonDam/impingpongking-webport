"""ECMA-335 PE + CLI metadata reader.  stdlib only.

The analogue of SaveMyPC's objcdump.py: this is the thing that turns a shipped
binary back into named types and method bodies.  Unity's Mono backend keeps the
full metadata, so unlike an ObjC binary there is nothing to reconstruct by
heuristic -- every type, method, field, parameter and string literal is present
by name.
"""
import struct, sys

U8  = lambda b, o: b[o]
U16 = lambda b, o: struct.unpack_from('<H', b, o)[0]
U32 = lambda b, o: struct.unpack_from('<I', b, o)[0]
U64 = lambda b, o: struct.unpack_from('<Q', b, o)[0]

# ---------------------------------------------------------------- table schema
# name, [(field, kind)] ; kind is 'u8' 'u16' 'u32' | '#Strings' '#Blob' '#GUID'
# | a table id (simple index) | a tuple (coded index name)
TABLES = {
 0x00: ('Module',        [('Generation','u16'),('Name','#Strings'),('Mvid','#GUID'),('EncId','#GUID'),('EncBaseId','#GUID')]),
 0x01: ('TypeRef',       [('ResolutionScope',('ResolutionScope',)),('Name','#Strings'),('Namespace','#Strings')]),
 0x02: ('TypeDef',       [('Flags','u32'),('Name','#Strings'),('Namespace','#Strings'),('Extends',('TypeDefOrRef',)),('FieldList',0x04),('MethodList',0x06)]),
 0x03: ('FieldPtr',      [('Field',0x04)]),
 0x04: ('Field',         [('Flags','u16'),('Name','#Strings'),('Signature','#Blob')]),
 0x05: ('MethodPtr',     [('Method',0x06)]),
 0x06: ('MethodDef',     [('RVA','u32'),('ImplFlags','u16'),('Flags','u16'),('Name','#Strings'),('Signature','#Blob'),('ParamList',0x08)]),
 0x07: ('ParamPtr',      [('Param',0x08)]),
 0x08: ('Param',         [('Flags','u16'),('Sequence','u16'),('Name','#Strings')]),
 0x09: ('InterfaceImpl', [('Class',0x02),('Interface',('TypeDefOrRef',))]),
 0x0A: ('MemberRef',     [('Class',('MemberRefParent',)),('Name','#Strings'),('Signature','#Blob')]),
 0x0B: ('Constant',      [('Type','u8'),('Pad','u8'),('Parent',('HasConstant',)),('Value','#Blob')]),
 0x0C: ('CustomAttribute',[('Parent',('HasCustomAttribute',)),('Type',('CustomAttributeType',)),('Value','#Blob')]),
 0x0D: ('FieldMarshal',  [('Parent',('HasFieldMarshal',)),('NativeType','#Blob')]),
 0x0E: ('DeclSecurity',  [('Action','u16'),('Parent',('HasDeclSecurity',)),('PermissionSet','#Blob')]),
 0x0F: ('ClassLayout',   [('PackingSize','u16'),('ClassSize','u32'),('Parent',0x02)]),
 0x10: ('FieldLayout',   [('Offset','u32'),('Field',0x04)]),
 0x11: ('StandAloneSig', [('Signature','#Blob')]),
 0x12: ('EventMap',      [('Parent',0x02),('EventList',0x14)]),
 0x13: ('EventPtr',      [('Event',0x14)]),
 0x14: ('Event',         [('EventFlags','u16'),('Name','#Strings'),('EventType',('TypeDefOrRef',))]),
 0x15: ('PropertyMap',   [('Parent',0x02),('PropertyList',0x17)]),
 0x16: ('PropertyPtr',   [('Property',0x17)]),
 0x17: ('Property',      [('Flags','u16'),('Name','#Strings'),('Type','#Blob')]),
 0x18: ('MethodSemantics',[('Semantics','u16'),('Method',0x06),('Association',('HasSemantics',))]),
 0x19: ('MethodImpl',    [('Class',0x02),('MethodBody',('MethodDefOrRef',)),('MethodDeclaration',('MethodDefOrRef',))]),
 0x1A: ('ModuleRef',     [('Name','#Strings')]),
 0x1B: ('TypeSpec',      [('Signature','#Blob')]),
 0x1C: ('ImplMap',       [('MappingFlags','u16'),('MemberForwarded',('MemberForwarded',)),('ImportName','#Strings'),('ImportScope',0x1A)]),
 0x1D: ('FieldRVA',      [('RVA','u32'),('Field',0x04)]),
 0x1E: ('ENCLog',        [('Token','u32'),('FuncCode','u32')]),
 0x1F: ('ENCMap',        [('Token','u32')]),
 0x20: ('Assembly',      [('HashAlgId','u32'),('Major','u16'),('Minor','u16'),('Build','u16'),('Rev','u16'),('Flags','u32'),('PublicKey','#Blob'),('Name','#Strings'),('Culture','#Strings')]),
 0x21: ('AssemblyProcessor',[('Processor','u32')]),
 0x22: ('AssemblyOS',    [('OSPlatformID','u32'),('OSMajor','u32'),('OSMinor','u32')]),
 0x23: ('AssemblyRef',   [('Major','u16'),('Minor','u16'),('Build','u16'),('Rev','u16'),('Flags','u32'),('PublicKeyOrToken','#Blob'),('Name','#Strings'),('Culture','#Strings'),('HashValue','#Blob')]),
 0x24: ('AssemblyRefProcessor',[('Processor','u32'),('AssemblyRef',0x23)]),
 0x25: ('AssemblyRefOS', [('OSPlatformID','u32'),('OSMajor','u32'),('OSMinor','u32'),('AssemblyRef',0x23)]),
 0x26: ('File',          [('Flags','u32'),('Name','#Strings'),('HashValue','#Blob')]),
 0x27: ('ExportedType',  [('Flags','u32'),('TypeDefId','u32'),('Name','#Strings'),('Namespace','#Strings'),('Implementation',('Implementation',))]),
 0x28: ('ManifestResource',[('Offset','u32'),('Flags','u32'),('Name','#Strings'),('Implementation',('Implementation',))]),
 0x29: ('NestedClass',   [('NestedClass',0x02),('EnclosingClass',0x02)]),
 0x2A: ('GenericParam',  [('Number','u16'),('Flags','u16'),('Owner',('TypeOrMethodDef',)),('Name','#Strings')]),
 0x2B: ('MethodSpec',    [('Method',('MethodDefOrRef',)),('Instantiation','#Blob')]),
 0x2C: ('GenericParamConstraint',[('Owner',0x2A),('Constraint',('TypeDefOrRef',))]),
}

CODED = {
 'TypeDefOrRef':        (2, [0x02,0x01,0x1B]),
 'HasConstant':         (2, [0x04,0x08,0x17]),
 'HasCustomAttribute':  (5, [0x06,0x04,0x01,0x02,0x08,0x09,0x0A,0x00,0x0E,0x17,0x14,0x11,0x1A,0x1B,0x20,0x23,0x26,0x27,0x28,0x2A,0x2C,0x2B]),
 'HasFieldMarshal':     (1, [0x04,0x08]),
 'HasDeclSecurity':     (2, [0x02,0x06,0x20]),
 'MemberRefParent':     (3, [0x02,0x01,0x1A,0x06,0x1B]),
 'HasSemantics':        (1, [0x14,0x17]),
 'MethodDefOrRef':      (1, [0x06,0x0A]),
 'MemberForwarded':     (1, [0x04,0x06]),
 'Implementation':      (2, [0x26,0x23,0x27]),
 'CustomAttributeType': (3, [None,None,0x06,0x0A,None]),
 'ResolutionScope':     (2, [0x00,0x1A,0x23,0x01]),
 'TypeOrMethodDef':     (1, [0x02,0x06]),
}


class Row(dict):
    """One metadata row.  `r.Name` as well as `r['Name']`."""
    __getattr__ = dict.__getitem__


class Image:
    def __init__(self, path):
        self.path = path
        self.data = open(path, 'rb').read()
        self._pe()
        self._cli()
        self._heaps()
        self._tables()

    # ------------------------------------------------------------------ PE
    def _pe(self):
        d = self.data
        assert d[:2] == b'MZ', 'not a PE'
        pe = U32(d, 0x3C)
        assert d[pe:pe+4] == b'PE\0\0', 'no PE signature'
        coff = pe + 4
        nsec = U16(d, coff + 2)
        optsz = U16(d, coff + 16)
        opt = coff + 20
        magic = U16(d, opt)
        self.pe32plus = (magic == 0x20B)
        # PE32 optional header is 0x60 bytes before the data directories;
        # PE32+ is 0x70 (8-byte ImageBase and the four stack/heap fields).
        ddir = opt + (0x70 if self.pe32plus else 0x60)
        nrva = U32(d, ddir - 4)
        self.datadirs = [(U32(d, ddir + 8*i), U32(d, ddir + 8*i + 4)) for i in range(min(nrva, 16))]
        self.sections = []
        s = opt + optsz
        for i in range(nsec):
            o = s + 40*i
            name = d[o:o+8].rstrip(b'\0').decode('ascii', 'replace')
            vsize, vaddr, rsize, raddr = struct.unpack_from('<IIII', d, o + 8)
            self.sections.append((name, vaddr, vsize, raddr, rsize))

    def rva2off(self, rva):
        for name, va, vs, ra, rs in self.sections:
            if va <= rva < va + max(vs, rs):
                return ra + (rva - va)
        raise KeyError('rva 0x%X unmapped' % rva)

    # ----------------------------------------------------------------- CLI
    def _cli(self):
        d = self.data
        rva, size = self.datadirs[14]
        o = self.rva2off(rva)
        self.cli_flags = U32(d, o + 16)
        self.entry_point = U32(d, o + 20)
        md_rva, md_size = U32(d, o + 8), U32(d, o + 12)
        self.md = self.rva2off(md_rva)
        assert U32(d, self.md) == 0x424A5342, 'no BSJB'
        vlen = U32(d, self.md + 12)
        self.runtime_version = d[self.md+16:self.md+16+vlen].rstrip(b'\0').decode()
        # root: sig u32, major u16, minor u16, reserved u32, len u32, version[len],
        #       flags u16, streams u16, then the stream headers.
        self.md_flags = U16(d, self.md + 16 + vlen)
        nstreams = U16(d, self.md + 16 + vlen + 2)
        p = self.md + 16 + vlen + 4
        self.streams = {}
        for _ in range(nstreams):
            soff, ssize = U32(d, p), U32(d, p + 4)
            p += 8
            e = d.index(b'\0', p)
            name = d[p:e].decode()
            p = e + 1
            p = (p + 3) & ~3
            self.streams[name] = (self.md + soff, ssize)

    def _heaps(self):
        d = self.data
        self.strings = self.streams.get('#Strings', (0, 0))
        self.blobs   = self.streams.get('#Blob',    (0, 0))
        self.guids   = self.streams.get('#GUID',    (0, 0))
        self.us      = self.streams.get('#US',      (0, 0))

    def str_at(self, idx):
        base, size = self.strings
        if idx == 0: return ''
        e = self.data.index(b'\0', base + idx)
        return self.data[base+idx:e].decode('utf-8', 'replace')

    def blob_at(self, idx):
        base, size = self.blobs
        o = base + idx
        n, o = self.uncompress(o)
        return self.data[o:o+n]

    def us_at(self, idx):
        """#US entry -> python str.  Bodies are UTF-16LE with a trailing flag byte."""
        base, size = self.us
        o = base + idx
        n, o = self.uncompress(o)
        if n == 0: return ''
        return self.data[o:o+n-1].decode('utf-16-le', 'replace')

    def uncompress(self, o):
        d = self.data
        b = d[o]
        if   b & 0x80 == 0:    return b, o + 1
        elif b & 0xC0 == 0x80: return ((b & 0x3F) << 8) | d[o+1], o + 2
        else:                  return ((b & 0x1F) << 24) | (d[o+1] << 16) | (d[o+2] << 8) | d[o+3], o + 4

    # -------------------------------------------------------------- tables
    def _tables(self):
        d = self.data
        self.tilde = '#~' if '#~' in self.streams else '#-'
        base, size = self.streams[self.tilde]
        heapsizes = U8(d, base + 6)
        self.wide_str  = bool(heapsizes & 1)
        self.wide_guid = bool(heapsizes & 2)
        self.wide_blob = bool(heapsizes & 4)
        valid  = U64(d, base + 8)
        sorted_ = U64(d, base + 16)
        p = base + 24
        self.rows = {}
        for t in range(64):
            if valid >> t & 1:
                self.rows[t] = U32(d, p); p += 4
        # index widths depend on row counts -> compute, then decode
        self.tables = {}
        for t in sorted(self.rows):
            name, cols = TABLES[t]
            w = [self._width(k) for _, k in cols]
            rowsz = sum(w)
            n = self.rows[t]
            rows = []
            for i in range(n):
                o = p + i*rowsz
                r = Row()
                for (fname, kind), width in zip(cols, w):
                    v = (d[o] if width == 1 else U16(d, o) if width == 2 else U32(d, o))
                    r[fname] = v
                    o += width
                r['_rid'] = i + 1
                rows.append(r)
            self.tables[t] = rows
            p += rowsz * n

    def _width(self, kind):
        if kind == 'u8':  return 1
        if kind == 'u16': return 2
        if kind == 'u32': return 4
        if kind == '#Strings': return 4 if self.wide_str  else 2
        if kind == '#Blob':    return 4 if self.wide_blob else 2
        if kind == '#GUID':    return 4 if self.wide_guid else 2
        if isinstance(kind, int):
            return 4 if self.rows.get(kind, 0) >= 0x10000 else 2
        cname = kind[0]
        bits, tabs = CODED[cname]
        mx = max((self.rows.get(t, 0) for t in tabs if t is not None), default=0)
        return 4 if mx >= (1 << (16 - bits)) else 2

    def table(self, t):
        return self.tables.get(t, [])

    def decode_coded(self, cname, v):
        bits, tabs = CODED[cname]
        tag = v & ((1 << bits) - 1)
        rid = v >> bits
        t = tabs[tag] if tag < len(tabs) else None
        return t, rid

    # ------------------------------------------------------- convenience
    def typedef_name(self, rid):
        r = self.table(0x02)[rid-1]
        ns, nm = self.str_at(r.Namespace), self.str_at(r.Name)
        return (ns + '.' + nm) if ns else nm

    def typeref_name(self, rid):
        r = self.table(0x01)[rid-1]
        ns, nm = self.str_at(r.Namespace), self.str_at(r.Name)
        return (ns + '.' + nm) if ns else nm

    def method_body_off(self, rva):
        return self.rva2off(rva) if rva else None
