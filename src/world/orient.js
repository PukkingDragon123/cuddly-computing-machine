// Which way a piece of furniture is turned.
//
// The pack draws each piece twice: `f` is the three-quarter view facing screen
// down-left — a chair's seat toward you — and `b` is the same piece turned to
// face up-right, so a chair shows its back.
// Mirroring the screen image swaps the two ground axes — a step down-left
// becomes a step down-right, a step up-right becomes up-left — so the flip of
// `f` faces down-right and the flip of `b` faces up-left. Two drawings and a
// flip therefore cover all four isometric orientations, and none of them is a
// mirrored fake: every one is a real drawing seen the right way round.

/** The four turns, in Rotate-button order. `d` is the tile step it faces. */
export const ROTATIONS = [
  { art: 'f', mirror: false, d: { c: 0, r: 1 } },    // down-left
  { art: 'f', mirror: true, d: { c: 1, r: 0 } },     // down-right
  { art: 'b', mirror: false, d: { c: 0, r: -1 } },   // up-right
  { art: 'b', mirror: true, d: { c: -1, r: 0 } },    // up-left
];

export const ROT_COUNT = ROTATIONS.length;

export const rotationAt = (rot) => ROTATIONS[((rot | 0) % ROT_COUNT + ROT_COUNT) % ROT_COUNT];

/** The turn that faces a neighbouring tile, or null if it isn't adjacent. */
export function rotationToward(dc, dr) {
  const i = ROTATIONS.findIndex((o) => o.d.c === dc && o.d.r === dr);
  return i < 0 ? null : i;
}

/** Sprite id for a piece at a given turn. Single-drawing pieces ignore it. */
export function artFor(sprite, rot) {
  if (typeof sprite === 'string') return sprite;
  const o = rotationAt(rot);
  return sprite[o.art] ?? sprite.f ?? sprite.b;
}

/**
 * Whether to draw mirrored. A piece with only one drawing has no back view to
 * turn to, so its two "turns" are just the two mirrorings.
 */
export function mirrorAt(sprite, rot) {
  return typeof sprite === 'string' ? rot % 2 === 1 : rotationAt(rot).mirror;
}

/**
 * Turn stored on a saved piece. Saves written before furniture could turn all
 * the way round carry a `flip` boolean instead, which meant the two mirrorings
 * of the front view.
 */
export function rotOf(rec) {
  if (Number.isInteger(rec.rot)) return ((rec.rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT;
  return rec.flip ? 1 : 0;
}
