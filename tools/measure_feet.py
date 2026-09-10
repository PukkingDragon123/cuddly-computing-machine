#!/usr/bin/env python3
"""Work out where each drawing actually stands, and write it into the atlas.

Everything in this game is planted by putting the *bottom of its image* on a
floor tile. For a chair that is right: a chair's lowest pixels are its feet,
and its feet are under its middle.

It is wrong for anything whose base runs across the drawing at an angle, which
in an isometric pack is a lot of things — the pass counter, the host desk, a
door with a sloping threshold. Their lowest pixel is at one *end*. Plant that on
the tile and the middle of the base ends up hanging however far the base rises
over the run, so the pass counter floated a clear hundred pixels off the floor
and the doors, which had a hand-rolled correction of their own, went through it.

So measure it instead of deriving it. `foot` is how far the drawing's own bottom
edge, under the middle of the drawing, sits above the bottom of the image. Zero
for a chair, a hundred for a counter, and the code adds it back when it plants
the thing. Derived numbers were the problem: the doors used width times slope
over two, which assumes the base runs the full width of the image at exactly the
slope of the top — and a door's image is mostly the swung leaf.

Only the groups that get planted on a tile, and only single-frame sprites: a
character strip is several drawings side by side and its middle column is the
seam between two of them.

    python3 tools/measure_feet.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
ATLAS = os.path.join(OUT, 'atlas.json')

PLANTED = [
    'fixt_oak', 'fixt_walnut',
    'furn_plain', 'furn_cottage', 'furn_antique',
    'machines', 'deco',
]

# A band rather than a single column: one column can miss through a gap in the
# drawing — the space between a chair's front legs — and read the floor behind
# it as the floor under it.
BAND = 0.12

# A door drawn open has its leaf swung into the room, and the leaf really does
# touch the floor — but in front of the wall, not in it. Measured at the middle
# of the drawing it is the leaf you find, and lining the leaf's toe up with the
# wall's floor line lifts the whole doorway off the ground. The open and closed
# drawings of a doorway are the same doorway, so the open one takes the closed
# one's foot, which is measurable because a closed door is all in the wall.
PAIRED = {
    'door_open_r': 'door_closed_r',
    'door_open_l': 'door_closed_l',
}


def foot_of(path: str) -> int:
    """How far the drawing's base, under the middle of the drawing, sits above
    the bottom of the image.

    The lowest opaque pixel in the band is the wrong answer: on a base that
    slopes, the lowest pixel in a band is at the band's low *end*, so the
    measurement comes out short by half the band times the slope. Every door in
    the room stood four pixels into the floor for exactly that reason. The
    median of the band's columns is unbiased.
    """
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im.getchannel('A'))
    h, w = a.shape
    lo = max(0, int(w * (0.5 - BAND / 2)))
    hi = min(w - 1, int(w * (0.5 + BAND / 2)))
    per = []
    for x in range(lo, hi + 1):
        rows = np.nonzero(a[:, x] > 24)[0]
        if len(rows):
            per.append(h - 1 - rows[-1])
    if not per:
        return 0
    return int(round(float(np.median(per))))


def main():
    atlas = json.load(open(ATLAS))
    for group in PLANTED:
        entries = atlas.get(group)
        if not entries:
            continue
        shown = []
        measured = {}
        for entry in entries:
            if entry.get('frames'):
                continue
            path = os.path.join(OUT, entry['src'])
            if not os.path.exists(path):
                print(f'  ! missing {entry["src"]}')
                continue
            measured[entry['id']] = foot_of(path)
        for entry in entries:
            if entry['id'] not in measured:
                continue
            f = measured.get(PAIRED.get(entry['id']), measured[entry['id']])
            if f:
                entry['foot'] = f
                shown.append((entry['id'], f))
            else:
                entry.pop('foot', None)
        big = [s for s in shown if s[1] >= 8]
        print(f'  {group:14s} {len(shown):3d} with a foot, {len(big):3d} over 8px'
              + (f'   worst: {max(big, key=lambda s: s[1])}' if big else ''))

    with open(ATLAS, 'w') as fh:
        json.dump(atlas, fh, indent=1)


if __name__ == '__main__':
    main()
