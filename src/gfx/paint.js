// Canvas drawing kit: sprites with squash/stretch, cosy shapes, meters, bubbles.

import { TAU, clamp } from '../core/util.js';

export const INK = '#3d2c1c';

/* ------------------------------------------------------------ primitives */

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Chunky cream panel with a hard bottom edge — the world-space sticker look. */
export function sticker(ctx, x, y, w, h, {
  r = 12, fill = '#f8ecd4', line = INK, lw = 3, lift = 4, shadow = '#b79a69',
} = {}) {
  if (lift > 0) {
    ctx.fillStyle = shadow;
    roundRectPath(ctx, x, y + lift, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  if (lw > 0) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
}

export function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Soft contact shadow, sat directly under the feet. Deliberately small and
 * faint — a hard dark ellipse reads as a separate object floating on the floor.
 * `lift` (0..1) fades and shrinks it through a hop.
 */
export function contactShadow(ctx, x, y, rx, lift = 0, alpha = 0.15) {
  const l = clamp(lift, 0, 1);
  const a = alpha * (1 - l * 0.6);
  const r = Math.max(1, rx * (1 - l * 0.3));
  if (a <= 0.004) return;
  const stamp = shadowStamp();
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(stamp, x - r, y - r * 0.38, r * 2, r * 0.76);
  ctx.restore();
}

// One pre-rendered soft blob, stretched per use — building a radial gradient per
// shadow per frame measurably costs frames once a room is busy.
let SHADOW = null;
function shadowStamp() {
  if (SHADOW) return SHADOW;
  const size = 96;
  SHADOW = document.createElement('canvas');
  SHADOW.width = SHADOW.height = size;
  const c = SHADOW.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(94,76,50,1)');
  g.addColorStop(0.55, 'rgba(94,76,50,0.5)');
  g.addColorStop(1, 'rgba(94,76,50,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return SHADOW;
}

/**
 * Volume-preserving squash from one spring value: what gets shorter gets wider
 * by the same factor. Clamped, because unbounded springs are what make a sprite
 * look like it is changing size rather than squashing.
 */
export function squash(v, limit = 0.13) {
  const sy = clamp(v, 1 - limit, 1 + limit);
  return { sx: 1 / sy, sy };
}

export function starPath(ctx, x, y, outer, inner = outer * 0.46, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.75);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.4, x - s * 0.45, y - s * 1.15, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.15, x + s * 1.5, y - s * 0.4, x, y + s * 0.75);
  ctx.closePath();
}

/* --------------------------------------------------------------- sprites */

const tintCache = new Map();

/** Flat-colour copy of one sprite frame, cached. Used for glows and flashes. */
export function tinted(sprite, frame, color) {
  const key = `${sprite.id}|${frame}|${color}`;
  let cv = tintCache.get(key);
  if (cv) return cv;
  const { sx, sy, sw, sh } = sprite.rect(frame);
  cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  const c = cv.getContext('2d');
  c.drawImage(sprite.img, sx, sy, sw, sh, 0, 0, sw, sh);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = color;
  c.fillRect(0, 0, sw, sh);
  tintCache.set(key, cv);
  return cv;
}

/**
 * Draw a sprite standing on (x, y).
 *
 * The anchor is bottom-centre by default so characters and furniture plant on
 * the floor, and scaleX/scaleY squash around that anchor — which is what sells
 * the papercraft bounce.
 */
export function drawSprite(ctx, sprite, frame, x, y, {
  scale = 1, scaleX = 1, scaleY = 1, rot = 0, alpha = 1, flipX = false,
  anchorX = 0.5, anchorY = 1, glow = null, glowWidth = 3, flash = 0, flashColor = '#fff',
} = {}) {
  if (!sprite || alpha <= 0.003) return;
  const { sx, sy, sw, sh } = sprite.rect(frame);
  const w = sw * scale, h = sh * scale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale((flipX ? -1 : 1) * scaleX, scaleY);
  const dx = -w * anchorX, dy = -h * anchorY;

  if (glow) {
    const g = tinted(sprite, frame, glow);
    const step = glowWidth;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * TAU;
      ctx.drawImage(g, dx + Math.cos(ang) * step, dy + Math.sin(ang) * step, w, h);
    }
  }

  ctx.drawImage(sprite.img, sx, sy, sw, sh, dx, dy, w, h);

  if (flash > 0.004) {
    ctx.globalAlpha = alpha * Math.min(1, flash);
    ctx.drawImage(tinted(sprite, frame, flashColor), dx, dy, w, h);
  }
  ctx.restore();
}

/** Sprite drawn centred on (x, y) — for items riding a belt, plates, icons. */
export function drawIcon(ctx, sprite, x, y, size, opts = {}) {
  if (!sprite) return;
  const { sw, sh } = sprite.rect(opts.frame ?? 0);
  const scale = size / Math.max(sw, sh);
  drawSprite(ctx, sprite, opts.frame ?? 0, x, y, { ...opts, scale, anchorY: 0.5 });
}

/* ---------------------------------------------------------------- floor  */

export function diamond(ctx, cx, cy, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

/* ---------------------------------------------------------------- meters */

/** Progress ring. `pct` 0..1. */
export function ring(ctx, x, y, radius, pct, {
  track = 'rgba(61,44,28,0.18)', fill = '#f8d167', lw = 5, line = INK,
} = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.strokeStyle = track; ctx.lineWidth = lw + 2; ctx.stroke();
  if (pct > 0.001) {
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(pct, 0, 1));
    ctx.strokeStyle = line; ctx.lineWidth = lw + 3; ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.restore();
}

/** Rounded patience meter with an outline. */
export function meter(ctx, x, y, w, h, pct, fill) {
  ctx.save();
  roundRectPath(ctx, x - w / 2, y, w, h, h / 2);
  ctx.fillStyle = '#e3d0a8'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
  const iw = (w - 4) * clamp(pct, 0, 1);
  if (iw > 1) {
    ctx.save();
    roundRectPath(ctx, x - w / 2 + 2, y + 2, Math.max(h - 4, iw), h - 4, (h - 4) / 2);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(x - w / 2 + 2, y + 2, iw, h - 4);
    ctx.restore();
  }
  ctx.restore();
}

/* --------------------------------------------------------------- bubbles */

/** Rounded speech bubble with a little tail pointing down. */
export function bubble(ctx, cx, bottomY, w, h, {
  r = 13, fill = '#fdf6e6', line = INK, lw = 3, tail = 9, lift = 3,
} = {}) {
  const x = cx - w / 2, y = bottomY - h - tail;
  const draw = (oy, color, stroke) => {
    ctx.beginPath();
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y + oy);
    ctx.arcTo(x + w, y + oy, x + w, y + h + oy, rr);
    ctx.arcTo(x + w, y + h + oy, x, y + h + oy, rr);
    ctx.lineTo(cx + tail * 0.72, y + h + oy);
    ctx.lineTo(cx, y + h + tail + oy);
    ctx.lineTo(cx - tail * 0.72, y + h + oy);
    ctx.arcTo(x, y + h + oy, x, y + oy, rr);
    ctx.arcTo(x, y + oy, x + w, y + oy, rr);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (stroke) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
  };
  if (lift) draw(lift, '#b79a69', false);
  draw(0, fill, true);
  return { x, y, w, h };
}

/* ----------------------------------------------------------------- text  */

export function text(ctx, str, x, y, {
  size = 16, weight = 900, fill = '#3d2c1c', stroke = null, lw = 4,
  align = 'center', baseline = 'middle', font = 'ui-rounded, "Nunito", system-ui, sans-serif',
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
  ctx.restore();
}
