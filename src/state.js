// Save state plus the derived numbers the whole game reads off it.

import { Bus, clamp } from './core/util.js';
import { INGREDIENTS, DAILY_DELIVERY, MARKET_ORDER } from './data/ingredients.js';
import { RECIPE_BY_ID, priceAt, prepAt, starsAt } from './data/recipes.js';
import {
  FURNITURE_BY_ID, MACHINE_BY_ID, STYLE_BY_ID, STAFF_BY_ID,
  LEGACY_FURNITURE, LEGACY_STYLES, isSolid, mountOf,
} from './data/catalog.js';
import { rotOf } from './world/orient.js';
import {
  GIFTS, GUEST_BY_ID, HEART_STEPS, MAX_FRIEND, levelForHearts, tasteOf,
} from './data/guests.js';
import {
  RESEARCH_BY_ID, SHOP_BY_ID, dishPrice, dishStars, potteryLevel, wordOfMouth,
} from './data/progress.js';
import { RANKS, rankAt, rankProgress, toNextRank } from './data/fame.js';
import {
  KEYS, QUESTS, SIDE, SIDE_BY_ID, SIDE_SLOTS, STARTER_KEYS,
} from './data/quests.js';

const KEY = 'bubbleworks.harbor.save.v1';
const VERSION = 11;
export const SAVE_KEY = KEY;

function fresh() {
  return {
    v: VERSION,
    coins: 260,
    stars: 0,
    day: 1,
    phase: 'prep',
    pantry: { kelp: 30, milk: 26, potato: 18, clam: 10, rice: 12, egg: 10 },
    // One recipe. The whole first hour is turning that into two, and the
    // market sells everything, so it is a choice rather than a wait.
    unlocked: ['kelp_latte'],
    levels: {},
    menu: {},
    stock: {},
    staff: [],
    // the free starter kitchen: a pass, one table, two chairs
    furniture: [
      { c: 1, r: 1, id: 'pass_counter', style: 'plain', rot: 0 },
      { c: 4, r: 4, id: 'round_table', style: 'plain', rot: 0 },
      { c: 3, r: 4, id: 'chair', style: 'plain', rot: 0 },
      { c: 5, r: 4, id: 'chair', style: 'plain', rot: 0 },
    ],
    machines: [],
    // the long game — see data/progress.js
    diary: {},                       // species id -> { met, served, hearts, level, likeSeen, hateSeen }
    research: 0,
    researched: [],
    bought: [],                      // one-off shop purchases
    pottery: 0,                      // experience in the pottery class
    clay: 0,
    dishes: {},                      // recipe id -> forged serving-dish tier
    catch: null,                     // the day's catch — see rollCatch()
    market: null,                    // stall stock and prices — see rollMarket()
    settings: { sound: true, motion: true, tips: true },
    tutorial: { step: 0, done: false },
    auto: false,                     // keep the menu topped up from the larder
    story: { at: 0, seen: [] },      // how far the chef's story has got
    keys: [...STARTER_KEYS],         // which parts of the game are open — see data/quests.js
    side: { jobs: [] },              // three standing side jobs, see fillSide()
    favours: [],                     // what the room is asking for right now
    seenHelp: false,
    lastSeen: Date.now(),
    stats: {
      served: 0, walkouts: 0, earned: 0, best: 0, bought: 0,
      // the rest of the counters the job list reads. Every one of them is a
      // thing somebody has to be told to try at least once.
      cheap: 0, calmed: 0, washed: 0, delivered: 0,
      loved: 0, vips: 0, myths: 0, gifts: 0, favours: 0,
    },
  };
}

/**
 * Bring a v1 save onto the second art pack. Old furniture ids and finishes no
 * longer exist, and silently dropping them would empty the player's dining room,
 * so each is mapped to its closest new equivalent.
 */
function migrate(data) {
  data.furniture = (data.furniture ?? [])
    .map((f) => ({
      ...f,
      id: LEGACY_FURNITURE[f.id] ?? f.id,
      style: LEGACY_STYLES[f.style] ?? f.style ?? 'plain',
    }))
    .filter((f) => FURNITURE_BY_ID[f.id]);
  // Two legacy pieces can collapse onto one tile; keep the first of each. The
  // layer matters: a candlestick and the table it stands on share a tile on
  // purpose, so they are only rivals for the same spot within their own layer.
  const seen = new Set();
  data.furniture = data.furniture.filter((f) => {
    const k = `${f.c},${f.r}:${isSolid(FURNITURE_BY_ID[f.id]) ? 'floor' : 'over'}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Mirrors and key racks used to stand anywhere and take a tile; they hang on
  // a back wall now. One left in the middle of the floor would draw at wall
  // height over open floor, so it is walked to the nearest wall tile going free.
  const taken = new Set(data.furniture.map((f) => `${f.c},${f.r}`));
  for (const f of data.furniture) {
    if (mountOf(FURNITURE_BY_ID[f.id]) !== 'wall') continue;
    if (f.c === 0 || f.r === 0) continue;
    const wall = [];
    for (let i = 0; i < 13; i++) { wall.push({ c: 0, r: i }, { c: i, r: 0 }); }
    const free = wall
      .filter((w) => !taken.has(`${w.c},${w.r}`))
      .sort((a, b) => (Math.abs(a.c - f.c) + Math.abs(a.r - f.r))
        - (Math.abs(b.c - f.c) + Math.abs(b.r - f.r)))[0];
    if (!free) continue;
    taken.delete(`${f.c},${f.r}`);
    f.c = free.c; f.r = free.r;
    taken.add(`${f.c},${f.r}`);
  }
  // furniture used to store a mirror flag; it now stores one of four turns
  for (const f of data.furniture) { f.rot = rotOf(f); delete f.flip; }
  // everything the long game keeps track of, defaulted for an older save
  data.diary ??= {};
  delete data.flyer;   // the noticeboard is gone; see data/progress.js
  // Anyone who bought a flyer upgrade paid research points for it, so the
  // equivalents carry over rather than quietly vanishing. The satchel node has
  // no equivalent — there is no satchel — so its points come back instead.
  const RETIRED = { flyer_1: 'word_1', flyer_2: 'word_2', flyer_auto: 'word_3' };
  if (Array.isArray(data.researched)) {
    let refund = 0;
    const kept = new Set();
    for (const id of data.researched) {
      if (id === 'flyer_board') { refund += 12; continue; }
      kept.add(RETIRED[id] ?? id);
    }
    data.researched = [...kept].filter((id) => RESEARCH_BY_ID[id]);
    data.research = (data.research ?? 0) + refund;
  }
  data.research ??= 0;
  data.researched ??= [];
  data.bought ??= [];
  data.pottery ??= 0;
  data.clay ??= 0;
  data.dishes ??= {};
  data.catch ??= null;
  data.market ??= null;
  data.settings = { sound: true, motion: true, tips: true, ...(data.settings ?? {}) };
  data.tutorial ??= { step: 0, done: !!data.seenHelp };
  data.auto ??= false;
  data.stats = {
    served: 0, walkouts: 0, earned: 0, best: 0, bought: 0,
    cheap: 0, calmed: 0, washed: 0, delivered: 0,
    loved: 0, vips: 0, myths: 0, gifts: 0, favours: 0,
    ...(data.stats ?? {}),
  };
  data.story ??= { at: 0, seen: [] };
  // Keys were added in v10. An older save has already earned whatever its job
  // list says it has, so hand those over rather than taking buttons away from
  // somebody who has been using them for a week.
  if (!Array.isArray(data.keys)) {
    data.keys = [...STARTER_KEYS];
    const at = data.story.at ?? 0;
    for (const [questId, k] of Object.entries(KEYS)) {
      const i = QUESTS.findIndex((q) => q.id === questId);
      if (i >= 0 && at > i) data.keys.push(k.key);
    }
    // and anything the save is plainly already using, whatever the job list says
    if ((data.machines ?? []).length) data.keys.push('factory');
    if (Object.keys(data.diary ?? {}).length) data.keys.push('diary');
    if ((data.stats?.bought ?? 0) > 0) data.keys.push('market');
    if (Object.keys(data.dishes ?? {}).length || data.pottery > 0) data.keys.push('plates');
    data.keys = [...new Set(data.keys)];
  }
  data.side ??= { jobs: [] };
  data.favours = [];   // they belong to guests who are no longer in the room
  // the pens are gone, so their machines and the two recipes that needed them
  // would otherwise sit in the save as unbuildable tiles and unmakeable dishes
  data.machines = (data.machines ?? []).filter((m) => m.kind !== 'pen');
  data.unlocked = (data.unlocked ?? []).filter((id) => RECIPE_BY_ID[id]);
  delete data.pantry?.ham;
  delete data.pantry?.roe;
  for (const id of ['ham_steamer', 'roe_nigiri']) {
    delete data.menu?.[id]; delete data.stock?.[id];
    delete data.levels?.[id]; delete data.dishes?.[id];
  }
  // the potter's wheel is a building you place now, not a node you buy
  data.researched = (data.researched ?? []).filter((id) => id !== 'wheel');
  data.v = VERSION;
}

export class GameState {
  constructor(data) {
    Object.assign(this, data ?? fresh());
    this.bus = new Bus();
  }

  /* -------------------------------------------------------------- persist */

  static load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return new GameState();
      const data = JSON.parse(raw);
      if (!data?.v || data.v > VERSION) return new GameState();
      if (data.v < VERSION) migrate(data);
      // a save written mid-service resumes in prep so nothing is half-running
      if (data.phase !== 'prep') { data.phase = 'prep'; data.stock = {}; }
      return new GameState(data);
    } catch {
      return new GameState();
    }
  }

  save() {
    // strip runtime-only fields (sprite refs, springs, belt contents) so the
    // save stays small and reloads clean
    const data = {
      v: VERSION,
      coins: this.coins, stars: this.stars, day: this.day, phase: this.phase,
      pantry: this.pantry, unlocked: this.unlocked, levels: this.levels,
      menu: this.menu, stock: this.stock, staff: this.staff,
      seenHelp: this.seenHelp, stats: this.stats, lastSeen: this.lastSeen ?? Date.now(),
      diary: this.diary, research: this.research,
      researched: this.researched, bought: this.bought,
      pottery: this.pottery, clay: this.clay, dishes: this.dishes,
      catch: this.catch,
      market: this.market, settings: this.settings, tutorial: this.tutorial,
      auto: this.auto, story: this.story, side: this.side, keys: this.keys,
      furniture: this.furniture.map(({ c, r, id, style, rot }) => ({ c, r, id, style, rot })),
      machines: this.machines.map(({ c, r, kind, id, dir, level, buf }) =>
        ({ c, r, kind, id, dir, level, buf })),
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  }

  /**
   * A copy of everything that would be written to disk.
   *
   * The main menu runs the real game on a dressed set — real guests, real
   * money, a room nobody built — so it takes one of these first and hands it
   * straight back when you press the button. Deep, because half of the save is
   * objects and a shallow copy would let the set redecorate your restaurant.
   */
  snapshot() {
    const out = {};
    for (const [k, v] of Object.entries(this)) {
      if (k === 'bus') continue;
      out[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    return out;
  }

  /** Put a snapshot back and tell everybody. */
  restore(snap) {
    for (const [k, v] of Object.entries(snap)) this[k] = v;
    this.bus.emit('phase', this.phase);
    this.bus.emit('change');
  }

  /* ----------------------------------------------------------------- keys */

  /**
   * Is this part of the game open yet?
   *
   * Unknown keys read as open, deliberately: a feature that forgot to declare
   * itself should be reachable, not silently missing. Only the four in
   * data/quests.js are ever actually shut.
   */
  hasKey(key) { return !key || (this.keys ?? []).includes(key); }

  /** Hand one over. Returns false if they already had it. */
  grantKey(key) {
    this.keys ??= [];
    if (this.keys.includes(key)) return false;
    this.keys.push(key);
    this.save();
    this.bus.emit('change');
    return true;
  }

  /* ------------------------------------------------------------- currency */

  spend(n) {
    if (this.coins < n) return false;
    this.coins -= n;
    this.bus.emit('coins', -n);
    this.bus.emit('change');
    return true;
  }

  earn(n) {
    this.coins += n;
    this.stats.earned += n;
    this.bus.emit('coins', n);
    this.bus.emit('change');
  }

  /**
   * Fame. The same number reputation always was, with rungs on it now: every
   * rank puts something new on the shelf, so the game opens up as you cook
   * rather than as you save. Crossing a rung is announced, once.
   */
  addStars(n) {
    const was = this.rank;
    this.stars = Math.max(0, this.stars + n);
    this.bus.emit('change');
    if (this.rank > was) this.bus.emit('rank', this.rank);
  }

  get fame() { return this.stars; }
  get rank() { return rankAt(this.stars); }
  get rankName() { return RANKS[this.rank].name; }
  get rankUp() { return toNextRank(this.stars); }
  get rankPct() { return rankProgress(this.stars); }

  /** Is this thing on the shelf yet? Everything buyable answers to this. */
  open(item) { return (item?.rank ?? 0) <= this.rank; }

  /** What it takes, for the label on a locked card. */
  rankNeeded(item) { return RANKS[item?.rank ?? 0]?.name ?? ''; }

  /* --------------------------------------------------------------- pantry */

  have(id) { return this.pantry[id] ?? 0; }

  addIng(id, qty = 1) {
    if (!INGREDIENTS[id]) return;
    this.pantry[id] = (this.pantry[id] ?? 0) + qty;
    this.bus.emit('pantry', { id, qty });
    this.bus.emit('change');
  }

  takeIng(id, qty = 1) {
    if ((this.pantry[id] ?? 0) < qty) return false;
    this.pantry[id] -= qty;
    if (this.pantry[id] <= 0) delete this.pantry[id];
    this.bus.emit('pantry', { id, qty: -qty });
    this.bus.emit('change');
    return true;
  }

  /** Can the pantry cover this {id: qty} bill? */
  hasAll(bill) { return Object.entries(bill).every(([id, q]) => this.have(id) >= q); }

  payIng(bill) {
    if (!this.hasAll(bill)) return false;
    for (const [id, q] of Object.entries(bill)) this.takeIng(id, q);
    return true;
  }

  /** How many servings of a recipe the pantry could cover right now. */
  servingsPossible(recipeId) {
    const rec = RECIPE_BY_ID[recipeId];
    if (!rec) return 0;
    let n = Infinity;
    for (const [id, q] of Object.entries(rec.ing)) n = Math.min(n, Math.floor(this.have(id) / q));
    return Number.isFinite(n) ? n : 0;
  }

  /* -------------------------------------------------------------- recipes */

  levelOf(id) { return this.levels[id] ?? 1; }
  isUnlocked(id) { return this.unlocked.includes(id); }
  unlock(id) { if (!this.isUnlocked(id)) { this.unlocked.push(id); this.bus.emit('change'); } }

  /** Price a guest pays, with any forged serving dish folded in. */
  priceOf(id) {
    const r = RECIPE_BY_ID[id];
    if (!r) return 0;
    const tier = this.dishTier(id);
    // a glaze kiln on the floor is worth 15% on anything already forged
    const glaze = tier > 0 && this.hasGlaze ? 1.15 : 1;
    return Math.round(priceAt(r, this.levelOf(id)) * dishPrice(tier) * glaze);
  }
  prepOf(id) { const r = RECIPE_BY_ID[id]; return r ? prepAt(r, this.levelOf(id)) : 3; }
  starsOf(id) {
    const r = RECIPE_BY_ID[id];
    return r ? starsAt(r, this.levelOf(id)) + dishStars(this.dishTier(id)) : 1;
  }

  /* ---------------------------------------------------------------- staff */

  hasStaff(id) { return this.staff.includes(id); }
  hire(id) { if (!this.hasStaff(id)) { this.staff.push(id); this.bus.emit('change'); } }

  #staffSum(effect) {
    return this.staff.reduce((n, id) => {
      const s = STAFF_BY_ID[id];
      return s?.effect === effect ? n + (s.amount ?? 1) : n;
    }, 0);
  }

  /* --------------------------------------------------------------- derived */

  /**
   * Ambience — the star total of everything placed in the dining room. Drives
   * arrival rate, patience, tips and the stars each guest leaves behind.
   */
  get ambience() {
    let n = 0;
    for (const f of this.furniture) {
      const item = FURNITURE_BY_ID[f.id];
      if (!item) continue;
      n += item.star + (STYLE_BY_ID[f.style]?.star ?? 0);
    }
    return n;
  }

  /** 1..5 display rating, from ambience. */
  get rating() { return clamp(1 + Math.floor(this.ambience / 12), 1, 5); }

  get tipMult() {
    let m = 1 + this.#staffSum('tips');
    if (this.hasResearch('money_1')) m *= 1.15;
    if (this.hasResearch('money_2')) m *= 1.25;
    for (const f of this.furniture) {
      const item = FURNITURE_BY_ID[f.id];
      if (item?.tipRoom) m *= item.tipRoom;
      if (item?.tip) m *= 1 + (item.tip - 1) * 0.25;
      const st = STYLE_BY_ID[f.style];
      if (item?.kind === 'table' && st) m *= 1 + (st.tip - 1) * 0.18;
    }
    return m;
  }

  get patienceMult() {
    let m = 1 + Math.min(0.5, this.ambience * 0.008);
    for (const f of this.furniture) {
      const item = FURNITURE_BY_ID[f.id];
      if (item?.patienceRoom) m *= item.patienceRoom;
    }
    return m;
  }

  /**
   * Seconds between guest arrivals.
   *
   * The room does the work: how nice it is, how well known you are, the pieces
   * that draw people in, and what the harbour has been told about you. Not one
   * term of it is a button you hold down.
   */
  get arrivalGap() {
    let draw = this.wordDraw;
    for (const f of this.furniture) draw += FURNITURE_BY_ID[f.id]?.draw ?? 0;
    const base = 6.2 / (1 + this.ambience * 0.02 + draw + Math.min(1.2, this.stars * 0.0025));
    return clamp(base, 1.0, 5.5);
  }

  /** How hard the harbour pulls in rare guests. */
  get rarityPull() {
    let pull = Math.min(1.4, this.stars * 0.0015) + 0.25;
    if (this.hasResearch('word_3')) pull += 0.6;
    if (this.hasResearch('money_2')) pull += 0.5;
    return pull;
  }

  get orderSpeed() {
    let m = 1;
    for (const f of this.furniture) {
      const o = FURNITURE_BY_ID[f.id]?.order;
      if (o) m *= o;
    }
    return m;
  }

  get cookSlots() { return 1 + this.#staffSum('cookSlot'); }
  get factorySpeed() {
    let m = 1 + this.#staffSum('factorySpeed');
    if (this.hasResearch('speed_1')) m *= 1.15;
    if (this.hasResearch('speed_2')) m *= 1.2;
    return m;
  }
  /** Buffer depth on a refiner, so a fed line does not stall. */
  get bufferSize() { return this.hasResearch('belt_smart') ? 8 : 4; }
  get bonusStar() { return this.#staffSum('bonusStar'); }
  get autoSeat() { return this.hasStaff('oyster_host'); }
  get autoServe() { return this.hasStaff('cuttlefish_server'); }
  /**
   * How long a table sits dirty after a guest leaves. Five seconds by default —
   * long enough that clearing tables is visibly part of the job, short enough
   * that it never becomes the bottleneck. The dishwasher and the deep sink both
   * cut into it.
   */
  get cleanTime() {
    let t = 5;
    if (this.hasResearch('quick_wash')) t *= 0.5;
    if (this.hasStaff('sea_lion_dish')) t *= 0.2;
    return t;
  }

  /* --------------------------------------------------------------- diary  */

  /** A guest's page, created blank the first time they walk in. */
  page(speciesId) {
    return (this.diary[speciesId] ??= {
      met: 0, served: 0, hearts: 0, level: 1, likeSeen: false, hateSeen: false, gifts: 0,
    });
  }

  noteArrival(speciesId) {
    const p = this.page(speciesId);
    p.met += 1;
    this.bus.emit('change');
  }

  /**
   * Record a meal. Serving a guest's favourite flavour is worth several hearts
   * and reveals that half of their page; serving the one they can't stand costs
   * a heart and reveals the other half. That is the whole loop — the diary
   * fills in because you experimented, not because you waited.
   *
   * @returns {{hearts:number, mood:'loved'|'fine'|'hated', levelled:number|null}}
   */
  noteServed(speciesId, recipeId, rarity = 1) {
    const p = this.page(speciesId);
    const guest = GUEST_BY_ID[speciesId];
    const taste = tasteOf(recipeId);
    let mood = 'fine';
    let hearts = 1;
    if (guest && taste === guest.loves) { mood = 'loved'; hearts = 3; p.likeSeen = true; }
    else if (guest && taste === guest.loathes) { mood = 'hated'; hearts = -1; p.hateSeen = true; }

    hearts = Math.round(hearts * rarity);
    p.served += 1;
    p.hearts = Math.max(0, p.hearts + hearts);

    const was = p.level;
    p.level = levelForHearts(p.hearts);
    const levelled = p.level > was ? p.level : null;
    if (levelled) p.gifts = Math.max(p.gifts, p.level - 1);

    this.bus.emit('change');
    return { hearts, mood, levelled };
  }

  /** The present a guest hands over on reaching a friendship level. */
  claimGift(level) {
    const gift = GIFTS[level - 1];
    if (!gift) return null;
    if (gift.kind === 'coins') this.earn(gift.amount);
    if (gift.kind === 'clay') { this.clay += gift.amount; this.bus.emit('change'); }
    if (gift.kind === 'research') this.addResearch(gift.amount);
    return gift;
  }

  get diaryFound() { return Object.keys(this.diary).length; }
  get diaryHearts() {
    return Object.values(this.diary).reduce((n, p) => n + (p.hearts ?? 0), 0);
  }

  /* --------------------------------------------------------- word of mouth */

  /**
   * How hard the harbour pulls people through your door.
   *
   * Nobody taps for this any more — see wordOfMouth in data/progress.js for why
   * the noticeboard went. A promo stand or a broadcast set in the works still
   * counts, because those are machines doing the shouting rather than you.
   */
  get wordDraw() {
    let draw = wordOfMouth(this);
    draw += this.machines.filter((m) => m.id === 'promo_stand').length * 0.4;
    draw += this.machines.filter((m) => m.id === 'broadcast').length * 0.9;
    for (const id of this.staff) {
      const st = STAFF_BY_ID[id];
      if (st?.effect === 'word') draw += st.amount ?? 0;
    }
    return draw;
  }

  /* ------------------------------------------------------------ research  */

  hasResearch(id) { return this.researched.includes(id); }

  addResearch(n) {
    this.research += n;
    this.bus.emit('change');
  }

  canResearch(id) {
    const node = RESEARCH_BY_ID[id];
    if (!node || this.hasResearch(id)) return false;
    if (node.needs && !this.hasResearch(node.needs)) return false;
    return this.research >= node.cost;
  }

  buyResearch(id) {
    if (!this.canResearch(id)) return false;
    this.research -= RESEARCH_BY_ID[id].cost;
    this.researched.push(id);
    this.bus.emit('change');
    this.save();
    return true;
  }

  /* ---------------------------------------------------------------- shop  */

  hasBought(id) { return this.bought.includes(id); }

  canBuy(id) {
    const item = SHOP_BY_ID[id];
    if (!item || this.hasBought(id)) return false;
    if (item.needs && !this.hasBought(item.needs)) return false;
    return this.coins >= item.cost;
  }

  buyShop(id) {
    if (!this.canBuy(id)) return false;
    if (!this.spend(SHOP_BY_ID[id].cost)) return false;
    this.bought.push(id);
    this.bus.emit('shop', id);
    this.bus.emit('change');
    this.save();
    return true;
  }

  /** Dining room size, which the area unlocks widen. */
  get roomSize() {
    let size = 9;
    for (const id of this.bought) size = Math.max(size, SHOP_BY_ID[id]?.size ?? 0);
    return size;
  }

  /* ------------------------------------------------------------- pottery  */

  get potteryLv() { return potteryLevel(this.pottery); }

  addPottery(n) {
    this.pottery += Math.round(n * (this.hasResearch('kiln_1') ? 2 : 1));
    this.bus.emit('change');
  }

  addClay(n) {
    this.clay += n;
    this.bus.emit('change');
  }

  /** Is a given kind of pottery machine standing on the factory floor? */
  hasWorks(kind) {
    return this.machines.some((m) => MACHINE_BY_ID[m.id]?.kind === kind);
  }

  /**
   * The kiln, the wheel and the glaze kiln are buildings now. That is the point:
   * the pottery class used to be a panel that appeared out of nowhere, and a
   * trade you can see on the floor is a trade you remember you have.
   */
  get hasKiln() { return this.hasWorks('kiln'); }
  get hasWheel() { return this.hasWorks('wheel'); }
  get hasGlaze() { return this.hasWorks('glaze'); }

  dishTier(recipeId) { return this.dishes[recipeId] ?? 0; }
  setDishTier(recipeId, tier) {
    this.dishes[recipeId] = tier;
    this.bus.emit('change');
    this.save();
  }

  /* -------------------------------------------------------------- settings */

  /**
   * Player preferences. Small, but they have to survive a reload, so they live
   * in the save beside everything else rather than in their own key.
   */
  setSetting(key, on) {
    this.settings = { ...this.settings, [key]: !!on };
    this.bus.emit('settings', this.settings);
    this.bus.emit('change');
    this.save();
  }

  get motionOn() { return this.settings?.motion !== false; }
  get tipsOn() { return this.settings?.tips !== false; }

  /* --------------------------------------------------------- the day's catch */

  /**
   * What came off the boats this morning. Three things cheap and one dish the
   * harbour has a taste for today, rolled once per day and shown when the day
   * starts — so opening up begins with reading the market rather than tapping
   * the same button you tapped yesterday.
   */
  rollCatch(rand = Math.random) {
    const pool = MARKET_ORDER.slice();
    const cheap = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      cheap.push(...pool.splice((rand() * pool.length) | 0, 1));
    }
    const dishes = this.unlocked.filter((id) => RECIPE_BY_ID[id]);
    const star = dishes.length ? dishes[(rand() * dishes.length) | 0] : null;
    this.catch = { day: this.day, cheap, star, seen: false };
    return this.catch;
  }

  /* ------------------------------------------------------------- the market */

  /**
   * The stall restocks on the hour, and its prices move with it.
   *
   * A fixed price list made the market a vending machine: there was never a
   * reason to look at it twice. Now every crate has a number of them and a price
   * that has drifted up or down since the last delivery, so buying cheap and
   * buying early are both worth doing — and the day's catch lands on top as the
   * deepest cut of the lot.
   */
  get marketHour() { return Math.floor(Date.now() / 3600000); }

  /** Roll a fresh delivery. Returns the new stall. */
  rollMarket(rand = Math.random) {
    const stock = {};
    const price = {};
    for (const id of MARKET_ORDER) {
      const base = INGREDIENTS[id].price;
      // Cheap staples come in by the crate, the pricey catch in ones and twos —
      // but a "crate" of four was not a crate. The whole point of the market is
      // that you can go and buy a day's worth of something.
      const plenty = Math.max(6, Math.round(90 / Math.max(2, base)));
      stock[id] = plenty + Math.floor(rand() * plenty);
      // ±35%, quantised to whole sand dollars, never free
      const swing = 0.65 + rand() * 0.7;
      price[id] = Math.max(1, Math.round(base * swing));
    }
    this.market = { hour: this.marketHour, stock, price };
    return this.market;
  }

  /** The stall as it stands, rolling a delivery if the hour has turned. */
  get stall() {
    if (!this.market || this.market.hour !== this.marketHour) {
      const fresh = this.rollMarket();
      this.bus.emit('market', fresh);
      return fresh;
    }
    return this.market;
  }

  /** Minutes until the next delivery. */
  get marketIn() {
    return Math.max(0, 60 - Math.floor((Date.now() % 3600000) / 60000));
  }

  marketStock(id) { return this.stall.stock[id] ?? 0; }

  /** What a crate costs right now, catch discount and all. */
  catchPrice(id) {
    const base = this.stall.price[id] ?? INGREDIENTS[id]?.price ?? 0;
    return this.catch?.cheap?.includes(id) ? Math.max(1, Math.round(base * 0.6)) : base;
  }

  /** How far off the usual price this is, as a signed fraction. */
  priceDrift(id) {
    const base = INGREDIENTS[id]?.price ?? 0;
    if (!base) return 0;
    return (this.catchPrice(id) - base) / base;
  }

  /** Buy `n` crates if the stall has them and the till can cover it. */
  buyFromMarket(id, n = 1) {
    const have = this.marketStock(id);
    if (have <= 0) return 0;
    const take = Math.min(n, have);
    const total = this.catchPrice(id) * take;
    if (!this.spend(total)) return 0;
    this.market.stock[id] = have - take;
    this.stats.bought = (this.stats.bought ?? 0) + take;
    if (this.catch?.cheap?.includes(id)) this.stats.cheap = (this.stats.cheap ?? 0) + take;
    this.addIng(id, take);
    this.save();
    return take;
  }

  /** The dish the harbour is asking for today pays over the odds. */
  get catchDish() { return this.catch?.star ?? null; }
  catchBonus(recipeId) { return this.catchDish === recipeId ? 1.3 : 1; }

  /* ----------------------------------------------------------- day cycle  */

  /** Total planned servings on the menu. */
  get plannedCount() { return Object.values(this.menu).reduce((a, b) => a + b, 0); }
  get stockCount() { return Object.values(this.stock).reduce((a, b) => a + b, 0); }

  /** Dishes still available to order, with their live price. */
  availableDishes() {
    return Object.entries(this.stock)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, left: n, price: this.priceOf(id), stars: this.starsOf(id) }));
  }

  /**
   * Plate one more of a dish, straight from the larder, mid-service.
   *
   * This is what the auto switch runs on. Nothing about it is free: the
   * ingredients come out of the larder the same as they would in the morning,
   * so the ceiling on a day is still what you have in stock — it is only the
   * standing at the counter that goes away.
   */
  plateOne(id) {
    const r = RECIPE_BY_ID[id];
    if (!r || !this.isUnlocked(id)) return false;
    if (!this.payIng(r.ing)) return false;
    this.stock[id] = (this.stock[id] ?? 0) + 1;
    this.menu[id] = (this.menu[id] ?? 0) + 1;
    return true;
  }

  /** Top the menu back up. Returns how many went on. */
  topUp() {
    if (!this.auto || this.phase !== 'open') return 0;
    let made = 0;
    for (const id of Object.keys(this.menu)) {
      if ((this.stock[id] ?? 0) > 0) continue;
      if (this.plateOne(id)) made += 1;
    }
    if (made) this.bus.emit('change');
    return made;
  }

  /* -------------------------------------------------------------- favours */

  /**
   * Somebody in the room has asked for something.
   *
   * A favour is a side job you did not go looking for: one guest in twenty
   * walks in wanting one particular dish, and bringing it pays over the odds
   * and in hearts. They are kept on the save only so the Jobs book can list
   * them by name while they are sitting there — they die with the guest.
   */
  noteFavour(guest) {
    this.favours ??= [];
    if (this.favours.some((f) => f.id === guest.id)) return;
    this.favours.push({
      id: guest.id,
      who: guest.who,
      species: guest.species,
      dish: guest.favour.dish,
      coins: guest.favour.coins,
      fame: guest.favour.fame,
    });
    this.bus.emit('change');
  }

  clearFavour(id) {
    this.favours = (this.favours ?? []).filter((f) => f.id !== id);
    this.bus.emit('change');
  }

  /** Hearts straight into somebody's diary page, outside of a meal. */
  addHearts(speciesId, n) {
    const p = this.page(speciesId);
    p.hearts = (p.hearts ?? 0) + n;
    p.level = levelForHearts(p.hearts);
    this.bus.emit('change');
  }

  /* ------------------------------------------------------------ side jobs */

  /**
   * Keep three side jobs on the go.
   *
   * Each one remembers what its counter read when it was handed out, so the
   * same job can come round again and still mean "ten *more* guests" rather
   * than "ten guests, which you passed on Tuesday".
   */
  fillSide(game) {
    this.side ??= { jobs: [] };
    const taken = new Set(this.side.jobs.map((j) => j.id));
    let added = 0;
    while (this.side.jobs.length < SIDE_SLOTS) {
      const pool = SIDE.filter((x) => !taken.has(x.id));
      if (!pool.length) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      taken.add(pick.id);
      this.side.jobs.push({ id: pick.id, from: pick.count(game) | 0 });
      added += 1;
    }
    return added;
  }

  /** Take a finished side job off the board and draw another. */
  clearSide(id, game) {
    this.side.jobs = (this.side.jobs ?? []).filter((j) => j.id !== id);
    this.fillSide(game);
    this.save();
  }

  /** Roll the planned menu into live stock and start service. */
  openDoors() {
    this.stock = {};
    for (const [id, qty] of Object.entries(this.menu)) if (qty > 0) this.stock[id] = qty;
    this.phase = 'open';
    this.bus.emit('phase', 'open');
    this.bus.emit('change');
  }

  closeDoors() {
    this.phase = 'report';
    this.bus.emit('phase', 'report');
    this.bus.emit('change');
  }

  /**
   * Advance to tomorrow: clear the menu and drop off the morning delivery.
   *
   * The delivery is a real crate — see DAILY_DELIVERY. A morning that hands you
   * two dishes' worth of ingredients is a morning spent shopping rather than
   * cooking, which is the wrong game.
   */
  nextDay() {
    this.day += 1;
    this.phase = 'prep';
    this.menu = {};
    this.stock = {};
    this.favours = [];   // the room emptied; nobody is asking for anything
    this.rollCatch();
    for (const [id, qty] of Object.entries(DAILY_DELIVERY)) this.addIng(id, qty);
    this.bus.emit('phase', 'prep');
    this.bus.emit('change');
    this.save();
  }
}
