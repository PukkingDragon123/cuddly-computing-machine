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
import { Point } from './point.js';
import { JOB_BY_ID, JOBS, KEYS, PATHS, SIDE_BY_ID, SPOTS } from '../data/quests.js';
import { INGREDIENTS } from '../data/ingredients.js';
import { RECIPE_BY_ID } from '../data/recipes.js';

/**
 * Scripted moments. `at` names what the camera should look at; `when` is
 * checked once a second and fires the beat the first time it is true.
 *
 * Tako is the only voice in the game, so he carries all of the teaching — and
 * the last draft carried it in the voice of a manual. "Plating uses up
 * ingredients, so plate what you can sell" is a true sentence nobody has ever
 * said out loud. Every line here is written to be *spoken*: he starts in the
 * middle of a thought, he corrects himself, he tails off, he asks you things.
 *
 * The rules that produce that, since it is easy to drift back:
 *
 *   - Contractions, always. "You'll" and "I've", never "you will".
 *   - Let a line start with And, So, Right, Anyway, Oh.
 *   - One clause is usually enough. Two is the most.
 *   - He talks to you, not at you — questions, and answers to questions you
 *     did not ask out loud but obviously just thought.
 *   - Still no idiom you would have to be English to get, and still one useful
 *     fact per beat. Sounding human is not a licence to stop teaching.
 */
export const BEATS = [
  { id: 'arrive', at: 'pass', when: () => true, lines: [
    "Oh — hello! Sorry, I was miles away.",
    "You're the new owner, then. I'm Tako. I cook.",
    "You'll look after everybody out front. That alright?",
  ] },
  { id: 'plated', at: 'pass', when: (g) => g.state.plannedCount > 0, lines: [
    "There we go. Now we've got something to sell.",
    "Watch the larder, though — every plate uses it up.",
  ] },
  { id: 'opened', at: 'door', when: (g) => g.state.phase === 'open', lines: [
    "Right, doors are open. Here they come!",
    "Somebody's waiting — give them a tap and they'll sit down.",
  ] },
  { id: 'fed', at: 'seats', when: (g) => g.state.stats.served >= 1, lines: [
    "There. Our first one, fed and happy.",
    "Be quick with people and they leave you a bit more. Every time.",
  ] },
  { id: 'closed', at: 'pass', when: (g) => g.state.day >= 2, lines: [
    "Well. That's a whole day, that is.",
    "And tomorrow we do it again, only better. That's the job.",
  ] },
  { id: 'works', at: 'works', when: (g) => g.zone === g.factory, lines: [
    "Ah, you found the works. This is ours too.",
    "The machines keep making things while you're busy out front.",
    "And the belts carry it along — you just point them the right way.",
  ] },
  { id: 'crewed', at: 'seats', when: (g) => g.state.staff.length >= 1, lines: [
    "You hired somebody! Look at us, we're a team.",
    "They'll keep at it forever, too. Never once asked for a day off.",
  ] },
  { id: 'kiln', at: 'works', when: (g) => g.state.hasWorks?.('kiln'), lines: [
    "Now then. Clay costs almost nothing.",
    "A really lovely plate does not.",
    "Same soup, nicer bowl, more money. People are funny.",
  ] },
  { id: 'busy', at: 'seats', when: (g) => g.state.stats.served >= 25, lines: [
    "Would you look at that. Not a spare chair in here.",
    "I'm proud of you, actually. Don't tell anyone I said it.",
  ] },
  { id: 'famous', at: 'door', when: (g) => g.state.rating >= 3, lines: [
    "So the whole harbour's talking about us now.",
    "You keep them talking. I'll keep cooking.",
  ] },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.el = {
      scene: $('#scene'),
      say: $('#say'),
      face: $('#say-face'),
      cast: $('#scene-cast'),
      who: $('#say-who'),
      text: $('#say-text'),
      quest: $('#quest'),
      qTitle: $('#quest-title'),
      qDesc: $('#quest-desc'),
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
    /*
     * Tapping the job asks where it is.
     *
     * The first tap throws the pointer at whatever this job wants you to press
     * and says it loudly for a couple of seconds. Only a second tap opens the
     * board — because nine times out of ten the question is "where do I go",
     * not "show me the list I have already read".
     */
    this.el.quest.onclick = () => {
      const box = this.#spotBox();
      if (box && !this.asked) {
        this.asked = true;
        setTimeout(() => { this.asked = false; }, 2600);
        this.game.hud.point?.at(box, { loud: true });
        this.game.sfx.play('tap');
        return;
      }
      this.game.panels.openQuests();
    };
    const chef = `url("${game.assets.url('staff', CHEF_SPRITE)}")`;
    this.el.face.style.backgroundImage = chef;
    this.el.asideFace.style.backgroundImage = chef;
    this.el.aside.onclick = () => this.#asideNext();
  }

  get s() { return this.game.state; }

  /** The opening. Played before the guide, because he owns the first word. */
  intro(then) {
    this.s.story ??= { done: [], open: ['plate'], pin: 'plate', seen: [] };
    this.play(BEATS[0], then);
  }

  /** Mark the lot as played. For a session that is not a player's. */
  hush() {
    this.s.story ??= { done: [], open: ['plate'], pin: 'plate', seen: [] };
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
    // The last beat's fade-out is still counting down to hide this element. If
    // it lands now it hides the scene we are opening, and since `playing` stays
    // true nothing else ever fires and there is nothing left on screen to tap:
    // a dead game. Two beats a third of a second apart is all it took.
    clearTimeout(this.hideT);
    this.hideT = null;
    show(this.el.scene, true);
    this.el.scene.classList.remove('out');
    document.getElementById('hud').classList.add('scening');
    this.#show();
    this.game.sfx.play('select');
  }

  /**
   * Put the cutscene away, whatever state it is in.
   *
   * Every path out of a scene comes through here — the last line, a skip, the
   * watchdog — so there is exactly one place that can leave the screen wrong,
   * and it always leaves it right.
   */
  #close() {
    this.playing = false;
    this.#sayItAll();
    this.el.cast?.classList.remove('hop');
    document.getElementById('hud').classList.remove('scening');
    this.el.scene.classList.add('out');
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => {
      this.hideT = null;
      show(this.el.scene, false);
      this.el.scene.classList.remove('out');
    }, 260);
    this.#restoreCam();
    this.s.save();
  }

  /** Cut it short — the settings button, and the harness. */
  skip() {
    if (!this.playing) return;
    this.#close();
    const then = this.then;
    this.then = null;
    then?.();
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

    /*
     * He hops when he changes the subject.
     *
     * Only from the second line on — the first one is his entrance, and a hop
     * on top of a leap is two animations fighting over the same element, which
     * looks like a glitch rather than like a character. After that a small
     * squash-and-hop on every new line is what keeps a wall of dialogue from
     * feeling like a wall of dialogue: something moved, so something happened.
     */
    if (this.el.cast && this.line > 0 && this.game.state.motionOn) {
      this.el.cast.classList.remove('hop');
      void this.el.cast.offsetWidth;
      this.el.cast.classList.add('hop');
    }

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
    this.#close();
    this.game.sfx.play('pop');
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
    // Held long enough to read, then it moves itself along. Long enough is a
    // function of the line, not a constant: a fixed 2.6s was fine for "One
    // fed." and gone before you finished the friendlier lines that replaced it.
    clearTimeout(this.asideHold);
    const read = Math.min(6000, 1500 + (this.asideFull?.length ?? 0) * 55);
    this.asideHold = setTimeout(() => this.#asideNext(), read);
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
    // `passes` and `seats` are the room's own indexes, rebuilt whenever the
    // furniture moves. An earlier version read `r.furniture`, which is not a
    // thing the room has, so every shot quietly fell back to the middle of the
    // floor and the camera never actually looked at anything.
    if (what === 'pass') p = tile(r.passes?.[0]);
    if (what === 'door') p = r.entryWorld ?? null;
    if (what === 'seats') p = tile(r.seats?.find((x) => x.table) ?? r.seats?.[0]);
    if (what === 'works') p = tile(g.factory?.grid?.values?.().next?.().value);
    const b = z.bounds();
    const to = p ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    // a push-in, not a cut: the zoom used to be assigned outright, so the shot
    // arrived already close and then slid sideways into place
    z.cam.zoomGlide(Math.min(1.5, this.camWas.zoom * 1.4));
    this.shot = { x: to.x, y: to.y - 20 };
    this.driftT = 0;
    z.cam.glideTo(this.shot.x, this.shot.y);
  }

  /**
   * The shot breathes while he talks.
   *
   * A cutscene that pushes in and then holds perfectly still for four lines is
   * a screenshot with words on it. A few pixels of drift, slower than you can
   * follow, is the difference between a camera looking at the room and a
   * picture of the room — and because the follow is already a spring, the
   * camera lags the drift and rounds it off by itself.
   *
   * Small enough that nobody will ever point at it. That is the size it wants
   * to be.
   */
  #float(dt) {
    if (!this.playing || !this.shot || !this.game.state.motionOn) return;
    this.driftT = (this.driftT ?? 0) + dt;
    const t = this.driftT;
    this.game.zone.cam.glideTo(
      this.shot.x + Math.sin(t * 0.34) * 11,
      this.shot.y + Math.cos(t * 0.26) * 7);
  }

  #restoreCam() {
    const z = this.game.zone;
    this.shot = null;
    if (!this.camWas) return;
    z.cam.zoomGlide(this.camWas.zoom);
    z.cam.glideTo(this.camWas.x, this.camWas.y);
    this.camWas = null;
  }

  /* ---------------------------------------------------------------- quests */

  /**
   * The job on the HUD.
   *
   * The board offers several at once now, so one of them is pinned and that is
   * the one in the corner of the screen. If the pin has gone stale — finished,
   * or from a save that predates pinning — the first thing on the frontier
   * stands in, which is what a linear list did anyway.
   */
  get quest() {
    const st = this.s.story;
    if (!st) return null;
    const open = st.open ?? [];
    const id = open.includes(st.pin) ? st.pin : open[0];
    return JOB_BY_ID[id] ?? null;
  }

  /** Put a different open job in the corner of the screen. */
  pin(id) {
    const st = this.s.story;
    if (!st || !(st.open ?? []).includes(id)) return;
    st.pin = id;
    this.qSig = null;
    this.s.save();
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
    const st = s.story;
    st.done.push(q.id);
    /*
     * The board moves on.
     *
     * Anything this job opened joins the frontier, and the job itself leaves
     * it. A fork therefore puts two or three things on the board at once and
     * you choose which to pin — and the ones you do not pin stay there, so a
     * branch is a decision about order rather than a door closing behind you.
     */
    st.open = st.open.filter((id) => id !== q.id);
    for (const id of q.next) {
      if (!st.done.includes(id) && !st.open.includes(id)) st.open.push(id);
    }
    // pin the thing this job opened, unless it opened a choice — a fork wants
    // the player to look at the board and pick, not to be handed one at random
    st.pin = q.next.length === 1 ? q.next[0] : (st.open[0] ?? null);

    s.earn(q.coins);
    if (q.fame) s.addStars(q.fame);
    const prizes = this.#pay(q);
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

    this.#banner(q, 'Job done', prizes);
    this.el.quest.classList.add('ding');
    setTimeout(() => this.el.quest.classList.remove('ding'), 700);
    setTimeout(() => this.aside([q.done]), 1500);

    // A fork is worth saying out loud. The board has just gone from one thing
    // to three and nothing on screen would otherwise mention it, so he does.
    if (q.next.length > 1) {
      const names = q.next.map((id) => PATHS[JOB_BY_ID[id]?.path]?.name).filter(Boolean);
      if (names.length > 1) {
        const many = names.length > 2 ? 'three' : 'two';
        const list = `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
        setTimeout(() => this.aside([
          `Right — ${many} ways to go from here, and none of them wrong.`,
          `${list}. Have a look at the board and pick one.`,
          "The others don't go anywhere. They'll still be there after.",
        ]), 3000);
      }
    }

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

  /**
   * The thing on top of the money.
   *
   * Coins and fame are what every job pays, and after the fortieth one they
   * are a number going up. A prize is the other kind of reward: a recipe you
   * did not have to learn, three crates in the larder, research you did not
   * have to grind for. The point of the strands is that each deals in its own
   * one of these, so "which branch" is a real question with no right answer.
   *
   * Returns what to print on the payout, in the order it should be read.
   */
  #pay(q) {
    const s = this.s;
    const p = q.prize;
    if (!p) return [];
    const out = [];
    if (p.coins) { s.earn(p.coins); out.push({ ico: 'sand', text: `+${p.coins} bonus` }); }
    if (p.fame) { s.addStars(p.fame); out.push({ ico: 'star', text: `+${p.fame} fame` }); }
    if (p.recipe && !s.isUnlocked(p.recipe)) {
      s.unlock(p.recipe);
      out.push({ ico: 'book', text: RECIPE_BY_ID[p.recipe]?.name ?? 'a new recipe' });
    }
    if (p.research) { s.addResearch(p.research); out.push({ ico: 'lab', text: `+${p.research} research` }); }
    if (p.clay) { s.addClay(p.clay); out.push({ ico: 'kiln', text: `+${p.clay} clay` }); }
    if (p.pottery) { s.addPottery(p.pottery); out.push({ ico: 'kiln', text: `+${p.pottery} practice` }); }
    for (const [id, n] of Object.entries(p.ing ?? {})) {
      s.addIng(id, n);
      out.push({ ico: 'crate', text: `${n} ${INGREDIENTS[id]?.name ?? id}` });
    }
    return out;
  }

  /**
   * The reward, and you watch it open.
   *
   * It arrives shut — a little sealed packet with a wax stamp on it — sits for
   * a beat, then springs open and the pay drops out of it one piece at a time.
   * It used to simply appear with the numbers already on it, which is a receipt
   * rather than a reward: the whole pleasure of being paid is the half second
   * before you know how much.
   */
  #banner(q, kind = 'Job done', prizes = []) {
    const el = h(`div.payout.shut${prizes.length ? '.payout-rich' : ''}`, null,
      h('span.payout-seal', null, '★'),
      h('span.payout-tick', null, '✓'),
      h('span.payout-body', null,
        h('b', null, kind),
        h('span', null, q.title),
        // the prize, listed under the job, each line dropping in after the last
        prizes.length
          ? h('span.payout-prize', null, ...prizes.map((p, i) => h('span.payout-got', {
            style: { animationDelay: `${560 + i * 180}ms` },
          }, h(`i.ico.ico-${p.ico}`), p.text)))
          : null),
      h('span.payout-pay', null,
        h('span.payout-coin', null, h('i.ico.ico-sand'), `+${q.coins}`),
        q.fame ? h('span.payout-fame', null, h('i.ico.ico-star'), `+${q.fame}`) : null));
    document.getElementById('hud').append(el);
    // the beat before it opens is the whole trick, so it is a real wait
    setTimeout(() => {
      el.classList.remove('shut');
      el.classList.add('open');
      this.game.sfx.play('star');
    }, 420);
    const hold = 2900 + prizes.length * 320;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, hold);
  }

  /* --------------------------------------------------------------- pointing */

  /** Where the standing job is on screen right now, if anywhere. */
  #spotBox() {
    const q = this.quest;
    return q ? Point.box(SPOTS[q.id], this.game) : null;
  }

  /**
   * Keep the finger on the standing job.
   *
   * It stands down for the guide, which does its own pointing, and for a
   * cutscene, which owns the screen. Otherwise it follows: while a panel is
   * shut it sits on the rail button, and the moment that panel opens it walks
   * inward to the tab — the trail in data/quests.js is what makes that free.
   */
  #aim(q) {
    const p = this.game.hud.point;
    if (!p) return;
    // ...and while you are reading the board, where the job is already in
    // front of you and a finger jabbing at a rail button behind the panel is
    // pointing at the answer to a question nobody asked
    // The guide owns the pointer while it is up, and sets it every frame — so
    // this stands well clear rather than hiding it, or the two would fight over
    // the same element and whichever ran second would win.
    if (this.game.tutor?.running) return;
    // ...and it stands down while you are reading the board, where the job is
    // already in front of you and a finger jabbing at a rail button behind the
    // panel is pointing at the answer to a question nobody asked
    if (this.playing || this.game.hud.sheetOpen === 'quests') { p.hide(); return; }

    /*
     * Something in the room outranks the job list.
     *
     * The rooms used to shout for themselves — a green pool under every free
     * chair, a dashed diamond in front of every beltless machine — and the
     * pointer got on with the standing job regardless. That is two systems
     * asking for attention in two visual languages, and the loud one was the
     * one made of floor decals.
     *
     * So the rooms whisper instead: each hands back at most one thing that
     * actually wants a player right now (Restaurant#attention,
     * Factory#attention), and it borrows the finger. A cross guest with a
     * chair going spare beats a rail button every time — the job will still be
     * there in ten seconds, the guest will not.
     */
    const urgent = this.game.zone.attention?.() ?? null;
    const box = (urgent && Point.box({ world: () => urgent }, this.game))
      || (q && Point.box(SPOTS[q.id], this.game));
    if (box) p.at(box); else p.hide();
  }

  #aimOff() { this.game.hud.point?.hide(); }

  /* -------------------------------------------------------------- watchdog */

  /**
   * Never let a cutscene trap anybody.
   *
   * A scene claims the whole screen and only a tap on it lets go, so if it is
   * ever marked playing while the element that takes the tap is not on screen,
   * the player is looking at a dark room with no way out and no way forward —
   * which is exactly what the stale fade-out timer used to cause. That specific
   * bug is fixed above; this is here so the next one like it lasts half a
   * second rather than ending the session.
   *
   * It also catches the honest cases: a line that somehow never landed, or a
   * scene left up while the tab was in the background for a minute.
   */
  #watchdog(dt) {
    if (!this.playing) { this.stuck = 0; return; }
    const gone = this.el.scene.classList.contains('hidden')
      || this.el.scene.classList.contains('out');
    if (!gone) { this.stuck = 0; return; }
    this.stuck = (this.stuck ?? 0) + dt;
    if (this.stuck < 0.5) return;
    this.stuck = 0;
    console.warn('story: scene was playing with nothing on screen — closing it');
    this.skip();
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    if (this.game.attract) { this.#aimOff(); return; }
    this.#watchdog(dt);
    this.#float(dt);
    // The finger tracks every frame. Everything else in here is throttled to
    // three ticks a second, which is plenty for a progress bar and nowhere near
    // enough for a pointer sitting on a guest walking across the room.
    this.#aim(this.quest);
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
        // what the job is, then where to go and do it. The card used to show
        // only the second of those, so the ticket in the corner of the screen
        // said "Build → the Decor page" and never once said why.
        this.el.qDesc.textContent = q.desc ?? '';
        this.el.qHint.textContent = q.hint ?? '';
        this.el.qN.textContent = q.need > 1 ? `${have}/${q.need}` : '';
        this.el.qPay.textContent = `+${q.coins}`;
        this.el.qFill.style.width = `${Math.round(pct * 100)}%`;
        this.el.quest.classList.toggle('near', pct >= 0.75 && !done);
      }
      if (done) this.#finish(q);
    } else show(this.el.quest, false);
    this.game.hud.syncQuestBadge?.(JOBS.length - (s.story.done?.length ?? 0));

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
