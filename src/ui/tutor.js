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

/*
 * `lock` fences the screen off to just the lit target.
 *
 * The opening minute is the one that decides whether anybody plays the rest of
 * it, and a player who wanders into the build menu on step two and cannot find
 * their way back has already lost. So the first pass through the loop — plate,
 * open, seat, order, serve — only lets you press the thing being pointed at.
 * The steps after that are read-and-carry-on, and by then the place is yours.
 *
 * Nothing can trap you here: a step that has waited too long frees itself (see
 * the escape hatch in update) and the fence comes down with it, and Skip is
 * live the entire time.
 */
const STEPS = [
  {
    id: 'kitchen',
    lock: true,
    title: 'Open the Kitchen',
    text: 'Food has to be plated before anyone can buy it. Tap the Kitchen book.',
    at: () => '#btn-recipes',
    done: (g) => g.hud.sheetOpen === 'recipes',
  },
  {
    id: 'plate',
    lock: true,
    title: 'Plate three lattes',
    // Three, to match the job on the HUD. One was enough to satisfy the step,
    // which meant the guide moved on and fenced the + off while the job was
    // still asking for two more — the two things telling you different stories
    // about the same button.
    text: 'Tap the + beside the latte three times. Each one uses ingredients, so plate what you can sell.',
    at: () => '#sheet-body .stepper button:last-child',
    done: (g) => g.state.plannedCount >= 3,
  },
  {
    id: 'open',
    lock: true,
    title: 'Open the doors',
    // the doors open from inside the kitchen book, beside the plating you have
    // just done, so the guide stays on the page rather than sending you out
    text: 'That is the morning done. Let them in!',
    at: () => '#menu-open',
    before: (g) => { if (g.hud.sheetOpen !== 'recipes') g.openRecipes(); },
    done: (g) => g.state.phase === 'open',
  },
  {
    id: 'seat',
    lock: true,
    title: 'Sit somebody down',
    // the doors closing takes the guests with them, so the step goes too
    stale: (g) => g.state.phase !== 'open',
    text: 'Tap the guest who is waiting and they will find a chair.',
    world: (g) => {
      const q = g.restaurant.guests.find((x) => x.state === 'queue');
      return q ? { x: q.pos.x, y: q.headY } : null;
    },
    done: (g) => g.restaurant.guests.some((x) => x.seated),
  },
  {
    id: 'order',
    lock: true,
    title: 'Take their order',
    stale: (g) => g.state.phase !== 'open',
    text: 'Tap the ! above their head. That sends the order to Tako.',
    world: (g) => {
      const o = g.restaurant.guests.find((x) => x.state === 'order');
      return o ? { x: o.pos.x, y: o.headY - 60 } : null;
    },
    done: (g) => g.restaurant.kitchen.queued > 0 || g.restaurant.kitchen.plates.length > 0
      || g.restaurant.guests.some((x) => x.state === 'eat'),
  },
  {
    id: 'serve',
    lock: true,
    title: 'Bring the food',
    stale: (g) => g.state.phase !== 'open',
    text: 'Drag the plate off the counter and onto the guest who ordered it.',
    world: (g) => {
      const p = g.restaurant.kitchen.plates[0];
      return p ? { x: p.x, y: p.y } : null;
    },
    done: (g) => g.restaurant.served > 0 || g.restaurant.guests.some((x) => x.state === 'eat'),
  },
  {
    id: 'jobs',
    title: 'Your job list',
    text: 'There is always one job on the go, up in the corner. Finishing it pays you.',
    at: () => '#quest',
    done: null,
  },
  {
    id: 'done',
    title: 'That is the whole game!',
    text: 'Serve people, get paid, spend it on the place. The job list always says what to try next.',
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
      blocks: [...document.querySelectorAll('.tutor-block')],
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
    // press anywhere that is fenced off and the guide says so rather than
    // simply eating the tap, which would read as the game having frozen
    for (const b of this.el.blocks) b.onclick = () => this.#nudge();
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
    this.el.root.classList.remove('locked');
    this.game.hud.point?.hide();
    const s = this.game.state;
    s.tutorial = { step: this.i, done: true };
    s.save();
    if (skipped) this.game.hud.toast('Guide put away. The job list has the rest!', '');
  }

  #next() {
    this.i += 1;
    if (this.i >= STEPS.length) {
      this.#pay();
      this.stop();
      this.game.state.earn(TUTOR_BONUS);
      this.game.celebrate(`You have the hang of it! +${TUTOR_BONUS}`);
      return;
    }
    // Every step pays. A guide that only tells you things is homework; a guide
    // that hands you a coin every time you do one is a game.
    if (this.i > 0) this.#pay();
    const step = STEPS[this.i];
    // the moment the fence comes down for good is worth marking
    if (STEPS[this.i - 1]?.lock && !step.lock) {
      this.game.hud.toast('The place is yours now. Have a look around!', 'good');
    }
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
      // the hole says "look here"; the hand says "press this". Both, because a
      // lit rectangle on its own is a thing you notice rather than a thing you
      // understand you are supposed to touch.
      this.game.hud.point?.at(box);
      this.#fence(box);
    } else {
      show(this.el.hole, false);
      this.game.hud.point?.hide();
      this.#fence(null);
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

  /**
   * You pressed the part of the screen that is closed just now.
   *
   * A blocked tap that does nothing at all is indistinguishable from a bug, so
   * this answers: the bubble jumps, the pointer shouts, and the guide says the
   * one thing that is open. Rate-limited, because holding a finger down on the
   * fence should not machine-gun the sound.
   */
  #nudge() {
    const now = performance.now();
    if (now - (this.nudgedAt ?? 0) < 700) return;
    this.nudgedAt = now;
    this.game.sfx.play('no');
    this.el.say.classList.remove('pop');
    void this.el.say.offsetWidth;
    this.el.say.classList.add('pop');
    const box = this.#targetBox(STEPS[this.i]);
    if (box) this.game.hud.point?.at(box, { loud: true });
  }

  /** Put the fence round the lit target, or take it down. */
  #fence(box) {
    const on = !!box && !!STEPS[this.i]?.lock && !this.el.say.classList.contains('freed');
    this.el.root.classList.toggle('locked', on);
    if (!on) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const put = (el, x, y, w, h) => {
      el.style.left = `${Math.max(0, x)}px`;
      el.style.top = `${Math.max(0, y)}px`;
      el.style.width = `${Math.max(0, w)}px`;
      el.style.height = `${Math.max(0, h)}px`;
    };
    const [top, bottom, left, right] = this.el.blocks;
    put(top, 0, 0, vw, box.y);
    put(bottom, 0, box.y + box.h, vw, vh - (box.y + box.h));
    put(left, 0, box.y, box.x, box.h);
    put(right, box.x + box.w, box.y, vw - (box.x + box.w), box.h);
  }

  /** A coin for the step just finished, and a pop to go with it. */
  #pay() {
    const s = this.game.state;
    s.earn(STEP_PAY);
    this.game.sfx.play('coin');
    const cam = this.game.zone.cam;
    this.game.zone.fx.coins(cam.x, cam.y - 20, 6, 60);
    this.game.hud.toast(`Nicely done! +${STEP_PAY}`, 'good');
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
