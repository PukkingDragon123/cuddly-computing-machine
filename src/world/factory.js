// The works: producer machines, conveyor belts, refiners, and the pantry
// intake that banks whatever reaches it.
//
// Belts are drawn procedurally so they can point any of four ways and tile
// seamlessly; everything on them is a real ingredient sprite riding along.

import { HALF_H, HALF_W, depthOf, tileAt, toScreen } from './iso.js';
import { Room } from './room.js';
import { Fx } from '../gfx/fx.js';
import { clamp, rnd, uid } from '../core/util.js';
import { spring } from '../core/tween.js';
import {
  BELT, MACHINE_BY_ID, MACHINE_MAX_LEVEL, SILO,
  machineInterval, machineUpgradeCost,
} from '../data/catalog.js';
import {
  INK, blueprint, contactShadow, drawIcon, drawSprite, ring, squash, sticker, text,
} from '../gfx/paint.js';

export const MACHINE_SCALE = 0.72;
const BELT_SPEED = 1.05;        // tiles per second
const ITEM_GAP = 0.36;          // minimum spacing between items on a belt
const ITEM_SIZE = 38;
const BELT_LIFT = 13;           // how high items ride above the deck
const BELT_HALF = 0.34;         // deck half-width, in tiles
const BELT_RISE = 10;           // slab thickness, px

/** Direction index -> tile step. */
export const DIRS = [
  { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 0, dr: -1 },
];
export const DIR_NAMES = ['↘', '↙', '↖', '↗'];

/** Screen offset of one step in a direction. */
function dirVec(d) {
  const { dc, dr } = DIRS[d];
  return { x: (dc - dr) * HALF_W, y: (dc + dr) * HALF_H };
}

/** One tile step along each grid axis, in screen pixels. */
const STEP_C = { x: HALF_W, y: HALF_H };
const STEP_R = { x: -HALF_W, y: HALF_H };
const neg = (v) => ({ x: -v.x, y: -v.y });

/**
 * Along- and across-belt axes for a direction, both in screen pixels. Building
 * belt corners from these keeps every edge parallel to the grid.
 */
function beltAxes(d) {
  const along = [STEP_C, STEP_R, neg(STEP_C), neg(STEP_R)][d];
  const across = (d === 0 || d === 2) ? STEP_R : STEP_C;
  return { along, across };
}

export class Factory {
  constructor(game) {
    this.game = game;
    this.assets = game.assets;
    this.state = game.state;
    this.fx = new Fx();   // each zone keeps its own particles
    this.sfx = game.sfx;

    this.cols = 10;
    this.rows = 10;
    this.room = new Room(this.assets, { kind: 'factory', cols: this.cols, rows: this.rows });

    this.grid = new Map();
    this.ghost = null;           // { kind, id, dir, c, r, ok } | { kind:'erase' }
    this.selection = null;
    this.painting = false;
    this.paintPrev = null;
    this.banked = 0;             // ingredients delivered this session
    this.rebuild();
  }

  key(c, r) { return `${c},${r}`; }
  at(c, r) { return this.grid.get(this.key(c, r)) ?? null; }

  rebuild() {
    this.grid.clear();
    for (const m of this.state.machines) {
      m.uid ??= uid('m');
      m.dir ??= 0;
      m.level ??= 1;
      m.t ??= 0;
      m.buf ??= 0;
      m.items ??= [];
      m.shake ??= 0;
      m.blocked = false;
      if (m.kind === 'machine') m.def = MACHINE_BY_ID[m.id];
      this.grid.set(this.key(m.c, m.r), m);
    }
  }

  /* ------------------------------------------------------------- placement */

  beginPlace(kind, id) {
    this.ghost = { kind, id, dir: 0, c: null, r: null, ok: false, t: 0 };
    this.selection = null;
  }

  beginErase() { this.ghost = { kind: 'erase', c: null, r: null, ok: false, t: 0 }; }
  cancelPlace() { this.ghost = null; this.painting = false; this.paintPrev = null; }
  rotateGhost() { if (this.ghost) this.ghost.dir = (this.ghost.dir + 1) % 4; }

  moveGhost(world) {
    if (!this.ghost) return;
    const t = tileAt(world.x, world.y);
    this.ghost.c = t.c;
    this.ghost.r = t.r;
    this.ghost.ok = this.ghost.kind === 'erase'
      ? !!this.at(t.c, t.r)
      : this.canPlace(t.c, t.r);
  }

  canPlace(c, r) { return this.room.inside(c, r) && !this.grid.has(this.key(c, r)); }

  costOfGhost() {
    const g = this.ghost;
    if (!g) return 0;
    if (g.kind === 'belt') return BELT.cost;
    if (g.kind === 'silo') return SILO.cost;
    return MACHINE_BY_ID[g.id]?.cost ?? 0;
  }

  /** Place whatever the ghost is holding. Returns a hint on failure. */
  commit(c, r, dir = this.ghost?.dir ?? 0) {
    const g = this.ghost;
    if (!g) return 'nothing';
    if (!this.canPlace(c, r)) return 'taken';
    const cost = this.costOfGhost();
    if (!this.state.spend(cost)) return 'broke';

    const rec = {
      c, r, kind: g.kind, id: g.id ?? g.kind, dir, level: 1, t: 0, buf: 0,
      items: [], uid: uid('m'), sq: { value: 0.84, vel: 0 }, shake: 0,
    };
    if (g.kind === 'machine') rec.def = MACHINE_BY_ID[g.id];
    this.state.machines.push(rec);
    this.rebuild();

    const s = toScreen(c, r);
    this.fx.puff(s.x, s.y + 4, 5, 12);
    this.sfx.play(g.kind === 'belt' ? 'build' : 'place');
    if (g.kind !== 'belt') this.fx.kick(3);
    this.state.save();
    return null;
  }

  /** Drag-paint belts, pointing each new belt at the next tile. */
  paint(world) {
    const g = this.ghost;
    if (!g) return;
    const t = tileAt(world.x, world.y);
    if (this.paintPrev && this.paintPrev.c === t.c && this.paintPrev.r === t.r) return;

    if (g.kind === 'erase') {
      this.erase(t.c, t.r);
      this.paintPrev = { ...t };
      return;
    }
    if (g.kind !== 'belt') return;

    let dir = g.dir;
    const prev = this.paintPrev;
    if (prev) {
      const dc = t.c - prev.c, dr = t.r - prev.r;
      const found = DIRS.findIndex((d) => d.dc === Math.sign(dc) && d.dr === Math.sign(dr));
      // only accept single-tile orthogonal steps; diagonals would skip a tile
      if (found >= 0 && Math.abs(dc) + Math.abs(dr) === 1) {
        dir = found;
        const before = this.at(prev.c, prev.r);
        if (before?.kind === 'belt') before.dir = found;
      }
    }
    if (this.canPlace(t.c, t.r)) {
      if (this.commit(t.c, t.r, dir)) return;   // out of money or blocked
      this.ghost.dir = dir;
    }
    this.paintPrev = { ...t };
  }

  erase(c, r) {
    const m = this.at(c, r);
    if (!m) return false;
    const i = this.state.machines.indexOf(m);
    if (i < 0) return false;
    const base = m.kind === 'belt' ? BELT.cost : m.kind === 'silo' ? SILO.cost : (m.def?.cost ?? 0);
    this.state.machines.splice(i, 1);
    this.rebuild();
    this.state.earn(Math.round(base * 0.5));
    const s = toScreen(c, r);
    this.fx.puff(s.x, s.y, 5, 12);
    this.sfx.play('pop');
    this.state.save();
    return true;
  }

  upgrade(m) {
    if (m.kind !== 'machine' || m.level >= MACHINE_MAX_LEVEL) return false;
    const cost = machineUpgradeCost(m.def, m.level);
    if (!this.state.spend(cost)) return false;
    m.level += 1;
    m.sq = { value: 0.86, vel: 0 };
    const s = toScreen(m.c, m.r);
    this.fx.stars(s.x, s.y - 60, 7);
    this.sfx.play('star');
    this.state.save();
    return true;
  }

  /* ------------------------------------------------------------ simulation */

  /** Can this tile take an item of `ing` arriving from outside? */
  #accepts(m, ing) {
    if (!m) return false;
    if (m.kind === 'belt') return !m.items.some((it) => it.p < ITEM_GAP);
    if (m.kind === 'silo') return true;
    if (m.kind === 'machine' && m.def?.kind === 'processor') {
      return m.def.inId === ing && m.buf < m.def.inQty * this.state.bufferSize;
    }
    return false;
  }

  #handOff(m, ing) {
    if (m.kind === 'belt') { m.items.push({ ing, p: 0, bob: rnd() * 6 }); return true; }
    if (m.kind === 'silo') { this.#bank(m, ing); return true; }
    if (m.kind === 'machine' && m.def?.kind === 'processor') { m.buf += 1; m.shake = 0.18; return true; }
    return false;
  }

  #bank(silo, ing) {
    this.state.addIng(ing, 1);
    this.state.stats.delivered = (this.state.stats.delivered ?? 0) + 1;
    this.banked += 1;
    silo.took = (silo.took ?? 0) + 1;
    const s = toScreen(silo.c, silo.r);
    this.fx.sparkles(s.x, s.y - 40, 4, 14);
    this.fx.pop(s.x, s.y - 66, `+1`, { color: '#4d7a34', stroke: '#fff8e6', size: 15, rise: 34, max: 0.6 });
    silo.sq = silo.sq ?? { value: 1, vel: 0 };
    silo.sq.vel -= 2.2;
    if (this.game.zone === this) this.sfx.play('belt');
  }

  /** Neighbour tile a machine or belt outputs into. */
  outTile(m) {
    const d = DIRS[m.dir ?? 0];
    return this.at(m.c + d.dc, m.r + d.dr);
  }

  update(dt) {
    const speed = this.state.factorySpeed;
    if (this.ghost) this.ghost.t += dt;

    for (const m of this.grid.values()) {
      if (m.sq) spring(m.sq, 1, dt, 170, 16);
      if (m.shake > 0) m.shake = Math.max(0, m.shake - dt);
    }

    // belts first, so machines can push into freshly vacated space
    for (const m of this.grid.values()) {
      if (m.kind !== 'belt') continue;
      m.items.sort((a, b) => b.p - a.p);
      const next = this.outTile(m);
      for (let i = 0; i < m.items.length; i++) {
        const it = m.items[i];
        const ahead = i > 0 ? m.items[i - 1].p - ITEM_GAP : Infinity;
        it.p = Math.min(it.p + BELT_SPEED * dt * speed, ahead);
        if (it.p >= 1) {
          if (next && this.#accepts(next, it.ing) && this.#handOff(next, it.ing)) {
            m.items.splice(i, 1);
            i--;
          } else {
            it.p = 1;
          }
        }
      }
      m.blocked = m.items.some((it) => it.p >= 1);
    }

    for (const m of this.grid.values()) {
      if (m.kind !== 'machine' || !m.def) continue;
      const interval = machineInterval(m.def, m.level, speed);

      // the promo stand and the computer make nothing a belt can carry, so
      // they tick on their own and hand straight to the save file
      if (m.def.kind === 'promo' || m.def.kind === 'lab' || m.def.kind === 'clay') {
        m.t += dt;
        if (m.t >= m.def.interval) { m.t = 0; this.#workshopTick(m); }
        m.blocked = false;
        continue;
      }

      // the kiln, the wheel and the glaze kiln run on no clock at all: one is a
      // place you tap, the others are perks that only have to exist
      if (m.def.kind === 'kiln' || m.def.kind === 'wheel' || m.def.kind === 'glaze') {
        m.blocked = false;
        continue;
      }

      const target = this.outTile(m);
      const canPush = target && this.#accepts(target, m.def.out);

      if (m.def.kind === 'producer') {
        m.t += dt;
        if (m.t >= interval) {
          if (canPush) {
            m.t = 0;
            this.#emit(m, target);
          } else { m.t = interval; m.blocked = true; }
        } else m.blocked = false;
      } else {
        const ready = m.buf >= m.def.inQty;
        if (!ready) { m.blocked = false; m.t = Math.min(m.t, 0); continue; }
        m.t += dt;
        if (m.t >= interval) {
          if (canPush) {
            m.t = 0;
            m.buf -= m.def.inQty;
            this.#emit(m, target);
          } else { m.t = interval; m.blocked = true; }
        } else m.blocked = false;
      }
    }
  }

  /** A promo stand pastes a poster, a computer banks a point, a press digs clay. */
  #workshopTick(m) {
    const s = toScreen(m.c, m.r);
    const n = m.def.out ?? 1;
    if (m.def.kind === 'promo') {
      if (!this.state.addPoster()) return;
      this.fx.pop(s.x, s.y - 60, 'Poster!', { color: '#e4652f', size: 15, rise: 30, max: 0.8 });
    } else if (m.def.kind === 'clay') {
      this.state.addClay(n);
      this.fx.pop(s.x, s.y - 60, `+${n} clay`, { color: '#8a6647', size: 15, rise: 30, max: 0.8 });
      this.fx.puff(s.x, s.y - 30, 3, 10);
    } else {
      this.state.addResearch(n);
      this.fx.pop(s.x, s.y - 60, `+${n} rp`, { color: '#4a8cb0', size: 15, rise: 30, max: 0.8 });
    }
    m.sq = m.sq ?? { value: 1, vel: 0 };
    m.sq.vel -= 2;
  }

  #emit(m, target) {
    this.#handOff(target, m.def.out);
    m.sq = m.sq ?? { value: 1, vel: 0 };
    m.sq.vel -= 2.2;
    m.shake = 0.14;
    const s = toScreen(m.c, m.r);
    const sprite = this.assets.get('ingredients', m.def.out);
    const d = DIRS[m.dir];
    this.fx.spit(s.x, s.y - 34, sprite, d.dc - d.dr > 0 ? 1 : -1);
    if (this.game.zone === this) this.sfx.play('machine');
  }

  /**
   * Follow a machine's belt line and report where its output ends up:
   * `{ kind: 'pantry' }`, `{ kind: 'processor', machine }`, or null if the line
   * goes nowhere. Belts pass straight through; a refiner is a terminus for
   * whatever feeds it.
   */
  #chainEnd(m, hops = 60) {
    const seen = new Set();
    let node = this.outTile(m);
    while (node && hops-- > 0) {
      if (node.kind === 'silo') return { kind: 'pantry' };
      if (node.kind === 'machine' && node.def?.kind === 'processor') {
        return { kind: 'processor', machine: node };
      }
      if (node.kind !== 'belt') return null;
      const k = this.key(node.c, node.r);
      if (seen.has(k)) return null;     // a loop goes nowhere
      seen.add(k);
      node = this.outTile(node);
    }
    return null;
  }

  /**
   * Credit away-time production. Belts aren't simulated across a closed tab, so
   * this walks each line instead: producers that reach the pantry bank their
   * output, producers that feed a refiner top up that refiner's input pool, and
   * refiners convert what they were fed. Lines that end nowhere pay nothing.
   */
  offlineTick(seconds) {
    const speed = this.state.factorySpeed;
    const banked = {};
    const feed = new Map();     // processor record -> units of its input

    // the computer and the promo stand need no line, so they simply run
    for (const m of this.grid.values()) {
      if (m.kind !== 'machine') continue;
      const runs = Math.floor(seconds / (m.def?.interval ?? Infinity));
      if (runs <= 0) continue;
      if (m.def.kind === 'lab') this.state.addResearch(runs * (m.def.out ?? 1));
      else if (m.def.kind === 'clay') this.state.addClay(runs * (m.def.out ?? 1));
      else if (m.def.kind === 'promo') for (let i = 0; i < runs; i++) this.state.addPoster();
    }

    const runsIn = (m) => Math.floor(seconds / machineInterval(m.def, m.level, speed));

    for (const m of this.grid.values()) {
      if (m.kind !== 'machine' || m.def?.kind !== 'producer') continue;
      const n = runsIn(m);
      if (n <= 0) continue;
      const end = this.#chainEnd(m);
      if (!end) continue;
      if (end.kind === 'pantry') banked[m.def.out] = (banked[m.def.out] ?? 0) + n;
      else if (end.machine.def.inId === m.def.out) {
        feed.set(end.machine, (feed.get(end.machine) ?? 0) + n);
      }
    }

    for (const [m, supplied] of feed) {
      if (this.#chainEnd(m)?.kind !== 'pantry') continue;
      const runs = Math.min(runsIn(m), Math.floor((supplied + m.buf) / m.def.inQty));
      if (runs <= 0) { m.buf = Math.min(m.def.inQty * this.state.bufferSize, m.buf + supplied); continue; }
      m.buf = Math.min(m.def.inQty * this.state.bufferSize, supplied + m.buf - runs * m.def.inQty);
      banked[m.def.out] = (banked[m.def.out] ?? 0) + runs;
    }

    for (const [id, n] of Object.entries(banked)) this.state.addIng(id, n);
    if (Object.keys(banked).length) this.state.save();
    return banked;
  }

  /** Live output estimate, items per minute, for the UI. */
  throughput() {
    const out = {};
    for (const m of this.grid.values()) {
      if (m.kind !== 'machine' || !m.def) continue;
      const per = 60 / machineInterval(m.def, m.level, this.state.factorySpeed);
      out[m.def.out] = (out[m.def.out] ?? 0) + per;
    }
    return out;
  }

  /* ------------------------------------------------------------------ taps */

  tap(world) {
    const t = tileAt(world.x, world.y);
    if (this.ghost) {
      if (this.ghost.kind === 'erase') {
        if (!this.erase(t.c, t.r)) { this.sfx.play('no'); return 'Nothing there'; }
        return null;
      }
      const err = this.commit(t.c, t.r);
      if (err === 'taken') { this.sfx.play('no'); return 'That tile is taken'; }
      if (err === 'broke') { this.sfx.play('no'); return 'Not enough sand dollars'; }
      return null;
    }
    const m = this.at(t.c, t.r);
    if (m) {
      // Some machines are places rather than things to tune. The kiln is where
      // the pottery class happens and the computer is where the research is
      // spent, so tapping either opens its board — which is the whole reason
      // they earn a floor tile instead of a menu entry.
      const opens = { kiln: () => this.game.openPottery(), lab: () => this.game.openResearch() };
      const open = opens[m.def?.kind];
      if (open) {
        this.selection = m;
        this.sfx.play('select');
        open();
        return null;
      }
      this.selection = m;
      this.sfx.play('tap');
      this.game.openMachine(m);
      return null;
    }
    this.selection = null;
    return null;
  }

  /* ------------------------------------------------------------------ draw */

  /** Belts live on the floor, under the machines. */
  drawFloorItems(ctx) {
    for (const m of this.grid.values()) {
      if (m.kind !== 'belt') continue;
      this.#belt(ctx, m);
    }
  }

  /**
   * A belt tile as a squared-off isometric slab.
   *
   * Corners are built from the tile basis rather than a rotated rounded rect, so
   * every edge runs along the grid and consecutive belts share their edges
   * exactly — a straight run reads as one continuous track instead of a string
   * of lozenges. Rollers only appear where the track actually starts or stops.
   */
  #belt(ctx, m) {
    const s = toScreen(m.c, m.r);
    const { along, across } = beltAxes(m.dir);
    // (a, c) are tile-space: a runs along the belt, c across it
    const P = (a, c, dy = 0) => ({
      x: s.x + along.x * a + across.x * c,
      y: s.y + along.y * a + across.y * c + dy,
    });
    const fill = (pts, color) => {
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    const line = (...pts) => {
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    };

    const H = BELT_HALF;
    const step = DIRS[m.dir];
    const feeder = this.at(m.c - step.dc, m.r - step.dr);
    // an end is "open" unless another belt continues the run through it, and
    // only open ends get an outline or a roller — otherwise every tile boundary
    // draws a seam and a straight run looks like a chain of separate pieces
    const openIn = !(feeder?.kind === 'belt' && this.outTile(feeder) === m);
    const openOut = this.outTile(m)?.kind !== 'belt';

    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;

    // front skirt gives the slab its thickness; +c is the camera-facing edge
    const fl = P(-0.5, H), fr = P(0.5, H);
    fill([fl, fr, { x: fr.x, y: fr.y + BELT_RISE }, { x: fl.x, y: fl.y + BELT_RISE }], '#2c5450');
    fill([P(-0.5, -H), P(0.5, -H), fr, fl], '#3a6a65');

    // running surface: inset across the belt only, full length along it
    const inset = H * 0.64;
    fill([P(-0.5, -inset), P(0.5, -inset), P(0.5, inset), P(-0.5, inset)], '#5f978f');

    // scrolling arrows, stretched well along the run so they read as chevrons
    // and not right angles under the isometric skew
    ctx.save();
    ctx.beginPath();
    [P(-0.5, -inset), P(0.5, -inset), P(0.5, inset), P(-0.5, inset)]
      .forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.clip();
    const period = 0.6;
    const scroll = (this.game.time * BELT_SPEED * this.state.factorySpeed) % period;
    ctx.strokeStyle = 'rgba(240,250,242,0.82)';
    ctx.lineWidth = 4.5;
    for (let a = -0.5 - period + scroll; a < 0.5 + period; a += period) {
      const spread = inset * 0.72;
      line(P(a - 0.2, -spread), P(a + 0.12, 0), P(a - 0.2, spread));
    }
    ctx.restore();

    // outline: long rails always, cross edges only where the run stops
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    line(P(-0.5, -H), P(0.5, -H));
    line(fl, fr);
    line({ x: fl.x, y: fl.y + BELT_RISE }, { x: fr.x, y: fr.y + BELT_RISE });
    for (const [open, a] of [[openIn, -0.5], [openOut, 0.5]]) {
      if (!open) continue;
      const e = P(a, H);
      line(P(a, -H), e);
      line(e, { x: e.x, y: e.y + BELT_RISE });
      const roller = a < 0 ? -0.45 : 0.45;
      fill([P(roller - 0.05, -H), P(roller + 0.05, -H), P(roller + 0.05, H), P(roller - 0.05, H)], '#e0b268');
      line(P(roller - 0.05, -H), P(roller - 0.05, H));
      line(P(roller + 0.05, -H), P(roller + 0.05, H));
    }
    // the back corner post only shows where the run starts
    if (openIn) line(P(-0.5, -H), P(-0.5, H));

    ctx.restore();
  }

  collect(ctx, list, t) {
    for (const m of this.grid.values()) {
      const s = toScreen(m.c, m.r);

      if (m.kind === 'belt') {
        for (const it of m.items) {
          const v = dirVec(m.dir);
          const x = s.x + v.x * (it.p - 0.5);
          const y = s.y + v.y * (it.p - 0.5) - BELT_LIFT;
          const sprite = this.assets.get('ingredients', it.ing);
          list.push({
            d: depthOf(m.c, m.r, 30 + it.p * 8),
            fn: () => {
              contactShadow(ctx, x, y + BELT_LIFT - 3, 11, 0, 0.13);
              drawIcon(ctx, sprite, x, y + Math.sin(t * 6 + it.bob) * 1.6, ITEM_SIZE);
            },
          });
        }
        continue;
      }

      const isSel = this.selection === m;
      if (m.kind === 'silo') {
        const sprite = this.assets.get(SILO.group, SILO.sprite);
        const sq = m.sq?.value ?? 1;
        list.push({
          d: depthOf(m.c, m.r),
          fn: () => {
            const { sx, sy } = squash(sq);
            drawSprite(ctx, sprite, 0, s.x, s.y + HALF_H * 0.42, {
              scale: MACHINE_SCALE, scaleX: sx, scaleY: sy,
            });
            if (isSel) Room.outlineTile(ctx, m.c, m.r, 'pick', t);
          },
        });
        continue;
      }

      if (!m.def) continue;
      const sprite = this.assets.get('machines', m.def.sprite);
      const sq = m.sq?.value ?? 1;
      const jitter = m.shake > 0 ? Math.sin(t * 60) * m.shake * 8 : 0;
      const running = m.def.kind === 'producer' || m.def.kind === 'promo' || m.def.kind === 'lab'
        ? !m.blocked
        : m.buf >= m.def.inQty && !m.blocked;
      const hum = running ? Math.sin(t * 9 + m.c) * 0.8 : 0;
      list.push({
        d: depthOf(m.c, m.r),
        fn: () => {
          const { sx, sy } = squash(sq);
          drawSprite(ctx, sprite, 0, s.x + jitter, s.y + HALF_H * 0.42 + hum, {
            scale: MACHINE_SCALE, scaleX: sx, scaleY: sy,
            glow: isSel ? '#f8d167' : null, glowWidth: 3.5,
          });
        },
      });
    }
  }

  /** Progress rings, buffers and jam warnings. */
  drawOverlays(ctx, t) {
    for (const m of this.grid.values()) {
      if (m.kind === 'belt') {
        if (!m.blocked) continue;
        const s = toScreen(m.c, m.r);
        const bob = Math.sin(t * 7) * 2;
        sticker(ctx, s.x - 12, s.y - 52 + bob, 24, 22, { r: 8, fill: '#f6cfc2', lift: 3 });
        text(ctx, '!', s.x, s.y - 41 + bob, { size: 15, fill: '#b8481c' });
        continue;
      }
      const s = toScreen(m.c, m.r);

      if (m.kind === 'silo') {
        // compact running total; the full word only when you tap it, so a row of
        // intakes doesn't turn into a wall of labels
        const named = this.selection === m;
        const label = named ? `Pantry ${m.took ?? 0}` : `↓ ${m.took ?? 0}`;
        const w = named ? 92 : 46;
        sticker(ctx, s.x - w / 2, s.y - 152, w, 25, { r: 9, fill: '#f8ecd4', lift: 3 });
        text(ctx, label, s.x, s.y - 139, { size: 13, fill: '#6e4a30' });
        continue;
      }
      if (!m.def) continue;

      const interval = machineInterval(m.def, m.level, this.state.factorySpeed);
      const pct = m.def.kind === 'producer'
        ? clamp(m.t / interval, 0, 1)
        : (m.buf >= m.def.inQty ? clamp(m.t / interval, 0, 1) : 0);
      const y = s.y - 142;
      const out = this.assets.get('ingredients', m.def.out);
      if (out) drawIcon(ctx, out, s.x, y, 30);
      ring(ctx, s.x, y, 22, pct, { lw: 4, fill: m.blocked ? '#e4652f' : '#8bbb6a' });

      // level pips
      for (let i = 0; i < m.level; i++) {
        ctx.beginPath();
        ctx.arc(s.x - (m.level - 1) * 5 + i * 10, y + 32, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#f8d167'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
      }

      if (m.def.kind === 'processor') {
        const need = m.def.inQty;
        const inSprite = this.assets.get('ingredients', m.def.inId);
        sticker(ctx, s.x + 24, y - 12, 46, 24, { r: 9, fill: '#f8ecd4', lift: 3 });
        if (inSprite) drawIcon(ctx, inSprite, s.x + 36, y, 18);
        text(ctx, `${m.buf}/${need}`, s.x + 54, y, { size: 12, fill: '#6e4a30' });
      }

      if (m.blocked) {
        const bob = Math.sin(t * 7) * 2;
        sticker(ctx, s.x - 40, y - 42 + bob, 80, 26, { r: 9, fill: '#f6cfc2', lift: 3 });
        text(ctx, 'Backed up', s.x, y - 28 + bob, { size: 12.5, fill: '#b8481c' });
      }
    }
  }

  drawBuildLayer(ctx, t) {
    const g = this.ghost;
    if (!g || g.c === null) return;
    if (g.kind === 'erase') {
      Room.markTile(ctx, g.c, g.r, g.ok ? 'bad' : 'pick', t);
      return;
    }
    Room.markTile(ctx, g.c, g.r, g.ok ? 'ok' : 'bad', t);
    const s = toScreen(g.c, g.r);

    if (g.kind === 'belt') {
      ctx.save(); ctx.globalAlpha = 0.75;
      this.#belt(ctx, { c: g.c, r: g.r, dir: g.dir, items: [], blocked: false });
      ctx.restore();
      this.#arrow(ctx, s, g.dir, '#5f8f3f');
      return;
    }
    const sprite = g.kind === 'silo'
      ? this.assets.get(SILO.group, SILO.sprite)
      : this.assets.get('machines', MACHINE_BY_ID[g.id]?.sprite);
    if (!sprite) return;
    blueprint(ctx, sprite, 0, s.x, s.y + HALF_H * 0.42, {
      scale: MACHINE_SCALE,
      scaleY: 1 + Math.sin(t * 6) * 0.02,
      ok: g.ok,
    });
    Room.outlineTile(ctx, g.c, g.r, g.ok ? 'ok' : 'bad', t);
    if (g.kind !== 'silo') this.#arrow(ctx, s, g.dir, g.ok ? '#5f8f3f' : '#b8481c');
  }

  /** Output-direction arrow on the tile a machine feeds. */
  #arrow(ctx, s, dir, color) {
    const v = dirVec(dir);
    const tip = { x: s.x + v.x * 0.72, y: s.y + v.y * 0.72 };
    const base = { x: s.x + v.x * 0.22, y: s.y + v.y * 0.22 };
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    const ang = Math.atan2(v.y, v.x);
    ctx.translate(tip.x, tip.y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(3, 0); ctx.lineTo(-9, 7); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.restore();
  }

  /** Machines with nowhere to send their output, so the UI can nag. */
  danglingCount() {
    let n = 0;
    for (const m of this.grid.values()) {
      if (m.kind === 'silo' || m.kind === 'belt' || !this.#needsLine(m)) continue;
      if (!this.outTile(m)) n++;
    }
    return n;
  }

  /** Only producers and refiners have anything a belt could carry. */
  #needsLine(m) {
    return m.kind === 'machine'
      && (m.def?.kind === 'producer' || m.def?.kind === 'processor');
  }

  drawHints(ctx, t) {
    for (const m of this.grid.values()) {
      if (m.kind === 'silo' || m.kind === 'belt' || !this.#needsLine(m)) continue;
      if (this.outTile(m)) continue;
      const d = DIRS[m.dir];
      Room.markTile(ctx, m.c + d.dc, m.r + d.dr, 'pick', t);
    }
  }

  bounds() { return this.room.bounds(); }
}
