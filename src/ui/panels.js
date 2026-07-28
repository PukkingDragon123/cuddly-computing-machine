// Every bottom-sheet panel. Each opener builds a spec for Hud.openSheet and
// registers itself so state changes can re-render in place.

import { bar, h, ingChip, stepper, tag, thumb } from './dom.js';
import { money } from '../core/util.js';
import { INGREDIENTS, MARKET_ORDER, ingName } from '../data/ingredients.js';
import {
  MAX_LEVEL, RECIPES, priceAt, prepAt, starsAt, upgradeCost,
} from '../data/recipes.js';
import {
  BELT, FURNITURE, MACHINES, MACHINE_MAX_LEVEL, SILO, STAFF, STYLES, STYLE_BY_ID,
  costOf, machineInterval, machineUpgradeCost, starsOf,
} from '../data/catalog.js';
import { DIR_NAMES } from '../world/factory.js';

export class Panels {
  constructor(game) {
    this.game = game;
    this.hud = game.hud;
    this.state = game.state;
    this.assets = game.assets;
    this.buildStyle = 'standard';
    this.buildTab = 'seating';
    this.factoryTab = 'belt';
    this.recipeTab = 'menu';
    this.pantryTab = 'pantry';
    this.reopen = null;   // re-runs the open panel after state changes
  }

  /** Re-render whatever panel is showing. */
  refresh() { if (this.hud.isSheetOpen) this.reopen?.(true); }

  /* --------------------------------------------------------------- helpers */

  #card({ src, title, sub, tags = [], side = null, onclick = null, cls = '', locked = false, wide = false }) {
    const t = thumb(src, { wide });
    return h(`div.card${onclick ? '.tap' : ''}${cls ? `.${cls}` : ''}${locked ? '.locked' : ''}`,
      onclick ? { onclick } : null,
      t,
      h('div.card-main', null,
        h('div.card-title', null, title),
        sub ? h('div.card-sub', null, sub) : null,
        tags.length ? h('div.rowline', null, tags) : null),
      side ? h('div.card-side', null, side) : null);
  }

  #cost(n) {
    const ok = this.state.coins >= n;
    return tag(money(n), ok ? 'tag-cost' : 'tag-need');
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
    return h('div.rowline', null, STYLES.map((s) => h(
      `button.tab${this.buildStyle === s.id ? '.on' : ''}`,
      { type: 'button', onclick: () => { this.buildStyle = s.id; this.openBuild(true); } },
      `${s.label}${s.star ? ` +${s.star}★` : ''}`,
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
    const style = STYLE_BY_ID[this.buildStyle];

    const body = [
      h('div.note', null,
        'Pick a finish, then tap a piece and tap the floor. ',
        h('b', null, 'Chairs must sit next to a table'), ' to become seats.'),
      this.#styleRow(),
      ...items.map((item) => {
        const cost = costOf(item, this.buildStyle);
        const stars = starsOf(item, this.buildStyle);
        return this.#card({
          src: this.assets.url(style.group, item.id),
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

  #openFactoryBuild(keep) {
    const tabs = [
      { id: 'belt', label: 'Belts' },
      { id: 'producer', label: 'Machines' },
      { id: 'processor', label: 'Refiners' },
      { id: 'store', label: 'Storage' },
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
    } else if (this.factoryTab === 'store') {
      body = [
        h('div.note', null, 'Anything a belt drops into the intake lands in your ', h('b', null, 'pantry'), ' and can be cooked with.'),
        this.#card({
          src: this.assets.url('furniture', SILO.sprite),
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

  openRecipes(keep = false) {
    this.reopen = () => this.openRecipes(true);
    const tabs = [
      { id: 'menu', label: "Today's Menu" },
      { id: 'upgrade', label: 'Upgrade' },
      { id: 'learn', label: 'Learn' },
    ];
    const body = this.recipeTab === 'menu' ? this.#menuTab()
      : this.recipeTab === 'upgrade' ? this.#upgradeTab()
        : this.#learnTab();

    this.menuTotalEl = h('span.card-sub.grow');
    this.menuOpenBtn = this.#goBtn('Open Up!', {
      cls: 'pill-go',
      onclick: () => { this.hud.closeSheet(); this.game.toggleService(); },
    });
    this.#syncMenuFoot();

    const spec = {
      key: 'recipes',
      title: 'Menu Book',
      tabs,
      tab: this.recipeTab,
      onTab: (id) => { this.recipeTab = id; this.openRecipes(true); },
      body,
      foot: h('div.rowline', null, this.menuTotalEl, this.menuOpenBtn),
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  /**
   * Today's menu. Rows update themselves rather than re-rendering the sheet, so
   * holding "+" doesn't yank the button out from under your finger.
   */
  #menuTab() {
    const s = this.state;
    const open = s.phase === 'open';
    const unlocked = RECIPES.filter((r) => s.isUnlocked(r.id));
    const rows = [];

    const syncAll = () => {
      for (const row of rows) row.sync();
      this.#syncMenuFoot();
      this.game.hud.sync();
    };

    const cards = unlocked.map((r) => {
      const level = s.levelOf(r.id);
      const chips = new Map();
      for (const [id, q] of Object.entries(r.ing)) {
        chips.set(id, { el: ingChip(this.assets.url('ingredients', id), `${q}`, s.have(id) < q), need: q });
      }

      const step = stepper(s.menu[r.id] ?? 0, {
        min: 0,
        max: (s.menu[r.id] ?? 0) + s.servingsPossible(r.id),
        onChange: (v, d) => {
          if (d > 0) {
            if (!s.payIng(r.ing)) { this.game.toast('Pantry is short', 'bad'); syncAll(); return; }
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

      const leftTag = tag(`${s.stock[r.id] ?? 0} left`, 'tag-mint');
      const card = this.#card({
        src: this.assets.url('food', r.id),
        title: `${r.name}${level > 1 ? ` · Lv${level}` : ''}`,
        sub: `${prepAt(r, level)}s to cook · ${starsAt(r, level)}★`,
        tags: [tag(money(priceAt(r, level)), 'tag-cost'), ...[...chips.values()].map((c) => c.el)],
        side: open ? leftTag : step.el,
        cls: (s.menu[r.id] ?? 0) > 0 ? 'sel' : '',
      });

      rows.push({
        sync: () => {
          const qty = s.menu[r.id] ?? 0;
          step.sync(qty, qty + s.servingsPossible(r.id));
          card.classList.toggle('sel', qty > 0);
          for (const [id, c] of chips) c.el.classList.toggle('short', s.have(id) < c.need);
          if (open) leftTag.textContent = `${s.stock[r.id] ?? 0} left`;
        },
      });
      return card;
    });

    this.menuRows = rows;
    return [
      h('div.note', null,
        open
          ? 'Service is on. Stock ticks down as guests order.'
          : ['Set how many of each dish to plate up. Ingredients come out of your pantry now, so ', h('b', null, 'plate what you can sell'), '.'],
      ),
      ...cards,
      unlocked.length === 0 ? h('div.empty', null, 'No recipes yet.') : null,
    ].filter(Boolean);
  }

  /** Refresh the menu sheet footer totals without rebuilding the list. */
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

  openPantry(keep = false) {
    this.reopen = () => this.openPantry(true);
    const body = this.pantryTab === 'pantry' ? this.#pantryTab() : this.#marketTab();
    const spec = {
      key: 'pantry',
      title: 'Pantry',
      tabs: [{ id: 'pantry', label: 'In Store' }, { id: 'market', label: 'Harbor Market' }],
      tab: this.pantryTab,
      onTab: (id) => { this.pantryTab = id; this.openPantry(true); },
      body,
    };
    keep ? this.hud.refreshSheet(spec) : this.hud.openSheet(spec);
  }

  #pantryTab() {
    const s = this.state;
    const ids = Object.keys(INGREDIENTS).filter((id) => s.have(id) > 0);
    const grid = h('div.grid-ing', null, ids.map((id) => h('div.ing-cell', null,
      h('i', { style: { backgroundImage: `url("${this.assets.url('ingredients', id)}")` } }),
      h('div.n', null, ingName(id)),
      h('div.q', null, `×${s.have(id)}`))));
    return [
      h('div.note', null, 'Factory machines fill this up for free. The ', h('b', null, 'Harbor Market'), ' tab sells the pricey sea catch.'),
      ids.length ? grid : h('div.empty', null, 'Empty. Build a machine in the works, or buy from the market.'),
    ];
  }

  #marketTab() {
    const s = this.state;
    const rows = MARKET_ORDER.map((id) => {
      const price = INGREDIENTS[id].price;
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
        sub: `You have ${s.have(id)}`,
        tags: [this.#cost(price)],
        side: h('div.rowline', null,
          this.#goBtn('×1', { disabled: s.coins < price, onclick: () => buy(1) }),
          this.#goBtn('×10', { disabled: s.coins < price * 10, onclick: () => buy(10) })),
      });
    });
    return [h('div.note', null, 'Fresh off the boats. Prices are fixed — the trick is turning them into dishes worth more.'), ...rows];
  }

  /* ------------------------------------------------------------------ crew  */

  openCrew(keep = false) {
    this.reopen = () => this.openCrew(true);
    const s = this.state;
    const rows = STAFF.map((st) => {
      const hired = s.hasStaff(st.id);
      return this.#card({
        src: this.assets.url('staff', st.sprite),
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
        src: this.assets.url(st.group, item.id),
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
    const row = (title, sub, onclick, src = null) => this.#card({ src, title, sub, onclick });
    const spec = {
      key: 'hub',
      title: 'Harbor Menu',
      body: [
        h('div.card', null,
          thumb(this.assets.url('customers', '05_sea_otter')),
          h('div.card-main', null,
            h('div.card-title', null, `Day ${s.day} · ${'★'.repeat(s.rating)}`),
            h('div.card-sub', null, `${money(s.stars)} reputation · ${s.stats.served} guests served · ${money(s.stats.earned)} earned all told`))),
        row('Menu Book', 'Plate up, upgrade dishes, learn new ones', () => this.openRecipes()),
        row('Pantry & Market', 'See your stock and buy the sea catch', () => this.openPantry()),
        row('Crew', 'Hire staff to run the place for you', () => this.openCrew()),
        row('Build', 'Furniture and machines', () => this.game.openBuild()),
        row('How to Play', 'The short version', () => this.game.openHelp()),
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
        step(1, 'Build the works', 'In the Factory, place a machine, drag a belt from it, and end the belt at a Pantry Intake. Ingredients fill your pantry on their own.'),
        step(2, 'Plate up the menu', 'In the Menu Book, set how many of each dish to make. Ingredients come out of the pantry right away.'),
        step(3, 'Open up', 'Guests wander in. Tap a waiting guest to seat them at a free chair.'),
        step(4, 'Take the order', 'Tap the ! bubble over a seated guest to send the ticket to the chef.'),
        step(5, 'Run the plate', 'Drag the finished dish off the kitchen pass onto the guest who ordered it.'),
        step(6, 'Get paid', 'The faster you serve, the more they leave. Slow service loses stars.'),
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
          thumb(this.assets.url('staff', '10_orca_harbor_manager')),
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
