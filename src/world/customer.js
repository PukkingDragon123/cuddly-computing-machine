// Guests. Papercraft billboards that hop, bob, flip when they turn, and chomp
// their way through a dish before paying up.

import { HALF_H, toScreen } from './iso.js';
import { TAU, clamp, findPath, range, rnd } from '../core/util.js';
import { Ease, makeSpring, spring } from '../core/tween.js';
import { COMMON_CAST, RARITY_BY_ID, rollRarity } from '../data/guests.js';
import { plateFor } from '../data/progress.js';
import { bubble, contactShadow, drawIcon, drawSprite, meter, ring, squash, text } from '../gfx/paint.js';

export const CHAR_SCALE = 0.72;

export const CS = {
  ENTER: 'enter', QUEUE: 'queue', WALK: 'walk', SEAT: 'seat',
  ORDER: 'order', WAIT: 'wait', EAT: 'eat', DONE: 'done', LEAVE: 'leave',
};

const STEP = 0.34;        // seconds per tile hop
const HOP_H = 15;         // hop arc height, px
const FLIP_TIME = 0.16;   // paper-flip turn
const BITES = 4;

export class Customer {
  constructor(zone, sprite, { tile, pos, patience = 1 }) {
    this.zone = zone;
    this.sprite = sprite;
    this.id = `g${(rnd() * 1e9) | 0}${Date.now() % 1000}`;

    this.tile = { ...tile };
    this.pos = pos ? { ...pos } : this.#center(tile);
    this.stepFrom = { ...this.pos };
    this.stepTo = { ...this.pos };
    this.stepT = 1;
    this.path = [];

    this.state = CS.ENTER;
    this.stateT = 0;
    this.face = -1;
    this.flip = 0;
    this.bobT = rnd() * TAU;
    this.hopY = 0;
    this.sq = makeSpring(1);   // squash; width is derived so volume holds
    this.spawn = 0;            // 0..1 pop-in
    this.alpha = 1;
    this.tilt = 0;

    this.patienceMax = patience;
    this.patience = 1;
    this.impatient = false;

    this.dish = null;          // recipe id they want
    this.ordered = false;      // ticket sent to the kitchen
    this.seat = null;          // { c, r } chair tile
    this.table = null;
    this.plate = null;         // delivered dish sprite id
    this.bites = 0;
    this.biteT = 0;
    this.eatTime = 4.2;
    this.seated = false;
    this.seatPatience = 1;   // comfy bench vs hard stool
    this.reward = null;
    this.dead = false;
    this.mood = 'ok';          // ok | rush | cross
  }

  /* ------------------------------------------------------------- geometry */

  #center(tile) {
    const p = toScreen(tile.c, tile.r);
    return { x: p.x, y: p.y + HALF_H * 0.3 };
  }

  /** Seated guests ride a little higher so they read as on the chair. */
  get drawY() { return this.pos.y + this.hopY + (this.seated ? -11 : 0); }
  get headY() { return this.drawY - this.sprite.fh * CHAR_SCALE - 6; }
  /**
   * Painter's-order key on the same scale as depthOf() in iso.js — pos.y is half
   * a tile step, so doubling it lines guests up with furniture. Seated guests get
   * a nudge so they sit in front of their own chair.
   */
  get depth() { return this.pos.y * 2 + (this.seated ? 30 : 8); }

  /** Loose box for tap targeting, in world pixels. */
  hitTest(p) {
    const w = this.sprite.fw * CHAR_SCALE * 0.8;
    const h = this.sprite.fh * CHAR_SCALE;
    return p.x > this.pos.x - w / 2 && p.x < this.pos.x + w / 2
        && p.y > this.drawY - h && p.y < this.drawY + 10;
  }

  /** The floating bubble is a second, bigger tap target. */
  bubbleHit(p) {
    if (!this.#showBubble()) return false;
    const b = this.#bubbleBox();
    return p.x > b.x - 6 && p.x < b.x + b.w + 6 && p.y > b.y - 6 && p.y < b.y + b.h + 10;
  }

  #bubbleBox() {
    const w = 76, h = 70;
    return { x: this.pos.x - w / 2, y: this.headY - 26 - h, w, h };
  }

  /* ----------------------------------------------------------- navigation */

  walkTo(tile, walkable) {
    const path = findPath(this.tile, tile, walkable);
    if (!path) return false;
    this.path = path;
    this.#beginStep();
    return true;
  }

  #beginStep() {
    const next = this.path[0];
    if (!next) return;
    this.stepFrom = { ...this.pos };
    this.stepTo = this.#center(next);
    this.stepT = 0;
    const dx = this.stepTo.x - this.stepFrom.x;
    if (Math.abs(dx) > 1) this.#faceTo(dx > 0 ? 1 : -1);
  }

  /** Papercraft turn: squeeze to an edge, swap sides, spring back. */
  #faceTo(dir) {
    if (dir === this.face) return;
    this.face = dir;
    this.flip = FLIP_TIME;
  }

  #move(dt) {
    if (!this.path.length) return true;
    this.stepT += dt / STEP;
    if (this.stepT >= 1) {
      this.tile = { ...this.path[0] };
      this.pos = { ...this.stepTo };
      this.path.shift();
      this.#land();
      if (this.path.length) { this.#beginStep(); return false; }
      this.hopY = 0;
      return true;
    }
    const t = this.stepT;
    this.pos.x = this.stepFrom.x + (this.stepTo.x - this.stepFrom.x) * t;
    this.pos.y = this.stepFrom.y + (this.stepTo.y - this.stepFrom.y) * t;
    this.hopY = -Math.sin(Math.PI * t) * HOP_H;
    this.tilt = Math.sin(t * Math.PI) * 0.04 * this.face;
    return false;
  }

  #land() {
    this.sq.vel -= 2.2;
    this.zone.fx.puff(this.pos.x, this.pos.y + 2, 2, 6);
  }

  /* --------------------------------------------------------------- states */

  setState(s) { this.state = s; this.stateT = 0; }

  /** Pop into existence at the door. */
  arrive() {
    this.spawn = 0;
    this.zone.fx.sparkles(this.pos.x, this.pos.y - 40, 5, 16);
  }

  update(dt) {
    this.stateT += dt;
    this.bobT += dt;
    if (this.spawn < 1) this.spawn = Math.min(1, this.spawn + dt * 4);
    if (this.flip > 0) this.flip = Math.max(0, this.flip - dt);
    spring(this.sq, 1, dt, 150, 15);

    const drains = this.state === CS.QUEUE || this.state === CS.ORDER || this.state === CS.WAIT;
    if (drains) {
      this.patience -= dt / (this.patienceMax * this.zone.patienceSeconds(this.state, this));
      if (this.patience <= 0) { this.zone.walkOut(this); return; }
      this.mood = this.patience < 0.3 ? 'cross' : this.patience < 0.6 ? 'rush' : 'ok';
      if (this.patience < 0.3 && !this.impatient) {
        this.impatient = true;
        this.sq.vel -= 2.4;
      }
    }

    switch (this.state) {
      case CS.ENTER:
      case CS.WALK:
      case CS.LEAVE:
        if (this.#move(dt)) this.zone.onArrived(this);
        break;

      case CS.QUEUE:
        this.#idleBob();
        break;

      case CS.SEAT:
        this.#idleBob(0.6);
        if (this.stateT > 0.45) this.zone.beginOrder(this);
        break;

      case CS.ORDER:
      case CS.WAIT:
        this.#idleBob(0.8);
        break;

      case CS.EAT:
        this.#eat(dt);
        break;

      case CS.DONE:
        this.#idleBob(1.3);
        break;
    }
  }

  #idleBob(k = 1) {
    this.hopY = Math.sin(this.bobT * 2.6) * 2.4 * k;
    this.tilt = Math.sin(this.bobT * 1.3) * 0.012 * k;
  }

  /** Cartoon chomping: four squashy bites, crumbs, hearts, then a Yum. */
  #eat(dt) {
    const per = this.eatTime / BITES;
    this.biteT += dt;
    if (this.biteT >= per && this.bites < BITES) {
      this.biteT -= per;
      this.bites++;
      this.sq.vel -= 3.6;
      this.zone.fx.crumbs(this.pos.x + this.face * 8, this.headY + 34, 4);
      this.zone.sfx.play('chomp');
      if (this.bites % 2 === 0) this.zone.fx.hearts(this.pos.x + this.face * 14, this.headY - 4, 1);
    }
    // chew wobble between bites
    const phase = this.biteT / per;
    this.hopY = Math.sin(this.bobT * 3.2) * 2 - Math.max(0, Math.sin(phase * Math.PI * 3)) * 2.5;
    this.tilt = Math.sin(this.bobT * 9) * 0.045;
    if (this.bites >= BITES) this.zone.finishMeal(this);
  }

  /* ----------------------------------------------------------------- draw */

  /**
   * A ring of light on the floor under the rare tiers. It goes under the sprite
   * rather than around it so a VIP still reads as a VIP while the tap-me glow is
   * also on them — two glows on the same silhouette just look like a mistake.
   */
  #rarityAura(ctx) {
    const c = this.rarity?.aura;
    if (!c || this.alpha < 0.05) return;
    const pulse = 0.62 + Math.sin(this.bobT * 2.2) * 0.14;
    ctx.save();
    ctx.globalAlpha = this.alpha * pulse;
    const g = ctx.createRadialGradient(this.pos.x, this.pos.y + 2, 2, this.pos.x, this.pos.y + 2, 40);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(255, 255, 255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y + 2, 40, 20, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * A heart over the head of somebody who asked you for something.
   *
   * Drawn rather than a sprite because it has to sit exactly on the head at any
   * zoom, and it beats the rarity crown to the spot — a favour is the more
   * urgent fact about a guest than what tier they are.
   */
  #favourMark(ctx) {
    if (!this.favour?.asked || this.alpha < 0.05) return;
    const y = this.headY - 26 + Math.sin(this.bobT * 3.4) * 3;
    const x = this.pos.x - 20;
    const r = 8 + Math.sin(this.bobT * 6) * 0.7;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.3, x - r * 0.55, y - r * 1.25, x, y - r * 0.35);
    ctx.bezierCurveTo(x + r * 0.55, y - r * 1.25, x + r * 1.5, y - r * 0.3, x, y + r * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#a8b8dc';
    ctx.fill();
    ctx.strokeStyle = '#28475d';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  /** A little crown or star above the head, so the tier survives a screenshot. */
  #rarityMark(ctx) {
    const mark = this.rarity?.mark;
    if (!mark || this.alpha < 0.05) return;
    const y = this.headY - 8 + Math.sin(this.bobT * 2.6) * 2;
    const x = this.pos.x + 20;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (mark === 'crown') {
      ctx.moveTo(x - 9, y + 5); ctx.lineTo(x - 9, y - 4); ctx.lineTo(x - 4.5, y);
      ctx.lineTo(x, y - 6); ctx.lineTo(x + 4.5, y); ctx.lineTo(x + 9, y - 4);
      ctx.lineTo(x + 9, y + 5);
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 10;
        const rr = i % 2 ? 3.4 : 8;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    }
    ctx.closePath();
    ctx.fillStyle = this.rarity.aura;
    ctx.fill();
    ctx.strokeStyle = '#28475d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * "This one is waiting for you." A pointer over the head, not a light around
   * the silhouette: a coloured halo on hand-drawn art reads as a rendering
   * mistake, and it fought the rarity aura for the same edge.
   */
  #tapMark(ctx, topY) {
    if (this.alpha < 0.05) return;
    const y = topY - 10 + Math.sin(this.bobT * 5) * 3;
    const x = this.pos.x;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 6);
    ctx.lineTo(x + 8, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#84b7db';
    ctx.fill();
    ctx.strokeStyle = '#28475d';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
  }

  #frame() {
    if (this.state === CS.EAT) return 'eat';
    if (this.state === CS.ENTER || this.state === CS.WALK || this.state === CS.LEAVE) return 'walk';
    return 'idle';
  }

  #showBubble() {
    return this.state === CS.QUEUE || this.state === CS.ORDER || this.state === CS.WAIT;
  }

  draw(ctx, highlight = false) {
    // scale-in eases once instead of oscillating, so arrivals read as a pop
    const pop = this.spawn < 1 ? 0.62 + 0.38 * Ease.outBack(this.spawn) : 1;
    const { sx, sy } = squash(this.sq.value);
    // paper flip pinches width only, and never all the way to zero
    const flipK = this.flip > 0 ? 0.34 + 0.66 * Math.abs(Math.cos((1 - this.flip / FLIP_TIME) * Math.PI)) : 1;

    contactShadow(ctx, this.pos.x, this.pos.y + 2, 21, -this.hopY / HOP_H, 0.15);
    this.#rarityAura(ctx);

    drawSprite(ctx, this.sprite, this.#frame(), this.pos.x, this.drawY, {
      scale: CHAR_SCALE,
      scaleX: sx * pop * flipK,
      scaleY: sy * pop,
      rot: this.tilt,
      alpha: this.alpha,
      flipX: this.face < 0,
    });
    // the overlay pass draws the pointer, so a bubble never covers it
    this.hi = highlight;
    this.#rarityMark(ctx);
    this.#favourMark(ctx);

    // held dish, shrinking bite by bite
    if (this.state === CS.EAT && this.plate) {
      const s = this.zone.assets.get('food', this.plate);
      const left = 1 - this.bites / BITES;
      if (s && left > 0.02) {
        const bob = Math.sin(this.bobT * 6) * 2;
        const dish = plateFor(this.plate, this.zone.state.dishTier(this.plate));
        const under = dish && this.zone.assets.get('plates', dish);
        if (under) {
          drawIcon(ctx, under, this.pos.x + this.face * 24, this.headY + 52 + bob, 60,
            { alpha: this.alpha });
        }
        drawIcon(ctx, s, this.pos.x + this.face * 24, this.headY + 46 + bob, 52 * (0.55 + left * 0.45), { alpha: this.alpha });
      }
    }
  }

  /** A round sticker on the bubble's corner, carrying one big glyph. */
  #badge(ctx, x, y, glyph) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y + 2.5, 13, 13, 0, 0, TAU);
    ctx.fillStyle = '#7395ad'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, 13, 13, 0, 0, TAU);
    ctx.fillStyle = '#84b7db'; ctx.fill();
    ctx.strokeStyle = '#28475d'; ctx.lineWidth = 3; ctx.stroke();
    text(ctx, glyph, x, y + 0.5, { size: 20, fill: '#2a64aa' });
    ctx.restore();
  }

  /** Bubbles and meters, drawn after every sprite so nothing occludes them. */
  drawOverlay(ctx, t) {
    if (this.state === CS.EAT || this.state === CS.DONE) {
      if (this.state === CS.DONE && this.stateT < 0.9) {
        text(ctx, 'Yum!', this.pos.x, this.headY - 18, { size: 20, fill: '#4382d0', stroke: '#f5f9fc', lw: 5 });
      }
      return;
    }
    if (!this.#showBubble()) return;

    const box = this.#bubbleBox();
    const cx = this.pos.x;
    const bottom = box.y + box.h;
    const wobble = Math.sin(t * 3 + this.bobT) * 1.6;

    ctx.save();
    ctx.translate(0, wobble);
    bubble(ctx, cx, bottom, box.w, box.h, {
      r: 16, lw: 3.4,
      // patience running out is not a hue change any more — the bubble goes
      // grey-blue and dark, which reads even on a white floor
      fill: this.mood === 'cross' ? '#b7cbdd' : '#f5f9fb',
    });

    // dead centre of the bubble, always. The art used to sit left of middle with
    // a "!" hung off its shoulder, which clipped the border and read as a bug.
    const icx = cx;
    const icy = box.y + box.h / 2;
    if (this.state === CS.QUEUE) {
      const chair = this.zone.assets.get('furn_plain', 'chair_f');
      if (chair) drawIcon(ctx, chair, icx, icy, 46);
      else text(ctx, '?', icx, icy, { size: 30, fill: '#4382d0', stroke: '#f5f9fc', lw: 5 });
    } else {
      const s = this.dish ? this.zone.assets.get('food', this.dish) : null;
      if (s) drawIcon(ctx, s, icx, icy, 46, { alpha: this.state === CS.WAIT ? 0.6 : 1 });
      if (this.state === CS.WAIT) {
        ring(ctx, icx, icy, 29, this.zone.cookProgress(this), { lw: 4.5, fill: '#74a1b1' });
      }
    }

    // and the badge is a sticker on the corner rather than loose type over the
    // edge, so it can be as big as it likes
    const mark = this.state === CS.ORDER ? '!' : this.state === CS.QUEUE ? '?' : null;
    if (mark) this.#badge(ctx, box.x + box.w - 3, box.y + 3, mark);
    ctx.restore();

    // Patience used to run green → amber → red. With one hue to work in it runs
    // bright → mid → dark instead: the bar going *dim* is the warning, and a
    // shrinking dark bar on a white floor is easier to catch across the room
    // than a shrinking red one ever was.
    const pcol = this.patience > 0.6 ? '#5ec6f5' : this.patience > 0.3 ? '#3d8fc4' : '#1b4269';
    meter(ctx, cx, box.y + box.h + 16 + wobble, 52, 10, this.patience, pcol);
    if (this.hi) this.#tapMark(ctx, box.y + wobble);
  }
}

/** Random guest flavour — a sprite plus patience and appetite variation. */
/**
 * Roll up a guest: which species walked in, and how rare a customer they are.
 * `pull` is the harbour's draw on the rare tiers — reputation, posters and the
 * trade research all raise it.
 */
export function rollGuest(assets, pull = 0) {
  const rarity = rollRarity(pull, rnd);
  // a tier with a cast of its own draws from it; the everyday tier draws from
  // everyone else, so a grandee never wanders in as a regular
  const pool = rarity.cast ?? COMMON_CAST;
  const species = pool[(rnd() * pool.length) | 0];
  const sprite = assets.get('customers', species) ?? assets.list('customers')[0];
  return {
    sprite,
    species,
    rarity,
    patience: range(0.82, 1.3) * rarity.patience,
    eatTime: range(3.4, 5.2),
    fussy: clamp(rnd(), 0, 1),
  };
}
