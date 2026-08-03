#!/usr/bin/env python3
"""Slice art_pack_02 — the warm-wood furniture, fixtures and extra guests.

These sheets are magenta-keyed PNGs. Furniture comes on a strict 4x6 grid where
each item ships a front and a back view; fixtures sit on a hand-laid layout, so
those are matched to named positions instead. Output merges into
assets/atlas.json alongside the character pack.

    python3 tools/slice_pack02.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_02')
OUT = os.path.join(ROOT, 'assets')

# ---------------------------------------------------------------- layouts ---

# Every furniture sheet uses this grid. Column pairs are one piece drawn from
# two opposite sides: `_f` faces screen down-left (an armchair's seat toward
# you) and `_b` faces up-right (the same armchair from behind). Mirroring
# either horizontally swaps the two ground axes,
# which turns down-left into down-right and up-right into up-left — so these
# two drawings plus a flip cover all four isometric orientations.
FURN_COLS = [125, 346, 563, 777]
FURN_ROWS = [115, 311, 505, 697, 883, 1080]
FURN_NAMES = [
    ['cabinet_f',     'cabinet_b',     'chair_f',    'chair_b'],
    ['drawers_f',     'drawers_b',     'armchair_f', 'armchair_b'],
    ['shelf_f',       'shelf_b',       'lamp_f',     'lamp_b'],
    ['rug',           'rug_rolled',    'ornament',   'ornament_mat'],
    ['game_table_f',  'game_table_b',  'books',      'books_lean'],
    ['round_table_f', 'round_table_b', 'mirror',     'mirror_wide'],
]

FURNITURE_SHEETS = [
    ('furniture_plain_sheet.png',   'furn_plain'),
    ('furniture_cottage_sheet.png', 'furn_cottage'),
    ('furniture_antique_sheet.png', 'furn_antique'),
]

# Hand-laid fixture layout, matched by nearest centre. Facings were measured off
# the sprites' top-edge slope: a right-wall fixture slopes down-right.
FIXTURE_POS = [
    ('window_plain_r', 121, 173),
    ('window_bay_r',   345, 174),
    ('door_closed_l',  556, 206),
    ('door_open_r',    774, 209),
    ('window_palm_r',  121, 466),
    ('window_open_r',  317, 483),
    ('door_open_l',    556, 583),
    ('door_closed_r',  774, 583),
    ('key_rack',       545, 846),
    ('pass_counter',   663, 958),
    ('host_desk',      264, 1001),
]

FIXTURE_SHEETS = [
    ('fixtures_oak_sheet.png',    'fixt_oak'),
    ('fixtures_walnut_sheet.png', 'fixt_walnut'),
]

# More guests, same idle / walk / eat order as the character pack. One row per
# character, one column per frame. The four grandees on the pack-01 sheet are
# the VIP and mythical cast — a rare guest is a different animal, not a recolour.
GUEST_SHEETS = [
    ('art_pack_02/customers_02_sheet.jpeg', 3,
     ['16_tuna', '17_clownfish', '18_angelfish']),
    ('Bubbleworks_Harbor_Character_Pack_01/additional_assets/'
     '07_dolphin_whale_manatee_walrus_character_sheet.jpeg', 3,
     ['19_dolphin', '20_whale', '21_manatee', '22_walrus']),
]

# Livestock. Each row is one animal across six growth stages, then the thing it
# gives you at the end. Pens raise them; the last cell is the harvest.
LIVESTOCK_SHEET = 'art_pack_02/livestock_pixel_sheet.png'
LIVESTOCK = [
    ('hogfish', 'ham'),
    ('cowwhale', 'milk_jug'),
    ('roefish', 'roe'),
]
LIVESTOCK_STAGES = 6

MAX_H = {'furniture': 210, 'fixture': 300, 'wall': 300}


# ------------------------------------------------------------ background ----

def lift_magenta(img: Image.Image, feather: float = 0.7) -> Image.Image:
    """Knock out the magenta chroma key. Never flood-fills — the key can be
    enclosed by artwork (between chair spindles, inside an open door frame)."""
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 120) & ((hot - g) > 60)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    a = a.filter(ImageFilter.MinFilter(3))          # eat the chroma fringe
    if feather:
        a = a.filter(ImageFilter.GaussianBlur(feather))

    # Despill. A soft glow — a lamp bulb, a shadow edge — blends with the key
    # instead of matching it, so it survives the colour test as a magenta halo.
    # Lift the green back and fade the worst of it out. The threshold keeps
    # legitimately pink artwork (upholstery flowers, book covers) untouched.
    tint = np.clip(hot - g, 0, 255)
    strength = np.clip((tint - 45) / 120.0, 0, 1)
    keep = ~bg
    g2 = np.where(keep, g + tint * strength, g)
    r2 = np.where(keep, r - tint * strength * 0.35, r)
    b2 = np.where(keep, b - tint * strength * 0.35, b)
    fixed = np.stack([r2, g2, b2], axis=-1).clip(0, 255).astype(np.uint8)

    out = Image.fromarray(fixed, mode='RGB').convert('RGBA')
    faded = (np.asarray(a).astype(np.float32) * (1 - strength * 0.85)).clip(0, 255)
    out.putalpha(Image.fromarray(faded.astype(np.uint8), mode='L'))
    return out


# Sprites whose bodies are largely clear glass: the backdrop legitimately shows
# through them, so the conservative despill leaves a solid pink dome. These get
# an aggressive pass that turns the tinted area back into translucent glass.
GLASSY = {'lamp_f', 'lamp_b'}


def despill_hard(img: Image.Image) -> Image.Image:
    rgba = np.asarray(img.convert('RGBA')).astype(np.float32)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    tint = np.clip(np.minimum(r, b) - g, 0, 255)
    strength = np.clip(tint / 70.0, 0, 1)
    out = np.stack([
        r - tint * strength * 0.5,
        g + tint * strength,
        b - tint * strength * 0.5,
        a * (1 - strength * 0.92),
    ], axis=-1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, mode='RGBA')


def edge_slope(img: Image.Image) -> float:
    """Slope of a fixture's top edge, in pixels down per pixel right.

    The joinery is drawn as flat panels with a slight built-in perspective, and
    that built-in slope is almost never the 1:2 the wall recedes at. The room
    shears each piece by the difference, so it has to know what the drawing
    already does. Theil-Sen rather than a least-squares fit: a swinging casement
    or a doorknob breaks the top edge, and a median of pairwise slopes shrugs
    that off where a fit would be dragged sideways by it.
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


def components(img: Image.Image, min_frac: float = 0.004):
    """Labelled ink blobs with their centres, largest-noise removed."""
    alpha = np.asarray(img.getchannel('A'))
    ink = alpha > 40
    ink = ndimage.binary_opening(ink, np.ones((3, 3)))
    lbl, n = ndimage.label(ink)
    if n == 0:
        return lbl, alpha, []
    areas = ndimage.sum(ink, lbl, range(1, n + 1))
    cutoff = ink.sum() * min_frac
    found = []
    for i, sl in enumerate(ndimage.find_objects(lbl)):
        if areas[i] < cutoff:
            continue
        ys, xs = sl
        found.append({
            'id': i + 1,
            'cx': (xs.start + xs.stop) / 2,
            'cy': (ys.start + ys.stop) / 2,
            'box': (xs.start, ys.start, xs.stop, ys.stop),
        })
    return lbl, alpha, found


def cut(img: Image.Image, lbl, alpha, ids, max_h: int, pad: int = 2) -> Image.Image:
    """Crop just the given blobs, trimmed and padded."""
    keep = np.isin(lbl, ids)
    layer = img.copy()
    layer.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8), mode='L'))
    a = np.asarray(layer.getchannel('A'))
    ys, xs = np.nonzero(a > 12)
    layer = layer.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    if layer.height > max_h:
        s = max_h / layer.height
        layer = layer.resize((max(1, round(layer.width * s)), max_h), Image.LANCZOS)
    out = Image.new('RGBA', (layer.width + pad * 2, layer.height + pad * 2))
    out.paste(layer, (pad, pad))
    return out


# ---------------------------------------------------------------- slicing ---

def slice_furniture(manifest):
    for fname, group in FURNITURE_SHEETS:
        img = lift_magenta(Image.open(os.path.join(PACK, fname)))
        lbl, alpha, found = components(img)
        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        entries = []
        for row, names in enumerate(FURN_NAMES):
            for col, name in enumerate(names):
                tx, ty = FURN_COLS[col], FURN_ROWS[row]
                near = [f for f in found
                        if abs(f['cx'] - tx) < 110 and abs(f['cy'] - ty) < 95]
                if not near:
                    print(f'  ! {group}/{name}: nothing near ({tx},{ty})')
                    continue
                sprite = cut(img, lbl, alpha, [f['id'] for f in near], MAX_H['furniture'])
                if name in GLASSY:
                    sprite = despill_hard(sprite)
                rel = f'{group}/{name}.png'
                sprite.save(os.path.join(OUT, rel))
                entries.append({'id': name, 'src': rel, 'w': sprite.width, 'h': sprite.height})
        manifest[group] = entries
        print(f'  {group}: {len(entries)} sprites')


def slice_fixtures(manifest):
    for fname, group in FIXTURE_SHEETS:
        img = lift_magenta(Image.open(os.path.join(PACK, fname)))
        lbl, alpha, found = components(img)
        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        entries = []
        for name, tx, ty in FIXTURE_POS:
            near = min(found, key=lambda f: (f['cx'] - tx) ** 2 + (f['cy'] - ty) ** 2)
            if (near['cx'] - tx) ** 2 + (near['cy'] - ty) ** 2 > 90 ** 2:
                print(f'  ! {group}/{name}: nothing near ({tx},{ty})')
                continue
            cap = MAX_H['fixture'] if name in ('pass_counter', 'host_desk') else MAX_H['wall']
            # joinery is set into a pale plaster wall, where the leftover chroma
            # fringe reads as a pink outline, so it gets the aggressive despill
            sprite = despill_hard(cut(img, lbl, alpha, [near['id']], cap))
            rel = f'{group}/{name}.png'
            sprite.save(os.path.join(OUT, rel))
            entries.append({'id': name, 'src': rel, 'w': sprite.width, 'h': sprite.height,
                            'slope': edge_slope(sprite)})
        manifest[group] = entries
        print(f'  {group}: {len(entries)} sprites')


def slice_guests(manifest):
    os.makedirs(os.path.join(OUT, 'customers'), exist_ok=True)
    entries = list(manifest.get('customers', []))
    for rel_src, cols, names in GUEST_SHEETS:
        entries = _guest_sheet(entries, rel_src, cols, names)
    manifest['customers'] = entries
    print(f"  customers: {len(entries)} total")


def _guest_sheet(entries, rel_src, cols, names):
    rows = len(names)
    img = lift_magenta(Image.open(os.path.join(ROOT, rel_src)), feather=0.9)
    cw, ch = img.width / cols, img.height / rows
    for row, slug in enumerate(names):
        frames = []
        for col in range(cols):
            cell = img.crop((round(col * cw), round(row * ch),
                             round((col + 1) * cw), round((row + 1) * ch)))
            frames.append(cell)
        # one shared crop box across the three frames keeps the animation steady
        boxes = []
        for f in frames:
            a = np.asarray(f.getchannel('A'))
            ys, xs = np.nonzero(a > 24)
            if len(xs):
                boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        if not boxes:
            continue
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes),
               max(b[2] for b in boxes), max(b[3] for b in boxes))
        cropped = [f.crop(box) for f in frames]
        scale = 176 / cropped[0].height
        fw, fh = max(1, round(cropped[0].width * scale)), 176
        cropped = [f.resize((fw, fh), Image.LANCZOS) for f in cropped]
        strip = Image.new('RGBA', (fw * 3, fh))
        for i, f in enumerate(cropped):
            strip.paste(f, (i * fw, 0))
        rel = f'customers/{slug}.png'
        strip.save(os.path.join(OUT, rel))
        entries = [e for e in entries if e['id'] != slug]
        entries.append({'id': slug, 'name': slug.split('_', 1)[1].title(), 'src': rel,
                        'fw': fw, 'fh': fh, 'frames': ['idle', 'walk', 'eat']})
    return entries


def slice_livestock(manifest):
    """Six growth stages per animal, plus the produce cell at the end of the row.

    This sheet is pixel art on a flat slate background rather than a chroma key,
    so the backdrop comes out by matching that colour instead of the magenta
    test the vector sheets use.
    """
    img = Image.open(os.path.join(ROOT, LIVESTOCK_SHEET)).convert('RGB')
    rgb = np.asarray(img).astype(np.int16)
    # the backdrop is the single commonest colour, sampled from a corner
    back = rgb[4, 4]
    dist = np.abs(rgb - back).sum(axis=-1)
    alpha = np.where(dist < 40, 0, 255).astype(np.uint8)
    out = img.convert('RGBA')
    out.putalpha(Image.fromarray(alpha, mode='L'))

    cols = LIVESTOCK_STAGES + 1
    rows = len(LIVESTOCK)
    cw, ch = out.width / cols, out.height / rows
    os.makedirs(os.path.join(OUT, 'livestock'), exist_ok=True)
    entries = []
    for row, (animal, produce) in enumerate(LIVESTOCK):
        for col in range(cols):
            cell = out.crop((round(col * cw), round(row * ch),
                             round((col + 1) * cw), round((row + 1) * ch)))
            # keep only the biggest blob: the art is not perfectly gridded, so a
            # cell can catch a sliver of its neighbour and widen the crop
            a = np.asarray(cell.getchannel('A')) > 24
            lbl, n = ndimage.label(a)
            if n == 0:
                continue
            areas = ndimage.sum(a, lbl, range(1, n + 1))
            keep = int(np.argmax(areas)) + 1
            mask = lbl == keep
            cell.putalpha(Image.fromarray(
                np.where(mask, np.asarray(cell.getchannel('A')), 0).astype(np.uint8), mode='L'))
            ys, xs = np.nonzero(mask)
            cell = cell.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
            name = produce if col == cols - 1 else f'{animal}_{col + 1}'
            rel = f'livestock/{name}.png'
            # nearest-neighbour: this is pixel art and should stay crisp
            if cell.height > 150:
                k = 150 / cell.height
                cell = cell.resize((max(1, round(cell.width * k)), 150), Image.NEAREST)
            cell.save(os.path.join(OUT, rel))
            entries.append({'id': name, 'src': rel, 'w': cell.width, 'h': cell.height})
    manifest['livestock'] = entries
    # The produce cells earn their keep twice: as the pantry icon for the raw
    # ingredient, and as the plated dish for the recipe built on it. Registering
    # the same file under both ids beats copying it.
    by_id = {e['id']: e for e in entries}
    aliases = [
        ('ingredients', 'ham', 'ham'),
        ('ingredients', 'roe', 'roe'),
        ('food', 'ham_steamer', 'ham'),
        ('food', 'roe_nigiri', 'roe'),
    ]
    for group, want, from_cell in aliases:
        src = by_id.get(from_cell)
        if not src:
            print(f'  ! {group}/{want}: no {from_cell} cell')
            continue
        rows = [e for e in manifest.get(group, []) if e['id'] != want]
        rows.append({**src, 'id': want})
        manifest[group] = rows
    print(f'  livestock: {len(entries)} sprites, 4 aliased into ingredients and food')


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    print('slicing furniture…')
    slice_furniture(manifest)
    print('slicing fixtures…')
    slice_fixtures(manifest)
    print('slicing guests…')
    slice_guests(manifest)
    print('slicing livestock…')
    slice_livestock(manifest)

    # the old furniture finishes and painted wall decals are gone
    for dead in ('furniture', 'furniture_coral', 'furniture_whale', 'decals', 'rooms'):
        manifest.pop(dead, None)

    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print('groups:', {k: len(v) for k, v in manifest.items()})


if __name__ == '__main__':
    main()
