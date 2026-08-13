"""Cut the interface icons out of art_pack_05/ui_icons.png.

The sheet is seven soft-edged tiles laid out two to a row on a flat pale blue
field. Each tile is one connected blob once the field is keyed out, so the cut
is: distance from the field colour -> mask -> label -> one file per blob, in
reading order.

The edges are glossy and fade into the field rather than ending on a line, so
alpha is a ramp over that distance instead of a threshold. A hard cut leaves a
sawn-off rim on artwork drawn this way; the ramp keeps the gloss.

Run from the repo root:  python3 tools/slice_pack05.py
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art_pack_05' / 'ui_icons.png'
OUT = ROOT / 'assets' / 'ui'

# reading order down the sheet
NAMES = ['tools', 'recipes', 'market', 'crew', 'list', 'help', 'plate']

KEY_LO, KEY_HI = 10, 44      # alpha ramp, in summed-channel distance from the field
MIN_AREA = 8000
PAD = 6


def main():
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(np.float32)

    # the field colour, read off the top edge where nothing is drawn
    field = np.median(a[:8].reshape(-1, 3), axis=0)
    dist = np.abs(a - field).sum(axis=-1)

    solid = ndimage.binary_fill_holes(
        ndimage.binary_closing(dist > 26, np.ones((9, 9))))
    lab, n = ndimage.label(solid)

    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h * w < MIN_AREA:
            continue
        boxes.append((sl[0].start, sl[1].start, sl, i))
    # down the page, then across it
    boxes.sort(key=lambda b: (b[0] // 80, b[1]))

    if len(boxes) != len(NAMES):
        raise SystemExit(f'found {len(boxes)} tiles, expected {len(NAMES)}')

    OUT.mkdir(parents=True, exist_ok=True)
    for (top, left, sl, idx), name in zip(boxes, NAMES):
        y0 = max(0, sl[0].start - PAD)
        y1 = min(a.shape[0], sl[0].stop + PAD)
        x0 = max(0, sl[1].start - PAD)
        x1 = min(a.shape[1], sl[1].stop + PAD)

        crop = a[y0:y1, x0:x1]
        d = dist[y0:y1, x0:x1]
        # keep this tile only: anything belonging to a neighbour is cut away
        mine = ndimage.binary_dilation(lab[y0:y1, x0:x1] == idx, np.ones((11, 11)))

        alpha = np.clip((d - KEY_LO) / (KEY_HI - KEY_LO), 0, 1) * mine
        rgba = np.dstack([crop, alpha * 255]).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(OUT / f'{name}.webp', 'WEBP',
                                           quality=94, method=6)
        print('wrote', name, (x1 - x0, y1 - y0))


if __name__ == '__main__':
    main()
