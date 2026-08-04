// Save state plus the derived numbers the whole game reads off it.

import { Bus, clamp } from './core/util.js';
import { INGREDIENTS, DAILY_DELIVERY, MARKET_ORDER } from './data/ingredients.js';
import { RECIPE_BY_ID, priceAt, prepAt, starsAt } from './data/recipes.js';
import {
  FURNITURE_BY_ID, MACHINE_BY_ID, STYLE_BY_ID, STAFF_BY_ID,
  LEGACY_FURNITURE, LEGACY_STYLES,
} from './data/catalog.js';
import { rotOf } from './world/orient.js';
import {
  GIFTS, GUEST_BY_ID, HEART_STEPS, MAX_FRIEND, levelForHearts, tasteOf,
} from './data/guests.js';
import {
  FLYER_BASE_MAX, FLYER_TAPS, RESEARCH_BY_ID, SHOP_BY_ID, dishPrice, dishStars,
  flyerDraw, potteryLevel,
} from './data/progress.js';

const KEY = 'bubbleworks.harbor.save.v1';
const VERSION = 6;
export const SAVE_KEY = KEY;

function fresh() {
  return {
    v: VERSION,
    coins: 320,
    stars: 0,
    day: 1,
    phase: 'prep',
    pantry: { kelp: 8, egg: 4, milk: 6, flour: 3, butter: 2, scallop: 3, potato: 4, clam: 2 },
    unlocked: ['kelp_ramen', 'scallop_tart', 'kelp_latte'],
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
    flyer: { taps: 0, posters: 0 },  // posters go up before the doors open
    research: 0,
    researched: [],
    bought: [],                      // one-off shop purchases
    pottery: 0,                      // experience in the pottery class
    clay: 0,
    dishes: {},                      // recipe id -> forged serving-dish tier
    catch: null,                     // the day's catch — see rollCatch()
    seenHelp: false,
    lastSeen: Date.now(),
    stats: { served: 0, walkouts: 0, earned: 0, best: 0 },
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
  // two legacy pieces can collapse onto one tile; keep the first of each
  const seen = new Set();
  data.furniture = data.furniture.filter((f) => {
    const k = `${f.c},${f.r}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // furniture used to store a mirror flag; it now stores one of four turns
  for (const f of data.furniture) { f.rot = rotOf(f); delete f.flip; }
  // everything the long game keeps track of, defaulted for an older save
  data.diary ??= {};
  data.flyer ??= { taps: 0, posters: 0 };
  data.research ??= 0;
  data.researched ??= [];
  data.bought ??= [];
  data.pottery ??= 0;
  data.clay ??= 0;
  data.dishes ??= {};
  data.catch ??= null;
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
      diary: this.diary, flyer: this.flyer, research: this.research,
      researched: this.researched, bought: this.bought,
      pottery: this.pottery, clay: this.clay, dishes: this.dishes,
      catch: this.catch,
      furniture: this.furniture.map(({ c, r, id, style, rot }) => ({ c, r, id, style, rot })),
      machines: this.machines.map(({ c, r, kind, id, dir, level, buf }) =>
        ({ c, r, kind, id, dir, level, buf })),
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
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

  addStars(n) {
    this.stars = Math.max(0, this.stars + n);
    this.bus.emit('change');
  }

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
   * Seconds between guest arrivals. Posters are the biggest term by design:
   * a room full of lovely furniture still sits empty if nobody put the word out.
   */
  get arrivalGap() {
    let draw = flyerDraw(this.posters);
    for (const f of this.furniture) draw += FURNITURE_BY_ID[f.id]?.draw ?? 0;
    if (this.hasResearch('lantern_string')) draw += 0.2;
    const base = 6.2 / (1 + this.ambience * 0.02 + draw + Math.min(1.2, this.stars * 0.0025));
    return clamp(base, 1.2, 7);
  }

  /** How hard the harbour pulls in rare guests. */
  get rarityPull() {
    let pull = Math.min(1.4, this.stars * 0.0015) + this.posters * 0.06;
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

  /* -------------------------------------------------------------- flyers  */

  /** Taps to finish one poster, after research and crew have had their say. */
  get flyerTaps() {
    let n = FLYER_TAPS;
    if (this.hasResearch('flyer_1')) n -= 2;
    if (this.hasResearch('flyer_2')) n -= 3;
    if (this.hasStaff('gull_courier')) n -= 3;
    return Math.max(1, n);
  }

  get flyerMax() {
    let n = FLYER_BASE_MAX;
    if (this.hasResearch('flyer_2')) n += 2;
    if (this.hasResearch('flyer_board')) n += 4;
    n += this.machines.filter((m) => m.id === 'promo_stand' || m.id === 'broadcast').length * 2;
    return n;
  }

  get posters() { return this.flyer?.posters ?? 0; }
  get autoPost() { return this.hasResearch('flyer_auto'); }

  /** One tap on the flyer. Returns true when that finished a poster. */
  tapFlyer() {
    const f = this.flyer;
    if (f.posters >= this.flyerMax) return false;
    f.taps += 1;
    if (f.taps < this.flyerTaps) { this.bus.emit('change'); return false; }
    f.taps = 0;
    f.posters += 1;
    this.bus.emit('change');
    return true;
  }

  addPoster() {
    if (this.flyer.posters >= this.flyerMax) return false;
    this.flyer.posters += 1;
    this.flyer.taps = 0;
    this.bus.emit('change');
    return true;
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

  /** Today's market discount on an ingredient, as a multiplier. */
  catchPrice(id) {
    const base = INGREDIENTS[id]?.price ?? 0;
    return this.catch?.cheap?.includes(id) ? Math.max(1, Math.round(base * 0.6)) : base;
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
   * Advance to tomorrow: clear the menu, drop the morning delivery, and take
   * yesterday's flyers down. Reposting every morning is the chore the whole
   * automation ladder exists to take off your hands — a promo stand or the
   * Paste Crew quietly puts them back up while you do something else.
   */
  nextDay() {
    this.day += 1;
    this.phase = 'prep';
    this.menu = {};
    this.stock = {};
    this.flyer = { taps: 0, posters: 0 };
    this.rollCatch();
    for (const [id, qty] of Object.entries(DAILY_DELIVERY)) this.addIng(id, qty);
    this.bus.emit('phase', 'prep');
    this.bus.emit('change');
    this.save();
  }
}
