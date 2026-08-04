// The always-on HUD: currency chips, corner buttons, toasts, and the bottom
// sheet shell that every panel renders into.

import { $, $$, clear, h, show } from './dom.js';
import { clamp, money } from '../core/util.js';
import { RESEARCH } from '../data/progress.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      coins: $('[data-bind="coins"]'),
      stars: $('[data-bind="stars"]'),
      phase: $('[data-bind="phase"]'),
      served: $('[data-bind="served"]'),
      earned: $('[data-bind="earned"]'),
      stock: $('[data-bind="stock"]'),
      menuBadge: $('[data-bind="menu-badge"]'),
      coinChip: $('#chip-coins'),
      starChip: $('#chip-stars'),
      serviceBar: $('#servicebar'),
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
      ['btn-menu', 'hub', () => g.openHub()],
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
    $('#btn-help').onclick = () => g.openHelp();
    this.el.sound.onclick = () => g.toggleSound();
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

    show(this.el.serviceBar, open);
    if (open) {
      this.#text('served', String(r.served));
      this.#text('earned', money(r.earned));
      this.#text('stock', String(s.stockCount));
    }

    show(this.el.menuBadge, !open && planned > 0);
    this.#text('menuBadge', String(planned));

    // a spendable research point is worth a nudge; a spent one is not
    const spendable = s.researched
      ? RESEARCH.some((n) => s.canResearch(n.id))
      : false;
    show(this.el.researchBadge, spendable);
    this.#text('researchBadge', String(s.research));

    this.syncDock();

    this.#text('service', open ? 'Close' : 'Open!');
    this.el.service.classList.toggle('pill-go', !open);
    this.el.service.classList.toggle('pill-stop', open);
    const canOpen = planned > 0 && r.seatCount > 0 && r.hasPass;
    this.el.service.disabled = s.phase === 'report' || (!open && !canOpen);

    // Flyers are a job in both halves of the day: printed of a morning, handed
    // out at the door once the doors are open — one flyer, one guest. So the
    // button stays put and only changes what it is counting.
    const max = s.flyerMax;
    this.el.flyer.classList.toggle('handout', open);
    this.#text('flyerCount', open ? `${s.posters} left` : `${s.posters}/${max}`);
    const pct = open
      ? (max > 0 ? s.posters / max : 0)
      : (s.posters >= max ? 1 : (s.flyer?.taps ?? 0) / s.flyerTaps);
    const w = `${Math.round(clamp(pct, 0, 1) * 100)}%`;
    if (this.el.flyerFill.style.width !== w) this.el.flyerFill.style.width = w;
    this.el.flyer.classList.toggle('full', !open && s.posters >= max);
    this.el.flyer.classList.toggle('spent', open && s.posters <= 0);
    const wants = open ? 'Hand out a flyer' : 'Print a flyer';
    if (this.el.flyer.title !== wants) this.el.flyer.title = wants;

    const icon = `ico ico-${this.game.sfx.enabled ? 'sound' : 'mute'}`;
    if (this.el.sound.firstElementChild.className !== icon) {
      this.el.sound.firstElementChild.className = icon;
    }
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

  /** Centre-screen nudge that fades on its own. */
  hint(text, seconds = 2.6) {
    if (!text) { show(this.el.hint, false); return; }
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

    // panels that are books get the drawn spread behind them and open like one
    const book = spec.book ?? null;
    const sheet = this.el.sheet;
    sheet.classList.toggle('book', !!book);
    sheet.classList.toggle('book-menu', book === 'menu');
    sheet.classList.toggle('book-diary', book === 'diary');
    if (book && wasOpen !== this.sheetOpen) this.openBook();

    clear(this.el.sheetTabs);
    if (spec.tabs?.length) {
      for (const t of spec.tabs) {
        this.el.sheetTabs.append(h(`button.tab${t.id === spec.tab ? '.on' : ''}`, {
          type: 'button',
          onclick: () => spec.onTab?.(t.id),
        }, t.label));
      }
    }

    clear(this.el.sheetBody);
    this.el.sheetBody.append(...[].concat(spec.body ?? []));

    clear(this.el.sheetFoot);
    if (spec.foot) {
      this.el.sheetFoot.append(...[].concat(spec.foot));
      show(this.el.sheetFoot, true);
    } else show(this.el.sheetFoot, false);

    this.syncDock();
    document.getElementById('hud').classList.add('sheeting');
    const first = this.el.sheet.classList.contains('hidden');
    show(this.el.sheet, true);
    show(this.el.scrim, true);
    this.el.sheet.classList.remove('out');
    if (!first) this.el.sheetBody.scrollTop = spec.keepScroll ? this.el.sheetBody.scrollTop : 0;
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
