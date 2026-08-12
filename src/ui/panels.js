// Every bottom-sheet panel. Each opener builds a spec for Hud.openSheet and
// registers itself so state changes can re-render in place.

import { bar, h, ingChip, stepper, swatch, tag, thumb } from './dom.js';
import { money } from '../core/util.js';
import { INGREDIENTS, MARKET_ORDER, MARKET_SHELVES, ingName } from '../data/ingredients.js';
import {
  MAX_LEVEL, RECIPES, RECIPE_BY_ID, priceAt, prepAt, starsAt, upgradeCost,
} from '../data/recipes.js';
import {
  BELT, CREW_ROOMS, FURNITURE, MACHINES, MACHINE_MAX_LEVEL, POTTERY, SILO, STAFF,
  STYLES, STYLE_BY_ID, WORKSHOP, costOf, groupFor, machineInterval,
  machineUpgradeCost, starsOf,
} from '../data/catalog.js';
import {
  GUESTS, GUEST_BY_ID, MAX_FRIEND, TASTES, heartsToNext, nameFor,
} from '../data/guests.js';
import {
  FORGE_LEVEL, MAX_DISH, RESEARCH, RESEARCH_BY_ID, RESEARCH_GROUPS, SHOP,
  SHOP_BY_ID, forgeCost, plateFor, potteryLevel, potteryNext,
} from '../data/progress.js';
import { DIR_NAMES } from '../world/factory.js';
import { settingRows } from './title.js';
import { RANKS } from '../data/fame.js';
import { CHAPTERS, QUESTS, SIDE_BY_ID } from '../data/quests.js';

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
    this.buildTab = 'room';
    this.factoryTab = 'belt';
    this.recipeTab = 'menu';
    this.pantryTab = 'pantry';
    this.questTab = 'line';
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

  /**
   * Wrap a card spec in its fame gate.
   *
   * A thing your rank has not reached is not a thing you cannot afford: it is
   * not on the shelf at all. So the price comes off, the rank goes on, and the
   * card stops being pressable — one rule, applied to every catalogue in the
   * game from one place.
   */
  #gated(item, spec) {
    if (this.state.open(item)) return this.#card(spec);
    return this.#card({
      ...spec,
      sub: spec.sub,
      tags: [tag(this.state.rankNeeded(item), 'tag-need')],
      side: null,
      onclick: null,
      locked: true,
    });
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
    return h('div.swatches', null, STYLES.map((st) => {
      const shut = !this.state.open(st);
      return swatch(
        st.label,
        STYLE_SWATCH[st.id] ?? '#d9ae76',
        this.buildStyle === st.id,
        shut
          ? () => this.game.toast(`${this.state.rankNeeded(st)} unlocks this finish`, 'bad')
          : () => { this.buildStyle = st.id; this.openBuild(true); },
        shut ? '🔒' : (st.star ? `+${st.star}★` : null),
      );
    }));
  }

  /**
   * The catalogue, laid out two across.
   *
   * One piece to a row left the page half empty and the drawings small, which
   * is the wrong way round for a shop window. Pairs are emitted as single rows
   * so the page can still be measured and broken between them.
   */
  #pieceRows(items) {
    const out = [];
    for (let i = 0; i < items.length; i += 2) {
      out.push(h('div.duo', null,
        this.#pieceCard(items[i]),
        items[i + 1] ? this.#pieceCard(items[i + 1]) : h('span.duo-gap')));
    }
    return out;
  }

  /**
   * One piece in the catalogue: the drawing, in the finish you picked, with
   * what it costs under it. The same chair in pine and in walnut are different
   * things to buy, so you see which one you are buying.
   */
  #pieceCard(item) {
    const cost = costOf(item, this.buildStyle);
    const stars = starsOf(item, this.buildStyle);
    const shut = !this.state.open(item);
    const owned = this.state.furniture.filter((f) => f.id === item.id).length;
    const perk = item.kind === 'seat' ? 'seats one'
      : item.kind === 'table' ? 'takes chairs'
        : item.patience || item.patienceRoom ? 'patience'
          : item.tip || item.tipRoom ? 'tips'
            : item.draw ? 'draws guests'
              : item.order ? 'faster orders' : null;
    return h(`div.card.piece${shut ? '.shut' : '.tap'}${!shut && this.state.coins < cost ? '.thin' : ''}`,
      shut ? null : { onclick: () => this.game.startPlacing(item.id, this.buildStyle) },
      h('div.stage', null, h('i', {
        style: { backgroundImage: `url("${this.assets.url(groupFor(item, this.buildStyle), spriteIdOf(item))}")` },
      }), owned ? h('span.owned', null, `×${owned}`) : null),
      h('div.piece-name', null, item.label),
      perk && !shut ? h('div.piece-perk', null, perk) : null,
      h('div.rowline.mid', null, shut
        ? tag(this.state.rankNeeded(item), 'tag-need')
        : [this.#cost(cost), stars > 0 ? tag(`${stars}★`, 'tag-star') : null].filter(Boolean)));
  }

  /* ------------------------------------------------------------------ fame  */

  /**
   * The ladder.
   *
   * Fame is the spine of the game — every rung puts something new on the shelf —
   * so it needs one page that shows the whole climb at once: where you are, what
   * that got you, and what the next one costs. Nothing here is buyable. It is a
   * map, and the point of a map is that you can see the end of it.
   */
  openFame(keep = false) {
    this.reopen = () => this.openFame(true);
    const s = this.state;
    const at = s.rank;
    const body = RANKS.map((r, i) => {
      const got = i <= at;
      const here = i === at;
      return h(`div.card.rung${got ? '.on' : ''}${here ? '.here' : ''}${got ? '' : '.thin'}`, null,
        h('div.rung-no', null, got ? '✓' : String(r.at)),
        h('div.card-main', null,
          h('div.card-title', null, r.name),
          h('div.card-sub', null, r.gives.join(' · '))),
        here && RANKS[i + 1]
          ? h('div.card-side', null, tag(`${money(s.rankUp)} to go`, 'tag-star'))
          : null);
    });
    const spec = {
      key: 'fame',
      title: 'Fame',
      body: [
        h('div.note', null, 'Feed people well and the harbour talks. Every rung opens something new.'),
        ...body,
      ],
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `${money(s.fame)} fame · ${s.rankName}`),
        tag(`${money(s.stats.served)} served`, 'tag-mint')),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /* ----------------------------------------------------------------- build  */

  openBuild(keep = false) {
    this.reopen = () => this.openBuild(true);
    if (this.game.zone === this.game.factory) return this.#openFactoryBuild(keep);

    // One catalogue, not three. Splitting it into Seating / Kitchen / Decor gave
    // the first tab four things in it and a page and a half of blank paper —
    // the whole room's worth fits in one list with headings down it.
    const shelves = [
      ['Tables and chairs', ['table', 'seat']],
      ['The kitchen', ['pass']],
      ['Decoration', ['decor']],
    ];

    const body = this.buildTab === 'expand' ? this.#expandTab()
      : this.buildTab === 'crew' ? this.#crewRows() : [
      this.#styleRow(),
      ...shelves.flatMap(([label, kinds]) => {
        const items = FURNITURE.filter((f) => kinds.includes(f.kind));
        return items.length ? [h('div.section', null, label), ...this.#pieceRows(items)] : [];
      }),
    ];

    const spec = {
      key: 'build',
      title: 'Build the Dining Room',
      tabs: [
        { id: 'room', label: 'Furnish' },
        { id: 'crew', label: 'Crew' },
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
      h('div.note', null, 'The room is ', h('b', null, `${s.roomSize}×${s.roomSize}`), '. Knocking through is the only way to fit more tables.'),
    ];
    for (const item of SHOP) {
      const owned = s.hasBought(item.id);
      const locked = item.needs && !s.hasBought(item.needs);
      body.push(this.#gated(item, {
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
        h('div.note', null, 'Tap ', h('b', null, 'Conveyor'), ', then drag across the floor.'),
        this.#gated(BELT, {
          icon: 'belt',
          title: BELT.label,
          sub: BELT.blurb,
          tags: [this.#cost(BELT.cost)],
          onclick: () => this.game.startFactoryPlacing('belt', 'belt'),
        }),
        this.#card({
          icon: 'erase',
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
          return this.#gated(m, {
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
        h('div.note', null, 'No belt needed. Drop them anywhere; they tick away on their own.'),
        ...WORKSHOP.map((m) => this.#gated(m, {
          src: this.assets.url('machines', m.sprite),
          title: m.label,
          sub: m.blurb,
          tags: [this.#cost(m.cost), tag(`every ${m.interval}s`, 'tag-mint')],
          onclick: () => this.game.startFactoryPlacing('machine', m.id),
        })),
      ];
    } else if (this.factoryTab === 'store') {
      body = [
        h('div.note', null, 'A belt into the intake fills your ', h('b', null, 'pantry'), '.'),
        this.#gated(SILO, {
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
          ? h('div.note', null, 'Cheap goods in, valuable ones out. Belt in, belt onward.')
          : h('div.note', null, 'One ingredient, over and over. Point it at a belt with ', h('b', null, 'Turn'), '.'),
        ...MACHINES.filter((m) => m.kind === kind).map((m) => this.#gated(m, {
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
    // The ruled boxes are always there, so an empty one is a gap in the menu
    // rather than a gap in the layout. The first spare says what fills it.
    while (wide && extra.length && page.length < half) {
      const first = page.length === leaves.length && book === 'menu';
      page.push(first
        ? h('div.line.empty-line.invite', { onclick: () => { this.recipeTab = 'learn'; this.openRecipes(true); } },
          h('span', null, 'An empty line on the menu. '), h('b', null, 'Learn a dish →'))
        : h('div.line.empty-line'));
    }
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

  /**
   * What there is left to learn.
   *
   * A recipe you cannot afford is a thing to save for; a recipe your fame has
   * not reached is a thing to *cook* for, and the two want to look different.
   * Locked-by-rank lines say the rank and nothing else — no price to stare at,
   * because the price is not the problem.
   */
  #learnLeaves() {
    const s = this.state;
    const shown = RECIPES.filter((r) => !s.isUnlocked(r.id))
      .sort((a2, b2) => (a2.rank ?? 0) - (b2.rank ?? 0));
    return shown.map((r) => {
      const shut = !s.open(r);
      return h(`div.line${shut ? '.shut' : ''}`, null,
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
            h('span.line-side', null, shut
              ? tag(s.rankNeeded(r), 'tag-need')
              : this.#goBtn(`Learn ${money(r.unlock)}`, {
                disabled: s.coins < r.unlock,
                onclick: () => {
                  if (!s.spend(r.unlock)) return;
                  s.unlock(r.id);
                  s.save();
                  this.game.celebrate(`Learned ${r.name}!`);
                  this.refresh();
                },
              })))));
    });
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
      h('div.note', null, 'Raise a dish: better price, faster cook, more stars.'),
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
      h('div.note', null, 'Fancier plates pull in fussier guests who pay more.'),
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

  /** One of the four figures across the top of the inventory. */
  #tally(icon, label, value, tone = '') {
    return h(`div.tally${tone ? `.${tone}` : ''}`, null,
      h(`i.ico.ico-${icon}`),
      h('div.tally-v', null, value),
      h('div.tally-l', null, label));
  }

  /**
   * Everything you own.
   *
   * It opens with the four numbers people actually come here for — money, fame,
   * clay, hearts — across the top as figures rather than buried in a grid of
   * jars, and then the shelves underneath. The larder is split the way the
   * market is, so "what have I got" and "what can I buy" read the same way
   * round.
   */
  #inventoryTab() {
    const s = this.state;
    const out = [
      h('div.tallies', null,
        this.#tally('sand', 'coins', money(s.coins)),
        this.#tally('star', 'fame', money(s.fame)),
        this.#tally('kiln', 'clay', String(s.clay), s.clay ? '' : 'zero'),
        this.#tally('heart', 'hearts', String(s.diaryHearts), s.diaryHearts ? '' : 'zero')),
    ];

    const plated = Object.entries(s.stock).filter(([, n]) => n > 0);
    if (plated.length) {
      out.push(h('div.section', null, 'Plated up',
        h('span.section-n', null, String(s.stockCount))));
      out.push(h('div.grid-ing', null, plated.map(([id, n]) => this.#cell(
        this.assets.url('food', id), RECIPE_BY_ID[id]?.name ?? id, `×${n}`))));
    }

    // the larder, shelf by shelf, in the market's own order
    let any = false;
    for (const shelf of MARKET_SHELVES) {
      const ids = shelf.ids.filter((id) => s.have(id) > 0);
      if (!ids.length) continue;
      any = true;
      out.push(h('div.section', null, shelf.label,
        h('span.section-n', null, String(ids.reduce((a2, id) => a2 + s.have(id), 0)))));
      out.push(h('div.grid-ing', null, ids.map((id) => this.#cell(
        this.assets.url('ingredients', id), ingName(id), `×${s.have(id)}`))));
    }
    if (!any) {
      out.push(h('div.section', null, 'The larder'));
      out.push(h('div.empty', null, 'Bare shelves. The market sells everything.'));
    }

    const forged = Object.entries(s.dishes).filter(([, t]) => t > 0);
    if (forged.length) {
      out.push(h('div.section', null, 'Forged crockery'));
      out.push(h('div.grid-ing', null, forged.map(([id, t]) => this.#cell(
        this.assets.url('plates', plateFor(id, t)) || this.assets.url('food', id),
        RECIPE_BY_ID[id]?.name ?? id, '✦'.repeat(t)))));
    }

    out.push(h('div.section', null, 'And the rest'));
    out.push(h('div.grid-ing', null, [
      this.#cell(null, 'Research', `${s.research} rp`, { icon: 'lab', zero: s.research === 0 }),
      this.#cell(null, 'Recipes', `${s.unlocked.length}/${RECIPES.length}`, { icon: 'book' }),
      this.#cell(null, 'Crew', String(s.staff.length), { icon: 'crew', zero: s.staff.length === 0 }),
      this.#cell(null, 'Machines', String(s.machines.length), { icon: 'tools', zero: s.machines.length === 0 }),
    ]));
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

  /**
   * The stall. It restocks on the hour and its prices move with it, so a crate
   * has a number of them and an arrow saying which way the price went — buying
   * cheap and buying early are both worth doing now, where a fixed list made
   * this a vending machine.
   */
  /**
   * The stall.
   *
   * It sells everything now, laid out in three shelves: what came off the boats
   * this morning, then the grown goods, then the refined ones at the back where
   * the markup lives. A kitchen that cannot buy a pint of milk on day one is a
   * kitchen that cannot open — and a machine you build is still worth building,
   * because over the counter the same milk costs three times what it is worth.
   */
  #marketTab() {
    const s = this.state;
    const row = (id) => {
      const price = s.catchPrice(id);
      const left = s.marketStock(id);
      const drift = s.priceDrift(id);
      const deal = s.catch?.cheap?.includes(id);
      const out = left <= 0;
      const buy = (n) => {
        const got = s.buyFromMarket(id, n);
        if (!got) {
          this.game.toast(left <= 0 ? 'Sold out until the next delivery' : 'Not enough sand dollars', 'bad');
          return;
        }
        this.game.sfx.play('coin');
        this.game.hud.sync();
        this.refresh();
      };
      const pct = Math.round(Math.abs(drift) * 100);
      const arrow = deal ? tag(`catch −40%`, 'tag-ok')
        : drift > 0.04 ? tag(`▲ ${pct}%`, 'tag-need')
          : drift < -0.04 ? tag(`▼ ${pct}%`, 'tag-ok')
            : tag('steady', 'tag-mint');
      return this.#card({
        src: this.assets.url('ingredients', id),
        title: ingName(id),
        sub: out
          ? 'Sold out — more on the next delivery.'
          : `${left} crate${left === 1 ? '' : 's'} on the stall · you have ${s.have(id)}`,
        tags: [this.#cost(price), arrow],
        side: h('div.rowline', null,
          this.#goBtn('×1', { disabled: out || s.coins < price, onclick: () => buy(1) }),
          this.#goBtn('×5', { disabled: out || s.coins < price, onclick: () => buy(5) })),
        cls: deal ? 'sel' : '',
        locked: out,
      });
    };
    const mins = s.marketIn;
    return [
      this.#catchStrip(),
      h('div.note', null, 'New boats land ',
        h('b', null, mins <= 1 ? 'any minute now' : `in ${mins} minutes`),
        ' — with new prices.'),
      ...MARKET_SHELVES.flatMap((shelf) => [
        h('div.section', null, shelf.label),
        ...shelf.ids.map(row),
      ]),
    ].filter(Boolean);
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
    // a card can be asked for by name as well as by what it illustrates
    const id = key?.startsWith('card_') ? key : CARDS[key];
    return this.assets.url('cards', id ?? 'card_cloche');
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

  /**
   * The rota. Hiring is building, so it is a tab of the build menu — and it is
   * read the way a rota is: by where somebody works, not as one long list of
   * strangers. A room you have nobody in still gets its heading, because the
   * gap in the rota is the thing worth seeing.
   */
  #crewRows() {
    const s = this.state;
    const hired = STAFF.filter((st) => s.hasStaff(st.id)).length;
    const out = [
      h('div.note', null, 'Permanent, and takes a job off you for good. ',
        h('b', null, `${hired} of ${STAFF.length}`), ' on the books.'),
    ];
    for (const room of CREW_ROOMS) {
      const crew = STAFF.filter((st) => (st.crew ?? 'floor') === room.id);
      if (!crew.length) continue;
      const on = crew.filter((st) => s.hasStaff(st.id)).length;
      out.push(h('div.section', null, room.label,
        h('span.section-n', null, `${on}/${crew.length}`)));
      out.push(...crew.map((st) => this.#hireCard(st)));
    }
    return out;
  }

  /**
   * One name on the rota.
   *
   * The portrait is the point — every hire is a drawn character, so they get a
   * standing frame rather than the little square well a crate of carrots gets,
   * and once they are on the crew the card is stamped and the button goes.
   */
  #hireCard(st) {
    const s = this.state;
    const hired = s.hasStaff(st.id);
    const shut = !s.open(st);
    const poor = s.coins < st.cost;
    return h(`div.card.hire${hired ? '.on' : ''}${!hired && (poor || shut) ? '.thin' : ''}${shut ? '.shut' : ''}`, null,
      h('div.port', null, this.#sprite('staff', st.sprite)),
      h('div.card-main', null,
        h('div.card-title', null, st.label),
        h('div.card-sub', null, st.blurb),
        hired
          ? h('div.rowline', null, tag('On the crew', 'tag-ok'))
          : shut
            ? h('div.rowline', null, tag(s.rankNeeded(st), 'tag-need'))
            : h('div.rowline', null, this.#cost(st.cost), this.#goBtn('Hire', {
            disabled: poor,
            onclick: () => {
              if (!s.spend(st.cost)) return;
              s.hire(st.id);
              s.save();
              this.game.celebrate(`${st.label} joined the crew!`);
              this.refresh();
            },
          }))),
      hired ? h('span.stamp', null, '✓') : null);
  }

  openCrew(keep = false) {
    this.reopen = () => this.openCrew(true);
    const spec = {
      key: 'crew',
      title: 'Crew',
      body: this.#crewRows(),
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
            icon: 'turn', title: 'Turn belt', sub: `Now pointing ${DIR_NAMES[m.dir]}`,
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
          icon: 'turn',
          title: 'Output direction',
          sub: `Currently ${DIR_NAMES[m.dir]} — it needs a belt or the intake on that tile.`,
          side: this.#goBtn('Rotate', {
            onclick: () => { m.dir = (m.dir + 1) % 4; this.state.save(); this.openMachine(m, true); },
          }),
        }),
        maxed ? null : this.#card({
          icon: 'tools',
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

  /**
   * There is no Harbour Menu any more.
   *
   * It was a list of links to panels that all have somewhere better to be: the
   * crew are a tab of the build menu because hiring is building, the research
   * board opens off the computer that banks the points the way the class opens
   * off the kiln, and the diary, the kitchen and the inventory are already keys
   * on the rail. What was left — settings, credits, the guide, the way back to
   * the menu — is one panel, and this is it.
   */
  openHub() { this.openSettings(); }

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
        h('div.entry-name', null, page ? `${nameFor(g.id)} · ${g.name}` : '???'),
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
      h('div.plate-name', null, page ? `${nameFor(g.id)} the ${g.name}` : 'Not met yet'),
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
      h('div.note', null, 'The ', h('b', null, 'Harbour Computer'),
        ' banks a point every quiet minute. Tap it on the factory floor any time',
        ' to open this board.'),
    ];
    if (!s.hasWorks('lab')) {
      body.push(this.#card({
        src: this.assets.url('machines', 'computer_desk'),
        title: 'You have no computer',
        sub: 'Build a Harbour Computer in the works, under Workshop, and it starts'
          + ' banking points on its own.',
        tags: [this.#cost(1200)],
      }));
    }
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

  /* ------------------------------------------------------ settings, credits */

  openSettings() {
    this.reopen = () => this.openSettings();
    const s = this.state;
    this.hud.openSheet({
      key: 'settings',
      title: 'Settings',
      body: [
        h('div.note', null, 'Everything here is remembered with your save.'),
        ...settingRows(this.game),
        h('div.section', null, 'The house'),
        this.#card({
          icon: 'crew',
          title: 'Credits',
          sub: 'Made by Pukking Dragon.',
          side: this.#goBtn('Open', { onclick: () => this.openCredits() }),
        }),
        s.phase === 'prep'
          ? this.#card({
            icon: 'shop',
            title: 'Main menu',
            sub: 'Back out and look at the place.',
            side: this.#goBtn('Go', { cls: 'pill-quiet', onclick: () => this.game.openTitle() }),
          })
          : this.#card({
            icon: 'shop',
            title: 'Main menu',
            sub: s.phase === 'open' ? 'Close up first — service is running.' : 'Finish the day first.',
            locked: true,
          }),
        h('div.section', null, 'The guide'),
        this.#card({
          icon: 'help',
          title: 'Run the guide again',
          sub: 'The first shift, step by step.',
          side: this.#goBtn('Start', { onclick: () => this.game.openGuide() }),
        }),
        h('div.section', null, 'Danger zone'),
        this.#card({
          icon: 'refresh',
          title: 'Start over',
          sub: `Day ${s.day}. Wiping is permanent.`,
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
    });
  }

  openCredits() {
    this.reopen = () => this.openCredits();
    const s = this.state;
    const line = (label, value) => h('div.report-row', null,
      h('span', null, label), h('b', null, value));
    this.hud.openSheet({
      key: 'credits',
      title: 'Credits',
      body: [
        h('div.card.catchcard', null,
          h('div.thumb.wide', null, h('i', {
            style: { backgroundImage: `url("${this.cardFor('card_whale')}")` },
          })),
          h('div.card-main', null,
            h('div.card-title', null, 'Bubbleworks Harbor'),
            h('div.card-sub', null, 'A cosy harbour restaurant, built one sprite at a time.'))),
        h('div.section', null, 'Made by'),
        this.#card({
          icon: 'star',
          title: 'Pukking Dragon',
          sub: 'Design, direction, and every drawing in the harbour.',
        }),
        h('div.section', null, 'The art'),
        h('div.note', null, 'Four sprite packs: the character pack, the furniture and',
          ' joinery, the rare cast with the plates and machines, and the pottery works',
          ' with the books you are reading this in. Rooms are generated so the tiles always line up.'),
        h('div.section', null, 'Your harbour so far'),
        line('Days open', String(s.day)),
        line('Guests served', String(s.stats.served)),
        line('Taken', money(s.stats.earned)),
        line('Species met', `${s.diaryFound} of ${GUESTS.length}`),
        line('Hearts', String(s.diaryHearts)),
        h('div.note', null, 'Thank you for minding the place.'),
      ],
    });
  }

  /**
   * The job book.
   *
   * Every job in the game, chapter by chapter, ticked off as you go. The one on
   * the HUD is only ever the next one — this is where you see how far along the
   * whole thing you are, and it doubles as the manual: a job list that names
   * every system beats a page of instructions nobody reads.
   */
  openQuests(keep = false) {
    this.reopen = () => this.openQuests(true);
    const body = this.questTab === 'side' ? this.#sideJobs()
      : this.questTab === 'favour' ? this.#favours()
        : this.#questLine();
    const s = this.state;
    const at = s.story?.at ?? 0;
    const spec = {
      key: 'quests',
      title: 'Jobs',
      tabs: [
        { id: 'line', label: 'The line' },
        { id: 'side', label: 'Side jobs' },
        { id: 'favour', label: `Favours${(this.state.favours ?? []).length ? ` (${this.state.favours.length})` : ''}` },
      ],
      tab: this.questTab ?? 'line',
      onTab: (id) => { this.questTab = id; this.openQuests(true); },
      body,
      foot: h('div.rowline', null,
        h('span.card-sub.grow', null, `${at} of ${QUESTS.length} done`),
        tag(s.rankName, 'tag-mint')),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /**
   * A job's picture.
   *
   * Reused from the game rather than drawn for the list: the job about chairs
   * shows a chair, the one about the whale shark shows the whale shark. A quest
   * log full of generic ticks tells you nothing at a glance.
   */
  jobArt(art) {
    if (!art) return h('div.job-art');
    if (art.ico) return h('div.job-art', null, h(`i.ico.ico-${art.ico}`));
    const url = this.assets.url(art.g, art.id);
    const sp = this.assets.get(art.g, art.id);
    const n = sp?.count ?? 1;
    return h('div.job-art', null, h('i', {
      style: {
        backgroundImage: `url("${url}")`,
        backgroundSize: n > 1 ? `${n * 100}% 100%` : 'contain',
        backgroundPosition: n > 1 ? 'left center' : 'center',
      },
    }));
  }

  /**
   * The line itself.
   *
   * Drawn as a chain rather than a list: a rail runs down the left with a bead
   * on it for every job, filled in behind you and hollow ahead. A list tells
   * you what is left; a line tells you where you are on it.
   */
  #questLine() {
    const s = this.state;
    const at = s.story?.at ?? 0;
    const out = [];
    let n = 0;
    for (const chapter of CHAPTERS) {
      const from = n;
      const done = chapter.jobs.filter((_, i) => from + i < at).length;
      const shut = from > at;
      out.push(h('div.section', null, chapter.name,
        h('span.section-n', null, `${done}/${chapter.jobs.length}`)));
      for (const job of chapter.jobs) {
        const i = n; n += 1;
        const got = i < at;
        const live = i === at;
        const prog = live ? this.game.story.progress(job) : null;
        const last = i === n - 1 && job === chapter.jobs[chapter.jobs.length - 1];
        out.push(h(`div.node${got ? '.on' : ''}${live ? '.live' : ''}${shut ? '.far' : ''}`, null,
          h('div.node-rail', null,
            h('span.node-bead', null, got ? '✓' : live ? '' : ''),
            last ? null : h('span.node-line')),
          h(`div.card.job${got ? '.on' : ''}${live ? '.live' : ''}${!got && !live ? '.thin' : ''}`, null,
            this.jobArt(job.art),
            h('div.card-main', null,
              h('div.card-title', null, job.title),
              live && job.hint ? h('div.card-sub', null, job.hint) : null,
              live ? h('div.jobbar', null, h('i', {
                style: { width: `${Math.round(prog.pct * 100)}%` },
              })) : null),
            h('div.card-side', null,
              live && job.need > 1 ? h('span.card-sub', null, `${prog.have}/${job.need}`) : null,
              got ? tag('done', 'tag-ok')
                : h('span.rowline', null,
                  tag(`${money(job.coins)}`, 'tag-cost', 'sand'),
                  job.fame ? tag(`${job.fame}★`, 'tag-star') : null)))));
      }
    }
    return out;
  }

  /**
   * What the room is asking for.
   *
   * These are the only jobs you do not go and find: one guest in twenty walks
   * in wanting one particular dish, and while they are sitting there their name
   * and their order are on this page. They leave when the guest does — which is
   * the tension, and why the card says who is waiting.
   */
  #favours() {
    const s = this.state;
    const rows = (s.favours ?? []).map((f) => this.#card({
      src: this.assets.url('customers', f.species),
      frames: this.assets.frameCount('customers', f.species),
      title: `${f.who} would like…`,
      sub: RECIPE_BY_ID[f.dish]?.name ?? f.dish,
      tags: [tag(money(f.coins), 'tag-cost', 'sand'), tag(`${f.fame}★`, 'tag-star'), tag('+3 ♥', 'tag-ok')],
      cls: 'favour',
    }));
    return [
      h('div.note', null, 'One guest in twenty asks for something. Cook it and they remember you.'),
      ...(rows.length ? rows : [h('div.empty', null, 'Nobody is asking for anything just now.')]),
      h('div.section', null, 'Kept'),
      this.#card({ icon: 'heart', title: 'Favours kept', sub: 'All time.',
        tags: [tag(String(s.stats.favours ?? 0), 'tag-mint')] }),
    ];
  }

  /** The side board: three standing jobs, replaced as they are finished. */
  #sideJobs() {
    const s = this.state;
    s.fillSide(this.game);
    const rows = (s.side?.jobs ?? []).map((job) => {
      const def = SIDE_BY_ID[job.id];
      if (!def) return null;
      let have = 0;
      try { have = Math.max(0, Math.min(def.need, (def.count(this.game) | 0) - job.from)); } catch { have = 0; }
      return h('div.card.job.live', null,
        this.jobArt(def.art ?? { ico: 'star' }),
        h('div.card-main', null,
          h('div.card-title', null, def.title),
          h('div.jobbar', null, h('i', { style: { width: `${Math.round((have / def.need) * 100)}%` } }))),
        h('div.card-side', null,
          h('span.card-sub', null, `${money(have)}/${money(def.need)}`),
          h('span.rowline', null,
            tag(`${money(def.coins)}`, 'tag-cost', 'sand'),
            tag(`${def.fame}★`, 'tag-star'))));
    }).filter(Boolean);
    return [
      h('div.note', null, 'Three at a time. Finish one and another comes up.'),
      ...rows,
    ];
  }

  /* ---------------------------------------------------------------- report  */

  openReport(reason) {
    this.reopen = null;
    const r = this.game.restaurant;
    const s = this.state;
    // the day's take, banked as the best-ever if it beats it
    s.stats.best = Math.max(s.stats.best ?? 0, r.earned);
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
