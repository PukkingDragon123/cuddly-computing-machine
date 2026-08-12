// Everything the pantry can hold.
//
// `source` says where a thing *wants* to come from: 'factory' is grown or
// pressed by a machine, 'refine' comes out of a refiner, 'market' is the sea
// catch off the boats. But the harbour market sells the lot — every ingredient
// in the game has a price, because a kitchen that cannot buy a pint of milk on
// day one is a kitchen that cannot open.
//
// What keeps the works worth building is the markup: anything a machine could
// have made for you costs roughly three times what it is worth over the counter.
// You can always buy your way out of a corner; you just would not want to live
// there.

export const INGREDIENTS = {
  // ---- factory grown / pressed ------------------------------------------
  rice:       { name: 'Rice',        source: 'factory', value: 3,  price: 9 },
  blueberry:  { name: 'Blueberry',   source: 'factory', value: 4,  price: 12 },
  lime:       { name: 'Lime',        source: 'factory', value: 4,  price: 12 },
  pineapple:  { name: 'Pineapple',   source: 'factory', value: 6,  price: 18 },
  onion:      { name: 'Onion',       source: 'factory', value: 3,  price: 9 },
  egg:        { name: 'Egg',         source: 'factory', value: 4,  price: 11 },
  milk:       { name: 'Milk',        source: 'factory', value: 5,  price: 13 },
  // ---- factory refined --------------------------------------------------
  flour:      { name: 'Flour',       source: 'refine',  value: 9,  price: 26 },
  butter:     { name: 'Butter',      source: 'refine',  value: 13, price: 38 },
  cheese:     { name: 'Cheese',      source: 'refine',  value: 15, price: 44 },

  // ---- harbour market ---------------------------------------------------
  kelp:         { name: 'Kelp',         source: 'market', value: 4,  price: 5 },
  nori:         { name: 'Nori',         source: 'market', value: 6,  price: 8 },
  sea_grapes:   { name: 'Sea Grapes',   source: 'market', value: 7,  price: 9 },
  potato:       { name: 'Potato',       source: 'market', value: 3,  price: 4 },
  tomato:       { name: 'Tomato',       source: 'market', value: 4,  price: 5 },
  cabbage:      { name: 'Cabbage',      source: 'market', value: 4,  price: 5 },
  carrot:       { name: 'Carrot',       source: 'market', value: 3,  price: 4 },
  lemon:        { name: 'Lemon',        source: 'market', value: 4,  price: 5 },
  coconut:      { name: 'Coconut',      source: 'market', value: 7,  price: 9 },
  strawberry:   { name: 'Strawberry',   source: 'market', value: 6,  price: 7 },
  clam:         { name: 'Clam',         source: 'market', value: 8,  price: 10 },
  oyster:       { name: 'Oyster',       source: 'market', value: 10, price: 13 },
  scallop:      { name: 'Scallop',      source: 'market', value: 11, price: 14 },
  shrimp:       { name: 'Shrimp',       source: 'market', value: 11, price: 14 },
  squid:        { name: 'Squid',        source: 'market', value: 12, price: 15 },
  octopus_leg:  { name: 'Octopus Leg',  source: 'market', value: 14, price: 18 },
  crab:         { name: 'Crab',         source: 'market', value: 18, price: 23 },
  salmon:       { name: 'Salmon',       source: 'market', value: 20, price: 26 },
  tuna:         { name: 'Tuna',         source: 'market', value: 22, price: 28 },
  lobster_tail: { name: 'Lobster Tail', source: 'market', value: 26, price: 34 },
};

/** Sprite id in the `ingredients` atlas group — ids line up 1:1. */
export const ingSprite = (id) => id;

export const ingName = (id) => INGREDIENTS[id]?.name ?? id;

/**
 * The stall, in the order it is laid out: what came off the boats this morning
 * first, then the grown goods, then the refined ones at the back where the
 * markup lives.
 */
export const MARKET_SHELVES = [
  { id: 'catch', label: 'Off the boats',
    ids: Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].source === 'market') },
  { id: 'grown', label: 'Grown and pressed',
    ids: Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].source === 'factory') },
  { id: 'refined', label: 'Refined — dear, unless you make it',
    ids: Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].source === 'refine') },
];

export const MARKET_ORDER = MARKET_SHELVES.flatMap((s) => s.ids);

/** Small free delivery each morning so a bad day is never a dead end. */
export const DAILY_DELIVERY = { kelp: 4, milk: 3, potato: 2 };
