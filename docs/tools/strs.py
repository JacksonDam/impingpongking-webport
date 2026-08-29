#!/usr/bin/env python3
"""Dump every ldstr literal, with the method that loads it.  -l N = min length."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dnasm import load

def main():
    minlen = 0; pat = None
    args = sys.argv[1:]
    while args:
        if args[0] == '-l': minlen = int(args[1]); args = args[2:]
        else: pat = args[0]; args = args[1:]
    a = load()
    for m in a.methods:
        if not m.rva: continue
        for i in m.body():
            if i.op != 'ldstr': continue
            tok = i.arg
            s = a.im.us_at(tok & 0xFFFFFF)
            if len(s) < minlen: continue
            if pat and pat.lower() not in s.lower(): continue
            print('=== %s  IL_%04X  (%d chars)' % (m.full, i.off, len(s)))
            print(s)

if __name__ == '__main__':
    main()
