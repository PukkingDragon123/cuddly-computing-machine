// Which side of a table a chair may take.

/**
 * Offsets from chair to table, as (dc, dr), and which of the two drawn facings
 * turns the chair that way.
 *
 * The furniture pack ships a chair seen from the front-left and one from the
 * front-right — there is no back view, and mirroring one only gives the other.
 * So a chair is only a seat when its table lies level with it or further down
 * the screen: exactly the placements a real drawing can honestly cover. Five
 * sides is one more than a square grid's four anyway.
 */
export const SEAT_SIDES = [
  // table down-right / down-left: the chair is a half tile away, so back it off
  // a touch to clear the tabletop
  { dc: 1, dr: 0, facing: 'r', nudge: { x: -11, y: -5 }, bias: 0 },
  { dc: 0, dr: 1, facing: 'l', nudge: { x: 11, y: -5 }, bias: 0 },
  // level with the table, a whole tile to the side: pull the chair in instead,
  // or it reads as abandoned in the middle of the floor
  { dc: 1, dr: -1, facing: 'r', nudge: { x: 34, y: 3 }, bias: 3 },
  { dc: -1, dr: 1, facing: 'l', nudge: { x: -34, y: 3 }, bias: 3 },
  // straight up-screen of the table, tucked in behind it
  { dc: 1, dr: 1, facing: 'r', nudge: { x: 0, y: -8 }, bias: 0 },
];

/** The side a chair at (c,r) would take at a table, or null if it can't seat. */
export const seatSideFor = (c, r, table) =>
  SEAT_SIDES.find((s) => c + s.dc === table.c && r + s.dr === table.r) ?? null;

/** Tiles around a table that a chair can actually be seated on. */
export const seatTilesOf = (table) =>
  SEAT_SIDES.map((s) => ({ c: table.c - s.dc, r: table.r - s.dr }));
