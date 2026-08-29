"""Unity SerializedFile reader (format v17, Unity 2018.1).

The analogue of SaveMyPC's uncrush.py/layout.py: this is what turns the shipped
asset blobs back into art, audio and -- crucially -- the scene-authored numbers
that the C# code reads but never states.
"""
import struct, io, os

CLASSES = {1:'GameObject',2:'Component',4:'Transform',8:'Behaviour',20:'Camera',
 21:'Material',23:'MeshRenderer',25:'Renderer',27:'Texture',28:'Texture2D',33:'MeshFilter',
 43:'Mesh',48:'Shader',49:'TextAsset',54:'Rigidbody',64:'MeshCollider',65:'BoxCollider',
 74:'AnimationClip',81:'AudioListener',82:'AudioSource',83:'AudioClip',84:'RenderTexture',
 89:'Cubemap',91:'AnimatorController',95:'Animator',102:'TextMesh',108:'Light',
 111:'Animation',114:'MonoBehaviour',115:'MonoScript',116:'MonoManager',119:'Projector',
 128:'Font',134:'PhysicsMaterial',135:'SphereCollider',136:'CapsuleCollider',
 142:'AssetBundle',147:'ResourceManager',150:'PreloadData',152:'MovieTexture',
 156:'TerrainData',157:'LightmapSettings',196:'NavMeshSettings',198:'ParticleSystem',
 199:'ParticleSystemRenderer',212:'SpriteRenderer',213:'Sprite',218:'Terrain',
 220:'LightProbeGroup',221:'AnimatorOverrideController',222:'CanvasRenderer',
 223:'Canvas',224:'RectTransform',225:'CanvasGroup',226:'BillboardAsset',
 240:'AudioMixer',244:'AudioMixerController',272:'ReflectionProbe',290:'AssetBundleManifest',
 320:'PlayableDirector',328:'VideoPlayer',329:'VideoClip',
 687078895:'SpriteAtlas',1953259897:'TerrainLayer'}


class Reader:
    def __init__(self, buf, off=0, little=True):
        self.b, self.p, self.le = buf, off, little
    def _f(self, c): return ('<' if self.le else '>') + c
    def u8(self):  v = self.b[self.p]; self.p += 1; return v
    def i8(self):  v = struct.unpack_from(self._f('b'), self.b, self.p)[0]; self.p += 1; return v
    def u16(self): v = struct.unpack_from(self._f('H'), self.b, self.p)[0]; self.p += 2; return v
    def i16(self): v = struct.unpack_from(self._f('h'), self.b, self.p)[0]; self.p += 2; return v
    def u32(self): v = struct.unpack_from(self._f('I'), self.b, self.p)[0]; self.p += 4; return v
    def i32(self): v = struct.unpack_from(self._f('i'), self.b, self.p)[0]; self.p += 4; return v
    def u64(self): v = struct.unpack_from(self._f('Q'), self.b, self.p)[0]; self.p += 8; return v
    def i64(self): v = struct.unpack_from(self._f('q'), self.b, self.p)[0]; self.p += 8; return v
    def f32(self): v = struct.unpack_from(self._f('f'), self.b, self.p)[0]; self.p += 4; return v
    def f64(self): v = struct.unpack_from(self._f('d'), self.b, self.p)[0]; self.p += 8; return v
    def boolean(self): return bool(self.u8())
    def bytes(self, n): v = self.b[self.p:self.p+n]; self.p += n; return v
    def align(self, n=4):
        r = self.p % n
        if r: self.p += n - r
    def cstring(self):
        e = self.b.index(b'\0', self.p)
        v = self.b[self.p:e].decode('utf-8', 'replace'); self.p = e + 1; return v
    def string(self):
        n = self.i32(); v = self.bytes(n).decode('utf-8', 'replace'); self.align(4); return v


class TypeNode:
    __slots__ = ('type','name','size','index','flags','level','children')
    def __init__(self): self.children = []
    def __repr__(self): return '%s %s' % (self.type, self.name)


class ObjectInfo:
    __slots__ = ('path_id','start','size','type_id','class_id','script_index','sf')
    def __repr__(self):
        return '<%s #%d @%d+%d>' % (CLASSES.get(self.class_id, self.class_id), self.path_id,
                                    self.start, self.size)
    def raw(self):
        return self.sf.data[self.start:self.start+self.size]
    def reader(self):
        return Reader(self.sf.data, self.start, self.sf.little)


class SerializedFile:
    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        self.data = open(path, 'rb').read()
        r = Reader(self.data, 0, little=False)
        self.meta_size = r.u32(); self.file_size = r.u32()
        self.version   = r.u32(); self.data_off  = r.u32()
        self.endianess = r.u8();  r.bytes(3)
        self.little = (self.endianess == 0)
        m = Reader(self.data, r.p, self.little)
        self.unity_version = m.cstring()
        self.target_platform = m.i32()
        self.enable_type_tree = m.boolean() if self.version >= 13 else True
        self.types = []
        for _ in range(m.i32()):
            self.types.append(self._read_type(m, False))
        self.big_id_enabled = 0
        if 7 <= self.version < 14:
            self.big_id_enabled = m.i32()
        self.objects = []
        for _ in range(m.i32()):
            o = ObjectInfo(); o.sf = self
            if self.version >= 14:
                m.align(4); o.path_id = m.i64()
            elif self.big_id_enabled: o.path_id = m.i64()
            else: o.path_id = m.i32()
            o.start = m.i32() + self.data_off
            o.size  = m.i32()
            o.type_id = m.i32()
            if self.version < 16:
                o.class_id = m.u16(); m.i16(); 
                if self.version == 15: m.u8()
                o.script_index = -1
            else:
                t = self.types[o.type_id]
                o.class_id = t['class_id']; o.script_index = t['script_index']
            self.objects.append(o)
        self.by_id = {o.path_id: o for o in self.objects}
        # script types
        self.script_types = []
        if self.version >= 11:
            for _ in range(m.i32()):
                fi = m.i32()
                if self.version >= 14: m.align(4); pid = m.i64()
                else: pid = m.i32()
                self.script_types.append((fi, pid))
        # externals
        self.externals = []
        for _ in range(m.i32()):
            m.cstring()
            guid = m.bytes(16) if self.version >= 5 else b''
            typ  = m.i32() if self.version >= 5 else 0
            self.externals.append(m.cstring())
        if self.version >= 20:
            for _ in range(m.i32()): self._read_type(m, True)
        self.user_information = m.cstring()

    def _read_type(self, m, is_ref):
        t = {}
        t['class_id'] = m.i32()
        t['stripped'] = m.boolean() if self.version >= 16 else False
        t['script_index'] = m.i16() if self.version >= 17 else -1
        if self.version >= 13:
            if (self.version < 16 and t['class_id'] < 0) or (self.version >= 16 and t['class_id'] == 114):
                t['script_hash'] = m.bytes(16)
            t['type_hash'] = m.bytes(16)
        t['tree'] = None
        if self.enable_type_tree:
            t['tree'] = self._read_tree(m)
        return t

    def _read_tree(self, m):
        n_nodes = m.i32(); str_size = m.i32()
        nodes = []
        for _ in range(n_nodes):
            nd = TypeNode()
            nd.level = m.u8() if self.version >= 19 else None
            if self.version >= 19:
                m.u8()          # type flags
                nd.type = m.u16(); nd.name = m.u16()   # string table offsets
                nd.size = m.i32(); nd.index = m.i32(); nd.flags = m.i32()
                m.bytes(8)
            nodes.append(nd)
        strtab = m.bytes(str_size)
        return nodes

    def of_class(self, name):
        cid = [k for k, v in CLASSES.items() if v == name]
        return [o for o in self.objects if o.class_id in cid]

    def counts(self):
        from collections import Counter
        return Counter(CLASSES.get(o.class_id, str(o.class_id)) for o in self.objects)


def open_all(dirpath, names=None):
    out = {}
    for fn in sorted(os.listdir(dirpath)):
        p = os.path.join(dirpath, fn)
        if not os.path.isfile(p): continue
        if names and fn not in names: continue
        try:
            sf = SerializedFile(p)
            if sf.version in (15, 16, 17, 18, 19, 20, 21): out[fn] = sf
        except Exception:
            pass
    return out
