// The room itself: checkerboard floor, two back walls, and the joinery set into
// them.
//
// The floor and walls are generated so tiles line up exactly with the build grid
// at any room size, while the doors and windows are real sprites from the fixture
// sheets — which means they change wood along with the furniture.

import { HALF_H, HALF_W, TILE_H, toScreen } from './iso.js';
import { INK, PAL, diamond, drawSprite, roundRectPath } from '../gfx/paint.js';
import { TAU } from '../core/util.js';

/*
 * Warm, all the way through — and separated by value, not by hue.
 *
 * Two goes at this. The first made everything nearly white so that no sprite
 * standing on the floor would read as a sticker, which left the walls, the
 * floor and the sky within about eight percent of one another: nothing for the
 * ink round the room to separate. The second reached for a cool harbour blue on
 * the walls for contrast, which separated them all right and did not belong to
 * this game for a second — every drawing in it, the oak, the cream, the guests,
 * is warm, and a cold wall behind warm art looks like two different games.
 *
 * So the separation is done the way an illustrator would do it. One family, and
 * the planes are told apart by how light they are: a deep warm sand on the wall
 * in shadow, a lighter one on the wall in light, cream trim above both, wood
 * below, and a floor lighter than either wall so people standing on it read
 * against it. Four clear steps of value, no second hue anywhere.
 */
const PALETTE = {
  floorA: '#fbf2e0',
  floorB: '#dcc49b',
  grout: 'rgba(122, 96, 66, 0.26)',
  border: '#fdf6e8',
  rim: '#cdb391',
  rimDark: '#a98f6d',
};

const CAFE = {
  ...PALETTE,
  wallL: '#d8c19c',
  wallR: '#ecd9b8',
  cornice: '#fbf3e2',
  corniceTop: '#fefaf0',
  base: '#a9784f',
  baseDark: '#875c3a',
  // the shade toward the inside corner, in the wall's own colour family
  shade: 'rgba(120, 88, 50, 0.15)',
  pipes: false,
};

const FACTORY = {
  ...PALETTE,
  floorA: '#f3e8d0',
  floorB: '#cfba97',
  wallL: '#cbbb9c',
  wallR: '#e2d4b8',
  cornice: '#f8f0de',
  corniceTop: '#fdf8eb',
  base: '#8d7b62',
  baseDark: '#6f6049',
  shade: 'rgba(96, 80, 52, 0.15)',
  pipes: true,
};

/**
 * How tall the back walls stand.
 *
 * It was 212, of which 30 is cornice and 26 baseboard, leaving a 156px strip of
 * plaster for a 149px window to sit in. The result was a room with almost no
 * wall in it: heavy trim top and bottom and a window wedged between them, which
 * read as a picture frame rather than a window. There is room to breathe now.
 */
const WALL_H = 268;
const BASE_H = 22;
const CORNICE_H = 30;
const THICK = 0.3;      // wall thickness, in tiles, for the top face
const RIM_H = 15;       // floor slab thickness at the front edges

/**
 * Built-in wall joinery, taken from the fixture sheets. `u` runs 0..1 along the
 * wall from the back corner and `v` is height above the floor. The art is drawn
 * for one wall each — right-wall pieces slope down-right — so left-wall
 * placements mirror a right-facing sprite.
 *
 * Sizing these is not "how tall is the file". A third of every drawing is the
 * empty triangle either side of its own slope, so what matters is the body: a
 * window is 272 tall on disk and 185 of that is glass and frame, a door is 338
 * and 263 of it is door. The wall's plaster field is 238. Work from the body
 * and the numbers fall out — a window at 0.81 stands 150 tall with a hand's
 * width of plaster above and below it, a door at 0.80 stands 210.
 *
 * The same triangle is why doors used to hover: anchoring a door's *box* to the
 * floor line leaves its threshold half a slope up in the air. #fixture drops
 * floor-anchored pieces by that amount, so `v` stays 0 and the door stands on
 * the ground.
 *
 * `u` is measured from the back corner and the sprite is centred on it, so
 * anything past about 0.72 hangs off the front end of the wall.
 */
const FIXTURES = {
  cafe: [
    { id: 'door_open_r', wall: 'right', u: 0.28, v: 0, scale: 0.80, anchor: 'floor', entry: true },
    { id: 'window_bay_r', wall: 'right', u: 0.68, v: 128, scale: 0.81 },
    { id: 'window_palm_r', wall: 'left', u: 0.32, v: 128, scale: 0.81, mirror: true },
    { id: 'window_plain_r', wall: 'left', u: 0.70, v: 128, scale: 0.79, mirror: true },
  ],
  factory: [
    { id: 'door_closed_r', wall: 'right', u: 0.68, v: 0, scale: 0.80, anchor: 'floor', entry: true },
    { id: 'window_plain_r', wall: 'right', u: 0.28, v: 128, scale: 0.79 },
    { id: 'window_plain_r', wall: 'left', u: 0.40, v: 128, scale: 0.79, mirror: true },
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
    const minX = this.W.x - 46, maxX = this.E.x + 46;
    const minY = this.N.y - WALL_H - 70, maxY = this.S.y + RIM_H + 46;
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
    this.#outline(c);
    this.cache = { cv, box, scale };
  }

  /**
   * The room's own silhouette, in one heavy line.
   *
   * This is the difference between a cartoon and a diagram. Every object in the
   * game is drawn with a thick dark edge round it — the chairs, the octopus,
   * the coffee machine — and the room they stand in had none at all: it was
   * cream panels meeting cream panels, with a thin line on a couple of the
   * internal joins. Set a 4px-inked chair on that and the chair reads as a
   * sticker on a photograph.
   *
   * So the whole outside of the room gets one continuous, heavy stroke: up the
   * far end of the left wall, over both wall tops, down the far end of the
   * right one, and round the front of the floor slab. Drawn last, over
   * everything, because a cartoon outline is on top of what it contains.
   */
  #outline(ctx) {
    const up = (p, h) => ({ x: p.x, y: p.y - h });
    const off = (p, side) => ({ x: p.x + side * HALF_W * THICK, y: p.y - HALF_H * THICK });
    const down = (p) => ({ x: p.x, y: p.y + RIM_H });

    const path = [
      this.W,                       // the left wall's open end, on the floor
      up(this.W, WALL_H),
      off(up(this.W, WALL_H), -1),  // across the wall's thickness
      off(up(this.N, WALL_H), -1),
      off(up(this.N, WALL_H), 1),   // over the back corner
      off(up(this.E, WALL_H), 1),
      up(this.E, WALL_H),
      this.E,                       // down the right wall's open end
      down(this.E),                 // and round the front of the slab
      down(this.S),
      down(this.W),
    ];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (const q of path.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
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
    g.addColorStop(0, this.pal.shade);
    g.addColorStop(0.45, 'rgba(0, 0, 0,0)');
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

    /*
     * The lines.
     *
     * Everything in this game is drawn with a heavy dark outline round it, and
     * the room was the one thing that was not: it was flat panels of colour
     * meeting flat panels of colour, with one thin 2.6px line along a couple of
     * the joins. Next to a chair with a 4px ink edge that reads as a
     * photograph somebody has stood a cartoon in front of.
     *
     * So every edge is inked, and inked thickly. The vertical at the open end
     * of each wall gets the heaviest line, because that is the silhouette — the
     * edge with nothing behind it — and a cartoon puts its weight there.
     */
    const line = (from, to, lw) => {
      ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    };
    line(a, b, 4.2);                                    // floor line
    line(up(a, BASE_H), up(b, BASE_H), 3.6);            // top of the skirting
    line(up(a, fieldTop), up(b, fieldTop), 3.6);        // under the cornice
    line(up(b, 0), up(b, topH), 4.6);                   // the open end
    line(a, up(a, topH), 3.2);                          // the back corner

    /*
     * A picture rail, two thirds up.
     *
     * A blank field of plaster the height of this one has nothing for the eye
     * to measure the room by — it could be a cupboard or a warehouse. One rail
     * across it and suddenly there is a wall with a height. It is also where a
     * real room of this period would put one, which is why it reads as a room
     * rather than as a decision.
     */
    const railH = Math.round(fieldTop * 0.66);
    quad(up(a, railH - 7), up(b, railH - 7), up(b, railH), up(a, railH), this.pal.cornice);
    line(up(a, railH), up(b, railH), 2.8);
    line(up(a, railH - 7), up(b, railH - 7), 2.2);
  }

  #wallPoint(wall, u, v) {
    const a = this.N;
    const b = wall === 'left' ? this.W : this.E;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - v };
  }

  /**
   * Set a piece of joinery into a wall — by stretching it, not by shearing it.
   *
   * The drawings are flat elevations on their own isometric, and it is not this
   * room's. They are drawn at about 30 degrees; the room is a true 2:1, which is
   * 26.57. Something has to give.
   *
   * Shearing was the obvious answer and it was the wrong one. A shear that
   * brings a 30-degree top edge down to 26.57 leaves every *vertical* in the
   * drawing leaning by the difference — three degrees on a door, nearly five on
   * a window. So the head of the door lined up beautifully with the wall while
   * both jambs quietly fell over, and every mullion in every window went with
   * them. That is the bug: not the placement, the projection.
   *
   * Widening fixes it exactly and distorts nothing. Scale a drawing
   * horizontally by k and its top edge's slope becomes slope/k, while every
   * vertical stays vertical, because a vertical has no run for the scale to act
   * on. So k = the drawing's own slope over the wall's, the head lands parallel
   * to the picture rail, and the jambs stand up. It costs a window eleven per
   * cent of its width, which nobody has ever noticed on a window.
   */
  #fixture(ctx, d) {
    const sprite = this.assets.get(this.fixtureGroup, d.id);
    if (!sprite) return;
    const p = this.#wallPoint(d.wall, d.u, d.v);
    const art = Math.abs(sprite.slope ?? 0);
    const scale = d.scale ?? 1;

    // ...and if a sprite has no usable slope on it, leave it alone rather than
    // stretch it by some number invented on the spot
    const k = art > 0.15 ? art / (HALF_H / HALF_W) : 1;

    /*
     * The empty corner, and why the doors used to hover.
     *
     * A door drawn with its threshold sloping down across the sprite leaves a
     * triangle of nothing under the low side. Half that triangle sits directly
     * beneath the middle of the door, so anchoring the sprite's *box* to the
     * floor line parks the threshold a good thirty pixels up in the air. The
     * triangle's height is the drawing's own slope across its width, so half of
     * it is what the door has to come down by.
     */
    const foot = d.anchor === 'floor' ? (sprite.fw * art * scale) / 2 : 0;

    ctx.save();
    ctx.translate(p.x, p.y + foot);
    // scaleX multiplies on top of scale in drawSprite, so this is the stretch
    // on its own and not the stretch times the size
    drawSprite(ctx, sprite, 0, 0, 0, {
      scale,
      scaleX: k,
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
    this.#wavyPath(ctx, 0.58, 9, 128);
    ctx.clip();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, y } = toScreen(c, r);
        diamond(ctx, x, y, HALF_W, HALF_H);
        ctx.fillStyle = (c + r) % 2 ? this.pal.floorA : this.pal.floorB;
        ctx.fill();
        ctx.strokeStyle = this.pal.grout;
        ctx.lineWidth = 1.9;
        ctx.stroke();
      }
    }
    ctx.restore();

    // wavy edge line + hard outline
    ctx.save();
    this.#wavyPath(ctx, 0.58, 9, 128);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
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
   *
   * It used to run nine small ripples down each edge in a pale tan line, which
   * at this zoom read as a smudge on the floor rather than as a border. One
   * scallop per floor tile, inked as heavily as everything else in the room, is
   * a mat somebody laid down on purpose.
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
    g.addColorStop(0, 'rgba(118, 92, 62,0.2)');
    g.addColorStop(1, 'rgba(118, 92, 62,0)');
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(ob.x, ob.y); ctx.lineTo(oa.x, oa.y);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  }

  /** Highlight a build tile. `tone`: 'ok' | 'bad' | 'pick'. */
  static markTile(ctx, c, r, tone = 'ok', pulse = 0) {
    const { x, y } = toScreen(c, r);
    // green means put it down, rose means you cannot, butter means this is the
    // one you have hold of
    const colors = {
      ok:   ['rgba(139, 187, 106, 0.55)', PAL.leafDeep],
      bad:  ['rgba(224, 132, 100, 0.58)', PAL.coralDeep],
      pick: ['rgba(248, 209, 103, 0.6)', PAL.sunDeep],
    }[tone] ?? ['rgba(255, 255, 255,0.4)', '#fff'];
    ctx.save();
    diamond(ctx, x, y, HALF_W - 3, HALF_H - 2);
    ctx.fillStyle = colors[0]; ctx.fill();
    // dark backing stroke keeps the dashes legible over any floor tile
    ctx.strokeStyle = 'rgba(61, 44, 28,0.5)'; ctx.lineWidth = 6; ctx.stroke();
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
    const line = { ok: PAL.leafDeep, bad: PAL.coralDeep, pick: PAL.sunDeep }[tone] ?? '#fff';
    ctx.save();
    diamond(ctx, x, y, HALF_W - 3, HALF_H - 2);
    ctx.strokeStyle = 'rgba(61, 44, 28,0.55)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = line; ctx.lineWidth = 3.5; ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -pulse * 16;
    ctx.stroke();
    ctx.restore();
  }
}
