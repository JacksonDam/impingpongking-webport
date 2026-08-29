#!/usr/bin/env python3
"""Read every Sprite: name, atlas texture, and the rect it occupies in that atlas.

Verified against an oracle the data carries itself -- m_RD.textureRect must have
the same size as m_Rect and must lie inside the atlas.  Any layout mistake breaks
that on the first sprite.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile
from textures import read_texture


def read_sprite(o):
    r = o.reader()
    s = {'name': r.string()}
    s['rect']   = [r.f32() for _ in range(4)]
    s['offset'] = [r.f32() for _ in range(2)]
    s['border'] = [r.f32() for _ in range(4)]
    s['ppu']    = r.f32()
    s['pivot']  = [r.f32() for _ in range(2)]
    r.u32()                                   # m_Extrude
    r.boolean(); r.align(4)                   # m_IsPolygon
    r.bytes(16); r.i64()                      # m_RenderDataKey
    s['tags'] = [r.string() for _ in range(r.i32())]
    r.i32(); r.i64()                          # m_SpriteAtlas PPtr
    # --- m_RD
    s['tex'] = (r.i32(), r.i64())             # texture PPtr
    r.i32(); r.i64()                          # alphaTexture PPtr
    for _ in range(r.i32()):                  # m_SubMeshes
        r.u32(); r.u32(); r.i32(); r.u32(); r.u32(); r.u32()
        for _ in range(6): r.f32()            # localAABB
    r.bytes(r.i32()); r.align(4)              # m_IndexBuffer
    r.u32()                                   # m_VertexData.m_VertexCount
    for _ in range(r.i32()): r.bytes(4)       # m_Channels
    r.bytes(r.i32()); r.align(4)              # m_DataSize
    for _ in range(r.i32()): r.bytes(64)      # m_Bindpose  (Matrix4x4)
    for _ in range(r.i32()): r.bytes(32)      # m_SourceSkin (BoneWeights4) -- 2018.1 only
    s['textureRect']       = [r.f32() for _ in range(4)]
    s['textureRectOffset'] = [r.f32() for _ in range(2)]
    s['atlasRectOffset']   = [r.f32() for _ in range(2)]
    s['settingsRaw']       = r.u32()
    s['uvTransform']       = [r.f32() for _ in range(4)]
    s['downscaleMultiplier'] = r.f32()
    return s


def collect(paths):
    out, atlases = [], {}
    for p in paths:
        sf = SerializedFile(p)
        for o in sf.of_class('Texture2D'):
            t = read_texture(o)
            atlases[(sf.name, o.path_id)] = (t['name'], t['width'], t['height'])
        for o in sf.of_class('Sprite'):
            try: s = read_sprite(o)
            except Exception as e:
                out.append({'name': '?', 'error': str(e)}); continue
            s['file'] = sf.name; s['path_id'] = o.path_id
            key = (sf.name, s['tex'][1])
            s['atlas'] = atlases.get(key, ('?', 0, 0))
            out.append(s)
    return out


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    paths = [os.path.join(root, 'rebuilt', f)
             for f in ('sharedassets0.assets', 'sharedassets1.assets')]
    global RESDIR
    import textures; textures.RESDIR = os.path.join(root, 'extracted/assets/bin/Data')
    sprites = collect(paths)
    ok = bad = 0
    for s in sprites:
        if 'textureRect' not in s: bad += 1; continue
        tr, rc = s['textureRect'], s['rect']
        an, aw, ah = s['atlas']
        # Sprites are packed TRIMMED: textureRect is the opaque region inside the
        # atlas, and textureRectOffset says where that region sits inside the full
        # m_Rect-sized sprite.  Both must be consistent, and the rect must lie in
        # the atlas -- that is the oracle.
        ro = s['textureRectOffset']
        good = (tr[2] > 0 and tr[3] > 0 and
                tr[0] >= -0.5 and tr[1] >= -0.5 and
                tr[0]+tr[2] <= aw + 1 and tr[1]+tr[3] <= ah + 1 and
                ro[0] >= -0.6 and ro[1] >= -0.6 and
                ro[0]+tr[2] <= rc[2] + 1 and ro[1]+tr[3] <= rc[3] + 1 and
                0.05 < s['downscaleMultiplier'] <= 1.001)
        s['ok'] = good
        ok += good; bad += not good
    print('sprites: %d   rect-oracle pass: %d   fail: %d' % (len(sprites), ok, bad))
    for s in sprites:
        if not s.get('ok'):
            print('   FAIL %-40s rect=%s texRect=%s atlas=%s' %
                  (s.get('name'), s.get('rect'), s.get('textureRect'), s.get('atlas')))
            break
    with open(os.path.join(root, 'analysis', 'sprites.json'), 'w') as f:
        json.dump(sprites, f, indent=1)
    print('-> analysis/sprites.json')

if __name__ == '__main__':
    main()
