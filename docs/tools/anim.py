#!/usr/bin/env python3
"""AnimationClip reader (Unity 2018.1, generic/streamed clips).

Player builds carry no type tree, so the clip is located by its own landmarks:
the binding table is found from the CRC32 hashes of the object paths in the
scene, and the streamed curve data is found by the length prefix that matches
the gap in front of it.  Both are verified before anything is emitted.
"""
import sys, os, struct, zlib, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile

U32 = lambda d, o: struct.unpack_from('<I', d, o)[0]
I32 = lambda d, o: struct.unpack_from('<i', d, o)[0]
F32 = lambda d, o: struct.unpack_from('<f', d, o)[0]

crc = lambda s: zlib.crc32(s.encode()) & 0xFFFFFFFF

ATTRS = ['m_IsActive', 'm_LocalPosition.x', 'm_LocalPosition.y', 'm_LocalPosition.z',
         'm_AnchoredPosition.x', 'm_AnchoredPosition.y', 'm_LocalScale.x', 'm_LocalScale.y',
         'm_LocalScale.z', 'm_Color.r', 'm_Color.g', 'm_Color.b', 'm_Color.a',
         'm_SizeDelta.x', 'm_SizeDelta.y', 'm_LocalRotation.x', 'm_LocalRotation.y',
         'm_LocalRotation.z', 'm_LocalRotation.w', 'm_FillAmount', 'm_Alpha',
         'localEulerAnglesRaw.z', 'm_LocalEulerAnglesHint.z']
ATTR_BY_CRC = {crc(a): a for a in ATTRS}

# Transform bindings do not use a CRC: Unity stores a small enum, and each one
# occupies several consecutive curve slots.
TRANSFORM_ATTR = {1: ('position', 3), 2: ('rotation', 4), 3: ('scale', 3),
                  4: ('euler', 3), 5: ('eulerHint', 3)}

def attr_name(a, tid):
    if tid in (4, 224) and a in TRANSFORM_ATTR: return TRANSFORM_ATTR[a][0]
    return ATTR_BY_CRC.get(a, '#%08x' % a)

def attr_width(a, tid):
    if tid in (4, 224) and a in TRANSFORM_ATTR: return TRANSFORM_ATTR[a][1]
    return 1


def find_bindings(d, path_by_crc, want_curves=None):
    """Locate m_ClipBindingConstant.genericBindings by its 28-byte stride.

    The oracle: every path hash must be a real object in the scene, and the
    widths of the bindings must add up to exactly the clip's curve count."""
    best = None
    for off in range(0, len(d) - 32, 4):
        n = U32(d, off)
        if not (1 <= n <= 400): continue
        if off + 4 + n * 28 > len(d): continue
        width = 0
        for i in range(n):
            b = off + 4 + i * 28
            p, a = U32(d, b), U32(d, b + 4)
            tid = I32(d, b + 20)
            if tid not in (1, 4, 95, 114, 212, 213, 223, 224): break
            if p not in path_by_crc: break
            width += attr_width(a, tid)
        else:
            if want_curves is not None and width != want_curves: continue
            if best is None or n > best[1]: best = (off, n)
    if best is None: return None, []
    off, n = best
    out, ci = [], 0
    for i in range(n):
        b = off + 4 + i * 28
        p, a = U32(d, b), U32(d, b + 4)
        tid = I32(d, b + 20)
        w = attr_width(a, tid)
        out.append({'path': path_by_crc.get(p, '#%08x' % p),
                    'attr': attr_name(a, tid), 'typeID': tid,
                    'curve': ci, 'width': w,
                    'custom': d[b + 24], 'isPPtr': d[b + 25]})
        ci += w
    return off, out


def find_streamed(d, end_hint):
    """m_StreamedClip.data is a uint32[] whose length prefix must match the gap."""
    for S in range(8, end_hint, 4):
        n = (end_hint - S) // 4
        if n > 8 and U32(d, S - 4) == n:
            return S, end_hint
    return None, None


def read_frames(d, s, e):
    """StreamedFrame { time, curveCount, StreamedCurveKey{ index, coeff[4] } }"""
    frames, p = [], s
    while p + 8 <= e:
        t = F32(d, p); n = I32(d, p + 4); p += 8
        if n < 0 or p + n * 20 > e: break
        keys = []
        for _ in range(n):
            idx = I32(d, p)
            co = struct.unpack_from('<4f', d, p + 4)
            keys.append((idx, co)); p += 20
        frames.append({'t': t, 'keys': keys})
        if t == float('inf'): break
    return frames


def read_events(d):
    """m_Events: time, functionName, data, PPtr, float, int, int."""
    import re
    out = []
    for m in re.finditer(rb'[A-Za-z_][A-Za-z0-9_]{3,40}', d):
        off = m.start()
        if off < 8: continue
        s = m.group().decode()
        if U32(d, off - 4) != len(s): continue
        t = F32(d, off - 8)
        if 0 <= t <= 600: out.append({'t': round(t, 5), 'fn': s})
    return out


def read_clip(o, path_by_crc):
    d = o.sf.data[o.start:o.start + o.size]
    r = o.reader(); name = r.string()
    boff, bindings = find_bindings(d, path_by_crc)
    if boff is None: return None
    # the clip data ends just before m_StreamedClip.curveCount, which is followed
    # by the DenseClip header; walk back from the binding table to find it.
    end = None
    for cand in range(boff, 8, -4):
        if abs(F32(d, cand) - 60.0) < 1e-6:            # DenseClip.m_SampleRate
            # DenseClip is { m_FrameCount, m_CurveCount, m_SampleRate, ... }, so
            # StreamedClip.curveCount sits 12 bytes before the sample rate.
            end = cand - 12
            break
    if end is None: return None
    curve_count = U32(d, end)                           # StreamedClip.curveCount
    # re-find the bindings now that the true curve count is known
    boff2, b2 = find_bindings(d, path_by_crc, curve_count)
    if boff2 is not None: boff, bindings = boff2, b2
    S, E = find_streamed(d, end)
    if S is None: return None
    frames = read_frames(d, S, E)

    # walk the remaining Clip members to reach m_StartTime / m_StopTime
    p = end + 4                                         # past StreamedClip.curveCount
    p += 4 + 4 + 4 + 4                                  # DenseClip head
    p += 4 + U32(d, p) * 4                              # DenseClip.m_SampleArray
    p += 4 + U32(d, p) * 4                              # ConstantClip.data
    nb = U32(d, p); p += 4 + nb * 16                    # m_Binding : ValueArrayConstant
    start, stop = F32(d, p), F32(d, p + 4)
    if not (0 <= start <= stop <= 600):                 # sanity, else fall back
        stop = max([f['t'] for f in frames if f['t'] != float('inf')] or [0])
    return {'name': name, 'bindings': bindings, 'curveCount': curve_count,
            'frames': frames, 'stopTime': stop, 'dataRange': [S, E],
            'events': read_events(d)}


def sample(clip, fps=60):
    """Turn the streamed cubics into one keyframe track per curve index.

    A curve index addresses a single float.  A transform binding covers three or
    four of them, and in a streamed clip each is keyed independently, so folding
    them into one keyframe list would silently drop keys."""
    B = clip['bindings']
    tracks = []
    for bi, b in enumerate(B):
        for c in range(b.get('width', 1)):
            tracks.append({'path': b['path'], 'attr': b['attr'], 'typeID': b['typeID'],
                           'comp': c, 'width': b.get('width', 1),
                           'curve': b.get('curve', bi) + c, 'keys': []})
    by_curve = {t['curve']: t for t in tracks}
    fr = [f for f in clip['frames'] if f['t'] not in (float('inf'), float('-inf'))]
    for f in fr:
        for idx, co in f['keys']:
            t = by_curve.get(idx)
            if t is None: continue
            tv = round(max(0.0, f['t']), 5)
            if t['keys'] and abs(t['keys'][-1]['t'] - tv) < 1e-6:
                t['keys'][-1]['v'] = round(co[3], 4)
            else:
                t['keys'].append({'t': tv, 'v': round(co[3], 4)})
    return [t for t in tracks if t['keys']]


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.join(root, 'tools'))
    from q import build
    objs, go, tr, comp, go_tr, path = build('level0')
    # every object path relative to each possible animator root
    path_by_crc = {0: ''}
    for gid, g in go.items():
        p = path(gid)
        for strip in ('OGSplash/', 'OGSplash/View/', ''):
            if p.startswith(strip):
                rel = p[len(strip):]
                if rel: path_by_crc[crc(rel)] = rel
    sf = SerializedFile(os.path.join(root, 'rebuilt', 'sharedassets0.assets'))
    out = {}
    for o in sf.of_class('AnimationClip'):
        c = read_clip(o, path_by_crc)
        if not c:
            r = o.reader(); print('  UNREAD', r.string()); continue
        ks = sample(c)
        print('=== %-22s stop=%.4f  curves=%d  frames=%d' %
              (c['name'], c['stopTime'], c['curveCount'], len(c['frames'])))
        for t in ks:
            lbl = t['attr'] + ('.' + 'xyzw'[t['comp']] if t.get('width', 1) != 1 else '')
            print('    %-22s %-18s %s' % (t['path'], lbl,
                  ' '.join('%g@%g' % (x['v'], x['t']) for x in t['keys'])))
        out[c['name']] = {'stopTime': round(c['stopTime'], 5), 'tracks': ks,
                          'events': c.get('events', [])}
    with open(os.path.join(root, 'analysis', 'anim.json'), 'w') as f:
        json.dump(out, f, indent=1)
    print('-> analysis/anim.json')

if __name__ == '__main__':
    main()
