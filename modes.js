/* The three Impossible Test modes: Eyesight, Concentrate and Invert.
 *
 * All three are BaseScene subclasses wrapped round the same `Core` as RivalMode
 * (EyesightModeScene 0x02000068-ish, ConcentrateModeScene, InvertModeScene).
 * They share `PlayerControlBase`, `ResultPageBase` and `PausePageBase`; what
 * differs is the score they keep and how the controls behave.
 */
'use strict';

/* the ScoreClassInterval lists built in each scene's .ctor */
const SCORE_CLASSES = {
  EyesightModeScene: [
    { c: 'D', lo: 1, hi: 3, bg: 'bad83aFF', talk: 'You gotta see a doctor!' },
    { c: 'C', lo: 3, hi: 5, bg: 'ffcb39FF', talk: 'You gotta see a doctor!' },
    { c: 'B', lo: 5, hi: 7, bg: 'ffa750FF', talk: 'Perfect Eyesight!' },
    { c: 'A', lo: 7, hi: 13, bg: 'ff9376FF', talk: 'Perfect Eyesight!' },
    { c: 'S', lo: 13, hi: 100, bg: 'ff6c9aFF', talk: 'You are top 1%!' },
  ],
  ConcentrateModeScene: [
    { c: 'D', lo: 0, hi: 3, bg: 'bad83aFF', talk: 'You need to focus!' },
    { c: 'C', lo: 3, hi: 8, bg: 'ffcb39FF', talk: 'You need to focus!' },
    { c: 'B', lo: 8, hi: 15, bg: 'ffa750FF', talk: 'You nailed it, man!' },
    { c: 'A', lo: 15, hi: 28, bg: 'ff9376FF', talk: 'You nailed it, man!' },
    { c: 'S', lo: 28, hi: 100000, bg: 'ff6c9aFF', talk: "That's top 1.5%!" },
  ],
  InvertModeScene: [
    { c: 'D', lo: 0, hi: 5, bg: 'bad83aFF', talk: 'Try playing upside down?' },
    { c: 'C', lo: 5, hi: 8, bg: 'ffcb39FF', talk: 'Try playing upside down?' },
    { c: 'B', lo: 8, hi: 13, bg: 'ffa750FF', talk: "You have Picasso's brain!" },
    { c: 'A', lo: 13, hi: 20, bg: 'ff9376FF', talk: "You have Picasso's brain!" },
    { c: 'S', lo: 20, hi: 100000, bg: 'ff6c9aFF', talk: 'Only 7 players beat you!' },
  ],
};

/* SetUserSpeedByBiasPercentage sets these bounds afresh every ball; the
   interval is lower + (upper - lower) * UserBiasPercentage, which the modes
   pin at 0.091.  (The scene .ctor's slightly wider bounds are overwritten.) */
const MODE_BOUNDS = { enemy: [0.067, 0.024], middle: [0.040, 0.017], player: [0.067, 0.022] };
const MODE_BIAS = 0.091;                       // ChangeUserBiasPercentage 0xD266
/* and then a multiplier by how many balls you have returned */
const MODE_RAMP = [null,
  { mid: 1.3, side: 1.2 },   // 1
  { mid: 1.2, side: 1.1 },   // 2
  { mid: 1.1, side: 1.0 },   // 3
  { mid: 1.0, side: 0.98 },  // 4
  { mid: 1.0, side: 0.98 },  // 5+
];

/* ------------------------------------------------------------ ResultPageBase
 * ShowResultPage 0xA114 + ResultPageAnim: the panel fades up, the score pops on
 * easeOutBounce, the best score follows, then the coach's line slides in and
 * the three buttons appear. */
class ResultPage {
  constructor(scene, base) {
    this.scene = scene;
    const P = base + '/MainObj/ResolutionAdjust Group/';
    this.main = scene.n(base + '/MainObj');
    this.score = scene.n(P + 'Scroe Text');
    this.unit = scene.n(P + 'Unit Text');
    this.best = scene.n(P + 'BestScore Text');
    this.man = scene.n(P + 'Man Image');
    this.classText = scene.n(P + 'Man Image/ScoreClass Text');
    this.classBg = scene.n(P + 'Man Image/ScoreClassBG Image');
    this.bar = scene.n(P + 'DialogaBar Image');
    this.dialog = scene.n(P + 'DialogaBar Image/Dialog Image');
    this.dialogText = scene.n(P + 'DialogaBar Image/Dialog Image/Dialog Text');
    this.retry = scene.n(P + 'RetryBtn Image');
    this.retryShadow = scene.n(P + 'RetryBtnShadow Image');
    this.home = scene.n(P + 'HomeBtn Image');
    this.homeShadow = scene.n(P + 'HomeBtnShadow Image');
    this.mode = scene.n(P + 'ModeBtn Image');
    this.modeShadow = scene.n(P + 'ModeBtnShadow Image');
    if (this.main) this.main.setActive(false);
    this.shown = false;
  }
  hex(h) { return hexColor(h); }

  async show(curScore, bestScore, scoreClass, bgColor, talk) {
    if (!this.main) return;
    this.shown = true;
    this.main.setActive(true);
    this.main.setAlpha(0);
    if (this.score) { this.score.setText(curScore); this.score.setLocalScale(0, 0); }
    if (this.unit) this.unit.setLocalScale(0, 0);
    if (this.best) { this.best.setText('BEST ' + bestScore); this.best.setLocalScale(0, 0); }
    if (this.classText) { this.classText.setText(scoreClass); this.classText.setColor([...this.hex(bgColor).slice(0, 3), 0]); }
    if (this.classBg) this.classBg.setColor(this.hex('FFFFFF00'));
    if (this.dialogText) { this.dialogText.setText(talk); this.dialogText.setAlpha(0); }
    for (const n of [this.bar, this.dialog, this.retry, this.retryShadow,
                     this.home, this.homeShadow, this.mode, this.modeShadow, this.man])
      if (n) n.setAlpha(0);

    LT.alpha(this.main, 1, 0.3);
    await wait(300);
    if (this.score) LT.scale(this.score, 1.1, 0.25).setEase(24);
    if (this.unit) LT.scale(this.unit, 1, 0.25).setEase(24);
    await wait(100);
    if (this.best) LT.scale(this.best, 1, 0.25).setEase(24);
    await wait(80);
    if (this.bar) { LT.moveLocalX(this.bar, -116, 0.3).setEase(15); LT.alpha(this.bar, 1, 0.3); }
    if (this.dialog) LT.alpha(this.dialog, 1, 0.2);
    if (this.dialogText) LT.alpha(this.dialogText, 1, 0.3);
    await wait(100);
    for (const n of [this.retry, this.home, this.mode, this.retryShadow,
                     this.homeShadow, this.modeShadow]) if (n) LT.alpha(n, 1, 0.3);
    await wait(600);
    if (this.man) { LT.alpha(this.man, 1, 0.3); LT.moveLocalX(this.man, -692, 0.35).setEase(27); }
    if (this.classText) LT.alpha(this.classText, 1, 0.3);
    if (this.classBg) LT.alpha(this.classBg, 1, 0.3);
  }

  hide() { this.shown = false; if (this.main) this.main.setActive(false); }

  hit(x, y) {
    if (!this.shown) return null;
    for (const [n, id] of [[this.retry, 'retry'], [this.home, 'home'], [this.mode, 'mode']]) {
      if (!n) continue;
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }
}

/* ------------------------------------------------------------- PausePageBase */
class PausePage {
  constructor(scene, base) {
    this.main = scene.n(base + '/MainObj');
    this.resume = scene.n(base + '/MainObj/ResumeBtn Image');
    this.homeBg = scene.n(base + '/MainObj/HomeBtnBg Image');
    this.pauseText = scene.n(base + '/MainObj/Pasue Text');
    if (this.main) this.main.setActive(false);
    this.shown = false;
  }
  show() {
    this.shown = true;
    if (!this.main) return;
    this.main.setActive(true);
    this.main.setAlpha(0.93);
    for (const n of [this.resume, this.homeBg]) if (n) { n.setAlpha(0); LT.alpha(n, 1, 0.25); }
    if (this.homeBg) {
      const h = this.homeBg.el.querySelectorAll('.n');
      h.forEach(e => { e.style.visibility = ''; });
    }
    if (this.pauseText) this.pauseText.setAlpha(1);
  }
  hide() { this.shown = false; if (this.main) this.main.setActive(false); }
  hit(x, y) {
    if (!this.shown) return null;
    for (const [n, id] of [[this.resume, 'resume'], [this.homeBg, 'home']]) {
      if (!n) continue;
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }
}

/* ------------------------------------------------------------------ ScorePad
 * Reverse mode keeps its score on flip-cards, one per digit (ScorePad 0x1402D).
 * A pad is three stacked copies of the same board: a "long" one that is what
 * you normally see, plus a top and bottom half that are switched on only for
 * the 0.24 s of a flip. */
class ScorePad {
  constructor(scene, base) {
    const B = base + '/';
    this.topGroup    = scene.n(B + 'PlayerScoreTop Group');
    this.bottomGroup = scene.n(B + 'PlayerScoreBottom Group');
    this.longGroup   = scene.n(B + 'PlayerScoreLong Group');
    this.longBg      = this.longGroup;                  // PlayerScoreLongGroupBgImage
    this.topText     = scene.n(B + 'PlayerScoreTop Group/PlayerScorePad Image (2)/PlayerScore Text');
    this.downText    = scene.n(B + 'PlayerScoreBottom Group/PlayerScorePad Image (2)/PlayerScore Text');
    this.totalText   = scene.n(B + 'PlayerScoreLong Group/PlayerScorePad Image (1)/PlayerScore Text');
    this.frame       = scene.n(B + 'PlayerScoreLong Group/PlayerScorePad Image (1)');
    this.number_from = 0; this.number_to = 0;
    this.busy = 0;
  }
  ok() { return !!this.longGroup; }

  /* ScorePad::Reset 0x140A8 */
  Reset(n) {
    if (!this.ok()) return;
    const s = String(n);
    for (const t of [this.topText, this.downText, this.totalText]) if (t) t.setText(s);
    this.longBg.setColor(hexColor('FFCB39FF'));
    if (this.totalText) this.totalText.setColor(hexColor('161616FF'));
    if (this.frame) this.frame.setColor(hexColor('161616FF'));
  }

  /* ScorePad::ChangeToBlackMode 0x1406F -- the pad inverts with the rest of
     the scene when you lose */
  ChangeToBlackMode() {
    if (!this.ok()) return;
    this.longBg.setColor(hexColor('161616FF'));
    if (this.totalText) this.totalText.setColor([1, 1, 1, 1]);
    if (this.frame) this.frame.setColor([1, 1, 1, 1]);
  }

  /* ScorePad::Flip 0x14035 + <PlayerScorePadFlip>c__Iterator0 0x14150 */
  Flip(from, to) { this.number_from = from; this.number_to = to; this.PlayerScorePadFlip(); }

  async PlayerScorePadFlip() {
    if (!this.ok()) return;
    const g = ++this.busy;
    this.topGroup.setActive(true);
    this.bottomGroup.setActive(true);
    this.longGroup.setAsLastSibling();
    await wait(16);
    if (g !== this.busy) return;
    if (this.downText) this.downText.setText(String(this.number_from));
    if (this.topText) this.topText.setText(String(this.number_to));
    await wait(16);
    if (g !== this.busy) return;
    this.topGroup.setAsFirstSibling();
    this.bottomGroup.setAsLastSibling();
    await wait(16);
    if (g !== this.busy) return;
    LT.scale(this.longGroup, [1, 0], 0.12).setEase(14);
    await wait(120);
    if (g !== this.busy) return;
    if (this.totalText) this.totalText.setText(String(this.number_to));
    this.bottomGroup.setAsFirstSibling();
    this.topGroup.setAsLastSibling();
    await wait(16);
    if (g !== this.busy) return;
    LT.scale(this.longGroup, [1, 1], 0.12).setEase(15);
    await wait(120);
    if (g !== this.busy) return;
    await wait(32);
    if (g !== this.busy) return;
    this.longGroup.setLocalScale(1, 1);
    this.topGroup.setActive(false);
    this.bottomGroup.setActive(false);
  }
}

/* ====================================================== the three test modes
 * EyesightModeScene, ConcentrateModeScene and InvertModeScene are three
 * BaseScene subclasses wrapped round the same `Core` as RivalMode.  Everything
 * they share -- the entry fade, the HIT buttons, the pause page and the
 * black-out you get when you lose -- lives here; the three subclasses below
 * carry only what actually differs. */
class ModeSceneView {
  constructor(host, mgr, sceneName) {
    this.mgr = mgr; this.sceneName = sceneName;
    this.scene = new Scene(sceneName, host);
    const s = this.scene;
    this.core = new Core(s, sceneName);
    this.model = new RivalModeModel();
    this.classes = SCORE_CLASSES[sceneName];
    this.scoreText = s.n('Canvas/Score Text');
    this.modeText = s.n('Canvas/Mode Text');
    this.bg = s.n('Canvas/Bg Image');
    this.touchBlock = s.n('Canvas/TouchBlock Image');
    this.result = new ResultPage(s, 'Canvas/Result Group');
    this.pause = new PausePage(s, 'Canvas/Pause Group');
    const C = 'Canvas/PlayerControl Group/';
    this.hitL = s.n(C + 'HitLeftBtn Image');
    this.hitR = s.n(C + 'HitRightBtn Image');
    this.hitLShadow = s.n(C + 'HitLeftBtn Image/HitLeftBtnShadow Image');
    this.hitRShadow = s.n(C + 'HitRightBtn Image/HitRightBtnShadow Image');
    this.hitLText = s.n(C + 'HitLeftBtn Image/HitLeftBtn Text');
    this.hitRText = s.n(C + 'HitRightBtn Image/HitRightBtn Text');
    s.hide('Canvas/Core/LeftTouch Mask', 'Canvas/Core/RightTouch Mask',
           'Canvas/Core/LeftTouchGround Mask', 'Canvas/Core/RightTouchGround Mask',
           'Canvas/Core/ManBLeftTouchGround Mask', 'Canvas/Core/ManBRightTouchGround Mask');
    /* the mode scenes have no rival name, no remaining-ball counter and no
       READY/FIGHT art of their own beyond what Core drives */
    for (const n of [this.core.manAWinLose, this.core.manBWinLose, this.core.manASurprise,
                     this.core.manBSurprise]) if (n) n.setEnabled(false);
    if (this.core.manAA3) this.core.manAA3.setEnabled(false);
    if (this.core.manBB3) this.core.manBB3.setEnabled(false);
    if (this.core.remainBall) this.core.remainBall.setActive(false);
    this.coreGroup = s.n('Canvas/Core');
    this.gen = 0;
    this.wire();
  }
  destroy() { this.gen++; this.core.StopRun(); clearInterval(this._timer); this.scene.destroy(); }

  hex(h) { return hexColor(h); }
  get dbKey() { return 'best_' + this.sceneName; }
  get isTimed() { return false; }
  get isInverted() { return false; }
  /* the mode scenes read ManStandingInfoList_Galaxy once you are past the
     second rival; before that they use the plain table */
  standing() { return (DB.data.OutterStageOrder > 1) ? STAND_GALAXY : STAND_NORMAL; }

  /* ---------------------------------------------------------------- entry */
  enter() { this.gen++; this.over = false; this.Reset_EnterGame(); }

  /* Reset_EnterGame -- the same eleven lines in all three scenes (Eyesight
     0xD66C), then each one's own delayedCall chain. */
  Reset_EnterGame() {
    const c = this.core, s = this.scene;
    c.StopRun(); c.reset();
    LT.cancelAll();
    this.TouchBlockEnable(true);
    if (this.bg) this.bg.setColor(this.hex('FFCB39FF'));
    if (c.manB) { c.manB.setColor([1, 1, 1, 1]); c.manB.setLocalPos(543.93, 489.1); }
    if (c.manA) { c.manA.setColor([1, 1, 1, 0]); c.manA.setLocalPos(-387.6, -240); }
    if (c.manBFirstLook) c.manBFirstLook.setColor([1, 1, 1, 0]);
    if (c.table) { c.table.setColor([1, 1, 1, 0]); c.table.setSprite(c.cfg.NormalTableSprite); }
    for (const n of [c.nameLine1, c.nameLine2])
      if (n) { n.setText(''); n.setColor(this.hex('16161600')); n.setEnabled(true); }
    if (c.manBFirstLook) c.manBFirstLook.setEnabled(true);
    if (c.manB) c.manB.setEnabled(false);
    if (c.manA) { c.manA.setEnabled(true); c.manA.setSprite(c.cfg.NormalSwingSequence[0]); }
    c.IsAbleToHitBack = false; c.IsHitBack = false;
    if (this.modeText) this.modeText.setColor(this.hex('161616FF'));
    if (this.coreGroup) this.coreGroup.setLocalScale(1, 1);
    if (c.manAWinLose) c.manAWinLose.setEnabled(false);
    if (c.manBWinLose) c.manBWinLose.setEnabled(false);
    if (c.manASurprise) { c.manASurprise.setEnabled(false); c.manASurprise.setLocalScale(1, 1); }
    if (c.manBSurprise) c.manBSurprise.setEnabled(false);
    if (c.missText) c.missText.setColor(this.hex('16161600'));
    this.result.hide();
    this.pause.hide();
    this.model.Init();
    this.ResetScore();
    this.bindCore();
    if (c.table) LT.alpha(c.table, 1, 0.4);
    if (c.manBFirstLook) LT.alpha(c.manBFirstLook, 1, 0.4);
    if (c.manA) LT.alpha(c.manA, 1, 0.4);
    this.EnterChain();
  }

  /* the shared tail of every scene's entry chain: SettingBtnShow, then the
     serve with READY/FIGHT, then the buttons 2.35 s later */
  StartServe() {
    const g = this.gen;
    if (this.mgr.settings) this.mgr.settings.SettingBtnShow(0.1);
    this.core.StartRun(true);
    LT.delayedCall(2.35, () => {
      if (g !== this.gen) return;
      this.TouchBlockEnable(false);
      this.ShowHitBtn(1);
      const fl = this.core.manBFirstLook;
      if (fl) LT.moveLocalY(fl, fl.localPos[1] + 30, 0.05).setLoopPingPong(1)
                .setOnComplete(() => { fl.setEnabled(false); if (this.core.manB) this.core.manB.setEnabled(true); });
      else if (this.core.manB) this.core.manB.setEnabled(true);
    });
  }

  TouchBlockEnable(v) { if (this.touchBlock) { this.touchBlock.setActive(v); this.touchBlock.setEnabled(v); } }

  bindCore() {
    const c = this.core;
    c.Set_FromBall_Delegate = () => this.Core_SetFromBall();
    c.Set_ToBall_Delegate = () => this.Core_SetToBall();
    c.Lose_Delegate = () => this.Core_Lose();
    c.Touch_ManA_Table_Delegate = () => this.Core_Touch_ManA_Table();
    c.Touch_ManB_Table_Delegate = () => this.Core_Touch_ManB_Table();
    c.onRallyEnd = null;                       // each scene drives its own tail
    c.onReadyFight = null;
  }

  /* ------------------------------------------------------------- controls */
  ShowHitBtn(a) {
    for (const n of [this.hitL, this.hitR, this.hitLText, this.hitRText]) if (n) n.setEnabled(true);
    for (const n of [this.hitL, this.hitR]) if (n) LT.alpha(n, a, 0.5).setEase(14);
    for (const n of [this.hitLShadow, this.hitRShadow]) if (n) LT.alpha(n, 0.2 * a, 0.5).setEase(15);
    for (const n of [this.hitLText, this.hitRText]) if (n) LT.alpha(n, a, 0.5).setEase(14);
  }
  /* PlayerControlBase::HideHitBtnImmidiatly 0x8848 */
  HideHitBtnImmidiatly() {
    for (const n of [this.hitL, this.hitR, this.hitLText, this.hitRText]) if (n) n.setEnabled(false);
    for (const n of [this.hitL, this.hitR, this.hitLShadow, this.hitRShadow,
                     this.hitLText, this.hitRText]) if (n) n.setAlpha(0);
  }

  /* LeftBtnDownAnim 0x8954 / RightBtnDownAnim 0x89AC: the button drops 30 px
     and loses its shadow; the Up anim snaps it back to its rest position. */
  btnDown(left) {
    const n = left ? this.hitL : this.hitR;
    const sh = left ? this.hitLShadow : this.hitRShadow;
    if (!n) return;
    this._bt = this._bt || [];
    const i = left ? 0 : 1;
    if (this._bt[i]) this._bt[i].cancel();
    this._rest = this._rest || [];
    if (this._rest[i] === undefined) this._rest[i] = n.localPos.slice();
    this._bt[i] = LT.moveLocalY(n, n.localPos[1] - 30, 0.05);
    if (sh) sh.setEnabled(false);
    LT.delayedCall(0.12, () => this.btnUp(left));
  }
  btnUp(left) {
    const n = left ? this.hitL : this.hitR;
    const sh = left ? this.hitLShadow : this.hitRShadow;
    const i = left ? 0 : 1;
    if (this._bt && this._bt[i]) this._bt[i].cancel();
    if (sh) sh.setEnabled(true);
    if (n && this._rest && this._rest[i]) n.setLocalPos(this._rest[i][0], this._rest[i][1]);
  }

  placeManA(pos) {
    const n = this.core.manA;
    if (n) n.setLocalPos(pos === 'A1' ? -387.6 : 0, -240);
  }

  /* PlayerControl_OnLeftPanelDown 0xCA50 (Eyesight); the other two scenes have
     the same body. */
  goSide(left) {
    const c = this.core;
    if (c.IsInSwingColddown || this.over) return;
    c.IsInSwingColddown = true;
    const from = c.ManACurPos;
    if (left) {
      c.ManASwingSequenceTmp = (c.SequenceState === SeqState.Lose)
        ? c.cfg.BlackSwingSequence : c.cfg.NormalSwingSequence;
      c.ManACurPos = 'A1';
      if (from === 'A1') c.ManASwing();
      else { this.placeManA('A1'); LT.delayedCall(0.05, () => c.ManASwing()); }
    } else {
      c.ManASwingSequenceTmp = (c.SequenceState === SeqState.Lose)
        ? c.cfg.BlackSwingSequence : c.cfg.NormalSwingSequence;
      if (from === 'A1') {
        c.ManACurPos = (c.ManAHitPos === 'A3') ? 'A3' : 'A2';
        this.placeManA(c.ManACurPos);
        LT.delayedCall(0.05, () => c.ManASwing());
      } else if (from === 'A2') {
        c.ManACurPos = (c.ManAHitPos === 'A3') ? 'A3' : 'A2';
        c.ManASwing();
      } else {
        c.ManACurPos = (c.ManAHitPos === 'A2') ? 'A2' : 'A3';
        c.ManASwing();
      }
    }
  }
  /* the panel handlers; InvertModePlayerControl 0xF734 crosses them over --
     pressing the left panel runs GoLeft but animates the RIGHT button. */
  GoLeft() { this.btnDown(true); this.goSide(true); }
  GoRight() { this.btnDown(false); this.goSide(false); }

  Pause(v) {
    this.isGamePause = v;
    this.core.Pause(v);
    if (v) this.pause.show(); else this.pause.hide();
    for (const n of [this.hitL, this.hitR, this.hitLShadow, this.hitRShadow])
      if (n) n.setActive(!v);
  }

  /* --------------------------------------------------------------- losing */
  Core_Lose() { this.LoseAnim(); }

  /* <LoseAnim>c__Iterator0 -- Eyesight 0xE1xx, Concentrate and Invert carry a
     line-for-line copy.  The whole scene inverts to black and the two men
     freeze into their win/lose poses. */
  async LoseAnim() {
    const g = this.gen, c = this.core;
    this.over = true;
    this.HideHitBtnImmidiatly();
    if (this.mgr.settings) this.mgr.settings.SettingBtnHide(0.2);
    if (c.table) c.table.setSprite(c.cfg.BlackTableSprite);
    if (c.manB) c.manB.setSprite(c.cfg.BlackSwingSequence[0]);
    c.LoseBallTrailAnimDelay = 0.07;
    if (!c.IsInSwingColddown && c.manA) c.manA.setSprite(c.cfg.BlackSwingSequence[0]);
    c.ManASwingSequenceTmp = c.cfg.BlackSwingSequence;
    const trail = c.trailNode[c.curTrail];
    if (trail) trail.setColor([1, 1, 1, 1]);
    if (this.bg) this.bg.setColor(this.hex('161616FF'));
    if (this.modeText) this.modeText.setColor([1, 1, 1, 1]);
    this.ScoreToBlackMode();
    Audio_.play('Lose');
    if (c.manASurprise) {
      c.manASurprise.setEnabled(true);
      LT.scale(c.manASurprise, [3, 2.4], 0.3).setEase(24);
    }
    await wait(700);
    if (g !== this.gen) return;

    this.TouchBlockEnable(true);
    if (c.manAWinLose) c.manAWinLose.setLocalPos(c.ManACurPos === 'A1' ? -331 : 0, -424.5);
    if (c.manBWinLose) c.manBWinLose.setLocalPos(c.ManBCurPos === 'B1' ? 404.5 : 49.3, 253.5);
    for (const n of [c.manA, c.manAA3, c.manB]) if (n) n.setEnabled(false);
    if (c.manAWinLose) {
      c.manAWinLose.setSprite(c.cfg.BlackManLoseSprite);
      c.manAWinLose.setColor([1, 1, 1, 1]);
      c.manAWinLose.setNativeSize();
      c.manAWinLose.setEnabled(true);
    }
    if (c.manBWinLose) {
      c.manBWinLose.setSprite(c.cfg.BlackManWinSprite);
      c.manBWinLose.setColor([1, 1, 1, 1]);
      c.manBWinLose.setNativeSize();
      c.manBWinLose.setEnabled(true);
    }
    if (c.manASurprise) c.manASurprise.setEnabled(false);
    if (c.manBWinLose) LT.moveLocalY(c.manBWinLose, c.manBWinLose.localPos[1] + 50, 0.07).setLoopPingPong(2);
    await wait(500);
    if (g !== this.gen) return;
    await wait(500);                              // ShowInterStitialWithCondition_Endless
    if (g !== this.gen) return;

    const score = this.scoreValue();
    const prev = parseFloat(DB.data[this.dbKey] || 0);
    const best = Math.max(score, prev);
    DB.data[this.dbKey] = best;
    DB.save();
    const k = this.GetScoreClass(score);
    if (this.modeText) LT.value(this.modeText.alpha, 1, 0.2, () => {});
    if (this.modeText) this.modeText.setColor(this.hex('161616FF'));
    this.result.show(this.scoreString(score), this.scoreString(best, true),
                     k.c, k.bg, k.talk);
  }

  /* GetScoreClass 0xD990.  [sic] the linear search falls through to
     `Find(x => x.className == "S")` when nothing matches, so any score past
     the last upper bound is graded S rather than clamped. */
  GetScoreClass(score) {
    for (const k of this.classes) if (score >= k.lo && score < k.hi) return k;
    return this.classes.find(x => x.c === 'S') || this.classes[0];
  }

  /* per-mode hooks */
  ResetScore() {}
  ScoreToBlackMode() {}
  scoreValue() { return 0; }
  scoreString(v) { return String(v); }
  EnterChain() {}
  Core_SetFromBall() {}
  Core_SetToBall() {}
  Core_Touch_ManA_Table() { this.core.FromBallTrailAnimDelay = this.PlayerSideFrameInterval; }
  Core_Touch_ManB_Table() { this.core.ToBallTrailAnimDelay = this.model.middleFrameInterval * 1.1; }

  /* the tail every mode's Core_SetToBall shares: pick the trail, and reward a
     hit inside the first six frames of the window with a faster return */
  ToBallCommon() {
    const c = this.core, m = this.model;
    const nm = `To-${c.ManAHitPos}-${c.ManBNextPos} Image`;
    c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    if (c.curSpriteIndex < c.hitBackStartFrame + 6) {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.4;
      this.isHitSweetSpot = true;
      Audio_.play('HardHit');                       // Audios.ManAUseForce
    } else {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.7;
      this.isHitSweetSpot = false;
    }
  }

  /* the tail every mode's Core_SetFromBall shares once the intervals are set */
  FromBallCommon() {
    const c = this.core, d = this.CurRoundData;
    if (c.ManBCurPos === 'B2') c.ManAHitPos = (randRange(1, 4) < 2) ? 'A3' : 'A1';
    if (c.ManBCurPos === 'B2' || c.ManBCurPos === 'B3') {
      d.MovementType = MovementType.Fast;
      d.SpeedType = SpeedType.Nothing;
      c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.85;
    }
    if (d.MovementType === MovementType.Slow) {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos}-Slow Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      /* LeanTween.value ramps the frame interval up over six frames' worth of
         time -- the ball visibly loses pace on a slow ball */
      LT.value(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval,
               this.MiddleFrameInterval * 6, v => { c.FromBallTrailAnimDelay = v; });
      return true;
    }
    const nm = `From-${c.ManBCurPos}-${c.ManAHitPos} Image`;
    c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    return false;
  }

  wire() {
    this.onPointer = (x, y) => {
      const r = this.result.hit(x, y);
      if (r === 'retry') { this.Retry(); return; }
      if (r === 'home') { this.mgr.goHome(); return; }
      if (r === 'mode') { this.mgr.goEndlessList(); return; }
      if (this.result.shown) return;
      const p = this.pause.hit(x, y);
      if (p === 'resume') { this.mgr.settings.onSettingBtnDown(this.mgr.curSceneState); return; }
      if (p === 'home') { this.mgr.goHome(); return; }
      if (this.pause.shown) return;
      const st = $('#stage').getBoundingClientRect();
      if (x - st.left < st.width / 2) this.GoLeft(); else this.GoRight();
    };
  }
  Retry() { this.enter(); }
}

/* ------------------------------------------------------------ EYESIGHT TEST
 * Not an endless rally: every point is a whole little match against a rival
 * drawn from the career table, and each one you win shrinks the entire play
 * area by 15%.  The score is how small you could still see. */
class EyesightModeSceneView extends ModeSceneView {
  ResetScore() {
    this.PlayerScore = 1;                          // 0xD66C: the score starts at 1
    this.RoundCount = 0;
    if (this.scoreText) { this.scoreText.setText('1'); this.scoreText.setColor(this.hex('161616FF')); this.scoreText.setLocalScale(1, 1); }
    this.model.LoadLevelProb(this.PlayerScore * 2 >= 50 ? 70 : 3 + this.PlayerScore * 2);
  }
  ScoreToBlackMode() { if (this.scoreText) this.scoreText.setColor([1, 1, 1, 1]); }
  scoreValue() { return this.PlayerScore; }
  scoreString(v) { return String(v); }
  EnterChain() {
    const g = this.gen;
    LT.delayedCall(0.8, () => LT.delayedCall(1.0, () => { if (g === this.gen) this.StartServe(); }));
  }

  /* EyesightModeScene::SetUserSpeedByBiasPercentage 0xCEF0 -- the only one of
     the three that is actually reachable (see the note in the other two). */
  SetUserSpeedByBiasPercentage() {
    const mix = ([hi, lo]) => lo + (hi - lo) * MODE_BIAS;
    this.EnemySideFrameInterval = mix(MODE_BOUNDS.enemy);
    this.MiddleFrameInterval = mix(MODE_BOUNDS.middle);
    this.PlayerSideFrameInterval = mix(MODE_BOUNDS.player);
    const r = MODE_RAMP[Math.min(5, Math.max(1, this.PlayerScore))];
    this.MiddleFrameInterval *= r.mid;
    this.PlayerSideFrameInterval *= r.side;
    this.EnemySideFrameInterval *= r.side;
  }

  /* EyesightModeScene::Core_SetFromBall 0xC1xx */
  Core_SetFromBall() {
    const c = this.core, m = this.model;
    c.ManBCurPos = c.ManBNextPos;
    if (m.Level_Goal() - this.RoundCount === 0) {
      /* the rival has run out of returns: the ball flies past him */
      c.SequenceState = SeqState.ManBLose;
      const nm = `Lose-${c.ManAHitPos}-${c.ManBNextPos} Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      c.LoseBallTrailAnimDelay = 0.04;
      this.PlayerScore++;
      this.WinAnim();
      return;
    }
    c.SequenceState = SeqState.From;
    this.CurRoundData = m.Level_GetRoundDataAndDelete(this.RoundCount);
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;
    this.SetUserSpeedByBiasPercentage();           // after ChangeUserBiasPercentage
    const tbl = this.standing();
    const e = tbl[c.ManBCurPos] || tbl.B1;
    c.ManAHitPos = this.CurRoundData.IsFromLeft ? e.L : e.R;
    if (this.FromBallCommon()) return;
    if (this.CurRoundData.SpeedType === SpeedType.ImpulseEaseOut) {
      const o = DB.data.OutterStageOrder;
      if (o <= 3)      { c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.40; this.PlayerSideFrameInterval *= 0.70; }
      else if (o <= 5) { c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.30; this.PlayerSideFrameInterval *= 0.70; }
      else if (o <= 7) { c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.27; this.PlayerSideFrameInterval *= 0.70; }
      else             { c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.24; this.PlayerSideFrameInterval *= 0.64; }
    } else {
      c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.9;
      this.PlayerSideFrameInterval *= 0.9;
    }
  }

  /* EyesightModeScene::Core_SetToBall 0xC5F8 */
  Core_SetToBall() {
    const c = this.core, m = this.model;
    this.RoundCount++;
    this.NextRoundData = m.Level_GetNextRoundData();
    if (m.Level_Goal() - this.RoundCount === 0) c.IsManBLoseAtThisRound = true;
    const tbl = this.standing();
    const e = tbl[c.ManAHitPos] || tbl.A1;
    c.ManBNextPos = randRange(0, 2) === 0 ? e.L : e.R;
    if (c.ManAHitPos === 'A2') c.ManBNextPos = 'B1';
    c.IsSwingHard = (this.NextRoundData.MovementType !== MovementType.Slow) || (c.ManBNextPos === 'B3');
    this.ToBallCommon();
  }

  /* EyesightModeScene::Core_Touch_ManA_Table 0xC8D0 */
  Core_Touch_ManA_Table() {
    const c = this.core;
    if (c.ManAHitPos !== 'A3') { c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval; return; }
    const far = DB.data.OutterStageOrder >= 8;
    if (c.ManBCurPos === 'B3') c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * (far ? 1.1 : 1.0);
    else if (c.ManBCurPos === 'B2') c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * (far ? 1.45 : 1.3);
  }

  /* <WinAnim>c__Iterator1 0xE9xx -- the point you just won, then the shrink */
  async WinAnim() {
    const g = this.gen, c = this.core;
    if (c.manBSurprise) c.manBSurprise.setEnabled(true);
    if (c.manAWinLose) c.manAWinLose.setLocalPos(c.ManACurPos === 'A1' ? -331 : 0, -424.5);
    if (c.manBWinLose) c.manBWinLose.setLocalPos(c.ManBCurPos === 'B1' ? 404.5 : 49.3, 253.5);
    this.TouchBlockEnable(true);
    await wait(1100);
    if (g !== this.gen) return;

    if (c.manBSurprise) c.manBSurprise.setEnabled(false);
    for (const n of [c.manA, c.manB]) if (n) n.setEnabled(false);
    if (c.manAWinLose) {
      c.manAWinLose.setColor([1, 1, 1, 1]); c.manAWinLose.setEnabled(true);
      c.manAWinLose.setSprite(c.cfg.NormalWinSprite); c.manAWinLose.setNativeSize();
      LT.moveLocalY(c.manAWinLose, c.manAWinLose.localPos[1] + 50, 0.07).setLoopPingPong(2);
    }
    if (c.manBWinLose) {
      c.manBWinLose.setColor([1, 1, 1, 1]); c.manBWinLose.setEnabled(true);
      c.manBWinLose.setSprite(c.cfg.NormalLoseSprite); c.manBWinLose.setNativeSize();
    }
    await wait(150); if (g !== this.gen) return;
    await wait(350); if (g !== this.gen) return;

    /* the eyesight test itself: eleven shrinks, and no more */
    if (this.PlayerScore < 11 && this.coreGroup)
      LT.scale(this.coreGroup, this.coreGroup.scale[0] * 0.85, 1).setEase(31);
    await wait(800); if (g !== this.gen) return;

    if (this.scoreText) {
      this.scoreText.setText(String(this.PlayerScore));
      LT.scale(this.scoreText, 1.1, 0.12).setLoopPingPong(1);
    }
    await wait(500); if (g !== this.gen) return;

    this.model.LoadLevelProb(this.PlayerScore * 2 > 50 ? 70 : 3 + this.PlayerScore * 2);
    this.RoundCount = 0;
    this.Reset_WinBall();
    await wait(350); if (g !== this.gen) return;
    c.StartRun(false);
    await wait(250); if (g !== this.gen) return;
    this.TouchBlockEnable(false);
    this.ShowHitBtn(1);
  }

  /* EyesightModeScene::Reset_WinBall 0xD28C */
  Reset_WinBall() {
    const c = this.core;
    const trail = c.trailNode[c.curTrail];
    if (trail) trail.setActive(false);
    if (c.manAWinLose) c.manAWinLose.setEnabled(false);
    if (c.manBWinLose) c.manBWinLose.setEnabled(false);
    if (c.manA) { c.manA.setSprite(c.cfg.NormalSwingSequence[0]); c.manA.setEnabled(true); }
    if (c.manB) { c.manB.setSprite(c.cfg.NormalSwingSequence[0]); c.manB.setEnabled(true); }
    if (c.manA) LT.moveLocal(c.manA, -387.6, -240, 0.05).setEase(27);
    if (c.manB) c.manB.setLocalPos(543.93, 489.1);
    c.ManACurPos = 'A1'; c.ManBCurPos = 'B1'; c.ManAHitPos = 'A1';
    if (c.missText) c.missText.setColor(this.hex('16161600'));
  }
}

/* ------------------------------------------------------- CONCENTRATION TEST
 * One button.  Every ball comes to the same place, and the only thing that
 * changes is how fast; the score is how long you lasted. */
class ConcentrateModeSceneView extends ModeSceneView {
  get isTimed() { return true; }
  ResetScore() {
    this.PlayerScore = 0;                          // never incremented in this scene
    this.RoundCount = 0;
    this.ConcentrateTime = 0;
    if (this.scoreText) { this.scoreText.setText("0'00"); this.scoreText.setColor(this.hex('161616FF')); }
    this.model.LoadLevelProb(DB.data.OutterStageOrder * 5 + this.PlayerScore + 1);
    clearInterval(this._timer);
  }
  ScoreToBlackMode() {
    clearInterval(this._timer);
    if (this.scoreText) this.scoreText.setColor([1, 1, 1, 1]);
  }
  scoreValue() { return this.ConcentrateTime; }
  scoreString(v) { return v.toFixed(1).replace('.', "'"); }
  EnterChain() {
    const g = this.gen;
    LT.delayedCall(0.8, () => LT.delayedCall(1.0, () => {
      if (g !== this.gen) return;
      this.StartServe();
      this.ConcentrateTimeCount();
    }));
  }

  /* <ConcentrateTimeCount>c__Iterator1: one add per frame, printed to two
     decimals with the point drawn as an apostrophe */
  ConcentrateTimeCount() {
    clearInterval(this._timer);
    this._last = performance.now();
    this._timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this._last) / 1000; this._last = now;
      if (this.isGamePause || this.over) return;
      this.ConcentrateTime += dt;
      if (this.scoreText) this.scoreText.setText(this.ConcentrateTime.toFixed(2).replace('.', "'"));
    }, 16);
  }

  /* ConcentrateModeScene::Core_SetFromBall 0x5xxx */
  Core_SetFromBall() {
    const c = this.core, m = this.model;
    c.ManBCurPos = c.ManBNextPos;
    c.SequenceState = SeqState.From;
    this.CurRoundData = m.Level_GetRoundDataAndDelete(this.RoundCount);
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;
    if (this.RoundCount > 15) this.RoundCount = 15;
    /* one ball in four gives you two rounds back -- a breather */
    if (randRange(0, 4) === 0) { this.RoundCount -= 2; if (this.RoundCount < 0) this.RoundCount = 0; }
    const mix = ([hi, lo]) => lo + (hi - lo) * 0.09;
    this.EnemySideFrameInterval = mix(MODE_BOUNDS.enemy);
    this.MiddleFrameInterval = mix(MODE_BOUNDS.middle);
    this.PlayerSideFrameInterval = mix(MODE_BOUNDS.player);
    const t = this.RoundCount / 15;
    const lerp = (a, b) => a + (b - a) * t;
    this.MiddleFrameInterval *= lerp(0.85, 0.72);
    this.PlayerSideFrameInterval *= lerp(0.85, 0.62);
    this.EnemySideFrameInterval *= lerp(1.0, 0.48);
    this.CurRoundData.IsFromLeft = true;
    c.ManAHitPos = (STAND_GALAXY[c.ManBCurPos] || STAND_GALAXY.B1).L;
    if (randRange(0, 11) === 1) this.CurRoundData.MovementType = MovementType.Slow;
    else { this.CurRoundData.MovementType = MovementType.Fast;
           this.CurRoundData.SpeedType = SpeedType.ImpulseEaseOut; }
    if (this.CurRoundData.MovementType === MovementType.Slow) {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos}-Slow Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      LT.value(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval,
               this.MiddleFrameInterval * 6, v => { c.FromBallTrailAnimDelay = v; });
      return;
    }
    const nm = `From-${c.ManBCurPos}-${c.ManAHitPos} Image`;
    c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    if (this.CurRoundData.SpeedType === SpeedType.ImpulseEaseOut) {
      c.FromBallTrailAnimDelay = lerp(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval * 0.22);
      this.PlayerSideFrameInterval = lerp(this.PlayerSideFrameInterval * 0.7, this.PlayerSideFrameInterval * 0.62);
    }
  }

  /* ConcentrateModeScene::Core_SetToBall */
  Core_SetToBall() {
    const c = this.core, m = this.model;
    this.RoundCount++;
    this.NextRoundData = m.Level_GetNextRoundData();
    c.ManBNextPos = (STAND_GALAXY[c.ManAHitPos] || STAND_GALAXY.A1).R;
    c.IsSwingHard = (this.NextRoundData.MovementType !== MovementType.Slow) || (c.ManBNextPos === 'B3');
    this.ToBallCommon();
  }

  Core_Touch_ManA_Table() {
    const c = this.core, t = this.RoundCount / 15;
    const lerp = (a, b) => a + (b - a) * t;
    c.FromBallTrailAnimDelay = (this.CurRoundData.MovementType === MovementType.Slow)
      ? lerp(this.PlayerSideFrameInterval * 1.5, this.PlayerSideFrameInterval * 1.1)
      : lerp(this.PlayerSideFrameInterval * 0.7, this.PlayerSideFrameInterval * 0.5);
  }

  /* ConcentratePlayerControl 0x8BDC touches only the left button; the scene
     ships without a right one, and both halves of the screen run GoLeft. */
  ShowHitBtn(a) {
    for (const n of [this.hitL, this.hitLText]) if (n) n.setEnabled(true);
    if (this.hitL) LT.alpha(this.hitL, a, 0.5).setEase(14);
    if (this.hitLShadow) LT.alpha(this.hitLShadow, 0.2 * a, 0.5).setEase(15);
    if (this.hitLText) LT.alpha(this.hitLText, a, 0.5).setEase(14);
  }
  HideHitBtnImmidiatly() {
    for (const n of [this.hitL, this.hitLText]) if (n) n.setEnabled(false);
    for (const n of [this.hitL, this.hitLShadow, this.hitLText]) if (n) n.setAlpha(0);
  }
  GoRight() { this.GoLeft(); }
}

/* ------------------------------------------------------------- REVERSE TEST
 * Endless, and the two buttons trade places two seconds in -- a pair of hands
 * reaches on screen, picks them up and swaps them over.  Left still means
 * left, so the labels are the wrong way round for the rest of the run. */
class InvertModeSceneView extends ModeSceneView {
  constructor(host, mgr, sceneName) {
    super(host, mgr, sceneName);
    const s = this.scene, T = 'Canvas/Top Group/';
    this.padOne = new ScorePad(s, T + 'ScorePad_digitOne Group');
    this.padTen = new ScorePad(s, T + 'ScorePad_digitTen Group');
    this.padHundred = new ScorePad(s, T + 'ScorePad_digitHundred Group');
    const C = 'Canvas/PlayerControl Group/';
    this.leftHand = s.n(C + 'LeftHand Image');
    this.rightHand = s.n(C + 'RightHand Image');
    for (const n of [this.leftHand, this.rightHand]) if (n) n.setActive(false);
    this.handHome = s.n(C.slice(0, -1));
    const pc = s.comp('Canvas/PlayerControl Group', 'InvertModePlayerControl') || {};
    this.InvertHand01 = pc.InvertHand01; this.InvertHand02 = pc.InvertHand02;
  }
  get isInverted() { return true; }

  ResetScore() {
    this.PlayerScore = 0;
    this.RoundCount = 0;
    this.digit_one = 0; this.digit_ten = 0; this.digit_hundred = 0;
    this.padOne.Reset(0); this.padTen.Reset(0);
    this.model.Endless_MakeBallList();
    /* if a previous run left the buttons swapped, put them back before the
       hands come on again (0x12C68) */
    if (this.hitL && this.hitR && this.hitL.localPos[0] > this.hitR.localPos[0]) {
      const lp = this.hitL.localPos.slice(), rp = this.hitR.localPos.slice();
      this.hitL.setLocalPos(rp[0], rp[1]);
      this.hitR.setLocalPos(lp[0], lp[1]);
    }
    this._rest = [this.hitL ? this.hitL.localPos.slice() : null,
                  this.hitR ? this.hitR.localPos.slice() : null];
  }
  ScoreToBlackMode() { this.padOne.ChangeToBlackMode(); this.padTen.ChangeToBlackMode(); }
  scoreValue() { return this.PlayerScore; }
  scoreString(v, isBest) { return String(isBest ? Math.trunc(v) : v); }

  EnterChain() {
    const g = this.gen;
    this.ShowHitBtn(1);
    LT.delayedCall(2.0, () => { if (g === this.gen) this.SwitchLeftRightBtn(); });
    LT.delayedCall(3.0, () => LT.delayedCall(1.0, () => { if (g === this.gen) this.StartServe(); }));
  }

  /* the panel handlers are crossed over (InvertModePlayerControl 0xF734): the
     left panel still swings left, but it is the RIGHT button that dips. */
  GoLeft() { this.btnDown(false); this.goSide(true); }
  GoRight() { this.btnDown(true); this.goSide(false); }

  /* <SwitchLeftRightBtnAnim>c__Iterator0 0xF800 */
  async SwitchLeftRightBtnAnim() {
    const g = this.gen, L = this.leftHand, R = this.rightHand;
    if (!L || !R || !this.hitL || !this.hitR) return;
    R.setLocalPos(R.localPos[0], L.localPos[1]);
    L.setActive(true); R.setActive(true);
    if (this.InvertHand01) { L.setSprite(this.InvertHand01); R.setSprite(this.InvertHand01); }
    LT.moveLocalX(R, this.hitR.rect.w / 2, 0.5).setEase(15);
    LT.moveLocalX(L, -this.hitL.rect.w / 2, 0.5).setEase(15);
    await wait(600); if (g !== this.gen) return;

    LT.moveLocalY(L, L.localPos[1] - 50, 0.1).setEase(15);
    LT.moveLocalY(R, R.localPos[1] - 50, 0.1).setEase(15);
    await wait(100); if (g !== this.gen) return;

    if (this.InvertHand02) { L.setSprite(this.InvertHand02); R.setSprite(this.InvertHand02); }
    L.setParentNode(this.hitL); R.setParentNode(this.hitR);
    await wait(16); if (g !== this.gen) return;

    const leftBtnPos = [this.hitR.localPos[0] + this.hitR.rect.w, this.hitL.localPos[1]];
    const rightBtnPos = [this.hitL.localPos[0] - this.hitL.rect.w, this.hitR.localPos[1]];
    LT.moveLocal(this.hitL, leftBtnPos[0], leftBtnPos[1], 0.8).setEase(15);
    LT.moveLocalY(this.hitR, rightBtnPos[1] + 500, 0.4).setEase(15).setLoopPingPong(1);
    LT.moveLocalX(this.hitR, rightBtnPos[0], 0.8).setEase(15);
    await wait(800); if (g !== this.gen) return;
    this._rest = [leftBtnPos, rightBtnPos];

    L.setParentNode(this.handHome); R.setParentNode(this.handHome);
    await wait(16); if (g !== this.gen) return;
    LT.moveLocalY(L, L.localPos[1] + 50, 0.1).setEase(15);
    LT.moveLocalY(R, R.localPos[1] + 50, 0.1).setEase(15);
    if (this.InvertHand01) { L.setSprite(this.InvertHand01); R.setSprite(this.InvertHand01); }
    await wait(200); if (g !== this.gen) return;
    LT.moveLocalX(R, 3000, 1).setEase(15);
    LT.moveLocalX(L, -3000, 1).setEase(15);
    await wait(1000); if (g !== this.gen) return;
    L.setActive(false); R.setActive(false);
  }
  SwitchLeftRightBtn() { this.SwitchLeftRightBtnAnim(); }

  /* InvertModeScene::Core_SetFromBall 0x10xxx */
  Core_SetFromBall() {
    const c = this.core, m = this.model;
    c.ManBCurPos = c.ManBNextPos;
    c.SequenceState = SeqState.From;
    this.CurRoundData = m.Endless_GetRoundDataAndDelete(this.RoundCount);
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;
    if (this.RoundCount > 15) this.RoundCount = 0;   // [sic] reset, not clamped
    const mix = ([hi, lo]) => lo + (hi - lo) * 0.09;
    this.EnemySideFrameInterval = mix(MODE_BOUNDS.enemy);
    this.MiddleFrameInterval = mix(MODE_BOUNDS.middle);
    this.PlayerSideFrameInterval = mix(MODE_BOUNDS.player);
    const t = this.RoundCount / 15;
    const lerp = (a, b) => a + (b - a) * t;
    this.MiddleFrameInterval *= lerp(1.0, 0.40);
    this.PlayerSideFrameInterval *= lerp(1.6, 0.66);
    this.EnemySideFrameInterval *= lerp(1.6, 0.72);
    const e = STAND_GALAXY[c.ManBCurPos] || STAND_GALAXY.B1;
    c.ManAHitPos = this.CurRoundData.IsFromLeft ? e.L : e.R;
    if (this.FromBallCommon()) return;
    if (this.CurRoundData.SpeedType === SpeedType.ImpulseEaseOut) {
      const t10 = this.RoundCount / 10;
      const l10 = (a, b) => a + (b - a) * t10;
      c.FromBallTrailAnimDelay = l10(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval * 0.24);
      this.PlayerSideFrameInterval = l10(this.PlayerSideFrameInterval * 0.74, this.PlayerSideFrameInterval * 0.64);
    } else {
      c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.9;
      this.PlayerSideFrameInterval *= 0.9;
    }
  }

  /* InvertModeScene::Core_SetToBall 0x10C08 */
  Core_SetToBall() {
    const c = this.core, m = this.model;
    this.RoundCount++;
    this.NextRoundData = m.Endless_GetNextRoundData();
    this.PlayerScore++;
    if (this.PlayerScore % 10 !== this.digit_one) {
      this.padOne.Flip(this.digit_one, this.PlayerScore % 10);
      this.digit_one = this.PlayerScore % 10;
    }
    if (Math.trunc((this.PlayerScore % 100) / 10) !== this.digit_ten) {
      this.padTen.Flip(this.digit_ten, Math.trunc((this.PlayerScore % 100) / 10));
      this.digit_ten = Math.trunc((this.PlayerScore % 100) / 10);
    }
    const tbl = this.standing();
    const e = tbl[c.ManAHitPos] || tbl.A1;
    c.ManBNextPos = randRange(0, 2) === 0 ? e.L : e.R;
    if (c.ManAHitPos === 'A2') c.ManBNextPos = 'B1';
    c.IsSwingHard = (this.NextRoundData.MovementType !== MovementType.Slow) || (c.ManBNextPos === 'B3');
    this.ToBallCommon();
  }

  Core_Touch_ManA_Table() {
    const c = this.core;
    if (c.ManAHitPos !== 'A3') { c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval; return; }
    const far = DB.data.OutterStageOrder >= 8;
    if (c.ManBCurPos === 'B3') c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * (far ? 1.1 : 1.0);
    else if (c.ManBCurPos === 'B2') c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * (far ? 1.45 : 1.3);
  }
}

const MODE_VIEW = {
  EyesightModeScene: EyesightModeSceneView,
  ConcentrateModeScene: ConcentrateModeSceneView,
  InvertModeScene: InvertModeSceneView,
};

Object.assign(window, { ModeSceneView, EyesightModeSceneView, ConcentrateModeSceneView,
                        InvertModeSceneView, ScorePad, ResultPage, PausePage,
                        SCORE_CLASSES, MODE_BOUNDS, MODE_BIAS, MODE_RAMP, MODE_VIEW });


/* ========================================================= EndlessController
 * The IMPOSSIBLE TEST list: three mode cards, each showing your best score and
 * the class badge it earned.  EndlessController lives on the shared Top Canvas,
 * so it is built from that scene. */
const MODE_OF_BTN = {
  'EyesightModeBtn Image': 'EyesightModeScene',
  'ConcentrateModeBtn Image': 'ConcentrateModeScene',
  'InvertModeBtn Image': 'InvertModeScene',
};

class EndlessListView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('Top Canvas', host);
    const s = this.scene;
    s.hide('Setting Group', 'BannerControll Group');
    this.main = s.n('EndlessModeList Group/MainObj');
    if (this.main) this.main.setActive(true);
    this.back = s.n('EndlessModeList Group/MainObj/BackBtnShadowBg Image');
    this.btns = {};
    const G_ = 'EndlessModeList Group/MainObj/Componet Group/';
    for (const [btn, sceneName] of Object.entries(MODE_OF_BTN)) {
      const n = s.n(G_ + btn);
      if (!n) continue;
      this.btns[sceneName] = n;
      /* each card's own ModeListComponent fills in the score and badge */
      const cls = s.n(G_ + btn + '/Badge Image/Class Text');
      const score = s.n(G_ + btn + '/Score Text');
      const intro = s.n(G_ + btn + '/ModeIntroAlert Group');
      if (intro) intro.setActive(false);
      const best = parseFloat(DB.data['best_' + sceneName] || 0);
      const timed = sceneName === 'ConcentrateModeScene';
      if (score) score.setText(best ? (timed ? best.toFixed(2).replace('.', "'") : String(Math.round(best))) : '-');
      if (cls) {
        const table = SCORE_CLASSES[sceneName];
        const k = table.find(x => best >= x.lo && best < x.hi);
        cls.setText(best ? (k ? k.c : table[0].c) : '-');
      }
    }
  }
  destroy() { this.scene.destroy(); }

  hit(x, y) {
    for (const [sceneName, n] of Object.entries(this.btns)) {
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return sceneName;
    }
    if (this.back) {
      const r = this.back.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'back';
    }
    return null;
  }
}

Object.assign(window, { EndlessListView, MODE_OF_BTN });
