// The crew, on the floor.
//
// Everyone you hire used to be a line in a panel and a flag on the state — the
// host seated people, the server ran plates, and neither of them existed as far
// as the room was concerned. They are here now: real sprites off the same
// strips the guests use, walking the room they work in.
//
// They do not do the work — the automation in Restaurant already does that, and
// tying the two together would mean a plate could not be run because somebody
// was standing in the wrong place. This is the room *showing* what you bought.
// Where they stand still matters though: kitchen crew keep to the pass and
// floor crew work the dining side, so a full roster reads as a staffed room
// rather than a crowd.

import { HALF_H, toScreen } from './iso.js';
import { TAU, findPath, range, rnd } from '../core/util.js';
import { STAFF_BY_ID } from '../data/catalog.js';
import { contactShadow, drawSprite, squash } from '../gfx/paint.js';
import { makeSpring, spring } from '../core/tween.js';

const SCALE = 0.66;       // a shade smaller than a guest, so the room reads
const STEP = 0.42;        // seconds per tile — staff amble, guests hop
const HOP = 9;
const PAUSE = [1.6, 4.2]; // how long they stand about between errands

class Worker {
  constructor(zone, staff, tile) {
    this.zone = zone;
    this.staff = staff;
    this.sprite = zone.assets.get('staff', staff.sprite);
    this.tile = { ...tile };
    this.pos = Worker.centre(tile);
    this.stepFrom = { ...this.pos };
    this.stepTo = { ...this.pos };
    this.stepT = 1;
    this.path = [];
    this.face = -1;
    this.bobT = rnd() * TAU;
    this.hopY = 0;
    this.wait = range(...PAUSE);
    this.sq = makeSpring(1);
    this.spawn = 0;
  }

  static centre(tile) {
    const p = toScreen(tile.c, tile.r);
    return { x: p.x, y: p.y + HALF_H * 0.3 };
  }

  get drawY() { return this.pos.y + this.hopY; }
  /** Same painter's key as everything else in the room — see iso.js. */
  get depth() { return this.pos.y * 2 + 6; }
  get walking() { return this.path.length > 0; }

  goTo(tile, walkable) {
    const path = findPath(this.tile, tile, walkable);
    if (!path || !path.length) return false;
    this.path = path;
    this.#beginStep();
    return true;
  }

  #beginStep() {
    const next = this.path[0];
    if (!next) return;
    this.stepFrom = { ...this.pos };
    this.stepTo = Worker.centre(next);
    this.stepT = 0;
    const dx = this.stepTo.x - this.stepFrom.x;
    if (Math.abs(dx) > 1) this.face = dx > 0 ? 1 : -1;
  }

  update(dt) {
    this.bobT += dt;
    if (this.spawn < 1) this.spawn = Math.min(1, this.spawn + dt * 3);
    spring(this.sq, 1, dt, 140, 14);

    if (!this.path.length) {
      this.hopY = Math.sin(this.bobT * 2.4) * 2.2;
      this.wait -= dt;
      return;
    }
    this.stepT += dt / STEP;
    if (this.stepT >= 1) {
      this.tile = { ...this.path[0] };
      this.pos = { ...this.stepTo };
      this.path.shift();
      this.sq.vel -= 1.4;
      if (this.path.length) { this.#beginStep(); return; }
      this.hopY = 0;
      this.wait = range(...PAUSE);
      return;
    }
    const t = this.stepT;
    this.pos.x = this.stepFrom.x + (this.stepTo.x - this.stepFrom.x) * t;
    this.pos.y = this.stepFrom.y + (this.stepTo.y - this.stepFrom.y) * t;
    this.hopY = -Math.sin(Math.PI * t) * HOP;
  }

  draw(ctx) {
    if (!this.sprite || this.spawn <= 0.01) return;
    const { sx, sy } = squash(this.sq.value);
    // three frames on every staff strip: idle, walk, work
    const frame = this.walking ? 'walk' : 'idle';
    contactShadow(ctx, this.pos.x, this.pos.y + 2, 17, -this.hopY / HOP * 0.5, 0.13);
    drawSprite(ctx, this.sprite, frame, this.pos.x, this.drawY, {
      scale: SCALE,
      scaleX: sx, scaleY: sy * this.spawn,
      flipX: this.face > 0,
      alpha: this.spawn,
    });
  }
}

export class Crew {
  /** @param {import('./restaurant.js').Restaurant} zone */
  constructor(zone) {
    this.zone = zone;
    this.workers = [];
    this.sig = '';
  }

  /**
   * Rebuild the roster when the hire list changes.
   *
   * Only the crews that belong in this room turn up: the mechanic and the
   * boiler operator work the factory, and a manager who has never been on the
   * floor is not going to start now.
   */
  sync() {
    const ids = (this.zone.state.staff ?? []).filter((id) => {
      const s = STAFF_BY_ID[id];
      return s && (s.crew === 'floor' || s.crew === 'kitchen');
    });
    const sig = ids.join(',');
    if (sig === this.sig) return;
    this.sig = sig;

    const kept = new Map(this.workers.map((w) => [w.staff.id, w]));
    this.workers = ids.map((id) => {
      const had = kept.get(id);
      if (had) return had;
      const staff = STAFF_BY_ID[id];
      return new Worker(this.zone, staff, this.#post(staff) ?? this.zone.entry);
    });
  }

  /** Where somebody of this crew stands when they have nothing on. */
  #post(staff) {
    const z = this.zone;
    const near = staff.crew === 'kitchen' ? z.passes[0] : null;
    const spots = [];
    for (let c = 0; c < z.cols; c++) {
      for (let r = 0; r < z.rows; r++) {
        if (!z.walkable(c, r)) continue;
        if (near) {
          // the kitchen side: within a couple of tiles of the pass
          if (Math.abs(c - near.c) + Math.abs(r - near.r) > 3) continue;
        } else if (z.behind?.has(z.key(c, r))) continue;
        spots.push({ c, r });
      }
    }
    if (!spots.length) return null;
    return spots[(rnd() * spots.length) | 0];
  }

  update(dt) {
    this.sync();
    for (const w of this.workers) {
      w.update(dt);
      if (w.walking || w.wait > 0) continue;
      const to = this.#post(w.staff);
      if (to && !(to.c === w.tile.c && to.r === w.tile.r)) {
        if (!w.goTo(to, this.zone.walkable)) w.wait = range(...PAUSE);
      } else {
        w.wait = range(...PAUSE);
      }
    }
  }

  /** Push depth-sorted draw jobs onto the room's list. */
  collect(ctx, list) {
    for (const w of this.workers) list.push({ d: w.depth, fn: () => w.draw(ctx) });
  }
}
