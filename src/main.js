// Boot: load art, build the game, run a fixed-step loop.

import { loadAssets } from './core/loader.js';
import { sfx } from './core/audio.js';
import { Game } from './game.js';
import { skinIcons } from './ui/dom.js';

const STEP = 1 / 60;
const MAX_CATCHUP = 0.25;   // never simulate more than a quarter second per frame

const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');
const msg = document.getElementById('boot-msg');

const LINES = [
  'Filling the tanks…',
  'Waking the chef…',
  'Polishing the portholes…',
  'Warming the kelp broth…',
  'Setting the tables…',
];

/**
 * Something to do while the art arrives.
 *
 * Tap the pot: the spatula swings, the pot shakes, an ingredient drops in and
 * the count goes up. It changes nothing in the game and it is not meant to —
 * a loading bar you are allowed to play with stops being a loading bar. It
 * needs no atlas, because the two sprites it uses are loaded straight off disk.
 */
function bootGame() {
  const pot = document.getElementById('boot-pot');
  const drops = document.getElementById('boot-drops');
  const combo = document.getElementById('boot-combo');
  const stir = combo?.parentElement;
  if (!pot || !drops) return;

  const FOOD = [
    'kelp', 'egg', 'milk', 'flour', 'butter', 'scallop', 'potato', 'clam',
    'tomato', 'lemon', 'carrot', 'cabbage', 'strawberry', 'coconut',
  ];
  let stirs = 0;
  let clearT = null;

  pot.onpointerdown = () => {
    stirs += 1;
    pot.classList.remove('stir');
    void pot.offsetWidth;
    pot.classList.add('stir');

    const food = FOOD[(Math.random() * FOOD.length) | 0];
    const drop = document.createElement('span');
    drop.className = 'boot-drop';
    drop.style.backgroundImage = `url("assets/ingredients/${food}.png")`;
    drop.style.left = `${28 + Math.random() * 34}%`;
    drop.style.bottom = '5.8rem';
    drops.append(drop);
    setTimeout(() => drop.remove(), 1200);

    stir?.classList.add('on');
    combo.textContent = `${stirs} stir${stirs === 1 ? '' : 's'}`;
    combo.classList.remove('pop');
    void combo.offsetWidth;
    combo.classList.add('pop');
    clearTimeout(clearT);
    clearT = setTimeout(() => stir?.classList.remove('on'), 4000);
    sfx.play(stirs % 8 === 0 ? 'star' : 'tap');
  };
}

async function main() {
  bootGame();
  let line = 0;
  const assets = await loadAssets((pct) => {
    fill.style.width = `${Math.round(pct * 100)}%`;
    const want = Math.min(LINES.length - 1, Math.floor(pct * LINES.length));
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
