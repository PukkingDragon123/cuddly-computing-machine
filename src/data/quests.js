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
      Q('plate', 'Plate 3 dishes', 3, 60, 4,
        (g) => g.state.plannedCount,
        "Three's a menu. Barely.", 'Kitchen → tap + beside a dish', { g: 'food', id: 'kelp_ramen' }),
      Q('open', 'Open the doors', 1, 60, 4,
        (g) => (g.state.phase === 'open' ? 1 : 0),
        'Here they come.', 'The green button, bottom right', { ico: 'sound' }),
      Q('serve', 'Serve 3 guests', 3, 120, 8,
        (g) => g.state.stats.served,
        'Three happy. Keep going.', 'Seat, take the order, run the plate', { g: 'customers', id: '03_hermit_crab' }),
      Q('board', 'Call somebody in off the board', 1, 90, 6,
        (g) => g.state.stats.called ?? 0,
        'They came because you asked. Remember that.', 'Ten taps on the board, bottom left', { ico: 'flyer' }),
      Q('wash', 'Clear 3 tables', 3, 90, 6,
        (g) => g.state.stats.washed ?? 0,
        'Nobody sits at a dirty table.', 'Tap a plate left behind', { g: 'plates', id: 'plate_a01' }),
      Q('day2', 'Finish a day', 2, 120, 10,
        (g) => g.state.day,
        "That's one. Do it again, better.", 'Close up, then Next Day', { ico: 'refresh' }),
    ],
  },
  {
    id: 'shop', name: 'Buying and building', jobs: [
      Q('market', 'Buy from the market', 1, 90, 5,
        (g) => g.state.stats.bought ?? 0,
        'Boats land every hour. Prices move. Watch them.', 'Inventory → Harbor Market', { ico: 'crate' }),
      Q('cheap', 'Buy something off the catch', 3, 140, 8,
        (g) => g.state.stats.cheap ?? 0,
        'Cheap crates are the whole margin some days.', "Market → the ones marked catch", { g: 'ingredients', id: 'scallop' }),
      Q('seats', 'Get to 4 seats', 4, 150, 10,
        (g) => g.restaurant.seatCount,
        'More chairs, more dinners.', 'Build → a table, then chairs beside it', { g: 'furn_plain', id: 'chair_f' }),
      Q('decor', 'Put up 3 bits of decor', 3, 160, 12,
        (g) => g.state.furniture.filter((f) => FURNITURE_BY_ID[f.id]?.kind === 'decor').length,
        'A room people want to sit in.', 'Build → Decoration', { g: 'furn_cottage', id: 'lamp_f' }),
      rung(1, 150, "New shelf. Go and look at what's on it."),
      Q('finish', 'Buy a piece in Cosy Cottage', 1, 180, 12,
        (g) => g.state.furniture.filter((f) => f.style === 'cottage').length,
        'Nicer wood, better tips. It is that simple.', 'Build → pick the finish first', { g: 'furn_cottage', id: 'cabinet_f' }),
      Q('crew', 'Hire anybody', 1, 200, 14,
        (g) => g.state.staff.length,
        "You can't run a room on your own. Nobody can.", 'Build → Crew', { g: 'staff', id: '01_oyster_host' }),
      Q('learn', 'Know 6 recipes', 6, 300, 16,
        (g) => g.state.unlocked.length,
        'A menu worth reading.', 'Kitchen → Learn', { ico: 'book' }),
      Q('upgrade', 'Level a recipe up', 2, 260, 16,
        (g) => Math.max(1, ...Object.values(g.state.levels ?? {}), 1),
        'Same dish, more money. Do it to all of them.', 'Kitchen → Upgrade',
        { g: 'food', id: 'scallop_tart' }),
    ],
  },
  {
    id: 'works', name: 'The works', jobs: [
      rung(2, 300, 'The works are open. Go and get your hands dirty.'),
      Q('machine', 'Build a machine', 1, 250, 16,
        (g) => g.state.machines.filter((m) => m.kind === 'producer').length,
        'Now the harbour works while you sleep.', 'Factory → Machines', { g: 'machines', id: 'rice_grinder' }),
      Q('belt', 'Lay 5 belts', 5, 220, 14,
        (g) => g.state.machines.filter((m) => m.kind === 'belt').length,
        'A line that goes somewhere is worth ten that do not.', 'Factory → Belts, then drag', { ico: 'belt' }),
      Q('intake', 'Build a Pantry Intake', 1, 300, 18,
        (g) => g.state.machines.filter((m) => m.kind === 'silo').length,
        'Belt into that and the larder fills itself.', 'Factory → Storage', { g: 'furn_plain', id: 'shelf_b' }),
      Q('freefood', 'Have the works deliver 20 things', 20, 340, 20,
        (g) => g.state.stats.delivered ?? 0,
        'Free food. The best kind.', 'Point a belt at the intake', { g: 'ingredients', id: 'rice' }),
      Q('expand', 'Knock through to the wharf', 1, 400, 22,
        (g) => (g.state.hasBought('area_wharf') ? 1 : 0),
        'Room to breathe. And to seat people.', 'Build → Expand', { ico: 'shop' }),
      Q('refine', 'Build a refiner', 1, 380, 22,
        (g) => g.state.machines.filter((m) => m.kind === 'processor').length,
        'Cheap in, expensive out. That is the whole trade.', 'Factory → Refiners', { g: 'machines', id: 'ice_mill' }),
      Q('upmachine', 'Tune a machine to level 3', 3, 360, 20,
        (g) => Math.max(1, ...g.state.machines.map((m) => m.level ?? 1), 1),
        'Faster is cheaper, in the end.', 'Tap a machine on the floor', { ico: 'tools' }),
    ],
  },
  {
    id: 'people', name: 'Regulars', jobs: [
      Q('meet', 'Meet 6 species', 6, 200, 14,
        (g) => Object.keys(g.state.diary ?? {}).length,
        'Faces worth learning.', 'Diary → they fill in as they come', { ico: 'diary' }),
      Q('like', 'Serve somebody what they love', 1, 240, 16,
        (g) => g.state.stats.loved ?? 0,
        'Triple hearts. Cook to the person, not the ticket.', 'Diary → look up their taste', { ico: 'heart' }),
      Q('hearts', 'Collect 25 hearts', 25, 320, 18,
        (g) => g.state.diaryHearts,
        'They come back for you now.', 'Serve people what they love', { ico: 'heart' }),
      Q('vip', 'Serve a VIP', 1, 400, 24,
        (g) => g.state.stats.vips ?? 0,
        'Crowned, and paying double. Be quick with them.', 'A gold crown over the head', { g: 'customers', id: '07_whale_shark' }),
      rung(3, 500, "Bistro. Buy the walnut. You've earned it."),
      Q('hundred', 'Serve 100 guests', 100, 600, 30,
        (g) => g.state.stats.served,
        "A hundred. I've stopped counting. You shouldn't.", 'Keep the doors open', { g: 'customers', id: '05_sea_otter' }),
      Q('gift', 'Be given a present', 1, 500, 26,
        (g) => g.state.stats.gifts ?? 0,
        'They brought you something. That is the whole job, that.', 'Fill somebody up with hearts', { ico: 'crew' }),
      Q('myth', 'Serve a Mythical guest', 1, 900, 40,
        (g) => g.state.stats.myths ?? 0,
        'Out of deep time and into a chair. Four times the money.', 'A violet star over the head', { g: 'customers', id: '12_blobfish' }),
    ],
  },
  {
    id: 'craft', name: 'Trade and craft', jobs: [
      rung(4, 800, 'Workshop is yours. Let a computer do the thinking.'),
      Q('lab', 'Build a Harbour Computer', 1, 420, 22,
        (g) => (g.state.hasWorks('lab') ? 1 : 0),
        'It thinks so you can carry plates.', 'Factory → Workshop',
        { g: 'machines', id: 'computer_desk' }),
      Q('research', 'Spend 3 research points', 3, 460, 24,
        (g) => g.state.researched.length,
        'Every one of those is a job you never do again.', 'Tap the computer', { ico: 'lab' }),
      Q('kilnup', 'Build the Harbour Kiln', 1, 520, 26,
        (g) => (g.state.hasWorks('kiln') ? 1 : 0),
        'Clay is cheap. A good plate is not.', 'Factory → Pottery',
        { g: 'machines', id: 'bisque_kiln' }),
      Q('class', 'Reach pottery level 5', 5, 560, 28,
        (g) => g.state.potteryLv,
        'You can throw now. Properly.', 'Serving guests is the practice', { ico: 'kiln' }),
      Q('forge', 'Forge a dish', 1, 900, 40,
        (g) => Object.keys(g.state.dishes ?? {}).length,
        'Better bowl, better price. Told you.', 'Tap the kiln', { g: 'plates', id: 'plate_b01' }),
      Q('forge3', 'Forge three dishes', 3, 1400, 60,
        (g) => Object.keys(g.state.dishes ?? {}).length,
        'A set. Nearly respectable.', 'Tap the kiln', { g: 'plates', id: 'plate_b05' }),
      rung(5, 1200, "Somebody's favourite. Don't ruin it."),
      Q('terrace', 'Take the Lantern Terrace', 1, 1200, 50,
        (g) => (g.state.hasBought('area_lantern') ? 1 : 0),
        'Thirteen by thirteen. Fill it.', 'Build → Expand', { ico: 'shop' }),
    ],
  },
  {
    id: 'house', name: 'A full house', jobs: [
      Q('crew5', 'Have five on the crew', 5, 900, 40,
        (g) => g.state.staff.length,
        'A rota. An actual rota.', 'Build → Crew', { g: 'staff', id: '10_orca_harbor_manager' }),
      Q('twelve', 'Get to 12 seats', 12, 800, 36,
        (g) => g.restaurant.seatCount,
        'Twelve at once. Keep up.', 'Build → tables and chairs', { g: 'furn_antique', id: 'round_table_f' }),
      Q('big', 'Take 1,000 in one day', 1000, 1000, 44,
        (g) => g.state.stats.best ?? 0,
        'A thousand in a day. Buy yourself something.', 'A full menu and a full room', { ico: 'sand' }),
      Q('all', 'Know every recipe', 24, 1600, 70,
        (g) => g.state.unlocked.length,
        'The whole book. Cook it all.', 'Kitchen → Learn', { g: 'food', id: 'treasure_bento' }),
      rung(6, 2000, 'A landmark. People give directions by us.'),
      Q('thousand', 'Serve 1,000 guests', 1000, 2500, 90,
        (g) => g.state.stats.served,
        'A thousand dinners out of this kitchen.', 'Keep going', { g: 'customers', id: '20_whale' }),
      rung(7, 5000, 'Legend. Now cook me something.'),
    ],
  },
];

export const QUESTS = CHAPTERS.flatMap((c) => c.jobs);
export const QUEST_COUNT = QUESTS.length;

/** Which chapter a job belongs to, for the book's headings. */
export const chapterOf = (id) => CHAPTERS.find((c) => c.jobs.some((j) => j.id === id));

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
  S('s_board', 'Call 5 in off the board', 5, 220, 12, (g) => g.state.stats.called ?? 0),
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
