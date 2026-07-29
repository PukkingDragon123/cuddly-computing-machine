// Save state plus the derived numbers the whole game reads off it.

import { Bus, clamp } from './core/util.js';
import { INGREDIENTS, DAILY_DELIVERY } from './data/ingredients.js';
import { RECIPE_BY_ID, priceAt, prepAt, starsAt } from './data/recipes.js';
import {
  FURNITURE_BY_ID, STYLE_BY_ID, STAFF_BY_ID, LEGACY_FURNITURE, LEGACY_STYLES,
} from './data/catalog.js';
import { seatSideFor, seatTilesOf } from './world/seating.js';

const KEY = 'bubbleworks.harbor.save.v1';
const VERSION = 3;
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
      { c: 1, r: 1, id: 'pass_counter', style: 'plain', flip: false },
      { c: 4, r: 4, id: 'round_table', style: 'plain', flip: false },
      { c: 3, r: 4, id: 'chair', style: 'plain', flip: false },
      { c: 4, r: 3, id: 'chair', style: 'plain', flip: false },
    ],
    machines: [],
    seenHelp: false,
    lastSeen: Date.now(),
    stats: { served: 0, walkouts: 0, earned: 0, best: 0 },
  };
}

/**
 * v2 -> v3. Seating moved to the sides of a table the chair art can honestly
 * face, which leaves chairs on the far sides as decor. Rather than quietly cost
 * the player seats, walk each one round to a free side that still works.
 */
function reseat(furniture) {
  const taken = new Set(furniture.map((f) => `${f.c},${f.r}`));
  const tables = furniture.filter((f) => FURNITURE_BY_ID[f.id]?.kind === 'table');
  for (const f of furniture) {
    if (FURNITURE_BY_ID[f.id]?.kind !== 'seat') continue;
    const table = tables.find((t) => Math.abs(t.c - f.c) + Math.abs(t.r - f.r) <= 2);
    if (!table || seatSideFor(f.c, f.r, table)) continue;
    const spot = seatTilesOf(table).find((s) => !taken.has(`${s.c},${s.r}`));
    if (!spot) continue;
    taken.delete(`${f.c},${f.r}`);
    taken.add(`${spot.c},${spot.r}`);
    f.c = spot.c; f.r = spot.r;
  }
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
  reseat(data.furniture);
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
      furniture: this.furniture.map(({ c, r, id, style, flip }) => ({ c, r, id, style, flip })),
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

  priceOf(id) { const r = RECIPE_BY_ID[id]; return r ? priceAt(r, this.levelOf(id)) : 0; }
  prepOf(id) { const r = RECIPE_BY_ID[id]; return r ? prepAt(r, this.levelOf(id)) : 3; }
  starsOf(id) { const r = RECIPE_BY_ID[id]; return r ? starsAt(r, this.levelOf(id)) : 1; }

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

  /** Seconds between guest arrivals during service. */
  get arrivalGap() {
    let draw = 0;
    for (const f of this.furniture) draw += FURNITURE_BY_ID[f.id]?.draw ?? 0;
    const base = 6.2 / (1 + this.ambience * 0.02 + draw + Math.min(1.2, this.stars * 0.0025));
    return clamp(base, 1.5, 7);
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
  get factorySpeed() { return 1 + this.#staffSum('factorySpeed'); }
  get bonusStar() { return this.#staffSum('bonusStar'); }
  get autoSeat() { return this.hasStaff('oyster_host'); }
  get autoServe() { return this.hasStaff('cuttlefish_server'); }
  get cleanTime() { return this.hasStaff('sea_lion_dish') ? 0.5 : 2.4; }

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

  /** Advance to tomorrow: clear the menu, drop the morning delivery. */
  nextDay() {
    this.day += 1;
    this.phase = 'prep';
    this.menu = {};
    this.stock = {};
    for (const [id, qty] of Object.entries(DAILY_DELIVERY)) this.addIng(id, qty);
    this.bus.emit('phase', 'prep');
    this.bus.emit('change');
    this.save();
  }
}
