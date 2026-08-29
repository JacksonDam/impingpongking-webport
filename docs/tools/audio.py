#!/usr/bin/env python3
"""Extract every AudioClip's FSB5 blob out of the .resource files."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unityfs import SerializedFile

CF = {0:'PCM',1:'Vorbis',2:'ADPCM',3:'MP3',4:'VAG',5:'HEVAG',6:'XMA',7:'AAC',8:'GCADPCM',9:'ATRAC9'}

def read_clip(o):
    r = o.reader(); c = {'name': r.string()}
    c['loadType'] = r.i32(); c['channels'] = r.i32(); c['frequency'] = r.i32()
    c['bits'] = r.i32(); c['length'] = r.f32()
    r.u8(); r.u8(); r.align(4)                 # m_IsTrackerFormat, m_Ambisonic
    c['subsound'] = r.i32()
    r.u8(); r.u8(); r.u8(); r.align(4)         # preload, background, legacy3D
    c['source'] = r.string(); c['offset'] = r.u64(); c['size'] = r.u64()
    c['format'] = CF.get(r.i32(), '?')
    c['_left'] = o.size - (r.p - o.start)
    return c

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    D = os.path.join(root, 'extracted/assets/bin/Data')
    dst = os.path.join(root, 'assets/fsb'); os.makedirs(dst, exist_ok=True)
    for fn in ('sharedassets0.assets', 'sharedassets1.assets'):
        sf = SerializedFile(os.path.join(root, 'rebuilt', fn))
        for o in sf.of_class('AudioClip'):
            c = read_clip(o)
            p = os.path.join(D, os.path.basename(c['source']))
            with open(p, 'rb') as f:
                f.seek(c['offset']); blob = f.read(c['size'])
            out = os.path.join(dst, c['name'] + '.fsb')
            open(out, 'wb').write(blob)
            print('%-18s %-7s %dch %dHz %6.2fs -> %s (%d bytes)' %
                  (c['name'], c['format'], c['channels'], c['frequency'], c['length'],
                   os.path.basename(out), len(blob)))

if __name__ == '__main__':
    main()
