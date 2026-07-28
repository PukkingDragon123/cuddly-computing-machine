// Ties it all together: the loop, the two zones, the camera, input routing and
// the day cycle.

import { Camera } from './world/iso.js';
import { Restaurant } from './world/restaurant.js';
import { Factory } from './world/factory.js';
import { Tweens } from './core/tween.js';
import { Pointer } from './core/input.js';
import { sfx } from './core/audio.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { GameState, SAVE_KEY } from './state.js';
import { TAU, range, rnd } from './core/util.js';
import { ingName } from './data/ingredients.js';
import { FURNITURE_BY_ID } from './data/catalog.js';

const OFFLINE_CAP = 4 * 3600;   // seconds of away-time the works will catch up on

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

    this.restaurant = new Restaurant(this);
    this.factory = new Factory(this);
    for (const z of [this.restaurant, this.factory]) {
      z.cam = new Camera(this.view);
      z.cam.bounds = z.bounds();
      z.framed = false;
    }
    this.zone = this.restaurant;

    this.dragPlate = null;
    this.painting = false;
    this.pressAt = null;
    this.moved = false;
    this.closing = false;
    this.saveT = 0;

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

    this.state.bus.on('change', () => { this.hud.sync(); });
    this.hud.sync();
    this.hud.setZone('restaurant');
    this.#catchUp();
  }

  /* ---------------------------------------------------------------- canvas  */

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
    this.hud.toast(`While you were away: ${summary}`, 'good');
  }

  /* ---------------------------------------------------------------- zones  */

  setZone(name) {
    const next = name === 'factory' ? this.factory : this.restaurant;
    if (next === this.zone) return;
    this.zone.cancelPlace?.();
    this.hud.hidePlaceBar();
    this.zone = next;
    this.pointer.camera = next.cam;
    this.hud.setZone(name);
    this.sfx.play('whoosh');
    if (this.hud.isSheetOpen && this.hud.sheetOpen === 'build') this.panels.openBuild(true);
  }

  /* ------------------------------------------------------------ placement  */

  startPlacing(id, style) {
    this.restaurant.beginPlace(id, style);
    this.hud.closeSheet();
    const item = FURNITURE_BY_ID[id];
    this.hud.showPlaceBar(`Tap the floor to set the ${item?.label ?? 'piece'}`);
  }

  startFactoryPlacing(kind, id) {
    this.factory.beginPlace(kind, id);
    this.hud.closeSheet();
    this.hud.showPlaceBar(kind === 'belt' ? 'Drag to draw a belt line' : 'Tap a tile to set it down');
  }

  startFactoryErase() {
    this.factory.beginErase();
    this.hud.closeSheet();
    this.hud.showPlaceBar('Drag over things to remove them', { rotate: false });
  }

  rotatePlacement() {
    this.zone.rotateGhost?.();
    this.sfx.play('tap');
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
    const g = this.zone.ghost;
    if (this.zone === this.factory && g && (g.kind === 'belt' || g.kind === 'erase')) {
      this.painting = true;
      this.factory.paintPrev = null;
      this.factory.paint(world);
      return true;
    }
    if (this.zone === this.restaurant && !g) {
      const plate = this.restaurant.grab(world);
      if (plate) { this.dragPlate = plate; return true; }
    }
    return false;
  }

  #onDrag(world) {
    this.moved = true;
    if (this.painting) { this.factory.paint(world); return; }
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
    if (this.dragPlate) {
      this.restaurant.drop(this.dragPlate, world, moved);
      this.dragPlate = null;
    }
  }

  #onTap(world) {
    if (this.hud.isSheetOpen) return;
    const hint = this.zone.tap(world);
    if (hint) this.hud.hint(hint, 2.2);
    if (this.zone.ghost) {
      this.hud.showPlaceBar(
        this.zone === this.factory && this.zone.ghost.kind === 'belt'
          ? 'Drag to draw a belt line'
          : 'Tap the floor to place another',
        { rotate: this.zone.ghost.kind !== 'erase' },
      );
    } else this.hud.hidePlaceBar();
    this.hud.sync();
  }

  /* ------------------------------------------------------------- day cycle */

  toggleService() {
    if (this.state.phase === 'open') { this.closeService('manual'); return; }
    if (this.state.phase === 'report') return;

    const r = this.restaurant;
    if (!r.hasPass) { this.hud.toast('You need a Kitchen Pass first', 'bad'); this.openBuild(); return; }
    if (r.seatCount === 0) { this.hud.toast('Put a chair beside a table', 'bad'); this.openBuild(); return; }
    if (this.state.plannedCount === 0) { this.hud.toast('Plate up a menu first', 'bad'); this.openRecipes(); return; }

    this.setZone('restaurant');
    this.cancelPlacement();
    this.state.openDoors();
    r.startService();
    this.closing = false;
    this.sfx.play('open');
    this.hud.hint('Doors open! Tap a guest to seat them.', 3.4);
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

  beginNextDay() {
    this.hud.closeSheet();
    this.state.nextDay();
    this.closing = false;
    this.hud.sync();
    this.hud.toast(`Day ${this.state.day} — morning delivery arrived`, 'good');
    this.sfx.play('ding');
  }

  /* ------------------------------------------------------------ ui bridges */

  openBuild() { this.cancelPlacement(); this.panels.openBuild(); }
  openRecipes() { this.cancelPlacement(); this.panels.openRecipes(); }
  openPantry() { this.panels.openPantry(); }
  openCrew() { this.panels.openCrew(); }
  openHelp() { this.panels.openHelp(); }
  openHub() { this.panels.openHub(); }
  openFurniture(rec) { if (this.state.phase !== 'open') this.panels.openFurniture(rec); }
  openMachine(m) { this.panels.openMachine(m); }

  onSheetClosed() { this.restaurant.selection = null; this.factory.selection = null; }

  toast(text, kind = '') { this.hud.toast(text, kind); }

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
    this.tweens.update(dt);
    this.restaurant.fx.update(dt);
    this.factory.fx.update(dt);
    this.hud.update(dt);

    this.restaurant.update(dt, this.time);
    this.factory.update(dt);
    this.zone.cam.update(dt);

    if (this.state.phase === 'open') this.hud.sync();

    this.saveT += dt;
    if (this.saveT > 12) { this.saveT = 0; this.#save(); }
  }

  #save() {
    this.state.lastSeen = Date.now();
    this.state.save();
  }

  /* ---------------------------------------------------------------- render */

  render() {
    const { ctx } = this;
    const t = this.time;
    this.#backdrop(ctx);

    const shake = this.zone.fx.shake;
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Warm paper backdrop with a few drifting bubbles. */
  #backdrop(ctx) {
    const { w, h } = this.view;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.22, 40, w * 0.5, h * 0.3, Math.max(w, h) * 0.9);
    g.addColorStop(0, '#fdf6e6');
    g.addColorStop(0.55, '#ecdfc4');
    g.addColorStop(1, '#d9c8a6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.4;
    for (const b of this.bubbles) {
      b.y -= b.sp * 0.01;
      if (b.y < -0.05) { b.y = 1.05; b.x = rnd(); }
      const x = (b.x + Math.sin(this.time * 0.5 + b.w) * 0.012) * w;
      const y = b.y * h;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
    }
    ctx.restore();
  }
}
