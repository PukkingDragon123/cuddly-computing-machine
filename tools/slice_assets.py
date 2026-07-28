#!/usr/bin/env python3
"""Slice the Bubbleworks Harbor art pack into game-ready transparent PNGs.

Source sheets ship as flat JPEGs on either a magenta chroma key or the cream
paper backdrop. This walks each sheet, lifts the background, cuts the grid,
trims every cell to its ink, and writes an atlas manifest the game loads at
boot.

    python3 tools/slice_assets.py
"""

from __future__ import annotations

import json
import os
from collections import deque
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "Bubbleworks_Harbor_Character_Pack_01")
OUT = os.path.join(ROOT, "assets")


# --------------------------------------------------------------------------
# background removal
# --------------------------------------------------------------------------

def magenta_score(rgb: np.ndarray) -> np.ndarray:
    """0..1 confidence that a pixel is the magenta chroma key."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    # magenta = high red + high blue, conspicuously low green
    hot = np.minimum(r, b)
    gap = hot - g
    ok = (hot > 120) & (gap > 60)
    return ok


def cream_score(rgb: np.ndarray) -> np.ndarray:
    """True where a pixel matches the pale paper backdrop."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    bright = (r > 228) & (g > 226) & (b > 214)
    flat = (np.abs(r - g) < 16) & (np.abs(g - b) < 26) & (r >= b)
    return bright & flat


def flood_from_border(candidate: np.ndarray) -> np.ndarray:
    """Keep only the candidate-background pixels connected to the image edge.

    Protects interiors that happen to share the backdrop colour (white plates,
    cream shells) because a dark outline always fences them off.
    """
    h, w = candidate.shape
    seen = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))

    # scanline flood: walk runs instead of single pixels, ~20x faster in python
    while q:
        y, x = q.popleft()
        x0 = x
        while x0 > 0 and candidate[y, x0 - 1] and not seen[y, x0 - 1]:
            x0 -= 1
            seen[y, x0] = True
        x1 = x
        while x1 < w - 1 and candidate[y, x1 + 1] and not seen[y, x1 + 1]:
            x1 += 1
            seen[y, x1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < h:
                row_c = candidate[ny]
                row_s = seen[ny]
                nx = x0
                while nx <= x1:
                    if row_c[nx] and not row_s[nx]:
                        row_s[nx] = True
                        q.append((ny, nx))
                        while nx <= x1 and row_c[nx]:
                            nx += 1
                    else:
                        nx += 1
    return seen


def lift_background(img: Image.Image, mode: str, feather: float = 0.7) -> Image.Image:
    """Return an RGBA copy with the sheet backdrop knocked out."""
    rgb = np.asarray(img.convert("RGB"))
    if mode == "magenta":
        # the chroma key never appears in the art, so trust the colour test
        # directly — a border flood would leave magenta trapped between chair
        # spindles and under stool seats.
        bg = magenta_score(rgb)
    else:
        # cream *does* appear inside the art (plates, shells), so only lift the
        # backdrop reachable from the sheet edge.
        bg = flood_from_border(cream_score(rgb))

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha, mode="L")
    # pull the edge in a hair so JPEG ringing / chroma spill does not survive
    a = a.filter(ImageFilter.MinFilter(3))
    if feather:
        a = a.filter(ImageFilter.GaussianBlur(feather))

    out = img.convert("RGBA")
    out.putalpha(a)
    return out


# --------------------------------------------------------------------------
# slicing helpers
# --------------------------------------------------------------------------

def bucket_blobs(img: Image.Image, cols: int, rows: int, min_area: int):
    """Group ink blobs into grid cells by centroid.

    Sheets are hand-laid, so items drift off their nominal cell and a straight
    grid crop clips neighbours into frame. Labelling the ink first and bucketing
    whole blobs keeps each sprite intact and its neighbours out.

    Returns (label_image, alpha, {(row, col): [label_ids]}).
    """
    alpha = np.asarray(img.getchannel("A"))
    ink = alpha > 24
    lbl, n = ndimage.label(ink)
    buckets: dict[tuple[int, int], list[int]] = {}
    if n == 0:
        return lbl, alpha, buckets

    areas = ndimage.sum(ink, lbl, range(1, n + 1))
    cents = ndimage.center_of_mass(ink, lbl, range(1, n + 1))
    cw, chh = img.width / cols, img.height / rows
    for i in range(n):
        if areas[i] < min_area:
            continue
        cy, cx = cents[i]
        col = min(cols - 1, max(0, int(cx // cw)))
        row = min(rows - 1, max(0, int(cy // chh)))
        buckets.setdefault((row, col), []).append(i + 1)
    return lbl, alpha, buckets


def keep_main_blobs(mask: Image.Image, min_frac: float) -> Image.Image:
    """Drop specks — keeps blobs at least `min_frac` of the largest blob's area.

    Cropping a fixture out of a wall snags slivers of cornice and pilaster along
    the way; they're always tiny next to the fixture itself.
    """
    arr = np.asarray(mask)
    ink = arr > 24
    lbl, n = ndimage.label(ink)
    if n <= 1:
        return mask
    areas = ndimage.sum(ink, lbl, range(1, n + 1))
    cutoff = areas.max() * min_frac
    keep = [i + 1 for i in range(n) if areas[i] >= cutoff]
    return Image.fromarray(np.where(np.isin(lbl, keep), arr, 0).astype(np.uint8), mode="L")


def content_box(img: Image.Image, threshold: int = 12):
    """Bounding box of pixels above an alpha threshold, or None if empty."""
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(a > threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_height(img: Image.Image, target_h: int) -> Image.Image:
    if img.height == target_h:
        return img
    scale = target_h / img.height
    w = max(1, round(img.width * scale))
    return img.resize((w, target_h), Image.LANCZOS)


def fit_box(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    scale = min(max_w / img.width, max_h / img.height, 1.0)
    if scale >= 0.999:
        return img
    return img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS,
    )


@dataclass
class Sheet:
    """One source sheet and how to carve it up."""

    src: str
    mode: str
    cols: int
    rows: int
    out_dir: str
    names: list[str]
    max_h: int = 256
    max_w: int = 384
    pad: int = 2
    min_area: int = 48
    entries: list[dict] = field(default_factory=list)


SHEETS = [
    Sheet(
        src="additional_assets/06_standard_furniture_asset_sheet.jpeg",
        mode="magenta", cols=4, rows=4, out_dir="furniture",
        names=[
            "table_square", "table_round", "chair_a", "chair_b",
            "counter", "display_case", "bench", "stool",
            "plant", "chalkboard", "pendant_lamp", "floor_lamp",
            "rug", "wall_clock", "coral_sconce", "condiment_tray",
        ],
        max_h=200,
    ),
    Sheet(
        src="additional_assets/03_coral_furniture_asset_sheet.jpeg",
        mode="magenta", cols=4, rows=4, out_dir="furniture_coral",
        names=[
            "table_square", "table_round", "chair_a", "chair_b",
            "counter", "display_case", "bench", "stool",
            "plant", "chalkboard", "pendant_lamp", "floor_lamp",
            "rug", "wall_clock", "coral_sconce", "condiment_tray",
        ],
        max_h=200,
    ),
    Sheet(
        src="additional_assets/02_whale_luxury_furniture_asset_sheet.jpeg",
        mode="magenta", cols=4, rows=4, out_dir="furniture_whale",
        names=[
            "table_square", "table_round", "chair_a", "chair_b",
            "counter", "display_case", "bench", "stool",
            "plant", "chalkboard", "pendant_lamp", "floor_lamp",
            "rug", "wall_clock", "coral_sconce", "condiment_tray",
        ],
        max_h=200,
    ),
    Sheet(
        src="additional_assets/01_factory_machines_asset_sheet.jpeg",
        mode="magenta", cols=5, rows=2, out_dir="machines",
        names=[
            "berry_tumbler", "citrus_press", "pineapple_slicer",
            "onion_boiler", "ice_mill",
            "rice_grinder", "egg_roller", "cream_churn",
            "butter_roller", "cheese_press",
        ],
        max_h=210,
    ),
    Sheet(
        src="additional_assets/08_ingredients_asset_sheet.jpeg",
        mode="cream", cols=6, rows=5, out_dir="ingredients",
        names=[
            "shrimp", "crab", "lobster_tail", "squid", "octopus_leg", "scallop",
            "clam", "oyster", "salmon", "tuna", "kelp", "sea_grapes",
            "nori", "lemon", "coconut", "tomato", "cabbage", "potato",
            "carrot", "strawberry", "blueberry", "lime", "pineapple", "onion",
            "rice", "flour", "egg", "milk", "butter", "cheese",
        ],
        max_h=128,
    ),
    Sheet(
        src="additional_assets/09_food_asset_sheet.jpeg",
        mode="cream", cols=6, rows=4, out_dir="food",
        names=[
            "oyster_plate", "crab_burger", "coral_platter",
            "kelp_ramen", "scallop_tart", "shrimp_toast",
            "puffer_burger", "kelp_fries", "octopus_skewer",
            "miso_chowder", "starfish_cookie", "clam_congee",
            "sea_roll", "reef_soda", "anchor_pretzel",
            "mermaid_pop", "lobster_roll", "scallop_bowl",
            "kelp_latte", "pearl_boba", "tide_sundae",
            "taiyaki", "cinnamon_swirls", "treasure_bento",
        ],
        max_h=132,
    ),
]

ROOMS = [
    ("additional_assets/05_cafe_room_empty_isometric.jpeg", "rooms/cafe.png", 1086),
    ("additional_assets/04_factory_room_empty_isometric.jpeg", "rooms/factory.png", 1176),
]

# The painted rooms are hand-laid, so their floors don't sit on a consistent
# lattice — the game builds its walls procedurally instead. These crops lift the
# hand-drawn fixtures back out so the generated walls keep the painted charm.
# Rects are measured against the cut-out assets/rooms/*.png. `facing` records
# which wall the art's perspective already matches.
DECALS = [
    ("cafe", "porthole", "left", (258, 312, 360, 416)),
    ("cafe", "door", "right", (722, 162, 888, 434)),
    ("cafe", "window", "right", (1024, 296, 1222, 558)),
    ("factory", "porthole", "left", (104, 324, 336, 578)),
    ("factory", "porthole", "right", (774, 218, 932, 464)),
    ("factory", "hatch", "right", (962, 326, 1152, 682)),
]


def is_wall_or_trim(rgb: np.ndarray) -> np.ndarray:
    """Match the flat mint wall and coral baseboard the fixtures are set into."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    mint = (g >= r - 6) & (g >= b) & (g > 170) & (g < 240) & (abs(r - b) < 24) & ((g - b) < 42)
    coral = (r > 190) & ((r - g) > 45) & ((g - b) > 4) & (g > 100) & (g < 190)
    return mint | coral


def slice_decals(manifest: dict) -> None:
    os.makedirs(os.path.join(OUT, "decals"), exist_ok=True)
    out = []
    seen: dict[str, int] = {}
    for room, kind, facing, rect in DECALS:
        room_img = Image.open(os.path.join(OUT, f"rooms/{room}.png")).convert("RGBA")
        crop = room_img.crop(rect)

        rgb = np.asarray(crop.convert("RGB"))
        a0 = np.asarray(crop.getchannel("A"))
        # already-transparent pixels count as background so the flood can start
        candidate = is_wall_or_trim(rgb) | (a0 < 40)
        bg = flood_from_border(candidate)

        alpha = np.where(bg, 0, a0).astype(np.uint8)
        am = Image.fromarray(alpha, mode="L").filter(ImageFilter.MinFilter(3))
        am = am.filter(ImageFilter.GaussianBlur(0.6))
        cut = crop.copy()
        cut.putalpha(keep_main_blobs(am, 0.08))

        box = content_box(cut)
        if box:
            cut = cut.crop(box)

        slug = f"{room}_{kind}_{facing[0]}"
        seen[slug] = seen.get(slug, 0) + 1
        if seen[slug] > 1:
            slug = f"{slug}{seen[slug]}"
        rel = f"decals/{slug}.png"
        cut.save(os.path.join(OUT, rel))
        out.append({"id": slug, "room": room, "kind": kind, "facing": facing,
                    "src": rel, "w": cut.width, "h": cut.height})

    manifest["decals"] = out
    print(f"  decals: {len(out)}")


def slice_sheets(manifest: dict) -> None:
    for sheet in SHEETS:
        img = lift_background(Image.open(os.path.join(PACK, sheet.src)), sheet.mode)
        lbl, alpha, buckets = bucket_blobs(img, sheet.cols, sheet.rows, sheet.min_area)
        out_dir = os.path.join(OUT, sheet.out_dir)
        os.makedirs(out_dir, exist_ok=True)

        for idx, name in enumerate(sheet.names):
            col, row = idx % sheet.cols, idx // sheet.cols
            ids = buckets.get((row, col))
            if not ids:
                print(f"  ! {sheet.out_dir}/{name}: no ink in cell r{row}c{col}")
                continue
            keep = np.isin(lbl, ids)
            cell = img.copy()
            cell.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8), mode="L"))
            box = content_box(cell)
            if box is None:
                print(f"  ! {sheet.out_dir}/{name}: empty cell")
                continue
            cut = cell.crop(box)
            cut = fit_box(cut, sheet.max_w, sheet.max_h)

            padded = Image.new("RGBA", (cut.width + sheet.pad * 2, cut.height + sheet.pad * 2))
            padded.paste(cut, (sheet.pad, sheet.pad))

            rel = f"{sheet.out_dir}/{name}.png"
            padded.save(os.path.join(OUT, rel))
            sheet.entries.append({"id": name, "src": rel, "w": padded.width, "h": padded.height})

        manifest[sheet.out_dir] = sheet.entries
        print(f"  {sheet.out_dir}: {len(sheet.entries)} sprites")


def slice_characters(manifest: dict) -> None:
    """Trim the 3-frame character strips to a shared box so frames don't jitter."""
    src_manifest = json.load(open(os.path.join(PACK, "manifest.json")))
    out: dict[str, list[dict]] = {"customers": [], "staff": []}

    for ch in src_manifest["characters"]:
        img = Image.open(os.path.join(PACK, ch["file"])).convert("RGBA")
        fw = img.width // 3
        frames = [img.crop((i * fw, 0, (i + 1) * fw, img.height)) for i in range(3)]

        boxes = [content_box(f) for f in frames]
        boxes = [b for b in boxes if b]
        if not boxes:
            continue
        x0 = min(b[0] for b in boxes)
        y0 = min(b[1] for b in boxes)
        x1 = max(b[2] for b in boxes)
        y1 = max(b[3] for b in boxes)

        cropped = [f.crop((x0, y0, x1, y1)) for f in frames]
        target_h = 176 if ch["category"] == "customers" else 184
        cropped = [fit_height(f, target_h) for f in cropped]

        fwo, fho = cropped[0].width, cropped[0].height
        strip = Image.new("RGBA", (fwo * 3, fho))
        for i, f in enumerate(cropped):
            strip.paste(f, (i * fwo, 0))

        slug = os.path.splitext(os.path.basename(ch["file"]))[0]
        rel = f"{ch['category']}/{slug}.png"
        os.makedirs(os.path.join(OUT, ch["category"]), exist_ok=True)
        strip.save(os.path.join(OUT, rel))

        out[ch["category"]].append({
            "id": slug,
            "name": ch["name"],
            "src": rel,
            "fw": fwo,
            "fh": fho,
            "frames": ch["frame_order"],
        })

    manifest["customers"] = out["customers"]
    manifest["staff"] = out["staff"]
    print(f"  customers: {len(out['customers'])}  staff: {len(out['staff'])}")


def slice_rooms(manifest: dict) -> None:
    os.makedirs(os.path.join(OUT, "rooms"), exist_ok=True)
    rooms = []
    for src, rel, target_h in ROOMS:
        img = lift_background(Image.open(os.path.join(PACK, src)), "cream", feather=0.5)
        box = content_box(img)
        if box:
            img = img.crop(box)
        img = fit_height(img, target_h)
        img.save(os.path.join(OUT, rel))
        rooms.append({"id": os.path.splitext(os.path.basename(rel))[0],
                      "src": rel, "w": img.width, "h": img.height})
    manifest["rooms"] = rooms
    print(f"  rooms: {len(rooms)}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    manifest: dict = {}
    print("slicing sheets…")
    slice_sheets(manifest)
    print("slicing characters…")
    slice_characters(manifest)
    print("slicing rooms…")
    slice_rooms(manifest)
    print("slicing decals…")
    slice_decals(manifest)

    with open(os.path.join(OUT, "atlas.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"wrote {os.path.relpath(os.path.join(OUT, 'atlas.json'), ROOT)}")


if __name__ == "__main__":
    main()
