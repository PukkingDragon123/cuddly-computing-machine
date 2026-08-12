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
import { CHEF_SPRITE } from '../data/catalog.js';

/**
 * The first shift, start to finish. Anything a player could reasonably discover
 * on their own is left out — this is the loop that is not obvious: food has to
 * be plated before it can be sold, and nobody turns up unless you call them.
 */
/** What each finished step is worth. Small, frequent, and it adds up. */
const STEP_PAY = 40;
/** And a lump at the end, so finishing it is worth more than skipping it. */
const TUTOR_BONUS = 300;

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
    // the doors closing takes the guests with them, so the step goes too
    stale: (g) => g.state.phase !== 'open',
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
    stale: (g) => g.state.phase !== 'open',
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
    stale: (g) => g.state.phase !== 'open',
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
    stale: (g) => g.state.phase !== 'open',
    text: 'Ten taps calls somebody in. As often as you like — only the food runs out.',
    at: () => '#btn-flyer',
    done: null,          // read-and-carry-on
  },
  {
    id: 'jobs',
    title: 'Your jobs',
    text: 'The chef always has one on the go, top left. It pays.',
    at: () => '#quest',
    done: null,
  },
  {
    id: 'done',
    title: "That's the shift",
    text: 'Serve, get paid, spend it. Everything else is on the job list.',
    at: () => '#btn-quests',
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
      face: $('#tutor-face'),
      skip: $('#tutor-skip'),
    };
    this.el.face.style.backgroundImage =
      `url("${game.assets.url('staff', CHEF_SPRITE)}")`;
    this.i = -1;
    this.running = false;
    this.el.skip.onclick = () => this.stop(true);
    // a step with nothing to wait for is dismissed by pressing the bubble
    // A step with nothing to wait for is dismissed by pressing the bubble, and
    // so is one that has been waiting too long — see the escape hatch below.
    this.el.say.onclick = () => {
      if (!this.running) return;
      if (!STEPS[this.i]?.done || this.el.say.classList.contains('freed')) this.#next();
    };
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
    if (skipped) this.game.hud.toast('Guide put away — the job list has the rest', '');
  }

  #next() {
    this.i += 1;
    if (this.i >= STEPS.length) {
      this.#pay();
      this.stop();
      this.game.state.earn(TUTOR_BONUS);
      this.game.celebrate(`You know the job! +${TUTOR_BONUS}`);
      return;
    }
    // Every step pays. A guide that only tells you things is homework; a guide
    // that hands you a coin every time you do one is a game.
    if (this.i > 0) this.#pay();
    const step = STEPS[this.i];
    step.before?.(this.game);
    this.el.title.textContent = step.title;
    this.el.text.textContent = step.text;
    this.el.say.classList.toggle('waits', !!step.done);
    this.el.say.classList.remove('freed');
    this.wait = 0;
    // pips rather than "3 / 9": you can see the whole guide at a glance
    this.el.dots.replaceChildren(...STEPS.map((_, n) => {
      const pip = document.createElement('i');
      if (n < this.i) pip.className = 'on';
      if (n === this.i) pip.className = 'here';
      return pip;
    }));
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

    let hit = false;
    let gone = false;
    try {
      hit = !!step.done?.(this.game);
      gone = !!step.stale?.(this.game);
    } catch { hit = false; }
    if (hit) {
      this.game.sfx.play('star');
      this.#next();
      return;
    }

    /*
     * The escape hatch.
     *
     * A step that waits for something can wait forever if the something stops
     * being possible — the doors close on you mid-shift and the guide is still
     * pointing at a guest who went home. That used to wedge it: a waiting step
     * ignores taps, so the dark sheet stayed up and the guide never moved on.
     * Now the premise is checked, and anything that sits unfinished long enough
     * can simply be tapped past.
     */
    if (gone) { this.#next(); return; }
    this.wait = (this.wait ?? 0) + 1;
    if (step.done && this.wait > 60 * 14 && !this.el.say.classList.contains('freed')) {
      this.el.say.classList.remove('waits');
      this.el.say.classList.add('freed');
    }
  }

  /** A coin for the step just finished, and a pop to go with it. */
  #pay() {
    const s = this.game.state;
    s.earn(STEP_PAY);
    this.game.sfx.play('coin');
    const cam = this.game.zone.cam;
    this.game.zone.fx.coins(cam.x, cam.y - 20, 6, 60);
    this.game.hud.toast(`+${STEP_PAY} — nice`, 'good');
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
