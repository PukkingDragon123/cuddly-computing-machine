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
    /** Resolves when the second wave has landed. See loadAssets. */
    this.rest = Promise.resolve();
    this.complete = false;
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

/**
 * What has to be here before the doors can open, and what can follow.
 *
 * The loading screen used to wait for all of it — four hundred sprites,
 * including forty serving plates you cannot forge for an hour and twenty menu
 * cards you have not unlocked. Nothing about that is needed to look at your own
 * dining room, so the first wave is the room: its joinery, its furniture, the
 * people in it, and the food. Everything else arrives quietly behind the title
 * screen while you read it.
 *
 * A sprite that has not landed yet resolves to null, and every draw path in the
 * game already skips a null sprite rather than throwing — which is what makes
 * this safe rather than a race.
 */
const FIRST = [
  'ui', 'fixt_oak', 'fixt_walnut',
  'furn_plain', 'furn_cottage', 'furn_antique',
  'staff', 'customers', 'food', 'ingredients',
];

export async function loadAssets(onProgress = () => {}) {
  const res = await fetch(`${BASE}atlas.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`atlas.json: HTTP ${res.status}`);
  const atlas = await res.json();

  const groups = {};
  const missing = [];
  const CONCURRENCY = 12;

  /** Pull one list of sprites, `concurrency` at a time. */
  async function pull(jobs, report) {
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const { group, entry } = jobs[cursor++];
        const img = await loadImage(BASE + entry.src);
        if (img) (groups[group] ??= new Map()).set(entry.id, new Sprite(entry, img));
        else missing.push(entry.src);
        report?.(++done / jobs.length, entry.id);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  /** Put a group back in atlas order rather than load-completion order. */
  const tidy = (group) => {
    const map = groups[group];
    if (!map) return;
    groups[group] = new Map(
      atlas[group].map((e) => [e.id, map.get(e.id)]).filter(([, v]) => v));
  };

  const jobsIn = (names) => names.flatMap(
    (group) => (atlas[group] ?? []).map((entry) => ({ group, entry })));

  // Keys starting with an underscore are notes to the tools, not sprite groups
  // — see the `_tone` marker tools/brighten.py leaves behind.
  const groupNames = Object.keys(atlas).filter((g) => !g.startsWith('_'));
  const first = FIRST.filter((g) => groupNames.includes(g));
  const later = groupNames.filter((g) => !first.includes(g));

  const wave1 = jobsIn(first);
  await pull(wave1, onProgress);
  for (const g of first) tidy(g);

  // every sprite failing means the art never arrived at all, which is worth
  // saying out loud rather than opening an empty restaurant
  if (wave1.length && missing.length === wave1.length) throw new Error('no art could be loaded');

  const assets = new Assets(atlas, groups);
  // Not awaited: this is the whole point. `assets.rest` is there for anything
  // that genuinely needs to wait — the test harness does — and is never awaited
  // on the way to the title screen.
  assets.rest = pull(jobsIn(later)).then(() => {
    for (const g of later) tidy(g);
    assets.complete = true;
    if (missing.length) console.warn(`${missing.length} sprites missing:`, missing.slice(0, 8));
  });
  return assets;
}
