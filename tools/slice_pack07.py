#!/usr/bin/env python3
"""Slice art_pack_07 — the remade furniture, machines and deco.

Everything in here replaces art already in the atlas under the same ids, so
running it re-skins the game without a single change to the code that draws it.
The three furniture sheets are the reason it exists: 24 cells each, in exactly
the order furn_plain has always been in.

Two things make these sheets different from the earlier packs:

  They are JPEG. The magenta key therefore has compression ringing all round
  every outline — a hard colour test leaves a confetti of stray pixels and eats
  a few real ones. So the test is looser, and what it produces is cleaned up
  with a close/open pass before anything is cut.

  The deco sheets are partial remakes. IMG_5019 redraws twelve of the twenty
  curios and IMG_5020 redraws eighteen of the twenty harbour pieces — both
  contiguous runs of the original lists — so those slices name their own offset
  into the list and leave the rest of the set alone.

Run from the repo root, then re-pack:

    python3 tools/slice_pack07.py
    python3 tools/pack_assets.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_07')
OUT = os.path.join(ROOT, 'assets')

# ------------------------------------------------------------------ layouts --

# The furniture, in the order all three finishes are drawn: two front/back pairs
# to a row, six rows. Four of the twenty-four are not pairs at all — a rug and a
# rolled rug, a mascot and a mascot on a mat, two piles of books, two mirrors —
# which is why this is a written list rather than a rule.
FURNITURE = [
    'cabinet_f', 'cabinet_b', 'chair_f', 'chair_b',
    'drawers_f', 'drawers_b', 'armchair_f', 'armchair_b',
    'shelf_f', 'shelf_b', 'lamp_f', 'lamp_b',
    'rug', 'rug_rolled', 'ornament', 'ornament_mat',
    'game_table_f', 'game_table_b', 'books', 'books_lean',
    'round_table_f', 'round_table_b', 'mirror', 'mirror_wide',
]

# The ten food machines, named for what is coming out of them rather than for
# where they sit on the sheet.
FOOD = [
    'berry_tumbler', 'citrus_press', 'pineapple_slicer', 'onion_boiler', 'rice_grinder',
    'ice_mill', 'egg_roller', 'cream_churn', 'butter_roller', 'cheese_press',
]

POTTERY = [
    'pot_wheel', 'glaze_mill', 'clay_press', 'round_kiln',
    'drying_rack', 'bisque_kiln', 'glaze_kiln', 'master_kiln',
]

TANKS = [
    'keg_small', 'kettle', 'locker', 'drum',
    'boiler_tall', 'twin_still', 'vault', 'refinery',
]

# The deco names, in the order tools/slice_pack06.py established them. The
# remakes cover a run out of the middle, so each names where it starts.
CURIOS = [
    'seahorse', 'crab', 'jelly_dome', 'turtle', 'lighthouse', 'model_boat',
    'bottle_ship', 'ships_wheel', 'reed_vase', 'bonsai', 'cactus', 'hanging_ivy',
    'wave_vase', 'shell_wreath', 'lantern', 'candles', 'gramophone', 'telescope',
    'seascape', 'vanity_mirror',
]
HARBOUR = [
    'dolphin', 'whale', 'seal', 'walrus', 'coral_bowl', 'coral_fan',
    'snake_plant', 'monstera', 'palm', 'blossom', 'pearl_shell', 'shell_basin',
    'chest', 'fish_bowl', 'globe', 'mantel_clock', 'bulb_lamp', 'anchor',
    'cushions', 'stone_fish',
]


def pairs(names, start, count):
    """Front/back ids for the run of deco pieces a remake actually covers."""
    out = []
    for name in names[start:start + count]:
        out += [f'{name}_f', f'{name}_b']
    return out


# group, file, columns, rows, ids in reading order, tallest the sprite may be
JOBS = [
    ('furn_plain',   'furniture_plain_v2.jpeg',   4, 6, FURNITURE, 200),
    ('furn_cottage', 'furniture_cottage_v2.jpeg', 4, 6, FURNITURE, 200),
    ('furn_antique', 'furniture_antique_v2.jpeg', 4, 6, FURNITURE, 200),
    ('machines',     'machines_food_v2.jpeg',     5, 2, FOOD, 210),
    ('machines',     'machines_pottery_v2.jpeg',  4, 2, POTTERY, 210),
    ('machines',     'machines_tanks_v2.jpeg',    4, 2, TANKS, 210),
    # twelve curios, lighthouse through candles — the sheet does not redraw the
    # four before them or the four after, so those keep the art they had
    ('deco',         'deco_curios_v2.jpeg',       4, 6, pairs(CURIOS, 4, 12), 150),
    # eighteen harbour pieces, from the top; the cushions and the stone fish
    # were not redrawn
    ('deco',         'deco_harbour_v2.jpeg',      4, 9, pairs(HARBOUR, 0, 18), 150),
]

MIN_AREA = 900


def lift_magenta(img: Image.Image) -> Image.Image:
    """Key out the field, allowing for JPEG ringing round every outline.

    The threshold is looser than the PNG packs use, and what comes out is closed
    and opened before it is trusted: a hard test on a lossy sheet leaves stray
    pixels in the field and bites holes out of the drawing, and the blob finder
    downstream believes both.
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 92) & ((hot - g) > 30)
    keep = ndimage.binary_closing(~bg, np.ones((3, 3)))
    keep = ndimage.binary_opening(keep, np.ones((3, 3)))
    a = Image.fromarray(np.where(keep, 255, 0).astype(np.uint8), mode='L')
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def find_pieces(img: Image.Image, want: int, rows: int):
    """Every drawing on the sheet, in reading order.

    Gridding does not work — the tall pieces overrun their cell and dip into the
    row below — so the shapes are found and then banded into rows by where their
    middles sit. See tools/slice_pack06.py, which learnt this the hard way.
    """
    alpha = np.asarray(img.getchannel('A'))
    solid = ndimage.binary_opening(alpha > 40, np.ones((3, 3)))
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
            # a satellite belongs to the piece it sits directly over or under —
            # a lamp's flex, a candle flame, the sack beside the flour mill
            if xs.start < jx.start - 6 or xs.stop > jx.stop + 6:
                continue
            if max(jy.start - ys.stop, ys.start - jy.stop) < 30:
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

    shapes.sort(key=lambda s: s['mid'][0])
    step = (shapes[-1]['mid'][0] - shapes[0]['mid'][0]) / max(1, rows - 1)
    banded, cur = [], [shapes[0]]
    for s in shapes[1:]:
        if s['mid'][0] - cur[-1]['mid'][0] > step * 0.55:
            banded.append(cur)
            cur = []
        cur.append(s)
    banded.append(cur)

    out = []
    for row in banded:
        row.sort(key=lambda s: s['mid'][1])
        out.extend(row)
    return out


def cut(img: Image.Image, shape) -> Image.Image:
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
    atlas = json.load(open(path))
    replaced = 0

    for group, filename, cols, rows, names, max_h in JOBS:
        img = lift_magenta(Image.open(os.path.join(PACK, filename)))
        shapes = find_pieces(img, len(names), rows)
        print(f'{filename}: {len(shapes)} pieces -> {group}')
        entries = atlas.setdefault(group, [])
        by_id = {e['id']: e for e in entries}
        for idx, shape in enumerate(shapes):
            if idx >= len(names):
                break
            sid = names[idx]
            sprite = fit(cut(img, shape), max_h)
            os.makedirs(os.path.join(OUT, group), exist_ok=True)
            rel = f'{group}/{sid}.webp'
            sprite.save(os.path.join(OUT, rel), 'WEBP', quality=88, method=4)
            # keep the entry in place so atlas order — and therefore every
            # panel that lists a group — does not shuffle under the new art
            if sid in by_id:
                by_id[sid].update({'src': rel, 'w': sprite.width, 'h': sprite.height})
            else:
                entries.append({'id': sid, 'src': rel, 'w': sprite.width, 'h': sprite.height})
            replaced += 1

    with open(path, 'w') as fh:
        json.dump(atlas, fh, indent=1)
    print(f'{replaced} sprites replaced')


if __name__ == '__main__':
    main()
