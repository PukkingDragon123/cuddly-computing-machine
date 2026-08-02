// Guests. Papercraft billboards that hop, bob, flip when they turn, and chomp
// their way through a dish before paying up.

import { HALF_H, toScreen } from './iso.js';
import { TAU, clamp, findPath, range, rnd } from '../core/util.js';
import { Ease, makeSpring, spring } from '../core/tween.js';
import { RARITY_BY_ID, rollRarity } from '../data/guests.js';
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
    const w = 58, h = 52;
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
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y + 2, 40, 20, 0, 0, TAU);
    ctx.fill();
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
    ctx.strokeStyle = '#5f3d26';
    ctx.lineWidth = 2;
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
      glow: highlight ? '#f8d167' : (this.rarity?.aura ?? null),
      glowWidth: highlight ? 3.5 : 2.6,
    });
    this.#rarityMark(ctx);

    // held dish, shrinking bite by bite
    if (this.state === CS.EAT && this.plate) {
      const s = this.zone.assets.get('food', this.plate);
      const left = 1 - this.bites / BITES;
      if (s && left > 0.02) {
        const bob = Math.sin(this.bobT * 6) * 2;
        drawIcon(ctx, s, this.pos.x + this.face * 24, this.headY + 46 + bob, 52 * (0.55 + left * 0.45), { alpha: this.alpha });
      }
    }
  }

  /** Bubbles and meters, drawn after every sprite so nothing occludes them. */
  drawOverlay(ctx, t) {
    if (this.state === CS.EAT || this.state === CS.DONE) {
      if (this.state === CS.DONE && this.stateT < 0.9) {
        text(ctx, 'Yum!', this.pos.x, this.headY - 18, { size: 20, fill: '#e4652f', stroke: '#fff8e6', lw: 5 });
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
    bubble(ctx, cx, bottom, box.w, box.h, { fill: this.mood === 'cross' ? '#fbe0d6' : '#fdf6e6' });

    const icx = cx, icy = box.y + box.h / 2;
    if (this.state === CS.QUEUE) {
      const chair = this.zone.assets.get('furn_plain', 'chair_r');
      if (chair) drawIcon(ctx, chair, icx, icy + 2, 36);
      text(ctx, '?', icx + 19, icy - 13, { size: 17, fill: '#e4652f', stroke: '#fff8e6', lw: 4 });
    } else {
      const s = this.dish ? this.zone.assets.get('food', this.dish) : null;
      if (s) drawIcon(ctx, s, icx, icy + 1, 38, { alpha: this.state === CS.WAIT ? 0.55 : 1 });
      if (this.state === CS.ORDER) {
        text(ctx, '!', icx + 20, icy - 14, { size: 20, fill: '#e4652f', stroke: '#fff8e6', lw: 4.5 });
      } else {
        const cook = this.zone.cookProgress(this);
        ring(ctx, icx, icy, 23, cook, { lw: 4, fill: '#8bbb6a' });
      }
    }
    ctx.restore();

    const pcol = this.patience > 0.6 ? '#8bbb6a' : this.patience > 0.3 ? '#f8d167' : '#e4652f';
    meter(ctx, cx, box.y + box.h + 14 + wobble, 46, 9, this.patience, pcol);
  }
}

/** Random guest flavour — a sprite plus patience and appetite variation. */
/**
 * Roll up a guest: which species walked in, and how rare a customer they are.
 * `pull` is the harbour's draw on the rare tiers — reputation, posters and the
 * trade research all raise it.
 */
export function rollGuest(assets, pull = 0) {
  const list = assets.list('customers');
  const sprite = list[(rnd() * list.length) | 0];
  const rarity = rollRarity(pull, rnd);
  return {
    sprite,
    species: sprite?.id ?? null,
    rarity,
    patience: range(0.82, 1.3) * rarity.patience,
    eatTime: range(3.4, 5.2),
    fussy: clamp(rnd(), 0, 1),
  };
}
