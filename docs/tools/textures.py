#!/usr/bin/env python3
"""Extract every Texture2D to PNG.  Unity 2018.1 layout, type trees stripped."""
import sys, os, struct, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile, Reader

FMT = {1:'Alpha8',2:'ARGB4444',3:'RGB24',4:'RGBA32',5:'ARGB32',7:'RGB565',
       10:'DXT1',12:'DXT5',13:'RGBA4444',14:'BGRA32',30:'PVRTC_RGB2',31:'PVRTC_RGBA2',
       32:'PVRTC_RGB4',33:'PVRTC_RGBA4',34:'ETC_RGB4',45:'ETC2_RGB',46:'ETC2_RGBA1',
       47:'ETC2_RGBA8',48:'ASTC_RGB_4x4',49:'ASTC_RGB_5x5',50:'ASTC_RGB_6x6',
       51:'ASTC_RGB_8x8',52:'ASTC_RGB_10x10',53:'ASTC_RGB_12x12',54:'ASTC_RGBA_4x4',
       55:'ASTC_RGBA_5x5',56:'ASTC_RGBA_6x6',57:'ASTC_RGBA_8x8'}


def read_texture(o):
    """-> dict(name,width,height,fmt,data) ; data is raw bytes (possibly streamed)."""
    sf = o.sf
    r = o.reader()
    t = {}
    t['name'] = r.string()
    r.i32()                      # m_ForcedFallbackFormat
    r.boolean(); r.align(4)      # m_DownscaleFallback
    t['width']  = r.i32()
    t['height'] = r.i32()
    t['complete_size'] = r.i32()
    t['fmt'] = r.i32()
    t['mips'] = r.i32()
    r.boolean(); r.boolean(); r.align(4)     # m_IsReadable, m_IsPreProcessed
    t['image_count'] = r.i32()
    t['dimension']   = r.i32()
    r.i32(); r.i32(); r.f32(); r.i32(); r.i32(); r.i32()   # GLTextureSettings
    t['lightmap_format'] = r.i32()
    t['color_space']     = r.i32()
    n = r.i32()
    data = r.bytes(n)
    t['stream'] = None
    if n == 0:
        off = r.u32(); size = r.u32(); path = r.string()
        t['stream'] = (path, off, size)
        p = os.path.join(RESDIR, os.path.basename(path.rstrip('/')))
        if path and os.path.isfile(p):
            with open(p, 'rb') as f:
                f.seek(off); data = f.read(size)
    t['data'] = data
    return t


def png(width, height, rgba):
    """Minimal RGBA8 PNG writer (rows are bottom-up in Unity, flip here)."""
    raw = bytearray()
    stride = width * 4
    for y in range(height - 1, -1, -1):
        raw.append(0)
        raw += rgba[y*stride:(y+1)*stride]
    def chunk(tag, body):
        c = struct.pack('>I', len(body)) + tag + body
        return c + struct.pack('>I', zlib.crc32(tag + body) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
            + chunk(b'IEND', b''))


def to_rgba(t):
    f, w, h, d = t['fmt'], t['width'], t['height'], t['data']
    need = w * h
    if f == 4:                                   # RGBA32
        return d[:need*4]
    if f == 5:                                   # ARGB32
        out = bytearray(need*4)
        for i in range(need):
            a, r_, g, b = d[i*4:i*4+4]
            out[i*4:i*4+4] = bytes((r_, g, b, a))
        return bytes(out)
    if f == 14:                                  # BGRA32
        out = bytearray(d[:need*4])
        out[0::4], out[2::4] = out[2::4], out[0::4]
        return bytes(out)
    if f == 3:                                   # RGB24
        out = bytearray(need*4)
        for i in range(need):
            out[i*4:i*4+3] = d[i*3:i*3+3]; out[i*4+3] = 255
        return bytes(out)
    if f == 1:                                   # Alpha8
        out = bytearray(need*4)
        for i in range(need):
            out[i*4:i*4+3] = b'\xff\xff\xff'; out[i*4+3] = d[i]
        return bytes(out)
    # block-compressed: hand off to texture2ddecoder, then BGRA -> RGBA
    try:
        import texture2ddecoder as t2d
    except ImportError:
        return None
    fn = {47: t2d.decode_etc2a8, 45: t2d.decode_etc2, 46: t2d.decode_etc2a1,
          34: t2d.decode_etc1, 10: t2d.decode_bc1, 12: t2d.decode_bc3,
          30: t2d.decode_pvrtc, 32: t2d.decode_pvrtc}.get(f)
    if fn is None: return None
    if f in (30, 32):
        bgra = fn(d, w, h, f in (30, 31))
    else:
        bgra = fn(d, w, h)
    out = bytearray(bgra)
    out[0::4], out[2::4] = out[2::4], out[0::4]      # BGRA -> RGBA
    return bytes(out)


RESDIR = ''

def main():
    global RESDIR
    src, RESDIR, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(dst, exist_ok=True)
    sf = SerializedFile(src)
    from collections import Counter
    fc = Counter(); n = 0; skipped = []
    for o in sf.of_class('Texture2D'):
        t = read_texture(o)
        fc[FMT.get(t['fmt'], t['fmt'])] += 1
        rgba = to_rgba(t)
        if rgba is None or len(rgba) < t['width']*t['height']*4:
            skipped.append((t['name'], FMT.get(t['fmt'], t['fmt']), len(t['data'])))
            continue
        safe = ''.join(c if c.isalnum() or c in '-_.() ' else '_' for c in t['name'])
        with open(os.path.join(dst, '%s.png' % safe), 'wb') as f:
            f.write(png(t['width'], t['height'], rgba))
        n += 1
    print('%s: wrote %d PNGs; formats %s' % (os.path.basename(src), n, dict(fc)))
    for s in skipped[:10]: print('   skipped', s)

if __name__ == '__main__':
    main()
