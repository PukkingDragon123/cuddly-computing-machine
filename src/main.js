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
 * A shift in miniature, on a loop, while the art arrives.
 *
 * Four beats: Tako cooks a dish, somebody walks in for it, he hands it over,
 * they eat it and go. Then the next one. Every figure is the game's own three
 * frame sprite strip stepped with background-position — idle / walk / work for
 * the chef, idle / walk / eat for the guest — so this is the real cast doing
 * the real loop rather than a picture of it.
 *
 * Tapping cooks faster, which is the only thing you can do here and the reason
 * a loading bar you are allowed to play with stops being a loading bar.
 *
 * Everything it touches is a file read straight off disk with no atlas, so it
 * runs before a single line of the game exists.
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
/** [id, frame width] — every guest strip is 176 tall, so width sets the shape. */
const BOOT_GUEST = [
  ['01_sea_bunny_nudibranch', 118],
  ['02_dumbo_octopus', 172],
  ['03_hermit_crab', 197],
  ['05_sea_otter', 135],
  ['08_moon_jellyfish', 163],
  ['09_seahorse', 123],
  ['13_green_sea_turtle', 152],
];

function bootGame() {
  const stage = document.getElementById('boot-stage');
  const chef = document.getElementById('boot-chef');
  const guest = document.getElementById('boot-guest');
  const dish = document.getElementById('boot-dish');
  const food = document.getElementById('boot-food');
  const drops = document.getElementById('boot-drops');
  const bubble = document.getElementById('boot-bubble');
  const combo = document.getElementById('boot-combo');
  const stir = combo?.parentElement;
  const ring = document.getElementById('boot-ring');
  if (!stage || !chef || !guest) return;

  const el = (cls, style) => {
    const e = document.createElement('span');
    e.className = cls;
    Object.assign(e.style, style);
    return e;
  };
  const gone = (e, ms) => setTimeout(() => e.remove(), ms);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  /* The loading screen runs before the atlas is read, so it names its art by
     hand — which means it is the one place that can fall out of step with what
     the pack is actually encoded as. One helper, one extension. */
  const art = (group, id) => `url("assets/${group}/${id}.webp")`;

  chef.style.backgroundImage = art('staff', '04_octopus_head_chef');

  let served = 0;
  let cooked = 0;            // 0..1 through the dish on the go
  let beat = 'cook';         // cook | arrive | serve | eat | leave
  let stopped = false;
  let recipe = pick(BOOT_DISH);

  /* ------------------------------------------------------------- the props */

  /** A splash over the rim of whatever he is working in. */
  const splash = (n = 4) => {
    for (let i = 0; i < n; i++) {
      const a = (-142 + Math.random() * 104) * (Math.PI / 180);
      const d = 1.2 + Math.random() * 1.4;
      const sp = el('boot-splash', { animationDelay: `${i * 0.03}s` });
      sp.style.setProperty('--dx', `${Math.cos(a) * d}rem`);
      sp.style.setProperty('--dy', `${Math.sin(a) * d}rem`);
      sp.style.setProperty('--off', `${-1.1 + Math.random() * 2.2}rem`);
      drops.append(sp);
      gone(sp, 900);
    }
  };

  /** One ingredient, in: it falls to the dish and disappears into it. */
  const feed = () => {
    if (beat !== 'cook') return;
    const d = el('boot-drop', {
      backgroundImage: art('ingredients', pick(BOOT_ING)),
    });
    d.style.setProperty('--off', `${-0.9 + Math.random() * 1.8}rem`);
    d.style.setProperty('--spin', `${-40 + Math.random() * 80}deg`);
    drops.append(d);
    gone(d, 900);
    setTimeout(() => splash(3), 520);
  };

  const sparkle = (host, n = 7) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 2;
      const sp = el('boot-spark', { animationDelay: `${i * 0.02}s` });
      sp.style.setProperty('--off', `${-1.4 + Math.random() * 2.8}rem`);
      sp.style.setProperty('--dx', `${Math.cos(a) * r}rem`);
      sp.style.setProperty('--dy', `${Math.sin(a) * r - 0.8}rem`);
      host.append(sp);
      gone(sp, 800);
    }
  };

  const heart = (n = 3) => {
    for (let i = 0; i < n; i++) {
      const hh = el('boot-heart', { animationDelay: `${i * 0.12}s` });
      hh.style.setProperty('--off', `${-0.9 + Math.random() * 1.8}rem`);
      guest.append(hh);
      gone(hh, 1200);
    }
  };

  /* ------------------------------------------------------------- the beats */

  const setBeat = (b) => {
    beat = b;
    stage.dataset.beat = b;
  };

  /** He is cooking. The ring fills; ingredients go in. */
  const startCook = () => {
    recipe = pick(BOOT_DISH);
    cooked = 0;
    food.style.backgroundImage = art('food', recipe);
    ring.style.setProperty('--at', '0');
    setBeat('cook');
  };

  /** Somebody walks in for it. */
  const startArrive = () => {
    const [id, fw] = pick(BOOT_GUEST);
    guest.style.backgroundImage = art('customers', id);
    guest.style.setProperty('--w', `${(fw / 176) * 7.8}rem`);
    setBeat('arrive');
    setTimeout(() => {
      if (stopped) return;
      bubble.style.backgroundImage = art('food', recipe);
      bubble.classList.add('up');
    }, 900);
    setTimeout(() => { if (!stopped) startServe(); }, 1500);
  };

  /** The hand-over: the dish flies across and they tuck in. */
  const startServe = () => {
    setBeat('serve');
    bubble.classList.remove('up');
    sparkle(dish);
    sfx.play('star');
    setTimeout(() => {
      if (stopped) return;
      setBeat('eat');
      heart(3);
      served += 1;
      if (combo) {
        stir?.classList.add('on');
        combo.textContent = `${served} served`;
        combo.classList.remove('pop');
        void combo.offsetWidth;
        combo.classList.add('pop');
      }
    }, 620);
    setTimeout(() => { if (!stopped) setBeat('leave'); }, 2400);
    setTimeout(() => { if (!stopped) startCook(); }, 3400);
  };

  /** Push the ticket along and repaint the ring. */
  const advance = (by) => {
    if (beat !== 'cook') return;
    cooked = Math.min(1, cooked + by);
    ring.style.setProperty('--at', String(cooked));
    if (cooked >= 1) startArrive();
  };

  // the hob runs on its own — a loading screen you never touch still cooks
  let n = 0;
  const tick = () => {
    if (stopped) return;
    advance(0.03);
    n += 1;
    if (n % 6 === 0) feed();
    setTimeout(tick, 190);
  };
  startCook();
  setTimeout(tick, 400);

  // ...and a tap is worth six seconds of standing there watching him
  stage.onpointerdown = () => {
    if (beat !== 'cook') return;
    chef.classList.remove('quick');
    void chef.offsetWidth;
    chef.classList.add('quick');
    feed();
    splash(5);
    advance(0.08);
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
