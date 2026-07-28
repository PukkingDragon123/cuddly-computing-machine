// Buildable things — dining room furniture, factory machines, and staff.

/* ------------------------------------------------------------ furniture  */

/** Three finishes, sharing sprite ids across three atlas groups. */
export const STYLES = [
  { id: 'standard', label: 'Driftwood', group: 'furniture',        costMul: 1,   star: 0, tip: 1.00 },
  { id: 'coral',    label: 'Coral',     group: 'furniture_coral',  costMul: 2.6, star: 1, tip: 1.30 },
  { id: 'whale',    label: 'Whalebone', group: 'furniture_whale',  costMul: 6.0, star: 3, tip: 1.70 },
];

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

/**
 * kind:
 *   table — customers eat here; seats come from adjacent chairs
 *   seat  — one customer each, must touch a table
 *   pass  — the kitchen counter; finished plates appear on it
 *   decor — pure ambience, adds passive stars
 */
export const FURNITURE = [
  { id: 'table_square', kind: 'table', label: 'Square Table', cost: 120, star: 1, blurb: 'Seats up to 4 with chairs around it.' },
  { id: 'table_round',  kind: 'table', label: 'Round Table',  cost: 155, star: 2, blurb: 'Cosier — guests tip a little more.', tip: 1.1 },
  { id: 'chair_a',      kind: 'seat',  label: 'Chair',        cost: 45,  star: 0, blurb: 'Place beside a table to make a seat.' },
  { id: 'stool',        kind: 'seat',  label: 'Stool',        cost: 30,  star: 0, blurb: 'Cheap seat. Guests get restless faster.', patience: 0.85 },
  { id: 'bench',        kind: 'seat',  label: 'Bench',        cost: 70,  star: 1, blurb: 'Comfy seat — guests wait longer.', patience: 1.25 },
  { id: 'counter',      kind: 'pass',  label: 'Kitchen Pass', cost: 200, star: 1, blurb: 'Where the chef plates finished dishes.' },
  { id: 'display_case', kind: 'decor', label: 'Display Case', cost: 180, star: 3, blurb: 'Draws guests in faster.', draw: 0.12 },
  { id: 'plant',        kind: 'decor', label: 'Kelp Planter', cost: 60,  star: 2, blurb: 'A little greenery.' },
  { id: 'chalkboard',   kind: 'decor', label: 'Menu Board',   cost: 90,  star: 2, blurb: 'Dishes leave the kitchen a touch quicker.', order: 0.85 },
  { id: 'pendant_lamp', kind: 'decor', label: 'Shell Pendant',cost: 110, star: 3, blurb: 'Warm light overhead.' },
  { id: 'floor_lamp',   kind: 'decor', label: 'Pearl Lamp',   cost: 95,  star: 2, blurb: 'Soft glow in the corner.' },
  { id: 'rug',          kind: 'decor', label: 'Tide Rug',     cost: 75,  star: 2, blurb: 'Guests wait a bit more patiently.', patienceRoom: 1.06 },
  { id: 'wall_clock',   kind: 'decor', label: 'Shell Clock',  cost: 85,  star: 2, blurb: 'Keeps the kitchen on time.' },
  { id: 'coral_sconce', kind: 'decor', label: 'Coral Sconce', cost: 70,  star: 2, blurb: 'Pretty on any wall.' },
  { id: 'condiment_tray',kind:'decor', label: 'Condiments',   cost: 55,  star: 1, blurb: 'Small touch, happy guests.', tipRoom: 1.04 },
];

export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

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
export const SILO = { id: 'silo', kind: 'silo', label: 'Pantry Intake', cost: 200, sprite: 'display_case', blurb: 'Anything delivered here lands in your pantry.' };

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
