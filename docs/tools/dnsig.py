"""ECMA-335 signature blob decoding -> readable C# type names."""

ET = {0x01:'void',0x02:'bool',0x03:'char',0x04:'sbyte',0x05:'byte',0x06:'short',
      0x07:'ushort',0x08:'int',0x09:'uint',0x0a:'long',0x0b:'ulong',0x0c:'float',
      0x0d:'double',0x0e:'string',0x16:'TypedReference',0x18:'IntPtr',
      0x19:'UIntPtr',0x1c:'object'}

SHORT = {'System.Void':'void','System.Boolean':'bool','System.Char':'char',
         'System.SByte':'sbyte','System.Byte':'byte','System.Int16':'short',
         'System.UInt16':'ushort','System.Int32':'int','System.UInt32':'uint',
         'System.Int64':'long','System.UInt64':'ulong','System.Single':'float',
         'System.Double':'double','System.String':'string','System.Object':'object'}


class SigReader:
    def __init__(self, im, blob):
        self.im, self.b, self.p = im, blob, 0

    def byte(self):
        v = self.b[self.p]; self.p += 1; return v

    def peek(self):
        return self.b[self.p] if self.p < len(self.b) else 0

    def compressed(self):
        b = self.byte()
        if   b & 0x80 == 0:    return b
        elif b & 0xC0 == 0x80: return ((b & 0x3F) << 8) | self.byte()
        else:
            return ((b & 0x1F) << 24) | (self.byte() << 16) | (self.byte() << 8) | self.byte()

    def signed(self):
        """compressed signed int (used by array bounds)."""
        v = self.compressed()
        return v >> 1 if not v & 1 else -(v >> 1) - 1

    def typedeforref(self):
        v = self.compressed()
        tag, rid = v & 3, v >> 2
        if rid == 0: return '?'
        if tag == 0: return self.im.typedef_name(rid)
        if tag == 1: return self.im.typeref_name(rid)
        return self.typespec(rid)

    def typespec(self, rid):
        rows = self.im.table(0x1B)
        if rid > len(rows): return 'TypeSpec#%d' % rid
        return SigReader(self.im, self.im.blob_at(rows[rid-1].Signature)).type()

    def type(self):
        t = self.byte()
        if t in ET: return ET[t]
        if t == 0x0f: return self.type() + '*'
        if t == 0x10: return 'ref ' + self.type()
        if t in (0x11, 0x12):                       # VALUETYPE / CLASS
            n = self.typedeforref()
            return SHORT.get(n, n)
        if t == 0x13: return '!' + str(self.compressed())          # generic type param
        if t == 0x1e: return '!!' + str(self.compressed())         # generic method param
        if t == 0x1d: return self.type() + '[]'                    # SZARRAY
        if t == 0x14:                                              # ARRAY
            el = self.type(); rank = self.compressed()
            nsizes = self.compressed()
            for _ in range(nsizes): self.compressed()
            nlo = self.compressed()
            for _ in range(nlo): self.signed()
            return el + '[' + ','*(rank-1) + ']'
        if t == 0x15:                                              # GENERICINST
            base = self.type()
            n = self.compressed()
            args = [self.type() for _ in range(n)]
            if '`' in base: base = base[:base.index('`')]
            return '%s<%s>' % (base, ', '.join(args))
        if t == 0x1b:                                              # FNPTR
            self.method(); return 'fnptr'
        if t in (0x1f, 0x20):                                      # CMOD_REQD/OPT
            self.typedeforref(); return self.type()
        if t == 0x45: return self.type()                           # PINNED
        return 'et_0x%02x' % t

    def method(self):
        """-> (callconv, ret, [params], genparamcount)"""
        cc = self.byte()
        gen = self.compressed() if cc & 0x10 else 0
        n = self.compressed()
        ret = self.type()
        ps = []
        for _ in range(n):
            if self.peek() == 0x41: self.byte(); ps.append('...')   # SENTINEL
            ps.append(self.type())
        return cc, ret, ps, gen

    def field(self):
        assert self.byte() & 0x0f == 0x06
        return self.type()

    def prop(self):
        cc = self.byte()
        n = self.compressed()
        t = self.type()
        return t, [self.type() for _ in range(n)]

    def locals(self):
        assert self.byte() == 0x07
        n = self.compressed()
        return [self.type() for _ in range(n)]


def method_sig(im, blob_idx):
    return SigReader(im, im.blob_at(blob_idx)).method()

def field_sig(im, blob_idx):
    try:    return SigReader(im, im.blob_at(blob_idx)).field()
    except Exception: return '?'
