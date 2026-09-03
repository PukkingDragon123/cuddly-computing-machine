#!/usr/bin/env python3
"""Slice art_pack_08 — the finished art, from the lossless originals.

This supersedes tools/slice_pack07.py entirely. That pack came out of a zip of
JPEGs and two of its sheets were partial: twelve of the twenty curios, eighteen
of the twenty harbour pieces. These are the same drawings delivered as PNG, the
deco sets are complete, and there are two sheets that had never been sent at
all — the joinery (windows, doors, the pass, the host desk, the key rack) and a
twelve-machine produce line.

Lossless sources matter more than they sound. The JPEG sheets had compression
ringing round every outline, which forced a loose magenta key that in turn ate
a pixel off every edge; these key cleanly at a tight threshold.

Every sprite goes through tools/tone.py on the way out — see there for why.

    python3 tools/slice_pack08.py
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
PACK = os.path.join(ROOT, 'art_pack_08')
OUT = os.path.join(ROOT, 'assets')

FURNITURE = [
    'cabinet_f', 'cabinet_b', 'chair_f', 'chair_b',
    'drawers_f', 'drawers_b', 'armchair_f', 'armchair_b',
    'shelf_f', 'shelf_b', 'lamp_f', 'lamp_b',
    'rug', 'rug_rolled', 'ornament', 'ornament_mat',
    'game_table_f', 'game_table_b', 'books', 'books_lean',
    'round_table_f', 'round_table_b', 'mirror', 'mirror_wide',
]

# The joinery, in the order it reads down the sheet. The counter and the key
# rack are the one pair out of alphabetical-by-position order: the rack hangs
# above the counter, so the counter's shape starts higher on the page.
FIXTURES = [
    'window_plain_r', 'window_bay_r', 'door_closed_l', 'door_open_r',
    'window_palm_r', 'window_open_r', 'door_open_l', 'door_closed_r',
    'pass_counter', 'key_rack', 'host_desk',
]

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

# The produce line, replacing the first art pack's food machines.
PRODUCE = [
    'roaster', 'grill', 'smoker', 'steamer',
    'press_ring', 'mincer', 'crate_filler', 'sorter',
    'extruder', 'tumbler_wide', 'wok', 'baker',
]

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


def pairs(names, count=None):
    """Front/back ids for a run of deco pieces.

    `count` is there because the curios sheet is cropped after its ninth row:
    the framed seascape and the table mirror are not on it, so they keep the art
    they had rather than being silently handed somebody else's picture.
    """
    out = []
    for n in names[:count]:
        out += [f'{n}_f', f'{n}_b']
    return out


# group, file, rows (for banding), ids in reading order, tallest allowed, band
JOBS = [
    ('furn_plain',   'furniture_plain_v3.png',   6, FURNITURE, 200, None),
    ('furn_cottage', 'furniture_cottage_v3.png', 6, FURNITURE, 200, None),
    ('furn_antique', 'furniture_antique_v3.png', 6, FURNITURE, 200, None),
    # free-form layout, so the rows are found by a fixed band rather than by count
    ('fixt_oak',     'fixtures_v3.png',          3, FIXTURES, 320, 60),
    ('machines',     'machines_food_v3.png',     2, FOOD, 210, None),
    ('machines',     'machines_pottery_v3.png',  2, POTTERY, 210, None),
    ('machines',     'machines_tanks_v3.png',    2, TANKS, 210, None),
    ('machines',     'machines_produce_v3.png',  3, PRODUCE, 210, None),
    ('deco',         'deco_curios_v3.png',       9, pairs(CURIOS, 18), 150, None),
    ('deco',         'deco_harbour_v3.png',     10, pairs(HARBOUR), 150, None),
]

MIN_AREA = 900


def lift_magenta(img: Image.Image) -> Image.Image:
    """Key out the field by colour. These are PNG, so the test can be tight."""
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 100) & ((hot - g) > 42)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    # one pixel of bite pulls the magenta halo off the outline, then a touch of
    # blur puts a soft edge back so nothing reads as cut out with scissors
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def find_pieces(img: Image.Image, want: int, rows: int, band=None):
    """Every drawing on the sheet, in reading order.

    Gridding does not work: the tall pieces overrun their cell and dip into the
    row below, so a fixed cut beheads them and hands their base to the neighbour.
    Shapes are found instead, then banded into rows by where their middles sit —
    either by a fixed pixel band, for a sheet laid out freely, or by a share of
    the average row pitch, for one laid out on a grid.
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
            # a satellite belongs to the piece it sits directly over or under: a
            # lamp's flex, a candle flame, the sack beside the flour mill
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

    if band:
        shapes.sort(key=lambda s: (int(s['box'][1] // band), s['mid'][1]))
        return shapes

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


def edge_slope(img: Image.Image) -> float:
    """Slope of a fixture's top edge, in pixels down per pixel right.

    The joinery is drawn as flat panels with a built-in perspective of their
    own, and that slope is almost never the 1:2 the wall recedes at. The room
    shears each piece by the *difference*, so it has to know what the drawing
    already does — get this wrong and a window sits on the wall at nearly twice
    the angle of the plaster behind it.

    Theil-Sen rather than a least-squares fit: a swinging casement or a doorknob
    breaks the top edge, and a median of pairwise slopes shrugs that off where a
    fit would be dragged sideways by it.
    """
    alpha = np.asarray(img.getchannel('A'))
    xs, ys = [], []
    for x in range(alpha.shape[1]):
        col = np.nonzero(alpha[:, x] > 90)[0]
        if len(col):
            xs.append(x)
            ys.append(col[0])
    if len(xs) < 24:
        return 0.0
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    step = max(1, len(xs) // 64)
    span = alpha.shape[1] * 0.2
    slopes = [(ys[b] - ys[a]) / (xs[b] - xs[a])
              for a in range(0, len(xs), step)
              for b in range(0, len(xs), step)
              if xs[b] - xs[a] > span]
    return round(float(np.median(slopes)), 3) if slopes else 0.0


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
    total = 0

    for group, filename, rows, names, max_h, band in JOBS:
        img = lift_magenta(Image.open(os.path.join(PACK, filename)))
        shapes = find_pieces(img, len(names), rows, band)
        print(f'{filename}: {len(shapes)} pieces -> {group}')
        entries = atlas.setdefault(group, [])
        by_id = {e['id']: e for e in entries}
        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        for idx, shape in enumerate(shapes):
            if idx >= len(names):
                break
            sid = names[idx]
            sprite = tone(fit(cut(img, shape), max_h))
            rel = f'{group}/{sid}.webp'
            sprite.save(os.path.join(OUT, rel), 'WEBP', quality=88, method=4)
            meta = {'src': rel, 'w': sprite.width, 'h': sprite.height}
            # The joinery is sheared onto the wall by the difference between the
            # wall's slope and the drawing's own, so a redrawn window has to
            # bring its own measurement — inheriting the old sheet's would hang
            # it at the wrong angle. It bit exactly that way once.
            if group.startswith('fixt_'):
                meta['slope'] = edge_slope(sprite)
            # updated in place, so atlas order — and every panel that lists a
            # group — does not shuffle under the new art
            if sid in by_id:
                by_id[sid].update(meta)
            else:
                entries.append({'id': sid, **meta})
            total += 1

    with open(path, 'w') as fh:
        json.dump(atlas, fh, indent=1)
    print(f'{total} sprites')


if __name__ == '__main__':
    main()
