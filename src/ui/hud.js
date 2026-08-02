// The always-on HUD: currency chips, corner buttons, toasts, and the bottom
// sheet shell that every panel renders into.

import { $, $$, clear, h, show } from './dom.js';
import { money } from '../core/util.js';

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
      scrim: $('#scrim'),
      sheet: $('#sheet'),
      sheetTitle: $('#sheet-title'),
      sheetTabs: $('#sheet-tabs'),
      sheetBody: $('#sheet-body'),
      sheetFoot: $('#sheet-foot'),
      sound: $('#btn-sound'),
      card: $('#titlecard'),
      flyer: $('#btn-flyer'),
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
    $('#btn-build').onclick = () => g.openBuild();
    $('#btn-recipes').onclick = () => g.openRecipes();
    $('#btn-menu').onclick = () => g.openHub();
    $('#btn-pantry').onclick = () => g.openPantry();
    $('#btn-diary').onclick = () => g.openDiary();
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

    this.#text('coins', money(s.coins));
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

    this.#text('service', open ? 'Close' : 'Open!');
    this.el.service.classList.toggle('pill-go', !open);
    this.el.service.classList.toggle('pill-stop', open);
    const canOpen = planned > 0 && r.seatCount > 0 && r.hasPass;
    this.el.service.disabled = s.phase === 'report' || (!open && !canOpen);

    // flyers: only a job during prep, so the button steps aside once open
    const max = s.flyerMax;
    show(this.el.flyer, !open);
    if (!open) {
      this.#text('flyerCount', `${s.posters}/${max}`);
      const pct = s.posters >= max ? 1 : (s.flyer?.taps ?? 0) / s.flyerTaps;
      const w = `${Math.round(pct * 100)}%`;
      if (this.el.flyerFill.style.width !== w) this.el.flyerFill.style.width = w;
      this.el.flyer.classList.toggle('full', s.posters >= max);
    }

    const icon = `ico ico-${this.game.sfx.enabled ? 'sound' : 'mute'}`;
    if (this.el.sound.firstElementChild.className !== icon) {
      this.el.sound.firstElementChild.className = icon;
    }
  }

  #text(key, value) {
    const el = this.el[key];
    if (el && el.textContent !== value) el.textContent = value;
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

  showPlaceBar(label, { rotate = true } = {}) {
    this.el.placeLabel.textContent = label;
    show($('#placebar-rotate'), rotate);
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
    this.sheetOpen = spec.key ?? spec.title;
    this.el.sheetTitle.textContent = spec.title;

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

    const first = this.el.sheet.classList.contains('hidden');
    show(this.el.sheet, true);
    show(this.el.scrim, true);
    this.el.sheet.classList.remove('out');
    if (!first) this.el.sheetBody.scrollTop = spec.keepScroll ? this.el.sheetBody.scrollTop : 0;
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
