// Boot: load art, build the game, run a fixed-step loop.

import { loadAssets } from './core/loader.js';
import { sfx } from './core/audio.js';
import { Game } from './game.js';
import { skinIcons } from './ui/dom.js';

const STEP = 1 / 60;
const MAX_CATCHUP = 0.25;   // never simulate more than a quarter second per frame

const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');
const pct = document.getElementById('boot-pct');
const msg = document.getElementById('boot-msg');

const LINES = [
  'Filling the tanks…',
  'Waking the chef…',
  'Polishing the portholes…',
  'Warming the kelp broth…',
  'Setting the tables…',
];

/**
 * Something to do while the art arrives — and it is the game's own cooking.
 *
 * Tako works a real ticket: ingredients go in one at a time, the ring round the
 * pot fills the way it does over the pass in the kitchen, and when it closes a
 * finished dish pops out of it. Then he starts the next one. Tapping the pot
 * stirs it, and a stir actually cooks — it drives the ring on, so playing with
 * the loading screen makes the loading screen do something.
 *
 * Everything it uses is a file the game loads anyway: `assets/ingredients/*`
 * and `assets/food/*` are read straight off disk with no atlas, so this runs
 * before a single line of the game exists.
 */
const BOOT_ING = [
  'kelp', 'egg', 'milk', 'flour', 'butter', 'scallop', 'potato', 'clam',
  'tomato', 'lemon', 'carrot', 'cabbage', 'strawberry', 'coconut', 'nori',
  'rice', 'cheese', 'onion', 'oyster', 'crab',
];
const BOOT_DISH = [
  'kelp_latte', 'kelp_ramen', 'scallop_tart', 'miso_chowder', 'sea_roll',
  'lobster_roll', 'clam_congee', 'shrimp_toast', 'pearl_boba', 'oyster_plate',
];

function bootGame() {
  const pot = document.getElementById('boot-pot');
  const drops = document.getElementById('boot-drops');
  const combo = document.getElementById('boot-combo');
  const stir = combo?.parentElement;
  const ring = document.getElementById('boot-ring');
  if (!pot || !drops) return;

  const el = (cls, style) => {
    const e = document.createElement('span');
    e.className = cls;
    Object.assign(e.style, style);
    return e;
  };
  const gone = (e, ms) => setTimeout(() => e.remove(), ms);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  let cooked = 0;
  let progress = 0;          // 0..1 through the dish on the hob
  let dish = pick(BOOT_DISH);
  let stopped = false;

  /**
   * A splash over the rim. Coordinates are the pot's own, so this lands on the
   * pot wherever the pot happens to be on screen.
   */
  const splash = (n = 5) => {
    for (let i = 0; i < n; i++) {
      const a = (-142 + Math.random() * 104) * (Math.PI / 180);
      const d = 1.4 + Math.random() * 1.6;
      const sp = el('boot-splash', { animationDelay: `${i * 0.03}s` });
      sp.style.setProperty('--dx', `${Math.cos(a) * d}rem`);
      sp.style.setProperty('--dy', `${Math.sin(a) * d}rem`);
      sp.style.setProperty('--off', `${-1.6 + Math.random() * 3.2}rem`);
      drops.append(sp);
      gone(sp, 900);
    }
  };

  /**
   * One ingredient, in.
   *
   * It falls from above the rim to the rim and vanishes there — which is the
   * whole point, and what it did not do before: it used to drop somewhere
   * beside the pot and fade, so nothing ever went *into* anything. It lands
   * with a splash, on a timer matched to the fall.
   */
  const feed = () => {
    const d = el('boot-drop', {
      backgroundImage: `url("assets/ingredients/${pick(BOOT_ING)}.png")`,
    });
    d.style.setProperty('--off', `${-1.3 + Math.random() * 2.6}rem`);
    d.style.setProperty('--spin', `${-40 + Math.random() * 80}deg`);
    drops.append(d);
    gone(d, 900);
    setTimeout(() => splash(3), 560);
  };

  /** The ticket lands: the dish flies up out of the pot. */
  const serve = () => {
    const up = el('boot-served', {
      backgroundImage: `url("assets/food/${dish}.png")`,
    });
    drops.append(up);
    gone(up, 1000);
    for (let i = 0; i < 7; i++) {
      const a = (Math.random() * 360) * (Math.PI / 180);
      const r = 2 + Math.random() * 2.4;
      const sp = el('boot-spark', { animationDelay: `${i * 0.02}s` });
      sp.style.setProperty('--off', `${-1.8 + Math.random() * 3.6}rem`);
      sp.style.setProperty('--dx', `${Math.cos(a) * r}rem`);
      sp.style.setProperty('--dy', `${Math.sin(a) * r - 1}rem`);
      drops.append(sp);
      gone(sp, 800);
    }
    cooked += 1;
    if (combo) {
      stir?.classList.add('on');
      combo.textContent = `${cooked} plated`;
      combo.classList.remove('pop');
      void combo.offsetWidth;
      combo.classList.add('pop');
    }
    sfx.play('star');
    dish = pick(BOOT_DISH);
    progress = 0;
  };

  /** Push the ticket along and repaint the ring. */
  const advance = (by) => {
    progress += by;
    if (ring) ring.style.setProperty('--at', String(Math.min(1, progress)));
    if (progress >= 1) serve();
  };

  // the hob runs on its own — a loading screen you never touch still cooks
  let feedT = 0;
  const tick = () => {
    if (stopped) return;
    advance(0.028);
    feedT += 1;
    if (feedT % 7 === 0) feed();
    setTimeout(tick, 190);
  };
  setTimeout(tick, 400);

  // ...and a tap on the pot is worth six seconds of standing there watching it
  pot.onpointerdown = () => {
    pot.classList.remove('stir');
    void pot.offsetWidth;
    pot.classList.add('stir');
    feed();
    splash(6);
    advance(0.075);
    sfx.play('tap');
  };

  return () => { stopped = true; };
}

async function main() {
  const stopBoot = bootGame();
  let line = 0;
  const assets = await loadAssets((at) => {
    const n = Math.round(at * 100);
    fill.style.width = `${n}%`;
    if (pct) pct.textContent = `${n}%`;
    const want = Math.min(LINES.length - 1, Math.floor(at * LINES.length));
    if (want !== line) { line = want; msg.textContent = LINES[line]; }
  });

  // the pack's own interface art, over the built-in SVG fallbacks
  skinIcons(assets);

  const canvas = document.getElementById('stage');
  const game = new Game(canvas, assets);
  window.game = game;   // handy in the console

  // audio contexts need a gesture, so arm on the first interaction
  const arm = () => {
    sfx.unlock();
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);

  msg.textContent = 'Ready!';
  stopBoot?.();
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 450);

  // straight into the main menu, with the restaurant idling behind it
  game.title.show();

  let last = performance.now();
  let acc = 0;
  let barked = false;

  /**
   * The loop, and the one rule that matters about it: it cannot die.
   *
   * The next frame is booked before anything else runs, and the work is caught.
   * Booking it last meant a single thrown frame — one undefined guest, one
   * missing tile — stopped the animation frame chain for good and the game
   * simply froze on screen with no error anybody would see. Now a bad frame is
   * one dropped frame: it is reported once and the game keeps running.
   */
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    acc = Math.min(acc + raw, MAX_CATCHUP);
    try {
      while (acc >= STEP) { game.update(STEP); acc -= STEP; }
      game.render();
    } catch (err) {
      acc = 0;
      console.error('frame', err);
      if (!barked) {
        barked = true;
        game.hud?.toast('Something hiccuped — carrying on', 'bad');
      }
    }
  }
  requestAnimationFrame(frame);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { game.cancelPlacement(); game.hud.closeSheet(); }
    if (e.key === 'r' || e.key === 'R') game.rotatePlacement();
    if (e.key === 'Tab') {
      e.preventDefault();
      game.setZone(game.zone === game.restaurant ? 'factory' : 'restaurant');
    }
  });
}

main().catch((err) => {
  console.error(err);
  msg.textContent = `Could not open the harbour — ${err?.message ?? err}`;
  msg.style.color = '#b8481c';
  fill.style.background = '#e4652f';
  document.getElementById('boot-retry')?.classList.remove('hidden');
});
