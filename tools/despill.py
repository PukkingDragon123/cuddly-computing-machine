#!/usr/bin/env python3
"""Take the magenta back out of every outline in the pack.

Every sheet in this project is drawn on a magenta field and keyed off it, and
keying only ever decides which pixels to *keep*. The ones it keeps along an
outline are still a blend — part oak, part field — and no amount of alpha hides
a colour that is genuinely in the pixel. The result is a faint pink rim around
every chair, every guest and every plate in the game. It is invisible until you
notice it, and then it is the only thing you can see.

Eroding harder is not the answer: the contaminated ring *is* the outline, and
the outline is what makes the art read.

Magenta is the one colour with red and blue both above green. Oak and walnut
run red over green over blue; the sea runs blue over green over red; cream and
marble are flat. So wherever both are up, the amount they are both up by is
spill, and taking that much off each pulls the field back out of the pixel.

**Only on edge pixels.** Some things in this game really are violet — the moon
jellyfish has two and a half thousand body pixels that this test would call
spill, and it would come out grey. Contamination only happens where the keyer
blended, which is exactly where alpha is neither 0 nor 255, so that is the only
place this touches. Everything solid is left exactly as drawn.

Writes a `_despill` marker into atlas.json and refuses to run twice, because
taking the spill out of a clean edge a second time is a real, if small, shift.

    python3 tools/despill.py [--force]
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
ATLAS = os.path.join(OUT, 'atlas.json')
MARKER = '_despill'

# groups cut by tools/slice_joinery.py, which despills as it goes
SKIP = {'fixt_oak', 'fixt_walnut', 'ui'}

# an edge pixel is one the keyer blended: neither cut away nor fully kept
EDGE_LO, EDGE_HI = 0, 250


def despill(path: str) -> int:
    """Clean one sprite in place. Returns how many pixels it changed."""
    im = Image.open(path).convert('RGBA')
    arr = np.asarray(im).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    spill = np.clip(np.minimum(r, b) - g, 0, None)
    edge = (a > EDGE_LO) & (a < EDGE_HI) & (spill > 0)
    if not edge.any():
        return 0

    out = arr.copy()
    out[..., 0] = np.where(edge, np.clip(r - spill, 0, 255), r)
    out[..., 2] = np.where(edge, np.clip(b - spill, 0, 255), b)
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(
        path, 'WEBP', quality=88, method=4) if path.endswith('.webp') else \
        Image.fromarray(out.astype(np.uint8), 'RGBA').save(path)
    return int(edge.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    atlas = json.load(open(ATLAS))
    if atlas.get(MARKER) and not args.force:
        print(f'already despilled ({atlas[MARKER]}) — pass --force to run it again')
        return

    touched = pixels = 0
    for group, entries in atlas.items():
        if group.startswith('_') or group in SKIP:
            continue
        n = 0
        for entry in entries:
            path = os.path.join(OUT, entry['src'])
            if not os.path.exists(path):
                print(f'  ! missing {entry["src"]}')
                continue
            changed = despill(path)
            if changed:
                n += 1
                pixels += changed
        if n:
            print(f'  {group:14s} {n} sprites')
        touched += n

    atlas[MARKER] = 'edge pixels cleaned by tools/despill.py'
    with open(ATLAS, 'w') as fh:
        json.dump(atlas, fh, indent=1)
    print(f'{touched} sprites, {pixels:,} edge pixels')


if __name__ == '__main__':
    main()
