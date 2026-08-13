// The pass: order tickets, the chef working through them, and finished plates
// waiting to be carried out.

import { HALF_H, toScreen } from './iso.js';
import { rnd, uid } from '../core/util.js';
import { makeSpring, spring } from '../core/tween.js';
import {
  PAL, contactShadow, drawIcon, drawSprite, ring, squash, sticker, text,
} from '../gfx/paint.js';
import { CHEF_SPRITE } from '../data/catalog.js';
import { plateFor } from '../data/progress.js';

const PLATE_SIZE = 58;
const PLATES_PER_PASS = 3;
const PLATE_SHELF = 104;   // height of the counter's worktop above its tile

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

  /**
   * Tile the chef works from. He stands on the near side of the pass, in front
   * of it — the counter is a tall piece with a shelf over it, and anyone put
   * behind it is a couple of tentacles poking out of the top. Straight in front
   * first, then either shoulder.
   */
  get chefTile() {
    const p = this.passes[0];
    if (!p) return null;
    const cands = [
      { c: p.c + 1, r: p.r + 1 },   // dead centre, in front of the counter
      { c: p.c + 1, r: p.r },       // in front, off his left
      { c: p.c, r: p.r + 1 },       // in front, off his right
      { c: p.c - 1, r: p.r - 1 },   // nothing free out front — tuck in behind
    ];
    for (const t of cands) {
      if (this.zone.room.inside(t.c, t.r) && !this.zone.grid.has(`${t.c},${t.r}`)) return t;
    }
    return { c: p.c, r: p.r };
  }

  get chefPos() {
    const t = this.chefTile;
    if (!t) return null;
    const s = toScreen(t.c, t.r);
    return { x: s.x, y: s.y };
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
      this.zone.fx.ripple(home.x, home.y + 6, 'rgba(255, 255, 255,0.8)', 0.4, 46);
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
    // fill centre-out so a lone plate sits in the middle of the counter, and sit
    // the row up on the worktop, clear of the chef standing in front
    const offset = [0, -40, 40][slot % PLATES_PER_PASS];
    return { x: s.x + offset, y: s.y - PLATE_SHELF + (offset === 0 ? -4 : 0) };
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

  /** The chef, out front of the pass where you can actually see him. */
  drawChef(ctx) {
    const p = this.chefPos;
    if (!p || !this.chef) return;
    const cooking = this.cooking.length > 0;
    const bob = Math.sin(this.bobT * 2.4) * (cooking ? 3.5 : 2);
    const { sx, sy } = squash(this.chefSq.value);
    contactShadow(ctx, p.x, p.y + HALF_H * 0.3, 22, 0, 0.14);
    drawSprite(ctx, this.chef, cooking ? 'work' : 'idle', p.x, p.y + HALF_H * 0.3 + bob, {
      scale: 0.74,
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
      // a forged dish rides on real crockery, and finer crockery each tier
      const dish = plateFor(p.recipeId, this.zone.state.dishTier(p.recipeId));
      const under = dish && this.zone.assets.get('plates', dish);
      if (under) {
        drawIcon(ctx, under, p.x, p.y + float - lift + 8, PLATE_SIZE * 1.35, {
          scaleX: sx, scaleY: sy,
        });
      }
      // picked up or picked out, a plate says so by riding higher on a ring of
      // its own rather than by glowing — the halo read as a rendering fault
      if (p.selected || p.held) {
        ctx.save();
        ctx.strokeStyle = '#f8d167'; ctx.lineWidth = 3.5;
        ctx.setLineDash([7, 5]);
        ctx.lineDashOffset = -t * 22;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + float - lift + 14, 32, 15, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawIcon(ctx, s, p.x, p.y + float - lift, PLATE_SIZE * (p.held ? 1.12 : 1), {
        scaleX: sx, scaleY: sy,
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
      ring(ctx, p.x, y, 25, Math.min(1, active.t / active.dur), { lw: 4.5, fill: PAL.leaf });
    }
    const waiting = this.tickets.length + Math.max(0, this.cooking.length - 1);
    if (waiting > 0) {
      sticker(ctx, p.x + 22, y - 34, 30, 24, { r: 9, fill: '#f8d167', lift: 3 });
      text(ctx, `+${waiting}`, p.x + 37, y - 21, { size: 14 });
    }
  }
}
