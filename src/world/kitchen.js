// The pass: order tickets, the chef working through them, and finished plates
// waiting to be carried out.

import { FURN_SCALE, HALF_H, toScreen } from './iso.js';
import { clamp, rnd, uid } from '../core/util.js';
import { makeSpring, spring } from '../core/tween.js';
import { drawIcon, drawSprite, ring, squash, sticker, text } from '../gfx/paint.js';
import { CHEF_SPRITE } from '../data/catalog.js';

const PLATE_SIZE = 58;
const PLATES_PER_PASS = 3;
const CHEF_SCALE = 0.74;
const CLEAR_H = 40;     // how much of the chef shows above the counter's top edge

export class Kitchen {
  constructor(zone) {
    this.zone = zone;
    this.chef = zone.assets.get('staff', CHEF_SPRITE);
    this.tickets = [];   // queued { id, recipeId, customerId, dur }
    this.cooking = [];   // active  { ...ticket, t }
    this.plates = [];    // ready   { id, recipeId, customerId, slot, ... }
    this.passes = [];
    this.bobT = rnd() * 6;
    this.workT = 0;
    this.chefSq = makeSpring(1);
  }

  reset() { this.tickets.length = 0; this.cooking.length = 0; this.plates.length = 0; }

  setPasses(tiles) { this.passes = tiles; }

  get busy() { return this.cooking.length > 0; }
  get queued() { return this.tickets.length + this.cooking.length; }
  get capacity() { return Math.max(1, this.passes.length) * PLATES_PER_PASS; }
  get full() { return this.plates.length >= this.capacity; }

  /** Tile the chef works from — the one behind the first pass, if there is one. */
  get chefTile() {
    const p = this.passes[0];
    if (!p) return null;
    // straight up-screen first, so he stands centred behind the counter rather
    // than half beside it
    const cands = [
      { c: p.c - 1, r: p.r - 1 }, { c: p.c, r: p.r - 1 },
      { c: p.c - 1, r: p.r }, { c: p.c, r: p.r + 1 },
    ];
    for (const t of cands) {
      if (this.zone.room.inside(t.c, t.r) && !this.zone.grid.has(`${t.c},${t.r}`)) return t;
    }
    return { c: p.c, r: p.r };
  }

  /**
   * How far to stand the chef up off his tile. The pass is a tall piece of
   * joinery with a shelf over it, so a chef planted on the floor behind it is a
   * couple of tentacles and nothing else. Lifting him by whatever the counter
   * covers puts his head and apron back above the worktop, which is where you
   * expect to see a cook.
   */
  get chefLift() {
    const pass = this.passes[0] && this.zone.at(this.passes[0].c, this.passes[0].r);
    const sprite = pass && this.zone.spriteFor(pass);
    if (!sprite || !this.chef) return 0;
    const passH = sprite.rect(0).sh * FURN_SCALE;
    const chefH = this.chef.rect(0).sh * CHEF_SCALE;
    const t = this.chefTile;
    const drop = (toScreen(t.c, t.r).y - toScreen(this.passes[0].c, this.passes[0].r).y);
    // land the top of his head CLEAR_H above the counter's top edge
    return clamp(drop - chefH + passH + CLEAR_H, 0, 130);
  }

  get chefPos() {
    const t = this.chefTile;
    if (!t) return null;
    const s = toScreen(t.c, t.r);
    return { x: s.x, y: s.y + HALF_H * 0.3 - this.chefLift };
  }

  /* -------------------------------------------------------------- tickets */

  addTicket(customer, recipeId, dur) {
    const t = { id: uid('tk'), recipeId, customerId: customer.id, dur, t: 0 };
    this.tickets.push(t);
    return t;
  }

  /** Cancel a customer's ticket if they leave before it is cooked. */
  dropTicketsFor(customerId) {
    let dropped = 0;
    for (const list of [this.tickets, this.cooking]) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].customerId === customerId) { list.splice(i, 1); dropped++; }
      }
    }
    return dropped;
  }

  /** 0..1 progress of the dish a given customer is waiting on. */
  progressFor(customerId) {
    const active = this.cooking.find((c) => c.customerId === customerId);
    if (active) return Math.min(1, active.t / active.dur);
    if (this.plates.some((p) => p.customerId === customerId)) return 1;
    return this.tickets.some((t) => t.customerId === customerId) ? 0 : 0;
  }

  update(dt) {
    const slots = this.zone.state.cookSlots;
    while (this.cooking.length < slots && this.tickets.length && !this.full) {
      this.cooking.push(this.tickets.shift());
      this.chefSq.vel -= 2;
    }

    for (let i = this.cooking.length - 1; i >= 0; i--) {
      const c = this.cooking[i];
      c.t += dt;
      if (c.t % 0.6 < dt) {
        const p = this.chefPos;
        if (p) this.zone.fx.steam(p.x + 12, p.y - 74);
      }
      if (c.t >= c.dur) {
        this.cooking.splice(i, 1);
        this.#plate(c);
      }
    }

    if (this.cooking.length) {
      this.workT += dt;
      this.bobT += dt * 2.6;
    } else {
      this.bobT += dt;
    }
    spring(this.chefSq, 1, dt, 150, 15);

    for (const p of this.plates) {
      p.age += dt;
      spring(p.sq, 1, dt, 170, 16);
      if (!p.held) {
        p.x += (p.homeX - p.x) * (1 - Math.exp(-16 * dt));
        p.y += (p.homeY - p.y) * (1 - Math.exp(-16 * dt));
      }
    }
  }

  #plate(ticket) {
    const slot = this.#freeSlot();
    const home = this.#slotPos(slot);
    this.plates.push({
      id: uid('pl'), recipeId: ticket.recipeId, customerId: ticket.customerId,
      slot, x: home.x, y: home.y - 26, homeX: home.x, homeY: home.y,
      age: 0, held: false, selected: false, sq: makeSpring(0.86), bob: rnd() * 6,
    });
    const p = this.chefPos;
    if (p) {
      this.zone.fx.sparkles(home.x, home.y - 10, 6, 14);
      this.zone.fx.ripple(home.x, home.y + 6, 'rgba(255,255,255,0.8)', 0.4, 46);
    }
    this.chefSq.vel -= 3;
    this.zone.sfx.play('ding');
    this.zone.onPlateReady?.(ticket);
  }

  #freeSlot() {
    const taken = new Set(this.plates.map((p) => p.slot));
    for (let i = 0; i < this.capacity; i++) if (!taken.has(i)) return i;
    return this.plates.length;
  }

  #slotPos(slot) {
    const passCount = Math.max(1, this.passes.length);
    const pass = this.passes[Math.floor(slot / PLATES_PER_PASS) % passCount] ?? this.passes[0];
    if (!pass) return { x: 0, y: 0 };
    const s = toScreen(pass.c, pass.r);
    // fill centre-out so a lone plate sits in the middle of the counter
    const offset = [0, -36, 36][slot % PLATES_PER_PASS];
    return { x: s.x + offset, y: s.y - 58 + (offset === 0 ? -4 : 0) };
  }

  /** Re-seat plates after the pass moves or a plate leaves. */
  relayout() {
    this.plates.forEach((p, i) => {
      p.slot = i;
      const home = this.#slotPos(i);
      p.homeX = home.x; p.homeY = home.y;
    });
  }

  /* --------------------------------------------------------------- plates */

  plateAt(world) {
    for (let i = this.plates.length - 1; i >= 0; i--) {
      const p = this.plates[i];
      if (Math.hypot(world.x - p.x, world.y - p.y) < 34) return p;
    }
    return null;
  }

  remove(plate) {
    const i = this.plates.indexOf(plate);
    if (i >= 0) this.plates.splice(i, 1);
    this.relayout();
  }

  get selected() { return this.plates.find((p) => p.selected) ?? null; }
  clearSelection() { this.plates.forEach((p) => { p.selected = false; }); }

  /* ----------------------------------------------------------------- draw */

  /** The chef, drawn behind the counter sprite. */
  drawChef(ctx) {
    const p = this.chefPos;
    if (!p || !this.chef) return;
    const cooking = this.cooking.length > 0;
    const bob = Math.sin(this.bobT * 2.4) * (cooking ? 3.5 : 2);
    const { sx, sy } = squash(this.chefSq.value);
    // no contact shadow: standing him up behind the counter means his feet are
    // not on the tile under him, and a shadow there just draws attention to it
    drawSprite(ctx, this.chef, cooking ? 'work' : 'idle', p.x, p.y + bob, {
      scale: CHEF_SCALE,
      scaleX: sx, scaleY: sy,
      rot: cooking ? Math.sin(this.bobT * 7) * 0.03 : 0,
      flipX: true,
    });
  }

  drawPlates(ctx, t) {
    for (const p of this.plates) {
      const s = this.zone.assets.get('food', p.recipeId);
      if (!s) continue;
      const float = p.held ? 0 : Math.sin(t * 3 + p.bob) * 2.5;
      const lift = p.held ? 16 : 0;
      const { sx, sy } = squash(p.sq.value);
      drawIcon(ctx, s, p.x, p.y + float - lift, PLATE_SIZE * (p.held ? 1.1 : 1), {
        scaleX: sx, scaleY: sy,
        glow: p.selected || p.held ? '#f8d167' : (p.age < 1.2 ? '#fff3c8' : null),
        glowWidth: p.selected || p.held ? 4 : 2.5,
      });
    }
  }

  /** Cook queue readout above the chef. */
  drawOverlay(ctx) {
    const p = this.chefPos;
    if (!p) return;
    const active = this.cooking[0];
    const y = p.y - 118;
    if (active) {
      const s = this.zone.assets.get('food', active.recipeId);
      if (s) drawIcon(ctx, s, p.x, y, 34);
      ring(ctx, p.x, y, 25, Math.min(1, active.t / active.dur), { lw: 4.5, fill: '#e4652f' });
    }
    const waiting = this.tickets.length + Math.max(0, this.cooking.length - 1);
    if (waiting > 0) {
      sticker(ctx, p.x + 22, y - 34, 30, 24, { r: 9, fill: '#f8d167', lift: 3 });
      text(ctx, `+${waiting}`, p.x + 37, y - 21, { size: 14 });
    }
  }
}
