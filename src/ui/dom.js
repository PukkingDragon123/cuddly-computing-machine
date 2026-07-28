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

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function show(el, on = true) { el.classList.toggle('hidden', !on); }

/** Square art thumbnail backed by a sprite image. */
export function thumb(src, { wide = false, size = null } = {}) {
  const el = h('div.thumb', wide ? { class: 'wide' } : null);
  if (src) el.style.backgroundImage = `url("${src}")`;
  if (size) el.style.backgroundSize = size;
  return el;
}

/** Inline ingredient chip: icon + count, tinted red when the pantry is short. */
export function ingChip(src, label, short = false) {
  return h('span.ing', short ? { class: 'short' } : null,
    h('i', { style: { backgroundImage: `url("${src}")` } }),
    label);
}

export function tag(text, cls = '') { return h(`span.tag${cls ? `.${cls}` : ''}`, null, text); }

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
