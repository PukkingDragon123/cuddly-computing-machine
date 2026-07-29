// The room itself: checkerboard floor, two back walls, and the joinery set into
// them.
//
// The floor and walls are generated so tiles line up exactly with the build grid
// at any room size, while the doors and windows are real sprites from the fixture
// sheets — which means they change wood along with the furniture.

import { HALF_H, HALF_W, TILE_H, toScreen } from './iso.js';
import { INK, diamond, drawSprite, ellipse, roundRectPath } from '../gfx/paint.js';
import { TAU } from '../core/util.js';

const PALETTE = {
  floorA: '#f6ead4',
  floorB: '#d6bd98',
  grout: 'rgba(122,96,66,0.15)',
  border: '#f8eeda',
  rim: '#cdb391',
  rimDark: '#a98f6d',
};

const CAFE = {
  ...PALETTE,
  wallL: '#e7d9c1',
  wallR: '#f1e5d0',
  cornice: '#faf2e2',
  corniceTop: '#fdf8ec',
  base: '#a9784f',
  baseDark: '#875c3a',
  pipes: false,
};

const FACTORY = {
  ...PALETTE,
  floorA: '#e9dcc2',
  floorB: '#cdbb9c',
  wallL: '#d9cfba',
  wallR: '#e5dcc8',
  cornice: '#f6eddc',
  corniceTop: '#fbf5e8',
  base: '#8d7b62',
  baseDark: '#6f6049',
  pipes: true,
};

const WALL_H = 212;
const BASE_H = 22;
const CORNICE_H = 30;
const THICK = 0.3;      // wall thickness, in tiles, for the top face
const RIM_H = 15;       // floor slab thickness at the front edges

/**
 * Built-in wall joinery, taken from the fixture sheets. `u` runs 0..1 along the
 * wall from the back corner and `v` is height above the floor. The art is drawn
 * for one wall each — right-wall pieces slope down-right — so left-wall
 * placements mirror a right-facing sprite.
 */
const FIXTURES = {
  cafe: [
    { id: 'door_open_r', wall: 'right', u: 0.3, v: 0, scale: 0.62, anchor: 'floor', entry: true },
    { id: 'window_bay_r', wall: 'right', u: 0.72, v: 104, scale: 0.62 },
    { id: 'window_palm_r', wall: 'left', u: 0.42, v: 104, scale: 0.62, mirror: true },
    { id: 'window_plain_r', wall: 'left', u: 0.78, v: 104, scale: 0.55, mirror: true },
  ],
  factory: [
    { id: 'door_closed_r', wall: 'right', u: 0.74, v: 0, scale: 0.6, anchor: 'floor', entry: true },
    { id: 'window_plain_r', wall: 'right', u: 0.3, v: 104, scale: 0.58 },
    { id: 'window_plain_r', wall: 'left', u: 0.4, v: 104, scale: 0.58, mirror: true },
  ],
};

export class Room {
  /**
   * @param {import('../core/loader.js').Assets} assets
   * @param {{kind:'cafe'|'factory', cols:number, rows:number}} opts
   */
  constructor(assets, { kind, cols, rows }) {
    this.assets = assets;
    this.kind = kind;
    this.cols = cols;
    this.rows = rows;
    this.pal = kind === 'factory' ? FACTORY : CAFE;
    this.fixtures = FIXTURES[kind] ?? [];
    this.fixtureGroup = 'fixt_oak';
    this.cache = null;
    this.#geometry();
  }

  resize(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.cache = null;
    this.#geometry();
  }

  #geometry() {
    const { cols: C, rows: R } = this;
    // outer floor corners, world pixels
    this.N = { x: 0, y: -HALF_H };
    this.E = { x: C * HALF_W, y: (C - 1) * HALF_H };
    this.W = { x: -R * HALF_W, y: (R - 1) * HALF_H };
    this.S = { x: (C - R) * HALF_W, y: (C + R - 1) * HALF_H };
    this.outline = [this.N, this.E, this.S, this.W];
  }

  inside(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

  /** Middle of the floor diamond — a better camera focus than the full bounds,
   *  which are dominated by the wall height. */
  floorCenter() {
    return { x: (this.E.x + this.W.x) / 2, y: (this.N.y + this.S.y) / 2 };
  }

  /** World-space rect covering floor and walls, for camera framing. */
  bounds() {
    const minX = this.W.x - 40, maxX = this.E.x + 40;
    const minY = this.N.y - WALL_H - 60, maxY = this.S.y + RIM_H + 40;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /* ------------------------------------------------------------- painting */

  /**
   * Blit the room. Walls and floor are static — a few hundred paths, a clip and
   * two gradients — so they are painted once into an offscreen canvas and
   * stamped each frame instead of rebuilt.
   */
  draw(ctx, dpr = 1) {
    const scale = Math.min(1.5, Math.max(1, dpr * 1.15));
    if (!this.cache || Math.abs(this.cache.scale - scale) > 0.06) this.#buildCache(scale);
    const { cv, box } = this.cache;
    ctx.drawImage(cv, 0, 0, cv.width, cv.height, box.x, box.y, box.w, box.h);
  }

  #buildCache(scale) {
    const box = this.bounds();
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(box.w * scale));
    cv.height = Math.max(1, Math.ceil(box.h * scale));
    const c = cv.getContext('2d');
    c.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    this.drawWalls(c);
    this.drawFloor(c);
    this.cache = { cv, box, scale };
  }

  /** Walls first — they sit behind every entity in the room. */
  drawWalls(ctx) {
    this.#wall(ctx, this.N, this.W, this.pal.wallL, -1);
    this.#wall(ctx, this.N, this.E, this.pal.wallR, 1);
    // pipes route behind the portholes, the way the painted plate has them
    if (this.pal.pipes) {
      this.#pipes(ctx, this.N, this.W);
      this.#pipes(ctx, this.N, this.E);
    }
    for (const d of this.fixtures) this.#fixture(ctx, d);
  }

  /** World point of the entry door, so guests can walk in from it. */
  entryPoint() {
    const d = this.fixtures.find((x) => x.entry) ?? this.fixtures[0];
    if (!d) return { x: this.N.x, y: this.N.y };
    return this.#wallPoint(d.wall, d.u, 0);
  }

  /** Swap the joinery to match the dining room's finish. */
  setFixtureGroup(group) {
    if (group === this.fixtureGroup) return;
    this.fixtureGroup = group;
    this.cache = null;
  }

  /**
   * One back wall as a sheared slab: plaster field, wood baseboard, cream cornice
   * and a lighter top face that reads as thickness.
   * `side` is -1 for the left wall, +1 for the right.
   */
  #wall(ctx, a, b, fill, side) {
    const up = (p, h) => ({ x: p.x, y: p.y - h });
    const quad = (p1, p2, p3, p4, color, line = null, lw = 2.5) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
    };

    const topH = WALL_H;
    const fieldTop = topH - CORNICE_H;

    // wall field
    quad(a, b, up(b, fieldTop), up(a, fieldTop), fill);

    // subtle vertical shade toward the corner so the two walls separate
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, 'rgba(120,92,60,0.12)');
    g.addColorStop(0.45, 'rgba(120,92,60,0)');
    quad(a, b, up(b, fieldTop), up(a, fieldTop), g);

    // wood baseboard
    quad(a, b, up(b, BASE_H), up(a, BASE_H), this.pal.base);
    quad(up(a, BASE_H - 3), up(b, BASE_H - 3), up(b, BASE_H), up(a, BASE_H), this.pal.baseDark);

    // cornice band
    quad(up(a, fieldTop), up(b, fieldTop), up(b, topH), up(a, topH), this.pal.cornice);

    // top face (wall thickness seen from above)
    const off = { x: side * HALF_W * THICK, y: -HALF_H * THICK };
    const ta = up(a, topH), tb = up(b, topH);
    quad(ta, tb, { x: tb.x + off.x, y: tb.y + off.y }, { x: ta.x + off.x, y: ta.y + off.y },
      this.pal.corniceTop, INK, 2.4);

    // outline the field + baseboard edges
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.moveTo(up(a, BASE_H).x, up(a, BASE_H).y); ctx.lineTo(up(b, BASE_H).x, up(b, BASE_H).y);
    ctx.moveTo(up(a, fieldTop).x, up(a, fieldTop).y); ctx.lineTo(up(b, fieldTop).x, up(b, fieldTop).y);
    ctx.moveTo(up(b, 0).x, up(b, 0).y); ctx.lineTo(up(b, topH).x, up(b, topH).y);
    ctx.stroke();
  }

  #wallPoint(wall, u, v) {
    const a = this.N;
    const b = wall === 'left' ? this.W : this.E;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - v };
  }

  /**
   * Joinery is drawn as a flat elevation — a door or window seen square on, with
   * only a little frame thickness — so pasting it upright on a wall that recedes
   * leaves it floating at the wrong angle. Shearing it onto the wall's own basis
   * lays it flat: a step sideways along the wall drops by half a step, the same
   * 2:1 slope the tile grid uses.
   */
  #fixture(ctx, d) {
    const sprite = this.assets.get(this.fixtureGroup, d.id);
    if (!sprite) return;
    const p = this.#wallPoint(d.wall, d.u, d.v);
    const slope = (d.wall === 'left' ? -1 : 1) * (HALF_H / HALF_W);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.transform(1, slope, 0, 1, 0, 0);
    // floor-anchored joinery (doors) stands on the floor line; wall-mounted
    // pieces are centred on their height
    drawSprite(ctx, sprite, 0, 0, 0, {
      scale: d.scale ?? 1,
      anchorY: d.anchor === 'floor' ? 1 : 0.5,
      flipX: !!d.mirror,
    });
    ctx.restore();
  }

  /** Two brass-collared tubes running under the factory cornice. */
  #pipes(ctx, a, b) {
    const h = WALL_H - CORNICE_H - 14;
    const runs = [{ off: 0, color: '#c9946a', dark: '#a5744f' }, { off: 17, color: '#b9ae95', dark: '#948a73' }];
    for (const run of runs) {
      const p1 = { x: a.x, y: a.y - h + run.off };
      const p2 = { x: b.x, y: b.y - h + run.off };
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.stroke();
      ctx.strokeStyle = run.color; ctx.lineWidth = 10; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y + 2); ctx.lineTo(p2.x, p2.y + 2);
      ctx.strokeStyle = run.dark; ctx.lineWidth = 3; ctx.stroke();
      // brass collars
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const cx = p1.x + (p2.x - p1.x) * t, cy = p1.y + (p2.y - p1.y) * t;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(p2.y - p1.y, p2.x - p1.x));
        ctx.fillStyle = '#e0b268';
        roundRectPath(ctx, -5, -8, 10, 16, 3);
        ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      ctx.lineCap = 'butt';
    }
  }

  /** Floor slab: rim, cream border with a wavy inner edge, checker tiles. */
  drawFloor(ctx) {
    const { N, E, S, W } = this;

    // front slab thickness
    const down = (p) => ({ x: p.x, y: p.y + RIM_H });
    ctx.beginPath();
    ctx.moveTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(W.x, W.y);
    ctx.lineTo(down(W).x, down(W).y); ctx.lineTo(down(S).x, down(S).y); ctx.lineTo(down(E).x, down(E).y);
    ctx.closePath();
    ctx.fillStyle = this.pal.rim; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(down(E).x, down(E).y - 4); ctx.lineTo(down(S).x, down(S).y - 4); ctx.lineTo(down(W).x, down(W).y - 4);
    ctx.strokeStyle = this.pal.rimDark; ctx.lineWidth = 3; ctx.stroke();

    // cream border base
    ctx.beginPath();
    ctx.moveTo(N.x, N.y); ctx.lineTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(W.x, W.y);
    ctx.closePath();
    ctx.fillStyle = this.pal.border; ctx.fill();

    // checker field, clipped to a wavy inset of the outline
    ctx.save();
    this.#wavyPath(ctx, 0.72, 11, 74);
    ctx.clip();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, y } = toScreen(c, r);
        diamond(ctx, x, y, HALF_W, HALF_H);
        ctx.fillStyle = (c + r) % 2 ? this.pal.floorA : this.pal.floorB;
        ctx.fill();
        ctx.strokeStyle = this.pal.grout;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    ctx.restore();

    // wavy edge line + hard outline
    ctx.save();
    this.#wavyPath(ctx, 0.72, 11, 74);
    ctx.strokeStyle = 'rgba(150,132,96,0.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(N.x, N.y); ctx.lineTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(W.x, W.y);
    ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.stroke();

    // ambient darkening where the walls meet the floor
    this.#wallShade(ctx, N, W);
    this.#wallShade(ctx, N, E);
  }

  /**
   * Inset copy of the floor outline with a scalloped edge — the wavy cream
   * border from the painted plates. `wavelength` is in world pixels so the
   * scallops stay the same size whatever the room dimensions.
   */
  #wavyPath(ctx, insetTiles, amp, wavelength) {
    const pts = this.outline;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < pts.length; i++) {
      const a = this.#inset(pts[i], insetTiles);
      const b = this.#inset(pts[(i + 1) % pts.length], insetTiles);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      // whole number of scallops per edge so corners meet cleanly
      const waves = Math.max(3, Math.round(len / wavelength));
      const steps = waves * 8;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const wob = Math.sin(t * waves * TAU) * amp;
        const px = a.x + (b.x - a.x) * t + nx * wob;
        const py = a.y + (b.y - a.y) * t + ny * wob;
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }

  /** Pull a floor corner inward by `tiles`, along the isometric axes. */
  #inset(p, tiles) {
    const cx = (this.E.x + this.W.x) / 2;
    const cy = (this.N.y + this.S.y) / 2;
    const dx = cx - p.x, dy = cy - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = tiles * TILE_H;
    return { x: p.x + (dx / len) * d * 1.9, y: p.y + (dy / len) * d };
  }

  /** Gradient band on the floor along a wall base, so the corner reads deep. */
  #wallShade(ctx, a, b) {
    const depth = 46;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // pick the normal that points into the room (downward on screen)
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const oa = { x: a.x + nx * depth, y: a.y + ny * depth };
    const ob = { x: b.x + nx * depth, y: b.y + ny * depth };
    const g = ctx.createLinearGradient(a.x, a.y, oa.x, oa.y);
    g.addColorStop(0, 'rgba(118,92,62,0.2)');
    g.addColorStop(1, 'rgba(118,92,62,0)');
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(ob.x, ob.y); ctx.lineTo(oa.x, oa.y);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  }

  /** Highlight a build tile. `tone`: 'ok' | 'bad' | 'pick'. */
  static markTile(ctx, c, r, tone = 'ok', pulse = 0) {
    const { x, y } = toScreen(c, r);
    const colors = {
      ok:   ['rgba(139,187,106,0.55)', '#4d7a34'],
      bad:  ['rgba(224,132,100,0.58)', '#a83f1c'],
      pick: ['rgba(248,209,103,0.6)', '#b8891c'],
    }[tone] ?? ['rgba(255,255,255,0.4)', '#fff'];
    ctx.save();
    diamond(ctx, x, y, HALF_W - 3, HALF_H - 2);
    ctx.fillStyle = colors[0]; ctx.fill();
    // dark backing stroke keeps the dashes legible over any floor tile
    ctx.strokeStyle = 'rgba(61,44,28,0.5)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = colors[1]; ctx.lineWidth = 3.5; ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -pulse * 16;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Just the dashed outline of a build tile. Drawn again on top of the ghost
   * sprite, which is tall enough to hide the marker underneath it.
   */
  static outlineTile(ctx, c, r, tone = 'ok', pulse = 0) {
    const { x, y } = toScreen(c, r);
    const line = { ok: '#4d7a34', bad: '#a83f1c', pick: '#b8891c' }[tone] ?? '#fff';
    ctx.save();
    diamond(ctx, x, y, HALF_W - 3, HALF_H - 2);
    ctx.strokeStyle = 'rgba(61,44,28,0.55)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = line; ctx.lineWidth = 3.5; ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -pulse * 16;
    ctx.stroke();
    ctx.restore();
  }

  /** Soft glow under a highlighted object. */
  static glowTile(ctx, c, r, color, t = 0) {
    const { x, y } = toScreen(c, r);
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.16;
    ellipse(ctx, x, y, HALF_W * 0.82, HALF_H * 0.82, color);
    ctx.restore();
  }
}
