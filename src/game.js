// Ties it all together: the loop, the two zones, the camera, input routing and
// the day cycle.

import { Camera, toScreen } from './world/iso.js';
import { Restaurant } from './world/restaurant.js';
import { Factory } from './world/factory.js';
import { Tweens } from './core/tween.js';
import { Pointer } from './core/input.js';
import { sfx } from './core/audio.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Title } from './ui/title.js';
import { Tutor } from './ui/tutor.js';
import { Story } from './ui/story.js';
import { GameState, SAVE_KEY } from './state.js';
import { TAU, range, rnd } from './core/util.js';
import { ingName } from './data/ingredients.js';
import { FURNITURE_BY_ID, MACHINE_BY_ID, SILO, groupFor } from './data/catalog.js';
import { artFor } from './world/orient.js';
import { RANKS, RANK_LINES } from './data/fame.js';

const OFFLINE_CAP = 4 * 3600;   // seconds of away-time the works will catch up on

/** Which of a piece's two drawings the strip should show, for its turn. */
const spriteOf = (item, rot) => artFor(item.sprite, rot ?? 0);

export class Game {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.state = GameState.load();
    this.sfx = sfx;
    this.tweens = new Tweens();
    this.view = { w: 1, h: 1 };
    this.dpr = 1;
    this.time = 0;

    this.hud = new Hud(this);
    this.panels = new Panels(this);
    this.attract = false;         // the main menu is up and the world is idling

    this.restaurant = new Restaurant(this);
    this.factory = new Factory(this);
    // an area unlock from a previous session widens the room before framing
    this.#applyRoomSize();
    for (const z of [this.restaurant, this.factory]) {
      z.cam = new Camera(this.view);
      z.cam.bounds = z.bounds();
      z.framed = false;
    }
    this.zone = this.restaurant;

    this.dragPlate = null;
    this.dragGhost = false;
    this.painting = false;
    this.pressAt = null;
    this.moved = false;
    this.closing = false;
    this.saveT = 0;
    this.wipe = { v: 0 };   // screen fade for room changes
    this.wiping = false;

    this.bubbles = Array.from({ length: 16 }, () => ({
      x: rnd(), y: rnd(), r: range(3, 9), sp: range(0.012, 0.045), w: range(0, TAU),
    }));

    this.#resize();
    window.addEventListener('resize', () => this.#resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.#resize(), 120));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.#save(); });

    this.pointer = new Pointer(canvas, this.zone.cam, {
      onPress: (w) => this.#onPress(w),
      onGrab: (w) => this.#onGrab(w),
      onDrag: (w) => this.#onDrag(w),
      onDrop: (w) => this.#onDrop(w),
      onTap: (w) => this.#onTap(w),
      onHover: (w) => this.zone.moveGhost?.(w),
    });

    this.title = new Title(this);
    this.tutor = new Tutor(this);
    this.story = new Story(this);
    this.sfx.enabled = this.state.settings?.sound !== false;
    document.body.classList.toggle('still', !this.state.motionOn);

    this.state.bus.on('change', () => { this.hud.sync(); });
    this.state.bus.on('rank', (n) => this.#rankUp(n));
    this.state.bus.on('shop', () => { this.syncRoomSize(); });
    this.hud.sync();
    this.hud.setZone('restaurant');
    this.#catchUp();
  }

  /* ---------------------------------------------------------------- canvas  */

  /**
   * What the building stands against.
   *
   * It has to be far enough from the room to give the outline something to be
   * an outline against, and it must not be a second hue: a cool sky behind warm
   * oak looked like two different games stitched together. So it is the same
   * warm family, taken well down in value — the room is the lightest thing on
   * screen and sits on a deeper ground, which is all a silhouette needs.
   */
  #bakeBackdrop(w, h) {
    const cv = document.createElement('canvas');
    // half resolution is plenty for a smooth gradient and keeps the blit cheap
    cv.width = Math.max(2, Math.ceil(w / 2));
    cv.height = Math.max(2, Math.ceil(h / 2));
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(
      cv.width * 0.5, cv.height * 0.22, 20,
      cv.width * 0.5, cv.height * 0.3, Math.max(cv.width, cv.height) * 0.9,
    );
    g.addColorStop(0, '#f6e9cd');
    g.addColorStop(0.55, '#dcc59b');
    g.addColorStop(1, '#bfa478');
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    this.bg = { cv, w, h };
  }

  #resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.view.w = w;
    this.view.h = h;
    for (const z of [this.restaurant, this.factory]) {
      z.cam.view = this.view;
      z.cam.frame(z.bounds(), Math.min(70, h * 0.1));
      // on a phone the whole room only fits by shrinking it to nothing, so start
      // closer in on the floor and let the player pan
      if (w < 560) {
        z.cam.zoom = Math.max(z.cam.zoom, 0.56);
        const f = z.room.floorCenter();
        z.cam.snapTo(f.x, f.y - 30);
      }
    }
  }

  /* ------------------------------------------------------------- away time  */

  /** Run the works forward for time spent away, then say what turned up. */
  #catchUp() {
    const now = Date.now();
    const last = this.state.lastSeen ?? now;
    this.state.lastSeen = now;
    const elapsed = Math.min(OFFLINE_CAP, Math.max(0, (now - last) / 1000));
    if (elapsed < 45) return;
    const got = this.factory.offlineTick(elapsed);
    const entries = Object.entries(got);
    if (!entries.length) return;
    const summary = entries.slice(0, 3).map(([id, n]) => `${n}× ${ingName(id)}`).join(', ');
    this.hud.toast(`The works kept at it while you were out: ${summary}`, 'good');
  }

  /* ---------------------------------------------------------------- zones  */

  /** Change room behind a short fade, so the swap doesn't snap. */
  setZone(name) {
    const next = name === 'factory' ? this.factory : this.restaurant;
    if (next === this.zone || this.wiping) return;
    this.zone.cancelPlace?.();
    this.hud.hidePlaceBar();
    this.hud.setZone(name);
    this.sfx.play('whoosh');
    this.wiping = true;
    this.tweens.to(this.wipe, { v: 1 }, 0.15, {
      ease: 'outQuad',
      onDone: () => {
        this.zone = next;
        this.pointer.camera = next.cam;
        if (this.hud.isSheetOpen && this.hud.sheetOpen === 'build') this.panels.openBuild(true);
        this.tweens.to(this.wipe, { v: 0 }, 0.26, {
          ease: 'outCubic',
          onDone: () => { this.wiping = false; },
        });
      },
    });
  }

  /* ------------------------------------------------------------ placement  */

  startPlacing(id, style) {
    this.restaurant.beginPlace(id, style);
    this.hud.closeSheet();
    this.#parkGhost(this.restaurant);
    this.#syncPlaceBar();
  }

  startFactoryPlacing(kind, id) {
    this.factory.beginPlace(kind, id);
    this.hud.closeSheet();
    if (kind !== 'belt') this.#parkGhost(this.factory);
    this.#syncPlaceBar();
  }

  startFactoryErase() {
    this.factory.beginErase();
    this.hud.closeSheet();
    this.hud.showPlaceBar('Drag over things to remove them',
      { rotate: false, title: 'Remove Tool', confirm: null });
  }

  /**
   * Hand the piece over already standing somewhere it would go.
   *
   * The panel shuts on a room, and a piece hovering over a tile it cannot have
   * would open on a refusal — so the search spirals out from the middle of the
   * floor and stops at the first tile that will take it. For a trinket that is
   * the nearest table; for a wall piece, the nearest wall.
   */
  #parkGhost(zone) {
    const g = zone.ghost;
    if (!g) return;
    const cc = (zone.cols - 1) / 2, cr = (zone.rows - 1) / 2;
    let best = null, bestD = Infinity;
    for (let c = 0; c < zone.cols; c++) {
      for (let r = 0; r < zone.rows; r++) {
        if (!zone.canPlace(c, r, g.item)) continue;
        const d = (c - cc) ** 2 + (r - cr) ** 2;
        if (d < bestD) { bestD = d; best = { c, r }; }
      }
    }
    const at = best ?? { c: Math.round(cc), r: Math.round(cr) };
    zone.moveGhost(toScreen(at.c, at.r));
  }

  rotatePlacement() {
    this.zone.rotateGhost?.();
    this.sfx.play('whoosh');
    const g = this.zone.ghost;
    // a puff on the tile it stands on, so the turn is felt in the room and not
    // only in the strip along the bottom
    if (g && g.c !== null && g.c !== undefined) {
      const p = toScreen(g.c, g.r);
      this.zone.fx?.puff(p.x, p.y + 4, 5, 13);
    }
    this.#syncPlaceBar();
  }

  /**
   * Put the thing on the cursor down for good.
   *
   * This is the whole of the change: a tap on the floor carries the piece to
   * that tile and *this* is what buys it. Everything a shop does — take the
   * money, thump it into place, keep the tool live for the next one — happens
   * here rather than on whichever tile you happened to touch first.
   */
  confirmPlacement() {
    const zone = this.zone;
    const g = zone.ghost;
    if (!g) return;
    if (!g.ok) {
      this.sfx.play('no');
      this.hud.hint(zone.placeHint?.(g.item) ?? "That won't go there", 2.0);
      this.hud.shakePlaceBar();
      return;
    }
    const spent = zone.commitPlace?.();
    if (!spent) {
      this.sfx.play('no');
      this.hud.toast("Can't afford that one yet", 'bad');
      this.hud.shakePlaceBar();
      return;
    }
    this.state.save();
    this.hud.sync();
    // the tool stays live for a second one, standing on the next tile that
    // would take it — furnishing a room is never one chair
    this.#parkGhost(zone);
    this.#syncPlaceBar('Placed. Move it again for another');
  }

  /** Keep the blueprint strip showing what is actually on the cursor. */
  #syncPlaceBar(label = null) {
    const g = this.zone.ghost;
    if (!g) { this.hud.hidePlaceBar(); return; }
    if (g.kind === 'erase') {
      this.hud.showPlaceBar('Drag over things to remove them',
        { rotate: false, title: 'Remove Tool', confirm: null });
      return;
    }
    const inFactory = this.zone === this.factory;
    const belt = inFactory && g.kind === 'belt';
    const title = inFactory
      ? (belt ? 'Conveyor' : MACHINE_BY_ID[g.id]?.label ?? 'Machine')
      : (g.item?.label ?? 'Piece');
    const text = belt
      ? 'Drag across the floor to draw a line'
      : label ?? (g.ok ? 'Drag it about, then Place' : this.zone.placeHint?.(g.item) ?? "That won't go there");
    this.hud.showPlaceBar(text, {
      rotate: !belt,
      title,
      turn: (inFactory ? g.dir : g.rot) ?? 0,
      confirm: belt ? null : { ok: !!g.ok, cost: this.zone.ghostCost?.() ?? 0 },
      art: this.#ghostArt(g, inFactory),
    });
  }

  /** The drawing of whatever is on the cursor, for the strip along the bottom. */
  #ghostArt(g, inFactory) {
    if (!g || g.kind === 'erase') return null;
    if (inFactory) {
      if (g.kind === 'belt') return null;
      if (g.kind === 'silo') return this.assets.url(SILO.group, SILO.sprite);
      return this.assets.url('machines', MACHINE_BY_ID[g.id]?.sprite);
    }
    if (!g.item) return null;
    return this.assets.url(groupFor(g.item, g.style), spriteOf(g.item, g.rot));
  }

  cancelPlacement() {
    this.zone.cancelPlace?.();
    this.hud.hidePlaceBar();
  }

  /* ---------------------------------------------------------------- input  */

  #onPress(world) {
    this.pressAt = { ...world };
    this.moved = false;
    this.zone.moveGhost?.(world);
  }

  #onGrab(world) {
    if (this.attract) return false;
    const g = this.zone.ghost;
    if (this.zone === this.factory && g && (g.kind === 'belt' || g.kind === 'erase')) {
      this.painting = true;
      this.factory.paintPrev = null;
      this.factory.paint(world);
      return true;
    }
    // something on the cursor is dragged, not panned: the room stays put and
    // the piece follows your finger until you let go of it
    if (g) { this.dragGhost = true; this.zone.moveGhost?.(world); return true; }
    if (this.zone === this.restaurant && !g) {
      const plate = this.restaurant.grab(world);
      if (plate) { this.dragPlate = plate; return true; }
    }
    return false;
  }

  #onDrag(world) {
    this.moved = true;
    if (this.painting) { this.factory.paint(world); return; }
    if (this.dragGhost) { this.zone.moveGhost?.(world); this.#syncPlaceBar(); return; }
    if (this.dragPlate) this.restaurant.dragTo(this.dragPlate, world);
  }

  #onDrop(world) {
    const moved = this.pressAt ? Math.hypot(world.x - this.pressAt.x, world.y - this.pressAt.y) > 16 : this.moved;
    if (this.painting) {
      this.painting = false;
      this.factory.paintPrev = null;
      if (!moved) this.factory.tap(world);
      return;
    }
    if (this.dragGhost) {
      this.dragGhost = false;
      this.zone.moveGhost?.(world);
      this.#syncPlaceBar();
      return;
    }
    if (this.dragPlate) {
      this.restaurant.drop(this.dragPlate, world, moved);
      this.dragPlate = null;
    }
  }

  #onTap(world) {
    // while the menu is up the room is a picture, so a tap on it is a splash
    // rather than an order
    if (this.attract) {
      this.zone.fx.sparkles(world.x, world.y, 6, 18);
      this.zone.fx.bubbles(world.x, world.y, 3, 16);
      this.sfx.play('tap');
      return;
    }
    if (this.hud.isSheetOpen) return;
    const hint = this.zone.tap(world);
    if (hint && this.state.tipsOn) this.hud.hint(hint, 2.2);
    this.#syncPlaceBar();
    this.hud.sync();
  }

  /* ------------------------------------------------------------- day cycle */

  toggleService() {
    if (this.state.phase === 'open') { this.closeService('manual'); return; }
    if (this.state.phase === 'report') return;

    const r = this.restaurant;
    if (!r.hasPass) { this.hud.toast("Tako needs a Kitchen Pass — somewhere to put the plates", 'bad'); this.openBuild(); return; }
    if (r.seatCount === 0) { this.hud.toast("Nowhere to sit — pop a chair beside a table", 'bad'); this.openBuild(); return; }
    if (this.state.plannedCount === 0) { this.hud.toast("Nothing on the menu yet. Plate something first", 'bad'); this.openRecipes(); return; }
    this.setZone('restaurant');
    this.cancelPlacement();
    this.state.openDoors();
    r.startService();
    this.closing = false;
    this.sfx.play('open');
    this.hud.titleCard(`Day ${this.state.day}`, 'Doors open!');
    // the hint shares the centre of the screen with the card, so let it land after
    this.tweens.after(2.0, () => {
      if (this.state.phase === 'open') this.hud.hint("Somebody's waiting — give them a tap.", 3.2);
    });
    this.hud.sync();
  }

  closeService(reason = 'manual') {
    if (this.state.phase !== 'open' || this.closing) return;
    this.closing = true;
    this.state.closeDoors();
    this.restaurant.stopService();
    this.sfx.play('close');
    this.state.save();
    this.hud.sync();
    this.panels.openReport(reason);
  }

  /**
   * Tomorrow. The day starts by reading the market rather than by tapping Open:
   * what is cheap on the quay and what the harbour has a taste for both change
   * overnight, so the catch card is the first thing you see.
   */
  beginNextDay() {
    this.hud.closeSheet();
    this.state.nextDay();
    this.closing = false;
    this.hud.sync();
    this.hud.titleCard(`Day ${this.state.day}`, "Today's catch");
    this.sfx.play('ding');
    this.tweens.after(1.1, () => this.panels.openCatch());
  }

  /* ------------------------------------------------------------ ui bridges */

  openBuild() { this.cancelPlacement(); this.panels.openBuild(); }
  openDiary() { this.panels.openDiary(); }
  openShop() { this.panels.openShop(); }
  openResearch() { this.panels.openResearch(); }
  openPottery() { this.panels.openPottery(); }
  openCatch() { this.panels.openCatch(); }

  /** Area unlocks widen the dining room, so the grid has to follow. */
  syncRoomSize() {
    if (!this.#applyRoomSize()) return;
    this.restaurant.cam.bounds = this.restaurant.bounds();
    this.restaurant.framed = false;
    this.hud.toast('Look at the size of it now', 'good');
  }

  #applyRoomSize() {
    const size = this.state.roomSize;
    const r = this.restaurant;
    if (r.cols === size && r.rows === size) return false;
    r.cols = size;
    r.rows = size;
    r.room.resize(size, size);
    r.rebuild();
    return true;
  }
  openRecipes() { this.cancelPlacement(); this.panels.openRecipes(); }
  openPantry() { this.panels.openPantry(); }
  openCrew() { this.panels.openCrew(); }
  openHub() { this.panels.openHub(); }
  openFurniture(rec) { if (this.state.phase !== 'open') this.panels.openFurniture(rec); }
  openMachine(m) { this.panels.openMachine(m); }

  onSheetClosed() { this.restaurant.selection = null; this.factory.selection = null; }

  toast(text, kind = '') { this.hud.toast(text, kind); }
  titleCard(main, sub = '') { this.hud.titleCard(main, sub); }

  celebrate(text) {
    this.hud.toast(text, 'good');
    this.sfx.play('star');
    this.hud.bumpStar();
    const cam = this.zone.cam;
    this.zone.fx.stars(cam.x, cam.y - 40, 9);
  }

  bumpCoinChip() { this.hud.bumpCoin(); }

  toggleSound() {
    this.sfx.setEnabled(!this.sfx.enabled);
    this.hud.sync();
    if (this.sfx.enabled) this.sfx.play('ding');
  }

  hardReset() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    this.time += dt;
    this.title?.update(dt, this.time);
    this.tutor?.update();
    this.tweens.update(dt);
    this.restaurant.fx.update(dt);
    this.factory.fx.update(dt);
    this.hud.update(dt);

    this.restaurant.update(dt, this.time);
    this.factory.update(dt);
    this.zone.cam.update(dt);

    if (this.state.phase === 'open') this.hud.sync();
    this.#autoPost(dt);
    this.#autoPlate(dt);
    this.story?.update(dt);

    this.saveT += dt;
    if (this.saveT > 12) { this.saveT = 0; this.#save(); }
  }

  /** The Paste Crew: once researched, posters go up without you. */
  #autoPost(dt) {
    if (!this.state.autoPost || this.state.phase !== 'prep') return;
    this.postT = (this.postT ?? 0) + dt;
    if (this.postT < 12) return;
    this.postT = 0;
    if (this.state.addPoster()) this.hud.sync();
  }

  /**
   * The auto switch: a dish that sells out goes straight back on, as long as
   * the larder can pay for it. It means a day ends when you run out of
   * ingredients rather than when you run out of patience for the stepper.
   */
  #autoPlate(dt) {
    if (!this.state.auto || this.state.phase !== 'open') return;
    this.plateT = (this.plateT ?? 0) + dt;
    if (this.plateT < 1.1) return;
    this.plateT = 0;
    if (this.state.topUp()) this.hud.sync();
  }

  #save() {
    // the main menu is running the game on a set; none of that is yours
    if (this.attract) return;
    this.state.lastSeen = Date.now();
    this.state.save();
  }

  /**
   * A rung climbed.
   *
   * Not a cutscene: this can land in the middle of service, and stopping the
   * game to congratulate somebody who is holding three plates is a punishment.
   * A card, a shower, the chef's opinion, and then straight back to work.
   */
  #rankUp(n) {
    if (this.attract) return;
    const name = RANKS[n]?.name ?? 'Fame';
    this.hud.titleCard(name, 'We moved up');
    this.sfx.play('level');
    const cam = this.zone.cam;
    this.zone.fx.sparkles(cam.x, cam.y - 20, 26, 140);
    this.zone.fx.hearts(cam.x, cam.y, 5);
    // real food thrown in the air: a promotion in a restaurant is a food fight
    const menu = Object.keys(this.state.stock).concat(this.state.unlocked);
    for (let i = 0; i < 4; i++) {
      const id = menu[(Math.random() * menu.length) | 0];
      this.zone.fx.burst(this.assets.get('food', id), cam.x + (i - 1.5) * 60, cam.y + 20, 3,
        { spread: 130, size: 30, up: 420 });
    }
    if (RANK_LINES[n]) setTimeout(() => this.story?.aside([RANK_LINES[n]]), 1400);
    this.state.save();
  }

  hasSaveOnDisk() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  /** Load Save: throw this session away and take what is on disk. */
  reloadSave() {
    if (!this.hasSaveOnDisk()) return;
    location.reload();
  }

  /**
   * The menu is closed and the player has the controls. A brand new save gets
   * the guide straight away — it is the one moment a tutorial is welcome — and
   * anyone coming back gets the morning's catch instead.
   */
  onTitleDone() {
    const s = this.state;
    // the chef gets the first word, then the guide, then the morning
    if (!s.tutorial?.done) { this.story.intro(() => this.tutor.begin()); return; }
    if (s.phase === 'prep' && !s.catch?.seen) setTimeout(() => this.openCatch(), 350);
  }

  openTitle() { this.title.reopen(); }
  openSettings() { this.panels.openSettings(); }
  openCredits() { this.panels.openCredits(); }
  openGuide() { this.hud.closeSheet(); this.tutor.begin(true); }

  /* ---------------------------------------------------------------- render */

  render() {
    const { ctx } = this;
    const t = this.time;
    this.#backdrop(ctx);

    const shake = this.state.motionOn ? this.zone.fx.shake : 0;
    const shakeX = shake ? Math.sin(t * 61) * shake : 0;
    const shakeY = shake ? Math.cos(t * 47) * shake : 0;
    const cam = this.zone.cam;
    ctx.setTransform(
      cam.zoom * this.dpr, 0, 0, cam.zoom * this.dpr,
      (this.view.w / 2 - (cam.x + shakeX) * cam.zoom) * this.dpr,
      (this.view.h / 2 - (cam.y + shakeY) * cam.zoom) * this.dpr,
    );

    const zone = this.zone;
    zone.room.draw(ctx, this.dpr);
    zone.drawFloorItems(ctx);
    zone.drawHints(ctx, t);

    const list = [];
    zone.collect(ctx, list, t);
    list.sort((a, b) => a.d - b.d);
    for (const item of list) item.fn();

    zone.drawBuildLayer(ctx, t);
    zone.fx.draw(ctx);
    zone.drawOverlays(ctx, t);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.wipe.v > 0.002) {
      ctx.globalAlpha = this.wipe.v;
      ctx.fillStyle = '#dcc59b';
      ctx.fillRect(0, 0, this.view.w, this.view.h);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Warm paper backdrop with a few drifting bubbles. The gradient only depends
   * on viewport size, so it is baked once — rebuilding and filling it per frame
   * cost more than everything else in the scene put together.
   */
  #backdrop(ctx) {
    const { w, h } = this.view;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (!this.bg || this.bg.w !== w || this.bg.h !== h) this.#bakeBackdrop(w, h);
    ctx.drawImage(this.bg.cv, 0, 0, this.bg.cv.width, this.bg.cv.height, 0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.4;
    for (const b of this.bubbles) {
      b.y -= b.sp * 0.01;
      if (b.y < -0.05) { b.y = 1.05; b.x = rnd(); }
      const x = (b.x + Math.sin(this.time * 0.5 + b.w) * 0.012) * w;
      const y = b.y * h;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255,0.35)';
      ctx.fill();
    }
    ctx.restore();
  }
}
