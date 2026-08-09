// The interactive guide.
//
// Not a wall of text with a Next button: each step points at the thing you have
// to press and waits for you to actually press it. A step knows three things —
// what to say, what to put the spotlight on, and how to tell it is finished —
// and the guide simply walks the list.
//
// The spotlight is a hole in a dark sheet, and the sheet takes no pointer
// events at all: the point is to draw the eye, never to trap the finger.

import { $, show } from './dom.js';

/**
 * The first shift, start to finish. Anything a player could reasonably discover
 * on their own is left out — this is the loop that is not obvious: food has to
 * be plated before it can be sold, and nobody turns up unless you call them.
 */
const STEPS = [
  {
    id: 'kitchen',
    title: 'The kitchen',
    text: 'Nothing sells until it is plated. Open the Kitchen.',
    at: () => '#btn-recipes',
    done: (g) => g.hud.sheetOpen === 'recipes',
  },
  {
    id: 'plate',
    title: 'Plate a dish',
    text: 'Tap + beside a dish. It costs ingredients now, so plate what you can sell.',
    at: () => '#sheet-body .stepper button:last-child',
    done: (g) => g.state.plannedCount > 0,
  },
  {
    id: 'open',
    title: 'Open up',
    text: 'That is the morning done. Open the doors.',
    at: () => '#btn-service',
    before: (g) => g.hud.closeSheet(),
    done: (g) => g.state.phase === 'open',
  },
  {
    id: 'seat',
    title: 'Seat a guest',
    text: 'Tap whoever is waiting to sit them down.',
    world: (g) => {
      const q = g.restaurant.guests.find((x) => x.state === 'queue');
      return q ? { x: q.pos.x, y: q.headY } : null;
    },
    done: (g) => g.restaurant.guests.some((x) => x.seated),
  },
  {
    id: 'order',
    title: 'Ring it in',
    text: 'Tap the ! bubble to send the ticket to the chef.',
    world: (g) => {
      const o = g.restaurant.guests.find((x) => x.state === 'order');
      return o ? { x: o.pos.x, y: o.headY - 60 } : null;
    },
    done: (g) => g.restaurant.kitchen.queued > 0 || g.restaurant.kitchen.plates.length > 0
      || g.restaurant.guests.some((x) => x.state === 'eat'),
  },
  {
    id: 'serve',
    title: 'Run the plate',
    text: 'Drag it off the pass onto whoever ordered it.',
    world: (g) => {
      const p = g.restaurant.kitchen.plates[0];
      return p ? { x: p.x, y: p.y } : null;
    },
    done: (g) => g.restaurant.served > 0 || g.restaurant.guests.some((x) => x.state === 'eat'),
  },
  {
    id: 'board',
    title: 'The board',
    text: 'Ten taps calls somebody in. As often as you like — only the food runs out.',
    at: () => '#btn-flyer',
    done: null,          // read-and-carry-on
  },
  {
    id: 'done',
    title: "That's the shift",
    text: 'Serve, get paid, spend it. The ? has the long version.',
    at: () => '#btn-help',
    done: null,
  },
];

export class Tutor {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('#tutor'),
      hole: $('#tutor-hole'),
      say: $('#tutor-say'),
      title: $('#tutor-title'),
      text: $('#tutor-text'),
      dots: $('#tutor-dots'),
      skip: $('#tutor-skip'),
    };
    this.i = -1;
    this.running = false;
    this.el.skip.onclick = () => this.stop(true);
    // a step with nothing to wait for is dismissed by pressing the bubble
    this.el.say.onclick = () => { if (this.running && !STEPS[this.i]?.done) this.#next(); };
  }

  get step() { return this.running ? STEPS[this.i] : null; }

  /** Start from the top. `force` replays it even once it has been finished. */
  begin(force = false) {
    const t = this.game.state.tutorial ?? {};
    if (!force && t.done) return;
    this.i = -1;
    this.running = true;
    show(this.el.root, true);
    this.#next();
  }

  stop(skipped = false) {
    this.running = false;
    show(this.el.root, false);
    const s = this.game.state;
    s.tutorial = { step: this.i, done: true };
    s.save();
    if (skipped) this.game.hud.toast('Guide put away — the ? has it all', '');
  }

  #next() {
    this.i += 1;
    if (this.i >= STEPS.length) {
      this.stop();
      this.game.celebrate('You know the job!');
      return;
    }
    const step = STEPS[this.i];
    step.before?.(this.game);
    this.el.title.textContent = step.title;
    this.el.text.textContent = step.text;
    this.el.say.classList.toggle('waits', !!step.done);
    this.el.dots.textContent = `${this.i + 1} / ${STEPS.length}`;
    this.el.say.classList.remove('pop');
    void this.el.say.offsetWidth;
    this.el.say.classList.add('pop');
    this.game.sfx.play('tap');
    this.game.state.tutorial = { step: this.i, done: false };
  }

  /**
   * Follow the target and watch for the step being finished. Runs every frame:
   * the thing being pointed at can be a guest walking across the room.
   */
  update() {
    if (!this.running) return;
    const step = STEPS[this.i];
    if (!step) return;

    const box = this.#targetBox(step);
    if (box) {
      const { hole } = this.el;
      hole.style.left = `${box.x}px`;
      hole.style.top = `${box.y}px`;
      hole.style.width = `${box.w}px`;
      hole.style.height = `${box.h}px`;
      hole.style.borderRadius = `${box.r}px`;
      show(hole, true);
      this.#placeBubble(box);
    } else {
      show(this.el.hole, false);
      this.el.say.style.left = '50%';
      this.el.say.style.top = 'auto';
      this.el.say.style.bottom = '18%';
      this.el.say.style.transform = 'translateX(-50%)';
    }

    if (step.done?.(this.game)) {
      this.game.sfx.play('star');
      this.#next();
    }
  }

  /** Screen-space box of whatever this step is pointing at. */
  #targetBox(step) {
    if (step.world) {
      const w = step.world(this.game);
      if (!w) return null;
      const p = this.game.zone.cam.toScreen(w.x, w.y);
      const r = 52;
      return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2, r };
    }
    const sel = step.at?.(this.game);
    const el = sel && document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    const pad = 8;
    return {
      x: b.left - pad, y: b.top - pad,
      w: b.width + pad * 2, h: b.height + pad * 2,
      r: Math.min(b.height, b.width) / 2 + pad,
    };
  }

  /** Put the bubble on whichever side of the target has room for it. */
  #placeBubble(box) {
    const say = this.el.say;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = say.offsetWidth || 260;
    const hgt = say.offsetHeight || 90;
    const below = box.y + box.h + 14;
    const above = box.y - hgt - 14;
    const top = above > 8 ? above : (below + hgt < vh - 8 ? below : Math.max(8, vh - hgt - 8));
    let left = box.x + box.w / 2 - w / 2;
    left = Math.max(10, Math.min(vw - w - 10, left));
    say.style.left = `${left}px`;
    say.style.top = `${top}px`;
    say.style.bottom = 'auto';
    say.style.transform = 'none';
    say.classList.toggle('below', top > box.y);
  }
}
