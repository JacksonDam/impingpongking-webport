#!/usr/bin/env python3
"""Deserialize MonoBehaviour blobs using the C# field layout from Assembly-CSharp.

Type trees are stripped from the shipped files, so the layout has to come from
the assembly plus Unity's serialization rules.  The oracle is byte-exact: if the
layout is right, reading a component consumes exactly its object size.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile, Reader
from dnasm import load

# UnityEngine types that serialize as a PPtr (reference), not inline.
UO = set("""Object GameObject Component Behaviour MonoBehaviour ScriptableObject Transform
RectTransform Sprite Texture Texture2D Texture3D Cubemap RenderTexture Material Shader Mesh
AudioClip AudioSource AudioMixer AudioMixerGroup Font AnimationClip Animation Animator
RuntimeAnimatorController AnimatorController AnimatorOverrideController Camera Canvas
CanvasGroup CanvasRenderer Collider Collider2D Rigidbody Rigidbody2D Renderer SpriteRenderer
MeshRenderer MeshFilter ParticleSystem LineRenderer TrailRenderer Light Projector
PhysicMaterial PhysicsMaterial2D TextAsset VideoClip VideoPlayer SpriteAtlas
Image RawImage Text Button Slider Toggle ToggleGroup ScrollRect Scrollbar Dropdown InputField
Mask RectMask2D Graphic MaskableGraphic Selectable LayoutGroup HorizontalLayoutGroup
VerticalLayoutGroup GridLayoutGroup ContentSizeFitter LayoutElement AspectRatioFitter
Outline Shadow PositionAsUV1 GraphicRaycaster EventSystem StandaloneInputModule
Button.ButtonClickedEvent""".split())

# UnityEngine value types with a known inline layout: (kind, size-or-fields)
VT = {
 'UnityEngine.Vector2': ('f', 2), 'UnityEngine.Vector3': ('f', 3),
 'UnityEngine.Vector4': ('f', 4), 'UnityEngine.Quaternion': ('f', 4),
 'UnityEngine.Color': ('f', 4),   'UnityEngine.Rect': ('f', 4),
 'UnityEngine.Bounds': ('f', 6),  'UnityEngine.Matrix4x4': ('f', 16),
 'UnityEngine.Vector2Int': ('i', 2), 'UnityEngine.Vector3Int': ('i', 3),
 'UnityEngine.Color32': ('c32', 1), 'UnityEngine.LayerMask': ('i', 1),
}

PRIM_A = {'bool': 1, 'byte': 1, 'sbyte': 1}          # 1 byte, then align(4)
PRIM_B = {'short': 2, 'ushort': 2, 'char': 2}        # 2 bytes, then align(4)
PRIM_4 = {'int': 'i32', 'uint': 'u32', 'float': 'f32'}
PRIM_8 = {'long': 'i64', 'ulong': 'u64', 'double': 'f64'}


class Layout:
    def __init__(self, asm):
        self.a = asm
        self._ser = {}

    def is_unity_object(self, tname):
        if tname.startswith('UnityEngine.'):
            return tname.rsplit('.', 1)[-1] in UO
        t = self.a.by_name.get(tname)
        while t is not None:
            if t.base in ('UnityEngine.MonoBehaviour', 'UnityEngine.ScriptableObject',
                          'UnityEngine.Object', 'UnityEngine.Component',
                          'UnityEngine.Behaviour'): return True
            if t.base.startswith('UnityEngine.'):
                return t.base.rsplit('.', 1)[-1] in UO
            t = self.a.by_name.get(t.base)
        return False

    def is_unity_event(self, tname):
        """UnityEvent and every subclass, including generic ones like
        TriggerEvent : UnityEvent<BaseEventData> whose base is a TypeSpec."""
        t = self.a.by_name.get(tname)
        seen = 0
        while t is not None and seen < 12:
            b = t.base
            if b.startswith('UnityEngine.Events.UnityEvent'): return True
            t = self.a.by_name.get(b.split('<')[0]); seen += 1
        return tname.startswith('UnityEngine.Events.UnityEvent')

    def elem_kind(self, tname, depth=0):
        """-> a descriptor for one element of this type, or None if not serialized."""
        if tname in PRIM_A: return ('b1', tname)
        if tname in PRIM_B: return ('b2', tname)
        if tname in PRIM_4: return ('p4', PRIM_4[tname])
        if tname in PRIM_8: return ('p8', PRIM_8[tname])
        if tname == 'string': return ('str', None)
        if tname in VT: return ('vt', VT[tname])
        if self.is_unity_object(tname): return ('pptr', None)
        if self.is_unity_event(tname): return ('uevent', None)
        t = self.a.by_name.get(tname)
        if t is not None:
            if t.is_enum:
                und = next((f.ftype for f in t.fields if not f.static and not f.literal), 'int')
                return self.elem_kind(und, depth)
            if t.flags & 0x2000 and depth < 8:          # [Serializable]
                return ('obj', tname)
        return None

    def field_kind(self, ftype, depth=0):
        if ftype.endswith('[]'):
            k = self.elem_kind(ftype[:-2], depth+1)
            return ('arr', k) if k else None
        if ftype.startswith('System.Collections.Generic.List<') and ftype.endswith('>'):
            inner = ftype[len('System.Collections.Generic.List<'):-1]
            k = self.elem_kind(inner, depth+1)
            return ('arr', k) if k else None
        return self.elem_kind(ftype, depth)

    def fields_of(self, tname, depth=0):
        """Serialized fields, base class first, in declaration order."""
        if (tname, depth) in self._ser: return self._ser[(tname, depth)]
        t = self.a.by_name.get(tname)
        if t is None: return []
        out = []
        # walk the whole chain up to the engine roots -- UI.Image's fields mostly
        # live on Graphic/MaskableGraphic, which are themselves UnityEngine.UI types.
        ROOTS = ('UnityEngine.MonoBehaviour', 'UnityEngine.ScriptableObject',
                 'UnityEngine.Behaviour', 'UnityEngine.Component', 'UnityEngine.Object')
        if t.base and t.base not in ROOTS and t.base in self.a.by_name:
            out += self.fields_of(t.base, depth)
        for f in t.fields:
            if f.static or f.literal or f.initonly: continue
            if f.row.Flags & 0x0080: continue                      # NotSerialized
            if not (f.public or 'UnityEngine.SerializeField' in f.attrs): continue
            # NOTE: EventTrigger.delegates is public *and* [Obsolete]; Unity still
            # writes it (as an empty list).  Verified by the byte-exact oracle.
            k = self.field_kind(f.ftype, depth)
            if k is None: continue
            out.append((f.name, f.ftype, k))
        self._ser[(tname, depth)] = out
        return out

    # ---------------------------------------------------------------- reading
    def read_kind(self, r, k):
        tag, arg = k
        if tag == 'b1':
            v = r.u8(); r.align(4); return bool(v) if arg == 'bool' else v
        if tag == 'b2': v = r.u16(); r.align(4); return v
        if tag == 'p4': return getattr(r, arg)()
        if tag == 'p8': return getattr(r, arg)()
        if tag == 'str': return r.string()
        if tag == 'pptr': return {'fileID': r.i32(), 'pathID': r.i64()}
        if tag == 'vt':
            kind, n = arg
            if kind == 'f': return [r.f32() for _ in range(n)]
            if kind == 'i': return [r.i32() for _ in range(n)]
            if kind == 'c32': v = r.u32(); return [v & 255, (v>>8)&255, (v>>16)&255, (v>>24)&255]
        if tag == 'uevent':
            calls = []
            for _ in range(r.i32()):
                c = {'target': {'fileID': r.i32(), 'pathID': r.i64()},
                     'method': r.string(), 'mode': r.i32(),
                     'arg_obj': {'fileID': r.i32(), 'pathID': r.i64()},
                     'arg_asmtype': r.string(), 'arg_int': r.i32(),
                     'arg_float': r.f32(), 'arg_str': r.string()}
                c['arg_bool'] = bool(r.u8()); r.align(4)
                c['callState'] = r.i32()
                calls.append(c)
            r.align(4)
            return {'calls': calls, 'typeName': r.string()}
        if tag == 'obj': return self.read_obj(r, arg)
        if tag == 'arr':
            n = r.i32()
            v = [self.read_kind(r, arg) for _ in range(n)]
            r.align(4)
            return v
        raise ValueError('kind %r' % (k,))

    def read_obj(self, r, tname):
        return {n: self.read_kind(r, k) for n, _, k in self.fields_of(tname)}


class MultiAssembly:
    """by_name across several assemblies -- UI components live in UnityEngine.UI.dll."""
    def __init__(self, paths):
        self.asms = [load(p) for p in paths]
        self.by_name = {}
        self.attrs = {}
        for a in self.asms:
            for k, v in a.by_name.items(): self.by_name.setdefault(k, v)
            self.attrs.update(a.attrs)
        self.types = [t for a in self.asms for t in a.types]


class Project:
    def __init__(self, root):
        self.root = root
        mg = os.path.join(root, 'extracted/assets/bin/Data/Managed')
        self.a = MultiAssembly([os.path.join(mg, n) for n in
                                ('Assembly-CSharp.dll', 'UnityEngine.UI.dll',
                                 'Assembly-CSharp-firstpass.dll',
                                 'UnityEngine.CoreModule.dll',
                                 'UnityEngine.TextRenderingModule.dll',
                                 'UnityEngine.dll')])
        self.L = Layout(self.a)
        self.files = {}
        self.scripts = {}          # (file, pathID) -> class name
        gg = self.open('globalgamemanagers.assets')
        for o in gg.of_class('MonoScript'):
            r = o.reader(); r.string(); r.i32(); r.bytes(16)
            cn = r.string(); ns = r.string(); asmn = r.string()
            self.scripts[('globalgamemanagers.assets', o.path_id)] = (ns + '.' + cn) if ns else cn

    def open(self, name):
        if name not in self.files:
            self.files[name] = SerializedFile(os.path.join(self.root, 'rebuilt', name))
        return self.files[name]

    def script_of(self, sf, pptr):
        fid, pid = pptr
        if fid == 0: tgt = sf.name
        else:
            ext = sf.externals[fid-1]
            tgt = os.path.basename(ext)
        return self.scripts.get((tgt, pid))

    def read_behaviour(self, o):
        sf = o.sf
        r = o.reader()
        go = (r.i32(), r.i64())
        enabled = r.u8(); r.align(4)
        sc = (r.i32(), r.i64())
        name = r.string()
        cls = self.script_of(sf, sc)
        rec = {'path_id': o.path_id, 'class': cls, 'name': name,
               'gameObject': go[1], 'enabled': bool(enabled)}
        if cls is None or cls not in self.a.by_name:
            rec['unparsed'] = o.size - (r.p - o.start); return rec
        try:
            rec['data'] = self.L.read_obj(r, cls)
        except Exception as e:
            rec['error'] = '%s: %s' % (type(e).__name__, e); return rec
        rec['left'] = o.size - (r.p - o.start)
        return rec


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    P = Project(root)
    import collections
    stats = collections.Counter(); bad = collections.Counter(); out = {}
    for fn in ('level0', 'level1', 'sharedassets1.assets'):
        sf = P.open(fn)
        recs = []
        for o in sf.of_class('MonoBehaviour'):
            rec = P.read_behaviour(o)
            recs.append(rec)
            c = rec.get('class') or '<unknown script>'
            if 'data' in rec and rec.get('left') == 0: stats[c] += 1
            else: bad[(c, rec.get('error', 'left=%s' % rec.get('left', rec.get('unparsed'))))] += 1
        out[fn] = recs
    tot_ok = sum(stats.values()); tot_bad = sum(bad.values())
    print('MonoBehaviours: %d exact, %d not exact' % (tot_ok, tot_bad))
    print('--- exact ---')
    for k, v in stats.most_common(30): print('  %4d %s' % (v, k))
    print('--- not exact ---')
    for (c, e), v in bad.most_common(30): print('  %4d %-34s %s' % (v, c, str(e)[:60]))
    with open(os.path.join(root, 'analysis', 'behaviours.json'), 'w') as f:
        json.dump(out, f, indent=1)
    print('-> analysis/behaviours.json')

if __name__ == '__main__':
    main()
