/* I'm Ping Pong King 2.7 (com.orangenose.tablefull) -- web port.
 *
 * Every constant, timing, coordinate and formula below was read out of the
 * shipped APK: the Unity scene (level1) for geometry and component values, and
 * Assembly-CSharp.dll's CIL for behaviour.  Each one carries its source in a
 * comment -- `Type::Method` for code, `scene:Path` for authored data -- so it
 * can be re-checked against docs/SPEC.md.
 *
 * Layout is Unity's own: a 1280x2272 canvas (CanvasScaler m_ReferenceResolution)
 * with y up, converted to CSS at build-tree time.
 */
'use strict';

const W = 1280, H = 2272;               // CanvasScaler m_ReferenceResolution
const $ = (s, r) => (r || document).querySelector(s);
const qs = new URLSearchParams(location.search);

/* ------------------------------------------------------------------ assets */
const G = { data: null, tex: {}, sfx: {} };

/* assets/data/game.js assigns window.__GAME; a <script> tag, not fetch(), so
   the port keeps working from file:// where cross-origin rules block fetch. */

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
 * Then y is flipped once, at the end, into CSS's top-down space. */
function resolveRect(r, pw, ph) {
  const aMin = r.aMin, aMax = r.aMax, piv = r.pivot;
  const refMinX = pw * aMin[0], refMinY = ph * aMin[1];
  const refMaxX = pw * aMax[0], refMaxY = ph * aMax[1];
  const sw = (refMaxX - refMinX) + r.size[0];
  const sh = (refMaxY - refMinY) + r.size[1];
  const px = refMinX + (refMaxX - refMinX) * piv[0] + r.pos[0];
  const py = refMinY + (refMaxY - refMinY) * piv[1] + r.pos[1];
  return { x: px - sw * piv[0], y: py - sh * piv[1], w: sw, h: sh };
}

/* ------------------------------------------------------------------ sprite */
/* A sprite is packed TRIMMED into its atlas: `t` is the opaque piece, `off` is
 * where that piece sits inside the full `src`-sized sprite.  A UI Image draws
 * the full sprite stretched onto its rect, so the piece scales by rect/src. */
function spriteRec(name) {
  const s = G.data.sprites[name];
  if (!s) return null;
  return { atlas: s[0], x: s[1], y: s[2], w: s[3], h: s[4],
           ox: s[5], oy: s[6], sw: s[7], sh: s[8] };
}

/* Unity's UI Image multiplies the sprite by m_Color.  A greyscale tint is
   exactly CSS brightness() (it scales RGB and leaves alpha alone), which covers
   the case that matters: ChangeTrailImage paints every ball trail Color.black
   over white streak art.  A coloured tint falls back to an alpha mask. */
function tint(el, c) {
  if (!c) return;
  const [r, g, b, a] = c;
  if (a < 1) el.style.opacity = a;
  if (r === 1 && g === 1 && b === 1) { el.style.filter = ''; return; }
  if (r === g && g === b) { el.style.filter = `brightness(${r})`; return; }
  const img = el.style.backgroundImage;
  if (img && img !== 'none') {
    el.style.webkitMaskImage = el.style.maskImage = img;
    el.style.webkitMaskSize = el.style.maskSize = el.style.backgroundSize;
    el.style.webkitMaskPosition = el.style.maskPosition = el.style.backgroundPosition;
    el.style.webkitMaskRepeat = el.style.maskRepeat = 'no-repeat';
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = `rgb(${r*255},${g*255},${b*255})`;
  }
}

function drawSprite(el, name, rectW, rectH) {
  const s = spriteRec(name);
  if (!s) { el.style.backgroundImage = 'none'; return; }
  const tex = G.tex[s.atlas];
  const kx = rectW / s.sw, ky = rectH / s.sh;
  el.style.backgroundImage = `url("assets/tex/${encodeURIComponent(s.atlas)}.png")`;
  el.style.backgroundSize = `${tex.width * kx}px ${tex.height * ky}px`;
  el.style.backgroundPosition = `${-s.x * kx}px ${-s.y * ky}px`;
  el.style.left = `${s.ox * kx}px`;
  el.style.top = `${rectH - (s.oy + s.h) * ky}px`;
  el.style.width = `${s.w * kx}px`;
  el.style.height = `${s.h * ky}px`;
}

/* A node whose sprite changes every frame (the ball trails, the swings): the
 * <div> holds the rect, an inner .img holds the drawn piece.  Only the inner
 * one moves, so per-frame work is a background-position change on an atlas
 * that is already decoded -- no image swap, no mid-frame flash. */
class Anim {
  constructor(host, rectW, rectH) {
    this.host = host; this.rw = rectW; this.rh = rectH;
    this.el = document.createElement('div');
    this.el.className = 'img';
    host.appendChild(this.el);
    this.cur = null; this.tint = null;
  }
  setTint(c) {
    this.tint = c;
    if (this.cur) { drawSprite(this.el, this.cur, this.rw, this.rh); tint(this.el, c); }
  }
  set(name) {
    if (name === this.cur) return;
    this.cur = name;
    if (!name) { this.el.style.display = 'none'; return; }
    this.el.style.display = '';
    drawSprite(this.el, name, this.rw, this.rh);
    if (this.tint) tint(this.el, this.tint);
  }
  show(v) { this.host.style.display = v ? '' : 'none'; }
}

/* ------------------------------------------------------------- scene build */
/* Rebuilds one exported Unity scene subtree as DOM, resolving every rect
 * against its parent exactly as Unity would. */
function buildScene(sceneName, host) {
  const nodes = G.data.scenes[sceneName];
  const made = {};                                   // path -> {el, rect}
  /* Parents before children, and siblings in Unity's own transform order --
     that order is the paint order, so name-sorting would mislayer the scene. */
  const paths = Object.keys(nodes).sort((a, b) =>
      a.split('/').length - b.split('/').length ||
      (nodes[a].sib | 0) - (nodes[b].sib | 0) ||
      a.localeCompare(b));
  for (const p of paths) {
    const n = nodes[p];
    const parentPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null;
    const parent = parentPath ? made[parentPath] : null;
    if (parentPath && !parent) continue;             // parent outside the subtree
    const pw = parent ? parent.rect.w : W, ph = parent ? parent.rect.h : H;
    /* A Screen-Space-Overlay Canvas serialises with sizeDelta 0 AND localScale 0
       -- Unity drives both at runtime from the CanvasScaler.  Do the same for the
       scene root and for the Canvas itself, or the whole tree collapses to a
       zero-sized, zero-scaled parent. */
    const driven = !parent || n.name === 'Canvas';
    const rect = driven ? { x: 0, y: 0, w: W, h: H } : resolveRect(n.rect, pw, ph);
    const el = document.createElement('div');
    el.className = 'n';
    el.dataset.name = n.name;
    el.style.left = `${rect.x}px`;
    el.style.top = `${ph - rect.y - rect.h}px`;      // Unity y-up -> CSS y-down
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
    const sc = driven ? [1, 1] : n.rect.scale;
    if (sc[0] !== 1 || sc[1] !== 1) {
      el.style.transform = `scale(${sc[0]},${sc[1]})`;
    }
    /* Every mode scene ships with its Canvas deactivated; GameMgr turns the
       current one on through Scenes::PopupAndShowScene<T>.  Do the same. */
    if (!n.active && !driven) el.style.display = 'none';
    (parent ? parent.el : host).appendChild(el);
    const rec = { el, rect, node: n };
    if (n.image) {
      const im = document.createElement('div');
      im.className = 'img';
      const c = n.image.color;
      if (n.image.sprite) {
        drawSprite(im, n.image.sprite, rect.w, rect.h);
        tint(im, c);
      } else {
        /* A UI Image with m_Sprite null still draws: a plain quad filling the
           rect in m_Color.  That is what the gold background is. */
        Object.assign(im.style, {
          left: '0px', top: '0px', width: '100%', height: '100%',
          background: `rgba(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)},${c[3]})`,
        });
      }
      if (!n.image.enabled) im.style.display = 'none';
      el.appendChild(im);
      rec.img = im;
    }
    if (n.text) {
      const tx = document.createElement('div');
      tx.className = 'txt';
      tx.textContent = n.text.text;
      const c = n.text.color;
      Object.assign(tx.style, {
        width: '100%', height: '100%',
        fontSize: `${n.text.size}px`,
        color: `rgba(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)},${c[3]})`,
        alignItems: ['flex-start','flex-start','flex-start','center','center','center',
                     'flex-end','flex-end','flex-end'][Math.min(8, n.text.align)] || 'center',
        justifyContent: ['flex-start','center','flex-end'][n.text.align % 3] || 'center',
        fontWeight: (n.text.style === 1 || n.text.style === 3) ? 'bold' : 'normal',
      });
      if (!n.text.enabled) tx.style.display = 'none';
      el.appendChild(tx);
      rec.txt = tx;
    }
    made[p] = rec;
  }
  return made;
}

/* --------------------------------------------------------------- viewport */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  $('#stage').style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit);

/* ------------------------------------------------------------------ audio */
/* HTMLAudioElement rather than WebAudio: decodeAudioData needs the bytes, and
   fetching them is blocked under file://.  A small pool per clip lets the same
   sound overlap, which the rally needs. */
const Audio_ = {
  ready: false, pool: {}, POOL: 4,
  async load(names) {
    for (const n of names) {
      const els = [];
      for (let i = 0; i < this.POOL; i++) {
        const a = new Audio(`assets/snd/${n}.mp3`);
        a.preload = 'auto'; els.push(a);
      }
      this.pool[n] = { els, i: 0 };
    }
  },
  unlock() {
    if (this.ready) return;
    this.ready = true;
    for (const p of Object.values(this.pool)) {
      for (const a of p.els) { a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(() => {}); }
    }
  },
  play(n, vol = 1) {
    const p = this.pool[n];
    if (!p) return;
    const a = p.els[p.i]; p.i = (p.i + 1) % p.els.length;
    try { a.currentTime = 0; a.volume = vol; a.play().catch(() => {}); } catch (e) {}
    return a;
  },
  loop(n, vol = 1) {
    const a = this.play(n, vol);
    if (a) a.loop = true;
    return a;
  },
};

/* ------------------------------------------------------------------- util */
const wait = ms => new Promise(r => setTimeout(r, ms));
/* UnityEngine.Random.Range(int,int) is max-exclusive. */
const randRange = (a, b) => a + Math.floor(Math.random() * (b - a));

window.G = G; window.Audio_ = Audio_;
window.__port = { resolveRect, drawSprite, buildScene, spriteRec, randRange, fit, Anim };

/* ============================================================== Core engine
 * A transcription of `Core` (token 0x0200002D) and its coroutines.  Unity's
 * `yield return new WaitForSeconds(t)` becomes `await this.wait(t)`, which also
 * carries the IsGamePause gate the original spells out as a WaitForEndOfFrame
 * spin before every yield.
 */
const SeqState = { From: 0, To: 1, Lose: 2, ManBLose: 3 };          // Core/SequenceStates
const Miss = { TooLate: 0, TooEarly: 1, WrongSide: 2, None: 3 };    // Core/MissHitState

/* Core::.ctor 0x216C4 */
const CTOR = {
  BallTrailFrameInterval: 0.023,
  ManBSwingAnimDelay:     0.040,
  LoseBallTrailAnimDelay: 0.030,
  ToBallTrailAnimDelay:   0.023,
  FromBallTrailAnimDelay: 0.023,
};
/* Core::.ctor 0x216C4 -- the two standing tables.  "Normal" is the pre-stage-2
 * game (ManA never uses A3); "Galaxy" is stage 2 and up. */
const STAND_NORMAL = {
  A1: { L: 'B1', R: 'B1' }, A2: { L: 'B1', R: 'B1' }, B1: { L: 'A1', R: 'A2' },
};
const STAND_GALAXY = {
  A1: { L: 'B2', R: 'B1' }, A2: { L: 'B3', R: 'B1' }, A3: { L: 'B3', R: 'B1' },
  B1: { L: 'A1', R: 'A2' }, B2: { L: 'A1', R: 'A3' }, B3: { L: 'A1', R: 'A3' },
};

class Core {
  constructor(sceneName, nodes) {
    this.sceneName = sceneName;
    this.nodes = nodes;
    this.cfg = G.data.core[sceneName];
    this.trails = G.data.trails[sceneName];
    this.gen = 0;

    // one Anim per ball-trail node, keyed the way the C# dictionaries are
    this.trailAnim = {};
    for (const name of Object.keys(this.trails)) {
      const rec = nodes[`Canvas/Core/BallTrail Group/${name}`];
      if (!rec) continue;
      rec.el.style.display = 'none';
      this.trailAnim[name] = new Anim(rec.el, rec.rect.w, rec.rect.h);
    }
    const mk = p => {
      const rec = nodes[p];
      if (!rec) return null;
      if (rec.img) rec.img.remove();
      return new Anim(rec.el, rec.rect.w, rec.rect.h);
    };
    this.manA   = mk('Canvas/Core/ManA Group/ManA Image');
    this.manAA3 = mk('Canvas/Core/ManA Group/ManAA3 Image');
    this.manB   = mk('Canvas/Core/ManB Group/ManB Image');
    this.manBB3 = mk('Canvas/Core/ManB Group/ManBB3 Image');
    this.table  = mk('Canvas/Core/Table Image');
    this.tableEffect = mk('Canvas/Core/Table Image/TouchTableEffect Image');

    this.reset();
  }

  reset() {
    const f = this.cfg.frames;
    this.IsAbleToHitBack = false;
    this.IsHitBack = false;
    this.IsInSwingColddown = false;
    this.IsSwingHard = false;
    this.IsManBLoseAtThisRound = false;
    this.IsGamePause = false;
    this.WillReadyFightShow = false;
    this.SequenceState = SeqState.From;
    this.ManAHitPos = 'A1'; this.ManACurPos = 'A1';
    this.ManBCurPos = 'B1'; this.ManBNextPos = 'B1';
    this.MissHitInfo = Miss.None;
    this.curSpriteIndex = 0;
    this.hitBackStartFrame = f.hitBackStartFrame;
    this.hitBackEndFrame = f.hitBackEndFrame;
    this.changeToLoseSequenceFrame = f.changeToLoseSequenceFrame;
    this.touchManATableFrame = f.touchManATableFrame;
    this.touchManBTableFrame = f.touchManBTableFrame;
    this.FromBallTrailAnimDelay = CTOR.FromBallTrailAnimDelay;
    this.ToBallTrailAnimDelay = CTOR.ToBallTrailAnimDelay;
    this.LoseBallTrailAnimDelay = CTOR.LoseBallTrailAnimDelay;
    this.ManASwingSequenceTmp = this.cfg.NormalSwingSequence;
    this.ManAA3SwingSequenceTmp = this.cfg.NormalA3SwingSequence;
    this.ManBSwingSequenceTmp = this.cfg.NormalSwingSequence;
    this.ManBB3SwingSequenceTmp = this.cfg.NormalB3SwingSequence;
    this.BallTrailSequenceTmp = [];
    this.curTrail = null;
    for (const a of Object.values(this.trailAnim)) a.show(false);
  }

  /* the IsGamePause gate the coroutines spin on before every WaitForSeconds */
  async wait(sec) {
    const g = this.gen;
    await wait(sec * 1000);
    while (this.IsGamePause && g === this.gen) await wait(16);
    return g === this.gen;
  }

  /* Core::ChangeTrailImage 0x21DAC -- hides the previous trail image, makes the
   * named one the live one, and (From only) parks the table effect. */
  ChangeTrailImage(name) {
    if (this.curTrail && this.trailAnim[this.curTrail]) {
      this.trailAnim[this.curTrail].set(this.cfg.NothingSprite);
      this.trailAnim[this.curTrail].show(false);
    }
    if (!this.trails[name]) return;
    this.curTrail = name;
    this.trailAnim[name].setTint([0, 0, 0, 1]);      // BallTrailImageTmp.color = black
    this.trailAnim[name].show(true);
    const t = this.trails[name];
    if (t.kind === 'From' && this.tableEffect) {
      /* TouchEffectPos - (0,102,0)*UIScaleFactor; the port runs at scale 1. */
      const host = this.nodes['Canvas/Core/Table Image'];
      const p = this.nodes['Canvas/Core/Table Image/TouchTableEffect Image'];
      if (host && p) {
        p.el.style.left = `${host.rect.w / 2 + t.effect[0] - p.rect.w / 2}px`;
        p.el.style.top = `${host.rect.h / 2 - (t.effect[1] - 102) - p.rect.h / 2}px`;
      }
    }
  }

  /* Core::ChangeSequence 0x21EFC */
  ChangeSequence(name) {
    const t = this.trails[name];
    if (!t) return;
    if (t.kind === 'From') {
      this.hitBackStartFrame = t.hitStart;
      this.hitBackEndFrame = t.hitEnd;
      this.changeToLoseSequenceFrame = t.toLose;
      this.touchManATableFrame = t.touchTable;
      this.BallTrailSequenceTmp = t.frames;
    } else if (t.kind === 'To') {
      this.BallTrailSequenceTmp = t.frames;
      this.touchManBTableFrame = t.touchTable;
    } else {
      this.BallTrailSequenceTmp = t.frames;
      this.LoseBallTrailAnimDelay = t.interval;     // SetLoseBallFrameInterval
    }
  }

  trailSet(i) {
    const a = this.trailAnim[this.curTrail];
    if (a) a.set(this.BallTrailSequenceTmp[i]);
  }

  /* Core::TouchTableEffectAnim -- 0.018 s per frame */
  async TouchTableEffectAnim() {
    const g = this.gen;
    for (const s of this.cfg.TableEffectSpriteSequence) {
      if (g !== this.gen) return;
      if (this.tableEffect) this.tableEffect.set(s);
      await this.wait(0.018);
    }
    if (this.tableEffect) this.tableEffect.set(this.cfg.NothingSprite);
  }

  /* Core::ManASwing 0x21D2C -> ManASwingAnim (iterator 5) */
  ManASwing() { this.ManASwingAnim(); }

  async ManASwingAnim() {
    const g = this.gen;
    this.IsInSwingColddown = true;
    const hit = this.IsAbleToHitBack && this.ManACurPos === this.ManAHitPos;

    if (this.ManACurPos === 'A3') {
      if (hit) {
        this.IsAbleToHitBack = false;
        this.MissHitInfo = Miss.None;
        this.manA.show(false); this.manAA3.show(true);
        /* the rest of the incoming flight is compressed into 0.207 s */
        this.FromBallTrailAnimDelay =
            0.207 / (this.hitBackEndFrame - this.curSpriteIndex);
        const seq = this.ManAA3SwingSequenceTmp;
        for (let i = 0; i < seq.length; i++) {
          if (g !== this.gen) return;
          if (i === 6) { Audio_.play('Hit1'); this.IsHitBack = true; }
          this.manAA3.set(seq[i]);
          if (!await this.wait(0.023)) return;
        }
        this.IsHitBack = false;
        if (!await this.wait(0.023)) return;
      } else {
        /* [sic] the A3 branch tests SequenceState > 2 for TooLate, while the
         * A1/A2 branch below tests == 2.  0x21A60 vs 0x21C40. */
        if (this.ManACurPos !== this.ManAHitPos) this.MissHitInfo = Miss.WrongSide;
        else if (this.SequenceState > SeqState.Lose) this.MissHitInfo = Miss.TooLate;
        else if (this.curSpriteIndex < this.hitBackStartFrame) this.MissHitInfo = Miss.TooEarly;
        this.manA.show(false); this.manAA3.show(true);
        const seq = this.ManAA3SwingSequenceTmp;
        for (let i = 0; i < seq.length; i++) {
          if (g !== this.gen) return;
          this.manAA3.set(seq[i]);
          if (!await this.wait(0.023)) return;
        }
        this.IsHitBack = false;
        if (!await this.wait(0.023)) return;
      }
      this.manA.show(true); this.manAA3.show(false);
      this.manA.set(this.ManASwingSequenceTmp[0]);
    } else {
      if (hit) {
        /* [sic] unlike A3, this branch flags the hit before the swing plays and
         * never rescales FromBallTrailAnimDelay -- 0x21BA0. */
        this.IsHitBack = true;
        this.IsAbleToHitBack = false;
        this.MissHitInfo = Miss.None;
        Audio_.play('Hit1');
      } else {
        if (this.ManACurPos !== this.ManAHitPos) this.MissHitInfo = Miss.WrongSide;
        else if (this.SequenceState === SeqState.Lose) this.MissHitInfo = Miss.TooLate;
        else if (this.curSpriteIndex < this.hitBackStartFrame) this.MissHitInfo = Miss.TooEarly;
      }
      this.manA.show(true); this.manAA3.show(false);
      const seq = this.ManASwingSequenceTmp;
      for (let i = 0; i < seq.length; i++) {
        if (g !== this.gen) return;
        this.manA.set(seq[i]);
        if (!await this.wait(0.023)) return;
      }
      this.manA.set(seq[0]);
    }
    this.IsInSwingColddown = false;
  }

  /* Core::ManBSwing (iterator 2) -- 0.04 s per frame, ManBSwingAnimDelay */
  async ManBSwing() {
    const g = this.gen;
    Audio_.play('Hit2');                           // Audios.PingPongEnemy
    const seq = this.ManBSwingSequenceTmp;
    for (let i = 0; i < seq.length; i++) {
      if (g !== this.gen) return;
      this.manB.set(seq[i]);
      if (!await this.wait(CTOR.ManBSwingAnimDelay)) return;
    }
    this.manB.set(seq[0]);
  }

  /* Core::ManBTossBallAnim (iterator 0) */
  async ManBTossBallAnim() {
    const g = this.gen;
    for (const s of this.cfg.ManBTossBallSequence) {
      if (g !== this.gen) return;
      this.manB.set(s);
      if (!await this.wait(CTOR.ManBSwingAnimDelay)) return;
    }
  }

  ManBMove() { /* Core::ManBMove -- LeanTween hop; position is set by the scene */ }

  StopRun() { this.gen++; }

  /* Core::BallTrailAnim (iterator 1) -- the whole rally */
  async BallTrailAnim() {
    this.gen++;
    const g = this.gen;
    const alive = () => g === this.gen;

    this.IsManBLoseAtThisRound = false;
    this.ManASwingSequenceTmp = this.cfg.NormalSwingSequence;
    this.ManAA3SwingSequenceTmp = this.cfg.NormalA3SwingSequence;
    this.ManBSwingSequenceTmp = this.cfg.NormalSwingSequence;
    this.ManBB3SwingSequenceTmp = this.cfg.NormalB3SwingSequence;
    this.curSpriteIndex = 0;
    this.MissHitInfo = Miss.None;

    if (this.WillReadyFightShow) {
      this.onReadyFight && this.onReadyFight();
      if (!await this.wait(2.1)) return;
    }
    if (!await this.wait(0.5)) return;

    this.ManBTossBallAnim();
    if (!await this.wait(0.2)) return;

    /* toss trail: TossBallTrailImage, 0.04 s a frame */
    this.ChangeTrailImage('TossBallTrail Image');
    this.BallTrailSequenceTmp = this.cfg.TossBallTrialSequence;
    for (let i = 0; i < this.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return;
      this.trailSet(i);
      if (!await this.wait(0.04)) return;
    }

    this.ManBSwing();
    this.ChangeTrailImage('FirstBallTrail Image');
    this.ChangeSequence('FirstBallTrail Image');

    /* the serve, at a fixed 0.028 s a frame */
    for (let i = 0; i < this.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return;
      this.trailSet(i);
      if (i === this.hitBackStartFrame) {
        this.IsAbleToHitBack = true;
        this.TouchTableEffectAnim();
      }
      if (i === this.hitBackEndFrame - 2) this.ChangeTrailImage('Lose-B1-A1 Image');
      if (i === this.hitBackEndFrame) {
        this.IsAbleToHitBack = false;
        if (!this.IsHitBack) {
          this.SequenceState = SeqState.Lose;
          this.ManAA3SwingSequenceTmp = this.cfg.BlackA3SwingSequence;
          this.ManASwingSequenceTmp = this.cfg.BlackSwingSequence;
          /* [sic] ManBSwingSequenceTmp is assigned BlackB3 then immediately
           * overwritten with BlackSwing -- the B3 line is dead.  0x2032C */
          this.ManBSwingSequenceTmp = this.cfg.BlackB3SwingSequence;
          this.ManBSwingSequenceTmp = this.cfg.BlackSwingSequence;
          this.ChangeSequence('Lose-B1-A1 Image');
          this.Lose_Delegate && this.Lose_Delegate();
          this.curSpriteIndex = 0;
        }
      }
      if (this.IsHitBack) {
        this.SequenceState = SeqState.To;
        this.IsHitBack = false;
        this.Set_ToBall_Delegate && this.Set_ToBall_Delegate();
        this.curSpriteIndex = 0;
        break;
      }
      if (!await this.wait(0.028)) return;
    }

    /* ---- the rally proper (IL_0616) */
    for (;;) {
      if (!alive()) return;
      const seq = this.BallTrailSequenceTmp;
      const last = seq.length - 1;

      if (this.SequenceState === SeqState.From) {
        this.trailSet(this.curSpriteIndex);
        if (this.curSpriteIndex === this.hitBackStartFrame) {
          this.IsAbleToHitBack = true;
          this.TouchTableEffectAnim();
        }
        if (this.IsHitBack) {
          this.SequenceState = SeqState.To;
          this.IsHitBack = false;
          this.Set_ToBall_Delegate && this.Set_ToBall_Delegate();
          this.curSpriteIndex = 0;
          if (!await this.wait(this.FromBallTrailAnimDelay)) return;
          continue;                                    // no index++ on a transition
        }
        if (this.curSpriteIndex === this.changeToLoseSequenceFrame) {
          this.ChangeTrailImage(`Lose-${this.ManBCurPos}-${this.ManAHitPos} Image`);
        }
        if (this.curSpriteIndex === last) {
          this.IsAbleToHitBack = false;
          if (this.IsHitBack) {
            this.SequenceState = SeqState.To;
            this.MissHitInfo = Miss.None;
            this.IsHitBack = false;
            this.Set_ToBall_Delegate && this.Set_ToBall_Delegate();
          } else {
            this.SequenceState = SeqState.Lose;
            this.ManAA3SwingSequenceTmp = this.cfg.BlackA3SwingSequence;
            this.ManASwingSequenceTmp = this.cfg.BlackSwingSequence;
            this.ManBSwingSequenceTmp = this.cfg.BlackB3SwingSequence;   // [sic] dead
            this.ManBSwingSequenceTmp = this.cfg.BlackSwingSequence;
            this.ChangeSequence(`Lose-${this.ManBCurPos}-${this.ManAHitPos} Image`);
            this.Lose_Delegate && this.Lose_Delegate();
          }
          this.curSpriteIndex = 0;
          if (!await this.wait(this.FromBallTrailAnimDelay)) return;
          continue;
        }
        if (this.curSpriteIndex === this.touchManATableFrame) {
          this.Touch_ManA_Table_Delegate && this.Touch_ManA_Table_Delegate();
          Audio_.play('Hit2');                       // Audios.TouchTable
        }
        if (!await this.wait(this.FromBallTrailAnimDelay)) return;

      } else if (this.SequenceState === SeqState.To) {
        this.trailSet(this.curSpriteIndex);
        if (this.ManBNextPos === 'B3') {
          if (this.curSpriteIndex === seq.length - 15) {
            this.Touch_ManB_Table_Delegate && this.Touch_ManB_Table_Delegate();
            this.ManBMove();
          }
        } else if (!this.IsSwingHard) {
          if (this.curSpriteIndex === last) {
            this.Touch_ManB_Table_Delegate && this.Touch_ManB_Table_Delegate();
            this.ManBMove();
          }
        } else if (this.curSpriteIndex === seq.length - 4) {
          this.Touch_ManB_Table_Delegate && this.Touch_ManB_Table_Delegate();
          this.ManBMove();
        }
        if (this.curSpriteIndex === last) {
          this.Set_FromBall_Delegate && this.Set_FromBall_Delegate();
          this.curSpriteIndex = 0;
          if (!await this.wait(this.ToBallTrailAnimDelay)) return;
          continue;
        }
        if (!await this.wait(this.ToBallTrailAnimDelay)) return;

      } else {                                        // Lose / ManBLose
        if (this.curSpriteIndex === last) { this.onRallyEnd && this.onRallyEnd(); return; }
        this.trailSet(this.curSpriteIndex);
        if (!await this.wait(this.LoseBallTrailAnimDelay)) return;
      }

      while (this.IsGamePause && alive()) await wait(16);
      if (!alive()) return;
      this.curSpriteIndex++;
    }
  }
}
window.Core = Core;
Object.assign(window, { SeqState, Miss, STAND_NORMAL, STAND_GALAXY, CTOR });

/* =========================================================== RivalModeModel
 * RivalModeModel (token 0x02000073).  The level table and the group table are
 * the two JSON literals baked into its .ctor at IL_0001 and IL_000C.
 */
const MovementType = { VerySlow: 0, Slow: 1, VeryFast: 2, Fast: 3, Normal: 4 };
const SpeedType = { Nothing: 0, Impulse: 1, ImpulseEaseIn: 2, ImpulseEaseOut: 3 };

class RivalModeModel {
  constructor() {
    this.levels = G.data.levels;
    this.groups = {};
    for (const g of G.data.groups) {
      this.groups[g.GroupName] = {
        first: g.FirstVariationIndexs, second: g.SecondVariationIndexs,
      };
    }
    this.firstRoundData = { IsFromLeft: false, MovementType: MovementType.Normal,
                            SpeedType: SpeedType.Nothing };
    this.curRoundData = this.firstRoundData;
    this.nextRoundData = this.firstRoundData;
    this.CurLevelGroupSequence = [];
  }

  /* RivalModeModel::LoadLevelProb 0x2EAA4, totalEnemyNum == 50 branch (the
   * default: GameMgr::Init 0x27EC gives a virgin DB set "D", 50 enemies). */
  LoadLevelProb(stageOrder) {
    let o = stageOrder;
    if (o >= 25 && o < 75)        o = randRange(10, 25);
    else if (o >= 75 && o < 135)  o = randRange(25, 50);
    else if (o >= 135 && o < 245) o = randRange(50, 75);
    else if (o >= 245)            o = o - 170;

    const L = this.levels.find(x => +x.StageOrder === o) || this.levels[0];
    this.cur = L;
    const P = k => parseFloat(L[k]);
    this.groupEasyProb = P('GroupEasyProb');
    this.groupNormalProb = P('GroupNormalProb');
    this.groupMiddleProb = P('GroupMiddleProb');
    this.groupHardProb = P('GroupHardProb');
    this.groupExpertProb = P('GroupExpertProb');
    this.groupExtremeProb = P('GroupExtremeProb');
    this.Goal = parseInt(L.Goal, 10);
    this.relaxIndex = parseInt(L.RelaxIndex, 10);
    this.enemySideFrameInterval = P('EnemySideFrameInterval');
    this.playerSideFrameInterval = P('PlayerSideFrameInterval');
    this.middleFrameInterval = P('MiddleFrameInterval');
    this.enemyName = L.EnemyName;

    const S = this.CurLevelGroupSequence = [];
    const add = (g, n) => { for (let i = 0; i < n; i++) S.push(g); };
    if (this.relaxIndex >= 1 && this.relaxIndex <= 4) {
      add(`Group_Relax${this.relaxIndex}`, this.Goal);
      return;
    }
    const g = this.Goal;
    let n = 0;
    const parts = [['Group_Easy', this.groupEasyProb], ['Group_Normal', this.groupNormalProb],
                   ['Group_Middle', this.groupMiddleProb], ['Group_Hard', this.groupHardProb],
                   ['Group_Expert', this.groupExpertProb], ['Group_Extreme', this.groupExtremeProb]];
    for (const [name, p] of parts) { const c = Math.trunc(p * g / 100); n += c; add(name, c); }

    /* top-up to Goal by rolling 0..99 against the cumulative bands */
    const e = this.groupEasyProb, no = this.groupNormalProb, mi = this.groupMiddleProb,
          ha = this.groupHardProb, ex = this.groupExpertProb;
    for (; n < g; n++) {
      const r = randRange(0, 100);
      if (r < e) add('Group_Easy', 1);
      else if (r >= e && r < e + no) add('Group_Normal', 1);
      else if (r >= e + no && r < e + no + mi) add('Group_Middle', 1);
      else if (r >= e + no + mi && r < e + no + mi + ha) add('Group_Hard', 1);
      else if (r >= e + no + mi + ha && r < e + no + mi + ha + ex) add('Group_Expert', 1);
      /* [sic] the Group_Extreme band is `r >= sum && r < sum` with the same sum
       * on both sides -- its own probability was left out of the upper bound --
       * so this branch can never run.  Extreme only ever arrives from the
       * proportional pass above.  0x2E... IL_070F. */
    }
    this.Goal = this.CurLevelGroupSequence.length + 1;
  }

  Level_Goal() { return this.Goal; }

  /* RivalModeModel::BallData 0x2F4B0 */
  BallData(prev, fv, sv) {
    const d = { IsFromLeft: false, MovementType: 0, SpeedType: 0 };
    switch (fv) {
      case 1: d.MovementType = prev.MovementType; break;                    // ChangeNothing
      case 2:                                                               // ChangeFastSlow
        if (prev.MovementType === MovementType.Slow) d.MovementType = MovementType.Fast;
        else if (prev.MovementType === MovementType.Fast) d.MovementType = MovementType.Slow;
        break;
      case 3:                                                               // ChangeDirection
        d.IsFromLeft = !prev.IsFromLeft;
        d.MovementType = prev.MovementType;
        break;
      case 4:                                                               // both
        if (prev.MovementType === MovementType.Slow) d.MovementType = MovementType.Fast;
        else if (prev.MovementType === MovementType.Fast) d.MovementType = MovementType.Slow;
        d.IsFromLeft = !prev.IsFromLeft;
        break;
    }
    switch (sv) {
      case 1: d.SpeedType = SpeedType.Nothing; break;
      case 2: d.MovementType = MovementType.Fast; d.SpeedType = SpeedType.Impulse; break;
      case 3: d.MovementType = MovementType.Fast; d.SpeedType = SpeedType.ImpulseEaseOut; break;
      case 4: d.MovementType = MovementType.Slow; d.SpeedType = SpeedType.ImpulseEaseIn; break;
      case 5: d.IsFromLeft = prev.IsFromLeft; d.SpeedType = SpeedType.Nothing; break;  // SuddenlySlow
    }
    return d;
  }

  /* RivalModeModel::Level_GetRoundDataAndDelete 0x2F2E8 */
  Level_GetRoundDataAndDelete(round) {
    const S = this.CurLevelGroupSequence;
    if (!S.length) { this.curRoundData = this.nextRoundData; return this.curRoundData; }
    const name = S[randRange(0, S.length)];
    const g = this.groups[name];
    const fv = g.first[randRange(0, g.first.length)];
    const sv = g.second[randRange(0, g.second.length)];
    S.splice(S.indexOf(name), 1);                       // List<T>.Remove: first match
    this.curRoundData = round ? this.nextRoundData : this.BallData(this.firstRoundData, fv, sv);
    this.nextRoundData = this.BallData(this.curRoundData, fv, sv);
    return this.curRoundData;
  }
  Level_GetNextRoundData() { return this.nextRoundData; }
}

Object.assign(window, { RivalModeModel, MovementType, SpeedType });

/* ============================================================ RivalModeScene */
class RivalModeScene {
  constructor(host, stageOrder) {
    host.innerHTML = '';
    this.nodes = buildScene('RivalModeScene', host);
    this.core = new Core('RivalModeScene', this.nodes);
    this.model = new RivalModeModel();
    this.stageOrder = stageOrder;
    this.hideChrome();
    this.wireInput();
  }

  n(p) { return this.nodes[p]; }
  hide(p) { const r = this.n(p); if (r) r.el.style.display = 'none'; }
  show(p) { const r = this.n(p); if (r) r.el.style.display = ''; }
  setText(p, s) { const r = this.n(p); if (r && r.txt) r.txt.textContent = s; }

  /* The scene ships with every panel present; the mode screens are switched on
   * by Reset_EnterGame.  Hide the ones a rally does not use. */
  hideChrome() {
    for (const p of ['Canvas/Bridge Group', 'Canvas/BridgeGroupDavid',
                     'Canvas/Core/FightDialog Image', 'Canvas/Core/ReadyDialog Image',
                     'Canvas/FingerTouch Image', 'Canvas/GameHackWin Image',
                     'Canvas/GameHackLose Image', 'Canvas/Core/TapToRestart Text',
                     'Canvas/Core/HitNow Text',
                     'Canvas/Core/ManB Group/ManBFirstLook Image',
                     'Canvas/Core/ManA Group/ManAWinLose Image',
                     'Canvas/Core/ManB Group/ManBWinLose Image',
                     'Canvas/Core/ManA Group/ManA Image/ManASuprise Image',
                     'Canvas/Core/ManB Group/ManB Image/ManBSurprise Image',
                     'Canvas/Core/ManA Group/ManA Image/SweetSpot Group',
                     'Canvas/Core/Table Image/HitOnTableNotification Image',
                     'Canvas/Top Group/ReviveScorePad Image',
                     'Canvas/Preview Image', 'Canvas/Share Group', 'Canvas/Revive Group',
                     'Canvas/TournamentBridgeGroup', 'Canvas/Result Group',
                     'Canvas/Core/LeftTouch Mask', 'Canvas/Core/RightTouch Mask',
                     'Canvas/Core/LeftTouchGround Mask', 'Canvas/Core/RightTouchGround Mask',
                     'Canvas/Core/ManBLeftTouchGround Mask',
                     'Canvas/Core/ManBRightTouchGround Mask']) this.hide(p);
    /* The score pads are flip cards: Long is the resting face, Top/Bottom are
       the halves ScorePad animates.  Show the resting face. */
    for (const p of ['Canvas/Top Group/PlayerScorePad Group/PlayerScoreLong Group/PlayerScorePad Image (1)',
                     'Canvas/Top Group/EnemyScorePadTotal Group/EnemyScoreLong Group/EnemyScorePad Image (1)']) {
      const r = this.n(p);
      if (r && r.img) { r.img.style.opacity = 1; r.img.style.display = ''; }
      const t = this.n(p + (p.includes('Enemy') ? '/EnemyScore Text' : '/PlayerScore Text'));
      if (t && t.txt) { t.txt.style.color = '#161616'; t.txt.style.display = ''; }
    }
    this.core.manBB3.show(false);
    this.core.manAA3.show(false);
  }

  /* RivalModeScene::Reset_EnterGame 0x33C08 (the parts that set up a rally) */
  enter() {
    const m = this.model;
    m.LoadLevelProb(this.stageOrder);
    this.RoundCount = 0;
    this.PlayerScore = 0;
    this.EnemyScore = 0;
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;
    this.EnemySideFrameInterval = m.enemySideFrameInterval;

    const c = this.core;
    c.reset();
    c.ManACurPos = 'A1'; c.ManAHitPos = 'A1';
    c.ManBCurPos = 'B1'; c.ManBNextPos = 'B1';
    c.manA.set(c.cfg.NormalSwingSequence[0]);
    c.manB.set(c.cfg.NormalSwingSequence[0]);
    c.table.set(c.cfg.NormalTableSprite);

    c.Set_FromBall_Delegate = () => this.SetFromBall();
    c.Set_ToBall_Delegate = () => this.SetToBall();
    c.Lose_Delegate = () => this.Lose();
    c.Touch_ManA_Table_Delegate = () => this.Touch_ManA_Table();
    c.Touch_ManB_Table_Delegate = () => this.Touch_ManB_Table();
    c.onRallyEnd = () => this.onRallyEnd();

    for (const p of ['Canvas/Core/ManB Group/ManB Image/ManBNameLine1 Text',
                     'Canvas/Core/ManB Group/ManB Image/ManBNameLine2 Text',
                     'Canvas/Core/ManB Group/ManB Image/RemainBall Image/NumOfRemainBall Text']) {
      const r = this.n(p);
      if (r && r.txt) { r.txt.style.color = '#161616'; r.txt.style.display = ''; }
    }
    const rb = this.n('Canvas/Core/ManB Group/ManB Image/RemainBall Image');
    if (rb) {
      rb.el.style.display = '';                    // ships inactive; the rally shows it
      if (rb.img) { rb.img.style.opacity = 1; rb.img.style.display = ''; }
    }
    this.setText('Canvas/Core/ManB Group/ManB Image/ManBNameLine1 Text',
                 `#${this.stageOrder + 1}`);
    this.setText('Canvas/Core/ManB Group/ManB Image/ManBNameLine2 Text',
                 m.enemyName || '');
    this.updateHUD();
    c.BallTrailAnim();
  }

  updateHUD() {
    this.setText('Canvas/Top Group/PlayerScorePad Group/PlayerScoreLong Group/PlayerScorePad Image (1)/PlayerScore Text',
                 String(this.PlayerScore));
    this.setText('Canvas/Top Group/EnemyScorePadTotal Group/EnemyScoreLong Group/EnemyScorePad Image (1)/EnemyScore Text',
                 String(this.EnemyScore));
    this.setText('Canvas/Core/ManB Group/ManB Image/RemainBall Image/NumOfRemainBall Text',
                 `x ${Math.max(0, this.model.Level_Goal() - this.RoundCount)}`);
  }

  standing() {
    /* SetFromBall 0x30778: OutterStageOrder > 1 uses the Galaxy table. */
    return this.stageOrder > 1 ? STAND_GALAXY : STAND_NORMAL;
  }

  /* RivalModeScene::SetFromBall 0x30778 */
  SetFromBall() {
    const c = this.core, m = this.model;
    c.ManBCurPos = c.ManBNextPos;
    if (m.Level_Goal() - this.RoundCount === 0) {
      c.SequenceState = SeqState.ManBLose;
      c.ChangeTrailImage(`Lose-${c.ManAHitPos}-${c.ManBNextPos} Image`);
      c.ChangeSequence(`Lose-${c.ManAHitPos}-${c.ManBNextPos} Image`);
      c.LoseBallTrailAnimDelay = 0.04;             // SetLoseBallFrameInterval(0.04)
      this.PlayerScore++;
      this.updateHUD();
      Audio_.play('Herray', 0.7);
      this.won = true;
      return;
    }
    c.SequenceState = SeqState.From;
    this.CurRoundData = m.Level_GetRoundDataAndDelete(this.RoundCount);
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;

    const tbl = this.standing();
    const e = tbl[c.ManBCurPos] || tbl.B1;
    c.ManAHitPos = this.CurRoundData.IsFromLeft ? e.L : e.R;

    if (c.ManBCurPos === 'B2') {
      const v = randRange(1, 4);                    // Random.Range(1,4) -> 1..3
      c.ManAHitPos = (v < 2) ? 'A3' : 'A1';
    }
    if (c.ManBCurPos === 'B2' || c.ManBCurPos === 'B3') {
      this.CurRoundData.MovementType = MovementType.Fast;
      this.CurRoundData.SpeedType = SpeedType.Nothing;
      c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.85;
    }

    if (this.CurRoundData.MovementType === MovementType.Slow) {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos}-Slow Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      /* LeanTween.value: MiddleFrameInterval*0.4 -> MiddleFrameInterval over
       * MiddleFrameInterval*6 seconds, feeding SetFromBallFrameInterval. */
      this.tweenInterval(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval,
                         this.MiddleFrameInterval * 6);
    } else {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos} Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      if (this.CurRoundData.SpeedType === SpeedType.ImpulseEaseOut) {
        const o = this.stageOrder;
        let k, ps = 0.7;
        if (o <= 3) k = 0.4;
        else if (o <= 5) k = 0.3;
        else if (o <= 7) k = 0.27;
        else { k = 0.24; ps = 0.64; }
        c.FromBallTrailAnimDelay = this.MiddleFrameInterval * k;
        this.PlayerSideFrameInterval *= ps;
      } else {
        c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.9;
        this.PlayerSideFrameInterval *= 0.9;
      }
    }
    this.updateHUD();
  }

  tweenInterval(from, to, dur) {
    const c = this.core, g = c.gen, t0 = performance.now();
    const step = () => {
      if (g !== c.gen) return;
      const t = Math.min(1, (performance.now() - t0) / (dur * 1000));
      c.FromBallTrailAnimDelay = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* RivalModeScene::SetToBall 0x30B60 */
  SetToBall() {
    const c = this.core, m = this.model;
    this.RoundCount++;
    this.NextRoundData = m.Level_GetNextRoundData();
    if (m.Level_Goal() - this.RoundCount === 0) c.IsManBLoseAtThisRound = true;
    const v = randRange(0, 2);
    const tbl = this.standing();
    /* the lookup is keyed on where the ball HAD to be met, not where ManA
       currently stands -- <SetToBall>m__8 0x352B6 */
    const e = tbl[c.ManAHitPos] || tbl.A1;
    c.ManBNextPos = v === 0 ? e.L : e.R;
    if (c.ManAHitPos === 'A2') c.ManBNextPos = 'B1';
    /* a hard swing unless the next ball is slow and not headed to B3 */
    c.IsSwingHard = (this.NextRoundData.MovementType !== MovementType.Slow) ||
                    (c.ManBNextPos === 'B3');
    const nm = `To-${c.ManAHitPos}-${c.ManBNextPos} Image`;
    c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    /* The sweet spot: meeting the ball in the first 6 frames of the window
       returns it at 0.4x the interval and thumps; later, 0.7x. */
    if (c.curSpriteIndex < c.hitBackStartFrame + 6) {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.4;
      this.isHitSweetSpot = true;
      Audio_.play('HardHit');                      // Audios.ManAUseForce
    } else {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.7;
      this.isHitSweetSpot = false;
    }
    this.updateHUD();
  }

  /* RivalModeScene::Touch_ManA_Table 0x30EAC */
  Touch_ManA_Table() {
    const c = this.core;
    let k = 1;
    if (c.ManAHitPos === 'A3') {
      if (this.stageOrder < 8) k = c.ManBCurPos === 'B3' ? 1.0 : c.ManBCurPos === 'B2' ? 1.3 : null;
      else                     k = c.ManBCurPos === 'B3' ? 1.1 : c.ManBCurPos === 'B2' ? 1.45 : null;
      if (k === null) return;                       // neither B2 nor B3: interval untouched
    }
    c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * k;
  }

  /* RivalModeScene::Touch_ManB_Table 0x30FD4 -- [sic] both arms of the
   * isHitSweetSpot test set the same 1.1 multiplier. */
  Touch_ManB_Table() {
    this.core.ToBallTrailAnimDelay = this.model.middleFrameInterval * 1.1;
  }

  /* RivalModeScene::Lose 0x30E2C */
  Lose() {
    this.EnemyScore++;
    Audio_.play('Lose');
    this.updateHUD();
    this.flashBg();
    this.lost = true;
  }

  flashBg() {
    const bg = this.n('Canvas/Bg Image');
    if (!bg) return;
    bg.el.style.transition = 'none';
    bg.el.style.background = '#fff';
    requestAnimationFrame(() => {
      bg.el.style.transition = 'background .3s';
      bg.el.style.background = '';
    });
  }

  onRallyEnd() {
    if (this.won) this.winBanner('YOU WIN THE BALL');
    else {
      /* MissHitInfoText carries the reason; the strings are the scene's own. */
      this.banner(['Tapped too late!', 'Tapped too early!', 'Wrong side!', ''][this.core.MissHitInfo]);
      this.winBanner('YOU LOSE THE BALL');
    }
    setTimeout(() => { this.won = false; this.lost = false; this.Reset_WinBall(); }, 900);
  }

  /* Canvas/Top Group/WinLoseBall Text -- the node Reset_WinBall disables. */
  winBanner(s) {
    const r = this.n('Canvas/Top Group/WinLoseBall Text');
    if (!r || !r.txt) return;
    r.txt.textContent = s;
    r.txt.style.color = '#161616';
    r.txt.style.display = '';
    setTimeout(() => { if (r.txt.textContent === s) r.txt.style.display = 'none'; }, 850);
  }

  /* RivalModeScene::Reset_WinBall 0x33964 */
  Reset_WinBall() {
    const c = this.core;
    c.ManACurPos = 'A1'; c.ManBCurPos = 'B1'; c.ManAHitPos = 'A1';
    c.manA.show(true); c.manAA3.show(false);
    c.manA.set(c.cfg.NormalSwingSequence[0]);
    c.manB.set(c.cfg.NormalSwingSequence[0]);
    this.placeManA('A1');
    const wl = this.n('Canvas/Top Group/WinLoseBall Text');
    if (wl && wl.txt) wl.txt.style.display = 'none';        // Reset_WinBall 0x33964
    if (this.EnemyScore >= 3) { this.winBanner('GAME OVER — tap to restart'); this.over = true; return; }
    this.model.LoadLevelProb(this.stageOrder);
    this.RoundCount = 0;
    this.updateHUD();
    c.BallTrailAnim();
  }

  banner(s) {
    const r = this.n('Canvas/Core/ManA Group/ManA Image/MissHitInInfo Text');
    if (!r || !r.txt) return;
    r.txt.textContent = s;
    r.txt.style.display = s ? '' : 'none';
    r.txt.style.color = '#161616';
    if (s) setTimeout(() => { if (r.txt.textContent === s) r.txt.style.display = 'none'; }, 850);
  }

  /* ManA's home positions.  GoLeft 0x33288 moves ManAImage to (-387.6,-240),
     GoRight 0x334B8 to (0,-240); both are localPosition, which for a child
     anchored at a point equals anchoredPosition, so it goes through the same
     rect maths as everything else. */
  placeManA(pos) {
    const r = this.n('Canvas/Core/ManA Group/ManA Image');
    const g = this.n('Canvas/Core/ManA Group');
    if (!r || !g) return;
    const x = pos === 'A1' ? -387.6 : 0, y = -240;
    const rect = resolveRect({ ...r.node.rect, pos: [x, y] }, g.rect.w, g.rect.h);
    r.el.style.left = `${rect.x}px`;
    r.el.style.top = `${g.rect.h - rect.y - rect.h}px`;
    r.rect = rect;
  }

  /* RivalModeScene::GoLeft 0x33288 */
  GoLeft() {
    const c = this.core;
    if (c.IsInSwingColddown) return;
    c.IsInSwingColddown = true;
    c.ManASwingSequenceTmp = (c.SequenceState === SeqState.Lose)
        ? c.cfg.BlackSwingSequence : c.cfg.NormalSwingSequence;
    const from = c.ManACurPos;
    c.ManACurPos = 'A1';
    if (from === 'A1') { c.ManASwing(); }
    else { this.placeManA('A1'); setTimeout(() => c.ManASwing(), 50); }
  }

  /* RivalModeScene::GoRight 0x334B8 */
  GoRight() {
    const c = this.core;
    if (c.IsInSwingColddown) return;
    c.IsInSwingColddown = true;
    const from = c.ManACurPos;
    if (from === 'A1') {
      c.ManACurPos = (c.ManAHitPos === 'A3') ? 'A3' : 'A2';
      this.placeManA(c.ManACurPos);
      setTimeout(() => c.ManASwing(), 50);
    } else if (from === 'A2') {
      c.ManACurPos = (c.ManAHitPos === 'A3') ? 'A3' : 'A2';
      c.ManASwing();
    } else {                                          // A3
      c.ManACurPos = (c.ManAHitPos === 'A2') ? 'A2' : 'A3';
      c.ManASwing();
    }
  }

  wireInput() {
    /* PlayerControlBase: the screen is split into GoLeft / GoRight panels,
     * each half the (aspect-corrected) canvas width and its full height. */
    const hit = (clientX) => {
      const st = $('#stage').getBoundingClientRect();
      if (this.over) { this.over = false; this.EnemyScore = 0; this.enter(); return; }
      if (clientX - st.left < st.width / 2) this.GoLeft(); else this.GoRight();
    };
    const dn = e => {
      Audio_.unlock();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      hit(x); e.preventDefault();
    };
    addEventListener('pointerdown', dn, { passive: false });
    addEventListener('keydown', e => {
      Audio_.unlock();
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') this.GoLeft();
      else if (e.key === 'ArrowRight' || e.key === 'd') this.GoRight();
      else if (e.key === 'p') this.core.IsGamePause = !this.core.IsGamePause;
    });
  }
}

/* ------------------------------------------------------------------- boot */
async function boot() {
  const b = $('#boot');
  b.textContent = 'loading data…';
  G.data = window.__GAME;
  if (!G.data) throw new Error('assets/data/game.js did not load');

  const atlases = new Set();
  for (const k of Object.keys(G.data.sprites)) atlases.add(G.data.sprites[k][0]);
  b.textContent = `loading ${atlases.size} atlases…`;
  await Promise.all([...atlases].map(async a => {
    G.tex[a] = await loadImage(`assets/tex/${encodeURIComponent(a)}.png`);
  }));

  b.textContent = 'loading audio…';
  await Audio_.load(['Hit1', 'Hit2', 'HardHit', 'Lose', 'Herray', 'blast', 'mouse_click']);

  fit();
  const stage = $('#stage');
  const stageOrder = parseInt(qs.get('stage') || '0', 10);
  const scene = new RivalModeScene(stage, stageOrder);
  window.scene = scene;
  scene.enter();
  b.classList.add('hide');
  dispatchEvent(new Event('porttest'));

  /* ?auto=1 -- a perfect player, for watching a rally without touching it. */
  if (qs.get('auto')) {
    setInterval(() => {
      const c = scene.core;
      if (!c.IsAbleToHitBack || c.IsInSwingColddown) return;
      if (c.ManAHitPos === 'A1') scene.GoLeft(); else scene.GoRight();
    }, 16);
  }
  if (qs.get('probe')) {
    const out = [];
    const st = $('#stage').getBoundingClientRect();
    const all = [...$('#stage').querySelectorAll('div')];
    out.push(`stage rect ${JSON.stringify(st)}  nodes=${all.length}`);
    all.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const big = r.width * r.height > st.width * st.height * 0.25;
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.01;
      if (big && visible) {
        out.push(`${String(i).padStart(4)} ${(el.dataset.name||el.className).slice(0,34).padEnd(34)} ` +
          `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
          `bg=${cs.backgroundColor} img=${cs.backgroundImage.slice(0,42)}`);
      }
    });
    const probe = document.createElement('pre');
    probe.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#fff;color:#000;font:9px monospace;white-space:pre';
    probe.textContent = out.join('\n');
    document.body.appendChild(probe);
  }
  if (qs.get('dbg')) {
    const d = document.createElement('div'); d.id = 'dbg'; document.body.appendChild(d);
    setInterval(() => {
      const c = scene.core;
      d.textContent =
        `stage ${scene.stageOrder}  ${scene.model.enemyName}\n` +
        `score ${scene.PlayerScore}-${scene.EnemyScore}  round ${scene.RoundCount}/${scene.model.Goal}\n` +
        `state ${['From','To','Lose','ManBLose'][c.SequenceState]}  idx ${c.curSpriteIndex}/${c.BallTrailSequenceTmp.length}\n` +
        `trail ${c.curTrail}\n` +
        `hit ${c.hitBackStartFrame}..${c.hitBackEndFrame}  able=${c.IsAbleToHitBack}\n` +
        `ManA ${c.ManACurPos} -> need ${c.ManAHitPos}   ManB ${c.ManBCurPos}->${c.ManBNextPos}\n` +
        `dt from ${c.FromBallTrailAnimDelay.toFixed(4)} to ${c.ToBallTrailAnimDelay.toFixed(4)}`;
    }, 60);
  }
}
boot().catch(e => { $('#boot').textContent = 'boot failed: ' + e.message; console.error(e); });
