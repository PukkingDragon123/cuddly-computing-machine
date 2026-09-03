// The job board.
//
// Not a list any more — a tree. The first shift is a single line because a
// first shift is a single line: there is one thing to do next and you have
// never done any of it. After that the board forks, and it keeps forking.
//
// Three things make a fork worth having, and the game has all three now:
//
//   The paths are about different things. Front of house is chairs and
//   colour; the menu is recipes; the larder is buying well. They are not the
//   same climb with different labels on it.
//
//   They pay in different currencies. Front of house pays in fame, the menu
//   hands you a recipe outright, the larder sends crates, the works pay in
//   research, the craft pays in clay. A branch you would take for the money is
//   not a choice, it is a right answer with two wrong answers next to it.
//
//   And nothing is lost by choosing. A fork's strands stay on the board after
//   the line has moved past them, so picking the menu first does not mean
//   never seeing the larder — it means seeing it second. Permanent lockout in
//   a game you play for an hour a night is a way of making people replay from
//   scratch, and nobody does; they just stop.
//
// Everything else about a job is the same as it was: it pays coins and fame,
// it says in one line what it is, it says in one line where to go, and the
// chef has something to say when it lands.

import { RANKS } from './fame.js';
import { FURNITURE_BY_ID } from './catalog.js';

/**
 * A job.
 *
 * `desc` is what the job *is*, in a sentence somebody would say. `hint` is
 * where to go and do it. They were one field for a long time and the card
 * showed the hint, so the ticket in the corner of the screen said "Build →
 * the Decor page" and never once said what you were being asked to do.
 *
 * `next` is what this job opens. `path` is which strand it belongs to, which
 * decides its colour and what it pays in. `prize` is the thing on top of the
 * money — see PATHS for what each strand deals in.
 */
const J = (id, title, o) => ({
  id, title, need: 1, coins: 0, fame: 0, path: 'trunk', next: [], prize: null, ...o,
});

/** Reaching a rung on the ladder is a job in its own right. */
const rung = (n, coins, done, next) => J(`r${n}`, RANKS[n].name, {
  need: RANKS[n].at, coins, have: (g) => g.state.fame,
  desc: `Get the harbour talking. ${RANKS[n].at} fame makes us ${RANKS[n].name.toLowerCase()}.`,
  done, hint: RANKS[n].gives[0], art: { ico: 'star' }, next,
});

/**
 * The strands, and what each one deals in.
 *
 * `pays` is printed on the fork card, because the whole point of a fork is
 * that you can tell the difference between the two sides before you commit to
 * one. `tint` is the slip's colour on the board.
 */
export const PATHS = {
  trunk: {
    name: 'The line', ico: 'star', tint: 'sun',
    pitch: 'The main run. Everything comes back to it.', pays: 'coins and fame',
  },
  room: {
    name: 'Front of house', ico: 'crew', tint: 'mint',
    pitch: 'Chairs, colour, and a room somebody would choose to sit in.',
    pays: 'fame — a lot of it',
  },
  kitchen: {
    name: 'The menu', ico: 'book', tint: 'coral',
    pitch: 'More to cook, and better at cooking it.',
    pays: 'recipes, free',
  },
  market: {
    name: 'The larder', ico: 'crate', tint: 'sky',
    pitch: 'Buy well, keep the shelves full, never run dry mid-service.',
    pays: 'crates of stock',
  },
  works: {
    name: 'The works', ico: 'belt', tint: 'slate',
    pitch: 'Machines and belts, doing the boring half while you serve.',
    pays: 'research',
  },
  people: {
    name: 'Regulars', ico: 'heart', tint: 'rose',
    pitch: 'Learn who they are and what they love. They come back for you.',
    pays: 'a very fat purse',
  },
  craft: {
    name: 'The craft', ico: 'kiln', tint: 'plum',
    pitch: 'Clay, the wheel, and plates worth putting food on.',
    pays: 'clay and practice',
  },
};

/* ------------------------------------------------------------------ the tree */

/**
 * Every job, and what each one opens.
 *
 * Read it as a shape rather than a list: a run of trunk jobs, then a fork
 * whose strands all point back at the same trunk job, then the trunk again.
 * A job with two or more ids in `next` is a fork; a job that several strands
 * name is where they come back together, and it opens as soon as *any* one of
 * them lands.
 */
export const JOBS = [
  /* --- the first shift. One line, because a first shift is one line. ---- */
  J('plate', 'Plate three lattes', {
    need: 3, coins: 60, fame: 4, have: (g) => g.state.plannedCount,
    desc: 'Decide what we are cooking today, and how much of it.',
    hint: 'Kitchen → tap the + by the latte',
    done: "One dish isn't a menu. It's a lovely start, though.",
    art: { g: 'food', id: 'kelp_latte' }, next: ['open'],
  }),
  J('open', 'Open the doors', {
    coins: 60, fame: 4, have: (g) => (g.state.phase === 'open' ? 1 : 0),
    desc: 'Stop tidying. Let the harbour in and see what happens.',
    hint: 'Tap Arrange Menu, then Open Up!',
    done: "Here they come. Deep breath, you'll be fine.",
    art: { ico: 'book' }, next: ['serve'],
  }),
  J('serve', 'Serve three guests', {
    need: 3, coins: 120, fame: 8, have: (g) => g.state.stats.served,
    desc: 'Sit somebody down, take the order, bring the food. The whole job.',
    hint: 'Tap a guest waiting by the door',
    done: 'Three of them, all happy. Keep that up.',
    art: { g: 'customers', id: '03_hermit_crab' }, next: ['calm'],
  }),
  J('calm', 'Cheer up two guests', {
    need: 2, coins: 90, fame: 6, have: (g) => g.state.stats.calmed ?? 0,
    desc: 'Somebody waiting is somebody about to leave. Go and have a word.',
    hint: 'Tap anybody who is waiting',
    done: "A kind word buys you a minute. Handy when I'm behind.",
    art: { ico: 'heart' }, next: ['wash'],
  }),
  J('wash', 'Clear three tables', {
    need: 3, coins: 90, fame: 6, have: (g) => g.state.stats.washed ?? 0,
    desc: 'A used plate is a chair nobody can sit in.',
    hint: 'Tap a dirty plate left on a table',
    done: 'Nobody sits at a dirty table. Well spotted.',
    art: { g: 'plates', id: 'plate_a01' }, next: ['day2'],
  }),
  J('day2', 'Get to day two', {
    need: 2, coins: 140, fame: 10, have: (g) => g.state.day,
    desc: 'Shut up shop, count the till, and do it again tomorrow.',
    hint: 'Tap Close Up, then Next Day',
    done: "That's one whole day. Now do it again, only better.",
    art: { ico: 'refresh' },
    prize: { ing: { kelp: 12, milk: 12 } },
    next: ['seats', 'second', 'market'],
  }),

  /* --- fork one: front of house ---------------------------------------- */
  J('seats', 'Get to four seats', {
    path: 'room', need: 4, coins: 150, fame: 14, have: (g) => g.restaurant.seatCount,
    desc: 'Four at once instead of two. Twice the night, same rent.',
    hint: 'Build → a table, then chairs around it',
    done: 'More chairs, more dinners. It really is that simple.',
    art: { g: 'furn_plain', id: 'chair_f' }, next: ['decor'],
  }),
  J('decor', 'Put up three bits of decor', {
    path: 'room', need: 3, coins: 160, fame: 18,
    have: (g) => g.state.furniture.filter((f) => FURNITURE_BY_ID[f.id]?.kind === 'decor').length,
    desc: 'Bare walls feed nobody, but they do empty a room.',
    hint: 'Build → the Decor page',
    done: "Right — now it's a room people want to sit in.",
    art: { g: 'furn_cottage', id: 'lamp_f' }, next: ['finish'],
  }),
  J('finish', 'Buy a piece in Cosy Cottage', {
    path: 'room', coins: 180, fame: 30,
    have: (g) => g.state.furniture.filter((f) => f.style === 'cottage').length,
    desc: 'The good wood. People notice, and people tip.',
    hint: 'Build → pick Cosy Cottage at the top',
    done: "Nicer wood, better tips. I don't make the rules.",
    art: { g: 'furn_cottage', id: 'cabinet_f' },
    prize: { fame: 30 }, next: ['crew'],
  }),

  /* --- fork one: the menu ---------------------------------------------- */
  J('second', 'Know two recipes', {
    path: 'kitchen', need: 2, coins: 140, fame: 10, have: (g) => g.state.unlocked.length,
    desc: 'One dish is a stall. Two is somewhere you sit down.',
    hint: 'Kitchen → the Learn page',
    done: "Two dishes. Now they've got a choice, haven't they.",
    art: { g: 'food', id: 'kelp_ramen' }, next: ['upgrade'],
  }),
  J('upgrade', 'Get a recipe to level two', {
    path: 'kitchen', need: 2, coins: 260, fame: 16,
    have: (g) => Math.max(1, ...Object.values(g.state.levels ?? {}), 1),
    desc: 'Same dish, cooked better, sold dearer.',
    hint: 'Kitchen → the Upgrade page',
    done: 'Same dish, more money. Go and do that to all of them.',
    art: { g: 'food', id: 'scallop_tart' }, next: ['learn'],
  }),
  J('learn', 'Know four recipes', {
    path: 'kitchen', need: 4, coins: 300, fame: 16, have: (g) => g.state.unlocked.length,
    desc: 'Enough of a menu that two people can order different things.',
    hint: 'Kitchen → the Learn page',
    done: "Four dishes. That's a menu somebody would actually read.",
    art: { ico: 'book' },
    prize: { recipe: 'kelp_fries' }, next: ['crew'],
  }),

  /* --- fork one: the larder -------------------------------------------- */
  J('market', 'Buy something at the market', {
    path: 'market', coins: 90, fame: 5, have: (g) => g.state.stats.bought ?? 0,
    desc: 'Boats land all day and the prices never sit still.',
    hint: 'Larder → the Harbor Market page',
    done: 'Worth a look every morning, that is.',
    art: { ico: 'crate' }, next: ['cheap'],
  }),
  J('cheap', 'Buy two crates off the catch', {
    path: 'market', need: 2, coins: 140, fame: 8, have: (g) => g.state.stats.cheap ?? 0,
    desc: "Whatever came in cheap this morning. It won't be there tomorrow.",
    hint: 'Market → the crates marked catch',
    done: 'Cheap crates are where the money hides. Nicely done.',
    art: { g: 'ingredients', id: 'scallop' }, next: ['stocked'],
  }),
  J('stocked', 'Fill the larder to 120', {
    path: 'market', need: 120, coins: 240, fame: 12,
    have: (g) => Object.values(g.state.pantry ?? {}).reduce((a, b) => a + b, 0),
    desc: 'Enough on the shelves to get through a busy night without a gap.',
    hint: 'Larder → buy up whatever is cheap',
    done: "Full shelves. I sleep better, and so will you.",
    art: { g: 'ingredients', id: 'rice' },
    prize: { ing: { flour: 20, butter: 12, potato: 20 } }, next: ['crew'],
  }),

  /* --- back on the line ------------------------------------------------- */
  J('crew', 'Hire anybody', {
    coins: 200, fame: 14, have: (g) => g.state.staff.length,
    desc: 'A second pair of hands, and they never once ask for a day off.',
    hint: 'Build → the Crew page',
    done: "Nobody runs a place on their own. Not even me.",
    art: { g: 'staff', id: '01_oyster_host' }, next: ['r1'],
  }),
  rung(1, 400, 'A whole new shelf of things. Go and have a look!', ['r2']),
  rung(2, 800, 'The works are open! Go and get your hands dirty.', ['machine', 'expand']),

  /* --- fork two: the works --------------------------------------------- */
  J('machine', 'Build a machine', {
    path: 'works', coins: 250, fame: 16,
    have: (g) => g.state.machines.filter((m) => m.kind === 'producer').length,
    desc: 'Something out the back that makes food while you carry plates.',
    hint: 'Works → Build → Machines',
    done: 'There. The harbour keeps working while you sleep now.',
    art: { g: 'machines', id: 'rice_grinder' }, next: ['belt'],
  }),
  J('belt', 'Lay four belts', {
    path: 'works', need: 4, coins: 220, fame: 14,
    have: (g) => g.state.machines.filter((m) => m.kind === 'belt').length,
    desc: 'A machine with nowhere to put its output is a machine having a rest.',
    hint: 'Works → Build → Belts, then drag',
    done: "One belt that goes somewhere beats ten that don't.",
    art: { ico: 'belt' }, next: ['intake'],
  }),
  J('intake', 'Build a pantry intake', {
    path: 'works', coins: 300, fame: 18,
    have: (g) => g.state.machines.filter((m) => m.kind === 'silo').length,
    desc: 'The end of the line. Everything that reaches it goes in the larder.',
    hint: 'Works → Build → Storage',
    done: 'Point a belt into that and the larder fills itself. Magic.',
    art: { g: 'furn_plain', id: 'shelf_b' }, next: ['freefood'],
  }),
  J('freefood', 'Take ten things off the belts', {
    path: 'works', need: 10, coins: 510, fame: 20,
    have: (g) => g.state.stats.delivered ?? 0,
    desc: 'Stock you did not buy, arriving while you were busy elsewhere.',
    hint: 'Point a belt into the pantry intake',
    done: 'Free food. My favourite kind, that.',
    art: { g: 'ingredients', id: 'rice' },
    prize: { research: 3 }, next: ['refine'],
  }),

  /* --- fork two: a bigger room ----------------------------------------- */
  J('expand', 'Knock through to the wharf', {
    path: 'room', coins: 400, fame: 22,
    have: (g) => (g.state.hasBought('area_wharf') ? 1 : 0),
    desc: 'The wall between us and the wharf is the only thing in our way.',
    hint: 'Build → the Expand page',
    done: 'Room to breathe. And room for more tables, mind.',
    art: { ico: 'shop' }, next: ['twelve'],
  }),
  J('twelve', 'Get to ten seats', {
    path: 'room', need: 10, coins: 800, fame: 30, have: (g) => g.restaurant.seatCount,
    desc: 'Ten people eating at once. Try and keep up.',
    hint: 'Build → Seating',
    done: 'Ten at once. That is a proper dining room.',
    art: { g: 'furn_antique', id: 'round_table_f' }, next: ['crew5'],
  }),
  J('crew5', 'Have four on the crew', {
    path: 'room', need: 4, coins: 900, fame: 44, have: (g) => g.state.staff.length,
    desc: "Enough hands that you can stand still for a moment and watch.",
    hint: 'Build → the Crew page',
    done: "Four on the crew. We've got an actual rota.",
    art: { g: 'staff', id: '10_orca_harbor_manager' },
    prize: { fame: 40 }, next: ['refine'],
  }),

  /* --- back on the line ------------------------------------------------- */
  J('refine', 'Build a refiner', {
    coins: 380, fame: 22,
    have: (g) => g.state.machines.filter((m) => m.kind === 'processor').length,
    desc: 'Cheap things in one end, dear things out the other.',
    hint: 'Works → Build → Refiners',
    done: "Cheap things in, dear things out. That's the whole trick.",
    art: { g: 'machines', id: 'ice_mill' }, next: ['upmachine'],
  }),
  J('upmachine', 'Tune a machine to level three', {
    need: 3, coins: 360, fame: 20,
    have: (g) => Math.max(1, ...g.state.machines.map((m) => m.level ?? 1), 1),
    desc: 'A tuned machine costs coins once and saves them every day after.',
    hint: 'Tap a machine on the works floor',
    done: 'Faster costs less in the end. Worth every coin.',
    art: { ico: 'tools' }, next: ['r3'],
  }),
  rung(3, 1400, 'A bistro! Go and buy the walnut — you have earned it.', ['meet', 'lab']),

  /* --- fork three: regulars -------------------------------------------- */
  J('meet', 'Meet six species', {
    path: 'people', need: 6, coins: 200, fame: 14,
    have: (g) => Object.keys(g.state.diary ?? {}).length,
    desc: 'Everybody who walks in gets a page. Fill six of them.',
    hint: 'Diary → pages fill in as people visit',
    done: "Six faces worth remembering. There'll be more.",
    art: { ico: 'diary' }, next: ['like'],
  }),
  J('like', 'Serve somebody what they love', {
    path: 'people', coins: 240, fame: 16, have: (g) => g.state.stats.loved ?? 0,
    desc: 'Their page says what they love. Cook that, and watch.',
    hint: 'Diary → check what they love',
    done: 'Triple hearts! Cook for the person, not just the ticket.',
    art: { ico: 'heart' }, next: ['vip'],
  }),
  J('vip', 'Serve a VIP', {
    path: 'people', coins: 400, fame: 24, have: (g) => g.state.stats.vips ?? 0,
    desc: 'A gold crown means they pay double. Be quick with those ones.',
    hint: 'Look for a gold crown over their head',
    done: 'A crown means double. Be quick with those ones.',
    art: { g: 'customers', id: '07_whale_shark' }, next: ['hearts'],
  }),
  J('hearts', 'Collect fourteen hearts', {
    path: 'people', need: 14, coins: 480, fame: 18, have: (g) => g.state.diaryHearts,
    desc: 'Hearts are people choosing us over everywhere else on the harbour.',
    hint: 'Serve people what they love',
    done: "They come back for you now. That's the whole game, really.",
    art: { ico: 'heart' }, next: ['gift'],
  }),
  J('gift', 'Be given a present', {
    path: 'people', coins: 900, fame: 26, have: (g) => g.state.stats.gifts ?? 0,
    desc: 'Fill somebody’s hearts right up and they bring you something.',
    hint: 'Diary → fill up a regular’s hearts',
    done: "Somebody brought you a present. That's the whole job, that is.",
    art: { ico: 'crew' },
    prize: { coins: 900 }, next: ['r4'],
  }),

  /* --- fork three: the craft ------------------------------------------- */
  J('lab', 'Build a harbour computer', {
    path: 'craft', coins: 420, fame: 22, have: (g) => (g.state.hasWorks('lab') ? 1 : 0),
    desc: 'It does the thinking so you can carry the plates.',
    hint: 'Works → Build → Workshop',
    done: 'It does the thinking so you can carry the plates.',
    art: { g: 'machines', id: 'computer_desk' }, next: ['research'],
  }),
  J('research', 'Unlock two upgrades', {
    path: 'craft', need: 2, coins: 460, fame: 24, have: (g) => g.state.researched.length,
    desc: 'Every upgrade is a job you never have to do again.',
    hint: 'Works → tap the harbour computer you built',
    done: 'Every one of those is a job you never do again.',
    art: { ico: 'lab' },
    prize: { research: 2 }, next: ['kilnup'],
  }),
  J('kilnup', 'Build the harbour kiln', {
    path: 'craft', coins: 520, fame: 26, have: (g) => (g.state.hasWorks('kiln') ? 1 : 0),
    desc: 'Clay costs almost nothing. A really lovely plate does not.',
    hint: 'Works → Build → Pottery',
    done: "Clay's cheap. A really good plate isn't.",
    art: { g: 'machines', id: 'bisque_kiln' },
    prize: { clay: 40 }, next: ['forge'],
  }),
  J('forge', 'Forge a dish', {
    path: 'craft', coins: 900, fame: 40, have: (g) => Object.keys(g.state.dishes ?? {}).length,
    desc: 'Throw a plate of your own and put the same food on a better one.',
    hint: 'Tap the Wheel button on the right',
    done: 'Better bowl, better price. I did say.',
    art: { g: 'plates', id: 'plate_b01' },
    prize: { clay: 60, pottery: 40 }, next: ['r4'],
  }),

  /* --- back on the line ------------------------------------------------- */
  rung(4, 2200, 'The workshop is yours. Let a computer do the thinking.', ['terrace', 'class']),

  /* --- a short craft detour -------------------------------------------- */
  J('class', 'Reach pottery level four', {
    path: 'craft', need: 4, coins: 560, fame: 28, have: (g) => g.state.potteryLv,
    desc: 'Every guest you serve is practice at the wheel, whether you meant it or not.',
    hint: 'Keep serving — the practice adds up',
    done: "You can throw a proper pot now. I'm impressed, genuinely.",
    art: { ico: 'kiln' }, next: ['forge3'],
  }),
  J('forge3', 'Forge three dishes', {
    path: 'craft', need: 3, coins: 1400, fame: 60,
    have: (g) => Object.keys(g.state.dishes ?? {}).length,
    desc: 'A set, rather than the one good plate you keep washing up.',
    hint: 'Tap the kiln on the works floor',
    done: "Three of them. That's a proper set, that.",
    art: { g: 'plates', id: 'plate_b05' },
    prize: { clay: 120, pottery: 80 }, next: ['r5'],
  }),

  J('terrace', 'Take the lantern terrace', {
    coins: 1200, fame: 50, have: (g) => (g.state.hasBought('area_lantern') ? 1 : 0),
    desc: 'Thirteen by thirteen, lanterns and all. The last of the harbour front.',
    hint: 'Build → the Expand page',
    done: 'Thirteen by thirteen. Go on then, fill it.',
    art: { ico: 'shop' }, next: ['r5'],
  }),
  rung(5, 3200, "Somebody's favourite place. Look after it.", ['all', 'hundred']),

  /* --- fork four: the long finish -------------------------------------- */
  J('all', 'Know every recipe', {
    path: 'kitchen', need: 24, coins: 2400, fame: 70, have: (g) => g.state.unlocked.length,
    desc: 'The whole book, cover to cover, nothing left to learn.',
    hint: 'Kitchen → the Learn page',
    done: 'Every recipe in the book. Now go and cook them all.',
    art: { g: 'food', id: 'treasure_bento' },
    prize: { recipe: 'treasure_bento' }, next: ['big'],
  }),
  J('big', 'Take 600 in one day', {
    path: 'kitchen', need: 600, coins: 1500, fame: 44, have: (g) => g.state.stats.best ?? 0,
    desc: 'One day, six hundred coins. A full menu and a full room does it.',
    hint: 'Open with every seat clean and every dish plated',
    done: 'Six hundred in a day. Go and buy yourself something.',
    art: { ico: 'sand' },
    prize: { coins: 1500 }, next: ['r6'],
  }),
  J('hundred', 'Serve sixty guests', {
    path: 'people', need: 60, coins: 900, fame: 30, have: (g) => g.state.stats.served,
    desc: 'Sixty dinners out of this little kitchen.',
    hint: 'Just keep the doors open',
    done: 'Sixty dinners. I stopped counting ages ago.',
    art: { g: 'customers', id: '05_sea_otter' }, next: ['myth'],
  }),
  J('myth', 'Serve a mythical guest', {
    path: 'people', coins: 900, fame: 40, have: (g) => g.state.stats.myths ?? 0,
    desc: 'Straight out of deep time and into one of our chairs.',
    hint: 'Look for a violet star over their head',
    done: 'Straight out of deep time and into a chair. Pays four times over, too.',
    art: { g: 'customers', id: '12_blobfish' }, next: ['thousand'],
  }),
  J('thousand', 'Serve four hundred guests', {
    path: 'people', need: 400, coins: 3600, fame: 90, have: (g) => g.state.stats.served,
    desc: 'Four hundred people who chose us. Every one of them walked past somewhere else.',
    hint: 'Keep going — you are nearly there',
    done: 'Four hundred dinners out of this little kitchen.',
    art: { g: 'customers', id: '20_whale' },
    prize: { coins: 3600 }, next: ['r6'],
  }),

  rung(6, 5200, 'A landmark! People give directions by us now.', ['r7']),
  rung(7, 12000, 'A legend. Right — now cook me something.', []),
];

export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
export const QUEST_COUNT = JOBS.length;

/** Where the board starts, for a brand-new save. */
export const ROOT = ['plate'];

/**
 * Which jobs a fork offers, keyed by the job that forks.
 *
 * Worked out from `next` rather than written down twice: any job that opens
 * more than one thing is a fork, and the strands are what it opens.
 */
export const FORKS = Object.fromEntries(
  JOBS.filter((j) => j.next.length > 1).map((j) => [j.id, j.next]));

/**
 * The strand a job starts, walked to its end.
 *
 * A strand runs from one of a fork's branches until it reaches a job that
 * something else also points at — which is the join, and belongs to the trunk.
 * Used by the board to print a branch as a branch rather than as loose slips.
 */
export const strandFrom = (id) => {
  const joins = new Set();
  const seen = new Set();
  for (const j of JOBS) for (const n of j.next) (seen.has(n) ? joins : seen).add(n);
  const out = [];
  let at = id;
  while (at && JOB_BY_ID[at] && !out.includes(at)) {
    out.push(at);
    const next = JOB_BY_ID[at].next;
    at = next.length === 1 && !joins.has(next[0]) ? next[0] : null;
  }
  return out;
};
/* ---------------------------------------------------------------- legacy */

/**
 * The old list, in the old order, frozen.
 *
 * Saves from before the board became a tree stored their place as a single
 * index into a flat array. That array no longer exists, so this is a copy of
 * it kept purely so a save can be told exactly which jobs it had already done
 * — see the migration in src/state.js. Nothing else may read it, and nothing
 * new should ever be added to it.
 */
export const LEGACY_ORDER = [
  'plate', 'open', 'serve', 'calm', 'wash', 'day2',
  'second', 'market', 'cheap', 'seats', 'decor', 'r1', 'finish', 'crew', 'learn', 'upgrade',
  'r2', 'machine', 'belt', 'intake', 'freefood', 'expand', 'refine', 'upmachine',
  'meet', 'like', 'hearts', 'vip', 'r3', 'hundred', 'gift', 'myth',
  'r4', 'lab', 'research', 'kilnup', 'class', 'forge', 'forge3', 'r5', 'terrace',
  'crew5', 'twelve', 'big', 'all', 'r6', 'thousand', 'r7',
];

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
  stocked: ['#btn-pantry', TAB('market')],
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
  S('s_serve', 'Serve 8 more guests', 8, 270, 10, (g) => g.state.stats.served),
  S('s_serve2', 'Serve 18 more guests', 18, 630, 22, (g) => g.state.stats.served),
  S('s_earn', 'Take another 400', 400, 300, 12, (g) => g.state.stats.earned),
  S('s_earn2', 'Take another 1,200', 1200, 1050, 30, (g) => g.state.stats.earned),
  S('s_calm', 'Cheer up 8 guests', 8, 220, 12, (g) => g.state.stats.calmed ?? 0),
  S('s_wash', 'Clear 8 tables', 8, 240, 9, (g) => g.state.stats.washed ?? 0),
  S('s_buy', 'Buy 8 crates', 8, 285, 10, (g) => g.state.stats.bought ?? 0),
  S('s_loved', 'Land 4 favourites', 4, 480, 18, (g) => g.state.stats.loved ?? 0),
  S('s_vip', 'Serve 2 more VIPs', 2, 570, 20, (g) => g.state.stats.vips ?? 0),
  S('s_days', 'Work 3 more days', 3, 390, 14, (g) => g.state.day),
  S('s_deliver', 'Take 25 off the belts', 25, 450, 16, (g) => g.state.stats.delivered ?? 0),
  S('s_hearts', 'Win 10 more hearts', 10, 510, 18, (g) => g.state.diaryHearts),
  S('s_pot', 'Practise pottery 25 times', 25, 420, 15, (g) => g.state.pottery),
  S('s_gift', 'Be given another present', 1, 630, 22, (g) => g.state.stats.gifts ?? 0),
];

export const SIDE_BY_ID = Object.fromEntries(SIDE.map((x) => [x.id, x]));
export const SIDE_SLOTS = 3;
