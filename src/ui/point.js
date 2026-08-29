// The pointer.
//
// One element that follows whatever you are being told to press, used by both
// the guide and the job list so there is only ever one thing pointing at
// anything. It is a ring round the target with Tako leaning in beside it, and
// it takes no pointer events whatsoever — the whole point is to draw the eye,
// never to catch the finger that follows it.
//
// He used to be an arrow. A drawn one, in the right colours, and it still
// looked like a symbol in a game that has no other symbols in it: everything
// else on screen is a picture of a thing. Since he is already the voice telling
// you what to do, having him lean round the edge of the button and point at it
// is the same instruction twice rather than two different ones.
//
// Nothing here animates the target itself. A control that is being pointed at
// still has to be a still box you can hit, so the motion lives entirely on this
// overlay, which sits on top of it and cannot be tapped.

import { $, show } from './dom.js';
import { CHEF_SPRITE } from '../data/catalog.js';

/** How far outside the target the ring sits. */
const PAD = 10;

export class Point {
  /** @param {import('../core/loader.js').Assets} [assets] for the chef's art */
  constructor(assets = null) {
    this.el = $('#point');
    this.ring = $('#point-ring');
    this.hand = $('#point-hand');
    this.on = false;
    this.loudUntil = 0;
    // the strip is three poses wide and the stylesheet holds it on the first
    const url = assets?.url('staff', CHEF_SPRITE);
    if (url && this.hand) this.hand.style.backgroundImage = `url("${url}")`;
  }

  /**
   * Point at a screen-space box.
   *
   * `loud` is for the moment somebody asks "where?" — it says the same thing
   * bigger for a couple of seconds and then settles back down, so a pointer
   * that is always up does not have to shout all the time to be noticed.
   */
  at(box, { loud = false } = {}) {
    if (!this.el || !box) { this.hide(); return; }
    const e = this.el;
    if (!this.on) { show(e, true); this.on = true; }

    // ...and kept on screen, so a ring round something up against an edge is a
    // ring rather than three quarters of one
    const w = box.w + PAD * 2;
    const h = box.h + PAD * 2;
    const x = Math.min(Math.max(box.x - PAD, 2), Math.max(2, window.innerWidth - w - 2));
    const y = Math.min(Math.max(box.y - PAD, 2), Math.max(2, window.innerHeight - h - 2));
    e.style.left = `${Math.round(x)}px`;
    e.style.top = `${Math.round(y)}px`;
    e.style.width = `${Math.round(w)}px`;
    e.style.height = `${Math.round(h)}px`;
    e.style.setProperty('--r', `${Math.round(Math.min(w, h) / 2)}px`);

    /*
     * Which side the hand stands on.
     *
     * Sideways by default, toward the middle of the screen, because the things
     * being pointed at are usually in a column down an edge and a hand under
     * one of them lands on the next one. Underneath only when the target is
     * both near the top and near the middle, where there is no side to use.
     */
    const vw = window.innerWidth;
    const cx = x + w / 2;
    const below = y < 96 && cx > vw * 0.3 && cx < vw * 0.7;
    e.classList.toggle('from-below', below);
    e.classList.toggle('from-left', !below && cx < vw * 0.55);
    e.classList.toggle('from-right', !below && cx >= vw * 0.55);

    if (loud) {
      this.loudUntil = performance.now() + 2200;
      e.classList.remove('loud');
      void e.offsetWidth;
      e.classList.add('loud');
    } else if (this.loudUntil && performance.now() > this.loudUntil) {
      this.loudUntil = 0;
      e.classList.remove('loud');
    }
  }

  hide() {
    if (!this.el || !this.on) return;
    show(this.el, false);
    this.el.classList.remove('loud');
    this.loudUntil = 0;
    this.on = false;
  }

  /**
   * Resolve a spot from data/quests.js into a box on screen.
   *
   * A trail of selectors resolves to the last one actually showing, which is
   * what makes the pointer walk you inward: the rail button until the panel is
   * open, then the tab inside it. A `world` spot is a thing in the room, so it
   * goes through the camera.
   */
  static box(spot, game) {
    if (!spot) return null;
    if (typeof spot === 'object' && !Array.isArray(spot) && spot.world) {
      let t = null;
      try { t = spot.world(game); } catch { return null; }
      if (!t) return null;
      const w = Point.#worldPoint(t, game);
      if (!w) return null;
      const p = game.zone.cam.toScreen(w.x, w.y);
      const r = 46;
      return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
    }
    let found = null;
    for (const sel of [].concat(spot)) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      // zero-sized or scrolled out of the window is not on screen
      if (!b.width || !b.height) continue;
      if (b.bottom < 0 || b.top > window.innerHeight) continue;
      found = { x: b.left, y: b.top, w: b.width, h: b.height };
    }
    return found;
  }

  /** Guests, seats, plates and machines all say where they are differently. */
  static #worldPoint(t, game) {
    // a guest's middle, not the top of their head — up there the ring lands on
    // the order bubble instead of the person you are being told to tap
    if (t.pos) return { x: t.pos.x, y: (t.pos.y + (t.headY ?? t.pos.y)) / 2 };
    if (typeof t.x === 'number' && typeof t.y === 'number') return { x: t.x, y: t.y };
    if (typeof t.c === 'number' && typeof t.r === 'number') {
      const s = game.zone.tileToWorld?.(t.c, t.r);
      if (s) return s;
      return { x: (t.c - t.r) * 64, y: (t.c + t.r) * 32 };
    }
    return null;
  }
}
