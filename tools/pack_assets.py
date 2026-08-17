#!/usr/bin/env python3
"""Re-encode every sprite in the atlas as WebP.

The slicers write PNG, which is the right thing for a slicer to write: it is
lossless, so re-running one never degrades the art. It is the wrong thing to
ship. Four hundred hand-drawn sprites with soft edges and big flat fields come
to twenty-two megabytes of PNG and about four of WebP at a quality nobody can
tell apart side by side — and until all of it has arrived there is no game, so
that difference is most of the wait on the loading screen.

So this is the last step, run after any slicer:

    python3 tools/slice_pack06.py     # writes PNGs, updates the atlas
    python3 tools/pack_assets.py      # re-encodes them, rewrites the atlas

It is safe to run twice: entries already pointing at a .webp are left alone.
Pass --keep to leave the PNGs on disk (they are deleted by default, since the
atlas no longer refers to them and git would otherwise carry both).

    python3 tools/pack_assets.py [--quality 88] [--keep]
"""

from __future__ import annotations

import argparse
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
ATLAS = os.path.join(OUT, 'atlas.json')

# 88 was picked by eye on the worst case for a lossy codec in this pack — a
# character strip, which is flat colour inside a dark outline, exactly where
# ringing shows. Below about 80 the outlines start to fur.
QUALITY = 88
METHOD = 4          # 6 is ~3x slower for a couple of per cent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quality', type=int, default=QUALITY)
    ap.add_argument('--keep', action='store_true', help='leave the PNGs on disk')
    args = ap.parse_args()

    atlas = json.load(open(ATLAS))
    was = now = 0
    done = skipped = 0

    for group, entries in atlas.items():
        for entry in entries:
            src = entry['src']
            if src.endswith('.webp'):
                skipped += 1
                path = os.path.join(OUT, src)
                if os.path.exists(path):
                    was += os.path.getsize(path)
                    now += os.path.getsize(path)
                continue
            png = os.path.join(OUT, src)
            if not os.path.exists(png):
                print(f'  ! missing {src}')
                continue
            webp_rel = os.path.splitext(src)[0] + '.webp'
            webp = os.path.join(OUT, webp_rel)
            img = Image.open(png).convert('RGBA')
            img.save(webp, 'WEBP', quality=args.quality, method=METHOD)
            was += os.path.getsize(png)
            now += os.path.getsize(webp)
            entry['src'] = webp_rel
            if not args.keep:
                os.remove(png)
            done += 1

    with open(ATLAS, 'w') as fh:
        json.dump(atlas, fh, indent=1)

    if skipped:
        print(f'{skipped} already packed')
    print(f'{done} re-encoded: {was / 1e6:.2f} MB -> {now / 1e6:.2f} MB'
          f' ({now / was * 100:.0f}%)' if was else 'nothing to do')


if __name__ == '__main__':
    main()
