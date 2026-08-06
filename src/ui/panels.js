// Every bottom-sheet panel. Each opener builds a spec for Hud.openSheet and
// registers itself so state changes can re-render in place.

import { bar, h, ingChip, stepper, swatch, tag, thumb } from './dom.js';
import { money } from '../core/util.js';
import { INGREDIENTS, MARKET_ORDER, ingName } from '../data/ingredients.js';
import {
  MAX_LEVEL, RECIPES, RECIPE_BY_ID, priceAt, prepAt, starsAt, upgradeCost,
} from '../data/recipes.js';
import {
  BELT, FURNITURE, MACHINES, MACHINE_MAX_LEVEL, POTTERY, SILO, STAFF, STYLES,
  STYLE_BY_ID, WORKSHOP, costOf, groupFor, machineInterval, machineUpgradeCost,
  starsOf,
} from '../data/catalog.js';
import {
  GUESTS, GUEST_BY_ID, MAX_FRIEND, TASTES, heartsToNext,
} from '../data/guests.js';
import {
  FORGE_LEVEL, MAX_DISH, RESEARCH, RESEARCH_BY_ID, RESEARCH_GROUPS, SHOP,
  SHOP_BY_ID, forgeCost, plateFor, potteryLevel, potteryNext,
} from '../data/progress.js';
import { DIR_NAMES } from '../world/factory.js';

/** The wood each finish is painted in, for the swatch picker. */
const STYLE_SWATCH = { plain: '#e0c39a', cottage: '#c98d5e', antique: '#7c4a33' };

/** Thumbnail sprite for a catalogue entry — pairs show their front view. */
const spriteIdOf = (item) =>
  (typeof item.sprite === 'string' ? item.sprite : item.sprite.f ?? item.sprite.b);

export class Panels {
  constructor(game) {
    this.game = game;
    this.hud = game.hud;
    this.state = game.state;
    this.assets = game.assets;
    this.buildStyle = 'plain';
    this.buildTab = 'seating';
    this.factoryTab = 'belt';
    this.recipeTab = 'menu';
    this.pantryTab = 'pantry';
    this.reopen = null;   // re-runs the open panel after state changes
  }

  /** Re-render whatever panel is showing. */
  refresh() { if (this.hud.isSheetOpen) this.reopen?.(true); }

  /* --------------------------------------------------------------- helpers */

  #card({ src, title, sub, tags = [], side = null, onclick = null, cls = '', locked = false, wide = false, frames = 1, icon = null }) {
    const t = icon ? h('div.thumb.icon', null, h(`i.ico.ico-${icon}`)) : thumb(src, { wide, frames });
    return h(`div.card${onclick ? '.tap' : ''}${cls ? `.${cls}` : ''}${locked ? '.locked' : ''}`,
      onclick ? { onclick } : null,
      t,
      h('div.card-main', null,
        h('div.card-title', null, title),
        sub ? h('div.card-sub', null, sub) : null,
        tags.length ? h('div.rowline', null, tags) : null),
      side ? h('div.card-side', null, side) : null);
  }

  /** Price pill. Carries the sand-dollar glyph so a bare number is never
   *  mistaken for a count, and turns coral the moment you can't afford it. */
  #cost(n) {
    const ok = this.state.coins >= n;
    return tag(money(n), ok ? 'tag-cost' : 'tag-need', 'sand');
  }

  #ingRow(bill, scale = 1) {
    return Object.entries(bill).map(([id, q]) => {
      const need = Math.ceil(q * scale);
      return ingChip(this.assets.url('ingredients', id), `${need}`, this.state.have(id) < need);
    });
  }

  #goBtn(label, { disabled = false, onclick, cls = 'pill-sun' } = {}) {
    return h(`button.pill.pill-sm.${cls}`, { type: 'button', disabled, onclick }, label);
  }

  #styleRow() {
    return h('div.swatches', null, STYLES.map((s) => swatch(
      s.label,
      STYLE_SWATCH[s.id] ?? '#d9ae76',
      this.buildStyle === s.id,
      () => { this.buildStyle = s.id; this.openBuild(true); },
      s.star ? `+${s.star}★` : null,
    )));
  }

  /* ----------------------------------------------------------------- build  */

  openBuild(keep = false) {
    this.reopen = () => this.openBuild(true);
    if (this.game.zone === this.game.factory) return this.#openFactoryBuild(keep);

    const groups = {
      seating: ['table', 'seat'],
      kitchen: ['pass'],
      decor: ['decor'],
    };
    const kinds = groups[this.buildTab] ?? groups.seating;
    const items = FURNITURE.filter((f) => kinds.includes(f.kind));

    const body = this.buildTab === 'expand' ? this.#expandTab() : [
      h('div.note', null,
        'Pick a finish, then tap a piece and tap the floor. ', h('b', null, 'Rotate'),
        ' turns it to any of four sides; chairs turn to face their table on their own.'),
      this.#styleRow(),
      ...items.map((item) => {
        const cost = costOf(item, this.buildStyle);
        const stars = starsOf(item, this.buildStyle);
        return this.#card({
          src: this.assets.url(groupFor(item, this.buildStyle), spriteIdOf(item)),
          title: item.label,
          sub: item.blurb,
          tags: [this.#cost(cost), stars > 0 ? tag(`${stars}★`, 'tag-star') : null].filter(Boolean),
          onclick: () => this.game.startPlacing(item.id, this.buildStyle),
        });
      }),
    ];

    const spec = {
      key: 'build',
      title: 'Build the Dining Room',
      tabs: [
        { id: 'seating', label: 'Seating' },
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'decor', label: 'Decor' },
        { id: 'expand', label: 'Expand' },
      ],
      tab: this.buildTab,
      onTab: (id) => { this.buildTab = id; this.openBuild(true); },
      body,
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `Ambience ${this.state.ambience}★ · Rating ${'★'.repeat(this.state.rating)}`),
        tag(`${this.game.restaurant.seatCount} seats`, 'tag-mint')),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /**
   * Knocking through a wall. This used to be its own Harbour Shop panel with
   * three sections in it, which made it a shop that sold one kind of thing and
   * a dock button that mostly went unpressed. It belongs with the rest of the
   * building work, so it is a tab here and it sells nothing but floor.
   */
  #expandTab() {
    const s = this.state;
    const body = [
      h('div.note', null, 'The dining room is ', h('b', null, `${s.roomSize}×${s.roomSize}`),
        '. Knock through and every wall moves out — the only way to fit more tables.'),
    ];
    for (const item of SHOP) {
      const owned = s.hasBought(item.id);
      const locked = item.needs && !s.hasBought(item.needs);
      body.push(this.#card({
        icon: 'shop',
        title: item.label,
        sub: locked ? `Needs ${SHOP_BY_ID[item.needs].label} first.` : item.blurb,
        tags: [
          owned ? tag('Bought', 'tag-ok') : this.#cost(item.cost),
          tag(`${item.size}×${item.size}`, owned ? 'tag-mint' : 'tag-star'),
        ],
        locked: locked || owned,
        onclick: owned || locked ? null : () => {
          if (!s.buyShop(item.id)) { this.game.toast('Not enough sand dollars', 'bad'); return; }
          this.game.celebrate(`${item.label} — the room grew to ${s.roomSize}×${s.roomSize}`);
          this.openBuild(true);
        },
      }));
    }
    if (SHOP.every((i) => s.hasBought(i.id))) {
      body.push(h('div.empty', null, 'The harbour has no more wall to give.'));
    }
    return body;
  }

  #openFactoryBuild(keep) {
    const tabs = [
      { id: 'belt', label: 'Belts' },
      { id: 'producer', label: 'Machines' },
      { id: 'processor', label: 'Refiners' },
      { id: 'store', label: 'Storage' },
      { id: 'workshop', label: 'Workshop' },
      { id: 'pottery', label: 'Pottery' },
    ];
    let body = [];

    if (this.factoryTab === 'belt') {
      body = [
        h('div.note', null, 'Tap ', h('b', null, 'Conveyor'), ' then drag across the floor to draw a line. Belts carry whatever the machine behind them makes.'),
        this.#card({
          src: null,
          title: BELT.label,
          sub: BELT.blurb,
          tags: [this.#cost(BELT.cost)],
          onclick: () => this.game.startFactoryPlacing('belt', 'belt'),
        }),
        this.#card({
          src: null,
          title: 'Remove Tool',
          sub: 'Drag over belts or machines to take them back for half price.',
          tags: [tag('50% back', 'tag-ok')],
          onclick: () => this.game.startFactoryErase(),
        }),
      ];
    } else if (this.factoryTab === 'pottery') {
      const s = this.state;
      body = [
        h('div.note', null, 'The pottery works. Build the ', h('b', null, 'kiln'),
          ' and tap it to take a turn at the class — a forged dish is the only',
          ' permanent rise a single recipe can get.'),
        ...POTTERY.map((m) => {
          const built = s.hasWorks(m.kind);
          const oneOff = m.kind === 'kiln' || m.kind === 'wheel' || m.kind === 'glaze';
          return this.#card({
            src: this.assets.url('machines', m.sprite),
            title: m.label,
            sub: m.blurb,
            tags: [
              this.#cost(m.cost),
              m.interval ? tag(`${m.out ?? 1} clay / ${m.interval}s`, 'tag-mint')
                : built ? tag('Standing', 'tag-ok') : tag('One-off', 'tag-star'),
            ],
            locked: oneOff && built,
            onclick: oneOff && built ? null : () => this.game.startFactoryPlacing('machine', m.id),
          });
        }),
      ];
    } else if (this.factoryTab === 'workshop') {
      body = [
        h('div.note', null, 'Neither of these needs a belt. Drop them anywhere on the floor and they tick away on their own — even with the tab shut.'),
        ...WORKSHOP.map((m) => this.#card({
          src: this.assets.url('machines', m.sprite),
          title: m.label,
          sub: m.blurb,
          tags: [this.#cost(m.cost), tag(`every ${m.interval}s`, 'tag-mint')],
          onclick: () => this.game.startFactoryPlacing('machine', m.id),
        })),
      ];
    } else if (this.factoryTab === 'store') {
      body = [
        h('div.note', null, 'Anything a belt drops into the intake lands in your ', h('b', null, 'pantry'), ' and can be cooked with.'),
        this.#card({
          src: this.assets.url(SILO.group, SILO.sprite),
          title: SILO.label,
          sub: SILO.blurb,
          tags: [this.#cost(SILO.cost)],
          onclick: () => this.game.startFactoryPlacing('silo', 'silo'),
        }),
      ];
    } else {
      const kind = this.factoryTab;
      body = [
        kind === 'processor'
          ? h('div.note', null, 'Refiners turn cheap goods into valuable ones. Feed them with a belt and send the output onward.')
          : h('div.note', null, 'Machines make one ingredient over and over. Point them at a belt with the ', h('b', null, 'Rotate'), ' button.'),
        ...MACHINES.filter((m) => m.kind === kind).map((m) => this.#card({
          src: this.assets.url('machines', m.sprite),
          title: m.label,
          sub: m.kind === 'processor'
            ? `${m.inQty}× ${ingName(m.inId)} → 1 ${ingName(m.out)} every ${m.interval}s`
            : `1 ${ingName(m.out)} every ${m.interval}s`,
          tags: [this.#cost(m.cost), tag(ingName(m.out), 'tag-mint')],
          onclick: () => this.game.startFactoryPlacing('machine', m.id),
        })),
      ];
    }

    const rates = this.game.factory.throughput();
    const spec = {
      key: 'build',
      title: 'Build the Works',
      tabs,
      tab: this.factoryTab,
      onTab: (id) => { this.factoryTab = id; this.#openFactoryBuild(true); },
      body,
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null,
          Object.keys(rates).length
            ? `Output: ${Object.entries(rates).map(([id, n]) => `${ingName(id)} ${n.toFixed(1)}/min`).join(' · ')}`
            : 'No machines running yet'),
      ),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* --------------------------------------------------------------- recipes  */

  /**
   * The Kitchen — one book with everything about food in it. It used to be two
   * panels called Menu Book and Pantry, which meant plating a dish and checking
   * whether you had the ingredients for it were different places. They are the
   * same job, so they are the same book: the menu, what you can learn, what you
   * can improve, and what is in the larder.
   *
   * It is drawn on a real open spread from the art pack, which is why the pages
   * turn instead of the list simply swapping.
   */
  openRecipes(keep = false) {
    this.reopen = () => this.openRecipes(true);
    const tabs = [
      { id: 'menu', label: "Today's Menu" },
      { id: 'learn', label: 'Learn' },
      { id: 'upgrade', label: 'Upgrade' },
      { id: 'pantry', label: 'Larder' },
    ];
    const leaves = this.recipeTab === 'upgrade' ? this.#upgradeLeaves()
      : this.recipeTab === 'learn' ? this.#learnLeaves()
        : this.recipeTab === 'pantry' ? this.#larderLeaves()
          : this.#menuLeaves();

    const book = this.#paginate('menu', leaves, `recipes:${this.recipeTab}`,
      this.recipeTab === 'menu' ? this.#specials() : []);

    this.menuTotalEl = h('span.card-sub.grow.mid');
    this.menuOpenBtn = this.#goBtn('Open Up!', {
      cls: 'pill-go',
      onclick: () => { this.hud.closeSheet(); this.game.toggleService(); },
    });
    // the footer has page arrows either side of it now, so the one button that
    // matters gets a name rather than being "the first button in the footer"
    this.menuOpenBtn.id = 'menu-open';
    this.#syncMenuFoot();

    const spec = {
      key: 'recipes',
      title: 'The Kitchen',
      book: 'menu',
      tabs,
      tab: this.recipeTab,
      onTab: (id) => { this.recipeTab = id; this.openRecipes(true); this.hud.turnPage(); },
      body: book.el,
      foot: h('div.rowline', null,
        book.prev, this.menuTotalEl, book.leaf, this.menuOpenBtn, book.next),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* ------------------------------------------------------------------ book  */

  /**
   * How many drawn boxes a page of a given book has.
   *
   * The spread art has real slots on it — three to a page on the menu book, four
   * on the diary's index — so the content is cut to fit them rather than poured
   * over the top. On a narrow screen only one page of the spread is showing, so
   * only that page's slots are available.
   */
  #slotCount(book) {
    const wide = this.#wideBook();
    if (book === 'diary') return 4;
    return wide ? 6 : 3;
  }

  /** Is there room for the whole spread, or only one page of it? */
  #wideBook() {
    return typeof window !== 'undefined'
      && window.matchMedia('(min-width: 40rem)').matches;
  }

  /**
   * Lay leaves into the drawn boxes of a spread, one page at a time.
   *
   * Returns the spread element plus the two page arrows, because a book that
   * scrolls is not a book. Anything past the last slot is simply on the next
   * page, which is what the arrows are for.
   */
  #paginate(book, leaves, key, extra = []) {
    // a spread reads left page then right. When there is something fixed for the
    // right — the day's specials on a menu — the left page paginates on its own
    // and the right keeps standing; on one page they simply queue up together.
    const wide = this.#wideBook();
    const half = book === 'diary' ? 4 : 3;
    const per = wide && extra.length ? half : this.#slotCount(book);
    const list = wide && extra.length ? leaves : [...leaves, ...extra];
    leaves = list;
    const pages = Math.max(1, Math.ceil(leaves.length / per));
    this.pageAt ??= {};
    const at = Math.max(0, Math.min(this.pageAt[key] ?? 0, pages - 1));
    this.pageAt[key] = at;

    const page = leaves.slice(at * per, at * per + per);
    while (wide && extra.length && page.length < half) page.push(h('div.line.empty-line'));
    const shown = wide && extra.length ? [...page, ...extra] : page;
    const el = this.#spread(book, shown, wide ? 'spread' : 'left');

    const turn = (d) => {
      const next = Math.max(0, Math.min(pages - 1, at + d));
      if (next === at) return;
      this.pageAt[key] = next;
      this.hud.turnPage(d);
      this.game.sfx.play('tap');
      this.reopen?.(true);
    };
    return {
      el,
      pages,
      page: at,
      leaf: h('span.leafno', null, pages > 1 ? `${at + 1} / ${pages}` : ''),
      prev: this.#goBtn('‹', { cls: 'pill-quiet', disabled: at === 0, onclick: () => turn(-1) }),
      next: this.#goBtn('›', { cls: 'pill-quiet', disabled: at >= pages - 1, onclick: () => turn(1) }),
    };
  }

  /**
   * The spread itself: the drawing, with one child per drawn box.
   *
   * `layout` picks which of it is showing — the whole spread, or just the left
   * or right page when there is only room for one. Cropping to a page is exact
   * rather than a guess: half the width at twice the scale is the same picture.
   */
  #spread(book, slots, layout = null) {
    const mode = layout ?? (this.#wideBook() ? 'spread' : 'left');
    return h('div.bookwrap', null,
      h(`div.spread.spread-${book}.pg-${mode}`, null,
        slots.map((node, i) => h(`div.slot.s${i + 1}`, null, node))));
  }

  /**
   * The right-hand page of today's menu: what the boats brought in, and what the
   * kitchen has ready. A menu book with three dishes in it would otherwise leave
   * a whole page blank.
   */
  #specials() {
    const s = this.state;
    const c = s.catch;
    const dish = c?.star ? RECIPE_BY_ID[c.star] : null;
    const cheap = (c?.cheap ?? []).map((id) => ingName(id)).join(', ');
    return [
      h('div.blurb.head', null,
        h('b', null, 'Today'),
        h('span', null, dish
          ? [ 'The harbour is asking for ', h('i', null, dish.name), ' — a third over the odds.' ]
          : 'Nothing special asked for.')),
      h('div.blurb', null,
        h('b', null, 'Cheap on the quay'),
        h('span', null, cheap || 'Nothing on offer.')),
      h('div.blurb', null,
        h('b', null, `${s.plannedCount} plated`),
        h('span', null, s.plannedCount
          ? 'Ingredients are already out of the larder.'
          : 'Set a number beside a dish to plate it up.')),
    ];
  }

  /** One line of a menu: the dish, what it costs, and how many to plate. */
  #menuLeaves() {
    const s = this.state;
    const open = s.phase === 'open';
    const unlocked = RECIPES.filter((r) => s.isUnlocked(r.id));
    const rows = [];

    const syncAll = () => {
      for (const row of rows) row.sync();
      this.#syncMenuFoot();
      this.game.hud.sync();
    };

    const leaves = unlocked.map((r) => {
      const level = s.levelOf(r.id);
      const asked = s.catchDish === r.id;
      const chips = new Map();
      for (const [id, q] of Object.entries(r.ing)) {
        chips.set(id, { el: ingChip(this.assets.url('ingredients', id), `${q}`, s.have(id) < q), need: q });
      }

      const step = stepper(s.menu[r.id] ?? 0, {
        min: 0,
        max: (s.menu[r.id] ?? 0) + s.servingsPossible(r.id),
        onChange: (v, d) => {
          if (d > 0) {
            if (!s.payIng(r.ing)) { this.game.toast('Larder is short', 'bad'); syncAll(); return; }
            s.menu[r.id] = (s.menu[r.id] ?? 0) + 1;
            this.game.sfx.play('tap');
          } else {
            if ((s.menu[r.id] ?? 0) <= 0) return;
            s.menu[r.id] -= 1;
            if (s.menu[r.id] <= 0) delete s.menu[r.id];
            for (const [id, q] of Object.entries(r.ing)) s.addIng(id, q);
            this.game.sfx.play('pop');
          }
          s.save();
          syncAll();
        },
      });

      const leftTag = h('b.dot', null, `${s.stock[r.id] ?? 0} left`);
      const qty = h('b.dot');
      const el = h('div.line', null,
        h('div.line-art', null, h('i', {
          style: { backgroundImage: `url("${this.assets.url('food', r.id)}")` },
        })),
        h('div.line-body', null,
          h('div.line-top', null,
            h('b.line-name', null, r.name),
            level > 1 ? h('span.lv', null, `Lv${level}`) : null,
            asked ? h('span.asked', { title: "Today's catch — pays a third more" }, '★') : null,
            h('span.dots'),
            h('span.line-price', null, money(priceAt(r, level)))),
          h('div.line-bot', null,
            h('span.line-sub', null, `${prepAt(r, level)}s · ${starsAt(r, level)}★`),
            h('span.ings', null, [...chips.values()].map((c) => c.el)),
            h('span.line-side', null, open ? leftTag : step.el))));

      rows.push({
        sync: () => {
          const n = s.menu[r.id] ?? 0;
          step.sync(n, n + s.servingsPossible(r.id));
          el.classList.toggle('on', n > 0);
          for (const [id, c] of chips) c.el.classList.toggle('short', s.have(id) < c.need);
          if (open) leftTag.textContent = `${s.stock[r.id] ?? 0} left`;
          qty.textContent = String(n);
        },
      });
      if ((s.menu[r.id] ?? 0) > 0) el.classList.add('on');
      return el;
    });

    this.menuRows = rows;
    return leaves;
  }

  #learnLeaves() {
    const s = this.state;
    return RECIPES.filter((r) => !s.isUnlocked(r.id)).map((r) => h('div.line', null,
      h('div.line-art.dim', null, h('i', {
        style: { backgroundImage: `url("${this.assets.url('food', r.id)}")` },
      })),
      h('div.line-body', null,
        h('div.line-top', null,
          h('b.line-name', null, r.name),
          h('span.dots'),
          h('span.line-price', null, money(r.price))),
        h('div.line-bot', null,
          h('span.line-sub', null, `${r.stars}★`),
          h('span.ings', null, Object.keys(r.ing).map((id) =>
            ingChip(this.assets.url('ingredients', id), '', false))),
          h('span.line-side', null, this.#goBtn(`Learn ${money(r.unlock)}`, {
            disabled: s.coins < r.unlock,
            onclick: () => {
              if (!s.spend(r.unlock)) return;
              s.unlock(r.id);
              s.save();
              this.game.celebrate(`Learned ${r.name}!`);
              this.refresh();
            },
          }))))));
  }

  #upgradeLeaves() {
    const s = this.state;
    return RECIPES.filter((r) => s.isUnlocked(r.id)).map((r) => {
      const level = s.levelOf(r.id);
      const maxed = level >= MAX_LEVEL;
      const cost = maxed ? null : upgradeCost(r, level);
      const afford = !maxed && s.coins >= cost.coins && s.hasAll(cost.ing);
      return h('div.line', null,
        h('div.line-art', null, h('i', {
          style: { backgroundImage: `url("${this.assets.url('food', r.id)}")` },
        })),
        h('div.line-body', null,
          h('div.line-top', null,
            h('b.line-name', null, r.name),
            h('span.lv', null, `Lv${level}`),
            h('span.dots'),
            h('span.line-price', null, maxed ? 'MAX' : money(cost.coins))),
          h('div.line-bot', null,
            h('span.line-sub', null, maxed ? 'Fully mastered.'
              : `${money(priceAt(r, level))} → ${money(priceAt(r, level + 1))}`),
            maxed ? null : h('span.ings', null, this.#ingRow(cost.ing)),
            h('span.line-side', null, maxed ? null : this.#goBtn('Upgrade', {
              disabled: !afford,
              onclick: () => this.#doUpgrade(r),
            })))));
    });
  }

  /** The larder, as shelves on the page. */
  #larderLeaves() {
    const s = this.state;
    const ids = Object.keys(INGREDIENTS).filter((id) => s.have(id) > 0);
    if (!ids.length) {
      return [h('div.line.empty-line', null, 'Bare shelves. Build a machine in the works, or buy from the market.')];
    }
    // three to a slot: a larder is a list of small things, and one per box
    // would take four page turns to read
    const groups = [];
    for (let i = 0; i < ids.length; i += 3) groups.push(ids.slice(i, i + 3));
    return groups.map((g) => h('div.shelf', null, g.map((id) => h('div.jar', null,
      h('i', { style: { backgroundImage: `url("${this.assets.url('ingredients', id)}")` } }),
      h('span.jar-n', null, ingName(id)),
      h('b.jar-q', null, `×${s.have(id)}`)))));
  }

  #syncMenuFoot() {
    const s = this.state;
    const planned = s.plannedCount;
    const value = Object.entries(s.menu).reduce((n, [id, q]) => n + s.priceOf(id) * q, 0);
    if (this.menuTotalEl) {
      this.menuTotalEl.textContent = `${planned} serving${planned === 1 ? '' : 's'} plated · up to ${money(value)} on the till`;
    }
    if (this.menuOpenBtn) {
      this.menuOpenBtn.disabled = s.phase === 'open' || planned === 0
        || !this.game.restaurant.hasPass || this.game.restaurant.seatCount === 0;
    }
  }

  #upgradeTab() {
    const s = this.state;
    const rows = RECIPES.filter((r) => s.isUnlocked(r.id)).map((r) => {
      const level = s.levelOf(r.id);
      const maxed = level >= MAX_LEVEL;
      const cost = maxed ? null : upgradeCost(r, level);
      const afford = !maxed && s.coins >= cost.coins && s.hasAll(cost.ing);
      return this.#card({
        src: this.assets.url('food', r.id),
        title: `${r.name} · Lv${level}`,
        sub: maxed
          ? 'Fully mastered.'
          : `${money(priceAt(r, level))} → ${money(priceAt(r, level + 1))} · ${prepAt(r, level)}s → ${prepAt(r, level + 1)}s · ${starsAt(r, level)}★ → ${starsAt(r, level + 1)}★`,
        tags: maxed ? [tag('MAX', 'tag-star')] : [this.#cost(cost.coins), ...this.#ingRow(cost.ing)],
        side: maxed ? null : this.#goBtn('Upgrade', {
          disabled: !afford,
          onclick: () => this.#doUpgrade(r),
        }),
        locked: false,
      });
    });
    return [
      h('div.note', null, 'Spend sand dollars plus more ', h('b', null, 'signature ingredient'), ' to raise a dish: better price, faster cook, extra stars.'),
      ...rows,
    ];
  }

  #doUpgrade(recipe) {
    const s = this.state;
    const level = s.levelOf(recipe.id);
    const cost = upgradeCost(recipe, level);
    if (s.coins < cost.coins || !s.hasAll(cost.ing)) { this.game.toast('Not enough', 'bad'); return; }
    s.spend(cost.coins);
    s.payIng(cost.ing);
    s.levels[recipe.id] = level + 1;
    s.save();
    this.game.celebrate(`${recipe.name} → Lv${level + 1}`);
    this.refresh();
  }

  #learnTab() {
    const s = this.state;
    const locked = RECIPES.filter((r) => !s.isUnlocked(r.id));
    const rows = locked.map((r) => this.#card({
      src: this.assets.url('food', r.id),
      title: r.name,
      sub: `${money(r.price)} a plate · ${r.prep}s · ${r.stars}★ · needs ${Object.keys(r.ing).map(ingName).join(', ')}`,
      tags: [this.#cost(r.unlock)],
      side: this.#goBtn('Learn', {
        disabled: s.coins < r.unlock,
        onclick: () => {
          if (!s.spend(r.unlock)) return;
          s.unlock(r.id);
          s.save();
          this.game.celebrate(`Learned ${r.name}!`);
          this.refresh();
        },
      }),
      locked: s.coins < r.unlock,
    }));
    return [
      h('div.note', null, 'New dishes cost sand dollars to learn. Fancier plates pull in fussier guests who pay more.'),
      ...rows,
      locked.length === 0 ? h('div.empty', null, 'You know every recipe in the harbour. Chef!') : null,
    ].filter(Boolean);
  }

  /* ---------------------------------------------------------------- pantry  */

  /**
   * Everything you own, in one place. The larder used to be the only view of it,
   * which left the plated dishes, the clay and the flyers with nowhere to be
   * counted — so this is the inventory proper, and buying is a tab of it.
   */
  openPantry(keep = false) {
    this.reopen = () => this.openPantry(true);
    const body = this.pantryTab === 'market' ? this.#marketTab() : this.#inventoryTab();
    const spec = {
      key: 'pantry',
      title: 'Inventory',
      tabs: [{ id: 'pantry', label: 'What You Own' }, { id: 'market', label: 'Harbor Market' }],
      tab: this.pantryTab,
      onTab: (id) => { this.pantryTab = id; this.openPantry(true); },
      body,
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /**
   * One frame of a character strip, shown whole.
   *
   * The element is given the frame's own aspect ratio and the strip is sized to
   * exactly N frames across it, so a frame lands on the box edge-to-edge with
   * nothing of its neighbours leaking in — and `posing` can then step the
   * background across all three drawings without any arithmetic.
   */
  #sprite(group, id, { pose = false } = {}) {
    const sp = this.assets.get(group, id);
    const n = sp?.count ?? 1;
    return h(`i${n > 1 && pose ? '.posing' : ''}`, {
      style: {
        backgroundImage: `url("${this.assets.url(group, id)}")`,
        backgroundSize: `${n * 100}% 100%`,
        aspectRatio: sp ? `${sp.fw} / ${sp.fh}` : '1 / 1',
      },
    });
  }

  /** A cell in one of the inventory grids. */
  #cell(src, name, qty, { icon = null, zero = false } = {}) {
    return h(`div.ing-cell${zero ? '.zero' : ''}`, null,
      icon ? h(`i.ico.ico-${icon}`) : h('i', { style: { backgroundImage: `url("${src}")` } }),
      h('div.n', null, name),
      h('div.q', null, qty));
  }

  #inventoryTab() {
    const s = this.state;
    const out = [];

    const plated = Object.entries(s.stock).filter(([, n]) => n > 0);
    if (plated.length) {
      out.push(h('div.section', null, 'Plated up'));
      out.push(h('div.grid-ing', null, plated.map(([id, n]) => this.#cell(
        this.assets.url('food', id), RECIPE_BY_ID[id]?.name ?? id, `×${n}`))));
    }

    const ids = Object.keys(INGREDIENTS).filter((id) => s.have(id) > 0);
    out.push(h('div.section', null, 'The larder'));
    out.push(ids.length
      ? h('div.grid-ing', null, ids.map((id) => this.#cell(
        this.assets.url('ingredients', id), ingName(id), `×${s.have(id)}`)))
      : h('div.empty', null, 'Empty. Build a machine in the works, or buy from the market.'));

    out.push(h('div.section', null, 'Odds and ends'));
    out.push(h('div.grid-ing', null, [
      this.#cell(null, 'Sand dollars', money(s.coins), { icon: 'sand' }),
      this.#cell(null, 'Reputation', `${money(s.stars)}★`, { icon: 'star' }),
      this.#cell(null, 'Flyers', `${s.posters}/${s.flyerMax}`, { icon: 'flyer', zero: s.posters === 0 }),
      this.#cell(null, 'Clay', `×${s.clay}`, { icon: 'kiln', zero: s.clay === 0 }),
      this.#cell(null, 'Research', `${s.research} rp`, { icon: 'lab', zero: s.research === 0 }),
      this.#cell(null, 'Hearts', `${s.diaryHearts}`, { icon: 'heart', zero: s.diaryHearts === 0 }),
    ]));

    const forged = Object.entries(s.dishes).filter(([, t]) => t > 0);
    if (forged.length) {
      out.push(h('div.section', null, 'Forged crockery'));
      out.push(h('div.grid-ing', null, forged.map(([id, t]) => this.#cell(
        this.assets.url('plates', plateFor(id, t)) || this.assets.url('food', id),
        RECIPE_BY_ID[id]?.name ?? id, '✦'.repeat(t)))));
    }
    return out;
  }

  /**
   * The larder, as a page of the kitchen book. Same shelves the inventory shows,
   * but here it is answering one question — can I cook what I just planned? — so
   * it also says which recipe each thing is short for.
   */
  #larderTab() {
    const s = this.state;
    const ids = Object.keys(INGREDIENTS).filter((id) => s.have(id) > 0);
    const short = new Set();
    for (const [id, qty] of Object.entries(s.menu)) {
      const r = RECIPE_BY_ID[id];
      if (!r || qty <= 0) continue;
      for (const ing of Object.keys(r.ing)) if (s.have(ing) <= 0) short.add(ing);
    }
    return [
      h('div.pagehead', null, 'The Larder'),
      h('div.note', null, 'Machines in the works fill these shelves for nothing. ',
        h('b', null, 'Harbor Market'), ' in the inventory sells the rest.'),
      ids.length
        ? h('div.grid-ing', null, ids.map((id) => this.#cell(
          this.assets.url('ingredients', id), ingName(id), `×${s.have(id)}`)))
        : h('div.empty', null, 'Bare shelves. Build a machine in the works, or buy from the market.'),
      short.size
        ? h('div.note', null, 'Out of ', h('b', null, [...short].map(ingName).join(', ')),
          ' — the dishes that need it cannot be plated.')
        : null,
    ].filter(Boolean);
  }

  #marketTab() {
    const s = this.state;
    const rows = MARKET_ORDER.map((id) => {
      const price = s.catchPrice(id);
      const full = INGREDIENTS[id].price;
      const deal = price < full;
      const buy = (n) => {
        const total = price * n;
        if (!s.spend(total)) { this.game.toast('Not enough sand dollars', 'bad'); return; }
        s.addIng(id, n);
        s.save();
        this.game.sfx.play('coin');
        this.game.hud.sync();
        this.refresh();
      };
      return this.#card({
        src: this.assets.url('ingredients', id),
        title: ingName(id),
        sub: deal ? `In today's catch — normally ${money(full)}` : `You have ${s.have(id)}`,
        tags: [this.#cost(price), deal ? tag('Catch of the day', 'tag-ok') : null].filter(Boolean),
        side: h('div.rowline', null,
          this.#goBtn('×1', { disabled: s.coins < price, onclick: () => buy(1) }),
          this.#goBtn('×10', { disabled: s.coins < price * 10, onclick: () => buy(10) })),
        cls: deal ? 'sel' : '',
      });
    });
    return [
      this.#catchStrip(),
      h('div.note', null, 'Fresh off the boats. Whatever came in heavy this morning goes cheap — the rest is the price it always is.'),
      ...rows,
    ];
  }

  /* ------------------------------------------------------- the day's catch  */

  /**
   * A card that maps a recipe or an ingredient onto one of the pack's twenty
   * illustrated menu cards. Hand-drawn cards beat a photo of the dish for the
   * same reason a real menu is set rather than photographed: it reads as the
   * restaurant's own hand.
   */
  cardFor(key) {
    const CARDS = {
      kelp_ramen: 'card_ramen', kelp_latte: 'card_stein', scallop_tart: 'card_platter',
      kelp_fries: 'card_stars', reef_soda: 'card_reef', starfish_cookie: 'card_stars',
      taiyaki: 'card_cake', miso_chowder: 'card_hotpot', pearl_boba: 'card_stein',
      anchor_pretzel: 'card_cake', shrimp_toast: 'card_shrimp', oyster_plate: 'card_oyster',
      mermaid_pop: 'card_cake', octopus_skewer: 'card_squid', tide_sundae: 'card_cake',
      clam_congee: 'card_hotpot', cinnamon_swirls: 'card_cake', coral_platter: 'card_reef',
      crab_burger: 'card_crab', puffer_burger: 'card_grilled_fish',
      scallop_bowl: 'card_platter', sea_roll: 'card_sashimi',
      lobster_roll: 'card_royal', treasure_bento: 'card_feast',
      shrimp: 'card_shrimp', crab: 'card_crab', squid: 'card_squid',
      oyster: 'card_oyster', clam: 'card_oyster', scallop: 'card_platter',
      octopus_leg: 'card_squid', tuna: 'card_sashimi', salmon: 'card_sashimi',
      lobster_tail: 'card_royal', nori: 'card_reef', kelp: 'card_reef',
      sea_grapes: 'card_reef',
    };
    return this.assets.url('cards', CARDS[key] ?? 'card_cloche');
  }

  /** One line about today's catch, for the top of the menu and the market. */
  #catchStrip() {
    const s = this.state;
    const c = s.catch;
    if (!c) return null;
    const dish = c.star ? RECIPE_BY_ID[c.star] : null;
    return h('div.card.catchcard', null,
      h('div.thumb.wide', null, h('i', {
        style: { backgroundImage: `url("${this.cardFor(c.star ?? 'kelp')}")` },
      })),
      h('div.card-main', null,
        h('div.card-title', null, "Today's catch"),
        h('div.card-sub', null, dish
          ? [ 'The harbour is asking for ', h('b', null, dish.name), ' — it pays a third over the odds.' ]
          : 'Cheap crates on the quay this morning.'),
        h('div.rowline', null, (c.cheap ?? []).map((id) =>
          ingChip(this.assets.url('ingredients', id), '40% off')))));
  }

  /**
   * The morning card. Shown once a day when the doors have not opened yet, and
   * it is the reason to look at the market before the menu: what is cheap and
   * what sells high both change overnight.
   */
  openCatch() {
    const s = this.state;
    const c = s.catch ?? s.rollCatch();
    c.seen = true;
    const dish = c.star ? RECIPE_BY_ID[c.star] : null;
    this.reopen = null;

    // the card and what the harbour wants on the left page, the cheap crates on
    // the right — the two halves of a morning, one to a page
    const leaves = [
      h('div.poster', null,
        h('img', { src: this.cardFor(c.star ?? 'kelp'), alt: '' })),
      h('div.blurb', null,
        h('b', null, dish ? `They want ${dish.name}` : 'Quiet on the quay'),
        h('span', null, dish
          ? 'Every one you serve today pays 30% over the odds.'
          : 'Nothing special asked for this morning.')),
      h('div.blurb', null,
        h('b', null, 'Prices hold until closing'),
        h('span', null, 'Buy the cheap crates from the market while they last.')),
    ];
    const crates = (c.cheap ?? []).map((id) => h('div.crate', null,
      h('i', { style: { backgroundImage: `url("${this.assets.url('ingredients', id)}")` } }),
      h('span.crate-n', null, ingName(id)),
      h('b.crate-p', null, money(s.catchPrice(id))),
      h('span.crate-was', null, `was ${money(INGREDIENTS[id].price)}`)));

    const book = this.#paginate('menu', leaves, 'catch', crates);
    this.hud.openSheet({
      key: 'catch',
      title: `Day ${s.day} — off the boats`,
      book: 'menu',
      body: book.el,
      foot: h('div.rowline', null,
        book.prev,
        h('span.card-sub.grow.mid', null, "Today's catch"),
        book.next,
        this.#goBtn('To the kitchen', {
          cls: 'pill-go',
          onclick: () => { this.recipeTab = 'menu'; this.openRecipes(); },
        })),
    });
    this.state.save();
  }

  /* ------------------------------------------------------------------ crew  */

  openCrew(keep = false) {
    this.reopen = () => this.openCrew(true);
    const s = this.state;
    const rows = STAFF.map((st) => {
      const hired = s.hasStaff(st.id);
      return this.#card({
        src: this.assets.url('staff', st.sprite),
        frames: this.assets.frameCount('staff', st.sprite),
        title: st.label,
        sub: st.blurb,
        tags: hired ? [tag('On the crew', 'tag-ok')] : [this.#cost(st.cost)],
        side: hired ? null : this.#goBtn('Hire', {
          disabled: s.coins < st.cost,
          onclick: () => {
            if (!s.spend(st.cost)) return;
            s.hire(st.id);
            s.save();
            this.game.celebrate(`${st.label} joined the crew!`);
            this.refresh();
          },
        }),
        cls: hired ? 'sel' : '',
      });
    });
    const spec = {
      key: 'crew',
      title: 'Crew',
      body: [
        h('div.note', null, 'Hires are permanent and do the fiddly jobs for you — seating guests, running plates, keeping the works humming.'),
        ...rows,
      ],
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* ------------------------------------------------------------- inspectors */

  openFurniture(rec, keep = false) {
    this.reopen = () => this.openFurniture(rec, true);
    const item = rec.item;
    if (!item) return;
    const cur = STYLE_BY_ID[rec.style];
    const seat = this.game.restaurant.seats.find((x) => x.f === rec);

    const styleCards = STYLES.map((st) => {
      const diff = Math.max(0, Math.round(item.cost * (st.costMul - cur.costMul)));
      const isCur = st.id === rec.style;
      const downgrade = st.costMul < cur.costMul;
      return this.#card({
        src: this.assets.url(item.set === 'fixt' ? st.fixt : st.furn, spriteIdOf(item)),
        title: st.label,
        sub: `${starsOf(item, st.id)}★ ambience${item.kind === 'table' ? ` · tips ×${st.tip.toFixed(2)}` : ''}`,
        tags: isCur ? [tag('Fitted', 'tag-ok')] : downgrade ? [tag('Already fancier', 'tag-need')] : [this.#cost(diff)],
        side: isCur || downgrade ? null : this.#goBtn('Fit', {
          disabled: this.state.coins < diff,
          onclick: () => {
            if (this.game.restaurant.restyle(rec, st.id)) {
              this.game.celebrate(`${item.label} → ${st.label}`);
              this.openFurniture(rec, true);
            }
          },
        }),
        cls: isCur ? 'sel' : '',
      });
    });

    const spec = {
      key: `furn:${rec.uid}`,
      title: item.label,
      body: [
        h('div.note', null,
          item.blurb, ' ',
          seat && !seat.table ? h('b', null, 'This chair is not beside a table, so nobody can sit here.') : null,
        ),
        h('div.section', null, 'Finish'),
        ...styleCards,
      ],
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `Worth ${money(Math.round(costOf(item, rec.style) * 0.6))} back`),
        this.#goBtn('Sell', {
          cls: 'pill-quiet',
          onclick: () => {
            const got = this.game.restaurant.sell(rec);
            if (got === -1) { this.game.toast('Someone is sitting there!', 'bad'); return; }
            this.hud.closeSheet();
            this.game.toast(`Sold for ${money(got)}`);
          },
        })),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  openMachine(m, keep = false) {
    this.reopen = () => this.openMachine(m, true);
    const f = this.game.factory;

    if (m.kind === 'belt' || m.kind === 'silo') {
      const isBelt = m.kind === 'belt';
      const spec = {
        key: `mach:${m.uid}`,
        title: isBelt ? BELT.label : SILO.label,
        body: [
          h('div.note', null, isBelt
            ? ['Carrying ', h('b', null, `${m.items.length} item${m.items.length === 1 ? '' : 's'}`), ` toward ${DIR_NAMES[m.dir]}.`]
            : 'Everything dropped here goes straight into the pantry.'),
          isBelt ? this.#card({
            src: null, title: 'Turn belt', sub: `Now pointing ${DIR_NAMES[m.dir]}`,
            side: this.#goBtn('Rotate', { onclick: () => { m.dir = (m.dir + 1) % 4; this.state.save(); this.openMachine(m, true); } }),
          }) : null,
        ].filter(Boolean),
        foot: h('div.rowline', null,
          h('span.card-sub.grow', null, 'Take it back for half price'),
          this.#goBtn('Remove', { cls: 'pill-quiet', onclick: () => { f.erase(m.c, m.r); this.hud.closeSheet(); } })),
      };
      keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
      return;
    }

    const def = m.def;
    if (!def) return;
    const maxed = m.level >= MACHINE_MAX_LEVEL;
    const cost = maxed ? 0 : machineUpgradeCost(def, m.level);
    const now = machineInterval(def, m.level, this.state.factorySpeed);
    const next = machineInterval(def, m.level + 1, this.state.factorySpeed);

    const spec = {
      key: `mach:${m.uid}`,
      title: `${def.label} · Lv${m.level}`,
      body: [
        h('div.note', null,
          def.kind === 'processor'
            ? [`Turns ${def.inQty}× `, h('b', null, ingName(def.inId)), ' into 1 ', h('b', null, ingName(def.out)), `. Holding ${m.buf}.`]
            : ['Makes 1 ', h('b', null, ingName(def.out)), ` every ${now.toFixed(2)}s.`],
          m.blocked ? h('b', null, ' Output is backed up — give it somewhere to go.') : null),
        h('div.card', null,
          thumb(this.assets.url('ingredients', def.out)),
          h('div.card-main', null,
            h('div.card-title', null, `${(60 / now).toFixed(1)} ${ingName(def.out)} / min`),
            bar(m.level / MACHINE_MAX_LEVEL),
            h('div.card-sub', null, `Level ${m.level} of ${MACHINE_MAX_LEVEL}`))),
        this.#card({
          src: null,
          title: 'Output direction',
          sub: `Currently ${DIR_NAMES[m.dir]} — it needs a belt or the intake on that tile.`,
          side: this.#goBtn('Rotate', {
            onclick: () => { m.dir = (m.dir + 1) % 4; this.state.save(); this.openMachine(m, true); },
          }),
        }),
        maxed ? null : this.#card({
          src: null,
          title: 'Tune it up',
          sub: `${now.toFixed(2)}s → ${next.toFixed(2)}s per item`,
          tags: [this.#cost(cost)],
          side: this.#goBtn('Upgrade', {
            disabled: this.state.coins < cost,
            onclick: () => { if (f.upgrade(m)) { this.game.celebrate(`${def.label} → Lv${m.level}`); this.openMachine(m, true); } },
          }),
        }),
      ].filter(Boolean),
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `Take it back for ${money(Math.round(def.cost * 0.5))}`),
        this.#goBtn('Remove', { cls: 'pill-quiet', onclick: () => { f.erase(m.c, m.r); this.hud.closeSheet(); } })),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* ------------------------------------------------------------------- hub  */

  openHub() {
    this.reopen = () => this.openHub();
    const s = this.state;
    const row = (title, sub, onclick, icon = null) => this.#card({ title, sub, onclick, icon });
    const spec = {
      key: 'hub',
      title: 'Harbor Menu',
      body: [
        h('div.card', null,
          thumb(this.assets.url('customers', '05_sea_otter'),
            { frames: this.assets.frameCount('customers', '05_sea_otter') }),
          h('div.card-main', null,
            h('div.card-title', null, `Day ${s.day} · ${'★'.repeat(s.rating)}`),
            h('div.card-sub', null, `${money(s.stars)} reputation · ${s.stats.served} guests served · ${money(s.stats.earned)} earned all told`))),
        row('The Kitchen', 'Plate up, learn dishes, upgrade them, check the larder',
          () => this.openRecipes(), 'book'),
        row('Inventory', 'Everything you own, and the market', () => this.openPantry(), 'crate'),
        row("Today's Catch", 'What is cheap and what sells high', () => this.openCatch(), 'sand'),
        row('Crew', 'Hire staff to run the place for you', () => this.openCrew(), 'star'),
        row('Build', 'Furniture and machines', () => this.game.openBuild(), 'hammer'),
        h('div.section', null, 'The long game'),
        row('Guest Diary', `${s.diaryFound}/${GUESTS.length} met · ${s.diaryHearts} hearts collected`,
          () => this.openDiary(), 'diary'),
        row('Expand the Room', `Now ${s.roomSize}×${s.roomSize} — knock through for more floor`,
          () => this.openShop(), 'shop'),
        row('Research Board', `${s.research} points to spend`, () => this.openResearch(), 'lab'),
        row('Pottery Class', s.hasKiln
          ? (s.potteryLv >= FORGE_LEVEL
            ? `Level ${s.potteryLv} · the kiln is lit`
            : `Level ${s.potteryLv} · forging opens at ${FORGE_LEVEL}`)
          : 'Build a Harbour Kiln in the works first',
        () => this.openPottery(), 'kiln'),
        h('div.section', null, 'Help'),
        row('How to Play', 'The short version', () => this.game.openHelp(), 'help'),
        h('div.section', null, 'Danger zone'),
        this.#card({
          title: 'Start over',
          sub: 'Wipes the save and reopens on day one.',
          side: this.#goBtn('Reset', {
            cls: 'pill-stop',
            onclick: () => {
              if (this.resetArmed) { this.game.hardReset(); return; }
              this.resetArmed = true;
              this.game.toast('Tap Reset again to confirm', 'bad');
              setTimeout(() => { this.resetArmed = false; }, 4000);
            },
          }),
        }),
      ],
    };
    this.hud.openSheet(spec);
  }

  /* ---------------------------------------------------------------- diary  */

  /**
   * The diary, laid out the way the drawing is: an index of four names down the
   * left page, and the page of whoever you picked on the right — one big box for
   * them, three small ones for what they love, what they cannot stand, and what
   * they have left you. On a narrow screen the two pages take turns.
   *
   * Everything on it is still earned: the name and portrait appear once they have
   * walked in, and a taste only resolves from "?" once you have served them
   * something they loved or couldn't stand.
   */
  openDiary(keep = false) {
    this.reopen = () => this.openDiary(true);
    const s = this.state;
    const wide = this.#wideBook();
    const per = 4;
    const pages = Math.max(1, Math.ceil(GUESTS.length / per));
    this.diaryPage = Math.max(0, Math.min(this.diaryPage ?? 0, pages - 1));
    // open on somebody you actually know — a page reading "not met yet" is a
    // poor first impression of a diary you have been filling in
    this.diaryPick ??= (Object.entries(s.diary)
      .sort((a, b) => (b[1].hearts ?? 0) - (a[1].hearts ?? 0))[0]?.[0] ?? GUESTS[0].id);
    this.diaryView ??= 'index';

    const from = this.diaryPage * per;
    const index = GUESTS.slice(from, from + per).map((g) => {
      const page = s.diary[g.id];
      const lv = page?.level ?? 0;
      const el = h(`div.entry${page ? '' : '.unmet'}${g.id === this.diaryPick ? '.pick' : ''}`, {
        onclick: () => {
          this.diaryPick = g.id;
          this.diaryView = 'entry';
          this.game.sfx.play('tap');
          if (!wide) this.hud.turnPage(1);
          this.openDiary(true);
        },
      },
      h('div.entry-face', null, page
        ? this.#sprite('customers', g.id)
        : h('span.qq', null, '?')),
      h('div.entry-main', null,
        h('div.entry-name', null, page ? g.name : '???'),
        h('div.entry-sub', null, page
          ? `${page.served} served`
          : 'not seen yet')),
      h('div.entry-hearts', null, '♥'.repeat(lv) + '·'.repeat(MAX_FRIEND - lv)));
      return el;
    });

    const g = GUEST_BY_ID[this.diaryPick] ?? GUESTS[0];
    const page = s.diary[g.id];
    const lv = page?.level ?? 0;
    const toNext = page ? heartsToNext(page.hearts) : null;
    // The whole drawing, not a thumbnail of it: a diary page is where you get to
    // look at somebody properly, and the pack draws each guest three times —
    // standing, walking, eating — so the page walks through all three.
    const face = h('div.plate-face', null, page
      ? this.#sprite('customers', g.id, { pose: true })
      : h('span.qq', null, '?'));

    const big = h(`div.plate${page ? '' : '.unmet'}`, null,
      face,
      h('div.plate-name', null, page ? g.name : 'Not met yet'),
      h('div.plate-hearts', null, '♥'.repeat(lv) + '·'.repeat(MAX_FRIEND - lv)),
      h('div.plate-sub', null, page
        ? (toNext === null
          ? 'Best friends — nothing left to earn.'
          : `${page.hearts} hearts · ${toNext} more to the next`)
        : 'Serve them once and their page fills itself in.'));

    const note = (label, value, cls) => h(`div.chip-box${cls ? `.${cls}` : ''}`, null,
      h('span.chip-l', null, label), h('b.chip-v', null, value));

    const small = [
      note('loves', page?.likeSeen ? TASTES[g.loves].label : '?', page?.likeSeen ? 'ok' : ''),
      note('hates', page?.hateSeen ? TASTES[g.loathes].label : '?', page?.hateSeen ? 'bad' : ''),
      note('gifts', String(page?.gifts ?? 0), (page?.gifts ?? 0) > 0 ? 'ok' : ''),
    ];

    // the drawing's own order: four index boxes, the big one, then the three
    const slots = wide
      ? [...index, big, ...small]
      : (this.diaryView === 'entry' ? [big, ...small] : index);

    const turn = (d) => {
      const next = Math.max(0, Math.min(pages - 1, this.diaryPage + d));
      if (next === this.diaryPage) return;
      this.diaryPage = next;
      this.hud.turnPage(d);
      this.game.sfx.play('tap');
      this.openDiary(true);
    };

    const spec = {
      key: 'diary',
      title: 'Guest Diary',
      book: 'diary',
      bookLayout: wide ? 'spread' : (this.diaryView === 'entry' ? 'right' : 'left'),
      body: this.#spread('diary', slots, wide ? 'spread'
        : (this.diaryView === 'entry' ? 'right' : 'left')),
      foot: h('div.rowline', null,
        !wide && this.diaryView === 'entry'
          ? this.#goBtn('‹ Index', {
            cls: 'pill-quiet',
            onclick: () => { this.diaryView = 'index'; this.hud.turnPage(-1); this.openDiary(true); },
          })
          : this.#goBtn('‹', { cls: 'pill-quiet', disabled: this.diaryPage === 0, onclick: () => turn(-1) }),
        h('span.card-sub.grow.mid', null,
          `${s.diaryFound} of ${GUESTS.length} met · ${s.diaryHearts} ♥`),
        this.#goBtn('›', {
          cls: 'pill-quiet',
          disabled: this.diaryPage >= pages - 1,
          onclick: () => turn(1),
        })),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* ----------------------------------------------------------------- shop  */

  /** Kept as a way in from the More menu — it lands on Build's Expand tab. */
  openShop() {
    this.buildTab = 'expand';
    if (this.game.zone !== this.game.restaurant) this.game.setZone('restaurant');
    this.openBuild();
  }

  /* ------------------------------------------------------------- research  */

  openResearch() {
    this.reopen = () => this.openResearch();
    const s = this.state;
    const body = [
      h('div.note', null, 'A ', h('b', null, 'Harbour Computer'),
        ' on the factory floor turns quiet hours into points. Spend them here.'),
    ];
    const nodeIcon = { flyer: 'flyer', works: 'hammer', trade: 'sand' };
    for (const grp of RESEARCH_GROUPS) {
      body.push(h('div.section', null, grp.label));
      for (const node of RESEARCH.filter((n) => n.group === grp.id)) {
        const done = s.hasResearch(node.id);
        const locked = node.needs && !s.hasResearch(node.needs);
        body.push(this.#card({
          icon: nodeIcon[grp.id] ?? 'lab',
          title: node.label,
          sub: locked ? `Follows ${RESEARCH_BY_ID[node.needs].label}.` : node.blurb,
          tags: [done ? tag('Done', 'tag-ok')
            : tag(`${node.cost} rp`, s.research >= node.cost ? 'tag-cost' : 'tag-need')],
          locked: done || locked,
          onclick: done || locked ? null : () => {
            if (!s.buyResearch(node.id)) { this.game.toast('Not enough research', 'bad'); return; }
            this.game.toast(`Researched ${node.label}`, 'good');
            this.openResearch();
          },
        }));
      }
    }
    this.hud.openSheet({
      key: 'research',
      title: 'Research Board',
      body,
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, 'Points banked'),
        tag(`${s.research} rp`, 'tag-mint')),
    });
  }

  /* -------------------------------------------------------------- pottery  */

  /**
   * The kiln. You get here by tapping the kiln you built in the works, not from
   * a menu — the class happens somewhere. Below level five it is a progress
   * page; at five it becomes the only way to permanently improve one recipe.
   */
  openPottery() {
    this.reopen = () => this.openPottery();
    const s = this.state;

    // no kiln, no class. Say where to get one rather than showing a dead panel.
    if (!s.hasKiln) {
      this.hud.openSheet({
        key: 'pottery',
        title: 'Pottery Class',
        body: [
          this.#card({
            src: this.assets.url('machines', 'bisque_kiln'),
            title: 'You have no kiln',
            sub: 'The class works out of a Harbour Kiln on the factory floor. Build one'
              + ' in the works, under Pottery, then tap it to throw a dish.',
            tags: [this.#cost(900)],
          }),
          h('div.note', null, 'A forged dish gives one recipe a permanent star and a',
            ' permanent price rise, served on real crockery from then on.'),
        ],
        foot: h('div.rowline', null,
          h('span.card-sub.grow', null, 'The works are the other room.'),
          this.#goBtn('To the works', {
            cls: 'pill-go',
            onclick: () => {
              this.game.setZone('factory');
              this.factoryTab = 'pottery';
              this.game.openBuild();
            },
          })),
      });
      return;
    }

    const lv = s.potteryLv;
    const next = potteryNext(s.pottery);
    const open = lv >= FORGE_LEVEL;

    const body = [
      h('div.card', null,
        h('div.thumb', null, h('div', {
          style: { font: '900 1.5rem var(--font)', color: 'var(--ink)' },
        }, String(lv))),
        h('div.card-main', null,
          h('div.card-title', null, `Pottery Class · level ${lv}`),
          h('div.card-sub', null, next === null
            ? 'You have learned everything the class can teach.'
            : `${next - s.pottery} more guests served to reach level ${lv + 1}.`),
          bar(next === null ? 1 : s.pottery / next)),
        h('div.card-side', null, tag(`${s.clay} clay`, 'tag-mint'))),
    ];

    if (!open) {
      body.push(h('div.note', null, 'Every guest you serve is a little more practice. At ',
        h('b', null, `level ${FORGE_LEVEL}`),
        ' the kiln opens and you can forge serving dishes, which raise a recipe\'s stars and price for good.'));
    } else {
      body.push(h('div.note', null, 'Pick a dish to forge a new serving plate for. It costs sand dollars and clay, then you take a turn at the wheel — ',
        h('b', null, 'stop the needle in the band'), '.',
        s.hasWheel ? ' Your wheel takes a round off.' : ' A Potter\'s Wheel in the works would take a round off.'));
      for (const r of RECIPES.filter((x) => s.isUnlocked(x.id))) {
        const tier = s.dishTier(r.id);
        const maxed = tier >= MAX_DISH;
        const cost = forgeCost(tier);
        const canPay = s.coins >= cost.coins && s.clay >= cost.clay;
        const plate = plateFor(r.id, Math.min(MAX_DISH, tier + 1));
        body.push(this.#card({
          src: this.assets.url('plates', plate) || this.assets.url('food', r.id),
          title: `${r.name}${tier ? `  ${'✦'.repeat(tier)}` : ''}`,
          sub: maxed
            ? 'The finest plate in the harbour.'
            : `Tier ${tier} → ${tier + 1}: +1★ and +14% price.`,
          tags: maxed ? [tag('MAX', 'tag-star')] : [
            this.#cost(cost.coins),
            tag(`${cost.clay} clay`, s.clay >= cost.clay ? 'tag-ok' : 'tag-need'),
          ],
          locked: maxed,
          onclick: maxed ? null : () => {
            if (!canPay) { this.game.toast('Not enough for that yet', 'bad'); return; }
            this.#forge(r, tier, cost);
          },
        }));
      }
    }

    this.hud.openSheet({
      key: 'pottery',
      title: 'Pottery Class',
      body,
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, s.hasGlaze
          ? 'The glaze kiln is adding 15% to every forged dish.'
          : 'A Glaze Kiln in the works would add 15% to forged dishes.'),
        tag(`${s.clay} clay`, 'tag-mint')),
    });
  }

  /**
   * The wheel. A needle sweeps the bar and you stop it inside the band; get it
   * three times (two with a proper wheel bought) and the dish comes out. Miss
   * and the clay is still spent — that is the tension, and it is why the wheel
   * upgrade is worth buying.
   */
  #forge(recipe, tier, cost) {
    const s = this.state;
    const rounds = s.hasWheel ? 2 : 3;
    let round = 0;
    let hits = 0;
    let raf = 0;

    const needle = h('i.forge-needle');
    const band = h('i.forge-band');
    const track = h('div.forge-track', null, band, needle);
    const label = h('div.card-sub', null, `Round 1 of ${rounds}`);
    const go = h('button.pill.pill-go', { type: 'button' }, 'Stop!');

    // narrower band and a quicker sweep each round
    const setup = () => {
      const width = 30 - round * 7;
      const left = 8 + Math.random() * (84 - width);
      band.style.left = `${left}%`;
      band.style.width = `${width}%`;
      label.textContent = `Round ${round + 1} of ${rounds}`;
      return { left, width, speed: 0.55 + round * 0.28 };
    };

    let cfg = setup();
    let t = 0;
    let last = performance.now();
    const tick = (now) => {
      t += ((now - last) / 1000) * cfg.speed;
      last = now;
      const pos = (1 - Math.cos(t * Math.PI * 2)) / 2;   // ease at both ends
      needle.style.left = `${pos * 100}%`;
      needle.dataset.pos = String(pos * 100);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const finish = (won) => {
      cancelAnimationFrame(raf);
      if (!won) {
        this.game.toast('The pot cracked in the kiln', 'bad');
        this.game.sfx.play('no');
        this.openPottery();
        return;
      }
      s.setDishTier(recipe.id, tier + 1);
      this.game.toast(`${recipe.name} now serves on a tier ${tier + 1} dish`, 'good');
      this.game.titleCard('Out of the kiln!', `${recipe.name} +1★`);
      this.game.sfx.play('star');
      this.openPottery();
    };

    go.onclick = () => {
      const pos = Number(needle.dataset.pos ?? 0);
      const hit = pos >= cfg.left && pos <= cfg.left + cfg.width;
      if (hit) hits += 1;
      this.game.sfx.play(hit ? 'ding' : 'no');
      round += 1;
      if (!hit || round >= rounds) { finish(hit && hits === rounds); return; }
      cfg = setup();
      t = 0;
    };

    // charge up front: a cracked pot still used the clay
    s.spend(cost.coins);
    s.clay -= cost.clay;

    this.hud.openSheet({
      key: 'forge',
      title: `At the Wheel · ${recipe.name}`,
      body: [
        h('div.note', null, 'Stop the needle inside the band. Every round the band narrows and the needle speeds up.'),
        h('div.card', null,
          thumb(this.assets.url('food', recipe.id)),
          h('div.card-main', null, h('div.card-title', null, recipe.name), label, track)),
      ],
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `${cost.coins} sand dollars and ${cost.clay} clay spent`),
        go),
    });
  }

  openHelp() {
    this.reopen = () => this.openHelp();
    const step = (n, title, text) => h('div.card', null,
      h('div.thumb', null, h('div', { style: { font: '900 1.4rem var(--font)', color: 'var(--ink)' } }, String(n))),
      h('div.card-main', null, h('div.card-title', null, title), h('div.card-sub', null, text)));
    this.hud.openSheet({
      key: 'help',
      title: 'How to Play',
      body: [
        h('div.note', null, 'Everything costs ', h('b', null, 'sand dollars'), ' — furniture, machines, recipes and crew alike.'),
        step(1, 'Read the morning', "Each day opens with the catch: three things cheap on the quay and one dish the harbour has a taste for, which pays a third over the odds."),
        step(2, 'Plate up the menu', 'Open the Kitchen — the book icon on the right — and set how many of each dish to make. Ingredients come out of the larder right away.'),
        step(3, 'Print a flyer', "Nobody comes to a place they have not heard of. Tap the flyer at the bottom left until a poster goes up — ten taps to start with, fewer once you research it, and none at all once a Promo Stand does it for you. Posters bring people in on their own while you work."),
        step(4, 'Open up', 'Guests wander in and wait by the door. Tap one to seat them at a free chair.'),
        step(5, 'Work the board', "Once the doors are open the flyer becomes the board out front: another ten taps calls somebody in there and then. There is no limit on the queue — the only thing that ends a day is running out of food, which is why what is left on the menu is on screen while you serve."),
        step(6, 'Take the order', 'Tap the ! sticker on the bubble over a seated guest to send the ticket to the chef.'),
        step(7, 'Run the plate', 'Drag the finished dish off the kitchen pass onto the guest who ordered it.'),
        step(8, 'Get paid', 'The faster you serve, the more they leave. Slow service loses stars. A table they leave needs washing before the next guest can sit down.'),
        step(9, 'Build the works', 'Once the till is healthy, head to the Factory: place a machine, drag a belt from it, and end the belt at a Pantry Intake. Ingredients then fill the larder for free. The Workshop tab has a computer that banks research points and a stand that posts your flyers; the Pottery tab has the kiln.'),
        h('div.section', null, 'Getting to know them'),
        h('div.note', null, 'Every guest has a flavour they ', h('b', null, 'love'),
          ' and one they cannot stand. Serving the right one is worth triple hearts and a better tip, and it fills in their page in the ',
          h('b', null, 'Guest Diary'), '. Fill the hearts and they start bringing you presents.'),
        h('div.note', null, 'Watch for a gold crown or a violet star over someone\'s head: a ',
          h('b', null, 'VIP'), ' pays double and a ', h('b', null, 'Mythical'),
          ' guest four times over. A busier harbour draws more of them.'),
        h('div.note', null, 'Serving also earns ', h('b', null, 'pottery'),
          ' experience. Build a ', h('b', null, 'Harbour Kiln'),
          ' in the works and tap it to take a turn at the class; from level five a',
          ' forged serving dish raises one recipe\'s stars and price for good.'),
        h('div.note', null, 'Fancier tables and more decor raise ', h('b', null, 'ambience'), ', which brings guests in quicker and makes them tip better. Hire crew to automate seating, serving and the works.'),
      ],
    });
  }

  /* ---------------------------------------------------------------- report  */

  openReport(reason) {
    this.reopen = null;
    const r = this.game.restaurant;
    const s = this.state;
    const line = (label, value, big = false) => h(`div.report-row${big ? '.big' : ''}`, null,
      h('span', null, label), h('b', null, value));
    const netStars = r.starsToday - r.walkouts * 2;
    const signed = `${netStars > 0 ? '+' : ''}${netStars}★`;

    this.hud.openSheet({
      key: 'report',
      title: `Day ${s.day} — ${reason === 'soldout' ? 'Sold Out!' : 'Closing Time'}`,
      body: [
        h('div.card', null,
          thumb(this.assets.url('staff', '10_orca_harbor_manager'),
            { frames: this.assets.frameCount('staff', '10_orca_harbor_manager') }),
          h('div.card-main', null,
            h('div.card-title', null, r.served > 0 ? 'Good shift.' : 'Quiet one.'),
            h('div.card-sub', null, reason === 'soldout'
              ? 'Every plate went out the door.'
              : 'The doors are shut for the night.'))),
        line('Guests served', String(r.served)),
        line('Walked out', String(r.walkouts)),
        line('Reputation', signed),
        line('Leftover plates', String(s.stockCount)),
        line('Taken', money(r.earned), true),
      ],
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `Sand dollars: ${money(s.coins)}`),
        this.#goBtn('Next Day', { cls: 'pill-go', onclick: () => this.game.beginNextDay() })),
    });
  }
}
