// Minimal DOM helpers — the HUD and panels are real elements so CSS can do the
// chunky sticker styling and native scrolling.

/**
 * h('div.card', { onclick }, 'text', child)
 * Tag supports `.class` and `#id` shorthand.
 */
export function h(spec, props = null, ...kids) {
  const [tag, ...rest] = spec.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const token of rest) {
    if (token[0] === '.') el.classList.add(token.slice(1));
    else el.id = token.slice(1);
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className += ` ${v}`;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

/**
 * Swap the hand-drawn SVG icons for the pack's own artwork wherever the pack has
 * a match.
 *
 * Written as one injected stylesheet rather than as inline styles on the
 * elements that happen to exist at boot — every card the panels build later gets
 * the painted icon too, and the markup keeps its `.ico-*` classes as the
 * fallback for anything the pack does not cover.
 */
export function skinIcons(assets) {
  const swap = {
    'ico-diary': 'diary', 'ico-book': 'recipes', 'ico-crate': 'market',
    'ico-help': 'help', 'ico-hammer': 'tools', 'ico-shop': 'market',
    'ico-lab': 'book',
    // Settings gets the pack's list card, not the hammer. Build and Settings
    // both pointed at tools.png, which put the same drawing twice in a rail of
    // six — the fastest way to make a column of icons unreadable.
    'ico-tools': 'list', 'ico-crew': 'crew', 'ico-refresh': 'refresh',
    // fame keeps the drawn star and the kiln keeps its drawn flame: the pack has
    // neither, and the nearest thing in it (a list, a refresh arrow) says the
    // wrong word entirely
  };
  const rules = [];
  for (const [cls, id] of Object.entries(swap)) {
    const url = assets.url('ui', id);
    if (url) rules.push(`.${cls}{background-image:url("${url}")}`);
  }
  if (!rules.length) return;
  const style = document.createElement('style');
  style.id = 'icon-skin';
  style.textContent = rules.join('\n');
  document.head.append(style);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function show(el, on = true) { el.classList.toggle('hidden', !on); }

/**
 * Square art well with the sprite standing in it. The sprite goes on a child
 * rather than the well's own background so the well keeps its lit floor
 * gradient underneath — cream furniture on a flat cream tile disappears.
 */
export function thumb(src, { wide = false, size = null, frames = 1 } = {}) {
  const el = h(`div.thumb${wide ? '.wide' : ''}`);
  if (src) {
    const art = h('i', { style: { backgroundImage: `url("${src}")` } });
    // Character art is a strip of poses. Blow it up so one frame fills the
    // well, then slide it so that frame lands centred: background-position
    // percentages resolve against (box − image), which is negative once the
    // image is the wider of the two, hence the negative figure.
    if (frames > 1) {
      const fill = 0.78;                       // frame width, as a share of the well
      const x = ((1 - fill) / 2) / (1 - frames * fill) * 100;
      art.style.backgroundSize = `${frames * fill * 100}% auto`;
      art.style.backgroundPosition = `${x.toFixed(2)}% 56%`;
    }
    if (size) art.style.backgroundSize = size;
    el.append(art);
  }
  return el;
}

/** Inline ingredient chip: icon + count, tinted red when the pantry is short. */
export function ingChip(src, label, short = false) {
  return h('span.ing', short ? { class: 'short' } : null,
    h('i', { style: { backgroundImage: `url("${src}")` } }),
    label);
}

/** Pill of metadata. `ico` names an .ico-* glyph to sit before the label. */
export function tag(text, cls = '', ico = null) {
  return h(`span.tag${cls ? `.${cls}` : ''}`, null,
    ico ? h(`i.ico.ico-${ico}`) : null, text);
}

/**
 * Finish picker: the wood itself, not just its name. The bonus is its own
 * element so a squeezed name ellipses without taking the number with it.
 */
export function swatch(label, color, on, onclick, bonus = null) {
  return h(`button.swatch${on ? '.on' : ''}`, { type: 'button', onclick },
    h('span.dot', { style: { background: color } }),
    h('span.lbl', null, label),
    bonus ? h('span.bonus', null, bonus) : null);
}

export function stepper(value, { min = 0, max = 99, onChange }) {
  const num = h('span.num', null, String(value));
  const dec = h('button', { type: 'button', onclick: () => bump(-1) }, '−');
  const inc = h('button', { type: 'button', onclick: () => bump(1) }, '+');
  let v = value;
  function sync() {
    num.textContent = String(v);
    dec.disabled = v <= min;
    inc.disabled = v >= max;
  }
  function bump(d) {
    const next = Math.max(min, Math.min(max, v + d));
    if (next === v) return;
    v = next;
    sync();
    onChange?.(v, d);
  }
  sync();
  return { el: h('div.stepper', null, dec, num, inc), sync: (nv, nmax) => { v = nv; if (nmax != null) max = nmax; sync(); } };
}

export function bar(pct) {
  return h('div.bar', null, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` } }));
}
