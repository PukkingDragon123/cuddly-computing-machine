// The chef, the story he tells, and the job he wants doing next.
//
// Two things live here because they are the same thing: a scripted moment that
// takes the camera somewhere and has him say a line or two, and a standing job
// pinned to the corner of the screen. He is the only voice in the game. He is
// not a narrator — he is the cook, he has been here longer than you, and he is
// not especially impressed yet.

import { $, h, show } from './dom.js';
import { CHEF_SPRITE } from '../data/catalog.js';
import { CHEF_NAME } from '../data/guests.js';
import { toScreen } from '../world/iso.js';
import { KEYS, QUESTS, SIDE_BY_ID } from '../data/quests.js';

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
      qHint: $('#quest-hint'),
      qFill: $('#quest-fill'),
      qN: $('#quest-n'),
      qPay: $('#quest-pay'),
      qArt: $('#quest-art'),
      aside: $('#aside'),
      asideWho: $('#aside-who'),
      asideText: $('#aside-text'),
      asideFace: $('#aside .aside-face'),
    };
    this.playing = false;
    this.tick = 0;
    this.el.scene.onclick = () => this.#next();
    this.el.quest.onclick = () => this.game.panels.openQuests();
    const chef = `url("${game.assets.url('staff', CHEF_SPRITE)}")`;
    this.el.face.style.backgroundImage = chef;
    this.el.asideFace.style.backgroundImage = chef;
    this.el.aside.onclick = () => this.#asideNext();
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
    // Mid-service he speaks from the pass rather than stopping the game. The
    // full treatment — bars, camera, a dark HUD — is for the quiet moments.
    if (this.s.phase === 'open' && !beat.force) {
      this.s.story.seen.push(beat.id);
      this.s.save();
      this.aside(beat.lines);
      then?.();
      return;
    }
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

  /**
   * A line, typed out.
   *
   * Somebody talking should take a moment to say it. The text comes in a
   * character at a time with a blip every few, the chef bobs while he is
   * speaking and settles when he stops, and a tap mid-line finishes it at once
   * — which is the affordance every game with dialogue in it has, and the one
   * players reach for without being told.
   */
  #show() {
    this.el.who.textContent = `${CHEF_NAME} · head chef`;
    const line = this.beat.lines[this.line];
    this.el.say.classList.remove('pop');
    void this.el.say.offsetWidth;
    this.el.say.classList.add('pop');
    this.el.say.classList.add('talking');

    clearInterval(this.typer);
    this.el.text.textContent = '';
    this.typing = line;
    if (!this.game.state.motionOn) { this.#sayItAll(); return; }
    let i = 0;
    this.typer = setInterval(() => {
      i += 1;
      this.el.text.textContent = line.slice(0, i);
      if (i % 3 === 0) this.game.sfx.play('blip');
      if (i >= line.length) this.#sayItAll();
    }, 26);
  }

  /** Stop typing and put the whole line up. */
  #sayItAll() {
    clearInterval(this.typer);
    this.typer = null;
    if (this.typing !== null) this.el.text.textContent = this.typing;
    this.typing = null;
    this.el.say.classList.remove('talking');
  }

  #next() {
    if (!this.playing) return;
    // mid-line, a tap finishes the line rather than skipping it
    if (this.typer) { this.#sayItAll(); this.game.sfx.play('tap'); return; }
    this.line += 1;
    if (this.line < this.beat.lines.length) { this.#show(); this.game.sfx.play('tap'); return; }
    this.playing = false;
    this.#sayItAll();
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

  /* ----------------------------------------------------------------- aside */

  /**
   * The chef, from the pass, over whatever you are doing.
   *
   * Same voice and the same typing, but it takes nothing away: no bars, no
   * camera move, the HUD stays put and the room keeps running. Lines advance on
   * their own after a beat, and a tap moves them along faster.
   */
  aside(lines) {
    this.asideLines = [...lines];
    this.asideAt = 0;
    show(this.el.aside, true);
    this.el.aside.classList.remove('out');
    this.#asideShow();
  }

  #asideShow() {
    const line = this.asideLines[this.asideAt];
    if (line === undefined) { this.#asideEnd(); return; }
    this.el.asideWho.textContent = CHEF_NAME;
    this.el.aside.classList.remove('pop');
    void this.el.aside.offsetWidth;
    this.el.aside.classList.add('pop', 'talking');
    clearInterval(this.asideTyper);
    clearTimeout(this.asideHold);
    this.el.asideText.textContent = '';
    this.asideFull = line;
    if (!this.game.state.motionOn) { this.#asideAll(); return; }
    let i = 0;
    this.asideTyper = setInterval(() => {
      i += 1;
      this.el.asideText.textContent = line.slice(0, i);
      if (i % 3 === 0) this.game.sfx.play('blip');
      if (i >= line.length) this.#asideAll();
    }, 26);
  }

  #asideAll() {
    clearInterval(this.asideTyper);
    this.asideTyper = null;
    this.el.asideText.textContent = this.asideFull ?? '';
    this.el.aside.classList.remove('talking');
    // held long enough to read, then it moves itself along
    clearTimeout(this.asideHold);
    this.asideHold = setTimeout(() => this.#asideNext(), 2600);
  }

  #asideNext() {
    if (this.el.aside.classList.contains('hidden')) return;
    if (this.asideTyper) { this.#asideAll(); return; }
    this.asideAt += 1;
    if (this.asideAt >= (this.asideLines?.length ?? 0)) { this.#asideEnd(); return; }
    this.#asideShow();
  }

  #asideEnd() {
    clearInterval(this.asideTyper);
    clearTimeout(this.asideHold);
    this.asideTyper = null;
    this.el.aside.classList.add('out');
    setTimeout(() => show(this.el.aside, false), 300);
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

  /** The job's picture, from the game's own art. */
  #art(art) {
    const el = this.el.qArt;
    if (!el) return;
    if (!art) { el.style.backgroundImage = ''; el.className = 'quest-art'; return; }
    if (art.ico) {
      el.style.backgroundImage = '';
      el.className = `quest-art ico ico-${art.ico}`;
      return;
    }
    const sp = this.game.assets.get(art.g, art.id);
    const n = sp?.count ?? 1;
    el.className = 'quest-art';
    el.style.backgroundImage = `url("${this.game.assets.url(art.g, art.id)}")`;
    el.style.backgroundSize = n > 1 ? `${n * 100}% 100%` : 'contain';
    el.style.backgroundPosition = n > 1 ? 'left center' : 'center';
  }

  /** How far along the standing job is, as a number and a fraction. */
  progress(q) {
    let have = 0;
    try { have = q.have(this.game) | 0; } catch { have = 0; }
    have = Math.max(0, Math.min(q.need, have));
    return { have, pct: have / q.need, done: have >= q.need };
  }

  /**
   * A job finished.
   *
   * This is the payoff moment of the whole loop, so it is not a line of text: a
   * banner drops with the reward counted out on it, coins and stars come off the
   * ticket, the till rings, and the chef says his piece a beat later. Then the
   * next job slides in underneath.
   */
  #finish(q) {
    const s = this.s;
    s.story.at = (s.story.at ?? 0) + 1;
    s.earn(q.coins);
    if (q.fame) s.addStars(q.fame);
    s.save();
    this.game.sfx.play('cash');
    this.game.hud.bumpCoin?.();
    this.game.hud.bumpRank?.();

    const cam = this.game.zone.cam;
    this.game.zone.fx.coins(cam.x, cam.y - 30, 14, 90);
    this.game.zone.fx.stars(cam.x, cam.y - 40, 10);
    this.game.zone.fx.hearts(cam.x, cam.y - 10, 4);
    // and the job's own picture, thrown up with the rest of it
    if (q.art?.g) {
      this.game.zone.fx.burst(this.game.assets.get(q.art.g, q.art.id), cam.x, cam.y - 10, 5,
        { spread: 120, size: 30, up: 380 });
    }

    this.#banner(q);
    this.el.quest.classList.add('ding');
    setTimeout(() => this.el.quest.classList.remove('ding'), 700);
    setTimeout(() => this.aside([q.done]), 1500);

    // some jobs hand over a key. It lands after the banner has had its moment,
    // so the two rewards are read one at a time rather than on top of each other
    const key = KEYS[q.id];
    if (key && s.grantKey(key.key)) {
      setTimeout(() => {
        this.game.sfx.play('star');
        this.game.hud.revealKey(key);
      }, 900);
    }
    this.qSig = null;
  }

  /** The reward banner: what you did, and what it just paid. */
  #banner(q, kind = 'Job done') {
    const el = h('div.done', null,
      h('span.done-tick', null, '✓'),
      h('span.done-body', null,
        h('b', null, kind),
        h('span', null, q.title)),
      h('span.done-pay', null,
        h('span.done-coin', null, h('i.ico.ico-sand'), `+${q.coins}`),
        q.fame ? h('span.done-fame', null, h('i.ico.ico-star'), `+${q.fame}`) : null));
    document.getElementById('hud').append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2400);
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
      const { have, pct, done } = this.progress(q);
      show(this.el.quest, !this.playing);
      if (this.qSig !== `${q.id}:${have}`) {
        this.qSig = `${q.id}:${have}`;
        this.el.qTitle.textContent = q.title;
        this.#art(q.art);
        this.el.qHint.textContent = q.hint ?? '';
        this.el.qN.textContent = q.need > 1 ? `${have}/${q.need}` : '';
        this.el.qPay.textContent = `+${q.coins}`;
        this.el.qFill.style.width = `${Math.round(pct * 100)}%`;
        this.el.quest.classList.toggle('near', pct >= 0.75 && !done);
      }
      if (done) this.#finish(q);
    } else show(this.el.quest, false);
    this.game.hud.syncQuestBadge?.(QUESTS.length - (s.story.at ?? 0));

    // the side board: three standing jobs, topped up as they are finished
    s.fillSide(this.game);
    for (const job of [...(s.side?.jobs ?? [])]) {
      const def = SIDE_BY_ID[job.id];
      if (!def) { s.clearSide(job.id, this.game); continue; }
      let have = 0;
      try { have = (def.count(this.game) | 0) - job.from; } catch { have = 0; }
      if (have < def.need) continue;
      s.earn(def.coins);
      if (def.fame) s.addStars(def.fame);
      s.clearSide(job.id, this.game);
      this.game.sfx.play('cash');
      this.#banner({ ...def, title: def.title }, 'Side job');
    }

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
