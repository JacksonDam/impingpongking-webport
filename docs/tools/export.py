#!/usr/bin/env python3
"""Build the port's asset + data payload out of the analysis workspace.

Everything written here is derived from the APK; nothing is authored.
"""
import json, os, sys, shutil, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = os.path.join(os.path.dirname(os.path.dirname(ROOT)), 'PingPongKing-webport')

SCENES = ['RivalModeScene', 'EyesightModeScene', 'ConcentrateModeScene',
          'InvertModeScene', 'HomeScene', 'DemoMode']


def sprite_index():
    S = json.load(open(os.path.join(ROOT, 'analysis', 'sprites.json')))
    idx = {}
    for s in S:
        idx[(s['file'], s['path_id'])] = s
    return idx


def resolve(sf_name, sf, pptr, idx):
    """PPtr -> sprite record, following the external file table."""
    fid, pid = pptr['fileID'], pptr['pathID']
    tgt = sf_name if fid == 0 else os.path.basename(sf.externals[fid-1])
    return idx.get((tgt, pid))


def spr_entry(s, atlas_names):
    """name -> compact record the port draws from."""
    an, aw, ah = s['atlas']
    tr = s['textureRect']; ro = s['textureRectOffset']; rc = s['rect']
    atlas_names.add(an)
    return [an,
            round(tr[0], 2), round(ah - (tr[1] + tr[3]), 2),   # x, y in top-down PNG space
            round(tr[2], 2), round(tr[3], 2),                  # w, h of the trimmed piece
            round(ro[0], 2), round(ro[1], 2),                  # offset inside the full sprite
            round(rc[2], 2), round(rc[3], 2)]                  # full sprite size


def rect_of(tr_rec):
    return {'pos': [round(v, 2) for v in tr_rec.get('anchoredPosition', tr_rec['localPosition'][:2])],
            'size': [round(v, 2) for v in tr_rec.get('sizeDelta', [0, 0])],
            'aMin': tr_rec.get('anchorMin', [0.5, 0.5]),
            'aMax': tr_rec.get('anchorMax', [0.5, 0.5]),
            'pivot': [round(v, 4) for v in tr_rec.get('pivot', [0.5, 0.5])],
            'scale': [round(v, 4) for v in tr_rec['localScale'][:2]],
            'rot': [round(v, 5) for v in tr_rec['localRotation']]}


def main():
    from unityfs import SerializedFile
    idx = sprite_index()
    objs, go, tr, comp, go_tr, path = build('level1')
    sf = SerializedFile(os.path.join(ROOT, 'rebuilt', 'level1'))

    atlas_names = set()
    sprites = {}
    def S(pptr):
        s = resolve('level1', sf, pptr, idx)
        if not s: return None
        if s['name'] not in sprites: sprites[s['name']] = spr_entry(s, atlas_names)
        return s['name']

    out = {'reference': [1280, 2272], 'scenes': {}, 'trails': {}, 'core': {}}

    # ---- ball trails, per scene
    for pid, c in comp.items():
        k = c.get('script')
        if k not in ('BallTrail_From', 'BallTrail_To', 'BallTrail_Lose'): continue
        p = path(c['gameObject'])
        if '/Scenes/' not in p: continue
        scene = p.split('/Scenes/')[1].split('/')[0]
        name = p.split('/')[-1]
        d = c['data']
        t = out['trails'].setdefault(scene, {})
        rec = {'kind': k[10:], 'frames': [S(x) for x in d['SpriteSequence']]}
        trr = tr.get(go_tr.get(c['gameObject']))
        if trr: rec['rect'] = rect_of(trr)
        img = comp.get(d['TrailImage']['pathID'])
        if k == 'BallTrail_From':
            rec.update(hitStart=d['HitBackStartFrame'], hitEnd=d['HitBackEndFrame'],
                       touchTable=d['TouchTableFrame'], toLose=d['ChangeToLoseTrailFrame'],
                       loseSeq=d['LoseBallSequence'],
                       midInterval=d['MiddleFrameInterval'], sideInterval=d['ManSideFrameInterval'],
                       effect=[round(v, 2) for v in d['TouchEffectPos'][:2]])
        elif k == 'BallTrail_To':
            rec.update(touchTable=d['TouchTableFrame'], loseSeq=d['LoseBallSequence'],
                       midInterval=d['MiddleFrameInterval'], sideInterval=d['ManSideFrameInterval'],
                       effect=[round(v, 2) for v in d['TouchEffectPos'][:2]])
        else:
            rec.update(interval=d['FrameInterval'])
        t[name] = rec

    # ---- Core component, per scene
    SEQ = ['TossBallTrialSequence', 'ManBTossBallSequence', 'NormalSwingSequence',
           'NormalA3SwingSequence', 'NormalB3SwingSequence', 'BlackSwingSequence',
           'BlackA3SwingSequence', 'BlackB3SwingSequence', 'TableEffectSpriteSequence']
    ONE = ['NothingSprite', 'NormalWinSprite', 'NormalLoseSprite', 'NormalTableSprite',
           'BlackTableSprite', 'BlackManWinSprite', 'BlackManLoseSprite']
    for pid, c in comp.items():
        if c.get('script') != 'Core': continue
        p = path(c['gameObject'])
        scene = p.split('/Scenes/')[1].split('/')[0]
        d = c['data']
        core = {k: [S(x) for x in d[k]] for k in SEQ}
        core.update({k: S(d[k]) for k in ONE})
        core['frames'] = {k: d[k] for k in ('hitBackStartFrame', 'hitBackEndFrame',
                                            'changeToLoseSequenceFrame', 'touchManATableFrame',
                                            'touchManBTableFrame')}
        out['core'][scene] = core

    # ---- scene layout: every RectTransform + Image/Text under each mode's Canvas
    for scene in SCENES:
        nodes = {}
        for pid, t in tr.items():
            gid = t['gameObject']
            p = path(gid)
            if '/Scenes/%s/' % scene not in p and not p.endswith('/Scenes/%s' % scene): continue
            _ = pid
            g = go.get(gid, {})
            rel = p.split('/Scenes/%s' % scene, 1)[1].lstrip('/')
            # sibling index decides paint order in Unity; without it the port
            # would layer by name and put the table over the players.
            fatherT = tr.get(t['father'])
            sib = fatherT['children'].index(pid) if fatherT and pid in fatherT['children'] else 0
            n = {'name': g.get('name'), 'active': g.get('active'), 'sib': sib,
                 'rect': rect_of(t), 'path': rel}
            for cp in g.get('components', []):
                cc = comp.get(cp['pathID'])
                if not cc: continue
                if cc.get('script') == 'UnityEngine.UI.Image':
                    sn = S(cc['sprite']) if cc['sprite']['pathID'] else None
                    n['image'] = {'sprite': sn, 'color': [round(v, 4) for v in cc['color']],
                                  'enabled': cc['enabled'], 'type': cc['type'],
                                  'fillAmount': round(cc['fillAmount'], 4)}
                elif cc.get('script') == 'UnityEngine.UI.Text':
                    n['text'] = {'text': cc['text'], 'size': cc['fontSize'],
                                 'align': cc['alignment'], 'color': [round(v, 4) for v in cc['color']],
                                 'style': cc['fontStyle'], 'lineSpacing': round(cc['lineSpacing'], 3),
                                 'enabled': cc['enabled']}
                elif cc.get('script') in ('BallTrail_From', 'BallTrail_To', 'BallTrail_Lose'):
                    n['trail'] = cc['script'][10:]
            nodes[rel] = n
        out['scenes'][scene] = nodes

    out['sprites'] = sprites
    out['levels'] = json.load(open(os.path.join(ROOT, 'analysis/data/levels.json')))['LevelDataList']
    out['groups'] = json.load(open(os.path.join(ROOT, 'analysis/data/groups.json')))['GroupJsonLists']

    os.makedirs(os.path.join(PORT, 'assets/data'), exist_ok=True)
    os.makedirs(os.path.join(PORT, 'assets/tex'), exist_ok=True)
    # emitted as a .js assignment, not .json: the port must run from file://,
    # where fetch() of a sibling file is blocked by the origin rules.
    with open(os.path.join(PORT, 'assets/data/game.js'), 'w') as f:
        f.write('window.__GAME=')
        json.dump(out, f, separators=(',', ':'))
        f.write(';\n')

    # ---- atlases actually referenced
    n = 0
    for a in sorted(atlas_names):
        src = os.path.join(ROOT, 'assets/tex', a + '.png')
        if os.path.exists(src):
            shutil.copy(src, os.path.join(PORT, 'assets/tex', a + '.png')); n += 1
        else:
            print('  MISSING atlas', a)
    print('sprites %d, atlases %d, trails %s' %
          (len(sprites), n, {k: len(v) for k, v in out['trails'].items()}))
    print('game.js %.1f KB' % (os.path.getsize(os.path.join(PORT, 'assets/data/game.js'))/1024))

if __name__ == '__main__':
    main()
