#!/usr/bin/env python3
"""Build the port's asset + data payload out of the analysis workspace.

Emits every scene, every prefab, every game-script component and every sprite
the game can name.  Nothing here is authored; it is all read from the APK.
"""
import json, os, sys, shutil, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile
import textures
from textures import read_texture
from q import build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = os.path.join(os.path.dirname(os.path.dirname(ROOT)), 'PingPongKing-webport')
textures.RESDIR = os.path.join(ROOT, 'extracted/assets/bin/Data')

MODE_SCENES = ['RivalModeScene', 'EyesightModeScene', 'ConcentrateModeScene', 'InvertModeScene']

# component scripts whose authored values the port needs
KEEP = set("""Core BallTrail_From BallTrail_To BallTrail_Lose RivalModeScene RivalModeModel
RivalModeAudiance RivalModeBridge RivalModeTutorial RivalModeEnding RivalModeRule Revive
ShareGIF GIFComponent HomeScene Table_Settings HowToPlayInstruction BannerController
EndlessController ScorePad TouchTableNotification PlayerControlBase ResultPageBase
PausePageBase TournamentInfo TournamentBridge TestBridge Audios Scenes GameMgr
OGSplashAnimationEvents RivalModeBridgeScrollRect TestModeScrollRect
EyesightModeScene ConcentrateModeScene InvertModeScene ConcentratePlayerControl
InvertModePlayerControl ModeListComponentBase EyesightModeListComponent
ConcentrateModeListComponent InvertModeListComponent""".split())


class Ex:
    def __init__(self):
        self.sprites = {}
        self.atlases = set()
        self.idx = {}
        for s in json.load(open(os.path.join(ROOT, 'analysis', 'sprites.json'))):
            self.idx[(s['file'], s['path_id'])] = s
        self.files = {}

    def sf(self, name):
        if name not in self.files:
            self.files[name] = SerializedFile(os.path.join(ROOT, 'rebuilt', name))
        return self.files[name]

    def spr(self, src, pptr):
        """PPtr -> sprite name, registering it (and its atlas) for export."""
        if not pptr or not pptr.get('pathID'): return None
        fid = pptr['fileID']
        tgt = src if fid == 0 else os.path.basename(self.sf(src).externals[fid - 1])
        s = self.idx.get((tgt, pptr['pathID']))
        if not s: return None
        n = s['name']
        if n not in self.sprites:
            an, aw, ah = s['atlas']
            tr, ro, rc = s['textureRect'], s['textureRectOffset'], s['rect']
            self.atlases.add(an)
            self.sprites[n] = [an, round(tr[0], 2), round(ah - (tr[1] + tr[3]), 2),
                               round(tr[2], 2), round(tr[3], 2),
                               round(ro[0], 2), round(ro[1], 2),
                               round(rc[2], 2), round(rc[3], 2)]
        return n

    def walk(self, src, root_gid, strip):
        """Emit every node of a subtree, keyed by path relative to `strip`."""
        objs, go, tr, comp, go_tr, path = self.ctx[src]
        out = {}
        # pathID -> node path, for both GameObjects and the components on them,
        # so a component field pointing at another object resolves to a path.
        self.ref = {}

        def index(gid, rel):
            g = go.get(gid, {})
            self.ref[gid] = rel
            for cp in g.get('components', []): self.ref[cp['pathID']] = rel
            t = tr.get(go_tr.get(gid))
            if not t: return
            for ck in t['children']:
                c = tr.get(ck)
                if not c: continue
                cn = go.get(c['gameObject'], {}).get('name', '?')
                index(c['gameObject'], (rel + '/' + cn) if rel else cn)
        index(root_gid, strip)

        def rect_of(t):
            return {'pos': [round(v, 2) for v in t.get('anchoredPosition', t['localPosition'][:2])],
                    'size': [round(v, 2) for v in t.get('sizeDelta', [0, 0])],
                    'aMin': t.get('anchorMin', [0.5, 0.5]), 'aMax': t.get('anchorMax', [0.5, 0.5]),
                    'pivot': [round(v, 4) for v in t.get('pivot', [0.5, 0.5])],
                    'scale': [round(v, 4) for v in t['localScale'][:2]],
                    'rot': [round(v, 5) for v in t['localRotation']],
                    'z': round(t['localPosition'][2], 2)}

        def rec(gid, rel, sib):
            g = go.get(gid, {})
            tid = go_tr.get(gid)
            t = tr.get(tid)
            if t is None: return
            n = {'name': g.get('name'), 'active': g.get('active'), 'sib': sib,
                 'rect': rect_of(t)}
            for cp in g.get('components', []):
                cc = comp.get(cp['pathID'])
                if not cc: continue
                k = cc.get('script')
                if k == 'UnityEngine.UI.Image':
                    n['image'] = {'sprite': self.spr(src, cc['sprite']),
                                  'color': [round(v, 4) for v in cc['color']],
                                  'enabled': cc['enabled'], 'type': cc['type'],
                                  'fillAmount': round(cc['fillAmount'], 4),
                                  'preserveAspect': cc.get('preserveAspect', False)}
                elif k == 'UnityEngine.UI.Text':
                    n['text'] = {'text': cc['text'], 'size': cc['fontSize'],
                                 'align': cc['alignment'], 'style': cc['fontStyle'],
                                 'color': [round(v, 4) for v in cc['color']],
                                 'lineSpacing': round(cc['lineSpacing'], 3),
                                 'enabled': cc['enabled'],
                                 'hOverflow': cc.get('horizontalOverflow', 0),
                                 'vOverflow': cc.get('verticalOverflow', 0)}
                elif k == 'UnityEngine.UI.Mask':
                    # a Mask's Image is the stencil shape, not art: Unity only
                    # draws it when m_ShowMaskGraphic is set
                    d = cc.get('data') or {}
                    n['mask'] = {'show': bool(d.get('m_ShowMaskGraphic', True))}
                elif k == 'UnityEngine.UI.RectMask2D':
                    n['rectMask'] = True
                elif k in KEEP and 'data' in cc:
                    n.setdefault('comp', {})[k] = self.resolve(src, cc['data'])
            out[rel] = n
            for i, ck in enumerate(t['children']):
                c = tr.get(ck)
                if not c: continue
                cn = go.get(c['gameObject'], {}).get('name', '?')
                rec(c['gameObject'], (rel + '/' + cn) if rel else cn, i)

        rec(root_gid, strip, 0)
        return out

    def resolve(self, src, data):
        """Turn PPtrs inside component data into sprite names or node markers."""
        def f(v):
            if isinstance(v, dict) and set(v) == {'fileID', 'pathID'}:
                s = self.spr(src, v)
                if s: return s
                if not v['pathID']: return None
                p = getattr(self, 'ref', {}).get(v['pathID'])
                return {'node': p} if p is not None else {'ref': v['pathID']}
            if isinstance(v, list): return [f(x) for x in v]
            if isinstance(v, dict): return {k: f(x) for k, x in v.items()}
            return v
        return f(data)


def main():
    E = Ex()
    E.ctx = {}
    for f in ('level0', 'level1', 'sharedassets1.assets'):
        E.ctx[f] = build(f)

    out = {'reference': [1280, 2272], 'scenes': {}, 'trails': {}, 'core': {}}

    # ---- level0: the Orangenose splash
    objs, go, tr, comp, go_tr, path = E.ctx['level0']
    for t in tr.values():
        if not t.get('father') and go.get(t['gameObject'], {}).get('name') == 'OGSplash':
            out['scenes']['OGSplash'] = E.walk('level0', t['gameObject'], '')

    # ---- level1: each mode scene, HomeScene, Top Canvas
    objs, go, tr, comp, go_tr, path = E.ctx['level1']
    for t in tr.values():
        gid = t['gameObject']
        p = path(gid)
        if not p.startswith('OGRoot/GameMgr/Scenes/'): continue
        rel = p[len('OGRoot/GameMgr/Scenes/'):]
        if '/' in rel: continue                       # only the scene roots
        out['scenes'][rel] = E.walk('level1', gid, '')

    # ---- sharedassets1: the prefabs (tutorial, ending, rule, GIF, tournament)
    objs, go, tr, comp, go_tr, path = E.ctx['sharedassets1.assets']
    for t in tr.values():
        if t.get('father'): continue
        nm = go.get(t['gameObject'], {}).get('name')
        if not nm: continue
        out['scenes']['prefab:' + nm] = E.walk('sharedassets1.assets', t['gameObject'], '')

    # ---- ball trails and Core config, per mode scene
    objs, go, tr, comp, go_tr, path = E.ctx['level1']
    for pid, c in comp.items():
        k = c.get('script')
        p = path(c['gameObject'])
        if '/Scenes/' not in p: continue
        scene = p.split('/Scenes/')[1].split('/')[0]
        name = p.split('/')[-1]
        d = c.get('data')
        if not d: continue
        if k in ('BallTrail_From', 'BallTrail_To', 'BallTrail_Lose'):
            rec = {'kind': k[10:], 'frames': [E.spr('level1', x) for x in d['SpriteSequence']]}
            if k == 'BallTrail_From':
                rec.update(hitStart=d['HitBackStartFrame'], hitEnd=d['HitBackEndFrame'],
                           touchTable=d['TouchTableFrame'], toLose=d['ChangeToLoseTrailFrame'],
                           loseSeq=d['LoseBallSequence'],
                           effect=[round(v, 2) for v in d['TouchEffectPos'][:2]])
            elif k == 'BallTrail_To':
                rec.update(touchTable=d['TouchTableFrame'], loseSeq=d['LoseBallSequence'],
                           effect=[round(v, 2) for v in d['TouchEffectPos'][:2]])
            else:
                rec.update(interval=d['FrameInterval'])
            out['trails'].setdefault(scene, {})[name] = rec
        elif k == 'Core':
            SEQ = ['TossBallTrialSequence', 'ManBTossBallSequence', 'NormalSwingSequence',
                   'NormalA3SwingSequence', 'NormalB3SwingSequence', 'BlackSwingSequence',
                   'BlackA3SwingSequence', 'BlackB3SwingSequence', 'TableEffectSpriteSequence']
            ONE = ['NothingSprite', 'NormalWinSprite', 'NormalLoseSprite', 'NormalTableSprite',
                   'BlackTableSprite', 'BlackManWinSprite', 'BlackManLoseSprite']
            core = {s: [E.spr('level1', x) for x in d[s]] for s in SEQ}
            core.update({s: E.spr('level1', d[s]) for s in ONE})
            core['frames'] = {s: d[s] for s in ('hitBackStartFrame', 'hitBackEndFrame',
                                                'changeToLoseSequenceFrame',
                                                'touchManATableFrame', 'touchManBTableFrame')}
            out['core'][scene] = core

    ap = os.path.join(ROOT, 'analysis', 'anim.json')
    out['anim'] = json.load(open(ap)) if os.path.exists(ap) else {}
    rp = os.path.join(ROOT, 'analysis', 'arrays.json')
    out['arrays'] = json.load(open(rp)) if os.path.exists(rp) else {}
    out['sprites'] = E.sprites
    out['levels'] = json.load(open(os.path.join(ROOT, 'analysis/data/levels.json')))['LevelDataList']
    out['groups'] = json.load(open(os.path.join(ROOT, 'analysis/data/groups.json')))['GroupJsonLists']

    os.makedirs(os.path.join(PORT, 'assets/data'), exist_ok=True)
    os.makedirs(os.path.join(PORT, 'assets/tex'), exist_ok=True)
    with open(os.path.join(PORT, 'assets/data/game.js'), 'w') as f:
        f.write('window.__GAME=')
        json.dump(out, f, separators=(',', ':'))
        f.write(';\n')

    keep = set()
    for a in sorted(E.atlases):
        src = os.path.join(ROOT, 'assets/tex', a + '.png')
        if os.path.exists(src):
            shutil.copy(src, os.path.join(PORT, 'assets/tex', a + '.png'))
            keep.add(a + '.png')
        else:
            print('  MISSING atlas', a)
    for f in os.listdir(os.path.join(PORT, 'assets/tex')):
        if f not in keep: os.remove(os.path.join(PORT, 'assets/tex', f))

    print('scenes  : %d' % len(out['scenes']))
    for k in sorted(out['scenes']): print('    %-34s %d nodes' % (k, len(out['scenes'][k])))
    print('sprites %d, atlases %d' % (len(E.sprites), len(keep)))
    print('game.js %.1f KB' % (os.path.getsize(os.path.join(PORT, 'assets/data/game.js')) / 1024))

if __name__ == '__main__':
    main()
