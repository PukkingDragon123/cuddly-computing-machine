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
  book_*.png               one open book each, for the menu and the diary. These
                           back a DOM panel rather than a canvas sprite, so the
                           margin they were drawn on is flooded away to
                           transparency — an opaque cream rectangle behind the
                           covers reads as a sheet of paper the book is sitting
                           on, which is not what a floating panel wants — then
                           trimmed, scaled and written as PNG.

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

BOOKS = [
    ('book_menu.png', 'book_menu'),
    ('book_diary.png', 'book_diary'),
    # no ruled boxes on this one, so it backs the panels whose content is a grid
    ('book_plain.png', 'book_plain'),
]
BOOK_W = 1200

# The drafting sheet behind the build menu: a grid, corner ticks and title
# blocks. Rectangular, so it only needs its white margin trimmed off.
PLANS = [('blueprint_sheet.png', 'blueprint')]
PLAN_W = 1100


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
    """The two book spreads, for the DOM panels rather than the canvas.

    The margin has to go, not just get cropped: the covers are rounded, so a
    rectangular crop still leaves cream in the corners and the panel reads as a
    book lying on a sheet of paper. So the backdrop is flooded from the edge —
    safe here, because a closed cover has no gaps for the flood to leak through.
    """
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    entries = list(manifest.get('ui', []))
    for fname, name in BOOKS:
        img = Image.open(os.path.join(PACK, fname)).convert('RGB')
        rgb = np.asarray(img).astype(np.int16)
        # the margin is a flat pale wash; the paper inside is warmer and the
        # covers are dark, so the two never meet on this test
        corner = rgb[2, 2]
        pale = (np.abs(rgb - corner).sum(axis=-1) < 26)
        lbl, _ = ndimage.label(pale)
        edge = set(lbl[0].tolist()) | set(lbl[-1].tolist())
        edge |= set(lbl[:, 0].tolist()) | set(lbl[:, -1].tolist())
        edge.discard(0)
        back = np.isin(lbl, list(edge))
        alpha = Image.fromarray(np.where(back, 0, 255).astype(np.uint8), mode='L')
        alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
        out = img.convert('RGBA')
        out.putalpha(alpha)
        ys, xs = np.nonzero(np.asarray(alpha) > 8)
        if len(xs):
            out = out.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        if out.width > BOOK_W:
            k = BOOK_W / out.width
            out = out.resize((BOOK_W, max(1, round(out.height * k))), Image.LANCZOS)
        # WebP, and deliberately NOT registered in the atlas: these are CSS
        # backgrounds for two panels, so putting them in the sprite manifest
        # would have the loader fetch two megabytes at boot for art the player
        # may never open.
        rel = f'ui/{name}.webp'
        out.save(os.path.join(OUT, rel), quality=88, method=6)
        entries = [e for e in entries if e['id'] != name]
        print(f'  {rel}: {out.width}x{out.height}'
              f' ({os.path.getsize(os.path.join(OUT, rel)) // 1024} KB)')
    manifest['ui'] = entries


def slice_plans(manifest):
    """The drafting sheet. Opaque and rectangular — it is a sheet of paper."""
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    for fname, name in PLANS:
        img = Image.open(os.path.join(PACK, fname)).convert('RGB')
        rgb = np.asarray(img).astype(np.int16)
        ink = ndimage.binary_opening(rgb.min(axis=-1) < 232, np.ones((7, 7)))
        ys, xs = np.nonzero(ink)
        if len(xs):
            img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        if img.width > PLAN_W:
            k = PLAN_W / img.width
            img = img.resize((PLAN_W, max(1, round(img.height * k))), Image.LANCZOS)
        rel = f'ui/{name}.webp'
        img.save(os.path.join(OUT, rel), quality=86, method=6)
        print(f'  {rel}: {img.width}x{img.height}'
              f' ({os.path.getsize(os.path.join(OUT, rel)) // 1024} KB)')


# ------------------------------------------------------------------ kitchen ---

# The loading screen's props: a pot and a spatula, drawn side by side on cream.
# They are cut apart by their own ink rather than by a grid, because the two are
# nowhere near the same size and a grid would give the spatula a lot of nothing.
TOOLS = [('kitchen_tools.png', ['pot', 'spatula'])]
TOOL_H = 420


def slice_tools(manifest):
    """Two objects on a cream page, keyed out and cut apart by their own ink."""
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    for fname, names in TOOLS:
        img = Image.open(os.path.join(PACK, fname)).convert('RGB')
        rgb = np.asarray(img).astype(np.int16)
        # the page is a flat warm cream; anything that is not it is a drawing
        page = np.median(rgb.reshape(-1, 3), axis=0)
        ink = np.abs(rgb - page).max(axis=-1) > 26
        ink = ndimage.binary_closing(ink, np.ones((9, 9)))
        ink = ndimage.binary_opening(ink, np.ones((5, 5)))
        # Dilated hard before labelling, so the little sparkle strokes drawn
        # beside each object join it rather than becoming objects of their own —
        # then the two biggest blobs are the two things, left to right.
        lab, n = ndimage.label(ndimage.binary_dilation(ink, np.ones((85, 85))))
        blobs = []
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab == i)
            if len(xs) < 20000:
                continue
            blobs.append((len(xs), i, (int(xs.min()), int(ys.min()),
                                       int(xs.max()) + 1, int(ys.max()) + 1)))
        blobs.sort(key=lambda b: -b[0])
        picked = sorted(blobs[:len(names)], key=lambda b: b[2][0])
        for name, (_, comp, box) in zip(names, picked):
            # masked to its own component: the two boxes overlap, so without
            # this the spatula's crop carries a slice of the pot's handle
            mine = ink & (lab == comp)
            alpha = (mine * 255).astype(np.uint8)
            # a soft edge, so the cut line is the drawn outline, not a staircase
            soft = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6))
            whole = img.convert('RGBA')
            whole.putalpha(soft)
            cut = whole.crop(box)
            k = TOOL_H / cut.height
            cut = cut.resize((max(1, round(cut.width * k)), TOOL_H), Image.LANCZOS)
            rel = f'ui/{name}.webp'
            cut.save(os.path.join(OUT, rel), quality=90, method=6)
            print(f'  {rel}: {cut.width}x{cut.height}'
                  f' ({os.path.getsize(os.path.join(OUT, rel)) // 1024} KB)')


def main():
    path = os.path.join(OUT, 'atlas.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    print('slicing the pottery works…')
    slice_pottery(manifest)
    print('slicing menu cards…')
    slice_cards(manifest)
    print('slicing the books…')
    slice_books(manifest)
    print('slicing the drafting sheet…')
    slice_plans(manifest)
    print('slicing the kitchen tools…')
    slice_tools(manifest)
    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print('groups:', {k: len(v) for k, v in manifest.items()})


if __name__ == '__main__':
    main()
