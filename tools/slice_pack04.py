#!/usr/bin/env python3
"""Slice art_pack_04 — the pottery works, the menu cards, and the two books.

Three quite different jobs:

  pottery_works_sheet.png  eight brass-and-verdigris machines on the magenta
                           key, 4x2. The kiln and the wheel among them, which is
                           what moves pottery out of a menu and onto the floor.
  menu_cards_sheet.png     twenty illustrated cards on cream, 5x4. These are
                           paper, so they are NOT keyed out — a card wants its
                           own page kept. Each cell is snapped to the card's own
                           edge instead.
  book_*.png               one open book each, for the menu and the diary. They
                           back a DOM panel rather than a canvas sprite, so they
                           are trimmed, scaled to a sane width and written as
                           JPEG next to the stylesheet's other art.

    python3 tools/slice_pack04.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art_pack_04')
OUT = os.path.join(ROOT, 'assets')

# ------------------------------------------------------------------ pottery ---

# Read off the sheet left to right, top to bottom. The names say what the game
# uses them for, not what they might be: the wheel and the kilns are buildings
# you tap, so they need to be recognisable at a glance on the factory floor.
POTTERY = [
    'pot_wheel',      # throwing wheel over a round table, drill arm above
    'glaze_mill',     # rolling mill with a short belt
    'clay_press',     # screw press, big frame
    'round_kiln',     # porthole kiln
    'drying_rack',    # open shelving cabinet
    'bisque_kiln',    # arched firebox
    'glaze_kiln',     # tall kiln with hanging elements
    'master_kiln',    # kiln and wheel together
]

# -------------------------------------------------------------- menu cards ---

CARD_COLS, CARD_ROWS = 5, 4

# What each card is a picture of, in sheet order. Used to pick a card for a
# recipe, a diary page or the day's catch, so the label matters more than the
# index — a shrimp card should never end up on a cake.
CARDS = [
    'card_shrimp', 'card_crab', 'card_grilled_fish', 'card_sashimi', 'card_ramen',
    'card_oyster', 'card_feast', 'card_stein', 'card_hotpot', 'card_cloche',
    'card_stars', 'card_stamps', 'card_discount', 'card_cake', 'card_dolphin',
    'card_royal', 'card_reef', 'card_squid', 'card_whale', 'card_platter',
]

# ------------------------------------------------------------------- books ---

BOOKS = [('book_menu.png', 'book_menu'), ('book_diary.png', 'book_diary')]
BOOK_W = 1200


def lift_magenta(img: Image.Image) -> Image.Image:
    """Colour test, never a flood — the key shows through machine handles."""
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hot = np.minimum(r, b)
    bg = (hot > 100) & ((hot - g) > 42)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), mode='L')
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert('RGBA')
    out.putalpha(a)
    return out


def biggest_blob(cell: Image.Image) -> Image.Image | None:
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


def card_boxes(img: Image.Image, want: int):
    """Find each card on the sheet as its own box, in reading order.

    Gridding this sheet does not work: the cards are hand-laid at different
    sizes, so a fixed cell always carries a sliver of its neighbour. What does
    separate them cleanly is colour — the backdrop measures (247,242,236) while
    the card paper is a warmer (248,226,190), a good 40 levels apart on the blue
    channel. So threshold the darkest channel, close each card into one shape,
    and take the biggest blobs.
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    ink = rgb.min(axis=-1) < 218
    ink = ndimage.binary_closing(ink, np.ones((11, 11)))
    ink = ndimage.binary_opening(ink, np.ones((5, 5)))
    lbl, n = ndimage.label(ink)
    if n == 0:
        return []
    areas = ndimage.sum(ink, lbl, range(1, n + 1))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lbl)):
        if areas[i] < ink.size * 0.004:
            continue
        ys, xs = sl
        boxes.append((ys.start, ys.stop, xs.start, xs.stop, areas[i]))
    boxes.sort(key=lambda b: -b[4])
    boxes = boxes[:want]
    # reading order: band by row (cards in a row overlap vertically), then by x
    boxes.sort(key=lambda b: b[0])
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        if b[0] < cur[-1][1] - (cur[-1][1] - cur[-1][0]) * 0.5:
            cur.append(b)
        else:
            rows.append(cur)
            cur = [b]
    rows.append(cur)
    out = []
    for row in rows:
        row.sort(key=lambda b: b[2])
        out.extend(row)
    return out


# ------------------------------------------------------------------ stages ---

def slice_pottery(manifest):
    entries = list(manifest.get('machines', []))
    os.makedirs(os.path.join(OUT, 'machines'), exist_ok=True)
    img = lift_magenta(Image.open(os.path.join(PACK, 'pottery_works_sheet.png')))
    added = 0
    for idx, cell in grid_cells(img, 4, 2):
        if idx >= len(POTTERY):
            break
        shape = biggest_blob(cell)
        if shape is None:
            print(f'  ! machines/{POTTERY[idx]}: empty cell')
            continue
        sprite = fit(shape, 210)
        rel = f'machines/{POTTERY[idx]}.png'
        sprite.save(os.path.join(OUT, rel))
        entries = [e for e in entries if e['id'] != POTTERY[idx]]
        entries.append({'id': POTTERY[idx], 'src': rel,
                        'w': sprite.width, 'h': sprite.height})
        added += 1
    manifest['machines'] = entries
    print(f'  pottery machines: +{added} ({len(entries)} total)')


def slice_cards(manifest):
    os.makedirs(os.path.join(OUT, 'cards'), exist_ok=True)
    img = Image.open(os.path.join(PACK, 'menu_cards_sheet.png')).convert('RGB')
    entries = []
    boxes = card_boxes(img, len(CARDS))
    if len(boxes) != len(CARDS):
        print(f'  ! found {len(boxes)} cards, expected {len(CARDS)}')
    for idx, (y0, y1, x0, x1, _a) in enumerate(boxes):
        if idx >= len(CARDS):
            break
        card = img.crop((x0, y0, x1, y1))
        if card.width < 40 or card.height < 40:
            print(f'  ! cards/{CARDS[idx]}: nothing found')
            continue
        if card.width > 420:
            k = 420 / card.width
            card = card.resize((420, max(1, round(card.height * k))), Image.LANCZOS)
        rel = f'cards/{CARDS[idx]}.png'
        card.save(os.path.join(OUT, rel))
        entries.append({'id': CARDS[idx], 'src': rel, 'w': card.width, 'h': card.height})
    manifest['cards'] = entries
    print(f'  cards: {len(entries)} sprites')


def slice_books(manifest):
    """The two book spreads, for the DOM panels rather than the canvas."""
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    entries = list(manifest.get('ui', []))
    for fname, name in BOOKS:
        img = Image.open(os.path.join(PACK, fname)).convert('RGB')
        rgb = np.asarray(img).astype(np.int16)
        # trim the white margin the book was drawn on
        ink = ndimage.binary_opening(rgb.min(axis=-1) < 244, np.ones((5, 5)))
        ys, xs = np.nonzero(ink)
        if len(xs):
            img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        if img.width > BOOK_W:
            k = BOOK_W / img.width
            img = img.resize((BOOK_W, max(1, round(img.height * k))), Image.LANCZOS)
        rel = f'ui/{name}.jpg'
        img.save(os.path.join(OUT, rel), quality=88, optimize=True)
        entries = [e for e in entries if e['id'] != name]
        entries.append({'id': name, 'src': rel, 'w': img.width, 'h': img.height})
        print(f'  {rel}: {img.width}x{img.height}')
    manifest['ui'] = entries


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    print('slicing the pottery works…')
    slice_pottery(manifest)
    print('slicing menu cards…')
    slice_cards(manifest)
    print('slicing the books…')
    slice_books(manifest)
    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print('groups:', {k: len(v) for k, v in manifest.items()})


if __name__ == '__main__':
    main()
