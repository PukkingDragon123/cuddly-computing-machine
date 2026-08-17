// Fame, and the ladder it climbs.
//
// The game had money and it had a menu, but no spine: everything was buyable on
// day one if you saved up, so nothing ever *opened*. Fame is that spine. It is
// the same number reputation always was — earned by feeding people well and lost
// by keeping them waiting — but now it has rungs on it, and every rung hands you
// something you could not have before.
//
// One rule, kept everywhere: fame gates *what exists*, coins gate *when you get
// it*. A rung never gives you a thing outright, it puts the thing on the shelf.

/**
 * The ladder. `at` is the fame it takes; `gives` is what that rung opens, in
 * the player's words rather than the data's — the panel reads this, so it has
 * to be the truth about the rung and not a summary of it.
 */
export const RANKS = [
  { id: 'shack', at: 0, name: 'Driftwood Shack',
    gives: ['Three recipes', 'Pine furniture', 'A room, a pass and two chairs'] },
  { id: 'stall', at: 60, name: 'Quayside Stall',
    gives: ['Cosy Cottage finish', 'Three more recipes', 'The dishwasher and the noodle cook'] },
  { id: 'cafe', at: 200, name: 'Harbour Café',
    gives: ['The works: belts, machines, the intake', 'The Wharf extension', 'Three more recipes'] },
  { id: 'bistro', at: 500, name: 'Harbour Bistro',
    gives: ['Antique finish', 'Refiners', 'A host and a server'] },
  { id: 'supper', at: 1000, name: 'Supper Room',
    gives: ['The workshop: computers and promotion', 'Research', 'Three more recipes'] },
  { id: 'favourite', at: 1900, name: 'Harbour Favourite',
    gives: ['The pottery works and the kiln', 'The Lantern Terrace', 'Three more recipes'] },
  { id: 'landmark', at: 3400, name: 'The Landmark',
    gives: ['The glaze kiln', 'The last of the crew', 'The big plates'] },
  { id: 'legend', at: 6000, name: 'Legend of the Harbour',
    gives: ['Treasure Bento', 'Nothing left to open. Go and cook.'] },
];

export const MAX_RANK = RANKS.length - 1;

/** Which rung a given fame sits on. */
export function rankAt(fame) {
  let i = 0;
  for (let n = 0; n < RANKS.length; n++) if (fame >= RANKS[n].at) i = n;
  return i;
}

/** How far along the current rung, 0..1. The top rung is always full. */
export function rankProgress(fame) {
  const i = rankAt(fame);
  const next = RANKS[i + 1];
  if (!next) return 1;
  const from = RANKS[i].at;
  return Math.max(0, Math.min(1, (fame - from) / (next.at - from)));
}

/** Fame still owed on this rung, or 0 at the top. */
export function toNextRank(fame) {
  const next = RANKS[rankAt(fame) + 1];
  return next ? Math.max(0, next.at - fame) : 0;
}

/** What the chef makes of each promotion. He is warming up, slowly. */
export const RANK_LINES = [
  null,
  "A stall of our own! People know where to find us now.",
  "A café. We have a proper name over the door.",
  "A bistro! Tablecloths and everything.",
  "A supper room. People book a table days ahead.",
  "We are somebody's favourite place. That is the nicest one.",
  "A landmark! We are on the actual map.",
  "A legend. Right — come on, cook me something.",
];
