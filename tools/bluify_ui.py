"""Recolour the UI artwork into the game's blue-and-white palette.

The panels, the book and the loading-screen props were drawn warm — cream
paper, oak board, orange rules. The interface is now one hue, so rather than
lay a CSS filter over the panels (which would tint their contents too) the
drawings themselves are remapped: hue is replaced, lightness is kept, and
saturation is scaled per band so the pieces that used to be told apart by
colour are now told apart by how loud they are.

Run from the repo root:  python3 tools/bluify_ui.py
"""

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets' / 'ui'

# (source, destination). Destinations are new files: the warm originals stay
# on disk so the mapping can be re-run and re-tuned.
JOBS = [
    ('book_plain.webp', 'book_plain_blue.webp'),
    ('book_menu.webp', 'book_menu_blue.webp'),
    ('book_diary.webp', 'book_diary_blue.webp'),
    ('pot.webp', 'pot_blue.webp'),
    ('spatula.webp', 'spatula_blue.webp'),
]


def remap(rgb):
    """Warm RGB float array (h, w, 3) in 0..1 -> the blue palette."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = np.max(rgb, axis=-1), np.min(rgb, axis=-1)
    l = (mx + mn) / 2
    d = mx - mn
    s = np.where(d < 1e-6, 0.0, d / np.where(l < 0.5, mx + mn, 2.0 - mx - mn + 1e-9))

    # hue, in degrees
    hu = np.zeros_like(l)
    with np.errstate(invalid='ignore', divide='ignore'):
        hu = np.where(mx == r, ((g - b) / np.where(d == 0, 1, d)) % 6, hu)
        hu = np.where(mx == g, (b - r) / np.where(d == 0, 1, d) + 2, hu)
        hu = np.where(mx == b, (r - g) / np.where(d == 0, 1, d) + 4, hu)
    hu = (hu * 60) % 360

    # the same bands the stylesheet uses
    nh = np.full_like(l, 205.0)
    nh = np.where((hu < 20) | (hu >= 350), 213.0, nh)
    nh = np.where((hu >= 80) & (hu < 150), 196.0, nh)
    nh = np.where((hu >= 150) & (hu < 230), 202.0, nh)
    nh = np.where((hu >= 230) & (hu < 350), 222.0, nh)

    nl = np.where(l >= 0.86, l + (1 - l) * 0.50, l)
    nl = np.where((l >= 0.70) & (l < 0.86), l + (1 - l) * 0.18, nl)

    ns = np.where(l >= 0.86, np.minimum(s * 0.55, 0.62), 0.0)
    ns = np.where((l >= 0.70) & (l < 0.86), np.minimum(s * 0.62, 0.50), ns)
    ns = np.where((l >= 0.55) & (l < 0.70), np.minimum(s * 0.75, 0.55), ns)
    ns = np.where(l < 0.55, np.minimum(s * 0.92, 0.60), ns)

    # A dark warm field (the book's cover, the oak of the board) desaturates to
    # a flat grey if it is only rescaled, so the darks get a floor: dark here
    # means navy, not slate.
    ns = np.where((l < 0.55) & (s >= 0.10), np.maximum(ns, 0.26), ns)

    # near-neutrals stay neutral so ink lines do not turn into blue smudges
    ns = np.where(s < 0.04, s, ns)

    return hls_to_rgb(nh / 360.0, nl, ns)


def hls_to_rgb(h, l, s):
    """Vectorised colorsys.hls_to_rgb."""
    m2 = np.where(l <= 0.5, l * (1 + s), l + s - l * s)
    m1 = 2 * l - m2

    def channel(hue):
        hue = hue % 1.0
        out = np.where(hue < 1 / 6, m1 + (m2 - m1) * hue * 6,
              np.where(hue < 0.5, m2,
              np.where(hue < 2 / 3, m1 + (m2 - m1) * (2 / 3 - hue) * 6, m1)))
        return out

    flat = s < 1e-6
    return np.stack([
        np.where(flat, l, channel(h + 1 / 3)),
        np.where(flat, l, channel(h)),
        np.where(flat, l, channel(h - 1 / 3)),
    ], axis=-1)


def main():
    for src, dst in JOBS:
        p = ART / src
        if not p.exists():
            print('skip (missing)', src)
            continue
        im = Image.open(p).convert('RGBA')
        a = np.asarray(im).astype(np.float32) / 255.0
        out = remap(a[..., :3])
        out = np.clip(out, 0, 1)
        rgba = np.concatenate([out, a[..., 3:4]], axis=-1)
        Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA').save(
            ART / dst, 'WEBP', quality=92, method=6)
        print('wrote', dst, im.size)


if __name__ == '__main__':
    sys.exit(main())
