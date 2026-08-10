// The always-on HUD: currency chips, corner buttons, toasts, and the bottom
// sheet shell that every panel renders into.

import { $, $$, clear, h, show } from './dom.js';
import { clamp, money } from '../core/util.js';
import { RESEARCH } from '../data/progress.js';
import { RECIPE_BY_ID } from '../data/recipes.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      coins: $('[data-bind="coins"]'),
      stars: $('[data-bind="stars"]'),
      phase: $('[data-bind="phase"]'),
      rank: $('[data-bind="rank"]'),
      rankFill: $('#rank-fill'),
      rankChip: $('#chip-rank'),
      served: $('[data-bind="served"]'),
      earned: $('[data-bind="earned"]'),
      stock: $('[data-bind="stock"]'),
      menuBadge: $('[data-bind="menu-badge"]'),
      coinChip: $('#chip-coins'),
      starChip: $('#chip-stars'),
      serviceBar: $('#servicebar'),
      sbMenu: $('#sb-menu'),
      service: $('#btn-service'),
      toasts: $('#toasts'),
      hint: $('#hint'),
      placebar: $('#placebar'),
      placeLabel: $('#placebar-label'),
      placeTitle: $('#placebar-title'),
      placeTurns: $('#placebar-turns'),
      scrim: $('#scrim'),
      sheet: $('#sheet'),
      sheetTitle: $('#sheet-title'),
      sheetTabs: $('#sheet-tabs'),
      sheetBody: $('#sheet-body'),
      sheetFoot: $('#sheet-foot'),
      sound: $('#btn-sound'),
      auto: $('#btn-auto'),
      card: $('#titlecard'),
      flyer: $('#btn-flyer'),
      rail: $('#rail'),
      researchBadge: $('[data-bind="research-badge"]'),
      flyerCount: $('#flyer-count'),
      flyerFill: $('#flyer-fill'),
      cardMain: $('#titlecard-main'),
      cardSub: $('#titlecard-sub'),
    };
    this.hintTimer = 0;
    this.sheetOpen = null;
    this.#wire();
  }

  #wire() {
    const g = this.game;
    // One place to open everything, and one place that knows what is open.
    // Five icons down the right edge: build, the kitchen, what you own, who
    // comes in, and everything else. The kiln left the list entirely — it is a
    // building on the factory floor now, so you open it by tapping it.
    this.docked = [
      ['btn-build', 'build', () => g.openBuild()],
      ['btn-recipes', 'recipes', () => g.openRecipes()],
      ['btn-pantry', 'pantry', () => g.openPantry()],
      ['btn-diary', 'diary', () => g.openDiary()],
      ['btn-menu', 'settings', () => g.openSettings()],
      ['btn-quests', 'quests', () => g.panels.openQuests()],
    ];
    for (const [id, key, open] of this.docked) {
      const el = $(`#${id}`);
      if (!el) continue;
      el.dataset.key = key;
      el.onclick = () => {
        // tapping the panel that is already up closes it, so the dock works as
        // a toggle rather than a one-way trip
        if (this.sheetOpen === key) { this.closeSheet(); return; }
        this.#popDock(el);
        open();
      };
    }
    this.el.flyer.onclick = () => g.tapFlyer();
    this.el.sound.onclick = () => g.toggleSound();
    this.el.rankChip.onclick = () => g.panels.openFame();
    this.el.auto.onclick = () => {
      g.state.auto = !g.state.auto;
      g.state.save();
      g.sfx.play(g.state.auto ? 'select' : 'tap');
      g.toast(g.state.auto ? 'Auto-plating on' : 'Auto-plating off', g.state.auto ? 'good' : '');
      this.sync();
    };
    this.el.service.onclick = () => g.toggleService();

    $('#sheet-close').onclick = () => this.closeSheet();
    this.el.scrim.onclick = () => this.closeSheet();

    $('#placebar-rotate').onclick = () => g.rotatePlacement();
    $('#placebar-done').onclick = () => g.cancelPlacement();

    for (const b of $$('#zoneswitch button')) {
      b.onclick = () => g.setZone(b.dataset.zone);
    }
  }

  /* ------------------------------------------------------------------ chips */

  /** Push state into the HUD. Runs every frame during service, so it only
   *  writes to the DOM when a value has actually changed. */
  sync() {
    const s = this.game.state;
    const r = this.game.restaurant;
    const open = s.phase === 'open';
    const label = open ? 'Open' : s.phase === 'report' ? 'Closing' : 'Prep';
    const planned = s.plannedCount;

    this.#roll('coins', s.coins);
    this.#text('stars', money(s.stars));
    this.#text('phase', `Day ${s.day} · ${label}`);
    this.#text('rank', s.rankName);
    const fw = `${Math.round(s.rankPct * 100)}%`;
    if (this.el.rankFill.style.width !== fw) this.el.rankFill.style.width = fw;

    show(this.el.serviceBar, open);
    if (open) {
      this.#text('served', String(r.served));
      this.#text('earned', money(r.earned));
      this.#text('stock', String(s.stockCount));
      this.#syncMenuLeft(s);
    }

    show(this.el.menuBadge, !open && planned > 0);
    this.#text('menuBadge', String(planned));

    // a spendable research point is worth a nudge; a spent one is not
    const spendable = s.hasWorks('lab') && RESEARCH.some((n) => s.canResearch(n.id));
    show(this.el.researchBadge, spendable);
    this.#text('researchBadge', String(s.research));

    this.syncDock();

    this.#text('service', open ? 'Close' : 'Open!');
    this.el.service.classList.toggle('pill-go', !open);
    this.el.service.classList.toggle('pill-stop', open);
    const canOpen = planned > 0 && r.seatCount > 0 && r.hasPass;
    this.el.service.disabled = s.phase === 'report' || (!open && !canOpen);

    // The board out front. It is only a thing while the doors are open — a
    // button that prints a poster for tomorrow was one more morning chore, and
    // the morning is for the menu. Ten taps calls somebody in, as many times as
    // you like; what ends the day is the food running out.
    show(this.el.flyer, open);
    const taps = s.flyer?.taps ?? 0;
    const need = s.flyerTaps;
    this.el.flyer.classList.add('handout');
    this.#text('flyerCount', `${taps}/${need}`);
    const w = `${Math.round(clamp(taps / need, 0, 1) * 100)}%`;
    if (this.el.flyerFill.style.width !== w) this.el.flyerFill.style.width = w;
    // nothing plated is the only thing that stops the board working
    this.el.flyer.classList.toggle('spent', s.stockCount <= 0);

    this.el.auto.classList.toggle('pill-sun', !!s.auto);
    this.el.auto.classList.toggle('pill-quiet', !s.auto);

    const icon = `ico ico-${this.game.sfx.enabled ? 'sound' : 'mute'}`;
    if (this.el.sound.firstElementChild.className !== icon) {
      this.el.sound.firstElementChild.className = icon;
    }
  }

  /**
   * What is left on the menu, dish by dish. Rebuilt only when the numbers
   * actually change — this runs every frame during service.
   */
  #syncMenuLeft(s) {
    const el = this.el.sbMenu;
    if (!el) return;
    const rows = Object.entries(s.stock).filter(([, n]) => n > 0);
    const sig = rows.map(([id, n]) => `${id}:${n}`).join(',');
    if (sig === this.menuLeftSig) return;
    this.menuLeftSig = sig;
    clear(el);
    for (const [id, n] of rows) {
      el.append(h('span.sb-dish', { title: RECIPE_BY_ID[id]?.name ?? id },
        h('i', { style: { backgroundImage: `url("${this.game.assets.url('food', id)}")` } }),
        h('b', null, String(n))));
    }
    show(el, rows.length > 0);
  }

  /** How many jobs are left, on the rail's Jobs button. */
  syncQuestBadge(left) {
    const el = $('[data-bind="quest-badge"]');
    if (!el) return;
    show(el, left > 0);
    if (el.textContent !== String(left)) el.textContent = String(left);
  }

  /** Restart the squash so a repeat tap still reads as a tap. */
  #popDock(el) {
    el.classList.remove('pressed');
    void el.offsetWidth;
    el.classList.add('pressed');
  }

  /** Light up whichever rail button matches the open panel. */
  syncDock() {
    for (const [id, key] of this.docked ?? []) {
      $(`#${id}`)?.classList.toggle('on', this.sheetOpen === key);
    }
  }

  #text(key, value) {
    const el = this.el[key];
    if (el && el.textContent !== value) el.textContent = value;
  }

  /**
   * Count a number up to its new value instead of snapping. Sand dollars are
   * the score, and watching a payment land is most of the reward for the run
   * that earned it — a number that simply changes throws that away.
   */
  #roll(key, value) {
    const el = this.el[key];
    if (!el) return;
    this.rolls ??= new Map();
    const from = this.rolls.get(key) ?? value;
    if (from === value) { this.#text(key, money(value)); this.rolls.set(key, value); return; }
    // a big jump still lands quickly; a small one is worth watching
    const step = Math.max(1, Math.ceil(Math.abs(value - from) / 12));
    const next = value > from ? Math.min(value, from + step) : Math.max(value, from - step);
    this.rolls.set(key, next);
    this.#text(key, money(next));
    if (next !== value) {
      cancelAnimationFrame(this.rollRaf ?? 0);
      this.rollRaf = requestAnimationFrame(() => this.sync());
    }
  }

  setZone(zone) {
    for (const b of $$('#zoneswitch button')) b.classList.toggle('on', b.dataset.zone === zone);
  }

  /** Little pop on the coin chip when money lands. */
  bumpCoin() {
    const el = this.el.coinChip;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' },
    );
  }

  /**
   * A flyer went out — or came off the press. Kick the satchel so a tap that
   * costs a poster is felt in the HUD and not only in the room.
   */
  bumpFlyer() {
    this.el.flyer.animate(
      [
        { transform: 'scale(1) rotate(0deg)' },
        { transform: 'scale(1.1) rotate(-4deg)' },
        { transform: 'scale(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,1.7,.4,1)' },
    );
  }

  /** Draw the eye to the flyer when someone tries to open with no posters up. */
  pulseFlyer() {
    this.el.flyer.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.16) rotate(-3deg)' }, { transform: 'scale(1)' }],
      { duration: 480, iterations: 2, easing: 'cubic-bezier(.2,1.6,.4,1)' },
    );
  }

  bumpStar() {
    this.el.starChip.animate(
      [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.18) rotate(-6deg)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)' },
    );
  }

  /** Sweep a big label across the middle of the screen, then clear it. */
  titleCard(main, sub = '') {
    const el = this.el.card;
    this.el.cardMain.textContent = main;
    this.el.cardSub.textContent = sub;
    show(el, true);
    // restart the CSS animation even if the card is already showing
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => show(el, false), 1900);
  }

  /* ----------------------------------------------------------------- toasts */

  toast(text, kind = '') {
    const el = h(`div.toast${kind ? `.${kind}` : ''}`, null, text);
    this.el.toasts.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 1900);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstElementChild.remove();
  }

  /**
   * The chef, in passing. Not a cutscene — a line from the pass while you carry
   * on working, which is where most of what he has to say belongs.
   */
  chefSays(text) {
    if (!text) return;
    const el = h('div.chefline', null,
      h('i', { style: { backgroundImage: `url("${this.game.assets.url('staff', '04_octopus_head_chef')}")` } }),
      h('span', null, text));
    this.el.toasts.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 3400);
  }

  /**
   * Centre-screen nudge that fades on its own. Honours the Tips switch here
   * rather than at each call site — there are a dozen of those and only one of
   * this.
   */
  hint(text, seconds = 2.6) {
    if (!text || !this.game.state.tipsOn) { show(this.el.hint, false); return; }
    this.el.hint.textContent = text;
    show(this.el.hint, true);
    this.hintTimer = seconds;
  }

  update(dt) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) show(this.el.hint, false);
    }
  }

  /* -------------------------------------------------------------- place bar */

  showPlaceBar(label, { rotate = true, title = 'Blueprint', turn = 0 } = {}) {
    this.el.placeLabel.textContent = label;
    this.el.placeTitle.textContent = title;
    show($('#placebar-rotate'), rotate);
    show(this.el.placeTurns, rotate);
    const dots = this.el.placeTurns?.children ?? [];
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === (turn % 4));
    show(this.el.placebar, true);
  }

  hidePlaceBar() { show(this.el.placebar, false); }

  /* ------------------------------------------------------------------ sheet */

  /**
   * Render the bottom sheet.
   * @param {{key:string,title:string,tabs?:{id:string,label:string}[],
   *          tab?:string, onTab?:(id:string)=>void, body:Node|Node[],
   *          foot?:Node|Node[]}} spec
   */
  openSheet(spec) {
    this.sheetGen = (this.sheetGen ?? 0) + 1;
    const wasOpen = this.sheetOpen;
    this.sheetOpen = spec.key ?? spec.title;
    this.el.sheetTitle.textContent = spec.title;

    // Every panel is a book now. Two of them are drawn spreads with boxes ruled
    // on the page — the kitchen and the diary — and build their own pages; the
    // rest are written into the blank notebook, which paginates whatever it is
    // handed. Nothing in the game is a plain cream rectangle any more.
    const book = spec.book ?? 'page';
    const sheet = this.el.sheet;
    sheet.classList.toggle('book', true);
    sheet.classList.toggle('book-menu', book === 'menu');
    sheet.classList.toggle('book-diary', book === 'diary');
    sheet.classList.toggle('book-page', book === 'page');
    if (wasOpen !== this.sheetOpen) this.openBook();

    const first = sheet.classList.contains('hidden');

    clear(this.el.sheetTabs);
    if (spec.tabs?.length) {
      for (const t of spec.tabs) {
        const on = t.id === spec.tab;
        this.el.sheetTabs.append(h(`button.tab${on ? '.on' : ''}`, {
          type: 'button',
          onclick: () => { if (!on) this.bookPage[this.sheetOpen] = 0; spec.onTab?.(t.id); },
        }, t.label));
      }
    }

    clear(this.el.sheetBody);
    clear(this.el.sheetFoot);
    // On screen before anything is written into it. Setting a page needs to
    // measure the paper, and a panel that is still `display: none` measures
    // nothing at all — every card would come out taller than the page.
    show(this.el.sheet, true);
    // The footer goes on before the page is set, and for a book it keeps its
    // height whether it has anything in it or not — otherwise the arrows appear
    // after the measuring and the last card on the page is pushed off it.
    const foot = [].concat(spec.foot ?? []).filter(Boolean);
    if (foot.length) this.el.sheetFoot.append(...foot);
    show(this.el.sheetFoot, foot.length > 0 || book === 'page');

    let leaves = null;
    if (book === 'page') {
      leaves = this.#writeInto(this.el.sheetBody, [].concat(spec.body ?? []));
      if (leaves.pages > 1) this.el.sheetFoot.append(this.#pageArrows(leaves));
    } else {
      this.el.sheetBody.append(...[].concat(spec.body ?? []));
    }

    this.syncDock();
    document.getElementById('hud').classList.add('sheeting');
    show(this.el.scrim, true);
    this.el.sheet.classList.remove('out');
    if (!first) this.el.sheetBody.scrollTop = spec.keepScroll ? this.el.sheetBody.scrollTop : 0;
  }

  /* ------------------------------------------------------- writing the book */

  /** Is there room for the whole spread, or only one leaf of it? */
  get wideBook() {
    return typeof window !== 'undefined'
      && window.matchMedia('(min-width: 40rem)').matches;
  }

  /**
   * Write a panel's content onto the blank notebook.
   *
   * The paper is a drawing with a fixed shape, so it is never stretched to fit
   * a list and never cropped to hide one. Instead the list is set into the page
   * the way a printer would: cards are poured into the writing area until the
   * next one would run off the bottom, and that one starts the next page. Two
   * leaves are showing on a wide screen and one on a phone, so the same list
   * simply falls into more pages on a phone — which is what a smaller book does.
   *
   * The measuring is real. Each card is put on the page and its height read
   * back, so a two-line card and a five-line card both land where they should
   * without a table of guessed row heights to keep in step with the CSS.
   */
  #writeInto(host, nodes) {
    const wide = this.wideBook;
    const cols = wide ? 2 : 1;
    const pens = [h('div.pagecol'), h('div.pagecol')];
    const spread = h(`div.spread.spread-plain.${wide ? 'pg-spread' : 'pg-left'}`, null,
      h('div.slot.c1', null, pens[0]),
      h('div.slot.c2', null, pens[1]));
    host.append(h('div.bookwrap', null, spread));

    const items = nodes.filter(Boolean);
    if (!items.length) return { pages: 1, at: 0, key: this.sheetOpen };

    // One trip to the layout engine: every card goes on a page at the width it
    // will be read at, and its height is written down. Everything after this is
    // arithmetic, which is what makes the balancing and the widow rule below
    // cheap enough to be worth having.
    pens[0].append(...items);
    // margins as well as the box: a section heading carries one, and eight of
    // them unaccounted for is a card hanging off the bottom of the page
    const tall = items.map((el) => {
      const cs = getComputedStyle(el);
      return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    });
    const gap = parseFloat(getComputedStyle(pens[0]).rowGap) || 0;
    const room = pens[0].clientHeight - 2;
    pens[0].replaceChildren();

    const heading = (i) => items[i].classList?.contains('section');
    const runs = (i, cap) => {
      let used = 0;
      let j = i;
      while (j < items.length) {
        const add = tall[j] + (j > i ? gap : 0);
        if (used + add > cap && j > i) break;
        used += add;
        j++;
      }
      // A heading left at the foot of a column is a widow: it announces a list
      // that is over the page. It goes with what it announces.
      if (j > i + 1 && j < items.length && heading(j - 1)) j--;
      return j;
    };

    // walk the whole list once to learn where every page starts
    const starts = [0];
    let i = 0;
    for (let guard = 0; i < items.length && guard < 400; guard++) {
      for (let c = 0; c < cols && i < items.length; c++) i = runs(i, room);
      if (i < items.length) starts.push(i);
    }

    const key = this.sheetOpen;
    this.bookPage ??= {};
    const at = clamp(this.bookPage[key] ?? 0, 0, starts.length - 1);
    this.bookPage[key] = at;

    const from = starts[at];
    const to = starts[at + 1] ?? items.length;
    // A short panel would otherwise leave the right-hand leaf blank, which reads
    // as a bug rather than a book. When it all fits, it is set across the two
    // leaves the way a printer would break a column: halfway down by height.
    let split = to;
    if (cols === 2) {
      if (starts.length === 1) {
        const total = tall.reduce((a, b) => a + b + gap, -gap);
        let used = 0;
        split = from;
        while (split < to - 1 && used + tall[split] / 2 < total / 2) {
          used += tall[split] + gap;
          split++;
        }
        if (split > from + 1 && heading(split - 1)) split--;
      } else split = runs(from, room);
    }
    pens[0].append(...items.slice(from, Math.min(split, to)));
    if (cols === 2) pens[1].append(...items.slice(Math.min(split, to), to));
    // A page with two lines on it should not have them jammed against the top
    // rule with a hand's width of blank paper underneath. Short pages sit in
    // the middle of the leaf, the way a short note written on one does.
    const deep = (a, b) => tall.slice(a, b).reduce((x, y) => x + y + gap, -gap);
    const mid = Math.min(split, to);
    pens[0].classList.toggle('airy', mid > from && deep(from, mid) < room * 0.62);
    pens[1].classList.toggle('airy', to > mid && deep(mid, to) < room * 0.62);
    return { pages: starts.length, at, key };
  }

  /** ‹ 2 / 5 › along the bottom of the book. */
  #pageArrows({ pages, at, key }) {
    const turn = (d) => {
      const next = clamp(at + d, 0, pages - 1);
      if (next === at) return;
      this.bookPage[key] = next;
      this.flip(d);
      this.game.sfx?.play('tap');
      this.game.panels.refresh();
    };
    const arrow = (label, d, off) => h('button.pill.pill-sm.pill-quiet', {
      type: 'button', disabled: off, onclick: () => turn(d),
    }, label);
    return h('div.rowline.leafrow', null,
      arrow('‹', -1, at === 0),
      h('span.leafno', null, `${at + 1} / ${pages}`),
      arrow('›', 1, at >= pages - 1));
  }

  /**
   * A leaf turning over.
   *
   * The panel re-renders under it, so the leaf cannot live inside the body that
   * is about to be emptied — it is cut to the size of the page on screen and
   * pinned to the sheet, where it turns on its own and bows out. Its two faces
   * are the paper itself, offset to the page each one is standing in for, so
   * what sweeps across is a page of the book and not a rectangle.
   */
  flip(dir = 1) {
    const sheet = this.el.sheet;
    const spread = sheet.querySelector('.spread');
    if (!spread || this.game.state?.motionOn === false) return;
    const a = spread.getBoundingClientRect();
    const b = sheet.getBoundingClientRect();
    const wide = spread.classList.contains('pg-spread');
    const w = wide ? a.width / 2 : a.width;
    const back = dir < 0;
    const leaf = h(`div.leaf${back ? '.leaf-back' : ''}`, {
      style: {
        left: `${a.left - b.left + (wide && !back ? a.width / 2 : 0)}px`,
        top: `${a.top - b.top}px`,
        width: `${w}px`,
        height: `${a.height}px`,
      },
    }, h('div.leaf-face.leaf-front'), h('div.leaf-face.leaf-rear'));
    leaf.addEventListener('animationend', () => leaf.remove());
    sheet.append(leaf);
    setTimeout(() => leaf.remove(), 900);
  }

  /**
   * The covers coming open. A book panel is the one place in the game where the
   * container itself is the art, so it earns an animation of its own rather than
   * the same slide every other sheet uses.
   */
  openBook() {
    const el = this.el.sheetBody;
    if (!el) return;
    el.classList.remove('opening');
    void el.offsetWidth;
    el.classList.add('opening');
  }

  /**
   * A page turning. `dir` is which way you went, so the paper sweeps in from the
   * side you came from — the diary's arrows would otherwise feel like tabs.
   */
  turnPage(dir = 1) {
    const el = this.el.sheetBody;
    if (!el) return;
    const cls = dir < 0 ? 'turn-back' : 'turn-fwd';
    el.classList.remove('turn-fwd', 'turn-back');
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Re-render the open sheet without replaying the slide-in. */
  refreshSheet(spec) {
    if (this.sheetOpen !== (spec.key ?? spec.title)) return;
    const top = this.el.sheetBody.scrollTop;
    this.openSheet({ ...spec, keepScroll: true });
    this.el.sheetBody.scrollTop = top;
  }

  closeSheet() {
    if (this.el.sheet.classList.contains('hidden')) return;
    this.sheetOpen = null;
    this.syncDock();
    document.getElementById('hud').classList.remove('sheeting');
    this.el.sheet.classList.add('out');
    show(this.el.scrim, false);
    // a panel opened during the slide-out bumps the generation, so this
    // deferred hide bows out instead of closing the new one
    const gen = this.sheetGen = (this.sheetGen ?? 0) + 1;
    setTimeout(() => {
      if (this.sheetGen !== gen) return;
      this.el.sheet.classList.add('hidden');
      this.el.sheet.classList.remove('out');
    }, 190);
    this.game.onSheetClosed?.();
  }

  get isSheetOpen() { return !this.el.sheet.classList.contains('hidden'); }
}
