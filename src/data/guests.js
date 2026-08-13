// Who walks through the door: how rare they are, and what they like to eat.

import { INGREDIENTS } from './ingredients.js';
import { RECIPE_BY_ID } from './recipes.js';

/* ---------------------------------------------------------------- rarity  */

/**
 * Three tiers. `weight` is the raw draw chance before reputation nudges it —
 * a well-reviewed harbour pulls in the rare ones. Nothing about a tier is
 * cosmetic-only: the pay, the patience and the odds of a gift all move with it,
 * so spotting a mythical guest in the queue genuinely matters.
 */
export const RARITIES = [
  { id: 'common', label: 'Regular', weight: 100, pay: 1, patience: 1, hearts: 1, gift: 0.04,
    aura: null, mark: null, cast: null },
  // the grandees each tier draws from — a rare guest is a different animal, not
  // a recoloured one, so the crown is confirming what you can already see
  { id: 'vip', label: 'VIP', weight: 13, pay: 2.1, patience: 0.85, hearts: 2, gift: 0.3,
    aura: '#f8d167', mark: 'crown',
    cast: ['23_royal_whale_shark', '24_pearl_manta_ray', '25_golden_seahorse',
      '26_giant_clam', '27_celebrity_narwhal', '28_aristocratic_octopus'] },
  { id: 'mythical', label: 'Mythical', weight: 2.5, pay: 4.2, patience: 0.7, hearts: 4, gift: 0.75,
    aura: '#c9a2f5', mark: 'star',
    cast: ['29_dunkleosteus', '30_coelacanth', '31_helicoprion', '32_xiphactinus'] },
];

export const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

/**
 * Pick a tier. Reputation and the promotion you have running both tilt the draw
 * toward the rare end; the common tier never changes weight, so the shift is
 * always an addition rather than a reshuffle.
 */
export function rollRarity(pull = 0, rnd = Math.random) {
  const weights = RARITIES.map((r) => (r.id === 'common' ? r.weight : r.weight * (1 + pull)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rnd() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return RARITIES[i];
  }
  return RARITIES[0];
}

/* ----------------------------------------------------------------- taste  */

/** Every dish reads as one of four flavours, worked out from what goes in it. */
/* Four flavours, four colours — they are told apart at a glance in the diary
   and on a taste chip, so they get real hue between them. */
export const TASTES = {
  savoury: { label: 'Savoury', color: '#c9884f' },
  sweet: { label: 'Sweet', color: '#e79ab4' },
  fresh: { label: 'Fresh', color: '#7fb98a' },
  rich: { label: 'Rich', color: '#d8b45c' },
};

const ING_TASTE = {
  rice: 'savoury', onion: 'savoury', potato: 'savoury', nori: 'savoury',
  clam: 'savoury', oyster: 'savoury', scallop: 'savoury', shrimp: 'savoury',
  squid: 'savoury', octopus_leg: 'savoury', crab: 'savoury', salmon: 'savoury',
  tuna: 'savoury', lobster_tail: 'savoury',
  blueberry: 'sweet', pineapple: 'sweet', strawberry: 'sweet', coconut: 'sweet',
  lime: 'fresh', kelp: 'fresh', sea_grapes: 'fresh', tomato: 'fresh',
  cabbage: 'fresh', carrot: 'fresh', lemon: 'fresh',
  egg: 'rich', milk: 'rich', flour: 'rich', butter: 'rich', cheese: 'rich',
};

/**
 * How loudly each flavour speaks. Counting ingredients raw makes almost
 * everything "rich", because flour, milk and butter are the staples that go in
 * two at a time while the berry that actually defines the dish goes in one at a
 * time. Weighting by how distinctive an ingredient is fixes that, and it keeps
 * the four tastes roughly evenly spread across the menu — which matters,
 * because a guest who loves a flavour nothing on the menu has is just a guest
 * you can never please.
 */
const TASTE_WEIGHT = { sweet: 2.6, fresh: 2, savoury: 1.2, rich: 0.8 };

/** The flavour a dish leads with. */
export function tasteOf(recipeId) {
  const rec = RECIPE_BY_ID[recipeId];
  if (!rec) return 'savoury';
  const tally = {};
  for (const [id, qty] of Object.entries(rec.ing)) {
    const t = ING_TASTE[id] ?? (INGREDIENTS[id]?.source === 'sea' ? 'savoury' : 'fresh');
    tally[t] = (tally[t] ?? 0) + qty * TASTE_WEIGHT[t];
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
}

/* ---------------------------------------------------------------- guests  */

/**
 * One entry per guest sprite. `loves` and `loathes` are the flavours their
 * diary page eventually reveals; until you have actually served them, the page
 * shows question marks, because the whole point is finding out.
 */
/**
 * Names.
 *
 * Every guest who walks in gets one, drawn from this by a hash of their id, so
 * the same creature is called the same thing every time you see it and the
 * diary can say "Pip the Sea Bunny" rather than "Sea Bunny #3". It costs one
 * array and turns a sprite into somebody.
 */
export const NAMES = [
  'Pip', 'Nori', 'Bramble', 'Coco', 'Willow', 'Marlow', 'Tilly', 'Otto',
  'Fen', 'Juniper', 'Baz', 'Clover', 'Rue', 'Sprout', 'Mabel', 'Hollis',
  'Perry', 'Wren', 'Nib', 'Pebble', 'Dill', 'Maren', 'Tock', 'Bly',
  'Saffy', 'Quill', 'Moss', 'Hazel', 'Bo', 'Winnow', 'Kit', 'Plum',
  'Iggy', 'Fig', 'Cass', 'Rilla', 'Onni', 'Vesper', 'Bud', 'Loka',
];

/**
 * The name a species goes by. Stable, so the Sea Bunny who came in on Monday is
 * the same Moss on Friday — a regular who is called something different every
 * visit is not a regular.
 */
export function nameFor(speciesId, n = 0) {
  let hash = n * 7 + 11;
  for (let i = 0; i < (speciesId ?? '').length; i++) {
    hash = (hash * 31 + speciesId.charCodeAt(i)) >>> 0;
  }
  return NAMES[hash % NAMES.length];
}

/** The one member of staff who was here before you. */
export const CHEF_NAME = 'Tako';

export const GUESTS = [
  { id: '01_sea_bunny_nudibranch', name: 'Sea Bunny', loves: 'sweet', loathes: 'savoury' },
  { id: '02_dumbo_octopus', name: 'Dumbo Octopus', loves: 'fresh', loathes: 'rich' },
  { id: '03_hermit_crab', name: 'Hermit Crab', loves: 'savoury', loathes: 'sweet' },
  { id: '04_pufferfish', name: 'Pufferfish', loves: 'rich', loathes: 'fresh' },
  { id: '05_sea_otter', name: 'Sea Otter', loves: 'savoury', loathes: 'sweet' },
  { id: '06_manta_ray', name: 'Manta Ray', loves: 'fresh', loathes: 'savoury' },
  { id: '07_whale_shark', name: 'Whale Shark', loves: 'savoury', loathes: 'sweet' },
  { id: '08_moon_jellyfish', name: 'Moon Jellyfish', loves: 'sweet', loathes: 'savoury' },
  { id: '09_seahorse', name: 'Seahorse', loves: 'fresh', loathes: 'rich' },
  { id: '10_horseshoe_crab', name: 'Horseshoe Crab', loves: 'rich', loathes: 'fresh' },
  { id: '11_lobster', name: 'Lobster', loves: 'rich', loathes: 'sweet' },
  { id: '12_blobfish', name: 'Blobfish', loves: 'sweet', loathes: 'fresh' },
  { id: '13_green_sea_turtle', name: 'Sea Turtle', loves: 'fresh', loathes: 'rich' },
  { id: '14_anglerfish', name: 'Anglerfish', loves: 'savoury', loathes: 'fresh' },
  { id: '15_cleaner_shrimp', name: 'Cleaner Shrimp', loves: 'fresh', loathes: 'savoury' },
  { id: '16_tuna', name: 'Tuna', loves: 'savoury', loathes: 'rich' },
  { id: '17_clownfish', name: 'Clownfish', loves: 'sweet', loathes: 'savoury' },
  { id: '18_angelfish', name: 'Angelfish', loves: 'rich', loathes: 'savoury' },

  // four more regulars off the pack-01 grid
  { id: '19_dolphin', name: 'Harbour Dolphin', loves: 'fresh', loathes: 'rich' },
  { id: '20_whale', name: 'Great Whale', loves: 'rich', loathes: 'fresh' },
  { id: '21_manatee', name: 'Manatee Elder', loves: 'savoury', loathes: 'sweet' },
  { id: '22_walrus', name: 'Walrus Captain', loves: 'sweet', loathes: 'savoury' },

  // The VIPs. Six of them, each with their own animation, and each fussy: a
  // guest who pays double is worth planning a menu around.
  { id: '23_royal_whale_shark', name: 'Royal Whale Shark', loves: 'savoury', loathes: 'sweet', tier: 'vip' },
  { id: '24_pearl_manta_ray', name: 'Pearl Manta Ray', loves: 'fresh', loathes: 'rich', tier: 'vip' },
  { id: '25_golden_seahorse', name: 'Golden Seahorse', loves: 'sweet', loathes: 'savoury', tier: 'vip' },
  { id: '26_giant_clam', name: 'Giant Clam', loves: 'rich', loathes: 'fresh', tier: 'vip' },
  { id: '27_celebrity_narwhal', name: 'Celebrity Narwhal', loves: 'sweet', loathes: 'fresh', tier: 'vip' },
  { id: '28_aristocratic_octopus', name: 'Aristocratic Octopus', loves: 'rich', loathes: 'savoury', tier: 'vip' },

  // The mythicals: fish out of deep time, and the best customers in the harbour.
  { id: '29_dunkleosteus', name: 'Dunkleosteus', loves: 'savoury', loathes: 'sweet', tier: 'mythical' },
  { id: '30_coelacanth', name: 'Coelacanth', loves: 'fresh', loathes: 'sweet', tier: 'mythical' },
  { id: '31_helicoprion', name: 'Helicoprion', loves: 'savoury', loathes: 'rich', tier: 'mythical' },
  { id: '32_xiphactinus', name: 'Xiphactinus', loves: 'rich', loathes: 'fresh', tier: 'mythical' },
];

/** Species that only ever appear at their own tier. */
export const GRANDEES = new Set(GUESTS.filter((g) => g.tier).map((g) => g.id));

/** The everyday cast — anyone without a tier of their own. */
export const COMMON_CAST = GUESTS.filter((g) => !g.tier).map((g) => g.id);

export const GUEST_BY_ID = Object.fromEntries(GUESTS.map((g) => [g.id, g]));

/* -------------------------------------------------------------- friendship */

/** Hearts needed for each friendship level. Level 1 is "we have met". */
export const HEART_STEPS = [0, 6, 16, 34, 60];
export const MAX_FRIEND = HEART_STEPS.length;

export const levelForHearts = (hearts) => {
  let lv = 1;
  for (let i = 1; i < HEART_STEPS.length; i++) if (hearts >= HEART_STEPS[i]) lv = i + 1;
  return lv;
};

/** Hearts still to go before the next level, or null once they max out. */
export const heartsToNext = (hearts) => {
  const next = HEART_STEPS.find((h) => h > hearts);
  return next === undefined ? null : next - hearts;
};

/**
 * What a guest leaves behind when the friendship ticks over. Later levels are
 * worth the wait — the last one is a research breakthrough, which is otherwise
 * slow to come by.
 */
export const GIFTS = [
  null,
  { kind: 'coins', amount: 120, label: 'a pouch of sand dollars' },
  { kind: 'clay', amount: 3, label: 'three lumps of river clay' },
  { kind: 'research', amount: 8, label: 'a page of notes' },
  { kind: 'coins', amount: 900, label: 'a pearl worth a fortune' },
];
