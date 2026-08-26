// World-space particle effects: coins, hearts, stars, crumbs, steam, pop text.

import { TAU, clamp, range, rnd } from '../core/util.js';
import { ellipse, heartPath, starPath, text } from './paint.js';

const GRAV = 900;

/**
 * How much of what every emitter asks for actually gets made.
 *
 * Every one of these was tuned on its own, in isolation, and they looked lovely
 * one at a time. Together — a plate landing, a coin burst, hearts off a happy
 * guest, sparkles off the pass, a puff off a chair, all inside a second — the
 * room disappeared behind its own confetti and you could not see the game you
 * were playing. Rather than re-argue thirty call sites, the counts are scaled
 * once, here: the call sites still say how showy each moment is *relative to
 * the others*, which is the part worth keeping.
 *
 * There is a floor of one, because an effect that sometimes emits nothing is
 * worse than a small one — a plate that lands silently reads as a bug.
 */
const THRIFT = 0.3;
const many = (n) => Math.max(1, Math.round(n * THRIFT));

/** A cap, so a pile-up cannot cost frames either. Oldest go first. */
const MAX_PARTS = 70;

export class Fx {
  constructor() { this.parts = []; this.shake = 0; }

  #add(p) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push(p);
    return p;
  }

  clear() { this.parts.length = 0; }

  /**
   * Screen shake — or rather, the absence of it.
   *
   * The camera lurched every time a chair went down or a plate landed. In a
   * game about arranging a quiet room that is not weight, it is a flinch, and
   * it was most of what made the place feel frantic. The hook stays so the call
   * sites still read honestly; it simply does very little now, and the calls
   * that used to be worth a real jolt are the only ones you notice.
   */
  kick(amount = 5) { this.shake = Math.max(this.shake, Math.min(1.4, amount * 0.28)); }

  /* ------------------------------------------------------------- emitters */

  coins(x, y, count = 6, spread = 60) {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'coin', x, y,
        vx: range(-spread, spread), vy: range(-460, -280),
        g: GRAV, life: 0, max: range(0.7, 1.05),
        size: range(11, 15), rot: range(0, TAU), spin: range(-9, 9), bounce: 1,
      });
    }
  }

  hearts(x, y, count = 3) {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'heart', x: x + range(-14, 14), y,
        vx: range(-30, 30), vy: range(-120, -70), g: -30,
        life: 0, max: range(0.85, 1.25), size: range(7, 11),
        wob: range(0, TAU), rot: range(-0.3, 0.3), spin: range(-1, 1),
        color: ['#ef7f9c', '#f4a0b4', '#e86f8e'][(rnd() * 3) | 0],
      });
    }
  }

  stars(x, y, count = 6) {
    for (let i = 0, k = many(count); i < k; i++) {
      // spread over what is actually emitted, not what was asked for, or a
      // thinned burst would only cover part of the circle
      const a = (i / k) * TAU + range(-0.3, 0.3);
      this.#add({
        kind: 'star', x, y,
        vx: Math.cos(a) * range(90, 190), vy: Math.sin(a) * range(60, 130) - 110,
        g: 520, life: 0, max: range(0.6, 0.95), size: range(7, 12),
        rot: range(0, TAU), spin: range(-13, 13), color: '#f8d167',
      });
    }
  }

  sparkles(x, y, count = 5, spread = 26) {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'spark', x: x + range(-spread, spread), y: y + range(-spread, spread),
        vx: range(-18, 18), vy: range(-52, -18), g: 40,
        life: 0, max: range(0.35, 0.65), size: range(3.5, 7),
        color: ['#fff6d8', '#f8d167', '#ffffff'][(rnd() * 3) | 0],
      });
    }
  }

  crumbs(x, y, count = 5, color = '#c98f5c') {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'crumb', x, y,
        vx: range(-130, 130), vy: range(-250, -90), g: GRAV,
        life: 0, max: range(0.45, 0.8), size: range(2.5, 5),
        rot: range(0, TAU), spin: range(-14, 14), color,
      });
    }
  }

  puff(x, y, count = 4, size = 12) {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'puff', x: x + range(-10, 10), y: y + range(-3, 3),
        vx: range(-45, 45), vy: range(-26, -6), g: -14,
        life: 0, max: range(0.34, 0.6), size: size * range(0.7, 1.25),
        color: 'rgba(255, 250, 236,0.9)',
      });
    }
  }

  steam(x, y) {
    this.#add({
      kind: 'puff', x: x + range(-5, 5), y,
      vx: range(-12, 12), vy: range(-52, -30), g: -22,
      life: 0, max: range(0.75, 1.15), size: range(7, 12),
      color: 'rgba(255, 255, 255,0.72)',
    });
  }

  /** Soap suds off a plate being washed: light, wobbly, and they pop. */
  bubbles(x, y, count = 3, spread = 14) {
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'bubble', x: x + range(-spread, spread), y: y + range(-4, 4),
        vx: range(-16, 16), vy: range(-46, -22), g: -18,
        life: 0, max: range(0.6, 1.15), size: range(3.5, 8),
        wob: range(0, TAU),
      });
    }
  }

  ripple(x, y, color = 'rgba(255, 255, 255,0.85)', max = 0.45, size = 60) {
    this.#add({ kind: 'ripple', x, y, life: 0, max, size, color, vx: 0, vy: 0, g: 0 });
  }

  /** Floating label — the "+24" that pops off a paying customer. */
  pop(x, y, label, { color = '#3d2c1c', stroke = '#fff8e6', size = 21, rise = 62, max = 1.0 } = {}) {
    this.#add({ kind: 'text', x, y, vx: 0, vy: 0, g: 0, life: 0, max, label, color, stroke, size, rise });
  }

  /** Wide splash of an ingredient/food icon jumping out of a machine. */
  spit(x, y, sprite, dir = 1) {
    this.#add({
      kind: 'sprite', x, y, sprite,
      vx: 70 * dir + range(-16, 16), vy: range(-260, -190), g: GRAV,
      life: 0, max: 0.62, size: range(26, 32), rot: 0, spin: range(-6, 6),
    });
  }

  /**
   * A handful of real sprites thrown into the air.
   *
   * The drawn particles below — coins, hearts, stars — are shapes this file
   * knows how to draw. This one throws the game's own art instead, which is
   * what you want the moment the thing being celebrated *has* art: the dish you
   * served, the ingredient that arrived, the fish that was asked for.
   */
  burst(sprite, x, y, count = 6, { spread = 90, size = 26, up = 320 } = {}) {
    if (!sprite) return;
    for (let i = 0, k = many(count); i < k; i++) {
      this.#add({
        kind: 'sprite', x, y, sprite,
        vx: range(-spread, spread), vy: range(-up, -up * 0.6), g: GRAV * 0.8,
        life: 0, max: range(0.7, 1.1),
        size: range(size * 0.75, size * 1.25), rot: range(-0.4, 0.4), spin: range(-7, 7),
      });
    }
  }

  /** One item tossed up and held a beat — a harvest you can see leaving the pen. */
  fly(sprite, x, y) {
    this.#add({
      kind: 'sprite', x, y, sprite,
      vx: range(-24, 24), vy: range(-320, -260), g: GRAV * 0.55,
      life: 0, max: 0.85, size: range(30, 36), rot: 0, spin: range(-3, 3),
    });
  }

  /* --------------------------------------------------------------- update */

  update(dt) {
    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.05) this.shake = 0;
    const p = this.parts;
    for (let i = p.length - 1; i >= 0; i--) {
      const o = p[i];
      o.life += dt;
      if (o.life >= o.max) { p.splice(i, 1); continue; }
      if (o.kind !== 'text' && o.kind !== 'ripple') {
        o.vy += (o.g ?? 0) * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.spin) o.rot += o.spin * dt;
      }
    }
  }

  /* ----------------------------------------------------------------- draw */

  draw(ctx) {
    for (const o of this.parts) {
      const t = o.life / o.max;
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(fade, 0, 1);
      switch (o.kind) {
        case 'coin': {
          // sand dollar: flat disc that flips as it spins
          const squash = Math.abs(Math.cos(o.rot));
          ctx.translate(o.x, o.y);
          ellipse(ctx, 0, 2.5, o.size * squash * 0.9, o.size * 0.9, 'rgba(90, 67, 38,0.25)');
          ellipse(ctx, 0, 0, o.size * squash, o.size, '#f8d167');
          ctx.strokeStyle = '#3d2c1c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.2, o.size * squash), o.size, 0, 0, TAU); ctx.stroke();
          if (squash > 0.35) {
            ctx.save(); ctx.scale(squash, 1);
            starPath(ctx, 0, 0, o.size * 0.56, o.size * 0.24);
            ctx.fillStyle = '#fff3cd'; ctx.fill();
            ctx.strokeStyle = '#d3a53a'; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.restore();
          }
          break;
        }
        case 'heart': {
          const s = o.size * (1 + Math.sin(o.life * 14) * 0.09);
          ctx.translate(o.x + Math.sin(o.wob + o.life * 5) * 8, o.y);
          ctx.rotate(o.rot);
          heartPath(ctx, 0, 0, s);
          ctx.fillStyle = o.color; ctx.fill();
          ctx.strokeStyle = '#3d2c1c'; ctx.lineWidth = 2; ctx.stroke();
          break;
        }
        case 'star': {
          ctx.translate(o.x, o.y); ctx.rotate(o.rot);
          starPath(ctx, 0, 0, o.size, o.size * 0.45);
          ctx.fillStyle = o.color; ctx.fill();
          ctx.strokeStyle = '#3d2c1c'; ctx.lineWidth = 2; ctx.stroke();
          break;
        }
        case 'spark': {
          const s = o.size * (1 - t * 0.4);
          ctx.translate(o.x, o.y);
          ctx.fillStyle = o.color;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU;
            ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s * (i % 2 ? 0.32 : 1));
          }
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'crumb': {
          ctx.translate(o.x, o.y); ctx.rotate(o.rot);
          ctx.fillStyle = o.color;
          ctx.fillRect(-o.size / 2, -o.size / 2, o.size, o.size * 0.8);
          break;
        }
        case 'puff': {
          const s = o.size * (0.6 + t * 0.9);
          ctx.globalAlpha *= 0.85;
          ellipse(ctx, o.x, o.y, s, s * 0.82, o.color);
          break;
        }
        case 'bubble': {
          // grows as it rises, then snaps at the end of its life
          const pop = t > 0.86;
          const s = o.size * (pop ? 1.35 - (t - 0.86) * 4 : 0.7 + t * 0.5);
          if (s <= 0.4) break;
          const bx = o.x + Math.sin(o.wob + o.life * 6) * 5;
          ctx.globalAlpha *= 0.85;
          ctx.beginPath();
          ctx.ellipse(bx, o.y, s, s, 0, 0, TAU);
          ctx.fillStyle = 'rgba(255, 250, 236,0.62)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255,0.95)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ellipse(ctx, bx - s * 0.3, o.y - s * 0.34, s * 0.28, s * 0.22, 'rgba(255, 255, 255,0.95)');
          break;
        }
        case 'ripple': {
          const s = o.size * t;
          ctx.globalAlpha *= 1 - t;
          ctx.strokeStyle = o.color; ctx.lineWidth = 3 * (1 - t) + 1;
          ctx.beginPath(); ctx.ellipse(o.x, o.y, s, s * 0.5, 0, 0, TAU); ctx.stroke();
          break;
        }
        case 'sprite': {
          if (o.sprite) {
            const { sx, sy, sw, sh } = o.sprite.rect(0);
            const sc = o.size / Math.max(sw, sh);
            ctx.translate(o.x, o.y); ctx.rotate(o.rot);
            ctx.drawImage(o.sprite.img, sx, sy, sw, sh, -sw * sc / 2, -sh * sc / 2, sw * sc, sh * sc);
          }
          break;
        }
        case 'text': {
          const e = 1 - (1 - t) ** 3;
          const y = o.y - o.rise * e;
          const s = o.size * (t < 0.18 ? 0.55 + (t / 0.18) * 0.6 : 1.05 - t * 0.05);
          text(ctx, o.label, o.x, y, { size: s, fill: o.color, stroke: o.stroke, lw: 5 });
          break;
        }
      }
      ctx.restore();
    }
  }
}
