// The long game: flyers, research, the shop, and the pottery class.

/* ---------------------------------------------------------------- flyers  */

/**
 * Flyers are made in the morning and handed out during service. Ten taps prints
 * one; during a shift, handing one out brings a guest through the door there and
 * then — one flyer, one customer, no waiting on the arrival clock. That makes the
 * stack you printed before opening the thing that paces your day, and it is why
 * every automation in the game eventually points back at the printing.
 */
export const FLYER_TAPS = 10;
export const FLYER_BASE_MAX = 8;

/** Passive draw from the flyers still in hand — word gets round on its own. */
export const flyerDraw = (posters) => posters * 0.22;

/* -------------------------------------------------------------- research  */

/**
 * Research points come out of a Harbour Computer on the factory floor. Nodes
 * are deliberately cheap at the start — the first flyer node pays for itself
 * within a day — because the tree exists to retire chores, not to gate them.
 */
export const RESEARCH = [
  { id: 'flyer_1', label: 'Bigger Print', cost: 6, group: 'flyer',
    blurb: 'Two fewer taps to finish a poster.' },
  { id: 'flyer_2', label: 'Stencil Set', cost: 18, group: 'flyer', needs: 'flyer_1',
    blurb: 'Another three taps off, and room for a fourth poster.' },
  { id: 'flyer_auto', label: 'Paste Crew', cost: 44, group: 'flyer', needs: 'flyer_2',
    blurb: 'Posters go up on their own, one every twelve seconds.' },

  { id: 'speed_1', label: 'Greased Bearings', cost: 10, group: 'works',
    blurb: 'Every machine runs 15% faster.' },
  { id: 'speed_2', label: 'Harbour Dynamo', cost: 30, group: 'works', needs: 'speed_1',
    blurb: 'Another 20% on top.' },
  { id: 'belt_smart', label: 'Sorting Logic', cost: 26, group: 'works',
    blurb: 'Refiners hold twice as much, so a line never stalls waiting.' },

  { id: 'money_1', label: 'Table Talk', cost: 14, group: 'trade',
    blurb: 'Guests tip 15% more.' },
  { id: 'money_2', label: 'Harbour Reputation', cost: 40, group: 'trade', needs: 'money_1',
    blurb: 'Another 25%, and rare guests turn up more often.' },
  { id: 'kiln_1', label: 'Hotter Kiln', cost: 22, group: 'trade',
    blurb: 'Pottery earns experience twice as fast.' },

  { id: 'flyer_board', label: 'Harbour Notice Board', cost: 12, group: 'flyer',
    blurb: 'Room for four more flyers in the satchel.' },
  { id: 'lantern_string', label: 'String of Lanterns', cost: 20, group: 'flyer',
    blurb: 'Guests drift in 20% quicker on their own.' },
  { id: 'quick_wash', label: 'Deep Sink', cost: 16, group: 'works',
    blurb: 'Tables are cleared in half the time.' },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export const RESEARCH_GROUPS = [
  { id: 'flyer', label: 'Word of Mouth' },
  { id: 'works', label: 'The Works' },
  { id: 'trade', label: 'Trade' },
];

/* ------------------------------------------------------------------ shop  */

/**
 * Room only, and the expensive backbone of the game: each extension widens the
 * dining room by two tiles each way, which is the only way to fit more tables,
 * so everything else eventually feeds into affording one.
 *
 * This used to be a general shop, but a shop that sells one kind of thing
 * belongs beside the other things you place — so it is a tab in the build menu
 * now, and everything that was not an extension moved to the research board,
 * where it reads as an upgrade rather than a purchase.
 */
export const SHOP = [
  { id: 'area_wharf', label: 'The Wharf Extension', cost: 1400, rank: 2,
    size: 11, blurb: 'Knock through to the wharf: 11×11.' },
  { id: 'area_lantern', label: 'Lantern Terrace', cost: 6500, rank: 5,
    size: 13, needs: 'area_wharf', blurb: 'Take the terrace too: 13×13.' },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP.map((s) => [s.id, s]));

/* --------------------------------------------------------------- pottery  */

/**
 * A side craft that levels off served guests. It is worth doing for one reason:
 * at level five the kiln opens, and a forged serving dish is the only permanent
 * multiplier a single recipe can get.
 */
export const POTTERY_XP = [0, 40, 110, 230, 420, 700, 1100, 1650];
export const FORGE_LEVEL = 5;
export const MAX_DISH = 3;

export const potteryLevel = (xp) => {
  let lv = 1;
  for (let i = 1; i < POTTERY_XP.length; i++) if (xp >= POTTERY_XP[i]) lv = i + 1;
  return lv;
};

export const potteryNext = (xp) => POTTERY_XP.find((x) => x > xp) ?? null;

/** What it costs to forge, or to improve, the serving dish for one recipe. */
export const forgeCost = (tier) => ({
  coins: Math.round(450 * 2.3 ** tier),
  clay: 2 + tier * 2,
});

/** A forged dish raises the recipe's stars and what guests will pay for it. */
export const dishStars = (tier) => tier;
export const dishPrice = (tier) => 1 + tier * 0.14;

/**
 * Which plate a forged dish is served on. Forty designs came with the pack,
 * ordered roughly plain earthenware to gilded china, so a tier maps onto a
 * band of them and the recipe id picks one inside that band — every dish on the
 * menu gets its own plate, and a better tier is visibly better crockery.
 */
const PLATE_BANDS = [
  null,
  ['plate_a01', 'plate_a02', 'plate_a03', 'plate_a04', 'plate_a05',
    'plate_a06', 'plate_a07', 'plate_a08', 'plate_a09', 'plate_a10'],
  ['plate_b01', 'plate_b02', 'plate_b03', 'plate_b04', 'plate_b05',
    'plate_a11', 'plate_a12', 'plate_a13', 'plate_a14', 'plate_a15'],
  ['plate_b16', 'plate_b17', 'plate_b18', 'plate_b19', 'plate_b20',
    'plate_a16', 'plate_a17', 'plate_a18', 'plate_a19', 'plate_a20'],
];

export function plateFor(recipeId, tier) {
  const band = PLATE_BANDS[Math.max(0, Math.min(MAX_DISH, tier))];
  if (!band) return null;
  let hash = 0;
  for (let i = 0; i < recipeId.length; i++) hash = (hash * 31 + recipeId.charCodeAt(i)) | 0;
  return band[Math.abs(hash) % band.length];
}
