// The chef, the story he tells, and the job he wants doing next.
//
// Two things live here because they are the same thing: a scripted moment that
// takes the camera somewhere and has him say a line or two, and a standing job
// pinned to the corner of the screen. He is the only voice in the game. He is
// not a narrator — he is the cook, he has been here longer than you, and he is
// not especially impressed yet.

import { $, h, show } from './dom.js';
import { CHEF_SPRITE } from '../data/catalog.js';
import { toScreen } from '../world/iso.js';

/**
 * Scripted moments. `at` names what the camera should look at; `when` is
 * checked once a second and fires the beat the first time it is true.
 *
 * Lines are short on purpose. Nobody reads a paragraph from a cartoon octopus.
 */
export const BEATS = [
  { id: 'arrive', at: 'pass', when: () => true, lines: [
    "Place is yours, then.",
    "Kitchen's mine. Front of house is your problem.",
  ] },
  { id: 'plated', at: 'pass', when: (g) => g.state.plannedCount > 0, lines: [
    "Good. Food doesn't cook itself.",
    "Well. It does. But not until you ask.",
  ] },
  { id: 'opened', at: 'door', when: (g) => g.state.phase === 'open', lines: [
    "Doors are open.",
    "Don't leave anybody standing.",
  ] },
  { id: 'fed', at: 'seats', when: (g) => g.state.stats.served >= 1, lines: [
    "One fed.",
    "They tip on the wait, not the food. Be quick.",
  ] },
  { id: 'closed', at: 'pass', when: (g) => g.state.day >= 2, lines: [
    "We covered the ice. That's a day.",
    "Do it again. Better.",
  ] },
  { id: 'works', at: 'works', when: (g) => g.zone === g.factory, lines: [
    "The works. Belts do the fetching.",
    "You do the thinking. Allegedly.",
  ] },
  { id: 'crewed', at: 'seats', when: (g) => g.state.staff.length >= 1, lines: [
    "Another pair of hands. Eight, in her case.",
    "Pay them properly and they stay.",
  ] },
  { id: 'kiln', at: 'works', when: (g) => g.state.hasWorks?.('kiln'), lines: [
    "Clay's cheap. A good plate isn't.",
    "Same soup, better bowl, twice the money. People are like that.",
  ] },
  { id: 'busy', at: 'seats', when: (g) => g.state.stats.served >= 25, lines: [
    "Full house.",
    "Don't let it go to your head. I've seen the head.",
  ] },
  { id: 'famous', at: 'door', when: (g) => g.state.rating >= 3, lines: [
    "Harbour's talking about us.",
    "Keep them talking. I'll keep cooking.",
  ] },
];

/**
 * The standing job. One at a time, in order, each with a number you can watch
 * go up — a quest you cannot see the progress of is a rumour.
 */
export const QUESTS = [
  { id: 'plate', title: 'Plate 3 dishes', need: 3, coins: 60,
    have: (g) => g.state.plannedCount,
    done: "Three's a menu. Barely." },
  { id: 'open', title: 'Open the doors', need: 1, coins: 60,
    have: (g) => (g.state.phase === 'open' ? 1 : 0),
    done: "Here they come." },
  { id: 'serve', title: 'Serve 3 guests', need: 3, coins: 120,
    have: (g) => g.state.stats.served,
    done: "Three happy. Keep going." },
  { id: 'market', title: 'Buy from the market', need: 1, coins: 90,
    have: (g) => g.state.stats.bought ?? 0,
    done: "Boats land every hour. Prices move. Watch them." },
  { id: 'seats', title: 'Get to 4 seats', need: 4, coins: 150,
    have: (g) => g.restaurant.seatCount,
    done: "More chairs, more dinners." },
  { id: 'crew', title: 'Hire anybody', need: 1, coins: 200,
    have: (g) => g.state.staff.length,
    done: "You can't run a room on your own. Nobody can." },
  { id: 'machine', title: 'Build a machine', need: 1, coins: 250,
    have: (g) => g.state.machines.length,
    done: "Now the harbour works while you sleep." },
  { id: 'rating', title: 'Reach 3 stars', need: 3, coins: 400,
    have: (g) => g.state.rating,
    done: "Three stars. I'll allow myself a smile." },
  { id: 'rich', title: 'Save up 3,000', need: 3000, coins: 500,
    have: (g) => g.state.coins,
    done: "That's a kitchen with money in it. Rare thing." },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.el = {
      scene: $('#scene'),
      say: $('#say'),
      face: $('#say-face'),
      who: $('#say-who'),
      text: $('#say-text'),
      quest: $('#quest'),
      qTitle: $('#quest-title'),
      qFill: $('#quest-fill'),
      qN: $('#quest-n'),
      qTick: $('#quest-tick'),
    };
    this.playing = false;
    this.tick = 0;
    this.el.scene.onclick = () => this.#next();
    this.el.face.style.backgroundImage =
      `url("${game.assets.url('staff', CHEF_SPRITE)}")`;
  }

  get s() { return this.game.state; }

  /** The opening. Played before the guide, because he owns the first word. */
  intro(then) {
    this.s.story ??= { at: 0, seen: [] };
    this.play(BEATS[0], then);
  }

  /** Mark the lot as played. For a session that is not a player's. */
  hush() {
    this.s.story ??= { at: 0, seen: [] };
    this.s.story.seen = BEATS.map((b) => b.id);
  }

  /* ------------------------------------------------------------- cutscenes */

  /** Has this beat already been played? */
  seen(id) { return (this.s.story?.seen ?? []).includes(id); }

  /**
   * Run a beat. The bars come in, the camera moves, and he talks. Tapping
   * anywhere takes the next line — there is no button to hunt for.
   */
  play(beat, then = null) {
    if (this.playing || this.seen(beat.id)) { then?.(); return; }
    this.playing = true;
    this.beat = beat;
    this.line = 0;
    this.then = then;
    this.s.story.seen.push(beat.id);
    this.game.hud.closeSheet();
    this.#lookAt(beat.at);
    show(this.el.scene, true);
    this.el.scene.classList.remove('out');
    document.getElementById('hud').classList.add('scening');
    this.#show();
    this.game.sfx.play('select');
  }

  #show() {
    this.el.who.textContent = 'Chef';
    this.el.text.textContent = this.beat.lines[this.line];
    this.el.say.classList.remove('pop');
    void this.el.say.offsetWidth;
    this.el.say.classList.add('pop');
  }

  #next() {
    if (!this.playing) return;
    this.line += 1;
    if (this.line < this.beat.lines.length) { this.#show(); this.game.sfx.play('tap'); return; }
    this.playing = false;
    document.getElementById('hud').classList.remove('scening');
    this.el.scene.classList.add('out');
    setTimeout(() => show(this.el.scene, false), 260);
    this.game.sfx.play('pop');
    this.#restoreCam();
    this.s.save();
    const then = this.then;
    this.then = null;
    if (then) setTimeout(then, 320);
  }

  /**
   * Point the camera at something worth looking at.
   *
   * Every target is a real thing in the room, so the shot lands on the pass or
   * the door rather than on a guessed coordinate that drifts as the room grows.
   */
  #lookAt(what) {
    const g = this.game;
    const z = g.zone;
    this.camWas = { x: z.cam.x, y: z.cam.y, zoom: z.cam.zoom };
    const r = g.restaurant;
    const tile = (t) => (t ? toScreen(t.c, t.r) : null);
    let p = null;
    if (what === 'pass') p = tile(r.furniture?.find((f) => f.item?.kind === 'pass'));
    if (what === 'door') p = r.entryWorld ?? null;
    if (what === 'seats') p = tile(r.seats?.find((x) => x.table) ?? r.seats?.[0]);
    const b = z.bounds();
    const to = p ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    z.cam.zoom = Math.min(1.5, this.camWas.zoom * 1.35);
    z.cam.glideTo(to.x, to.y - 20, 0.55);
  }

  #restoreCam() {
    const z = this.game.zone;
    if (!this.camWas) return;
    z.cam.zoom = this.camWas.zoom;
    z.cam.glideTo(this.camWas.x, this.camWas.y, 0.5);
    this.camWas = null;
  }

  /* ---------------------------------------------------------------- quests */

  get quest() {
    const at = this.s.story?.at ?? 0;
    return QUESTS[at] ?? null;
  }

  /** Fold the finished job away, pay for it, and let him have the last word. */
  #finish(q) {
    const s = this.s;
    s.story.at = (s.story.at ?? 0) + 1;
    s.earn(q.coins);
    s.save();
    this.game.sfx.play('coin');
    this.game.hud.toast(`${q.title} — done. +${q.coins}`, 'good');
    this.el.quest.classList.add('ding');
    setTimeout(() => this.el.quest.classList.remove('ding'), 700);
    this.game.hud.chefSays(q.done);
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    if (this.game.attract) return;
    this.tick += dt;
    if (this.tick < 0.35) return;
    this.tick = 0;
    const s = this.s;
    s.story ??= { at: 0, seen: [] };

    const q = this.quest;
    if (q) {
      const have = Math.max(0, Math.min(q.need, q.have(this.game) | 0));
      show(this.el.quest, !this.playing);
      if (this.qSig !== `${q.id}:${have}`) {
        this.qSig = `${q.id}:${have}`;
        this.el.qTitle.textContent = q.title;
        this.el.qN.textContent = q.need > 1 ? `${have}/${q.need}` : '';
        this.el.qFill.style.width = `${Math.round((have / q.need) * 100)}%`;
      }
      if (have >= q.need) this.#finish(q);
    } else show(this.el.quest, false);

    // never over an open panel or the guide: a cutscene that snatches the book
    // out of your hands mid-tap is a cutscene you resent
    if (this.playing || this.game.hud.isSheetOpen || this.game.tutor?.running) return;
    for (const beat of BEATS) {
      if (this.seen(beat.id)) continue;
      let hit = false;
      try { hit = !!beat.when(this.game); } catch { hit = false; }
      if (!hit) continue;
      this.play(beat);
      return;
    }
  }
}
