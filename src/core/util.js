// Small shared helpers. Deliberately dependency-free.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

let seed = 0x9e3779b9;
/** Deterministic-ish float in [0,1). Cheap and good enough for sparkle jitter. */
export function rnd() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
}
export const range = (a, b) => a + rnd() * (b - a);
export const pick = (arr) => arr[(rnd() * arr.length) | 0];

let idc = 0;
export const uid = (p = 'e') => `${p}${++idc}`;

/** 1234 -> "1,234"; 21500 -> "21.5k" once past five digits. */
export function money(n) {
  n = Math.round(n);
  if (Math.abs(n) >= 100000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString('en-US');
}

/** Distance on the tile grid, measured in tiles. */
export const tileDist = (a, b) => Math.hypot(a.c - b.c, a.r - b.r);

/** Manhattan neighbours of a tile. */
export const neighbours = ({ c, r }) => [
  { c: c + 1, r }, { c: c - 1, r }, { c, r: r + 1 }, { c, r: r - 1 },
];

/**
 * Breadth-first path across a tile grid.
 * `walkable(c, r)` gates each step; the goal tile is always allowed so a
 * character can step onto the chair they are heading for.
 */
export function findPath(from, to, walkable, limit = 4000) {
  const key = (c, r) => `${c},${r}`;
  if (from.c === to.c && from.r === to.r) return [];
  const start = key(from.c, from.r);
  const goal = key(to.c, to.r);
  const prev = new Map([[start, null]]);
  const queue = [from];
  let head = 0, seen = 0;

  while (head < queue.length && seen++ < limit) {
    const cur = queue[head++];
    for (const n of neighbours(cur)) {
      const k = key(n.c, n.r);
      if (prev.has(k)) continue;
      const isGoal = k === goal;
      if (!isGoal && !walkable(n.c, n.r)) continue;
      prev.set(k, cur);
      if (isGoal) {
        const path = [];
        let node = n, pk = k;
        while (pk !== start) { path.push(node); node = prev.get(pk); pk = key(node.c, node.r); }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Tiny event bus. */
export class Bus {
  #map = new Map();
  on(evt, fn) {
    (this.#map.get(evt) ?? this.#map.set(evt, new Set()).get(evt)).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.#map.get(evt)?.delete(fn); }
  emit(evt, payload) { this.#map.get(evt)?.forEach((fn) => fn(payload)); }
}
