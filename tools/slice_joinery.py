#!/usr/bin/env python3
"""Slice art_pack_09 — the joinery, oak and walnut, from one matched pair.

Why this exists when tools/slice_pack08.py already cuts a fixture sheet.

Pack 08's `fixtures_v3.png` is oak only. There has never been a walnut sheet in
it, so `fixt_walnut` was still the cut from an older pack of JPEGs — a different
drawing, at a different size, keyed off a lossier source. Half the joinery in
the game was therefore a month older than the other half, and the two finishes
did not match each other. These two files are the same drawing in two woods,
both lossless, so the pair is cut here together and they agree by construction.

Two things this does that the older slicers do not.

**One scale for the whole sheet.** The others fit every piece to a common
height, which quietly throws away the artist's relative sizing: a key rack and
a pass counter both came out 320 tall. The pieces on a sheet are drawn to scale
against each other, so the sheet gets one factor and they keep their
proportions.

**A sheet-wide projection.** Slope is measured off each drawing's own top edge,
which is exactly right for a plain window and nonsense for a piece whose
silhouette is topped by something else — the open casement's swung leaf, the
pass counter's shelf of jars. Pack 08 recorded 0.137 for `window_open_r` and
-0.713 for `pass_counter` on that basis. A sheet is drawn on one projection, so
a measurement outside a plausible band is a measurement of the wrong edge, and
the sheet's own median stands in for it.

    python3 tools/slice_joinery.py
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tone import tone   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_09')
OUT = os.path.join(ROOT, 'assets')

SHEETS = [('fixt_oak', 'joinery_oak.png'), ('fixt_walnut', 'joinery_walnut.png')]

# Reading order down the sheet: four across the top, four more below them, then
# the counters. The suffix is the wall the piece is drawn for — `_r` slopes
# down to the right, `_l` down to the left — and it is checked against the
# measured slope rather than trusted, because a name is not evidence.
PIECES = [
    'window_plain_r', 'window_bay_r', 'door_closed_l', 'door_open_r',
    'window_palm_r', 'window_open_r', 'door_open_l', 'door_closed_r',
    'pass_counter', 'key_rack', 'host_desk',
]

TALLEST = 360      # px, for the biggest piece on the sheet; the rest follow it
MIN_AREA = 3000
BAND = 120         # row banding for reading order
PLAUSIBLE = (0.48, 0.68)


def lift_magenta(img: Image.Image) -> Image.Image:
    """Key the field out by colour, never by flooding — the glass in a door is
    an island of background the drawing means you to see through.

    Then despill, which the earlier slicers skipped and which is why every
    sprite in the game has a faint pink rim once you look for it. Keying only
    decides which pixels to keep; the ones it keeps along an outline are still
    a blend of oak and magenta, and no amount of alpha hides a colour that is
    actually in the pixel. Eroding harder would take the outline with it.

    Magenta is the one colour with red *and* blue above green, and nothing in a
    sheet of joinery is — oak and walnut run red over green over blue, the sea
    runs blue over green over red, marble is flat. So wherever both are up, the
    amount they are both up by is spill, and taking that much off each pulls
    the field back out of the pixel without touching the drawing.
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 100) & ((hot - g) > 42)

    spill = np.clip(hot - g, 0, None)
    clean = np.stack([
        np.clip(r - spill, 0, 255),
        g,
        np.clip(b - spill, 0, 255),
    ], axis=-1).astype(np.uint8)

    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    # a pixel of bite pulls the worst of the halo off, then a touch of blur puts
    # a soft edge back so nothing reads as cut out with scissors
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.fromarray(clean, mode='RGB').convert('RGBA')
    out.putalpha(a)
    return out


def edge_slope(mask) -> float:
    """The drawing's own top edge, as a slope.

    Theil–Sen over pairs of columns rather than a fit, because a fit is dragged
    off by whatever sticks up at one end — a door handle, a swung casement — and
    a median of pairwise slopes simply ignores it. The outer 15% either side is
    skipped for the same reason: that is where the corners are.
    """
    ys, xs = np.nonzero(mask)
    x0, w = xs.min(), xs.max() - xs.min() + 1
    top = {}
    for x, y in zip(xs, ys):
        if x not in top or y < top[x]:
            top[x] = y
    cols = sorted(top)
    inner = [c for c in cols if x0 + w * 0.15 <= c <= x0 + w * 0.85] or cols
    slopes = []
    for i in range(0, len(inner) - 1, 3):
        for j in range(i + 3, min(i + 40, len(inner)), 3):
            dx = inner[j] - inner[i]
            if dx:
                slopes.append((top[inner[j]] - top[inner[i]]) / dx)
    return float(np.median(slopes)) if slopes else 0.0


def find_pieces(img: Image.Image):
    """Every drawing on the sheet, in reading order: rows down, pieces across."""
    alpha = np.asarray(img.getchannel('A'))
    solid = ndimage.binary_opening(alpha > 30, np.ones((3, 3)))
    lbl, n = ndimage.label(solid)
    areas = ndimage.sum(solid, lbl, range(1, n + 1))
    boxes = ndimage.find_objects(lbl)
    out = []
    for i in range(1, n + 1):
        if areas[i - 1] < MIN_AREA:
            continue
        ys, xs = boxes[i - 1]
        mask = (lbl == i)
        out.append({
            'box': (xs.start, ys.start, xs.stop, ys.stop),
            'mask': mask,
            'slope': edge_slope(mask),
        })
    out.sort(key=lambda s: (s['box'][1] // BAND, s['box'][0]))
    return out


def cut(img: Image.Image, shape) -> Image.Image:
    a = np.where(shape['mask'], np.asarray(img.getchannel('A')), 0).astype(np.uint8)
    piece = img.copy()
    piece.putalpha(Image.fromarray(a, mode='L'))
    return piece.crop(shape['box'])


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}

    for group, filename in SHEETS:
        img = lift_magenta(Image.open(os.path.join(PACK, filename)))
        shapes = find_pieces(img)
        print(f'{filename}: {img.width}x{img.height}, {len(shapes)} pieces')
        if len(shapes) != len(PIECES):
            print(f'  ! expected {len(PIECES)}, refusing to guess which is which')
            continue

        # one factor for the sheet, off its tallest piece
        tall = max(s['box'][3] - s['box'][1] for s in shapes)
        k = TALLEST / tall

        # the sheet's own projection, for the pieces whose top edge is not their
        # mounting line
        med = float(np.median([abs(s['slope']) for s in shapes]))

        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        entries = []
        for name, shape in zip(PIECES, shapes):
            raw = shape['slope']
            good = PLAUSIBLE[0] <= abs(raw) <= PLAUSIBLE[1]
            slope = raw if good else med * (1 if raw >= 0 else -1)
            # only the wall joinery carries a side in its name; the counters
            # stand on the floor and have no wall to agree or disagree with
            if name.endswith(('_l', '_r')):
                want = -1 if name.endswith('_l') else 1
                if np.sign(slope) != want:
                    print(f'  ! {name}: slope {slope:+.3f} disagrees with its name')

            piece = cut(img, shape)
            piece = piece.resize(
                (max(1, round(piece.width * k)), max(1, round(piece.height * k))),
                Image.LANCZOS)
            piece = tone(piece)
            pad = Image.new('RGBA', (piece.width + 4, piece.height + 4))
            pad.paste(piece, (2, 2))

            rel = f'{group}/{name}.png'
            pad.save(os.path.join(OUT, rel))
            entries.append({
                'id': name, 'src': rel,
                'w': pad.width, 'h': pad.height,
                'slope': round(slope, 4),
            })
            flag = '' if good else f'  (measured {raw:+.3f}, used the sheet median)'
            print(f'   {name:16s} {pad.width:3d}x{pad.height:3d} slope={slope:+.3f}{flag}')
        manifest[group] = entries

    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)


if __name__ == '__main__':
    main()
