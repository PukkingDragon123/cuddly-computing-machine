// The main menu.
//
// It is not a picture of a restaurant and it is not your restaurant either. The
// game runs behind the menu on a set — a dressed room nobody has to have built
// yet, with the chef at the pass and guests eating at the tables — so the first
// thing you see is the place at its best rather than whatever state you left it
// in. Everything it touches is snapshotted first and put back when you press
// the button, so the demo cannot cost you a coin.

import { $, h, show } from './dom.js';

/** The set. Antique finish, laid for a full house. */
const SHOWROOM = [
  ['pass_counter', 1, 1, 'antique'],
  ['host_desk', 1, 4, 'antique'],
  ['round_table', 3, 3, 'antique'], ['chair', 2, 3, 'antique'], ['chair', 4, 3, 'antique'],
  ['round_table', 6, 5, 'antique'], ['armchair', 5, 5, 'antique'], ['armchair', 7, 5, 'antique'],
  ['game_table', 3, 6, 'cottage'], ['chair', 3, 5, 'cottage'], ['chair', 3, 7, 'cottage'],
  ['rug', 5, 3, 'cottage'],
  ['lamp', 5, 2, 'antique'],
  ['cabinet', 6, 1, 'antique'],
  ['shelf', 1, 6, 'antique'],
  ['ornament_mat', 7, 2, 'antique'],
];

const SET_DISHES = ['kelp_ramen', 'scallop_tart', 'kelp_latte'];

export class Title {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('#title'),
      play: $('#title-play'),
      load: $('#title-load'),
    };
    this.open = false;
    this.#wire();
  }

  #wire() {
    const g = this.game;
    this.el.play.onclick = () => this.start();
    // the save on disk, rather than whatever this session has done to it
    this.el.load.onclick = () => {
      if (this.el.load.disabled) return;
      this.snap = null;
      g.reloadSave();
    };

    // the room is the toy now that the sign has gone: press it and it sparkles
    this.el.root.onclick = (e) => {
      if (e.target.closest('.title-card')) return;
      g.sfx.play('pop');
      const cam = g.zone.cam;
      g.zone.fx.sparkles(cam.x, cam.y - 40, 10, 90);
      g.zone.fx.hearts(cam.x, cam.y - 20, 3);
    };
  }

  /** Show the menu and put the set up. */
  show() {
    const g = this.game;
    const s = g.state;
    this.open = true;
    g.attract = true;
    g.setZone('restaurant');
    this.#dress();

    this.el.load.disabled = !g.hasSaveOnDisk();
    show(this.el.root, true);
    this.el.root.classList.remove('out');
    document.getElementById('hud').classList.add('titling');
  }

  /**
   * Put the set up.
   *
   * The whole save is copied first. Everything after this — the furniture, the
   * dishes on the pass, the guests who arrive and pay — happens to the copy's
   * original and is thrown away when the menu closes.
   */
  #dress() {
    const g = this.game;
    const s = g.state;
    this.saved = s.snapshot();
    s.bought = [];
    s.furniture = SHOWROOM.map(([id, c, r, style]) => ({ id, c, r, style, rot: 0 }));
    s.unlocked = [...new Set([...s.unlocked, ...SET_DISHES])];
    s.phase = 'open';
    s.stock = {};
    for (const id of SET_DISHES) s.stock[id] = 9;
    s.pantry = { ...s.pantry, kelp: 99, egg: 99, milk: 99, flour: 99, butter: 99, scallop: 99, potato: 99, clam: 99 };
    g.restaurant.rebuild();
    g.restaurant.guests.length = 0;
    g.restaurant.kitchen.reset?.();

    // The plate stands on the right, so the room is framed left of centre and
    // pulled in close enough that you are looking at a table rather than a plan.
    const b = g.zone.bounds();
    g.zone.cam.frame(b, 20);
    g.zone.cam.zoomTo(g.zone.cam.zoom * 1.5, g.view.w / 2, g.view.h / 2);
    g.zone.cam.snapTo(g.zone.cam.x + b.w * 0.06, g.zone.cam.y + b.h * 0.06);
    this.home = { x: g.zone.cam.x, y: g.zone.cam.y, zoom: g.zone.cam.zoom };
    this.shot = 0;
    this.shotT = 0;
    this.spawnT = 1.4;
  }

  /** Take the set down and give the save back. */
  #strike() {
    const g = this.game;
    if (this.snap === null || !this.saved) return;
    g.state.restore(this.saved);
    this.saved = null;
    g.restaurant.rebuild();
    g.restaurant.guests.length = 0;
    g.restaurant.kitchen.reset?.();
    const b = g.zone.bounds();
    g.zone.cam.frame(b, 30);
  }

  /**
   * Hand the controls over. `quiet` skips what normally follows — the guide on a
   * first run, the morning's catch on a returning one — for when something other
   * than a player is pressing the button.
   */
  start(quiet = false) {
    if (!this.open) return;
    this.open = false;
    this.#strike();
    this.game.attract = false;
    this.game.sfx.unlock();
    this.game.sfx.play('open');
    this.el.root.classList.add('out');
    document.getElementById('hud').classList.remove('titling');
    setTimeout(() => show(this.el.root, false), 320);
    // a session nobody is watching gets no cutscenes either
    if (quiet) this.game.story?.hush();
    else this.game.onTitleDone();
  }

  /** Called from Settings, so you can go back and look at the place. */
  reopen() {
    this.game.hud.closeSheet();
    this.game.cancelPlacement();
    this.show();
  }

  /**
   * Run the set.
   *
   * Nothing here is faked: guests really arrive, are really seated, really order
   * and really eat, because the demo that looks best is the game. All this does
   * is play the part of somebody very good at it.
   */
  update(dt, t) {
    if (!this.open) return;
    const g = this.game;
    const r = g.restaurant;
    const s = g.state;

    // the till never empties and nobody ever loses patience on a set
    for (const id of SET_DISHES) if ((s.stock[id] ?? 0) < 3) s.stock[id] = 9;
    for (const guest of r.guests) guest.patience = 1;

    this.spawnT -= dt;
    if (this.spawnT <= 0 && r.guests.length < 5) {
      this.spawnT = 2.6;
      r.summonGuest(false);
    }
    for (const guest of r.guests) {
      if (guest.state === 'queue') r.seatGuest(guest);
      else if (guest.state === 'order') r.sendOrder(guest);
    }
    for (const plate of [...(r.kitchen.plates ?? [])]) {
      const guest = r.guests.find((x) => x.state === 'wait' && x.dish === plate.recipeId);
      if (guest) r.deliver(plate, guest);
    }

    if (!s.motionOn) return;
    // Three held shots that cut on a slow count, rather than one endless drift.
    // A title screen should look composed, and a camera that never settles never
    // looks composed.
    const b = g.zone.bounds();
    const shots = [
      { x: this.home.x, y: this.home.y, z: this.home.zoom },
      { x: this.home.x + b.w * 0.14, y: this.home.y + b.h * 0.06, z: this.home.zoom * 1.16 },
      { x: this.home.x - b.w * 0.1, y: this.home.y - b.h * 0.04, z: this.home.zoom * 1.06 },
    ];
    this.shotT += dt;
    if (this.shotT > 9) { this.shotT = 0; this.shot = (this.shot + 1) % shots.length; }
    const k = shots[this.shot];
    // a touch of drift inside the shot, so it breathes without wandering
    g.zone.cam.glideTo(k.x + Math.cos(t * 0.11) * b.w * 0.02,
      k.y + Math.sin(t * 0.09) * b.h * 0.015, 0.9);
    g.zone.cam.zoom += (k.z - g.zone.cam.zoom) * Math.min(1, dt * 0.7);

    this.bubbleT = (this.bubbleT ?? 0) + dt;
    if (this.bubbleT > 0.8) {
      this.bubbleT = 0;
      g.zone.fx.bubbles(b.x + Math.random() * b.w, b.y + b.h * 0.72, 1, 40);
    }
  }
}

/** Rows for the settings sheet — one switch each, all of them doing something. */
export function settingRows(game) {
  const s = game.state;
  const row = (key, label, blurb, onChange) => {
    const on = key === 'sound' ? game.sfx.enabled : s.settings?.[key] !== false;
    const knob = h(`button.switch${on ? '.on' : ''}`, {
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      onclick: (e) => {
        const now = !e.currentTarget.classList.contains('on');
        e.currentTarget.classList.toggle('on', now);
        e.currentTarget.setAttribute('aria-checked', String(now));
        onChange(now);
        game.sfx.play(now ? 'select' : 'tap');
      },
    }, h('i'));
    return h('div.card', null,
      h('div.card-main', null,
        h('div.card-title', null, label),
        h('div.card-sub', null, blurb)),
      h('div.card-side', null, knob));
  };

  return [
    row('sound', 'Sound', 'Taps, tills and the chef.', (on) => {
      game.sfx.enabled = on;
      s.setSetting('sound', on);
      game.hud.sync();
    }),
    row('motion', 'Motion', 'Shake, bubbles and the small animations.',
      (on) => {
        s.setSetting('motion', on);
        document.body.classList.toggle('still', !on);
      }),
    row('tips', 'Tips', 'The one-line nudges.',
      (on) => s.setSetting('tips', on)),
  ];
}
