#!/usr/bin/env python3
"""Lift the groups the new art packs do not cover.

tools/slice_pack08.py tones everything it slices on the way out, so the
furniture, the joinery, the machines and the deco come out of the slicer at the
right brightness. The rest of the pack — the guests, the crew, the food, the
larder, the plates, the menu cards, the walnut joinery — has no newer sheet to
be re-cut from, and left alone it would now be visibly duller than everything
standing next to it.

So this walks those groups once and applies the same curve. It is deliberately
not idempotent-safe by accident: applying a midtone lift twice washes the art
out, so the atlas carries a marker saying it has been done and the tool refuses
to run again without --force.

    python3 tools/brighten.py [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tone import LIFT, SAT, tone   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
ATLAS = os.path.join(OUT, 'atlas.json')

# Everything slice_pack08 re-cuts is already toned; touching it again would
# double the lift.
SLICED = {'furn_plain', 'furn_cottage', 'furn_antique', 'fixt_oak', 'machines', 'deco'}

# The interface kit and the icon cards are flat, bright and read as paper
# already; lifting them only makes the outlines weak.
SKIP = SLICED | {'ui'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    atlas = json.load(open(ATLAS))
    mark = atlas.get('_tone')
    if mark and not args.force:
        print(f'already lifted ({mark}); pass --force to do it again')
        return

    done = 0
    for group, entries in atlas.items():
        if group.startswith('_') or group in SKIP:
            continue
        for e in entries:
            path = os.path.join(OUT, e['src'])
            if not os.path.exists(path):
                print(f'  ! missing {e["src"]}')
                continue
            img = tone(Image.open(path))
            img.save(path, 'WEBP', quality=88, method=4)
            done += 1
        print(f'  {group}: {len(entries)}')

    atlas['_tone'] = {'sat': SAT, 'lift': LIFT, 'groups': 'all but ' + ', '.join(sorted(SKIP))}
    with open(ATLAS, 'w') as fh:
        json.dump(atlas, fh, indent=1)
    print(f'{done} sprites lifted')


if __name__ == '__main__':
    main()
