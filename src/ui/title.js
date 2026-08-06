// The main menu, and the two panels that hang off it.
//
// It is not a picture of a restaurant: the game is already running behind it,
// with the camera drifting slowly across your own dining room and the chef at
// the pass. So the first thing the game shows you is the place you have been
// building, and pressing Open the doors simply hands you the controls.

import { $, h, show } from './dom.js';
import { money } from '../core/util.js';

export class Title {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('#title'),
      logo: $('#title-logo'),
      stat: $('#title-stat'),
      play: $('#title-play'),
    };
    this.open = false;
    this.#wire();
  }

  #wire() {
    const g = this.game;
    this.el.play.onclick = () => this.start();
    $('#title-guide').onclick = () => { this.start(); g.tutor.begin(true); };
    $('#title-settings').onclick = () => g.panels.openSettings();
    $('#title-credits').onclick = () => g.panels.openCredits();

    // the logo is a toy: press it and it squashes and blows bubbles
    this.el.logo.onclick = () => {
      this.el.logo.classList.remove('bump');
      void this.el.logo.offsetWidth;
      this.el.logo.classList.add('bump');
      g.sfx.play('pop');
      const cam = g.zone.cam;
      g.zone.fx.sparkles(cam.x, cam.y - 40, 10, 90);
      g.zone.fx.hearts(cam.x, cam.y - 20, 3);
    };
  }

  /** Show the menu and put the world into its slow drift. */
  show() {
    const s = this.game.state;
    this.open = true;
    this.game.attract = true;
    // frame the whole room first, then drift around that — the menu should show
    // the place, not a corner of it
    const z = this.game.zone;
    const b = z.bounds();
    z.cam.frame(b, 40);
    // in a touch, and lifted: the plaque sits low, so the room should sit high
    z.cam.zoomTo(z.cam.zoom * 1.12, this.game.view.w / 2, this.game.view.h / 2);
    z.cam.snapTo(z.cam.x, z.cam.y + b.h * 0.1);
    this.home = { x: z.cam.x, y: z.cam.y, zoom: z.cam.zoom };
    const served = s.stats?.served ?? 0;
    this.el.stat.textContent = served > 0
      ? `Day ${s.day} · ${served} guest${served === 1 ? '' : 's'} served · ${money(s.stats.earned)} taken`
      : 'A quiet harbour, a kitchen, and nobody in it yet.';
    this.el.play.textContent = served > 0 || s.day > 1 ? 'Back to work' : 'Open the doors';
    show(this.el.root, true);
    this.el.root.classList.remove('out');
    document.getElementById('hud').classList.add('titling');
  }

  /**
   * Hand the controls over. `quiet` skips what normally follows — the guide on a
   * first run, the morning's catch on a returning one — for when something other
   * than a player is pressing the button.
   */
  start(quiet = false) {
    if (!this.open) return;
    this.open = false;
    this.game.attract = false;
    this.game.sfx.unlock();
    this.game.sfx.play('open');
    this.el.root.classList.add('out');
    document.getElementById('hud').classList.remove('titling');
    setTimeout(() => show(this.el.root, false), 320);
    if (!quiet) this.game.onTitleDone();
  }

  /** Called from the More menu, so you can go back and look at the place. */
  reopen() {
    this.game.hud.closeSheet();
    this.game.cancelPlacement();
    this.show();
  }

  /** Drift the camera while the menu is up. */
  update(dt, t) {
    if (!this.open) return;
    const z = this.game.zone;
    const home = this.home ?? { x: z.cam.x, y: z.cam.y };
    const b = z.bounds();
    if (this.game.state.motionOn) {
      // a slow, small ellipse around the framing, so the scene breathes without
      // ever wandering off the edge of the room
      z.cam.glideTo(home.x + Math.cos(t * 0.13) * b.w * 0.05,
        home.y + Math.sin(t * 0.1) * b.h * 0.04);
      this.bubbleT = (this.bubbleT ?? 0) + dt;
      if (this.bubbleT > 0.7) {
        this.bubbleT = 0;
        z.fx.bubbles(b.x + Math.random() * b.w, b.y + b.h * 0.72, 1, 40);
      }
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
    row('sound', 'Sound', 'Taps, tills, and the chef at work.', (on) => {
      game.sfx.enabled = on;
      s.setSetting('sound', on);
      game.hud.sync();
    }),
    row('motion', 'Motion', 'Screen shake, drifting bubbles, and the fiddly little animations.',
      (on) => {
        s.setSetting('motion', on);
        document.body.classList.toggle('still', !on);
      }),
    row('tips', 'Tips', 'The one-line nudges that explain what just happened.',
      (on) => s.setSetting('tips', on)),
  ];
}
