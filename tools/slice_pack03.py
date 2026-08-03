#!/usr/bin/env python3
"""Slice art_pack_03 — the pack that lives in the reimagined-sniffle repo.

Four kinds of source here, each needing different treatment:

  vip/*.png            already RGBA, already three 384px frames side by side.
                       Only trimming and rescaling to the game's character
                       height, so the strip format matches the other guests.
  plates_*_sheet.png   serving dishes on the cream paper backdrop.
  machines_*_sheet     industrial art on the magenta chroma key.
  ui_*_sheet           interface art. The icon sheet is on cream; the kit sheet
                       is on white with the pieces hand-laid rather than gridded,
                       so that one is matched by connected components.

    python3 tools/slice_pack03.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_03')
OUT = os.path.join(ROOT, 'assets')

CHAR_H = 176        # the height every guest strip is normalised to

# --------------------------------------------------------------- customers ---

# The rare cast. Six VIPs and four mythicals, each a 1152x384 strip of
# idle / walk / eat. Numbered on from the eighteen regulars so the diary can
# keep one flat list.
VIP = [
    ('01_royal_whale_shark_vip', '23_royal_whale_shark', 'vip'),
    ('02_pearl_manta_ray_vip', '24_pearl_manta_ray', 'vip'),
    ('03_golden_seahorse_vip', '25_golden_seahorse', 'vip'),
    ('04_giant_clam_vip', '26_giant_clam', 'vip'),
    ('05_celebrity_narwhal_vip', '27_celebrity_narwhal', 'vip'),
    ('06_aristocratic_octopus_vip', '28_aristocratic_octopus', 'vip'),
    ('07_dunkleosteus_mythical', '29_dunkleosteus', 'mythical'),
    ('08_coelacanth_mythical', '30_coelacanth', 'mythical'),
    ('09_helicoprion_mythical', '31_helicoprion', 'mythical'),
    ('10_xiphactinus_mythical', '32_xiphactinus', 'mythical'),
]

# ------------------------------------------------------------------ plates ---

# Forty serving dishes on two 5x4 sheets. Tier one gets the plain earthenware,
# tier three the gilded china, so a forged dish visibly improves.
PLATE_SHEETS = [('plates_a_sheet.png', 'a'), ('plates_b_sheet.png', 'b')]
PLATE_COLS, PLATE_ROWS = 5, 4

# ---------------------------------------------------------------- machines ---

MACHINE_SHEETS = [
    ('machines_food_sheet.png', 4, 3, [
        'roaster', 'grill', 'smoker', 'steamer',
        'press_ring', 'mincer', 'crate_filler', 'sorter',
        'extruder', 'tumbler_wide', 'wok', 'baker',
    ]),
    ('machines_tank_sheet.png', 4, 2, [
        'keg_small', 'kettle', 'locker', 'drum',
        'boiler_tall', 'twin_still', 'vault', 'refinery',
    ]),
    ('machines_computer_sheet.png', 3, 2, [
        'computer_desk', 'radio_set', 'plotter',
        'computer_tall', 'beacon', 'ledger_press',
    ]),
    ('machines_works_sheet.jpeg', 4, 1, [
        'gauge_stack', 'spin_drum', 'stamp_press', 'gas_works',
    ]),
]

# ---------------------------------------------------------------------- ui ---

# Nine icons in a 4 / 4 / 1 layout. Centres measured off the sheet rather than
# guessed: two of my estimates landed on the same blob, which silently gave two
# names the same picture.
UI_ICONS = [
    ('diary',   0.139, 0.302),   # the regulars, with a star
    ('book',    0.386, 0.309),   # open ledger
    ('market',  0.625, 0.299),   # basket of produce
    ('crew',    0.861, 0.307),   # staff in their hats
    ('tools',   0.142, 0.591),   # hammer and wrench
    ('help',    0.379, 0.590),   # question in a bubble
    ('refresh', 0.622, 0.591),   # two arrows round
    ('list',    0.868, 0.599),   # stacked bars
    ('recipes', 0.500, 0.842),   # cloche over a list
]


def lift_cream(img: Image.Image) -> Image.Image:
    """Knock out the pale paper backdrop, flood-filled from the sheet edge.

    Safe to flood here where it isn't for the magenta sheets: paper never shows
    through a plate the way a chroma key shows between chair spindles.
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    pale = (rgb.min(axis=-1) > 198) & (np.ptp(rgb, axis=-1) < 26)
    lbl, _ = ndimage.label(pale)
    edge = set(lbl[0].tolist()) | set(lbl[-1].tolist())
    edge |= set(lbl[:, 0].tolist()) | set(lbl[:, -1].tolist())
    edge.discard(0)
    bg = np.isin(lbl, list(edge))
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def lift_magenta(img: Image.Image) -> Image.Image:
    """Colour test, never a flood — the key shows through machine handles."""
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 110) & ((hot - g) > 55)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def biggest_blob(cell: Image.Image) -> Image.Image | None:
    """Trim a cell to its largest connected shape, dropping neighbour slivers."""
    a = np.asarray(cell.getchannel('A')) > 30
    a = ndimage.binary_opening(a, np.ones((2, 2)))
    lbl, n = ndimage.label(a)
    if n == 0:
        return None
    areas = ndimage.sum(a, lbl, range(1, n + 1))
    if areas.max() < 400:
        return None
    mask = lbl == int(np.argmax(areas)) + 1
    alpha = np.where(mask, np.asarray(cell.getchannel('A')), 0).astype(np.uint8)
    cell = cell.copy()
    cell.putalpha(Image.fromarray(alpha, mode='L'))
    ys, xs = np.nonzero(mask)
    return cell.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def fit(img: Image.Image, max_h: int, pad: int = 2) -> Image.Image:
    if img.height > max_h:
        k = max_h / img.height
        img = img.resize((max(1, round(img.width * k)), max_h), Image.LANCZOS)
    out = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2))
    out.paste(img, (pad, pad))
    return out


def grid_cells(img: Image.Image, cols: int, rows: int):
    cw, ch = img.width / cols, img.height / rows
    for row in range(rows):
        for col in range(cols):
            yield row * cols + col, img.crop((
                round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch)))


# ------------------------------------------------------------------ stages ---

def slice_vip(manifest):
    entries = list(manifest.get('customers', []))
    os.makedirs(os.path.join(OUT, 'customers'), exist_ok=True)
    for src, slug, _tier in VIP:
        img = Image.open(os.path.join(PACK, 'vip', f'{src}.png')).convert('RGBA')
        fw = img.width // 3
        frames = [img.crop((i * fw, 0, (i + 1) * fw, img.height)) for i in range(3)]
        boxes = []
        for f in frames:
            a = np.asarray(f.getchannel('A'))
            ys, xs = np.nonzero(a > 24)
            if len(xs):
                boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        if not boxes:
            print(f'  ! {slug}: empty')
            continue
        # one shared box across the three frames, so the animation doesn't jitter
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes),
               max(b[2] for b in boxes), max(b[3] for b in boxes))
        cropped = [f.crop(box) for f in frames]
        k = CHAR_H / cropped[0].height
        w, hh = max(1, round(cropped[0].width * k)), CHAR_H
        cropped = [f.resize((w, hh), Image.LANCZOS) for f in cropped]
        strip = Image.new('RGBA', (w * 3, hh))
        for i, f in enumerate(cropped):
            strip.paste(f, (i * w, 0))
        rel = f'customers/{slug}.png'
        strip.save(os.path.join(OUT, rel))
        entries = [e for e in entries if e['id'] != slug]
        entries.append({'id': slug, 'src': rel, 'fw': w, 'fh': hh,
                        'frames': ['idle', 'walk', 'eat']})
    manifest['customers'] = entries
    print(f"  customers: {len(entries)} total")


def slice_plates(manifest):
    os.makedirs(os.path.join(OUT, 'plates'), exist_ok=True)
    entries = []
    for fname, tag in PLATE_SHEETS:
        img = lift_cream(Image.open(os.path.join(PACK, fname)))
        for idx, cell in grid_cells(img, PLATE_COLS, PLATE_ROWS):
            shape = biggest_blob(cell)
            if shape is None:
                continue
            sprite = fit(shape, 150)
            name = f'plate_{tag}{idx + 1:02d}'
            rel = f'plates/{name}.png'
            sprite.save(os.path.join(OUT, rel))
            entries.append({'id': name, 'src': rel, 'w': sprite.width, 'h': sprite.height})
    manifest['plates'] = entries
    print(f'  plates: {len(entries)} sprites')


def slice_machines(manifest):
    entries = list(manifest.get('machines', []))
    os.makedirs(os.path.join(OUT, 'machines'), exist_ok=True)
    added = 0
    for fname, cols, rows, names in MACHINE_SHEETS:
        img = lift_magenta(Image.open(os.path.join(PACK, fname)))
        for idx, cell in grid_cells(img, cols, rows):
            if idx >= len(names):
                break
            shape = biggest_blob(cell)
            if shape is None:
                print(f'  ! machines/{names[idx]}: empty cell')
                continue
            sprite = fit(shape, 210)
            rel = f'machines/{names[idx]}.png'
            sprite.save(os.path.join(OUT, rel))
            entries = [e for e in entries if e['id'] != names[idx]]
            entries.append({'id': names[idx], 'src': rel,
                            'w': sprite.width, 'h': sprite.height})
            added += 1
    manifest['machines'] = entries
    print(f'  machines: +{added} ({len(entries)} total)')


def slice_ui(manifest):
    """The interface art, which replaces the hand-drawn SVG icons."""
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    img = lift_cream(Image.open(os.path.join(PACK, 'ui_icons_sheet.png')))
    a = np.asarray(img.getchannel('A')) > 40
    a = ndimage.binary_closing(a, np.ones((9, 9)))
    lbl, n = ndimage.label(a)
    areas = ndimage.sum(a, lbl, range(1, n + 1))
    found = []
    for i, sl in enumerate(ndimage.find_objects(lbl)):
        if areas[i] < a.size * 0.002:
            continue
        ys, xs = sl
        found.append({'id': i + 1, 'cx': (xs.start + xs.stop) / 2 / img.width,
                      'cy': (ys.start + ys.stop) / 2 / img.height, 'box': sl})
    entries = []
    for name, tx, ty in UI_ICONS:
        if not found:
            break
        near = min(found, key=lambda f: (f['cx'] - tx) ** 2 + (f['cy'] - ty) ** 2)
        ys, xs = near['box']
        cell = img.crop((xs.start, ys.start, xs.stop, ys.stop))
        keep = lbl[ys, xs] == near['id']
        alpha = np.where(keep, np.asarray(cell.getchannel('A')), 0).astype(np.uint8)
        cell.putalpha(Image.fromarray(alpha, mode='L'))
        sprite = fit(cell, 96)
        rel = f'ui/{name}.png'
        sprite.save(os.path.join(OUT, rel))
        entries.append({'id': name, 'src': rel, 'w': sprite.width, 'h': sprite.height})
    manifest['ui'] = entries
    print(f'  ui: {len(entries)} icons')


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    print('slicing the rare cast…')
    slice_vip(manifest)
    print('slicing plates…')
    slice_plates(manifest)
    print('slicing machines…')
    slice_machines(manifest)
    print('slicing ui…')
    slice_ui(manifest)
    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print('groups:', {k: len(v) for k, v in manifest.items()})


if __name__ == '__main__':
    main()
