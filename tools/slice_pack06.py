#!/usr/bin/env python3
"""Slice art_pack_06 — forty small decorations, in one set.

Both sheets are laid out the same way: four columns to a row, read as two
front/back pairs. Column 1 is a piece seen from the front and column 2 is the
same piece from behind; columns 3 and 4 are the next piece. With a mirror that
is all four isometric turns (see src/world/orient.js), so twenty rows of four
cells become forty pieces that can each face any way.

Unlike the furniture pack these are not drawn three times over in three woods.
A brass telescope is a brass telescope whatever the chairs are made of, so they
land in one group — `deco` — and the finish swatches leave them alone.

    python3 tools/slice_pack06.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_06')
OUT = os.path.join(ROOT, 'assets')
GROUP = 'deco'

# Reading order down each sheet, one name per front/back pair. The names are
# what the piece is, because the catalogue prints them and a shopper looking for
# a telescope is not looking for `deco_09b`.
CURIOS = [
    'seahorse', 'crab',
    'jelly_dome', 'turtle',
    'lighthouse', 'model_boat',
    'bottle_ship', 'ships_wheel',
    'reed_vase', 'bonsai',
    'cactus', 'hanging_ivy',
    'wave_vase', 'shell_wreath',
    'lantern', 'candles',
    'gramophone', 'telescope',
    'seascape', 'vanity_mirror',
]

HARBOUR = [
    'dolphin', 'whale',
    'seal', 'walrus',
    'coral_bowl', 'coral_fan',
    'snake_plant', 'monstera',
    'palm', 'blossom',
    'pearl_shell', 'shell_basin',
    'chest', 'fish_bowl',
    'globe', 'mantel_clock',
    'bulb_lamp', 'anchor',
    'cushions', 'stone_fish',
]

SHEETS = [
    ('deco_curios_sheet.png', CURIOS),
    ('deco_harbour_sheet.png', HARBOUR),
]

ROWS = 10        # rows on each sheet, two front/back pairs to a row
MAX_H = 150      # these sit on tables and shelves — they are meant to be small
MIN_AREA = 900


def lift_magenta(img: Image.Image) -> Image.Image:
    """Key out the field by colour, never by flooding.

    A flood from the corners would eat the glass of the fish bowl and the gap
    inside the ship's wheel, both of which are field-coloured islands the
    drawing means you to see through.
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 100) & ((hot - g) > 42)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    # a pixel of bite pulls the magenta halo off the outline, then a touch of
    # blur puts a soft edge back so nothing reads as cut out with scissors
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def find_pieces(img: Image.Image, want: int):
    """Every drawing on the sheet, cut out and put back in reading order.

    Gridding the sheet does not work: the drawings are laid out on a grid but
    the tall ones — the lighthouse, the palm, the gramophone — overrun their
    cell and dip into the row below. A fixed cut therefore beheads the tall
    ones and hands their plinths to their neighbours.

    So the shapes are found instead of assumed. The whole sheet is labelled at
    once, satellites (a lamp's flex, a candle flame) are folded back into the
    piece they hang off, and what is left is banded into rows by where its
    middle sits. Reading order falls out of that: rows down, pieces across.
    """
    alpha = np.asarray(img.getchannel('A'))
    solid = ndimage.binary_opening(alpha > 30, np.ones((3, 3)))
    lbl, n = ndimage.label(solid)
    if n == 0:
        return []
    areas = ndimage.sum(solid, lbl, range(1, n + 1))
    boxes = ndimage.find_objects(lbl)

    big = [i for i in range(1, n + 1) if areas[i - 1] >= MIN_AREA]
    owner = {i: i for i in big}
    for i in range(1, n + 1):
        if i in owner or areas[i - 1] < 60:
            continue
        ys, xs = boxes[i - 1]
        for j in big:
            jy, jx = boxes[j - 1]
            # directly above or below the piece, and touching distance from it
            if xs.start < jx.start - 4 or xs.stop > jx.stop + 4:
                continue
            if max(jy.start - ys.stop, ys.start - jy.stop) < 26:
                owner[i] = j
                break

    groups = {}
    for i, j in owner.items():
        groups.setdefault(j, []).append(i)

    shapes = []
    for j, parts in groups.items():
        mask = np.isin(lbl, parts)
        ys, xs = np.nonzero(mask)
        shapes.append({
            'box': (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1),
            'mid': ((ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2),
            'mask': mask,
        })
    if len(shapes) != want:
        print(f'  ! found {len(shapes)} shapes, expected {want}')

    # band into rows: a new row starts wherever the vertical step is more than
    # half a row's worth, which the layout makes an easy call
    shapes.sort(key=lambda s: s['mid'][0])
    step = (shapes[-1]['mid'][0] - shapes[0]['mid'][0]) / max(1, ROWS - 1)
    rows, cur = [], [shapes[0]]
    for s in shapes[1:]:
        if s['mid'][0] - cur[-1]['mid'][0] > step * 0.55:
            rows.append(cur)
            cur = []
        cur.append(s)
    rows.append(cur)

    out = []
    for row in rows:
        row.sort(key=lambda s: s['mid'][1])
        out.extend(row)
    return out


def cut(img: Image.Image, shape) -> Image.Image:
    """One shape, keyed to itself, trimmed to its own edges."""
    a = np.where(shape['mask'], np.asarray(img.getchannel('A')), 0).astype(np.uint8)
    piece = img.copy()
    piece.putalpha(Image.fromarray(a, mode='L'))
    return piece.crop(shape['box'])


def fit(img: Image.Image, max_h: int, pad: int = 2) -> Image.Image:
    if img.height > max_h:
        k = max_h / img.height
        img = img.resize((max(1, round(img.width * k)), max_h), Image.LANCZOS)
    out = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2))
    out.paste(img, (pad, pad))
    return out


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    entries = list(manifest.get(GROUP, []))
    os.makedirs(os.path.join(OUT, GROUP), exist_ok=True)

    for filename, names in SHEETS:
        img = lift_magenta(Image.open(os.path.join(PACK, filename)))
        shapes = find_pieces(img, len(names) * 2)
        print(f'{filename}: {img.width}x{img.height}, {len(shapes)} pieces')
        for idx, shape in enumerate(shapes):
            pair, side = divmod(idx, 2)
            if pair >= len(names):
                break
            sid = f'{names[pair]}_{"f" if side == 0 else "b"}'
            sprite = fit(cut(img, shape), MAX_H)
            rel = f'{GROUP}/{sid}.png'
            sprite.save(os.path.join(OUT, rel))
            entries = [e for e in entries if e['id'] != sid]
            entries.append({'id': sid, 'src': rel, 'w': sprite.width, 'h': sprite.height})

    manifest[GROUP] = entries
    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print(f'{GROUP}: {len(entries)} sprites')


if __name__ == '__main__':
    main()
