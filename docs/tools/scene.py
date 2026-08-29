#!/usr/bin/env python3
"""Rebuild the Unity scene graph: hierarchy, RectTransform geometry, sprites, text.

Native classes and the UI components have no type tree in a player build, so
their layouts are written out explicitly for Unity 2018.1 here.  Every one is
checked byte-exactly against the object size before it is trusted.
"""
import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile, Reader, CLASSES
from mono import Project


def pptr(r):  return {'fileID': r.i32(), 'pathID': r.i64()}
def v2(r):    return [r.f32(), r.f32()]
def v3(r):    return [r.f32(), r.f32(), r.f32()]
def v4(r):    return [r.f32(), r.f32(), r.f32(), r.f32()]


def read_gameobject(o):
    r = o.reader()
    n = r.i32()
    comps = [pptr(r) for _ in range(n)]        # 5.5+: bare PPtr, no leading int
    layer = r.i32()
    name = r.string()
    tag = r.u16()
    active = r.u8()                       # no trailing align on GameObject
    return {'components': comps, 'layer': layer, 'name': name, 'tag': tag,
            'active': bool(active), '_left': o.size - (r.p - o.start)}


def read_transform(o, rect=False):
    r = o.reader()
    go = pptr(r)
    rot = v4(r); pos = v3(r); scale = v3(r)
    kids = [pptr(r) for _ in range(r.i32())]
    father = pptr(r)
    d = {'gameObject': go['pathID'], 'localRotation': rot, 'localPosition': pos,
         'localScale': scale, 'children': [k['pathID'] for k in kids],
         'father': father['pathID']}
    if rect:
        d['anchorMin'] = v2(r); d['anchorMax'] = v2(r)
        d['anchoredPosition'] = v2(r); d['sizeDelta'] = v2(r); d['pivot'] = v2(r)
    d['_left'] = o.size - (r.p - o.start)
    return d


def read_unityevent(r):
    """UnityEvent: m_PersistentCalls.m_Calls."""
    calls = []
    for _ in range(r.i32()):
        c = {'target': pptr(r), 'method': r.string(), 'mode': r.i32()}
        c['arg_obj'] = pptr(r); c['arg_asmtype'] = r.string()
        c['arg_int'] = r.i32(); c['arg_float'] = r.f32(); c['arg_str'] = r.string()
        c['arg_bool'] = bool(r.u8()); r.align(4)
        c['callState'] = r.i32()
        calls.append(c)
    r.align(4)
    tname = r.string()                    # UnityEventBase.m_TypeName
    return {'calls': calls, 'typeName': tname}


def read_graphic(r):
    """Graphic + MaskableGraphic serialized prefix, shared by Image/Text/RawImage."""
    g = {'material': pptr(r), 'color': v4(r)}
    g['raycastTarget'] = bool(r.u8()); r.align(4)
    g['onCullStateChanged'] = read_unityevent(r)
    return g


def read_image(o, hdr):
    r = hdr
    d = read_graphic(r)
    d['sprite'] = pptr(r)
    d['type'] = r.i32()
    # each bool carries its own align(4); m_UseSpriteMesh does not exist in 2018.1
    d['preserveAspect'] = bool(r.u8()); r.align(4)
    d['fillCenter'] = bool(r.u8()); r.align(4)
    d['fillMethod'] = r.i32()
    d['fillAmount'] = r.f32()
    d['fillClockwise'] = bool(r.u8()); r.align(4)
    d['fillOrigin'] = r.i32()
    return d


def read_text(o, hdr):
    r = hdr
    d = read_graphic(r)
    # m_FontData : FontData
    d['font'] = pptr(r)
    d['fontSize'] = r.i32()
    d['fontStyle'] = r.i32()
    d['bestFit'] = bool(r.u8()); r.align(4)
    d['minSize'] = r.i32(); d['maxSize'] = r.i32()
    d['alignment'] = r.i32()
    d['alignByGeometry'] = bool(r.u8()); r.align(4)
    d['richText'] = bool(r.u8()); r.align(4)
    d['horizontalOverflow'] = r.i32(); d['verticalOverflow'] = r.i32()
    d['lineSpacing'] = r.f32()
    d['text'] = r.string()
    return d


def mb_header(o):
    r = o.reader()
    go = pptr(r); enabled = r.u8(); r.align(4); script = pptr(r); name = r.string()
    return r, go, enabled, script, name


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    P = Project(root)
    stats = collections.Counter()
    out = {}
    for fn in ('level0', 'level1', 'sharedassets1.assets'):
        sf = P.open(fn)
        objs = {}
        for o in sf.objects:
            cls = CLASSES.get(o.class_id, str(o.class_id))
            try:
                if cls == 'GameObject':      d = read_gameobject(o)
                elif cls == 'Transform':     d = read_transform(o, False)
                elif cls == 'RectTransform': d = read_transform(o, True)
                elif cls == 'MonoBehaviour':
                    r, go, en, sc, nm = mb_header(o)
                    kls = P.script_of(sf, (sc['fileID'], sc['pathID']))
                    d = {'script': kls, 'gameObject': go['pathID'],
                         'enabled': bool(en), 'name': nm}
                    if kls == 'UnityEngine.UI.Image':  d.update(read_image(o, r))
                    elif kls == 'UnityEngine.UI.Text': d.update(read_text(o, r))
                    elif kls and kls in P.a.by_name:
                        try: d['data'] = P.L.read_obj(r, kls)
                        except Exception as e: d['error'] = str(e)
                    d['_left'] = o.size - (r.p - o.start)
                else:
                    continue
            except Exception as e:
                stats[(cls, 'EXC')] += 1; continue
            d['_class'] = cls
            key = d.get('script') or cls
            stats[(key, 'exact' if d.get('_left') == 0 else 'left=%s' % d.get('_left'))] += 1
            objs[o.path_id] = d
        out[fn] = objs
    ok = sum(v for (k, s), v in stats.items() if s == 'exact')
    bad = sum(v for (k, s), v in stats.items() if s != 'exact')
    print('scene objects: %d exact, %d not' % (ok, bad))
    print('--- not exact ---')
    for (k, s), v in sorted(stats.items(), key=lambda kv: -kv[1]):
        if s != 'exact': print('  %5d %-40s %s' % (v, k, s))
    with open(os.path.join(root, 'analysis', 'scene.json'), 'w') as f:
        json.dump(out, f, indent=1)
    print('-> analysis/scene.json')

if __name__ == '__main__':
    main()
