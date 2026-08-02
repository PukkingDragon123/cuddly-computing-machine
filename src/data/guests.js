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
    aura: null, mark: null },
  { id: 'vip', label: 'VIP', weight: 13, pay: 2.1, patience: 0.85, hearts: 2, gift: 0.3,
    aura: '#f8d167', mark: 'crown' },
  { id: 'mythical', label: 'Mythical', weight: 2.5, pay: 4.2, patience: 0.7, hearts: 4, gift: 0.75,
    aura: '#c9a2f5', mark: 'star' },
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
];

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
