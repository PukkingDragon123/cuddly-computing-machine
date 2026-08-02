// Loads assets/atlas.json and every PNG it references.

const BASE = 'assets/';

/**
 * Resolves to null rather than throwing when a sprite is missing. One art file
 * that failed to reach the browser — a stale CDN copy, a flaky connection —
 * used to take the whole boot down with it, which is a poor trade for a chair
 * that would simply not be drawn.
 */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * A drawable sprite. Character strips carry `frames`/`fw`/`fh` so the renderer
 * can pick idle / walk / eat without a second lookup.
 */
class Sprite {
  constructor(entry, img) {
    this.id = entry.id;
    this.name = entry.name ?? null;
    this.img = img;
    this.frames = entry.frames ?? null;
    this.fw = entry.fw ?? img.naturalWidth;
    this.fh = entry.fh ?? img.naturalHeight;
    this.count = entry.frames ? entry.frames.length : 1;
    // slope of the drawing's own top edge, for joinery laid onto a sheared wall
    this.slope = entry.slope ?? 0;
    this.meta = entry;
  }
  /** Source rect for a frame index or a named frame ("idle" / "walk" / "eat"). */
  rect(frame = 0) {
    let i = frame;
    if (typeof frame === 'string') {
      i = this.frames ? this.frames.indexOf(frame) : 0;
      if (i < 0) i = 0;
    }
    i = Math.max(0, Math.min(this.count - 1, i | 0));
    return { sx: i * this.fw, sy: 0, sw: this.fw, sh: this.fh };
  }
}

export class Assets {
  constructor(atlas, sprites) {
    this.atlas = atlas;
    this.groups = sprites;
  }
  /** Sprite by group + id, or null. */
  get(group, id) { return this.groups[group]?.get(id) ?? null; }
  /** Every sprite in a group, in atlas order. */
  list(group) { return [...(this.groups[group]?.values() ?? [])]; }
  /** Data URL-free path, handy for CSS background-image in the DOM UI. */
  url(group, id) {
    const s = this.get(group, id);
    return s ? s.img.src : '';
  }

  /** Frames in a sprite's strip — the DOM UI shows only the first one. */
  frameCount(group, id) { return this.get(group, id)?.count ?? 1; }
}

export async function loadAssets(onProgress = () => {}) {
  const res = await fetch(`${BASE}atlas.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`atlas.json: HTTP ${res.status}`);
  const atlas = await res.json();

  const jobs = [];
  for (const [group, entries] of Object.entries(atlas)) {
    for (const entry of entries) jobs.push({ group, entry });
  }

  let done = 0;
  const groups = {};
  const missing = [];
  const CONCURRENCY = 12;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const { group, entry } = jobs[cursor++];
      const img = await loadImage(BASE + entry.src);
      if (img) (groups[group] ??= new Map()).set(entry.id, new Sprite(entry, img));
      else missing.push(entry.src);
      onProgress(++done / jobs.length, entry.id);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // every sprite failing means the art never arrived at all, which is worth
  // saying out loud rather than opening an empty restaurant
  if (missing.length === jobs.length) throw new Error('no art could be loaded');
  if (missing.length) console.warn(`${missing.length} sprites missing:`, missing.slice(0, 8));

  // keep atlas ordering rather than load-completion ordering
  for (const [group, entries] of Object.entries(atlas)) {
    const map = groups[group];
    if (!map) continue;
    groups[group] = new Map(entries.map((e) => [e.id, map.get(e.id)]).filter(([, v]) => v));
  }

  return new Assets(atlas, groups);
}
