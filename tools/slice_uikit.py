#!/usr/bin/env python3
"""Cut the interface kit out of art_pack_03/ui_kit_sheet.jpeg.

Most of the small interface glyphs in this game were drawn by hand in CSS, as
inline SVG data URIs — a close cross, a lock, a rotate arrow, a tick. They are
legible and they are the right colours and they still look like what they are:
geometry, sitting in a game made of drawings. Every one of them has a proper
hand-drawn equivalent sitting unused on this sheet.

The sheet is on white rather than the magenta key the sprite sheets use, so the
cut is a darkness test. Two of the shapes touch their neighbour and come back as
one blob; those name a column to split themselves at.

    python3 tools/slice_uikit.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art_pack_03', 'ui_kit_sheet.jpeg')
OUT = os.path.join(ROOT, 'assets')
GROUP = 'ui'

# What to keep, by its place in reading order down the sheet, and what to call
# it. `cut` splits a blob that came back joined to the shape beside it.
WANT = {
    9:  [('x', None)],                       # red cross, for every close button
    11: [('back', None)],                    # chevron in a tile
    12: [('gear', 0.54), ('alert', None)],   # cogwheel and an exclamation
    14: [('tick', 0.52), ('redo', None)],    # green check and two turning arrows
    15: [('speech', None)],
    18: [('lock', None)],                    # a padlock struck into a coin
    19: [('wand', None)],                    # somebody small with a star wand
    23: [('turn', None)],                    # an arrow turning into a box
    24: [('crown', None)],
    25: [('clock', None)],
}

MIN_AREA = 400
PAD = 3


def shapes(img: Image.Image):
    """Every glyph on the sheet, in reading order."""
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    ink = ndimage.binary_closing(a.min(axis=-1) < 232, np.ones((3, 3)))
    lbl, n = ndimage.label(ink)
    areas = ndimage.sum(ink, lbl, range(1, n + 1))
    boxes = ndimage.find_objects(lbl)
    keep = [(i, boxes[i - 1]) for i in range(1, n + 1) if areas[i - 1] >= MIN_AREA]
    # band by row, then read across — the rows are loose enough that a plain
    # sort by y interleaves them
    keep.sort(key=lambda t: (t[1][0].start // 28, t[1][1].start))
    return keep, lbl


def cut(img: Image.Image, lbl, label, sl, lo=None, hi=None):
    """One glyph, keyed to itself, optionally sliced out of a joined pair."""
    ys, xs = sl
    x0 = xs.start if lo is None else xs.start + int((xs.stop - xs.start) * lo)
    x1 = xs.stop if hi is None else xs.start + int((xs.stop - xs.start) * hi)
    mask = (lbl == label)[ys.start:ys.stop, x0:x1]
    crop = img.convert('RGBA').crop((x0, ys.start, x1, ys.stop))
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    # trim to what actually survived the split
    ry, rx = np.nonzero(mask)
    if not len(ry):
        return None
    crop.putalpha(Image.fromarray(alpha, mode='L'))
    crop = crop.crop((int(rx.min()), int(ry.min()), int(rx.max()) + 1, int(ry.max()) + 1))
    out = Image.new('RGBA', (crop.width + PAD * 2, crop.height + PAD * 2))
    out.paste(crop, (PAD, PAD))
    return out


def main():
    img = Image.open(SRC)
    found, lbl = shapes(img)
    path = os.path.join(OUT, 'atlas.json')
    atlas = json.load(open(path))
    entries = atlas.setdefault(GROUP, [])
    by_id = {e['id']: e for e in entries}
    os.makedirs(os.path.join(OUT, GROUP), exist_ok=True)

    done = 0
    for idx, wants in WANT.items():
        if idx >= len(found):
            print(f'  ! blob {idx} not on the sheet')
            continue
        label, sl = found[idx]
        lo = None
        for name, split in wants:
            piece = cut(img, lbl, label, sl, lo, split)
            lo = split
            if piece is None:
                print(f'  ! {name}: nothing in that slice')
                continue
            rel = f'{GROUP}/kit_{name}.webp'
            piece.save(os.path.join(OUT, rel), 'WEBP', quality=90, method=4)
            sid = f'kit_{name}'
            if sid in by_id:
                by_id[sid].update({'src': rel, 'w': piece.width, 'h': piece.height})
            else:
                entries.append({'id': sid, 'src': rel, 'w': piece.width, 'h': piece.height})
            print(f'  {sid}: {piece.width}x{piece.height}')
            done += 1

    with open(path, 'w') as fh:
        json.dump(atlas, fh, indent=1)
    print(f'{done} kit glyphs')


if __name__ == '__main__':
    main()
