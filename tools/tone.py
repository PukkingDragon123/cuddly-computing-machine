"""One tone curve, shared by every slicer and by the one-shot lift.

The whole pack was drawn a shade dim and a shade grey: mean value across the
sprites sat around 0.6, and the two dark finishes were nearer 0.54. On a warm
cream floor that reads as a room with the lights off.

Two moves, in this order:

  saturate   pull each channel away from its own luma. Colour, not contrast, is
             what was missing — the wood was brown-grey rather than brown.

  lift       add `k * x * (1 - x)`. That is zero at both ends and largest in the
             middle, so midtones come up while pure black stays pure black and
             pure white stays pure white. A gamma curve would have lifted the
             ink outlines with everything else and turned every drawing to mush;
             the outlines are the whole style here and they must not move.

Alpha is never touched, so nothing gains a halo.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

# Picked by eye against the room's own cream floor: enough that the furniture
# stops reading as brown-grey, not so much that the pack looks like a different
# game from its own loading screen.
SAT = 1.20
LIFT = 0.30

# Rec. 709 luma, which is what the eye actually weights.
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def tone(img: Image.Image, sat: float = SAT, lift: float = LIFT) -> Image.Image:
    """Brighter and more colourful, with the outlines left where they are."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:]

    if sat != 1.0:
        luma = (rgb * LUMA).sum(axis=-1, keepdims=True)
        rgb = np.clip(luma + (rgb - luma) * sat, 0.0, 1.0)
    if lift:
        rgb = np.clip(rgb + lift * rgb * (1.0 - rgb), 0.0, 1.0)

    out = np.concatenate([rgb, alpha], axis=-1)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), mode='RGBA')
