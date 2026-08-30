/* Engine for the I'm Ping Pong King port.
 *
 * Nothing game-specific lives here: this is the part that speaks Unity —
 * RectTransform resolution, trimmed-sprite drawing out of the shipped atlases,
 * a LeanTween shim with the game's ease curves, and a Scene that rebuilds an
 * exported subtree as DOM.
 */
'use strict';

const W = 1280, H = 2272;               // CanvasScaler m_ReferenceResolution
const $ = (s, r) => (r || document).querySelector(s);
const qs = new URLSearchParams(location.search);
const G = { data: null, tex: {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
/* UnityEngine.Random.Range(int,int) is max-exclusive */
const randRange = (a, b) => a + Math.floor(Math.random() * (b - a));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* Unity's UI.Text rich text.  Only the four tags the game actually uses appear
 * in its strings: <b>, <i>, <size=n> and <color=...>, the last with or without
 * quotes round the value and either #RRGGBB[AA] or one of Unity's names. */
const RICH_NAMED = {
  aqua: '#00ffff', black: '#000000', blue: '#0000ff', brown: '#a52a2a',
  cyan: '#00ffff', darkblue: '#0000a0', fuchsia: '#ff00ff', green: '#008000',
  grey: '#808080', lightblue: '#add8e6', lime: '#00ff00', magenta: '#ff00ff',
  maroon: '#800000', navy: '#000080', olive: '#808000', orange: '#ffa500',
  purple: '#800080', red: '#ff0000', silver: '#c0c0c0', teal: '#008080',
  white: '#ffffff', yellow: '#ffff00',
};
/* CSS collapses a newline that ends a block, Unity's UI.Text does not -- and
 * two texts layered on each other (the tournament panel's white copy and the
 * yellow words that slot into its gaps) shift half a line apart when the line
 * counts disagree.  Keep the trailing blank line. */
function textForDom(s) { return /\n$/.test(s) ? s + '\u200b' : s; }

/* Put the text into a single .rt child, so a <color> or <size> span cannot
 * turn the flex container's paragraph into a row of flex items. */
function setTxtContent(el, str, align) {
  const t = textForDom(str), h = richText(t);
  const sp = document.createElement('span');
  sp.className = 'rt';
  if (h === null) sp.textContent = t; else sp.innerHTML = h;
  if (align !== undefined)
    sp.style.textAlign = ['left', 'center', 'right'][align % 3] || 'left';
  el.textContent = '';
  el.appendChild(sp);
}

function richText(s) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!/<(b|i|size|color)\b|<\/(b|i|size|color)>/i.test(s)) return null;
  let out = '', i = 0;
  const re = /<(\/)?(b|i|size|color)(?:=\s*"?([^">]*)"?)?>/gi;
  let m;
  while ((m = re.exec(s))) {
    out += esc(s.slice(i, m.index));
    i = re.lastIndex;
    const close = !!m[1], tag = m[2].toLowerCase(), val = (m[3] || '').trim();
    if (close) { out += '</span>'; continue; }
    if (tag === 'b') out += '<span style="font-weight:bold">';
    else if (tag === 'i') out += '<span style="font-style:italic">';
    else if (tag === 'size') out += `<span style="font-size:${parseFloat(val) || 0}px">`;
    else {
      let c = val.toLowerCase();
      if (RICH_NAMED[c]) c = RICH_NAMED[c];
      /* #RRGGBBAA is not a colour CSS understood before 2017, and Unity writes
         the alpha last just as CSS does, so it passes straight through */
      out += `<span style="color:${c}">`;
    }
  }
  out += esc(s.slice(i));
  return out;
}

/* OGGameUtil::HexToColor -- "RRGGBB" or "RRGGBBAA" to a 0..1 RGBA quad */
function hexColor(h) {
  const v = p => parseInt(h.substr(p, 2), 16) / 255;
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 1];
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error(src));
    i.src = src;
  });
}

/* ---------------------------------------------------------------- geometry */
/* Unity's RectTransform resolution, verbatim:
 *   anchorRef  = parentSize * anchor
 *   size       = (anchorRefMax - anchorRefMin) + sizeDelta
 *   pivotPoint = anchorRefMin + (anchorRefMax-anchorRefMin)*pivot + anchoredPosition
 *   bottomLeft = pivotPoint - size*pivot
 * y is flipped once, at the end, into CSS's top-down space. */
function resolveRect(r, pw, ph, pos) {
  const aMin = r.aMin, aMax = r.aMax, piv = r.pivot;
  const p = pos || r.pos;
  const minX = pw * aMin[0], minY = ph * aMin[1];
  const maxX = pw * aMax[0], maxY = ph * aMax[1];
  const sw = (maxX - minX) + r.size[0];
  const sh = (maxY - minY) + r.size[1];
  const px = minX + (maxX - minX) * piv[0] + p[0];
  const py = minY + (maxY - minY) * piv[1] + p[1];
  return { x: px - sw * piv[0], y: py - sh * piv[1], w: sw, h: sh };
}

/* ------------------------------------------------------------------ sprite */
/* A sprite is packed TRIMMED: `t` is the opaque piece inside the atlas, `off`
 * is where that piece sits inside the full `src`-sized sprite.  A UI Image
 * draws the full sprite stretched onto its rect, so the piece scales by
 * rect/src. */
function spriteRec(name) {
  const s = G.data.sprites[name];
  if (!s) return null;
  return { atlas: s[0], x: s[1], y: s[2], w: s[3], h: s[4],
           ox: s[5], oy: s[6], sw: s[7], sh: s[8] };
}

function drawSprite(el, name, rectW, rectH, preserveAspect) {
  const s = spriteRec(name);
  if (!s) { el.style.backgroundImage = 'none'; return; }
  const tex = G.tex[s.atlas];
  let kx = rectW / s.sw, ky = rectH / s.sh, dx = 0, dy = 0;
  if (preserveAspect) {                    // Image.m_PreserveAspect
    const k = Math.min(kx, ky);
    dx = (rectW - s.sw * k) / 2; dy = (rectH - s.sh * k) / 2;
    kx = ky = k;
  }
  el.style.backgroundImage = `url("assets/tex/${encodeURIComponent(s.atlas)}.png")`;
  el.style.backgroundSize = `${tex.width * kx}px ${tex.height * ky}px`;
  el.style.backgroundPosition = `${-s.x * kx}px ${-s.y * ky}px`;
  el.style.left = `${dx + s.ox * kx}px`;
  el.style.top = `${dy + (s.sh - s.oy - s.h) * ky}px`;
  el.style.width = `${s.w * kx}px`;
  el.style.height = `${s.h * ky}px`;
}

/* Unity's UI Image multiplies the sprite by m_Color.  A greyscale tint is
 * exactly CSS brightness() (it scales RGB and leaves alpha alone), which covers
 * the case that matters: ChangeTrailImage paints every ball trail Color.black
 * over white streak art.  A coloured tint falls back to an alpha mask. */
function applyTint(el, c) {
  if (!c) return;
  const [r, g, b] = c;
  /* clear any mask left by a previous coloured tint, or the sprite stays
     invisible once the tint goes back to white */
  if (el.style.maskImage || el.style.webkitMaskImage) {
    el.style.webkitMaskImage = el.style.maskImage = '';
    el.style.backgroundColor = '';
  }
  if (r === 1 && g === 1 && b === 1) { el.style.filter = ''; return; }
  if (r === g && g === b) { el.style.filter = `brightness(${r})`; return; }
  const img = el.style.backgroundImage;
  if (img && img !== 'none') {
    el.style.webkitMaskImage = el.style.maskImage = img;
    el.style.webkitMaskSize = el.style.maskSize = el.style.backgroundSize;
    el.style.webkitMaskPosition = el.style.maskPosition = el.style.backgroundPosition;
    el.style.webkitMaskRepeat = el.style.maskRepeat = 'no-repeat';
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = `rgb(${r * 255},${g * 255},${b * 255})`;
  }
}

const rgba = c => `rgba(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)},${c[3]})`;

/* -------------------------------------------------------------------- Node
 * One RectTransform + whatever UI component sits on it, with the operations
 * the game's code performs: SetActive, sprite, colour/alpha, localPosition,
 * localScale, enabled. */
class Node {
  constructor(scene, path, node, el, rect, parent) {
    this.scene = scene; this.path = path; this.node = node;
    this.el = el; this.rect = rect; this.parent = parent;
    this.img = null; this.txt = null;
    this.tint = [1, 1, 1, 1];
    this.scale = node.rect.scale.slice();
    this.pos = node.rect.pos.slice();
  }
  get name() { return this.node.name; }

  setActive(v) { this.el.style.display = v ? '' : 'none'; return this; }
  get active() { return this.el.style.display !== 'none'; }

  setEnabled(v) {                                   // Image.enabled / Text.enabled
    for (const t of [this.img, this.txt]) if (t) t.style.visibility = v ? '' : 'hidden';
    return this;
  }

  setSprite(name, preserveAspect) {
    if (!this.img) {
      this.img = document.createElement('div');
      this.img.className = 'img';
      this.el.insertBefore(this.img, this.el.firstChild);
    }
    if (this._spr === name && this._pa === preserveAspect) return this;
    this._spr = name; this._pa = preserveAspect;
    if (!name) { this.img.style.display = 'none'; return this; }
    this.img.style.display = '';
    /* a null-sprite Image was painted as a solid quad; clear that fill or the
       sprite lands on top of a white box */
    this.img.style.backgroundColor = '';
    drawSprite(this.img, name, this.rect.w, this.rect.h,
               preserveAspect !== undefined ? preserveAspect
                 : (this.node.image && this.node.image.preserveAspect));
    applyTint(this.img, this.tint);
    this.img.style.opacity = this.tint[3];
    return this;
  }

  setColor(c) {
    this.tint = c.slice();
    if (this.img) {
      if (this._spr) { drawSprite(this.img, this._spr, this.rect.w, this.rect.h, this._pa); applyTint(this.img, c); }
      else this.img.style.background = rgba(c);
      this.img.style.opacity = c[3];
    }
    if (this.txt) this.txt.style.color = rgba(c);
    return this;
  }
  setAlpha(a) { const c = this.tint.slice(); c[3] = a; return this.setColor(c); }
  get alpha() { return this.tint[3]; }

  setText(s) {
    if (this.txt) setTxtContent(this.txt, s, this.node.text && this.node.text.align);
    return this;
  }
  setFontSize(px) { if (this.txt) this.txt.style.fontSize = px + 'px'; return this; }

  /* A RectTransform's localPosition is NOT its anchoredPosition: they differ by
   *     anchorRef - parentSize * parentPivot
   * which is zero only when the node is centre-anchored under a centre-pivoted
   * parent.  The game moves things with LeanTween.moveLocal*, i.e. in local
   * space, so convert -- an edge-anchored node lands hundreds of pixels out
   * otherwise. */
  _anchorRef() {
    const p = this.parent, pw = p ? p.rect.w : W, ph = p ? p.rect.h : H;
    const r = this.node.rect;
    const minX = pw * r.aMin[0], maxX = pw * r.aMax[0];
    const minY = ph * r.aMin[1], maxY = ph * r.aMax[1];
    return [minX + (maxX - minX) * r.pivot[0], minY + (maxY - minY) * r.pivot[1], pw, ph];
  }
  /* A runtime-driven Canvas serialises a stale pivot -- RivalModeScene's is
     (0,0) -- but Unity drives it centre-pivoted, and the game's moveLocalX(...,0)
     calls only centre things if it is. */
  _parentPivot() {
    if (!this.parent) return [0.5, 0.5];
    return this.parent.driven ? [0.5, 0.5] : this.parent.node.rect.pivot;
  }

  setAnchoredPos(x, y) {
    this.pos = [x, y];
    const pw = this.parent ? this.parent.rect.w : W, ph = this.parent ? this.parent.rect.h : H;
    const r = resolveRect(this.node.rect, pw, ph, this.pos);
    this.rect = r;
    this.el.style.left = `${r.x}px`;
    this.el.style.top = `${ph - r.y - r.h}px`;
    return this;
  }
  get anchoredPos() { return this.pos.slice(); }

  setLocalPos(x, y) {
    const [ax, ay, pw, ph] = this._anchorRef();
    const pp = this._parentPivot();
    return this.setAnchoredPos(x - ax + pw * pp[0], y - ay + ph * pp[1]);
  }
  get localPos() {
    const [ax, ay, pw, ph] = this._anchorRef();
    const pp = this._parentPivot();
    return [this.pos[0] + ax - pw * pp[0], this.pos[1] + ay - ph * pp[1]];
  }

  setLocalScale(sx, sy) {
    this.scale = [sx, sy === undefined ? sx : sy];
    this._applyTransform();
    return this;
  }
  get localScale() { return this.scale.slice(); }

  setRotation(deg) { this.rot = deg; this._applyTransform(); return this; }

  /* Unity scales and rotates a RectTransform about its PIVOT, not its centre.
     These rivals pivot at y = 0.033 -- near their feet -- so scaling them about
     the middle lifts them hundreds of pixels off their baseline. */
  _applyTransform() {
    const s = this.scale, r = this.rot || 0;
    const p = this.driven ? [0.5, 0.5] : this.node.rect.pivot;
    this.el.style.transformOrigin = `${p[0] * 100}% ${(1 - p[1]) * 100}%`;
    const parts = [];
    if (r) parts.push(`rotate(${r}deg)`);
    if (s[0] !== 1 || s[1] !== 1) parts.push(`scale(${s[0]},${s[1]})`);
    this.el.style.transform = parts.join(' ');
  }

  /* sizeDelta.  The rect has to be re-resolved, not just resized: with a
     centred pivot a smaller rect must stay centred on the same point, and
     shrinking only the box leaves the art off to one side -- which is what
     made the pause glyph sit left of its circle. */
  setSize(w, h) {
    const pw = this.parent ? this.parent.rect.w : W, ph = this.parent ? this.parent.rect.h : H;
    const nr = { ...this.node.rect, size: [w, h], aMin: [0, 0], aMax: [0, 0] };
    const anchorRef = [pw * this.node.rect.aMin[0] +
                       (pw * this.node.rect.aMax[0] - pw * this.node.rect.aMin[0]) * this.node.rect.pivot[0],
                       ph * this.node.rect.aMin[1] +
                       (ph * this.node.rect.aMax[1] - ph * this.node.rect.aMin[1]) * this.node.rect.pivot[1]];
    const piv = this.node.rect.pivot;
    const px = anchorRef[0] + this.pos[0], py = anchorRef[1] + this.pos[1];
    this.rect = { x: px - w * piv[0], y: py - h * piv[1], w, h };
    this.el.style.left = `${this.rect.x}px`;
    this.el.style.top = `${ph - this.rect.y - h}px`;
    this.el.style.width = w + 'px'; this.el.style.height = h + 'px';
    if (this._spr) { drawSprite(this.img, this._spr, w, h, this._pa); applyTint(this.img, this.tint); }
    return this;
  }

  /* Image.SetNativeSize -- the rect becomes the sprite's own m_Rect size */
  setNativeSize() {
    const r = spriteRec(this._spr);
    if (r) this.setSize(r.sw, r.sh);
    return this;
  }

  /* Transform.SetAsLastSibling / SetAsFirstSibling.  Sibling index is paint
     order in a Unity canvas, and it is DOM order here, so both are a move
     within the parent element. */
  setAsLastSibling() { const p = this.el.parentNode; if (p) p.appendChild(this.el); return this; }
  setAsFirstSibling() { const p = this.el.parentNode; if (p) p.insertBefore(this.el, p.firstChild); return this; }

  /* Transform.SetParent, keeping the element's drawn position -- the game uses
     it only to re-parent the Reverse-mode hands onto the buttons they grab. */
  setParentNode(n) {
    if (n && n.el !== this.el.parentNode) n.el.appendChild(this.el);
    return this;
  }
}

/* ---------------------------------------------------------------- LeanTween
 * Only the calls the game makes, with LeanTween's own ease curves. */
const EASE = {
  1: t => t,                                                   // linear
  2: t => -t * (t - 2),                                        // easeOutQuad
  3: t => t * t,                                               // easeInQuad
  4: t => t < .5 ? 2*t*t : -1 + (4 - 2*t) * t,                 // easeInOutQuad
  12: t => 1 + Math.pow(t - 1, 5),                             // easeOutQuint
  13: t => t < .5 ? 16*t*t*t*t*t : 1 + 16*Math.pow(t-1,5),     // easeInOutQuint
  14: t => 1 - Math.cos(t * Math.PI / 2),                      // easeInSine
  15: t => Math.sin(t * Math.PI / 2),                          // easeOutSine
  16: t => -(Math.cos(Math.PI * t) - 1) / 2,                   // easeInOutSine
  24: t => {                                                   // easeOutBounce
    if (t < 1/2.75) return 7.5625*t*t;
    if (t < 2/2.75) { t -= 1.5/2.75; return 7.5625*t*t + .75; }
    if (t < 2.5/2.75) { t -= 2.25/2.75; return 7.5625*t*t + .9375; }
    t -= 2.625/2.75; return 7.5625*t*t + .984375;
  },
  26: t => { const s = 1.70158; return t*t*((s+1)*t - s); },    // easeInBack
  27: t => { const s = 1.70158; t -= 1; return t*t*((s+1)*t + s) + 1; },  // easeOutBack
  28: t => { const s = 1.70158 * 1.525;                          // easeInOutBack
    t *= 2; if (t < 1) return .5*(t*t*((s+1)*t - s));
    t -= 2; return .5*(t*t*((s+1)*t + s) + 2); },
  30: t => {                                                   // easeOutElastic
    if (t === 0 || t === 1) return t;
    const p = .3, s = p / 4;
    return Math.pow(2, -10*t) * Math.sin((t - s) * (2*Math.PI) / p) + 1;
  },
  31: t => {                                                   // easeInOutElastic
    if (t === 0 || t === 1) return t;
    const p = .3 * 1.5, s = p / 4;
    t *= 2;
    if (t < 1) return -.5 * Math.pow(2, 10*(t-1)) * Math.sin((t-1-s) * (2*Math.PI)/p);
    return Math.pow(2, -10*(t-1)) * Math.sin((t-1-s) * (2*Math.PI)/p) * .5 + 1;
  },
};
const ease = k => EASE[k] || EASE[1];

class Tween {
  constructor(dur, from, to, apply) {
    this.t0 = performance.now(); this.dur = Math.max(1e-6, dur * 1000);
    this.from = from; this.to = to; this.apply = apply;
    this.e = EASE[1]; this.onDone = null; this.delay = 0;
    this.pingPong = false; this.loops = 1; this.dead = false;
    LT.list.push(this);
  }
  setEase(k) { this.e = ease(k); return this; }
  setDelay(s) { this.delay = s * 1000; return this; }
  setOnComplete(f) { this.onDone = f; return this; }
  setLoopPingPong(n) { this.pingPong = true; this.loops = n < 0 ? Infinity : n * 2; return this; }
  setLoopClamp(n) { this.loops = n === undefined ? Infinity : n; return this; }
  cancel() { this.dead = true; }
  step(now) {
    if (this.dead) return true;
    const el = now - this.t0 - this.delay;
    if (el < 0) return false;
    let t = el / this.dur;
    if (t >= 1) {
      if (this.loops > 1) {
        this.loops--; this.t0 = now; this.delay = 0;
        if (this.pingPong) { const f = this.from; this.from = this.to; this.to = f; }
        t = 0;
      } else {
        this.apply(1, this.e(1));
        if (this.onDone) { const f = this.onDone; this.onDone = null; f(); }
        return true;
      }
    }
    this.apply(t, this.e(t));
    return false;
  }
}

const LT = {
  list: [],
  /* A tween's onComplete can start or cancel tweens -- including cancelAll from
     a scene change -- so step over a snapshot and compact afterwards. */
  tick(now) {
    const snap = LT.list.slice();
    for (const t of snap) { if (!t.dead && t.step(now)) t.dead = true; }
    for (let i = LT.list.length - 1; i >= 0; i--) if (LT.list[i].dead) LT.list.splice(i, 1);
  },
  cancelAll() { for (const t of LT.list) t.dead = true; },
  /* LeanTween.cancel(gameObject) -- kill every tween on one node */
  cancel(node) { for (const t of LT.list) if (t.node === node) t.dead = true; },
  lerp: (a, b, k) => a + (b - a) * k,

  value(from, to, dur, cb) {
    return new Tween(dur, from, to, (t, k) => cb(LT.lerp(from, to, k)));
  },
  value2(from, to, dur, cb) {
    return new Tween(dur, from, to,
      (t, k) => cb([LT.lerp(from[0], to[0], k), LT.lerp(from[1], to[1], k)]));
  },
  alpha(node, to, dur) {
    const from = node.alpha;
    const t = new Tween(dur, from, to, (t_, k) => node.setAlpha(LT.lerp(from, to, k)));
    t.node = node; return t;
  },
  scale(node, to, dur) {
    const from = node.localScale;
    const t2 = (typeof to === 'number') ? [to, to] : to;
    const t = new Tween(dur, from, t2, (t_, k) =>
      node.setLocalScale(LT.lerp(from[0], t2[0], k), LT.lerp(from[1], t2[1], k)));
    t.node = node; return t;
  },
  moveLocal(node, x, y, dur) {
    const from = node.localPos;
    const t = new Tween(dur, from, [x, y], (t_, k) =>
      node.setLocalPos(LT.lerp(from[0], x, k), LT.lerp(from[1], y, k)));
    t.node = node; return t;
  },
  moveLocalX(node, x, dur) { return LT.moveLocal(node, x, node.localPos[1], dur); },
  moveLocalY(node, y, dur) { return LT.moveLocal(node, node.localPos[0], y, dur); },
  delayedCall(dur, f) {
    const t = new Tween(1e-6, 0, 1, () => {});
    t.delay = dur * 1000; t.onDone = f; return t;
  },
  rotate(node, deg, dur) {
    const from = node.rot || 0;
    return new Tween(dur, from, deg, (t, k) => node.setRotation(LT.lerp(from, deg, k)));
  },
};
/* One clock, fed by requestAnimationFrame for smoothness and by a timer as a
   fallback -- headless Chrome's virtual time drives timers but not rAF, and the
   screenshot harness depends on it. */
const Clock = {
  cbs: [], last: 0,
  add(f) { this.cbs.push(f); },
  remove(f) { const i = this.cbs.indexOf(f); if (i >= 0) this.cbs.splice(i, 1); },
  tick() {
    const now = performance.now();
    if (now - this.last < 4) return;
    this.last = now;
    for (const f of this.cbs.slice()) f(now);
  },
};
requestAnimationFrame(function loop() { Clock.tick(); requestAnimationFrame(loop); });
setInterval(() => Clock.tick(), 16);
Clock.add(now => LT.tick(now));

/* ------------------------------------------------------------------- Scene
 * Rebuilds an exported Unity subtree as DOM, resolving every rect against its
 * parent exactly as Unity would. */
class Scene {
  constructor(sceneName, host, opts) {
    this.sceneName = sceneName;
    this.nodes = {};
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'scene';
    this.root.dataset.scene = sceneName;
    host.appendChild(this.root);
    this.build(sceneName, opts || {});
  }

  build(sceneName, opts) {
    const src = G.data.scenes[sceneName];
    if (!src) throw new Error('no scene ' + sceneName);
    /* Parents before children, and siblings in Unity's own transform order --
       that order is the paint order, so name-sorting would mislayer a scene. */
    const paths = Object.keys(src).sort((a, b) =>
      (a === '' ? -1 : b === '' ? 1 : 0) ||
      a.split('/').length - b.split('/').length ||
      (src[a].sib | 0) - (src[b].sib | 0) ||
      a.localeCompare(b));
    for (const p of paths) {
      const n = src[p];
      const parentPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : (p === '' ? null : '');
      const parent = parentPath === null ? null : this.nodes[parentPath];
      if (parentPath !== null && !parent) continue;
      const pw = parent ? parent.rect.w : W, ph = parent ? parent.rect.h : H;
      /* A Screen-Space-Overlay Canvas serialises with sizeDelta 0 AND localScale
         0 -- Unity drives both at runtime from the CanvasScaler.  Do the same
         for the subtree root and for any Canvas, or the tree collapses. */
      const driven = !parent || n.name === 'Canvas' || opts.fullSize === n.name;
      const rect = driven ? { x: 0, y: 0, w: W, h: H } : resolveRect(n.rect, pw, ph);
      const el = document.createElement('div');
      el.className = 'n';
      el.dataset.name = n.name;
      el.style.left = `${rect.x}px`;
      el.style.top = `${ph - rect.y - rect.h}px`;
      el.style.width = `${rect.w}px`;
      el.style.height = `${rect.h}px`;
      (parent ? parent.el : this.root).appendChild(el);

      const node = new Node(this, p, n, el, rect, parent);
      node.driven = driven;
      if (driven) { node.scale = [1, 1]; }
      node._applyTransform();
      /* Every mode scene ships with its Canvas deactivated; GameMgr turns the
         current one on via Scenes::PopupAndShowScene<T>. */
      if (!n.active && !driven) el.style.display = 'none';

      if (n.image) {
        const im = document.createElement('div');
        im.className = 'img';
        el.appendChild(im);
        node.img = im;
        node.tint = n.image.color.slice();
        if (n.image.sprite) {
          drawSprite(im, n.image.sprite, rect.w, rect.h, n.image.preserveAspect);
          applyTint(im, n.image.color);
          im.style.opacity = n.image.color[3];
          node._spr = n.image.sprite; node._pa = n.image.preserveAspect;
        } else {
          /* A UI Image with a null sprite still draws: a plain quad filling the
             rect in m_Color.  That is the game's gold background. */
          Object.assign(im.style, { left: '0px', top: '0px', width: '100%',
                                    height: '100%', background: rgba(n.image.color) });
        }
        if (!n.image.enabled) im.style.visibility = 'hidden';
      }
      if (n.text) {
        const tx = document.createElement('div');
        tx.className = 'txt';
        setTxtContent(tx, n.text.text, n.text.align);
        Object.assign(tx.style, {
          width: '100%', height: '100%',
          fontSize: `${n.text.size}px`,
          lineHeight: n.text.lineSpacing,
          color: rgba(n.text.color),
          alignItems: ['flex-start', 'flex-start', 'flex-start', 'center', 'center',
                       'center', 'flex-end', 'flex-end', 'flex-end'][Math.min(8, n.text.align)] || 'center',
          justifyContent: ['flex-start', 'center', 'flex-end'][n.text.align % 3] || 'center',
          fontWeight: (n.text.style === 1 || n.text.style === 3) ? 'bold' : 'normal',
          fontStyle: (n.text.style === 2 || n.text.style === 3) ? 'italic' : 'normal',
          whiteSpace: n.text.hOverflow === 1 ? 'pre' : 'pre-wrap',
        });
        el.appendChild(tx);
        node.txt = tx;
        node.tint = n.text.color.slice();
        if (!n.text.enabled) tx.style.visibility = 'hidden';
      }
      this.nodes[p] = node;
    }
  }

  n(path) { return this.nodes[path]; }
  /* find by leaf name; scenes reuse names, so prefer n(path) */
  find(leaf) {
    for (const k in this.nodes) if (this.nodes[k].name === leaf) return this.nodes[k];
    return null;
  }
  comp(path, script) {
    const n = G.data.scenes[this.sceneName][path];
    return n && n.comp ? n.comp[script] : null;
  }
  hide(...paths) { for (const p of paths) { const n = this.n(p); if (n) n.setActive(false); } return this; }
  show(...paths) { for (const p of paths) { const n = this.n(p); if (n) n.setActive(true); } return this; }
  setActive(v) { this.root.style.display = v ? '' : 'none'; return this; }
  destroy() { this.root.remove(); }
}

/* ------------------------------------------------------------------ audio
 * HTMLAudioElement rather than WebAudio: decodeAudioData needs the bytes, and
 * fetching them is blocked under file://.  A small pool per clip lets the same
 * sound overlap, which a rally needs. */
const Audio_ = {
  ready: false, pool: {}, POOL: 5, bgm: null, bgmVol: 1, sfxOn: true, bgmOn: true,
  load(names) {
    for (const n of names) {
      const els = [];
      for (let i = 0; i < this.POOL; i++) {
        const a = new Audio(`assets/snd/${n}.mp3`); a.preload = 'auto'; els.push(a);
      }
      this.pool[n] = { els, i: 0 };
    }
  },
  unlock() {
    if (this.ready) return;
    this.ready = true;
    for (const p of Object.values(this.pool)) {
      for (const a of p.els) {
        a.volume = 0;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(() => {});
      }
    }
    if (this._pendingBgm) { const b = this._pendingBgm; this._pendingBgm = null; this.playBgm(b.n, b.loop); }
  },
  play(n, vol = 1) {
    if (!this.sfxOn) return;
    const p = this.pool[n];
    if (!p) return;
    const a = p.els[p.i]; p.i = (p.i + 1) % p.els.length;
    try { a.currentTime = 0; a.volume = clamp01(vol); a.play().catch(() => {}); } catch (e) {}
    return a;
  },
  playBgm(n, loop) {
    this.stopBgm();
    if (!this.ready) { this._pendingBgm = { n, loop }; return; }
    const a = new Audio(`assets/snd/${n}.mp3`);
    a.loop = !!loop; a.volume = this.bgmOn ? clamp01(this.bgmVol) : 0;
    a.play().catch(() => {});
    this.bgm = a;
  },
  setBgmVolume(v) { this.bgmVol = v; if (this.bgm) this.bgm.volume = this.bgmOn ? clamp01(v) : 0; },
  /* Audios::EnabledSfx / EnabledBgm -- the mute button drives both */
  setEnabled(on) {
    this.sfxOn = !!on; this.bgmOn = !!on;
    if (this.bgm) this.bgm.volume = this.bgmOn ? clamp01(this.bgmVol) : 0;
  },
  stopBgm() { if (this.bgm) { this.bgm.pause(); this.bgm = null; } this._pendingBgm = null; },
};

/* --------------------------------------------------------------- viewport */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const st = $('#stage');
  if (st) st.style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit);

Object.assign(window, { Clock, W, H, $, qs, G, wait, randRange, clamp01, loadImage,
                        resolveRect, drawSprite, spriteRec, applyTint, rgba,
                        Node, Scene, LT, Tween, EASE, ease, Audio_, fit });
