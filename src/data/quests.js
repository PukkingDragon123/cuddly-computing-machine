// The job list.
//
// One at a time on the HUD, all of them in the Jobs book. Every system in the
// game gets at least one — if a thing exists and nobody has ever told you to try
// it, it may as well not. They are ordered so that each one is either reachable
// now or the obvious next thing, and grouped into chapters so the book reads as
// a climb rather than a checklist.
//
// Every job pays coins *and* fame, because fame is the ladder and a job that
// only paid money would be a detour from it.

import { RANKS } from './fame.js';
import { FURNITURE_BY_ID } from './catalog.js';

const Q = (id, title, need, coins, fame, have, done, hint, art = null) =>
  ({ id, title, need, coins, fame, have, done, hint, art });

/** Reaching a rung is a job in its own right. */
const rung = (n, coins, done) => Q(
  `r${n}`, RANKS[n].name, RANKS[n].at, coins, 0,
  (g) => g.state.fame, done, RANKS[n].gives[0], { ico: 'star' },
);

export const CHAPTERS = [
  {
    id: 'first', name: 'The first shift', jobs: [
      Q('plate', 'Plate 3 lattes', 3, 60, 4,
        (g) => g.state.plannedCount,
        'One dish is not a menu, but it is a lovely start.', 'Kitchen → tap the + by the latte',
        { g: 'food', id: 'kelp_latte' }),
      Q('open', 'Open the doors', 1, 60, 4,
        (g) => (g.state.phase === 'open' ? 1 : 0),
        'Here they come! Deep breath.', 'Tap Arrange Menu, then Open Up!', { ico: 'book' }),
      Q('serve', 'Serve 3 guests', 3, 120, 8,
        (g) => g.state.stats.served,
        'Three happy people. Keep it up!', 'Sit them down, take the order, bring the food', { g: 'customers', id: '03_hermit_crab' }),
      Q('calm', 'Cheer up 2 guests', 2, 90, 6,
        (g) => g.state.stats.calmed ?? 0,
        'A kind word buys you a minute. Use it when the kitchen is behind.',
        'Tap somebody who is waiting to have a word', { ico: 'heart' }),
      Q('wash', 'Clear 3 tables', 3, 90, 6,
        (g) => g.state.stats.washed ?? 0,
        'Nobody wants to sit at a dirty table. Well spotted.', 'Tap a dirty plate left on a table', { g: 'plates', id: 'plate_a01' }),
      Q('day2', 'Get to Day 2', 2, 120, 10,
        (g) => g.state.day,
        "That is one whole day! Now do it again, a bit better.", 'Tap Close Up, then Next Day', { ico: 'refresh' }),
    ],
  },
  {
    id: 'shop', name: 'Buying and building', jobs: [
      Q('second', 'Know 2 recipes', 2, 140, 10,
        (g) => g.state.unlocked.length,
        'Two dishes! Now people get to choose.', 'Kitchen → the Learn page', { g: 'food', id: 'kelp_ramen' }),
      Q('market', 'Buy from the market', 1, 90, 5,
        (g) => g.state.stats.bought ?? 0,
        'Boats land all day and the prices keep moving. Keep an eye on them.', 'Inventory → the Harbor Market page', { ico: 'crate' }),
      Q('cheap', 'Buy 2 off the catch', 2, 140, 8,
        (g) => g.state.stats.cheap ?? 0,
        'Cheap crates are where the money hides. Well done.', "Market → the crates marked catch", { g: 'ingredients', id: 'scallop' }),
      Q('seats', 'Get to 4 seats', 4, 150, 10,
        (g) => g.restaurant.seatCount,
        'More chairs means more dinners. Simple as that.', 'Build → a table, then chairs around it', { g: 'furn_plain', id: 'chair_f' }),
      Q('decor', 'Put up 3 bits of decor', 3, 160, 12,
        (g) => g.state.furniture.filter((f) => FURNITURE_BY_ID[f.id]?.kind === 'decor').length,
        'Now it is a room people want to sit in.', 'Build → the Decor page', { g: 'furn_cottage', id: 'lamp_f' }),
      rung(1, 150, "New shelf. Go and look at what's on it."),
      Q('finish', 'Buy a piece in Cosy Cottage', 1, 180, 12,
        (g) => g.state.furniture.filter((f) => f.style === 'cottage').length,
        'Nicer wood, better tips. It really is that simple.', 'Build → pick Cosy Cottage at the top', { g: 'furn_cottage', id: 'cabinet_f' }),
      Q('crew', 'Hire anybody', 1, 200, 14,
        (g) => g.state.staff.length,
        "Nobody can run a place on their own. Not even me.", 'Build → the Crew page', { g: 'staff', id: '01_oyster_host' }),
      Q('learn', 'Know 4 recipes', 4, 300, 16,
        (g) => g.state.unlocked.length,
        'Four dishes. That is a menu worth reading!', 'Kitchen → the Learn page', { ico: 'book' }),
      Q('upgrade', 'Get a recipe to Lv2', 2, 260, 16,
        (g) => Math.max(1, ...Object.values(g.state.levels ?? {}), 1),
        'Same dish, more money. Do that to all of them.', 'Kitchen → the Upgrade page',
        { g: 'food', id: 'scallop_tart' }),
    ],
  },
  {
    id: 'works', name: 'The works', jobs: [
      rung(2, 300, 'The works are open. Go and get your hands dirty.'),
      Q('machine', 'Build a machine', 1, 250, 16,
        (g) => g.state.machines.filter((m) => m.kind === 'producer').length,
        'Now the harbour keeps working while you sleep.', 'Factory → Build → Machines', { g: 'machines', id: 'rice_grinder' }),
      Q('belt', 'Lay 4 belts', 4, 220, 14,
        (g) => g.state.machines.filter((m) => m.kind === 'belt').length,
        'One belt that goes somewhere beats ten that do not.', 'Factory → Build → Belts, then drag', { ico: 'belt' }),
      Q('intake', 'Build a Pantry Intake', 1, 300, 18,
        (g) => g.state.machines.filter((m) => m.kind === 'silo').length,
        'Point a belt into it and your larder fills itself. Magic.', 'Factory → Build → Storage', { g: 'furn_plain', id: 'shelf_b' }),
      Q('freefood', 'Have the works deliver 12 things', 12, 340, 20,
        (g) => g.state.stats.delivered ?? 0,
        'Free food! My favourite kind.', 'Point a belt into the Pantry Intake', { g: 'ingredients', id: 'rice' }),
      Q('expand', 'Knock through to the wharf', 1, 400, 22,
        (g) => (g.state.hasBought('area_wharf') ? 1 : 0),
        'Room to breathe — and room for more tables.', 'Build → the Expand page', { ico: 'shop' }),
      Q('refine', 'Build a refiner', 1, 380, 22,
        (g) => g.state.machines.filter((m) => m.kind === 'processor').length,
        'Cheap things in, valuable things out. That is the whole trick.', 'Factory → Build → Refiners', { g: 'machines', id: 'ice_mill' }),
      Q('upmachine', 'Tune a machine to level 3', 3, 360, 20,
        (g) => Math.max(1, ...g.state.machines.map((m) => m.level ?? 1), 1),
        'Faster machines cost less in the end. Worth every coin.', 'Tap a machine on the factory floor', { ico: 'tools' }),
    ],
  },
  {
    id: 'people', name: 'Regulars', jobs: [
      Q('meet', 'Meet 6 species', 6, 200, 14,
        (g) => Object.keys(g.state.diary ?? {}).length,
        'Six faces worth remembering.', 'Diary → pages fill in as people visit', { ico: 'diary' }),
      Q('like', 'Serve somebody what they love', 1, 240, 16,
        (g) => g.state.stats.loved ?? 0,
        'Triple hearts! Cook for the person, not just the order.', 'Diary → check what they love', { ico: 'heart' }),
      Q('hearts', 'Collect 18 hearts', 18, 320, 18,
        (g) => g.state.diaryHearts,
        'They come back for you now. That is the whole game, really.', 'Serve people what they love', { ico: 'heart' }),
      Q('vip', 'Serve a VIP', 1, 400, 24,
        (g) => g.state.stats.vips ?? 0,
        'A crown means they pay double. Be quick with those ones!', 'Look for a gold crown over their head', { g: 'customers', id: '07_whale_shark' }),
      rung(3, 500, "Bistro. Buy the walnut. You've earned it."),
      Q('hundred', 'Serve 100 guests', 100, 600, 30,
        (g) => g.state.stats.served,
        "A hundred dinners! I stopped counting ages ago.", 'Just keep the doors open', { g: 'customers', id: '05_sea_otter' }),
      Q('gift', 'Be given a present', 1, 500, 26,
        (g) => g.state.stats.gifts ?? 0,
        'Somebody brought you a present. That is the whole job, that.', 'Fill up somebody\u2019s hearts in the Diary', { ico: 'crew' }),
      Q('myth', 'Serve a Mythical guest', 1, 900, 40,
        (g) => g.state.stats.myths ?? 0,
        'Straight out of deep time and into a chair. They pay four times over.', 'Look for a violet star over their head', { g: 'customers', id: '12_blobfish' }),
    ],
  },
  {
    id: 'craft', name: 'Trade and craft', jobs: [
      rung(4, 800, 'Workshop is yours. Let a computer do the thinking.'),
      Q('lab', 'Build a Harbour Computer', 1, 420, 22,
        (g) => (g.state.hasWorks('lab') ? 1 : 0),
        'It does the thinking so you can carry the plates.', 'Factory → Build → Workshop',
        { g: 'machines', id: 'computer_desk' }),
      Q('research', 'Unlock 2 upgrades', 2, 460, 24,
        (g) => g.state.researched.length,
        'Every upgrade is a job you never have to do again.', 'Factory → tap the Harbour Computer you built', { ico: 'lab' }),
      Q('kilnup', 'Build the Harbour Kiln', 1, 520, 26,
        (g) => (g.state.hasWorks('kiln') ? 1 : 0),
        'Clay is cheap. A really good plate is not.', 'Factory → Build → Pottery',
        { g: 'machines', id: 'bisque_kiln' }),
      Q('class', 'Reach pottery level 4', 4, 560, 28,
        (g) => g.state.potteryLv,
        'You can throw a proper pot now. I am impressed.', 'Every guest you serve is practice', { ico: 'kiln' }),
      Q('forge', 'Forge a dish', 1, 900, 40,
        (g) => Object.keys(g.state.dishes ?? {}).length,
        'Better bowl, better price. I did say.', 'Tap the Wheel button on the right', { g: 'plates', id: 'plate_b01' }),
      Q('forge3', 'Forge 3 dishes', 3, 1400, 60,
        (g) => Object.keys(g.state.dishes ?? {}).length,
        'Three of them — that is a proper set!', 'Tap the kiln on the factory floor', { g: 'plates', id: 'plate_b05' }),
      rung(5, 1200, "Somebody's favourite. Don't ruin it."),
      Q('terrace', 'Take the Lantern Terrace', 1, 1200, 50,
        (g) => (g.state.hasBought('area_lantern') ? 1 : 0),
        'Thirteen by thirteen. Go on, fill it up.', 'Build → the Expand page', { ico: 'shop' }),
    ],
  },
  {
    id: 'house', name: 'A full house', jobs: [
      Q('crew5', 'Have four on the crew', 4, 900, 40,
        (g) => g.state.staff.length,
        'Four on the crew. We have an actual rota!', 'Build → the Crew page', { g: 'staff', id: '10_orca_harbor_manager' }),
      Q('twelve', 'Get to 10 seats', 10, 800, 36,
        (g) => g.restaurant.seatCount,
        'Ten seats at once. Keep up!', 'Build → Seating', { g: 'furn_antique', id: 'round_table_f' }),
      Q('big', 'Take 1,000 in one day', 1000, 1000, 44,
        (g) => g.state.stats.best ?? 0,
        'A thousand in one day. Go and buy yourself something.', 'A full menu and a full room does it', { ico: 'sand' }),
      Q('all', 'Know every recipe', 24, 1600, 70,
        (g) => g.state.unlocked.length,
        'Every recipe in the book. Now cook them all!', 'Kitchen → the Learn page', { g: 'food', id: 'treasure_bento' }),
      rung(6, 2000, 'A landmark. People give directions by us.'),
      Q('thousand', 'Serve 1,000 guests', 1000, 2500, 90,
        (g) => g.state.stats.served,
        'A thousand dinners out of this little kitchen.', 'Keep going — you are nearly there', { g: 'customers', id: '20_whale' }),
      rung(7, 5000, 'Legend. Now cook me something.'),
    ],
  },
];

export const QUESTS = CHAPTERS.flatMap((c) => c.jobs);
export const QUEST_COUNT = QUESTS.length;

/** Which chapter a job belongs to, for the book's headings. */
export const chapterOf = (id) => CHAPTERS.find((c) => c.jobs.some((j) => j.id === id));

/* ------------------------------------------------------------------- keys */

/**
 * Jobs that hand you a key.
 *
 * A new game used to open on six buttons, a zone switch and four books, which
 * is a lot of furniture to be handed by somebody you have just met. Now the
 * screen starts with the three things the first shift actually needs and the
 * rest arrive as you earn them — each one announced, so a new button is a
 * reward rather than something that was always there and you had not noticed.
 *
 * The pairings are all "the job teaches you the thing": the doors open, so you
 * need a larder; you have served people, so there is a diary worth keeping;
 * the works open at Quayside Stall; you build the kiln, so you get the wheel.
 */
export const KEYS = {
  open: { key: 'market', label: 'The Larder', blurb: 'Buy in, and see what you have.' },
  serve: { key: 'diary', label: 'The Guest Diary', blurb: 'Who came in, and what they love.' },
  r2: { key: 'factory', label: 'The Works', blurb: 'The room out the back is yours.' },
  kilnup: { key: 'plates', label: 'The Wheel', blurb: 'Throw and fire your own serving dishes.' },
};

/** Everything a brand-new save can already reach. */
export const STARTER_KEYS = ['build', 'kitchen', 'jobs', 'settings'];

/** Key -> the job that hands it over, for the locked-button message. */
export const KEY_SOURCE = Object.fromEntries(
  Object.entries(KEYS).map(([questId, k]) => [k.key, questId]));

/* ------------------------------------------------------------- pointing */

/**
 * Where a job actually is, so the guide can point at it.
 *
 * A hint that reads "Build → Crew" is only useful once you already know which
 * picture Build is. Each entry here is a trail of CSS selectors in the order
 * you would walk it, and the pointer lands on the *last* one currently on
 * screen: with the panel shut it points at the rail button, and the moment
 * that panel opens it moves to the tab inside it. So it leads rather than
 * describes, and it never has to be told that a panel opened.
 *
 * `world` instead means the thing is in the room, not in the interface —
 * a guest waiting to be sat down, a plate on the pass, a machine on the floor.
 * Jobs that are simply "keep going" have no entry, and get no pointer, because
 * there is nothing to point at and a finger waving at nothing is worse than
 * no finger at all.
 */
const TAB = (id) => `#sheet-tabs [data-tab="${id}"]`;
const ITEM = (id) => `[data-item="${id}"]`;
const WORKS = '#zoneswitch [data-zone="factory"]';

export const SPOTS = {
  // reaching a rung is a job too, and the ladder is where it is spelled out
  r1: ['#chip-rank'], r2: ['#chip-rank'], r3: ['#chip-rank'], r4: ['#chip-rank'],
  r5: ['#chip-rank'], r6: ['#chip-rank'], r7: ['#chip-rank'],

  // the first shift
  plate: ['#btn-recipes', TAB('menu'), '#sheet-body .stepper button:last-child'],
  open: ['#btn-service', '#menu-open'],
  serve: { world: (g) => g.restaurant.guests.find((x) => x.state === 'queue') ?? null },
  calm: { world: (g) => g.restaurant.guests.find((x) => x.state === 'wait' || x.state === 'queue') ?? null },
  wash: { world: (g) => g.restaurant.seats?.find((s) => s.dirty > 0) ?? null },
  day2: ['#btn-service'],

  // buying and building
  second: ['#btn-recipes', TAB('learn')],
  market: ['#btn-pantry', TAB('market')],
  cheap: ['#btn-pantry', TAB('market')],
  seats: ['#btn-build', TAB('seating'), ITEM('chair')],
  decor: ['#btn-build', TAB('decor'), ITEM('cabinet')],
  finish: ['#btn-build', TAB('seating'), '#sheet-body .swatch:nth-child(2)'],
  crew: ['#btn-build', TAB('crew'), ITEM('sea_lion_dish')],
  learn: ['#btn-recipes', TAB('learn')],
  upgrade: ['#btn-recipes', TAB('upgrade')],

  // the works
  machine: [WORKS, '#btn-build', TAB('producer'), ITEM('rice_grinder')],
  belt: [WORKS, '#btn-build', TAB('belt')],
  intake: [WORKS, '#btn-build', TAB('store'), ITEM('silo')],
  expand: ['#btn-build', TAB('expand')],
  refine: [WORKS, '#btn-build', TAB('processor'), ITEM('ice_mill')],
  upmachine: { world: (g) => g.state.machines.find((m) => m.kind === 'producer') ?? null },
  freefood: [WORKS],

  // regulars
  meet: ['#btn-diary'],
  like: ['#btn-diary'],
  hearts: ['#btn-diary'],

  // trade and craft
  lab: [WORKS, '#btn-build', TAB('workshop'), ITEM('harbour_computer')],
  research: { world: (g) => g.state.machines.find((m) => m.id === 'harbour_computer') ?? null },
  kilnup: [WORKS, '#btn-build', TAB('pottery'), ITEM('kiln')],
  forge: ['#btn-plate'],
  forge3: ['#btn-plate'],
  class: ['#btn-plate'],

  // the long climb
  terrace: ['#btn-build', TAB('expand')],
  crew5: ['#btn-build', TAB('crew')],
  twelve: ['#btn-build', TAB('seating'), ITEM('chair')],
  all: ['#btn-recipes', TAB('learn')],
};

/**
 * The one thing a job wants you to buy, off the end of its own trail.
 *
 * Rather than a second table to keep in step, the item is simply the last hop
 * of the pointer trail when that hop names one. The catalogue uses it twice:
 * to turn to the leaf the piece is printed on, and to ring the piece itself.
 */
export const wantedItem = (questId) => {
  const trail = SPOTS[questId];
  if (!Array.isArray(trail) || !trail.length) return null;
  const m = /^\[data-item="(.+)"\]$/.exec(trail[trail.length - 1]);
  return m ? m[1] : null;
};

/* -------------------------------------------------------------- side jobs */

/**
 * The other track.
 *
 * The main line is a story and it only goes one way. These are the small
 * standing jobs a kitchen actually has: feed this many today, do not lose
 * anybody, sell out, buy a crate. Three are up at a time and finishing one
 * draws another, so there is always something to be getting on with that is
 * not "wait for fame to go up".
 *
 * Every one is measured from the moment you were given it — `count` is a
 * running total off the save, and the panel subtracts what it was when the job
 * came up. That is what lets the same job be handed out again next week.
 */
const S = (id, title, need, coins, fame, count) =>
  ({ id, title, need, coins, fame, count });

export const SIDE = [
  S('s_serve', 'Serve 10 more guests', 10, 180, 10, (g) => g.state.stats.served),
  S('s_serve2', 'Serve 25 more guests', 25, 420, 22, (g) => g.state.stats.served),
  S('s_earn', 'Take another 500', 500, 200, 12, (g) => g.state.stats.earned),
  S('s_earn2', 'Take another 2,000', 2000, 700, 30, (g) => g.state.stats.earned),
  S('s_calm', 'Cheer up 8 guests', 8, 220, 12, (g) => g.state.stats.calmed ?? 0),
  S('s_wash', 'Clear 10 tables', 10, 160, 9, (g) => g.state.stats.washed ?? 0),
  S('s_buy', 'Buy 10 crates', 10, 190, 10, (g) => g.state.stats.bought ?? 0),
  S('s_loved', 'Land 5 favourites', 5, 320, 18, (g) => g.state.stats.loved ?? 0),
  S('s_vip', 'Serve 2 more VIPs', 2, 380, 20, (g) => g.state.stats.vips ?? 0),
  S('s_days', 'Work 3 more days', 3, 260, 14, (g) => g.state.day),
  S('s_deliver', 'Take 40 off the belts', 40, 300, 16, (g) => g.state.stats.delivered ?? 0),
  S('s_hearts', 'Win 15 more hearts', 15, 340, 18, (g) => g.state.diaryHearts),
  S('s_pot', 'Practise pottery 60 times', 60, 280, 15, (g) => g.state.pottery),
  S('s_gift', 'Be given another present', 1, 420, 22, (g) => g.state.stats.gifts ?? 0),
];

export const SIDE_BY_ID = Object.fromEntries(SIDE.map((x) => [x.id, x]));
export const SIDE_SLOTS = 3;
