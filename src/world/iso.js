// Isometric tile math and the camera.

import { clamp, lerp } from '../core/util.js';

export const TILE_W = 128;
export const TILE_H = 64;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** How large furniture and joinery sprites draw against the tile grid. */
export const FURN_SCALE = 0.66;

/** Tile (column, row) -> world pixels. Tile centres, not corners. */
export function toScreen(c, r) {
  return { x: (c - r) * HALF_W, y: (c + r) * HALF_H };
}

/** World pixels -> fractional tile coords. Floor for the containing tile. */
export function toTile(x, y) {
  const c = (x / HALF_W + y / HALF_H) / 2;
  const r = (y / HALF_H - x / HALF_W) / 2;
  return { c, r };
}

export function tileAt(x, y) {
  const t = toTile(x, y);
  return { c: Math.floor(t.c + 0.5), r: Math.floor(t.r + 0.5) };
}

/** Painter's-order key. Higher draws later (in front). */
export const depthOf = (c, r, bias = 0) => (c + r) * 64 + bias;

export class Camera {
  constructor(view) {
    this.view = view;          // { w, h } in CSS pixels
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.34;
    this.maxZoom = 1.7;
    this.target = null;        // { x, y } smooth-follow goal
    this.bounds = null;        // { minX, maxX, minY, maxY } in world px
  }

  toScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.view.w / 2,
      y: (wy - this.y) * this.zoom + this.view.h / 2,
    };
  }

  toWorld(sx, sy) {
    return {
      x: (sx - this.view.w / 2) / this.zoom + this.x,
      y: (sy - this.view.h / 2) / this.zoom + this.y,
    };
  }

  panBy(dxScreen, dyScreen) {
    this.target = null;
    this.x += dxScreen / this.zoom;
    this.y += dyScreen / this.zoom;
    this.#clamp();
  }

  zoomAt(sx, sy, factor) { this.zoomTo(this.zoom * factor, sx, sy); }

  zoomTo(z, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.zoom = clamp(z, this.minZoom, this.maxZoom);
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.#clamp();
  }

  /** Drop the camera straight onto a world point. */
  snapTo(wx, wy) { this.x = wx; this.y = wy; this.target = null; this.#clamp(); }

  /** Ease toward a world point over the next few frames. */
  glideTo(wx, wy) { this.target = { x: wx, y: wy }; }

  /** Fit a world-space rect, leaving `pad` CSS pixels of margin. */
  frame(rect, pad = 48) {
    const zx = (this.view.w - pad * 2) / Math.max(1, rect.w);
    const zy = (this.view.h - pad * 2) / Math.max(1, rect.h);
    this.zoom = clamp(Math.min(zx, zy), this.minZoom, this.maxZoom);
    this.snapTo(rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  update(dt) {
    if (this.target) {
      const k = 1 - Math.exp(-7 * dt);
      this.x = lerp(this.x, this.target.x, k);
      this.y = lerp(this.y, this.target.y, k);
      if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 0.6) this.target = null;
      this.#clamp();
    }
  }

  #clamp() {
    const b = this.bounds;
    if (!b) return;
    // allow a little slack past the edges so the room never feels pinned
    const slackX = this.view.w / this.zoom * 0.28;
    const slackY = this.view.h / this.zoom * 0.28;
    this.x = clamp(this.x, b.minX - slackX, b.maxX + slackX);
    this.y = clamp(this.y, b.minY - slackY, b.maxY + slackY);
  }

  /** Apply as a canvas transform: world units in, device pixels out. */
  apply(ctx, dpr = 1) {
    ctx.setTransform(
      this.zoom * dpr, 0, 0, this.zoom * dpr,
      (this.view.w / 2 - this.x * this.zoom) * dpr,
      (this.view.h / 2 - this.y * this.zoom) * dpr,
    );
  }
}
