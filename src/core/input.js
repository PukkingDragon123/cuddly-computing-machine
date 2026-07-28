// One pointer pipeline for mouse and touch.
//
// On press the game gets first refusal via `onGrab`: return truthy to claim the
// gesture as an object drag, otherwise the gesture pans the camera. Short,
// still presses come back as taps.

const TAP_SLOP = 11;

export class Pointer {
  constructor(canvas, camera, hooks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.hooks = hooks;
    this.down = false;
    this.dragging = false;      // claimed object drag
    this.panning = false;
    this.screen = { x: 0, y: 0 };
    this.world = { x: 0, y: 0 };
    this.hover = { x: 0, y: 0 }; // world pos of last move, drag or not
    this.startScreen = { x: 0, y: 0 };
    this.moved = 0;
    this.touches = new Map();
    this.pinchStart = null;
    this.#bind();
  }

  #pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  #sync(p) {
    this.screen = p;
    this.world = this.camera.toWorld(p.x, p.y);
    this.hover = this.world;
  }

  #bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      c.setPointerCapture?.(e.pointerId);
      this.touches.set(e.pointerId, this.#pos(e));
      if (this.touches.size === 2) { this.#beginPinch(); return; }

      const p = this.#pos(e);
      this.#sync(p);
      this.down = true;
      this.startScreen = p;
      this.moved = 0;
      this.dragging = !!this.hooks.onGrab?.(this.world, p);
      this.panning = !this.dragging;
      this.hooks.onPress?.(this.world, p);
    });

    c.addEventListener('pointermove', (e) => {
      const p = this.#pos(e);
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, p);
      if (this.touches.size >= 2) { this.#updatePinch(); return; }

      if (!this.down) { this.#sync(p); this.hooks.onHover?.(this.world, p); return; }

      const dx = p.x - this.screen.x, dy = p.y - this.screen.y;
      this.moved += Math.hypot(p.x - this.startScreen.x, p.y - this.startScreen.y) > TAP_SLOP ? 1 : 0;
      this.#sync(p);

      if (this.dragging) this.hooks.onDrag?.(this.world, p);
      else if (this.panning && this.#pastSlop()) this.camera.panBy(-dx, -dy);
    });

    const end = (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinchStart = null;
      if (!this.down) return;
      const p = this.#pos(e);
      this.#sync(p);
      // a press that barely moved is a tap, however long it was held
      if (this.dragging) this.hooks.onDrop?.(this.world, p);
      else if (!this.#pastSlop()) this.hooks.onTap?.(this.world, p);
      this.down = this.dragging = this.panning = false;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => {
      this.touches.delete(e.pointerId);
      if (this.down && this.dragging) this.hooks.onDrop?.(this.world, this.screen);
      this.down = this.dragging = this.panning = false;
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.#pos(e);
      this.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  #pastSlop() {
    return Math.hypot(this.screen.x - this.startScreen.x, this.screen.y - this.startScreen.y) > TAP_SLOP;
  }

  #twoTouches() {
    const [a, b] = [...this.touches.values()];
    return { a, b, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  #beginPinch() {
    const t = this.#twoTouches();
    this.pinchStart = { dist: t.dist, zoom: this.camera.zoom };
    this.down = this.dragging = this.panning = false;
  }

  #updatePinch() {
    if (!this.pinchStart) { this.#beginPinch(); return; }
    const t = this.#twoTouches();
    const want = this.pinchStart.zoom * (t.dist / Math.max(1, this.pinchStart.dist));
    this.camera.zoomTo(want, t.mid.x, t.mid.y);
  }
}
