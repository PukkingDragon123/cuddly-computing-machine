// Buildable things — dining room furniture, factory machines, and staff.

/* ------------------------------------------------------------ furniture  */

/**
 * Three finishes. Each names the sprite group for loose furniture and the one
 * for built-in joinery (counters, doors, windows) — the fixture art only ships
 * two woods, so the cheaper finishes share the oak set.
 */
export const STYLES = [
  { id: 'plain',   label: 'Seaside Pine', furn: 'furn_plain',   fixt: 'fixt_oak',    costMul: 1,   star: 0, tip: 1.00 },
  { id: 'cottage', label: 'Cosy Cottage', furn: 'furn_cottage', fixt: 'fixt_oak',    costMul: 2.4, star: 1, tip: 1.28 },
  { id: 'antique', label: 'Antique',      furn: 'furn_antique', fixt: 'fixt_walnut', costMul: 5.5, star: 3, tip: 1.65 },
];

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

/** Sprite group a piece is drawn from, for a given finish. */
export const groupFor = (item, styleId) => {
  const st = STYLE_BY_ID[styleId] ?? STYLES[0];
  return item.set === 'fixt' ? st.fixt : st.furn;
};

/**
 * kind:
 *   table — guests eat here; seats come from adjacent chairs
 *   seat  — one guest each, must touch a table
 *   pass  — the kitchen counter; finished plates appear on it
 *   decor — pure ambience, adds passive stars
 *
 * `sprite` is either one id, or `{ l, r }` for the pieces that ship both
 * facings — those get turned to face their table automatically.
 * `hang` draws above the floor (ceiling and wall pieces); `flat` draws under
 * everything, with the floor.
 */
export const FURNITURE = [
  { id: 'game_table',  kind: 'table', set: 'furn', sprite: { l: 'game_table_l', r: 'game_table_r' },
    label: 'Games Table', cost: 130, star: 1, blurb: 'Square top — put a chair on any side.' },
  { id: 'round_table', kind: 'table', set: 'furn', sprite: { l: 'round_table_l', r: 'round_table_r' },
    label: 'Round Table', cost: 175, star: 2, tip: 1.1, blurb: 'Cosier, and guests tip a little more.' },

  { id: 'chair',    kind: 'seat', set: 'furn', sprite: { l: 'chair_l', r: 'chair_r' },
    label: 'Dining Chair', cost: 50, star: 1, blurb: 'Place beside a table to make a seat.' },
  { id: 'armchair', kind: 'seat', set: 'furn', sprite: { l: 'armchair_l', r: 'armchair_r' },
    label: 'Armchair', cost: 120, star: 2, patience: 1.3, blurb: 'Deep and soft — guests wait far longer.' },

  { id: 'pass_counter', kind: 'pass', set: 'fixt', sprite: 'pass_counter',
    label: 'Kitchen Pass', cost: 220, star: 2, blurb: 'Where the chef plates finished dishes.' },

  { id: 'host_desk', kind: 'decor', set: 'fixt', sprite: 'host_desk',
    label: 'Host Desk', cost: 210, star: 3, draw: 0.12, blurb: 'A welcome out front pulls guests in faster.' },
  { id: 'cabinet',   kind: 'decor', set: 'furn', sprite: { l: 'cabinet_l', r: 'cabinet_r' },
    label: 'Sideboard', cost: 95, star: 2, blurb: 'Handsome by a wall.' },
  { id: 'drawers',   kind: 'decor', set: 'furn', sprite: { l: 'drawers_l', r: 'drawers_r' },
    label: 'Chest of Drawers', cost: 90, star: 2, blurb: 'Tucks into a corner.' },
  { id: 'shelf',     kind: 'decor', set: 'furn', sprite: { l: 'shelf_l', r: 'shelf_r' },
    label: 'Basket Shelf', cost: 110, star: 2, order: 0.9, blurb: 'Keeps the kitchen stocked and quicker.' },
  { id: 'lamp',      kind: 'decor', set: 'furn', sprite: { l: 'lamp_l', r: 'lamp_r' }, hang: true,
    label: 'Pendant Lamp', cost: 115, star: 3, blurb: 'Warm light hanging overhead.' },
  { id: 'rug',       kind: 'decor', set: 'furn', sprite: 'rug', flat: true,
    label: 'Patterned Rug', cost: 80, star: 2, patienceRoom: 1.06, blurb: 'Guests settle in more patiently.' },
  { id: 'rug_rolled',kind: 'decor', set: 'furn', sprite: 'rug_rolled',
    label: 'Rolled Rug', cost: 45, star: 1, blurb: 'Spare, leaning by the wall.' },
  { id: 'books',     kind: 'decor', set: 'furn', sprite: 'books',
    label: 'Book Stack', cost: 55, star: 1, blurb: 'Something to read while they wait.' },
  { id: 'books_lean',kind: 'decor', set: 'furn', sprite: 'books_lean',
    label: 'Leaning Books', cost: 55, star: 1, blurb: 'A softer pile of the same.' },
  { id: 'ornament',  kind: 'decor', set: 'furn', sprite: 'ornament',
    label: 'Mascot', cost: 130, star: 3, tipRoom: 1.05, blurb: 'The regulars love it. Tips go up.' },
  { id: 'ornament_mat', kind: 'decor', set: 'furn', sprite: 'ornament_mat',
    label: 'Mascot on a Mat', cost: 145, star: 3, tipRoom: 1.05, blurb: 'Same charm, settled in.' },
  { id: 'mirror',    kind: 'decor', set: 'furn', sprite: 'mirror', hang: true,
    label: 'Framed Mirror', cost: 100, star: 2, blurb: 'Makes the room feel wider.' },
  { id: 'mirror_wide',kind: 'decor', set: 'furn', sprite: 'mirror_wide', hang: true,
    label: 'Cloud Mirror', cost: 105, star: 2, blurb: 'A soft shape on the wall.' },
  { id: 'key_rack',  kind: 'decor', set: 'fixt', sprite: 'key_rack', hang: true,
    label: 'Key Rack', cost: 60, star: 1, blurb: 'Small hooks by the door.' },
];

export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

/** Ids the save file may still carry from the first art pack. */
export const LEGACY_FURNITURE = {
  table_square: 'game_table', table_round: 'round_table',
  chair_a: 'chair', chair_b: 'chair', stool: 'chair', bench: 'armchair',
  counter: 'pass_counter', display_case: 'host_desk', plant: 'ornament',
  chalkboard: 'shelf', pendant_lamp: 'lamp', floor_lamp: 'cabinet',
  rug: 'rug', wall_clock: 'mirror', coral_sconce: 'key_rack',
  condiment_tray: 'books',
};
export const LEGACY_STYLES = { standard: 'plain', coral: 'cottage', whale: 'antique' };

export const costOf = (item, styleId) =>
  Math.round(item.cost * (STYLE_BY_ID[styleId]?.costMul ?? 1));

export const starsOf = (item, styleId) =>
  item.star + (STYLE_BY_ID[styleId]?.star ?? 0);

/* -------------------------------------------------------------- machines */

/**
 * kind:
 *   producer  — makes `out` from nothing every `interval` seconds
 *   processor — eats `inQty` of `inId` and emits `out`
 *   silo      — banks whatever arrives into the pantry
 *   belt      — moves items one tile per step
 */
export const MACHINES = [
  { id: 'rice_grinder',     kind: 'producer',  label: 'Rice Mill',        sprite: 'rice_grinder',     out: 'rice',      interval: 3.0, cost: 150 },
  { id: 'berry_tumbler',    kind: 'producer',  label: 'Berry Tumbler',    sprite: 'berry_tumbler',    out: 'blueberry', interval: 3.2, cost: 180 },
  { id: 'citrus_press',     kind: 'producer',  label: 'Citrus Press',     sprite: 'citrus_press',     out: 'lime',      interval: 3.2, cost: 180 },
  { id: 'onion_boiler',     kind: 'producer',  label: 'Onion Boiler',     sprite: 'onion_boiler',     out: 'onion',     interval: 2.8, cost: 160 },
  { id: 'egg_roller',       kind: 'producer',  label: 'Egg Roller',       sprite: 'egg_roller',       out: 'egg',       interval: 3.4, cost: 220 },
  { id: 'cream_churn',      kind: 'producer',  label: 'Cream Churn',      sprite: 'cream_churn',      out: 'milk',      interval: 3.6, cost: 260 },
  { id: 'pineapple_slicer', kind: 'producer',  label: 'Pineapple Slicer', sprite: 'pineapple_slicer', out: 'pineapple', interval: 4.4, cost: 340 },

  { id: 'ice_mill',         kind: 'processor', label: 'Grain Mill',   sprite: 'ice_mill',      inId: 'rice', inQty: 2, out: 'flour',  interval: 3.4, cost: 300 },
  { id: 'butter_roller',    kind: 'processor', label: 'Butter Roller',sprite: 'butter_roller', inId: 'milk', inQty: 2, out: 'butter', interval: 3.8, cost: 420 },
  { id: 'cheese_press',     kind: 'processor', label: 'Cheese Press', sprite: 'cheese_press',  inId: 'milk', inQty: 3, out: 'cheese', interval: 4.4, cost: 520 },
];

export const MACHINE_BY_ID = Object.fromEntries(MACHINES.map((m) => [m.id, m]));

export const BELT = { id: 'belt', kind: 'belt', label: 'Conveyor', cost: 16, blurb: 'Drag to draw a line of belts.' };
export const SILO = { id: 'silo', kind: 'silo', label: 'Pantry Intake', cost: 200,
  group: 'furn_plain', sprite: 'shelf_r', blurb: 'Anything delivered here lands in your pantry.' };

export const MACHINE_MAX_LEVEL = 5;
export const machineUpgradeCost = (m, level) => Math.round(m.cost * 0.8 * 1.75 ** level);
export const machineInterval = (m, level, factorySpeed = 1) =>
  (m.interval * 0.82 ** (level - 1)) / factorySpeed;

/* ----------------------------------------------------------------- staff */

/**
 * One-off hires that automate the fiddly parts. This is the idle curve: early
 * on you tap every seat and every plate, later the crew handles it.
 */
export const STAFF = [
  { id: 'oyster_host',    sprite: '01_oyster_host',    label: 'Oyster Host',
    cost: 900,  blurb: 'Seats waiting guests on their own, every few seconds.', effect: 'autoSeat' },
  { id: 'cuttlefish_server', sprite: '02_cuttlefish_server', label: 'Cuttlefish Server',
    cost: 1400, blurb: 'Runs finished plates out to tables for you.', effect: 'autoServe' },
  { id: 'moray_cook',     sprite: '05_moray_eel_noodle_cook', label: 'Noodle Cook',
    cost: 750,  blurb: '+1 dish cooking at the same time.', effect: 'cookSlot' },
  { id: 'walrus_cook',    sprite: '06_walrus_grill_cook', label: 'Grill Cook',
    cost: 1250, blurb: '+1 dish cooking at the same time.', effect: 'cookSlot' },
  { id: 'sea_lion_dish',  sprite: '03_sea_lion_dishwasher', label: 'Dishwasher',
    cost: 480,  blurb: 'Clears tables in a blink after guests leave.', effect: 'fastClean' },
  { id: 'hammerhead_mech',sprite: '07_hammerhead_mechanic', label: 'Mechanic',
    cost: 700,  blurb: 'Factory machines run 18% faster.', effect: 'factorySpeed', amount: 0.18 },
  { id: 'isopod_boiler',  sprite: '08_giant_isopod_boiler_operator', label: 'Boiler Operator',
    cost: 1100, blurb: 'Factory machines run another 18% faster.', effect: 'factorySpeed', amount: 0.18 },
  { id: 'swordfish_qa',   sprite: '09_swordfish_quality_inspector', label: 'Quality Inspector',
    cost: 1600, blurb: '+1 reputation star from every guest served.', effect: 'bonusStar' },
  { id: 'orca_manager',   sprite: '10_orca_harbor_manager', label: 'Harbor Manager',
    cost: 2200, blurb: 'Guests tip 15% more.', effect: 'tips', amount: 0.15 },
];

export const STAFF_BY_ID = Object.fromEntries(STAFF.map((s) => [s.id, s]));

/** The head chef is always on staff — someone has to cook on day one. */
export const CHEF_SPRITE = '04_octopus_head_chef';
