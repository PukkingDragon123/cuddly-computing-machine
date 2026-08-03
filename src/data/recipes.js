// The menu. Recipe ids match sprites in the `food` atlas group.
//
// Every recipe can be levelled up three times by spending sand dollars plus more
// of its signature ingredient: each level raises the price, trims the prep time
// and adds a reputation star.

export const MAX_LEVEL = 3;

const R = (id, name, ing, price, prep, stars, unlock) =>
  ({ id, name, ing, price, prep, stars, unlock });

export const RECIPES = [
  // --- on the menu from day one -----------------------------------------
  R('kelp_ramen',     'Kelp Ramen',      { kelp: 2, egg: 1 },                            22, 3.4, 1, 0),
  R('scallop_tart',   'Scallop Tart',    { scallop: 1, flour: 1, butter: 1 },            27, 3.8, 1, 0),
  R('kelp_latte',     'Kelp Latte',      { milk: 2, kelp: 1 },                           16, 2.4, 1, 0),

  // --- unlockable --------------------------------------------------------
  R('kelp_fries',     'Kelp Fries',      { potato: 2, kelp: 1 },                         19, 2.8, 1, 180),
  R('reef_soda',      'Reef Soda',       { lime: 2, blueberry: 1 },                      20, 2.4, 1, 200),
  R('starfish_cookie','Starfish Cookie', { flour: 2, butter: 1, strawberry: 1 },          21, 2.9, 1, 210),
  R('taiyaki',        'Harbor Taiyaki',  { flour: 2, milk: 1, blueberry: 1 },             23, 3.0, 1, 240),
  R('miso_chowder',   'Miso Chowder',    { clam: 2, milk: 1, onion: 1 },                  31, 3.9, 1, 260),
  R('pearl_boba',     'Pearl Boba',      { milk: 2, rice: 1, strawberry: 1 },             25, 3.0, 1, 280),
  R('anchor_pretzel', 'Anchor Pretzel',  { flour: 2, butter: 1, cheese: 1 },              28, 3.1, 1, 300),
  R('shrimp_toast',   'Shrimp Toast',    { shrimp: 2, flour: 1, egg: 1 },                 34, 4.0, 2, 320),
  R('oyster_plate',   'Oyster Plate',    { oyster: 3, lemon: 1 },                         36, 3.5, 2, 340),
  R('mermaid_pop',    'Mermaid Pop',     { milk: 2, blueberry: 2, coconut: 1 },           32, 3.4, 2, 370),
  R('octopus_skewer', 'Octopus Skewer',  { octopus_leg: 2, onion: 1 },                    39, 4.1, 2, 400),
  R('tide_sundae',    'Tide Sundae',     { milk: 2, blueberry: 1, lime: 1, coconut: 1 },  41, 4.0, 2, 440),
  R('clam_congee',    'Clam Congee',     { clam: 2, rice: 2, onion: 1 },                  37, 4.0, 2, 460),
  R('cinnamon_swirls','Cinnamon Swirls', { flour: 3, butter: 2, egg: 1 },                 43, 4.4, 2, 490),
  R('coral_platter',  'Coral Platter',   { sea_grapes: 2, blueberry: 2, scallop: 1 },     47, 4.5, 2, 530),
  R('crab_burger',    'Crab Burger',     { crab: 1, flour: 2, cabbage: 1, cheese: 1 },    52, 5.0, 2, 600),
  R('puffer_burger',  'Puffer Burger',   { tuna: 1, flour: 2, tomato: 1, cheese: 1 },     55, 5.0, 2, 660),
  R('scallop_bowl',   'Scallop Bowl',    { scallop: 3, rice: 2, butter: 1 },              58, 5.2, 3, 720),
  R('sea_roll',       'Sunset Sea Roll', { salmon: 1, rice: 2, nori: 1, strawberry: 1 },  62, 5.2, 3, 800),
  R('lobster_roll',   'Lobster Roll',    { lobster_tail: 1, flour: 2, butter: 1, cabbage: 1 }, 74, 5.6, 3, 950),
  R('treasure_bento', 'Treasure Bento',  { salmon: 1, tuna: 1, rice: 2, nori: 1, shrimp: 1 }, 108, 7.0, 4, 1500),

  // --- what the pens are for ---------------------------------------------
  R('ham_steamer',    'Ham Steamer',     { ham: 1, cabbage: 1, onion: 1 },                 68, 4.6, 3, 700),
  R('roe_nigiri',     'Roe Nigiri',      { roe: 1, rice: 2, nori: 1 },                     84, 4.8, 3, 1000),
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Ingredient the upgrade path leans on — the first one listed. */
export const signature = (recipe) => Object.keys(recipe.ing)[0];

export const priceAt = (recipe, level) => Math.round(recipe.price * 1.45 ** (level - 1));
export const prepAt = (recipe, level) => +(recipe.prep * 0.82 ** (level - 1)).toFixed(2);
export const starsAt = (recipe, level) => recipe.stars + (level - 1);

/** Cost of the next level: sand dollars plus signature ingredient. */
export function upgradeCost(recipe, level) {
  return {
    coins: Math.round(recipe.price * 9 * 1.7 ** (level - 1)),
    ing: { [signature(recipe)]: 3 + level * 2 },
  };
}
