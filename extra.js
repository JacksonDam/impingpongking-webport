/* The tutorial and the ending -- two prefabs instantiated over the rival scene.
 *
 * RivalModeTutorial (token 0x0200003C) and RivalModeEnding (0x02000038).
 * Both are long scripted coroutines; the beats and their waits below are the
 * shipped ones.
 */
'use strict';

/* ===================================================== RivalModeTutorial
 * TutorialStart (iterator 0): the bars slide in, the rival serves once so the
 * player can learn the hit window, then the ten rivals line up, four speech
 * bubbles play, and the I'm Ready button appears. */
class TutorialView {
  constructor(host, mgr, rival) {
    this.mgr = mgr; this.rival = rival;
    this.scene = new Scene('prefab:RivalModeTutorial', host);
    const s = this.scene;
    this.cfg = s.comp('', 'RivalModeTutorial') || {};
    const N = r => (r && r.node) ? s.n(r.node) : null;
    this.top = N(this.cfg.Tutorial_TopBarGroup);
    this.bottom = N(this.cfg.Tutorial_BottomBarGroup);
    this.skipText = N(this.cfg.SkipText);
    this.skipA1 = N(this.cfg.SkipArrowImage1);
    this.skipA2 = N(this.cfg.SkipArrowImage2);
    this.instruction = N(this.cfg.Tutorial_InstructionImage);
    this.leftFinger = N(this.cfg.Tutorial_LeftFingerImage);
    this.rightFinger = N(this.cfg.Tutorial_RightFingerImage);
    this.great = N(this.cfg.Tutorial_GreatText);
    this.lines = [N(this.cfg.People10Line1Group), N(this.cfg.People10Line2Group),
                  N(this.cfg.People10Line3Group), N(this.cfg.People10Line4Group)];
    this.hi = N(this.cfg.People25HiDialogImage);
    this.ppk = N(this.cfg.People25PingPongKingImage);
    this.goal = N(this.cfg.People25GoalDialogImage);
    this.ready = N(this.cfg.People25ReadyDialogImage);
    this.imReady = N(this.cfg.ImReadyImage);
    this.imReadyShadow = N(this.cfg.ImReadyShadowImage);
    this.leftBtn = N(this.cfg.Tutorial_LeftBtnImage);
    this.rightBtn = N(this.cfg.Tutorial_RightBtnImage);
    this.skipGroup = N(this.cfg.SkipGroup);
    this.skipAlert = N(this.cfg.SkipTutorialAlertGroup);
    this.hitsDone = 0;
    this.IsKnowTheRuleClick = false;
    this.prep();
  }
  destroy() { this.gen = (this.gen | 0) + 1; this.scene.destroy(); }

  prep() {
    /* everything starts off-stage or invisible; the coroutine brings it in */
    const off = n => { if (n) n.setAlpha(0); };
    off(this.skipText); off(this.skipA1); off(this.skipA2);
    off(this.instruction); off(this.leftFinger); off(this.rightFinger);
    off(this.great); off(this.imReady); off(this.imReadyShadow);
    /* the prefab already parks these off-stage: the bars at y = +/-2000 and
       the four rival lines at x = 1538.  TutorialStart brings them to
       y = +/-1155 and x = 201. */
    for (const d of [this.hi, this.ppk, this.goal, this.ready]) if (d) d.setLocalScale(0, 0);
    if (this.skipAlert) this.skipAlert.setActive(false);
  }

  /* the player taps during the taught hit window */
  onTap(left) {
    if (this.waitingHit === undefined) return false;
    if (left !== this.waitingHit) return true;             // wrong side: ignored
    this.hitOk = true;
    return true;
  }
  imReadyTap(x, y) {
    if (!this.imReadyActive || !this.imReady) return false;
    const r = this.imReady.el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    this.imReadyActive = false;
    this.IsKnowTheRuleClick = true;
    Audio_.play('mouse_click');
    return true;
  }

  /* one serve, held at the hit window until the player taps.  The frame
     stepping and the HitOnTableNotification cue are TutorialStart's. */
  async taughtRally(side, alive) {
    const c = this.rival && this.rival.core;
    if (!c) { await wait(600); return alive(); }
    const notif = this.rival.scene.n('Canvas/Core/Table Image/HitOnTableNotification Image');
    c.ManACurPos = side ? 'A1' : 'A2';
    c.ManAHitPos = side ? 'A1' : 'A2';
    this.rival.placeManA(c.ManACurPos);
    c.ManBTossBallAnim();
    await wait(200);
    if (!alive()) return false;
    c.ChangeTrailImage('TossBallTrail Image');
    c.BallTrailSequenceTmp = c.cfg.TossBallTrialSequence;
    for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return false;
      c.trailSet(i); await wait(40);
    }
    c.ManBSwing();
    c.ChangeTrailImage('FirstBallTrail Image');
    c.ChangeSequence('FirstBallTrail Image');
    this.waitingHit = side; this.hitOk = false;
    for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return false;
      c.trailSet(i);
      if (i === c.hitBackStartFrame) {
        c.IsAbleToHitBack = true;
        if (notif) { notif.setActive(true); notif.setLocalPos(-103.6, -37.2); notif.setAlpha(1); }
        Audio_.play('Hit2');                        // Audios.PingPongEnemy
      }
      if (this.hitOk) break;
      await wait(23);
    }
    /* the tutorial holds the ball at the window rather than losing the point */
    if (qs.get('auto')) this.hitOk = true;
    let t = 0;
    while (!this.hitOk && t < 20 && alive()) { await wait(50); t += 0.05; }
    this.waitingHit = undefined;
    c.IsAbleToHitBack = false;
    if (notif) notif.setActive(false);
    if (!alive()) return false;
    Audio_.play('Hit1');                            // Audios.PingPongPlayer
    c.ManASwing();
    const t2 = this.rival.trails['To-' + c.ManACurPos + '-B1 Image'] ? 'To-' + c.ManACurPos + '-B1 Image' : null;
    if (t2) { c.ChangeTrailImage(t2); c.ChangeSequence(t2); 
      for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
        if (!alive()) return false;
        c.trailSet(i); await wait(23);
      }
      c.ChangeTrailImage('');
    }
    return alive();
  }

  async run() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    const W_ = async s => { await wait(s * 1000); return alive(); };

    /* bars in (0.8 s, easeOutBack) */
    if (this.bottom) LT.moveLocalY(this.bottom, -1155, 0.8).setEase(27);
    if (this.top) LT.moveLocalY(this.top, 1155, 0.8).setEase(27);
    if (this.skipGroup) LT.alpha(this.skipGroup, 1, 0.2);
    if (!await W_(0.8)) return;
    for (const n of [this.skipA1, this.skipA2, this.skipText]) if (n) LT.alpha(n, 1, 0.2);
    if (!await W_(0.8)) return;

    /* one taught rally: the instruction slides in and the finger prompts */
    if (this.instruction) {
      LT.alpha(this.instruction, 1, 0.5).setEase(15);
      LT.moveLocalX(this.instruction, 129.9, 0.5).setEase(30);
    }
    for (const n of [this.leftFinger, this.rightFinger]) if (n) LT.alpha(n, 1, 0.5);
    if (!await W_(0.6)) return;

    /* two taught rallies: the rival serves, the ball runs to the hit window,
       and the tutorial waits for the tap.  The ball is driven straight off
       BTCore, exactly as TutorialStart does. */
    for (const side of [true, false]) {
      const f = side ? this.leftFinger : this.rightFinger;
      if (f) LT.scale(f, 1.15, 0.35).setEase(15).setLoopPingPong(-1);
      if (!await this.taughtRally(side, alive)) return;
      LT.cancelAll();
      if (f) f.setLocalScale(1, 1);
      this.hitsDone++;
      if (!await W_(0.5)) return;
    }

    /* "Well done!" */
    if (this.great) {
      LT.moveLocalX(this.great, 0, 0.4).setEase(30);
      LT.alpha(this.great, 1, 0.4);
    }
    if (!await W_(2)) return;
    if (this.great) LT.alpha(this.great, 0, 0.5);
    if (!await W_(1)) return;

    /* the bars leave and the ten rivals line up */
    if (this.top) LT.moveLocalY(this.top, 2000, 0.3);
    if (this.bottom) LT.moveLocalY(this.bottom, -2000, 0.3);
    for (const n of [this.leftFinger, this.rightFinger, this.instruction]) if (n) LT.alpha(n, 0, 0.5);
    if (!await W_(0.8)) return;
    for (const l of this.lines) {
      if (l) LT.moveLocalX(l, 201, 0.5).setEase(30);
      if (!await W_(0.08)) return;
    }
    if (!await W_(1)) return;

    /* four speech bubbles */
    const pop = (n, hold) => new Promise(async res => {
      if (n) LT.scale(n, 1, 0.5).setEase(30);
      await wait(hold * 1000); res();
    });
    await pop(this.hi, 1.2);            if (!alive()) return;
    if (this.hi) LT.scale(this.hi, 0, 0.2).setEase(26);
    if (!await W_(0.35)) return;
    await pop(this.ppk, 1.75);          if (!alive()) return;
    await pop(this.goal, 1.75);         if (!alive()) return;
    await pop(this.ready, 1.5);         if (!alive()) return;

    /* the I'm Ready button */
    if (this.imReady) LT.alpha(this.imReady, 1, 0.5);
    if (this.imReadyShadow) LT.alpha(this.imReadyShadow, 1, 0.5);
    if (!await W_(0.2)) return;
    if (this.imReady) LT.scale(this.imReady, 1.1, 0.5).setEase(15).setLoopPingPong(-1);
    if (!await W_(0.55)) return;
    this.imReadyActive = true;
    if (qs.get('auto')) LT.delayedCall(1, () => { this.IsKnowTheRuleClick = true; });

    while (!this.IsKnowTheRuleClick && alive()) await wait(50);
    if (!alive()) return;
    /* Bridge.BridgeShowWhenEnterGame -> Reset_EnterGame -> BridgeHide */
    if (!await W_(0.6)) return;
    this.mgr.onTutorialDone();
  }
}

/* ======================================================== RivalModeEnding
 * EndingAnim (iterator 0) -- "Now / You Are / Ping Pong King", the crown, the
 * rotating shine and the dancing champion. */
class EndingView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('prefab:EndGame Group', host, { fullSize: 'EndGame Group' });
    const s = this.scene;
    this.scene.root.style.display = '';
    const root = s.n('');
    if (root) root.setActive(true);
    this.cfg = s.comp('', 'RivalModeEnding') || {};
    const N = r => (r && r.node) ? s.n(r.node) : null;
    this.bg = N(this.cfg.BgImage);
    this.crown = N(this.cfg.CrownImage);
    this.man = N(this.cfg.ManImage);
    this.shine = N(this.cfg.ShiningGroup);
    this.shineImgs = (this.cfg.ShineImages || []).map(N).filter(Boolean);
    this.nowText = N(this.cfg.EndingNowText);
    this.pingText = N(this.cfg.EndingPingText);
    this.pongText = N(this.cfg.EndingPongText);
    this.kingText = N(this.cfg.EndingKingText);
    this.dance = [N(this.cfg.Dance1Image), N(this.cfg.Dance2Image), N(this.cfg.Dance3Image)];
    this.danceSeq = [this.cfg.Dance1Sequence || [], this.cfg.Dance2Sequence || [],
                     this.cfg.Dance3Sequence || []];
    this.homeShadow = N(this.cfg.HomeBtnShadowImage);
    this.homeBtn = N(this.cfg.HomeBtnImage);
    s.hide('TournamentModeEnd Group');
    for (const n of [this.crown, this.nowText, this.pingText, this.pongText, this.kingText])
      if (n) n.setLocalScale(0, 0);
    for (const n of this.shineImgs) n.setAlpha(0);
    for (const n of this.dance) if (n) n.setEnabled(false);
    if (this.bg) this.bg.setAlpha(0);
    if (this.homeShadow) this.homeShadow.setAlpha(0);
    if (this.homeBtn) this.homeBtn.setAlpha(0);
  }
  destroy() { this.gen = (this.gen | 0) + 1; this.scene.destroy(); }

  homeTap(x, y) {
    if (!this.homeActive || !this.homeShadow) return false;
    const r = this.homeShadow.el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    this.homeActive = false;
    Audio_.play('mouse_click');
    return true;
  }

  /* one serve, held at the hit window until the player taps.  The frame
     stepping and the HitOnTableNotification cue are TutorialStart's. */
  async taughtRally(side, alive) {
    const c = this.rival && this.rival.core;
    if (!c) { await wait(600); return alive(); }
    const notif = this.rival.scene.n('Canvas/Core/Table Image/HitOnTableNotification Image');
    c.ManACurPos = side ? 'A1' : 'A2';
    c.ManAHitPos = side ? 'A1' : 'A2';
    this.rival.placeManA(c.ManACurPos);
    c.ManBTossBallAnim();
    await wait(200);
    if (!alive()) return false;
    c.ChangeTrailImage('TossBallTrail Image');
    c.BallTrailSequenceTmp = c.cfg.TossBallTrialSequence;
    for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return false;
      c.trailSet(i); await wait(40);
    }
    c.ManBSwing();
    c.ChangeTrailImage('FirstBallTrail Image');
    c.ChangeSequence('FirstBallTrail Image');
    this.waitingHit = side; this.hitOk = false;
    for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return false;
      c.trailSet(i);
      if (i === c.hitBackStartFrame) {
        c.IsAbleToHitBack = true;
        if (notif) { notif.setActive(true); notif.setLocalPos(-103.6, -37.2); notif.setAlpha(1); }
        Audio_.play('Hit2');                        // Audios.PingPongEnemy
      }
      if (this.hitOk) break;
      await wait(23);
    }
    /* the tutorial holds the ball at the window rather than losing the point */
    if (qs.get('auto')) this.hitOk = true;
    let t = 0;
    while (!this.hitOk && t < 20 && alive()) { await wait(50); t += 0.05; }
    this.waitingHit = undefined;
    c.IsAbleToHitBack = false;
    if (notif) notif.setActive(false);
    if (!alive()) return false;
    Audio_.play('Hit1');                            // Audios.PingPongPlayer
    c.ManASwing();
    const t2 = this.rival.trails['To-' + c.ManACurPos + '-B1 Image'] ? 'To-' + c.ManACurPos + '-B1 Image' : null;
    if (t2) { c.ChangeTrailImage(t2); c.ChangeSequence(t2); 
      for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
        if (!alive()) return false;
        c.trailSet(i); await wait(23);
      }
      c.ChangeTrailImage('');
    }
    return alive();
  }

  async run() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    const W_ = async s => { await wait(s * 1000); return alive(); };

    LT.value(0.15, 0, 1, v => Audio_.setBgmVolume(v));
    if (!await W_(0.2)) return;
    if (this.bg) LT.alpha(this.bg, 1, 0.5);
    if (!await W_(1)) return;

    if (this.crown) LT.scale(this.crown, 1, 0.5).setEase(30);
    if (this.nowText) LT.scale(this.nowText, 1, 0.5).setEase(30);
    for (const n of this.shineImgs) LT.alpha(n, 0.25, 0.25);
    this.ShinesRotate(g);
    if (!await W_(0.9)) return;
    if (this.nowText) LT.alpha(this.nowText, 0, 0.2);
    if (!await W_(0.85)) return;

    if (this.crown) { LT.scale(this.crown, 0.76, 0.3).setEase(15); LT.moveLocalY(this.crown, 823.6, 0.3).setEase(15); }
    if (this.shine) LT.moveLocalY(this.shine, 801, 0.3).setEase(15);
    if (!await W_(0.25)) return;

    if (this.nowText) {
      this.nowText.setLocalPos(0, 351);
      this.nowText.setLocalScale(0, 0);
      this.nowText.setText('You Are');
      this.nowText.setColor([0.0863, 0.0863, 0.0863, 1]);
      LT.scale(this.nowText, 1, 0.5).setEase(30);
    }
    Audio_.setBgmVolume(0);
    Audio_.playBgm('FirstEndingBGM', true);
    LT.value(0, 1, 3, v => Audio_.setBgmVolume(v));
    if (!await W_(1.25)) return;
    if (this.nowText) LT.alpha(this.nowText, 0, 0.08);
    if (!await W_(0.5)) return;

    if (this.crown) LT.moveLocalY(this.crown, 492.6, 0.7);
    if (this.shine) LT.moveLocalY(this.shine, 470, 1).setEase(15);
    if (this.man) LT.moveLocalY(this.man, 0.36, 0.7).setEase(15);
    if (!await W_(1)) return;

    if (this.crown) { LT.moveLocalY(this.crown, 478.8, 0.7).setEase(15); LT.scale(this.crown, 0.64, 0.45).setEase(15); }
    if (this.shine) LT.moveLocalY(this.shine, 460, 0.45).setEase(15);
    if (this.man) { LT.moveLocalY(this.man, 75, 0.25).setEase(15); LT.scale(this.man, 0.819, 0.45).setEase(15); }
    if (!await W_(0.5)) return;

    if (this.pingText) LT.scale(this.pingText, 1, 0.5).setEase(30);
    if (!await W_(0.2)) return;
    if (this.pongText) LT.scale(this.pongText, 1, 0.5).setEase(30);
    if (!await W_(0.2)) return;
    if (this.kingText) LT.scale(this.kingText, 1, 0.5).setEase(30);
    if (!await W_(1.3)) return;

    this.ManDancingAnim(g);
    if (this.homeShadow) this.homeShadow.setLocalPos(-141.9, -685.99);
    if (!await W_(1)) return;
    if (this.homeBtn) LT.alpha(this.homeBtn, 1, 0.5);
    if (this.homeShadow) { LT.alpha(this.homeShadow, 1, 0.5); LT.scale(this.homeShadow, 1.05, 1).setLoopPingPong(-1); }
    if (!await W_(0.35)) return;
    this.homeActive = true;
  }

  /* ShinesRotate (iterator 1): +100 degrees every 3 s, forever */
  async ShinesRotate(g) {
    let a = 0;
    while (g === this.gen) {
      a += 100;
      if (this.shine) LT.rotate(this.shine, a, 3);
      await wait(3000);
    }
  }

  /* ManDancingAnim (iterator 2): the three motion sets at 0.095 s a frame */
  async ManDancingAnim(g) {
    if (this.man) this.man.setEnabled(false);
    for (let k = 0; k < 3; k++) if (this.dance[k]) this.dance[k].setEnabled(false);
    let k = 0;
    while (g === this.gen) {
      const img = this.dance[k], seq = this.danceSeq[k];
      if (!img || !seq.length) { k = (k + 1) % 3; continue; }
      img.setEnabled(true);
      for (let i = 0; i < seq.length; i++) {
        if (g !== this.gen) return;
        img.setSprite(seq[i]);
        await wait(95);
      }
      img.setEnabled(false);
      k = (k + 1) % 3;
    }
  }
}

Object.assign(window, { TutorialView, EndingView });

/* =========================================================== ShareGIF
 * "Today's GIF": a panel that slides in after a match, playing one of five
 * animated clips at 0.075 s a frame.  The five title/blurb pairs and their
 * order are RivalModeScene's, at the switch on RivalMode_CurShareGIFIndex
 * (0x0CA8); the frames are the four ShareGIF prefabs. */
const GIF_VARIANTS = [
  { title: "Today's GIF", blurb: 'This is the Ping Pong King Dance.\nLike it on our Facebook?',
    prefab: 'prefab:ShareGIF001 Group', like: true },
  { title: "Today's GIF", blurb: 'Share this funny GIF on Facebook.\nYour friends will laugh, I promise.',
    prefab: 'prefab:ShareGIF002 Group', like: false },
  { title: "Today's GIF", blurb: 'We worked for six sleepless months on the game.\nLike us on Facebook?',
    prefab: 'prefab:ShareGIF003 Group', like: true },
  { title: 'Special Move', blurb: 'Spread the joy!\nShare this special move to your friends on Facebook!',
    prefab: 'prefab:ShareGIF004 Group', like: false },
  { title: 'Like us?', blurb: "This is a great game, but we don't have enough players.\nLike us to spread the game to the world?",
    prefab: null, like: true },
];

class ShareGIFView {
  constructor(host, mgr, index) {
    this.mgr = mgr;
    this.index = index % GIF_VARIANTS.length;
    this.v = GIF_VARIANTS[this.index];
    this.scene = new Scene('RivalModeScene', host);       // the panel lives in it
    const s = this.scene;
    for (const k of Object.keys(G.data.scenes.RivalModeScene)) {
      if (k && !k.startsWith('Canvas/Share Group') && k !== 'Canvas') {
        const n = s.n(k);
        if (n && k.split('/').length <= 2) n.setActive(false);
      }
    }
    this.group = s.n('Canvas/Share Group');
    if (this.group) this.group.setActive(true);
    this.cfg = s.comp('Canvas/Share Group', 'ShareGIF') || {};
    this.title = s.n('Canvas/Share Group/Title Text');
    this.blurb = s.n('Canvas/Share Group/Begging Text');
    this.shareImg = s.n('Canvas/Share Group/Share Image');
    this.thumb = s.n('Canvas/Share Group/Share Image/Thumb Image');
    this.btn = s.n('Canvas/Share Group/ShareBtnShadow Image/ShareBtn Image');
    this.cross = s.n('Canvas/Share Group/Cross Image');
    /* SetShareGIF 0x3FF44 */
    if (this.title) this.title.setText(this.v.title);
    if (this.blurb) this.blurb.setText(this.v.blurb);
    if (this.btn) this.btn.setSprite(this.v.like ? this.cfg.LikeSprite : this.cfg.ShareSprite);
    /* SetShareGIF instantiates one of the four GIF prefabs as a child of the
       share panel; its own Share Image is what the sequence plays on. */
    this.seq = [];
    if (this.v.prefab && G.data.scenes[this.v.prefab] && this.group) {
      this.gifScene = new Scene(this.v.prefab, this.group.el);
      const root = this.gifScene.n('');
      if (root) root.setActive(true);
      const p = G.data.scenes[this.v.prefab][''];
      const c = p && p.comp && p.comp.GIFComponent;
      if (c) {
        this.seq = c.GIFSpriteSequence || [];
        if (c.ShareImage && c.ShareImage.node) this.gifImg = this.gifScene.n(c.ShareImage.node);
      }
      if (this.gifImg) { this.gifImg.setActive(true); this.gifImg.setEnabled(true); }
    } else if (this.shareImg) {
      this.shareImg.setActive(true);                 // the "Like us" variant
      this.gifImg = this.shareImg;
    }
    /* the panel is parked at x = 2000 in the scene; ShowShareScene brings it to 0 */
  }
  destroy() {
    this.gen = (this.gen | 0) + 1;
    if (this.gifScene) this.gifScene.destroy();
    this.scene.destroy();
  }

  hitTest(x, y) {
    for (const n of [this.cross, this.btn]) {
      if (!n) continue;
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  /* ShareGIF::ShowShareScene 0x3FEBC + ShowThumbAnim 0x3FF0E */
  async run() {
    const g = this.gen = (this.gen | 0) + 1;
    if (this.group) LT.moveLocalX(this.group, 0, 0.35).setEase(12);   // 0x3FEBC
    await wait(400);
    if (this.thumb) {
      this.thumb.setEnabled(true);
      LT.moveLocalY(this.thumb, 148, 0.5).setEase(15).setLoopPingPong(-1);
    }
    /* GIFComponent::PlayGIFCoroutine -- 0.075 s a frame, looping */
    while (g === this.gen && this.seq.length && this.gifImg) {
      for (let i = 0; i < this.seq.length; i++) {
        if (g !== this.gen) return;
        this.gifImg.setSprite(this.seq[i]);
        await wait(75);
      }
    }
  }
}

Object.assign(window, { ShareGIFView, GIF_VARIANTS });
