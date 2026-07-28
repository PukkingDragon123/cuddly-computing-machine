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
  INK, contactShadow, drawIcon, drawSprite, ring, roundRectPath, sticker, text,
} from '../gfx/paint.js';

export const MACHINE_SCALE = 0.72;
const BELT_SPEED = 1.05;        // tiles per second
const ITEM_GAP = 0.36;          // minimum spacing between items on a belt
const ITEM_SIZE = 38;
const BELT_LIFT = 15;

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
      items: [], uid: uid('m'), sq: { value: 0.45, vel: 0 }, shake: 0,
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
    m.sq = { value: 0.55, vel: 0 };
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
      return m.def.inId === ing && m.buf < m.def.inQty * 3;
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
    this.banked += 1;
    silo.took = (silo.took ?? 0) + 1;
    const s = toScreen(silo.c, silo.r);
    this.fx.sparkles(s.x, s.y - 40, 4, 14);
    this.fx.pop(s.x, s.y - 66, `+1`, { color: '#4d7a34', stroke: '#fff8e6', size: 15, rise: 34, max: 0.6 });
    silo.sq = silo.sq ?? { value: 1, vel: 0 };
    silo.sq.vel -= 5;
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
      if (m.sq) spring(m.sq, 1, dt, 210, 18);
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

  #emit(m, target) {
    this.#handOff(target, m.def.out);
    m.sq = m.sq ?? { value: 1, vel: 0 };
    m.sq.vel -= 5;
    m.shake = 0.2;
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
      if (runs <= 0) { m.buf = Math.min(m.def.inQty * 3, m.buf + supplied); continue; }
      m.buf = Math.min(m.def.inQty * 3, supplied + m.buf - runs * m.def.inQty);
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

  #belt(ctx, m) {
    const s = toScreen(m.c, m.r);
    const v = dirVec(m.dir);
    const len = Math.hypot(v.x, v.y);
    const ang = Math.atan2(v.y, v.x);
    const w = 46;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    // frame
    roundRectPath(ctx, -len / 2 - 4, -w / 2, len + 8, w, 12);
    ctx.fillStyle = '#3f6f6a'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    // running surface
    roundRectPath(ctx, -len / 2 - 1, -w / 2 + 6, len + 2, w - 12, 7);
    ctx.fillStyle = '#5a908a'; ctx.fill();
    // scrolling chevrons
    ctx.save();
    roundRectPath(ctx, -len / 2 - 1, -w / 2 + 6, len + 2, w - 12, 7);
    ctx.clip();
    const scroll = (this.game.time * BELT_SPEED * this.state.factorySpeed * len) % 26;
    ctx.strokeStyle = 'rgba(233,244,236,0.7)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let x = -len / 2 - 26 + scroll; x < len / 2 + 26; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x - 6, -8); ctx.lineTo(x + 4, 0); ctx.lineTo(x - 6, 8);
      ctx.stroke();
    }
    ctx.restore();
    // rollers
    ctx.fillStyle = '#e0b268';
    for (const e of [-len / 2 - 1, len / 2 + 1]) {
      roundRectPath(ctx, e - 3.5, -w / 2 + 3, 7, w - 6, 3.5);
      ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    if (m.blocked) {
      const bob = Math.sin(this.game.time * 7) * 2;
      sticker(ctx, s.x - 12, s.y - 46 + bob, 24, 22, { r: 8, fill: '#f6cfc2', lift: 3 });
      text(ctx, '!', s.x, s.y - 35 + bob, { size: 15, fill: '#b8481c' });
    }
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
              contactShadow(ctx, x, y + BELT_LIFT - 2, 13, 0, 0.2);
              drawIcon(ctx, sprite, x, y + Math.sin(t * 6 + it.bob) * 1.6, ITEM_SIZE);
            },
          });
        }
        continue;
      }

      const isSel = this.selection === m;
      if (m.kind === 'silo') {
        const sprite = this.assets.get('furniture', SILO.sprite);
        const sq = m.sq?.value ?? 1;
        list.push({
          d: depthOf(m.c, m.r),
          fn: () => {
            contactShadow(ctx, s.x, s.y + HALF_H * 0.34, 40, 0, 0.2);
            drawSprite(ctx, sprite, 0, s.x, s.y + HALF_H * 0.42, {
              scale: MACHINE_SCALE, scaleY: sq, scaleX: 2 - sq,
              glow: isSel ? '#f8d167' : null, glowWidth: 3.5,
            });
          },
        });
        continue;
      }

      if (!m.def) continue;
      const sprite = this.assets.get('machines', m.def.sprite);
      const sq = m.sq?.value ?? 1;
      const jitter = m.shake > 0 ? Math.sin(t * 60) * m.shake * 8 : 0;
      const running = m.def.kind === 'producer' ? !m.blocked : m.buf >= m.def.inQty && !m.blocked;
      const hum = running ? Math.sin(t * 9 + m.c) * 0.8 : 0;
      list.push({
        d: depthOf(m.c, m.r),
        fn: () => {
          contactShadow(ctx, s.x, s.y + HALF_H * 0.34, 44, 0, 0.22);
          drawSprite(ctx, sprite, 0, s.x + jitter, s.y + HALF_H * 0.42 + hum, {
            scale: MACHINE_SCALE, scaleY: sq, scaleX: 2 - sq,
            glow: isSel ? '#f8d167' : null, glowWidth: 3.5,
          });
        },
      });
    }
  }

  /** Progress rings, buffers and jam warnings. */
  drawOverlays(ctx, t) {
    for (const m of this.grid.values()) {
      if (m.kind === 'belt') continue;
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
      ? this.assets.get('furniture', SILO.sprite)
      : this.assets.get('machines', MACHINE_BY_ID[g.id]?.sprite);
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha = 0.72;
    drawSprite(ctx, sprite, 0, s.x, s.y + HALF_H * 0.42, {
      scale: MACHINE_SCALE,
      scaleY: 1 + Math.sin(t * 6) * 0.03,
      glow: g.ok ? '#8bbb6a' : '#e4652f', glowWidth: 3,
    });
    ctx.restore();
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
      if (m.kind === 'silo' || m.kind === 'belt') continue;
      if (!this.outTile(m)) n++;
    }
    return n;
  }

  drawHints(ctx, t) {
    for (const m of this.grid.values()) {
      if (m.kind === 'silo' || m.kind === 'belt') continue;
      if (this.outTile(m)) continue;
      const d = DIRS[m.dir];
      Room.markTile(ctx, m.c + d.dc, m.r + d.dr, 'pick', t);
    }
  }

  bounds() { return this.room.bounds(); }
}
