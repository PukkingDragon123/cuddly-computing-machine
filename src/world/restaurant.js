// The dining room: build grid, seating, the service loop, and everything the
// player taps during a shift.

import { FURN_SCALE, HALF_H, depthOf, tileAt, toScreen } from './iso.js';
import { Room } from './room.js';
import { ROT_COUNT, artFor, mirrorAt, rotOf, rotationToward } from './orient.js';
import { Fx } from '../gfx/fx.js';
import { Kitchen } from './kitchen.js';
import { spring } from '../core/tween.js';
import { CS, Customer, rollGuest } from './customer.js';
import { TAU, clamp, money, neighbours, range, rnd, tileDist, uid } from '../core/util.js';
import { FURNITURE_BY_ID, STYLE_BY_ID, groupFor } from '../data/catalog.js';
import { GUEST_BY_ID, RARITY_BY_ID } from '../data/guests.js';
import { plateFor } from '../data/progress.js';
import {
  blueprint, drawIcon, drawSprite, ellipse, ring, squash, sticker, text,
} from '../gfx/paint.js';

export { FURN_SCALE };

const PATIENCE_BASE = { [CS.QUEUE]: 26, [CS.ORDER]: 22, [CS.WAIT]: 36 };

export class Restaurant {
  constructor(game) {
    this.game = game;
    this.assets = game.assets;
    this.state = game.state;
    this.fx = new Fx();   // each zone keeps its own particles
    this.sfx = game.sfx;
    this.tweens = game.tweens;

    this.cols = 9;
    this.rows = 9;
    this.room = new Room(this.assets, { kind: 'cafe', cols: this.cols, rows: this.rows });

    this.grid = new Map();       // "c,r" -> furniture record
    this.tables = [];
    this.seats = [];             // { c, r, f, table, taken, dirty }
    this.passes = [];
    this.kitchen = new Kitchen(this);
    this.guests = [];

    this.ghost = null;           // { id, style, rot, c, r, ok }
    this.selection = null;       // { c, r } furniture inspector target
    this.spawnT = 0;
    this.autoSeatT = 0;
    this.autoServeT = 0;
    this.served = 0;
    this.earned = 0;
    this.walkouts = 0;
    this.starsToday = 0;

    this.#computeEntry();
    this.rebuild();
  }

  /* ------------------------------------------------------------- structure */

  #computeEntry() {
    const p = this.room.entryPoint();
    const t = tileAt(p.x, p.y + HALF_H);
    this.entry = { c: clamp(t.c, 0, this.cols - 1), r: clamp(t.r, 0, this.rows - 1) };
    this.entryWorld = p;
  }

  key(c, r) { return `${c},${r}`; }
  at(c, r) { return this.grid.get(this.key(c, r)) ?? null; }

  /** Re-index furniture and work out which chairs belong to which table. */
  rebuild() {
    this.grid.clear();
    for (const f of this.state.furniture) {
      f.item = FURNITURE_BY_ID[f.id];
      if (!f.item) continue;
      f.rot = rotOf(f);
      f.nudge = null;
      f.style = f.style ?? 'plain';
      f.uid ??= uid('f');
      f.sq ??= { value: 1, vel: 0 };
      this.grid.set(this.key(f.c, f.r), f);
    }

    // carry seat occupancy across the rebuild so nobody is thrown out mid-meal
    const prevSeats = new Map((this.seats ?? []).map((s) => [this.key(s.c, s.r), s]));
    this.tables = [];
    this.seats = [];
    this.passes = [];

    for (const f of this.grid.values()) {
      if (f.item.kind === 'pass') this.passes.push(f);
      if (f.item.kind === 'table') this.tables.push({ f, c: f.c, r: f.r, seats: [] });
    }
    for (const f of this.grid.values()) {
      if (f.item.kind !== 'seat') continue;
      const table = this.tables.find((t) => neighbours(t).some((n) => n.c === f.c && n.r === f.r));
      const old = prevSeats.get(this.key(f.c, f.r));
      const seat = {
        c: f.c, r: f.r, f, table: table ?? null,
        taken: old?.taken ?? null,
        dirty: old?.dirty ?? 0, dirtyMax: old?.dirtyMax ?? 0,
        soil: old?.soil ?? null, washT: old?.washT ?? 0,
      };
      this.seats.push(seat);
      table?.seats.push(seat);
      this.#orientSeat(seat);
    }
    this.kitchen.setPasses(this.passes.map((p) => ({ c: p.c, r: p.r })));
    this.kitchen.relayout();
    this.#syncJoinery();
  }

  /**
   * Turn a chair to face its table and shuffle it clear of the tabletop.
   *
   * Every side of a table is a real drawing: the two that face down-screen come
   * from the front view, the two that face up-screen from the back view, each
   * mirrored on one of its sides. So a chair never has to settle for the
   * nearest facing — it turns to its table whichever side it took.
   */
  #orientSeat(seat) {
    const f = seat.f;
    f.nudge = null;
    if (!seat.table) return;

    const rot = rotationToward(seat.table.c - seat.c, seat.table.r - seat.r);
    if (rot === null) return;
    f.rot = rot;
    // adjacent tiles are only half a sprite apart, so back the chair off along
    // the line to the table until it clears the tabletop
    const chair = toScreen(seat.c, seat.r);
    const table = toScreen(seat.table.c, seat.table.r);
    const dx = chair.x - table.x, dy = chair.y - table.y;
    const len = Math.hypot(dx, dy) || 1;
    f.nudge = { x: (dx / len) * 12, y: (dy / len) * 8 };
  }

  /** Match the room's doors and windows to the finish the room mostly uses. */
  #syncJoinery() {
    const tally = {};
    for (const f of this.grid.values()) tally[f.style] = (tally[f.style] ?? 0) + 1;
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'plain';
    this.room.setFixtureGroup(STYLE_BY_ID[best]?.fixt ?? 'fixt_oak');
  }

  get seatCount() { return this.seats.filter((s) => s.table).length; }
  get hasPass() { return this.passes.length > 0; }

  /** Solid tiles block movement; guests walk through each other happily. */
  walkable = (c, r) => this.room.inside(c, r) && !this.grid.has(this.key(c, r));

  freeSeats() {
    return this.seats.filter((s) => s.table && !s.taken && s.dirty <= 0);
  }

  /* ------------------------------------------------------------- placement */

  beginPlace(id, style = 'plain') {
    const item = FURNITURE_BY_ID[id];
    if (!item) return;
    this.ghost = { id, item, style, rot: 0, c: null, r: null, ok: false, t: 0 };
    this.selection = null;
  }

  cancelPlace() { this.ghost = null; }

  rotateGhost() { if (this.ghost) this.ghost.rot = (this.ghost.rot + 1) % ROT_COUNT; }

  moveGhost(world) {
    if (!this.ghost) return;
    const t = tileAt(world.x, world.y);
    this.ghost.c = t.c;
    this.ghost.r = t.r;
    this.ghost.ok = this.canPlace(t.c, t.r);
  }

  canPlace(c, r) {
    if (!this.room.inside(c, r)) return false;
    if (this.grid.has(this.key(c, r))) return false;
    if (c === this.entry.c && r === this.entry.r) return false;   // keep the doorway clear
    return true;
  }

  /** Commit the ghost. Returns the spent cost, or 0 if it could not be placed. */
  commitPlace() {
    const g = this.ghost;
    if (!g || !g.ok) return 0;
    const cost = Math.round(g.item.cost * (STYLE_BY_ID[g.style]?.costMul ?? 1));
    if (!this.state.spend(cost)) return 0;

    const rec = { c: g.c, r: g.r, id: g.id, style: g.style, rot: g.rot, uid: uid('f'), sq: { value: 0.82, vel: 0 } };
    this.state.furniture.push(rec);
    this.rebuild();

    const s = toScreen(g.c, g.r);
    this.fx.puff(s.x, s.y + 6, 6, 14);
    this.fx.ripple(s.x, s.y, 'rgba(255,248,220,0.9)', 0.4, 90);
    this.fx.kick(3.5);
    this.sfx.play('place');
    this.state.save();
    return cost;
  }

  /** Remove furniture, refunding most of what it cost. */
  sell(rec) {
    const i = this.state.furniture.indexOf(rec);
    if (i < 0) return 0;
    // never strand a seated guest
    if (this.seats.some((s) => s.f === rec && s.taken)) return -1;
    const refund = Math.round(rec.item.cost * (STYLE_BY_ID[rec.style]?.costMul ?? 1) * 0.6);
    this.state.furniture.splice(i, 1);
    this.rebuild();
    this.state.earn(refund);
    const s = toScreen(rec.c, rec.r);
    this.fx.puff(s.x, s.y, 7, 15);
    this.fx.coins(s.x, s.y - 30, 3, 40);
    this.sfx.play('coin');
    this.state.save();
    return refund;
  }

  /** Swap a piece to a fancier finish, paying the difference. */
  restyle(rec, styleId) {
    const from = STYLE_BY_ID[rec.style]?.costMul ?? 1;
    const to = STYLE_BY_ID[styleId]?.costMul ?? 1;
    const diff = Math.max(0, Math.round(rec.item.cost * (to - from)));
    if (!this.state.spend(diff)) return false;
    rec.style = styleId;
    rec.sq = { value: 0.86, vel: 0 };
    this.rebuild();
    const s = toScreen(rec.c, rec.r);
    this.fx.stars(s.x, s.y - 40, 8);
    this.fx.ripple(s.x, s.y, 'rgba(248,209,103,0.9)', 0.5, 110);
    this.sfx.play('star');
    this.state.save();
    return true;
  }

  /* --------------------------------------------------------------- service */

  startService() {
    this.kitchen.reset();
    this.guests.length = 0;
    for (const s of this.seats) { s.taken = null; this.#wipe(s); }
    this.served = 0; this.earned = 0; this.walkouts = 0; this.starsToday = 0;
    this.spawnT = 1.2;
  }

  stopService() {
    for (const g of this.guests) g.dead = true;
    this.guests.length = 0;
    this.kitchen.reset();
    for (const s of this.seats) { s.taken = null; this.#wipe(s); }
  }

  /** Clear a place setting — nothing left to wash. */
  #wipe(seat) {
    seat.dirty = 0;
    seat.dirtyMax = 0;
    seat.soil = null;
    seat.washT = 0;
  }

  get open() { return this.state.phase === 'open'; }

  /** How long a guest will sit in a given state before giving up. */
  patienceSeconds(cstate, guest = null) {
    const base = PATIENCE_BASE[cstate] ?? 26;
    return base * this.state.patienceMult * (guest?.seatPatience ?? 1);
  }

  cookProgress(customer) { return this.kitchen.progressFor(customer.id); }

  #maxGuests() { return clamp(this.seatCount + 3, 3, 10); }

  #spawn() {
    const g = rollGuest(this.assets, this.state.rarityPull);
    const c = new Customer(this, g.sprite, {
      tile: this.entry,
      pos: { x: this.entryWorld.x, y: this.entryWorld.y - 4 },
      patience: g.patience,
    });
    c.eatTime = g.eatTime;
    c.fussy = g.fussy;
    c.species = g.species;
    c.rarity = g.rarity;
    if (c.species) this.state.noteArrival(c.species);
    c.arrive();
    this.guests.push(c);

    const spot = this.#queueSpot();
    c.setState(CS.ENTER);
    if (!c.walkTo(spot, this.walkable)) { c.tile = { ...spot }; c.setState(CS.QUEUE); }
    this.sfx.play('pop');
  }

  /**
   * Bring one guest in now, off the board out front. Unlike the arrival clock
   * this has no ceiling: a queue can be as long as you can feed, and the day is
   * limited by the food you plated rather than by a headcount. It still refuses
   * when there is nowhere to sit anybody at all, so the taps are not wasted.
   */
  summonGuest(loud = true) {
    if (this.seatCount === 0 || !this.hasPass) return false;
    this.#spawn();
    const g = this.guests[this.guests.length - 1];
    if (g && loud) {
      this.fx.pop(g.pos.x, g.headY - 30, 'Heard you calling!', {
        color: '#e4652f', size: 15, rise: 38, max: 0.9,
      });
      this.fx.sparkles(g.pos.x, g.pos.y - 20, 8, 22);
    }
    return true;
  }

  /**
   * Where the next arrival waits.
   *
   * The board out front has no ceiling on it, so a queue can be genuinely long
   * and a fixed list of nine spots would pile everyone on the doormat. This
   * walks outward from the door instead and takes the nearest free tile, keeping
   * two tiles between people where it can — adjacent iso tiles are only half a
   * sprite apart, so a tight queue reads as one heap of guests.
   */
  #queueSpot() {
    const taken = new Set(this.guests
      .filter((g) => g.state === CS.QUEUE || g.state === CS.ENTER)
      .map((g) => (g.path.length
        ? this.key(g.path[g.path.length - 1].c, g.path[g.path.length - 1].r)
        : this.key(g.tile.c, g.tile.r))));
    const e = this.entry;
    const free = (t) => this.walkable(t.c, t.r) && !taken.has(this.key(t.c, t.r));

    const ring = [];
    for (let d = 0; d <= this.cols + this.rows; d++) {
      for (let dc = -d; dc <= d; dc++) {
        const dr = d - Math.abs(dc);
        for (const t of dr === 0
          ? [{ c: e.c + dc, r: e.r }]
          : [{ c: e.c + dc, r: e.r + dr }, { c: e.c + dc, r: e.r - dr }]) {
          if (this.room.inside(t.c, t.r)) ring.push({ t, d });
        }
      }
    }
    // spaced first, then anything walkable at all
    for (const { t, d } of ring) if (d % 2 === 0 && free(t)) return t;
    for (const { t } of ring) if (free(t)) return t;
    return e;
  }

  /** Send a waiting guest to a seat. Returns a reason string on failure. */
  seatGuest(guest, seat = null) {
    if (guest.state !== CS.QUEUE) return 'busy';
    const options = this.freeSeats();
    if (!options.length) return 'noseats';
    const target = seat ?? options
      .map((s) => ({ s, score: tileDist(guest.tile, s) }))
      .reduce((a, b) => (b.score < a.score ? b : a)).s;
    if (target.taken || target.dirty > 0 || !target.table) return 'taken';
    if (!guest.walkTo(target, this.walkable)) return 'blocked';

    target.taken = guest.id;
    guest.seatPatience = target.f?.item?.patience ?? 1;
    guest.seat = target;
    guest.table = target.table;
    guest.setState(CS.WALK);
    this.sfx.play('select');
    const s = toScreen(target.c, target.r);
    this.fx.ripple(s.x, s.y, 'rgba(139,187,106,0.9)', 0.45, 86);
    return null;
  }

  /** Longest-waiting guest, for the "tap an empty seat" shortcut. */
  neediestGuest() {
    return this.guests
      .filter((g) => g.state === CS.QUEUE)
      .sort((a, b) => a.patience - b.patience)[0] ?? null;
  }

  onArrived(guest) {
    switch (guest.state) {
      case CS.ENTER:
        guest.setState(CS.QUEUE);
        break;
      case CS.WALK: {
        guest.seated = true;
        guest.setState(CS.SEAT);
        guest.sq.vel -= 3;
        // sit them on the chair, which was shuffled off its tile centre
        const n = guest.seat?.f?.nudge;
        if (n) { guest.pos.x += n.x; guest.pos.y += n.y; }
        const t = guest.table;
        if (t) {
          const dx = toScreen(t.c, t.r).x - guest.pos.x;
          if (Math.abs(dx) > 2) guest.face = dx > 0 ? 1 : -1;
        }
        break;
      }
      case CS.LEAVE:
        this.#despawn(guest);
        break;
    }
  }

  /** Pick what they fancy off the live menu, weighted by how fussy they are. */
  beginOrder(guest) {
    const dishes = this.state.availableDishes();
    if (!dishes.length) {
      this.#leave(guest, 'nofood');
      return;
    }
    const bias = 0.4 + guest.fussy * 1.5 + this.state.rating * 0.25;
    let total = 0;
    const weighted = dishes.map((d) => {
      const w = Math.pow(d.price, bias) * (1 + d.left * 0.05);
      total += w;
      return { d, w };
    });
    let roll = rnd() * total;
    let chosen = weighted[weighted.length - 1].d;
    for (const { d, w } of weighted) { roll -= w; if (roll <= 0) { chosen = d; break; } }

    guest.dish = chosen.id;
    this.state.stock[chosen.id] -= 1;
    if (this.state.stock[chosen.id] <= 0) delete this.state.stock[chosen.id];
    guest.setState(CS.ORDER);
    guest.sq.vel -= 2;
  }

  /** Player tapped the order bubble — the ticket goes to the chef. */
  sendOrder(guest) {
    if (guest.state !== CS.ORDER || guest.ordered) return false;
    guest.ordered = true;
    guest.setState(CS.WAIT);
    const dur = this.state.prepOf(guest.dish) * this.state.orderSpeed;
    this.kitchen.addTicket(guest, guest.dish, dur);
    this.sfx.play('order');
    this.fx.pop(guest.pos.x, guest.headY - 20, 'Order!', { color: '#e4652f', size: 17, rise: 34, max: 0.7 });
    return true;
  }

  /** Hand a finished plate to a guest who is waiting on that dish. */
  deliver(plate, guest) {
    if (!guest || guest.state !== CS.WAIT) return false;
    if (guest.dish !== plate.recipeId) return false;
    this.kitchen.remove(plate);
    guest.plate = plate.recipeId;
    guest.bites = 0;
    guest.biteT = 0;
    guest.setState(CS.EAT);
    guest.sq.vel -= 3.5;
    this.fx.sparkles(guest.pos.x, guest.headY + 12, 7, 20);
    this.fx.hearts(guest.pos.x, guest.headY - 6, 2);
    this.sfx.play('slurp');
    return true;
  }

  /** Meal over: pay out on how briskly they were served. */
  finishMeal(guest) {
    guest.setState(CS.DONE);
    const price = this.state.priceOf(guest.dish);
    const speed = 0.75 + 0.6 * clamp(guest.patience, 0, 1);
    const tableTip = STYLE_BY_ID[guest.seat?.f?.style]?.tip ?? 1;
    const rarity = guest.rarity ?? RARITY_BY_ID.common;

    // the diary entry decides the mood, and the mood is worth money: cooking
    // what somebody actually likes is the difference between a tip and a habit
    const note = guest.species
      ? this.state.noteServed(guest.species, guest.dish, rarity.hearts)
      : { hearts: 0, mood: 'fine', levelled: null };
    const moodPay = note.mood === 'loved' ? 1.35 : note.mood === 'hated' ? 0.7 : 1;

    // and whatever the harbour asked for this morning pays over the odds
    const asked = this.state.catchBonus(guest.dish);
    const pay = Math.max(1, Math.round(
      price * speed * this.state.tipMult * (1 + (tableTip - 1) * 0.4)
      * rarity.pay * moodPay * asked));
    const stars = guest.patience > 0.3
      ? this.state.starsOf(guest.dish) + (STYLE_BY_ID[guest.seat?.f?.style]?.star ?? 0)
        + this.state.bonusStar + (note.mood === 'loved' ? 1 : 0)
      : 0;

    this.state.addPottery(1 + Math.round(rarity.hearts));
    this.#showMood(guest, note);
    if (note.levelled) this.#giveGift(guest, note.levelled);

    this.state.earn(pay);
    this.state.addStars(stars);
    this.state.stats.served += 1;
    this.served += 1;
    this.earned += pay;
    this.starsToday += stars;

    if (asked > 1) {
      this.fx.pop(guest.pos.x + 40, guest.headY - 46, 'Catch of the day!', {
        color: '#4a8cb0', size: 14, rise: 40, max: 1,
      });
    }
    this.fx.coins(guest.pos.x, guest.headY + 10, 5 + Math.min(6, Math.floor(pay / 18)), 62);
    this.fx.pop(guest.pos.x, guest.headY - 24, `+${money(pay)}`, { color: '#b8481c', size: 23 });
    if (stars > 0) {
      this.fx.stars(guest.pos.x, guest.headY - 6, 4 + stars);
      this.fx.pop(guest.pos.x + 46, guest.headY - 6, `+${stars}★`, { color: '#c8992c', size: 17, rise: 44, max: 0.9 });
    }
    this.fx.hearts(guest.pos.x, guest.headY - 10, 3);
    this.sfx.play('cash');
    this.game.bumpCoinChip();

    this.tweens.after(0.9, () => { if (!guest.dead) this.#leave(guest, 'happy'); });
  }

  /** A little flourish that tells you how the dish landed. */
  #showMood(guest, note) {
    if (note.mood === 'loved') {
      this.fx.hearts(guest.pos.x, guest.headY - 6, 4);
      this.fx.pop(guest.pos.x - 40, guest.headY - 40, 'Favourite!', {
        color: '#d0517f', size: 15, rise: 40, max: 1,
      });
    } else if (note.mood === 'hated') {
      this.fx.pop(guest.pos.x - 30, guest.headY - 40, 'Not for them…', {
        color: '#8a6647', size: 14, rise: 34, max: 0.9,
      });
    }
  }

  /** Friendship ticked over, so they leave something behind. */
  #giveGift(guest, level) {
    const gift = this.state.claimGift(level);
    if (!gift) return;
    this.fx.stars(guest.pos.x, guest.headY - 20, 10);
    this.fx.coins(guest.pos.x, guest.headY, 6, 60);
    this.game.toast(`A gift: ${gift.label}`, 'good');
    this.game.titleCard('A present!', `${GUEST_BY_ID[guest.species]?.name ?? 'Your guest'} left ${gift.label}`);
    this.sfx.play('star');
  }

  /** Patience hit zero. */
  walkOut(guest) {
    if (guest.state === CS.LEAVE || guest.state === CS.DONE) return;
    // the dish was never cooked, so put the serving back on the menu
    if (guest.dish && !this.kitchen.plates.some((p) => p.customerId === guest.id)) {
      this.state.stock[guest.dish] = (this.state.stock[guest.dish] ?? 0) + 1;
    }
    this.kitchen.dropTicketsFor(guest.id);
    this.state.addStars(-2);
    this.state.stats.walkouts += 1;
    this.walkouts += 1;
    this.fx.pop(guest.pos.x, guest.headY - 20, '−2★', { color: '#b8481c', stroke: '#fff0e4', size: 19 });
    this.fx.puff(guest.pos.x, guest.pos.y, 5, 12);
    this.sfx.play('sad');
    this.#leave(guest, 'cross');
  }

  #leave(guest, why) {
    guest.mood = why === 'cross' ? 'cross' : 'ok';
    guest.patience = Math.max(guest.patience, 0.001);
    if (guest.seat) {
      const seat = guest.seat;
      seat.taken = null;
      // an empty plate has to be washed before the next guest can sit down; a
      // guest who stormed out never got one, so that seat is free straight away
      const ate = why !== 'cross' && !!guest.plate;
      seat.dirty = ate ? this.state.cleanTime : 0.2;
      seat.dirtyMax = seat.dirty;
      seat.soil = ate ? guest.plate : null;
      seat.washT = 0;
      guest.seat = null;
    }
    guest.seated = false;
    guest.seatPatience = 1;
    guest.setState(CS.LEAVE);
    if (!guest.walkTo(this.entry, this.walkable)) this.#despawn(guest);
  }

  #despawn(guest) {
    guest.dead = true;
    this.tweens.to(guest, { alpha: 0 }, 0.28, { onDone: () => { guest.alpha = 0; } });
    this.fx.puff(guest.pos.x, guest.pos.y, 4, 10);
    this.tweens.after(0.3, () => {
      const i = this.guests.indexOf(guest);
      if (i >= 0) this.guests.splice(i, 1);
    });
  }

  /* ---------------------------------------------------------------- update */

  update(dt, t) {
    this.room.pulse = t;
    if (this.ghost) this.ghost.t += dt;

    for (const f of this.grid.values()) if (f.sq) spring(f.sq, 1, dt, 170, 16);
    this.#washUp(dt);

    this.kitchen.update(dt);

    for (let i = this.guests.length - 1; i >= 0; i--) {
      const g = this.guests[i];
      if (g.dead) continue;
      g.update(dt);
    }

    if (!this.open) return;

    // arrivals. Food on the pass is the only condition — the harbour knows you
    // are open, and the board out front is for calling somebody in *now*.
    const stock = this.state.stockCount;
    const pending = this.guests.filter((g) => g.state !== CS.LEAVE && g.state !== CS.DONE).length;
    if (stock > 0 && pending < this.#maxGuests() && this.seatCount > 0 && this.hasPass) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = this.state.arrivalGap * range(0.8, 1.25);
        this.#spawn();
      }
    }

    // staff automation
    if (this.state.autoSeat) {
      this.autoSeatT -= dt;
      if (this.autoSeatT <= 0) {
        this.autoSeatT = 2.4;
        const g = this.neediestGuest();
        if (g && this.freeSeats().length) this.seatGuest(g);
      }
    }
    if (this.state.autoServe) {
      this.autoServeT -= dt;
      if (this.autoServeT <= 0) {
        this.autoServeT = 1.8;
        const plate = this.kitchen.plates[0];
        if (plate) {
          const target = this.guests.find((g) => g.state === CS.WAIT && g.dish === plate.recipeId);
          if (target) this.deliver(plate, target);
        }
      }
      // the server also rings in orders that have been sitting
      const idle = this.guests.find((g) => g.state === CS.ORDER && g.stateT > 3.5);
      if (idle) this.sendOrder(idle);
    }

    // shift ends once the menu is empty and the room has cleared
    if (stock === 0 && this.guests.length === 0 && this.kitchen.queued === 0 && this.kitchen.plates.length === 0) {
      this.game.closeService('soldout');
    }
  }

  /**
   * The washing-up. A guest who has eaten leaves a plate behind, and the seat is
   * out of service until it is done — five seconds by default, halved by the
   * Deep Sink and all but gone once a dishwasher is on the crew. It runs on its
   * own; the point of showing it is that a busy room now has visible turnaround,
   * so a fifth table earns its money instead of sitting spare.
   */
  #washUp(dt) {
    for (const s of this.seats) {
      if (s.dirty <= 0) continue;
      s.dirty = Math.max(0, s.dirty - dt);
      if (!s.soil) continue;
      s.washT += dt;
      const p = this.#soilPos(s);
      // suds, roughly three a second, offset per seat so they don't march in step
      if (Math.floor(s.washT * 3) !== Math.floor((s.washT - dt) * 3)) {
        this.fx.bubbles(p.x, p.y - 6, 2, 13);
      }
      if (s.dirty <= 0) {
        this.fx.sparkles(p.x, p.y - 4, 7, 18);
        this.fx.ripple(p.x, p.y + 8, 'rgba(255,255,255,0.9)', 0.4, 56);
        this.fx.pop(p.x, p.y - 14, 'Clean!', {
          color: '#5f8c40', size: 14, rise: 34, max: 0.8,
        });
        this.sfx.play('pop');
        this.#wipe(s);
      }
    }
  }

  /**
   * Where the washing-up shows. Over the chair rather than on the tabletop: a
   * plate laid on the table is behind whoever is sitting at the next seat half
   * the time, and the one thing this has to tell you is which chair is out of
   * service — so it rides up with the other tile badges where nothing can hide
   * it.
   */
  #soilPos(seat) {
    const s = toScreen(seat.c, seat.r);
    return { x: s.x, y: s.y - 132 };
  }

  /** The dirty plate, a sponge working over it, and how long is left. */
  #drawWash(ctx, seat, t) {
    const p = this.#soilPos(seat);
    const bob = Math.sin(t * 4 + seat.c) * 2.5;
    const y = p.y + bob;
    const done = 1 - seat.dirty / Math.max(0.001, seat.dirtyMax);
    const dish = this.assets.get('plates', plateFor(seat.soil, 0));
    const wob = Math.sin(t * 11) * 0.08;

    // a cream badge behind it, so the crockery reads against floor or plaster
    ctx.save();
    ellipse(ctx, p.x, y + 3, 20, 20, '#b79a69');
    ellipse(ctx, p.x, y, 20, 20, '#fdf7e8');
    ctx.strokeStyle = '#5f3d26'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, y, 20, 20, 0, 0, TAU); ctx.stroke();
    ctx.restore();

    if (dish) {
      drawIcon(ctx, dish, p.x, y + 3, 25, { rot: wob * 0.5 });
    } else {
      // no crockery in the pack for this dish — a saucer stands in
      ctx.save();
      ellipse(ctx, p.x, y + 4, 13, 6.5, '#f4ecd8');
      ctx.strokeStyle = '#5f3d26'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(p.x, y + 4, 13, 6.5, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // the sponge, scrubbing side to side across the rim
    const sweep = Math.sin(t * 7 + seat.c) * 9;
    ctx.save();
    ctx.translate(p.x + sweep, y - 5 + Math.abs(Math.cos(t * 7)) * 3);
    ctx.rotate(wob);
    sticker(ctx, -8, -5, 16, 10, { r: 4.5, fill: '#f2c26b', lw: 2.2, lift: 2 });
    ctx.restore();

    ring(ctx, p.x, y, 25, done, { lw: 4, fill: '#8ecae6', track: 'rgba(95,61,38,0.2)' });
  }

  /* ------------------------------------------------------------------ taps */

  /** Grab a plate for dragging. */
  grab(world) {
    if (this.ghost) return null;
    const plate = this.kitchen.plateAt(world);
    if (!plate) return null;
    this.kitchen.clearSelection();
    plate.held = true;
    plate.sq.vel -= 5;
    this.sfx.play('tap');
    return plate;
  }

  dragTo(plate, world) { plate.x = world.x; plate.y = world.y; }

  /** Release a dragged plate: deliver if it landed on the right guest. */
  drop(plate, world, moved) {
    plate.held = false;
    if (!moved) {
      plate.selected = true;
      this.game.toast('Now tap the guest who ordered it');
      return;
    }
    // whoever ordered this dish wins the drop: guests overlap constantly in an
    // iso view, and a bystander standing in front of the right table should not
    // swallow a delivery that landed square on it
    const wants = (g) => g.state === CS.WAIT && g.dish === plate.recipeId;
    const guest = this.guestAt(world, wants) ?? this.guests.find(
      (g) => wants(g) && Math.hypot(g.pos.x - world.x, g.drawY - 40 - world.y) < 74,
    );
    if (guest && this.deliver(plate, guest)) return;
    plate.sq.vel -= 4;
    this.sfx.play('no');
    this.fx.pop(plate.homeX, plate.homeY - 40, 'Not theirs!', { color: '#b8481c', size: 15, rise: 30, max: 0.7 });
  }

  /**
   * Topmost guest under a point. `prefer` narrows it to a particular guest when
   * several overlap — pass one and you get that guest or nothing, never a
   * neighbour who happened to be drawn on top.
   */
  guestAt(world, prefer = null) {
    for (let i = this.guests.length - 1; i >= 0; i--) {
      const g = this.guests[i];
      if (g.dead || !(g.hitTest(world) || g.bubbleHit(world))) continue;
      if (!prefer) return g;
      if (prefer(g)) return g;
    }
    return null;
  }

  seatAt(c, r) { return this.seats.find((s) => s.c === c && s.r === r) ?? null; }

  /** Single tap in the world. Returns a hint string for the HUD, or null. */
  tap(world) {
    if (this.ghost) {
      this.moveGhost(world);
      if (!this.ghost.ok) { this.sfx.play('no'); return 'That spot is taken'; }
      const spent = this.commitPlace();
      if (!spent) { this.sfx.play('no'); return 'Not enough sand dollars'; }
      return null;
    }

    // a selected plate is waiting to be handed over
    const held = this.kitchen.selected;
    if (held) {
      // whoever ordered this dish wins the tap, exactly as they win a drop: a
      // bystander's order bubble can easily float over the guest behind them
      const wants = (x) => x.state === CS.WAIT && x.dish === held.recipeId;
      const guest = this.guestAt(world, wants) ?? this.guestAt(world);
      if (guest && this.deliver(held, guest)) { this.kitchen.clearSelection(); return null; }
      const plate = this.kitchen.plateAt(world);
      if (plate === held) { held.selected = false; return null; }
      this.kitchen.clearSelection();
      if (!guest) return null;
    }

    const plate = this.kitchen.plateAt(world);
    if (plate) { this.kitchen.clearSelection(); plate.selected = true; this.sfx.play('tap'); return 'Tap the guest who ordered it'; }

    const guest = this.guestAt(world);
    if (guest) {
      if (guest.state === CS.ORDER) { this.sendOrder(guest); return null; }
      if (guest.state === CS.QUEUE) {
        const err = this.seatGuest(guest);
        if (err === 'noseats') { this.sfx.play('no'); return 'No free seats — build more chairs'; }
        if (err === 'blocked') { this.sfx.play('no'); return "Can't reach that seat"; }
        return null;
      }
      if (guest.state === CS.WAIT) return 'Their dish is still cooking';
      return null;
    }

    const t = tileAt(world.x, world.y);
    const seat = this.seatAt(t.c, t.r);
    if (seat && seat.table && !seat.taken && seat.dirty <= 0) {
      const g = this.neediestGuest();
      if (g) { this.seatGuest(g, seat); return null; }
    }

    const f = this.at(t.c, t.r);
    if (f) {
      if (this.state.phase === 'open') return 'Rearranging can wait until closing';
      this.selection = f;
      this.sfx.play('tap');
      this.game.openFurniture(f);
      return null;
    }
    this.selection = null;
    return null;
  }

  /* ------------------------------------------------------------------ draw */

  /** Flat floor decals — drawn with the floor, under everything. */
  drawFloorItems(ctx) {
    for (const f of this.grid.values()) {
      if (!f.item.flat) continue;
      const s = this.spriteFor(f);
      if (!s) continue;
      const p = toScreen(f.c, f.r);
      drawIcon(ctx, s, p.x, p.y, 128 * 1.05, { alpha: 0.95 });
    }
  }

  /** Sprite for a placed piece, at whatever turn it is set to. */
  spriteFor(f) {
    return this.assets.get(groupFor(f.item, f.style), artFor(f.item.sprite, f.rot ?? 0));
  }

  mirrorFor(f) { return mirrorAt(f.item.sprite, f.rot ?? 0); }

  /** Push depth-sorted draw jobs onto the renderer's list. */
  collect(ctx, list, t) {
    for (const f of this.grid.values()) {
      if (f.item.flat) continue;
      const s = this.spriteFor(f);
      if (!s) continue;
      const p = toScreen(f.c, f.r);
      const hang = !!f.item.hang;
      // chairs get nudged clear of the table they belong to
      const nx = p.x + (f.nudge?.x ?? 0);
      const y = (hang ? p.y - 132 : p.y + HALF_H * 0.36) + (f.nudge?.y ?? 0);
      const { sx, sy } = squash(f.sq?.value ?? 1);
      const isSel = this.selection === f;
      list.push({
        d: depthOf(f.c, f.r, hang ? 40 : 0),
        fn: () => {
          drawSprite(ctx, s, 0, nx, y, {
            scale: FURN_SCALE,
            scaleX: sx, scaleY: sy,
            flipX: this.mirrorFor(f),
          });
          // the selected piece is marked on its tile rather than lit up: a halo
          // around hand-drawn art only ever looks like a mistake
          if (isSel) Room.outlineTile(ctx, f.c, f.r, 'pick', this.room.pulse ?? 0);
        },
      });
    }

    // the chef sorts on their own tile behind the counter; plates go on top of it
    if (this.passes.length) {
      const p0 = this.passes[0];
      const ct = this.kitchen.chefTile;
      if (ct) list.push({ d: depthOf(ct.c, ct.r, 10), fn: () => this.kitchen.drawChef(ctx) });
      list.push({ d: depthOf(p0.c, p0.r, 60), fn: () => this.kitchen.drawPlates(ctx, t) });
    }

    for (const g of this.guests) {
      if (g.dead && g.alpha <= 0.01) continue;
      const hi = this.#isHighlighted(g);
      list.push({ d: g.depth, fn: () => g.draw(ctx, hi) });
    }
  }

  #isHighlighted(g) {
    if (g.state === CS.ORDER) return true;
    if (g.state === CS.QUEUE && this.freeSeats().length > 0) return true;
    const sel = this.kitchen.selected;
    return !!(sel && g.state === CS.WAIT && g.dish === sel.recipeId);
  }

  /** Ghost preview + tile marks, drawn on the floor above the room. */
  drawBuildLayer(ctx, t) {
    const g = this.ghost;
    if (!g || g.c === null) return;
    Room.markTile(ctx, g.c, g.r, g.ok ? 'ok' : 'bad', t);
    const s = this.#ghostSprite(g);
    if (!s) return;
    const p = toScreen(g.c, g.r);
    const hang = !!g.item.hang;
    blueprint(ctx, s, 0, p.x, hang ? p.y - 132 : p.y + HALF_H * 0.36, {
      scale: FURN_SCALE,
      scaleY: 1 + Math.sin(t * 6) * 0.02,
      flipX: mirrorAt(g.item.sprite, this.#ghostRot(g)),
      ok: g.ok,
    });
    Room.outlineTile(ctx, g.c, g.r, g.ok ? 'ok' : 'bad', t);
  }

  /** Preview a chair already turned to whichever table it would join. */
  #ghostSprite(g) {
    return this.spriteFor({ item: g.item, style: g.style, rot: this.#ghostRot(g) });
  }

  /** A chair on the cursor faces its table; everything else obeys Rotate. */
  #ghostRot(g) {
    if (g.item.kind !== 'seat') return g.rot;
    const table = this.tables.find((tb) => neighbours(tb).some((n) => n.c === g.c && n.r === g.r));
    if (!table) return g.rot;
    return rotationToward(table.c - g.c, table.r - g.r) ?? g.rot;
  }

  /** Floor-level marks: a soft glow under seats a waiting guest could take. */
  drawHints(ctx, t) {
    if (this.state.phase !== 'open') return;
    if (!this.guests.some((g) => g.state === CS.QUEUE)) return;
    for (const s of this.seats) {
      if (s.table && !s.taken && s.dirty <= 0) {
        Room.glowTile(ctx, s.c, s.r, 'rgba(139,187,106,0.35)', t);
      }
    }
  }

  /**
   * Bubbles, meters and tile badges — drawn after every sprite so a tall chair
   * never hides the marker telling you what is wrong with it.
   */
  drawOverlays(ctx, t) {
    for (const g of this.guests) if (!g.dead) g.drawOverlay(ctx, t);
    this.kitchen.drawOverlay(ctx);

    if (this.state.phase !== 'open') {
      // the main menu is a look at the place, not a job list, so the "this chair
      // has no table" markers stay out of the shot
      if (this.game.attract) return;
      for (const s of this.seats) {
        if (s.table) continue;
        const p = toScreen(s.c, s.r);
        const bob = Math.sin(t * 5 + s.c) * 2;
        sticker(ctx, p.x - 15, p.y - 154 + bob, 30, 26, { r: 9, fill: '#fbe0d6', lift: 3 });
        text(ctx, '?', p.x, p.y - 140 + bob, { size: 17, fill: '#b8481c' });
      }
    }
    for (const s of this.seats) {
      if (s.dirty > 0 && s.soil) this.#drawWash(ctx, s, t);
    }
  }

  /** Bounds used for camera framing. */
  bounds() { return this.room.bounds(); }
}
