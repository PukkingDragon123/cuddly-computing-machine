// Everything the pantry can hold.
//
// `source: 'factory'` items are grown/pressed for free by machines you build.
// `source: 'market'` items are the premium sea catch — you buy those with sand
// dollars, which is what keeps the currency worth earning.

export const INGREDIENTS = {
  // ---- factory grown / pressed ------------------------------------------
  rice:       { name: 'Rice',        source: 'factory', value: 3 },
  blueberry:  { name: 'Blueberry',   source: 'factory', value: 4 },
  lime:       { name: 'Lime',        source: 'factory', value: 4 },
  pineapple:  { name: 'Pineapple',   source: 'factory', value: 6 },
  onion:      { name: 'Onion',       source: 'factory', value: 3 },
  egg:        { name: 'Egg',         source: 'factory', value: 4 },
  milk:       { name: 'Milk',        source: 'factory', value: 5 },
  // ---- factory refined --------------------------------------------------
  flour:      { name: 'Flour',       source: 'refine',  value: 9 },
  butter:     { name: 'Butter',      source: 'refine',  value: 13 },
  cheese:     { name: 'Cheese',      source: 'refine',  value: 15 },

  // raised in a pen rather than grown or bought — see data/livestock.js
  ham:        { name: 'Ham',         source: 'pen',     value: 26 },
  roe:        { name: 'Roe',         source: 'pen',     value: 30 },
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

export const MARKET_ORDER = Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].source === 'market');

/** Small free delivery each morning so a bad day is never a dead end. */
export const DAILY_DELIVERY = { kelp: 4, potato: 3, clam: 2 };
