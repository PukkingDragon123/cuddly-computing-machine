// Buildable things — dining room furniture, factory machines, and staff.

/* ------------------------------------------------------------ furniture  */

/**
 * Three finishes. Each names the sprite group for loose furniture and the one
 * for built-in joinery (counters, doors, windows) — the fixture art only ships
 * two woods, so the cheaper finishes share the oak set.
 */
export const STYLES = [
  { id: 'plain',   label: 'Seaside Pine', furn: 'furn_plain',   fixt: 'fixt_oak',    costMul: 1,   star: 0, tip: 1.00 },
  { id: 'cottage', label: 'Cosy Cottage', furn: 'furn_cottage', fixt: 'fixt_oak',    costMul: 2.4, star: 1, tip: 1.28, rank: 1 },
  { id: 'antique', label: 'Antique',      furn: 'furn_antique', fixt: 'fixt_walnut', costMul: 5.5, star: 3, tip: 1.65, rank: 3 },
];

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

/**
 * Sprite group a piece is drawn from, for a given finish.
 *
 * The trinket set is drawn once, not three times over: a brass telescope is a
 * brass telescope whatever the chairs are made of. Those pieces sit in their own
 * group and ignore the finish entirely.
 */
export const groupFor = (item, styleId) => {
  if (item.set === 'deco') return 'deco';
  const st = STYLE_BY_ID[styleId] ?? STYLES[0];
  return item.set === 'fixt' ? st.fixt : st.furn;
};

/* ------------------------------------------------------------------ mounts */

/**
 * Where a piece goes.
 *
 *   floor   — stands on a tile of its own and blocks the way (the default)
 *   ceiling — hangs overhead. Lights and hanging plants only, and they take no
 *             floor: a pendant lamp above a table is the whole point of one.
 *   wall    — hung on one of the two back walls, so `c === 0` or `r === 0`
 *   top     — a small thing that sits *on* another piece: a table, a sideboard,
 *             a shelf, the counter. It needs a host and it never blocks the way
 *
 * Only `floor` takes a tile out of the room. That is the fix for the old rule,
 * where hanging a lamp somewhere meant nobody could ever walk under it.
 */
export const MOUNTS = ['floor', 'ceiling', 'wall', 'top'];
export const mountOf = (item) => item?.mount ?? 'floor';
export const isSolid = (item) => mountOf(item) === 'floor';

/**
 * Pieces a trinket can be set down on.
 *
 * `surface` is not a flag but a height: how far up its own drawing the top face
 * sits, as a fraction. A sideboard's top is near the top of the picture; a
 * counter's is halfway down one, because the art carries the shelving above it.
 * That number is what puts a candlestick *on* the table rather than through it.
 */
export const isSurface = (item) => !!item?.surface;
export const surfaceOf = (item) => (typeof item?.surface === 'number' ? item.surface : 0.62);

/**
 * The catalogue's shelves, in the order they are tabbed across the top. Kept
 * here rather than in the panel so a new piece only ever names its shelf once.
 */
export const SHELVES = [
  { id: 'seating', label: 'Seating', note: 'A table, then chairs beside it. Every chair seats one.' },
  { id: 'kitchen', label: 'Kitchen', note: 'The working side of the room. You need a pass before you can open.' },
  { id: 'decor', label: 'Decor', note: 'Standing pieces. Every one adds ambience, and ambience is your rating.' },
  { id: 'trinket', label: 'Trinkets', note: 'Small things that sit on a table, a shelf or the counter.' },
  { id: 'plants', label: 'Plants', note: 'Greenery, in a pot. Some for a table, some for a corner of the floor.' },
  { id: 'light', label: 'Lights & Walls', note: 'Hung overhead or on a back wall. They take no floor at all.' },
];

/* ---------------------------------------------------------- the deco set */

/**
 * Forty pieces off one sheet, drawn front and back like the furniture.
 *
 * Most of them are small enough to belong on a table rather than in the middle
 * of the floor, which is what `top` is for — the room was short of the thing a
 * cafe is actually made of, which is the clutter people put on surfaces. The
 * few that are furniture-sized (a palm, a sea chest, a telescope) stand on the
 * floor like anything else, and the two that hang do so from the ceiling.
 *
 * `D` keeps the table readable: everything shares a set and a pair of drawings
 * named after the piece, so only what differs is written out.
 */
const D = (id, label, cost, star, opts = {}) => ({
  id, label, cost, star,
  kind: 'decor', set: 'deco',
  sprite: { f: `${id}_f`, b: `${id}_b` },
  mount: 'top', shelf: 'trinket',
  ...opts,
});

const FLOOR = { mount: 'floor', shelf: 'decor' };
const POT = { shelf: 'plants' };
const POT_FLOOR = { mount: 'floor', shelf: 'plants' };
const HANG = { mount: 'ceiling', shelf: 'light' };
const WALL = { mount: 'wall', shelf: 'light' };

export const DECOR_SET = [
  // --- things off the harbour, for a shelf
  D('seahorse', 'Seahorse Figure', 70, 2, { blurb: 'Carved, and slightly smug.' }),
  D('crab', 'Red Crab Mount', 75, 2, { blurb: 'Claws up, permanently.' }),
  D('jelly_dome', 'Jellyfish Dome', 130, 3, { blurb: 'Under glass, and still drifting.', rank: 1 }),
  D('turtle', 'Turtle Mount', 85, 2, { blurb: 'In no hurry whatsoever.' }),
  D('lighthouse', 'Model Lighthouse', 120, 3, { blurb: 'Every harbour needs one.', rank: 1 }),
  D('model_boat', 'Model Skiff', 95, 2, { blurb: 'Sails set, going nowhere.' }),
  D('bottle_ship', 'Ship in a Bottle', 140, 3, { blurb: 'Somebody had a very long winter.', rank: 1 }),
  D('ships_wheel', "Ship's Wheel", 150, 3, { ...FLOOR, blurb: 'Salvage, mounted and polished.', rank: 1 }),
  D('reed_vase', 'Reed Vase', 60, 1, { ...POT, blurb: 'Dry reeds in a chipped jar.' }),
  D('bonsai', 'Bonsai', 110, 2, { ...POT, blurb: 'Clipped within an inch of its life.' }),
  D('cactus', 'Little Cactus', 55, 1, { ...POT, blurb: 'Survives being forgotten.' }),
  D('wave_vase', 'Wave Vase', 65, 1, { ...POT, blurb: 'Glazed with a rolling sea.' }),
  D('lantern', 'Brass Lantern', 80, 2, { blurb: 'Warm light on the table.' }),
  D('candles', 'Candle Tray', 75, 2, { patienceRoom: 1.04, blurb: 'Candlelight. People linger.' }),
  D('seascape', 'Framed Seascape', 100, 2, { blurb: 'The view, on a day it was calm.' }),
  D('vanity_mirror', 'Table Mirror', 95, 2, { blurb: 'Everyone checks it. Everyone denies it.' }),
  D('globe', 'Brass Globe', 125, 2, { blurb: 'Spun by every guest who passes.', rank: 1 }),
  D('mantel_clock', 'Mantel Clock', 115, 2, { blurb: 'Runs four minutes fast. Always has.' }),
  D('pearl_shell', 'Pearl Shell', 130, 3, { blurb: 'One pearl, kept where it can be seen.', rank: 1 }),
  D('shell_basin', 'Shell Fountain', 145, 3, { patienceRoom: 1.06, blurb: 'Running water. Nobody minds waiting.', rank: 2 }),
  D('fish_bowl', 'Coral Bowl', 150, 3, { blurb: 'A reef the size of a dinner plate.', rank: 2 }),
  D('coral_bowl', 'Coral Planter', 85, 2, { ...POT, blurb: 'Orange coral in a starfish pot.' }),
  D('coral_fan', 'Coral Fan', 100, 2, { ...POT, blurb: 'Pink and enormous and delicate.' }),
  D('snake_plant', 'Snake Plant', 70, 1, { ...POT, blurb: 'Unkillable, which is the appeal.' }),
  D('blossom', 'Flowering Pot', 90, 2, { ...POT, blurb: 'Pink flowers, replaced weekly.' }),

  // --- trophies. Big, silly, and the regulars love them
  D('dolphin', 'Dolphin Trophy', 160, 3, { tipRoom: 1.04, blurb: 'On a plinth, mid-leap.', rank: 2 }),
  D('whale', 'Whale Trophy', 175, 3, { tipRoom: 1.04, blurb: 'Considerably smaller than the real thing.', rank: 2 }),
  D('seal', 'Seal Trophy', 150, 3, { tipRoom: 1.04, blurb: 'Sat there looking pleased.', rank: 2 }),
  D('walrus', 'Walrus Trophy', 165, 3, { tipRoom: 1.04, blurb: 'Scarf and all.', rank: 2 }),

  // --- floor pieces
  D('monstera', 'Monstera', 120, 2, { ...POT_FLOOR, blurb: 'Big leaves, big corner.' }),
  D('palm', 'Potted Palm', 135, 2, { ...POT_FLOOR, blurb: 'Instant holiday.' }),
  D('chest', 'Sea Chest', 180, 3, { ...FLOOR, blurb: 'Locked. Nobody has the key.', rank: 1 }),
  D('telescope', 'Brass Telescope', 220, 3, { ...FLOOR, draw: 0.06, blurb: 'Pointed at the harbour mouth. Draws people in.', rank: 2 }),
  D('gramophone', 'Gramophone', 200, 3, { ...FLOOR, tipRoom: 1.05, blurb: 'Music in the room. Tips go up.', rank: 2 }),
  D('anchor', 'Anchor Mount', 110, 2, { ...FLOOR, blurb: 'Heavier than it looks.' }),
  D('cushions', 'Cushion Stack', 95, 2, { ...FLOOR, patienceRoom: 1.05, blurb: 'Somewhere soft to wait.' }),
  D('stone_fish', 'Stone Fish', 105, 2, { ...FLOOR, blurb: 'Carved, on its own slate.' }),

  // --- overhead and on the wall
  D('bulb_lamp', 'Glass Bulb Light', 100, 2, { ...HANG, blurb: 'One warm bulb on a brass flex.' }),
  D('hanging_ivy', 'Hanging Ivy', 90, 2, { ...HANG, blurb: 'Trails down over the tables.' }),
  D('shell_wreath', 'Shell Wreath', 85, 2, { ...WALL, blurb: 'Made from a summer of beachcombing.' }),
];

/**
 * kind:
 *   table — guests eat here; seats come from adjacent chairs
 *   seat  — one guest each, must touch a table
 *   pass  — the kitchen counter; finished plates appear on it
 *   decor — pure ambience, adds passive stars
 *
 * `sprite` is either one id, or `{ f, b }` — the front and back views of a
 * piece, which with a mirror give all four turns (see world/orient.js). Chairs
 * turn to face their table on their own; everything else takes the Rotate
 * button. `flat` draws under everything, with the floor. `shelf` names the
 * catalogue page it is sold on.
 */
export const FURNITURE = [
  /* ------------------------------------------------------------- seating */
  { id: 'game_table',  kind: 'table', set: 'furn', shelf: 'seating', surface: 0.58,
    sprite: { f: 'game_table_f', b: 'game_table_b' },
    label: 'Games Table', cost: 130, star: 1, blurb: 'Square top — put a chair on any side.' },
  { id: 'round_table', kind: 'table', set: 'furn', shelf: 'seating', surface: 0.62,
    sprite: { f: 'round_table_f', b: 'round_table_b' },
    label: 'Round Table', cost: 175, star: 2, tip: 1.1, blurb: 'Cosier, and guests tip a little more.' },

  { id: 'chair',    kind: 'seat', set: 'furn', shelf: 'seating', sprite: { f: 'chair_f', b: 'chair_b' },
    label: 'Dining Chair', cost: 50, star: 1, blurb: 'Place it beside a table — it turns to face it.' },
  { id: 'armchair', kind: 'seat', set: 'furn', shelf: 'seating', sprite: { f: 'armchair_f', b: 'armchair_b' },
    label: 'Armchair', cost: 120, star: 2, patience: 1.3, blurb: 'Deep and soft — guests wait far longer.', rank: 1 },

  /* ------------------------------------------------------------- kitchen */
  // `tall` marks the two pieces that draw three tiles high. Anyone standing on
  // the tiles up-screen of them is sliced in half by the artwork, so the room
  // keeps those tiles as staff side — see Restaurant#behind.
  { id: 'pass_counter', kind: 'pass', set: 'fixt', shelf: 'kitchen', sprite: 'pass_counter',
    tall: true, surface: 0.36,
    label: 'Kitchen Pass', cost: 220, star: 2, blurb: 'Where the chef plates finished dishes.' },
  { id: 'host_desk', kind: 'decor', set: 'fixt', shelf: 'kitchen', sprite: 'host_desk',
    tall: true, surface: 0.34,
    label: 'Host Desk', cost: 210, star: 3, draw: 0.12, blurb: 'A welcome out front pulls guests in faster.', rank: 2 },
  { id: 'shelf',     kind: 'decor', set: 'furn', shelf: 'kitchen', surface: 0.66,
    sprite: { f: 'shelf_f', b: 'shelf_b' },
    label: 'Basket Shelf', cost: 110, star: 2, order: 0.9, blurb: 'Keeps the kitchen stocked and quicker.', rank: 2 },

  /* --------------------------------------------------------------- decor */
  { id: 'cabinet',   kind: 'decor', set: 'furn', shelf: 'decor', surface: 0.72,
    sprite: { f: 'cabinet_f', b: 'cabinet_b' },
    label: 'Sideboard', cost: 95, star: 2, blurb: 'Handsome by a wall.', rank: 1 },
  { id: 'drawers',   kind: 'decor', set: 'furn', shelf: 'decor', surface: 0.8,
    sprite: { f: 'drawers_f', b: 'drawers_b' },
    label: 'Chest of Drawers', cost: 90, star: 2, blurb: 'Tucks into a corner.', rank: 1 },
  { id: 'rug',       kind: 'decor', set: 'furn', shelf: 'decor', sprite: 'rug', flat: true, mount: 'floor',
    label: 'Patterned Rug', cost: 80, star: 2, patienceRoom: 1.06, blurb: 'Guests settle in more patiently.', rank: 1 },
  { id: 'books',     kind: 'decor', set: 'furn', shelf: 'decor', sprite: 'books',
    label: 'Book Stack', cost: 55, star: 1, blurb: 'Something to read while they wait.' },
  { id: 'books_lean',kind: 'decor', set: 'furn', shelf: 'decor', sprite: 'books_lean',
    label: 'Leaning Books', cost: 55, star: 1, blurb: 'A softer pile of the same.' },
  { id: 'ornament',  kind: 'decor', set: 'furn', shelf: 'decor', sprite: 'ornament',
    label: 'Mascot', cost: 130, star: 3, tipRoom: 1.05, blurb: 'The regulars love it. Tips go up.', rank: 2 },
  { id: 'ornament_mat', kind: 'decor', set: 'furn', shelf: 'decor', sprite: 'ornament_mat',
    label: 'Mascot on a Mat', cost: 145, star: 3, tipRoom: 1.05, blurb: 'Same charm, settled in.', rank: 2 },

  /* ------------------------------------------------------- lights & walls */
  { id: 'lamp',      kind: 'decor', set: 'furn', shelf: 'light', sprite: { f: 'lamp_f', b: 'lamp_b' },
    mount: 'ceiling',
    label: 'Pendant Lamp', cost: 115, star: 3, blurb: 'Warm light hanging overhead. Hang it above a table.', rank: 1 },
  { id: 'mirror',    kind: 'decor', set: 'furn', shelf: 'light', sprite: 'mirror', mount: 'wall',
    label: 'Framed Mirror', cost: 100, star: 2, blurb: 'Makes the room feel wider.', rank: 1 },
  { id: 'mirror_wide',kind: 'decor', set: 'furn', shelf: 'light', sprite: 'mirror_wide', mount: 'wall',
    label: 'Cloud Mirror', cost: 105, star: 2, blurb: 'A soft shape on the wall.', rank: 2 },
  { id: 'key_rack',  kind: 'decor', set: 'fixt', shelf: 'light', sprite: 'key_rack', mount: 'wall',
    label: 'Key Rack', cost: 60, star: 1, blurb: 'Small hooks by the door.' },

  ...DECOR_SET,
];

export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

/**
 * Ids the save file may still carry from the first art pack, or from a piece
 * since taken off the shelf. `rug_rolled` was a rug leaning against the wall
 * still rolled up, which is a thing you have not unpacked rather than a thing
 * you have decorated with — anybody who bought one gets the rug itself.
 */
export const LEGACY_FURNITURE = {
  table_square: 'game_table', table_round: 'round_table',
  chair_a: 'chair', chair_b: 'chair', stool: 'chair', bench: 'armchair',
  counter: 'pass_counter', display_case: 'host_desk', plant: 'ornament',
  chalkboard: 'shelf', pendant_lamp: 'lamp', floor_lamp: 'cabinet',
  rug: 'rug', wall_clock: 'mirror', coral_sconce: 'key_rack',
  condiment_tray: 'books', rug_rolled: 'rug',
};
export const LEGACY_STYLES = { standard: 'plain', coral: 'cottage', whale: 'antique' };

/** The finish only prices the wood. The deco set is drawn once, so it is one
 *  price whichever finish the room happens to be in. */
export const costOf = (item, styleId) => (item.set === 'deco'
  ? item.cost
  : Math.round(item.cost * (STYLE_BY_ID[styleId]?.costMul ?? 1)));

export const starsOf = (item, styleId) => (item.set === 'deco'
  ? item.star
  : item.star + (STYLE_BY_ID[styleId]?.star ?? 0));

/* -------------------------------------------------------------- machines */

/**
 * kind:
 *   producer  — makes `out` from nothing every `interval` seconds
 *   processor — eats `inQty` of `inId` and emits `out`
 *   silo      — banks whatever arrives into the pantry
 *   belt      — moves items one tile per step
 */
export const MACHINES = [
  { id: 'rice_grinder',     kind: 'producer',  label: 'Rice Mill',        sprite: 'rice_grinder',     out: 'rice',      interval: 3.0, cost: 150, rank: 2 },
  { id: 'berry_tumbler',    kind: 'producer',  label: 'Berry Tumbler',    sprite: 'berry_tumbler',    out: 'blueberry', interval: 3.2, cost: 180, rank: 2 },
  { id: 'citrus_press',     kind: 'producer',  label: 'Citrus Press',     sprite: 'citrus_press',     out: 'lime',      interval: 3.2, cost: 180, rank: 2 },
  { id: 'onion_boiler',     kind: 'producer',  label: 'Onion Boiler',     sprite: 'onion_boiler',     out: 'onion',     interval: 2.8, cost: 160, rank: 2 },
  { id: 'egg_roller',       kind: 'producer',  label: 'Egg Roller',       sprite: 'egg_roller',       out: 'egg',       interval: 3.4, cost: 220, rank: 2 },
  { id: 'cream_churn',      kind: 'producer',  label: 'Cream Churn',      sprite: 'cream_churn',      out: 'milk',      interval: 3.6, cost: 260, rank: 2 },
  { id: 'pineapple_slicer', kind: 'producer',  label: 'Pineapple Slicer', sprite: 'pineapple_slicer', out: 'pineapple', interval: 4.4, cost: 340, rank: 2 },

  { id: 'ice_mill',         kind: 'processor', label: 'Grain Mill',   sprite: 'ice_mill',      inId: 'rice', inQty: 2, out: 'flour',  interval: 3.4, cost: 300, rank: 2 },
  { id: 'butter_roller',    kind: 'processor', label: 'Butter Roller',sprite: 'butter_roller', inId: 'milk', inQty: 2, out: 'butter', interval: 3.8, cost: 420, rank: 2 },
  { id: 'cheese_press',     kind: 'processor', label: 'Cheese Press', sprite: 'cheese_press',  inId: 'milk', inQty: 3, out: 'cheese', interval: 4.4, cost: 520, rank: 3 },
];

/**
 * Machines that make something other than food. None of them takes a belt: they
 * sit wherever there is floor and quietly convert time into progress.
 *
 *   promo — pastes posters
 *   lab   — banks research points
 *   clay  — digs clay for the kiln
 *   kiln  — the pottery works. Tapping it opens the class, which is why the
 *           kiln is a building and not a menu: throwing a pot is a job that
 *           happens somewhere, and giving it a floor tile means the room grows
 *           into what you have unlocked instead of the sidebar doing it.
 *   wheel — a proper throwing wheel, which takes a round off the forge
 */
export const WORKSHOP = [
  { id: 'promo_stand', kind: 'promo', label: 'Promo Stand', sprite: 'plotter',
    cost: 800, interval: 22, blurb: 'Pastes a poster up by itself every so often, and makes room for one more.', rank: 3 },
  { id: 'harbour_computer', kind: 'lab', label: 'Harbour Computer', sprite: 'computer_desk',
    cost: 1200, interval: 14, out: 1,
    blurb: 'Turns quiet hours into research points to spend on the board.', rank: 3 },
  { id: 'mainframe', kind: 'lab', label: 'Harbour Mainframe', sprite: 'computer_tall',
    cost: 4200, interval: 6, out: 3,
    blurb: 'The big one. Three points at a time, and far faster about it.', rank: 5 },
  { id: 'broadcast', kind: 'promo', label: 'Broadcast Set', sprite: 'radio_set',
    cost: 2600, interval: 9,
    blurb: 'Puts the word out over the air — posters go up three times as often.', rank: 5 },
];

/** The pottery works: its own tab, because it is a trade of its own. */
export const POTTERY = [
  { id: 'kiln', kind: 'kiln', label: 'Harbour Kiln', sprite: 'bisque_kiln',
    cost: 900,
    blurb: 'The pottery class works out of here. Tap the kiln to throw a dish.', rank: 4 },
  { id: 'clay_press', kind: 'clay', label: 'Clay Press', sprite: 'clay_press',
    cost: 700, interval: 20, out: 1,
    blurb: 'Packs harbour silt into usable clay, one block at a time.', rank: 4 },
  { id: 'clay_works', kind: 'clay', label: 'Silt Works', sprite: 'glaze_mill',
    cost: 2400, interval: 8, out: 2,
    blurb: 'Two blocks at a time, and far quicker about it.', rank: 5 },
  { id: 'pot_wheel', kind: 'wheel', label: "Potter's Wheel", sprite: 'pot_wheel',
    cost: 1600,
    blurb: 'A properly balanced wheel: one round less at the kiln, every time.', rank: 4 },
  { id: 'glaze_kiln', kind: 'glaze', label: 'Glaze Kiln', sprite: 'glaze_kiln',
    cost: 3200,
    blurb: 'Fires a glaze over a finished dish — forged plates pay 15% more.', rank: 5 },
];

export const ALL_MACHINES = [...MACHINES, ...WORKSHOP, ...POTTERY];
export const MACHINE_BY_ID = Object.fromEntries(ALL_MACHINES.map((m) => [m.id, m]));

export const BELT = { id: 'belt', kind: 'belt', label: 'Conveyor', cost: 16, rank: 2, blurb: 'Drag to draw a line of belts.' };
export const SILO = { id: 'silo', kind: 'silo', label: 'Pantry Intake', cost: 200, rank: 2,
  group: 'furn_plain', sprite: 'shelf_b', blurb: 'Anything delivered here lands in your pantry.' };

export const MACHINE_MAX_LEVEL = 5;
export const machineUpgradeCost = (m, level) => Math.round(m.cost * 0.8 * 1.75 ** level);
export const machineInterval = (m, level, factorySpeed = 1) =>
  (m.interval * 0.82 ** (level - 1)) / factorySpeed;

/* ----------------------------------------------------------------- staff */

/**
 * One-off hires that automate the fiddly parts. This is the idle curve: early
 * on you tap every seat and every plate, later the crew handles it.
 *
 * `crew` is where they work, so the roster can be read the way a rota is —
 * front of house, the kitchen, the works, the office — rather than as one long
 * alphabetical list of strangers.
 */
export const CREW_ROOMS = [
  { id: 'floor',   label: 'Front of house' },
  { id: 'kitchen', label: 'The kitchen' },
  { id: 'works',   label: 'The works' },
  { id: 'office',  label: 'The office' },
];

export const STAFF = [
  { id: 'oyster_host',    sprite: '01_oyster_host', crew: 'floor', label: 'Oyster Host',
    cost: 900,  blurb: 'Seats waiting guests on their own, every few seconds.', effect: 'autoSeat', rank: 3 },
  { id: 'cuttlefish_server', sprite: '02_cuttlefish_server', crew: 'floor', label: 'Cuttlefish Server',
    cost: 1400, blurb: 'Runs finished plates out to tables for you.', effect: 'autoServe', rank: 3 },
  { id: 'moray_cook',     sprite: '05_moray_eel_noodle_cook', crew: 'kitchen', label: 'Noodle Cook',
    cost: 750,  blurb: '+1 dish cooking at the same time.', effect: 'cookSlot', rank: 1 },
  { id: 'walrus_cook',    sprite: '06_walrus_grill_cook', crew: 'kitchen', label: 'Grill Cook',
    cost: 1250, blurb: '+1 dish cooking at the same time.', effect: 'cookSlot', rank: 4 },
  { id: 'sea_lion_dish',  sprite: '03_sea_lion_dishwasher', crew: 'kitchen', label: 'Dishwasher',
    cost: 480,  blurb: 'Clears tables in a blink after guests leave.', effect: 'fastClean', rank: 1 },
  { id: 'hammerhead_mech',sprite: '07_hammerhead_mechanic', crew: 'works', label: 'Mechanic',
    cost: 700,  blurb: 'Factory machines run 18% faster.', effect: 'factorySpeed', amount: 0.18, rank: 2 },
  { id: 'isopod_boiler',  sprite: '08_giant_isopod_boiler_operator', crew: 'works', label: 'Boiler Operator',
    cost: 1100, blurb: 'Factory machines run another 18% faster.', effect: 'factorySpeed', amount: 0.18, rank: 4 },
  { id: 'swordfish_qa',   sprite: '09_swordfish_quality_inspector', crew: 'office', label: 'Quality Inspector',
    cost: 1600, blurb: '+1 reputation star from every guest served.', effect: 'bonusStar', rank: 6 },
  { id: 'orca_manager',   sprite: '10_orca_harbor_manager', crew: 'office', label: 'Harbor Manager',
    cost: 2200, blurb: 'Guests tip 15% more.', effect: 'tips', amount: 0.15, rank: 6 },
  { id: 'gull_courier',   sprite: '02_cuttlefish_server', crew: 'floor', label: 'Gull Courier',
    cost: 1300, blurb: 'Three fewer taps to call somebody in.', effect: 'flyer', rank: 2 },
];

export const STAFF_BY_ID = Object.fromEntries(STAFF.map((s) => [s.id, s]));

/** The head chef is always on staff — someone has to cook on day one. */
export const CHEF_SPRITE = '04_octopus_head_chef';
