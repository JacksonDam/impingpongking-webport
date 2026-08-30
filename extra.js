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
    this.skipAlertBg = N(this.cfg.SkipAlertBGImage);
    this.skipAlert1 = N(this.cfg.SkipAlert1Text);
    this.skipAlert21 = N(this.cfg.SkipAlert2_1Text);
    this.skipAlert22 = N(this.cfg.SkipAlert2_2Text);
    this.skipAlert23 = N(this.cfg.SkipAlert2_3Text);
    this.skipYes = N(this.cfg.SkipAlertYesBtn);
    this.skipNo = N(this.cfg.SkipAlertNoBtn);
    this.skipOk = N(this.cfg.SkipAlertOKBtn);
    this.skipYesText = N(this.cfg.SkipAlertYesText);
    this.skipNoText = N(this.cfg.SkipAlertNoText);
    this.skipOkText = N(this.cfg.SkipAlertOKText);
    this.skipMenu = N(this.cfg.SkipMenuImage);
    this.skipHowTo = N(this.cfg.SkipHowToPlayImage);
    this.skipArrow1 = N(this.cfg.SkipAlertArrow1Image);
    this.skipArrow2 = N(this.cfg.SkipAlertArrow2Image);
    this.goal3 = N(this.cfg.Goal3Text);
    /* GameMgr::Init 0x27EC -- RemoteConfig.setName defaults to "Random", which
       matches none of A/B/C/D, so a virgin save falls through to set "D" and
       totalEnemyNum = 50.  The prefab ships the old "10" as a placeholder. */
    if (this.goal3) this.goal3.setText('Try to beat ' + (DB.data.totalEnemyNum || 50) + ' of us!');
    this.missionText = N(this.cfg.Tutorial_LittleMissionText);
    this.remainBalls = (this.cfg.Tutorial_RemainBallImage || []).map(N).filter(Boolean);
    this.remainCovers = (this.cfg.Tutorial_RemainBallCoverImage || []).map(N).filter(Boolean);
    this.IsSkipAlertShow = false;
    this.IsTutorialSkip = false;
    this.skipStage = 0;                              // 0 none, 1 Yes/No, 2 OK
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
    /* the second alert's half of the panel starts invisible; the Yes button
       fades it up in place of the first */
    for (const n of [this.skipAlert21, this.skipAlert22, this.skipAlert23,
                     this.skipOk, this.skipOkText, this.skipMenu,
                     this.skipHowTo, this.skipArrow1, this.skipArrow2]) if (n) n.setAlpha(0);
    if (this.missionText) this.missionText.setAlpha(0);
    for (const n of this.remainBalls) if (n) n.setEnabled(false);
  }

  /* ------------------------------------------------------------- skipping */
  inside(n, x, y) {
    if (!n || !n.active) return false;
    const r = n.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* Tutorial_OnSkipBtnClick 0x3C310 */
  skipTap(x, y) {
    if (this.skipStage === 1) {
      if (this.inside(this.skipYes, x, y)) { this.SkipAlert1_Yes(); return true; }
      if (this.inside(this.skipNo, x, y)) { this.SkipAlert1_No(); return true; }
      return true;                                   // the panel blocks the rest
    }
    if (this.skipStage === 2) {
      if (this.inside(this.skipOk, x, y)) { this.SkipAlert2_OK(); return true; }
      return true;
    }
    if (this.IsTutorialSkip) return false;
    if (!this.inside(this.skipGroup, x, y) && !this.inside(this.skipText, x, y)) return false;
    this.IsSkipAlertShow = true;
    this.skipStage = 1;
    if (this.skipAlert) this.skipAlert.setActive(true);
    if (this.skipAlertBg) {
      this.skipAlertBg.setLocalScale(0, 0);
      LT.scale(this.skipAlertBg, 1, 0.25).setEase(30);
    }
    return true;
  }

  /* Tutorail_OnSkipAlert1_YesBtnClick 0x3C380 -- the first block fades out and
     the "go to home -> menu -> how to play" explainer fades in behind it */
  SkipAlert1_Yes() {
    this.skipStage = 0;
    for (const n of [this.skipNo, this.skipYes, this.skipYesText,
                     this.skipNoText, this.skipAlert1]) if (n) LT.alpha(n, 0, 0.2);
    LT.delayedCall(0.1, () => {
      if (this.skipAlert21) LT.alpha(this.skipAlert21, 0.8, 0.3);
      if (this.skipAlert22) LT.alpha(this.skipAlert22, 0.8, 0.3);
      if (this.skipAlert23) LT.alpha(this.skipAlert23, 1, 0.3);
      if (this.skipOkText) LT.alpha(this.skipOkText, 1, 0.3);
      for (const n of [this.skipArrow1, this.skipArrow2, this.skipMenu, this.skipHowTo])
        if (n) LT.alpha(n, 1, 0.3);
      if (this.skipOk) LT.alpha(this.skipOk, 1, 0.3).setOnComplete(() => { this.skipStage = 2; });
    });
  }
  /* Tutorail_OnSkipAlert1_NoBtnClick 0x3C45C */
  SkipAlert1_No() {
    this.skipStage = 0;
    if (this.skipAlertBg) LT.scale(this.skipAlertBg, 0, 0.15).setEase(26).setOnComplete(() => {
      this.IsSkipAlertShow = false;
      if (this.skipAlert) this.skipAlert.setActive(false);
    });
  }
  /* Tutorial_OnSkipAlert2_OKBtnClick 0x3C4D8 -- stops TutorialStart and runs
     SkipAnim, which jumps straight to the ten rivals */
  SkipAlert2_OK() {
    this.skipStage = 0;
    this.IsTutorialSkip = true;
    if (this.skipAlertBg) LT.scale(this.skipAlertBg, 0, 0.15).setEase(26).setOnComplete(() => {
      if (this.skipAlert) this.skipAlert.setActive(false);
    });
    this.gen = (this.gen | 0) + 1;                   // StopCoroutine("TutorialStart")
    this.SkipAnim();
  }

  /* SkipBtnHide 0x3C1xx */
  SkipBtnHide() {
    for (const n of [this.skipA1, this.skipA2]) if (n) LT.alpha(n, 0, 0.2);
    if (this.skipText) LT.alpha(this.skipText, 0, 0.2)
      .setOnComplete(() => { if (this.skipGroup) this.skipGroup.setActive(false); });
  }

  /* <SkipAnim>c__Iterator1 0x3F194 -- everything the teaching phase put on
     screen goes away and the rival line-up runs as normal */
  async SkipAnim() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    await wait(600); if (!alive()) return;
    this.SkipBtnHide();
    for (const n of [this.leftFinger, this.rightFinger, this.instruction, this.great])
      if (n) LT.alpha(n, 0, 0.5);
    const c = this.rival && this.rival.core;
    if (c) {
      c.StopRun();
      const t = c.trailNode[c.curTrail];
      if (t) t.setActive(false);
      if (c.manB) LT.alpha(c.manB, 0, 0.5);
      const notif = this.rival.scene.n('Canvas/Core/Table Image/HitOnTableNotification Image');
      if (notif) LT.alpha(notif, 0, 0.5);
    }
    if (this.top) LT.moveLocalY(this.top, 2000, 0.3);
    if (this.bottom) LT.moveLocalY(this.bottom, -2000, 0.3);
    for (const n of [this.leftBtn, this.rightBtn]) if (n) n.setActive(false);
    await wait(1000); if (!alive()) return;
    await this.lineUpAndReady(alive);
  }

  /* Tutorial_HitLeft 0x3C0xx / Tutorial_HitRight 0x3C1A8 -- the button dips
     to y = -746.8 over 0.03 s, and Tutorial_OnHitLeftBtnUp 0x3C158 puts it
     back at (-78, -732). */
  btnDown(left) {
    const n = left ? this.leftBtn : this.rightBtn;
    if (!n || !n.active) return;
    this._bt = this._bt || [];
    const i = left ? 0 : 1;
    if (this._bt[i]) this._bt[i].cancel();
    this._bt[i] = LT.moveLocalY(n, -746.8, 0.03);
    LT.delayedCall(0.12, () => {
      if (this._bt && this._bt[i]) this._bt[i].cancel();
      n.setLocalPos(left ? -78 : 78, -732);
    });
  }

  /* the player taps during the taught hit window */
  onTap(left) {
    this.btnDown(left);
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

  /* <EndingAnim_TournamentMode>c__Iterator3 0x2CFD8 -- the studio's reply, the
     heart, twenty seconds of credits, and "Ping Pong King" with a Like button.
     The BGM is TrueEndingBGM, not the career ending's. */
  async runTournament() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    const W_ = async t => { await wait(t * 1000); return alive(); };
    LT.value(0.15, 0, 0.2, v => Audio_.setBgmVolume(v));
    if (!await W_(0.2)) return;
    if (this.bg) LT.alpha(this.bg, 1, 0.5);
    if (!await W_(2)) return;
    Audio_.setBgmVolume(0);
    Audio_.playBgm('TrueEndingBGM', true);
    LT.value(0, 1, 2, v => Audio_.setBgmVolume(v));
    if (this.tWord11) LT.scale(this.tWord11, 1, 0.5).setEase(30);
    if (!await W_(1.3)) return;
    for (const n of [this.tWord12, this.tWord13]) if (n) LT.alpha(n, 1, 0.5);
    if (!await W_(3.8)) return;
    for (const n of [this.tWord11, this.tWord12, this.tWord13]) if (n) LT.alpha(n, 0, 0.3);
    if (!await W_(0.8)) return;
    if (this.tWord2) LT.alpha(this.tWord2, 1, 0.35);
    if (!await W_(3.8)) return;
    if (this.tWord2) LT.alpha(this.tWord2, 0, 0.3);
    if (!await W_(0.8)) return;
    if (this.tWord3) LT.alpha(this.tWord3, 1, 0.35);
    if (!await W_(0.8)) return;
    if (this.tHeart) LT.scale(this.tHeart, 1, 0.6).setEase(30);
    if (!await W_(3.5)) return;
    if (this.credits) LT.moveLocalY(this.credits, 3611, 20);
    if (this.tHeart) LT.alpha(this.tHeart, 0, 0.3);
    if (this.tWord3) LT.alpha(this.tWord3, 0, 0.3);
    if (!await W_(21)) return;
    if (this.tPPK) {
      LT.alpha(this.tPPK, 1, 0.5);
      LT.moveLocalY(this.tPPK, -478.37, 0.5).setEase(15);
      LT.scale(this.tPPK, 1.013, 1).setLoopPingPong(-1);
    }
    if (this.tLike) {
      LT.alpha(this.tLike, 1, 0.5);
      LT.scale(this.tLike, 1.08, 0.8).setEase(15).setLoopPingPong(-1);
    }
    if (!await W_(0.5)) return;
    /* the two buttons swap sizes for this ending: a small home, a big share */
    if (this.homeShadow) { this.homeShadow.setLocalScale(0.6, 0.6); this.homeShadow.setLocalPos(-174.4, -755.7); }
    if (this.homeBtn && this.cfg.SmallHomeBtnSprite) this.homeBtn.setSprite(this.cfg.SmallHomeBtnSprite);
    if (this.uploadShadow) { this.uploadShadow.setLocalScale(1, 1); this.uploadShadow.setLocalPos(151.376, -682.5); }
    if (this.uploadBtn && this.cfg.BigUploadSprite) this.uploadBtn.setSprite(this.cfg.BigUploadSprite);
    for (const n of [this.homeBtn, this.homeShadow, this.uploadBtn, this.uploadShadow])
      if (n) LT.alpha(n, 1, 0.5);
    if (this.uploadShadow) LT.scale(this.uploadShadow, 1.05, 1).setLoopPingPong(-1);
    if (!await W_(0.35)) return;
    this.homeActive = true;
    if (!await W_(0.65)) return;
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
    c.ShowTossBall();
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
        /* the red quarter of the table lights up on the side the ball is
           going to -- HitOnTableNotificationImage at (-103.6,-37.2) for the
           left, mirrored for the right (TutorialStart, PC 7) */
        if (notif) {                                 // HitOnTableNotificationImage.enabled = 1
          notif.setActive(true);
          notif.setEnabled(true);
          notif.setLocalPos(side ? -103.6 : 103.6, -37.2);
          notif.setAlpha(1);
        }
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
    /* <TutorialStart>c__Iterator0::<>m__0 at +0.1 s: the two HIT buttons ride
       up from y = -1917, where the prefab parks them, to -732 */
    LT.delayedCall(0.1, () => {
      for (const n of [this.leftBtn, this.rightBtn]) {
        if (!n) continue;
        n.setActive(true);
        LT.moveLocalY(n, -732, 0.8).setEase(27);
      }
    });
    /* only the text and the two arrows fade in -- Skip Group's own Image has a
       null sprite, so fading the group would paint a white rectangle. */
    if (!await W_(0.8)) return;
    for (const n of [this.skipA1, this.skipA2, this.skipText]) if (n) LT.alpha(n, 1, 0.2);
    if (!await W_(0.8)) return;

    /* Two taught rallies.  The instruction art slides in at x=129.9, out to
       x=-1238 when the hit lands, swaps to the HIT R sprite and comes back --
       which is why it never sits under "Well done!". */
    if (this.instruction) LT.alpha(this.instruction, 1, 0.5).setEase(15);
    for (const n of [this.leftFinger, this.rightFinger]) if (n) LT.alpha(n, 1, 0.5);
    for (const side of [true, false]) {
      if (this.instruction) {
        if (!side) this.instruction.setSprite(this.cfg.Tutorial_HitRightInstructionSprite);
        LT.moveLocalX(this.instruction, 129.9, side ? 0.5 : 0.4).setEase(30);
      }
      const f = side ? this.leftFinger : this.rightFinger;
      const pulse = f ? LT.scale(f, 1.15, 0.35).setEase(15).setLoopPingPong(-1) : null;
      if (!await W_(0.6)) return;
      if (!await this.taughtRally(side, alive)) return;
      if (pulse) pulse.cancel();
      if (f) f.setLocalScale(1, 1);
      if (this.instruction) LT.moveLocalX(this.instruction, -1238, side ? 0.4 : 0.5).setEase(26);
      this.hitsDone++;
      if (!await W_(0.5)) return;
    }

    /* the rival walks off (0x0D1C) and the little mission is set up */
    const mb = this.rival && this.rival.core && this.rival.core.manB;
    if (mb) { LT.moveLocalX(mb, 1800, 0.5).setEase(26); LT.alpha(mb, 0, 0.5); }
    if (this.rival && this.rival.core) this.rival.core.ChangeTrailImage('');
    if (!await W_(0.4)) return;
    while (this.IsSkipAlertShow && alive()) await wait(16);
    if (!await W_(0.4)) return;

    if (!await this.littleMission(alive)) return;

    /* "Well done!" -- 0x1D8C */
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
    for (const n of [this.leftBtn, this.rightBtn]) if (n) n.setActive(false);
    if (!await W_(0.8)) return;
    await this.lineUpAndReady(alive);
  }

  /* the little mission -- "Hit 3 balls to complete this tutorial." (0x0DF2).
   * Three balls at real speed, left / right / left, each returned one lighting
   * up a ball in the top bar; miss any and the whole drill starts over. */
  async littleMission(alive) {
    const c = this.rival && this.rival.core;
    if (!c) return alive();
    if (this.missionText) {
      LT.moveLocalX(this.missionText, 146, 0.5).setEase(30);
      LT.alpha(this.missionText, 1, 0.5);
      LT.delayedCall(3.5, () => { if (this.missionText) LT.alpha(this.missionText, 0, 0.5); });
    }
    await wait(1000); if (!alive()) return false;
    for (const n of this.remainBalls) {
      n.setEnabled(true);
      n.setColor([1, 1, 1, 0.35]);                   // dim until you win it
      LT.scale(n, 1.5, 0.25).setEase(15).setLoopPingPong(1);
      await wait(100); if (!alive()) return false;
    }
    /* m__4 at +0.8 s brings the rival back on to serve */
    LT.delayedCall(0.8, () => {
      if (c.manB) { LT.moveLocalX(c.manB, 543.93, 0.5).setEase(15); LT.alpha(c.manB, 1, 0.5).setEase(15); }
    });
    await wait(2000); if (!alive()) return false;

    for (;;) {
      for (const n of this.remainBalls) n.setColor([1, 1, 1, 0.35]);
      this.IsLittleMissionLose = false;
      const sides = [true, false, true];             // A1, A2, A1
      let i = 0;
      for (; i < 3; i++) {
        if (!alive()) return false;
        const ok = await this.missionBall(sides[i], i === 0, alive);
        if (!alive()) return false;
        if (!ok) { this.IsLittleMissionLose = true; break; }
        const b = this.remainBalls[i];
        if (b) { b.setColor([1, 1, 1, 1]); LT.scale(b, 2, 0.2).setEase(15).setLoopPingPong(1); }
        await wait(150); if (!alive()) return false;
      }
      if (!this.IsLittleMissionLose) break;
      /* a miss restarts the drill at the toss (IL_0F63) */
      DB.data.Tutorial_RetryCount = (DB.data.Tutorial_RetryCount | 0) + 1;
      DB.save();
      await wait(800); if (!alive()) return false;
    }
    await wait(800); if (!alive()) return false;
    return true;
  }

  /* one ball of the mission: the enemy's return, the hit window, the player's
     shot back.  Unlike the taught rallies this one can be missed. */
  async missionBall(side, isServe, alive) {
    const c = this.rival.core;
    const notif = this.rival.scene.n('Canvas/Core/Table Image/HitOnTableNotification Image');
    c.ManAHitPos = side ? 'A1' : 'A2';
    if (isServe) {
      c.ManBTossBallAnim();
      await wait(200); if (!alive()) return false;
      c.ShowTossBall();
      c.BallTrailSequenceTmp = c.cfg.TossBallTrialSequence;
      for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
        if (!alive()) return false;
        c.trailSet(i); await wait(40);
      }
      c.ManBSwing();
      c.ChangeTrailImage('FirstBallTrail Image');
      c.ChangeSequence('FirstBallTrail Image');
    } else {
      const nm = `From-B1-${c.ManAHitPos} Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    }
    this.waitingHit = side; this.hitOk = false;
    let lost = false;
    const seq = c.BallTrailSequenceTmp;
    for (let i = 0; i < seq.length; i++) {
      if (!alive()) return false;
      c.trailSet(i);
      if (i === c.hitBackStartFrame) {
        c.IsAbleToHitBack = true;
        if (notif) { notif.setActive(true); notif.setEnabled(true);
                     notif.setLocalPos(side ? -103.6 : 103.6, -37.2); notif.setAlpha(1); }
        Audio_.play('Hit2');
        if (qs.get('auto')) this.hitOk = true;       // the harness plays perfectly
      }
      if (this.hitOk) break;
      if (i === c.hitBackEndFrame - 2) c.ChangeTrailImage('Lose-B1-A1 Image');
      if (i === c.hitBackEndFrame) {
        c.IsAbleToHitBack = false;
        if (notif) notif.setActive(false);
        /* missed: the ball runs out on the Lose sequence */
        c.ChangeSequence('Lose-B1-A1 Image');
        for (let j = 0; j < c.BallTrailSequenceTmp.length; j++) {
          if (!alive()) return false;
          c.trailSet(j); await wait(30);
        }
        lost = true;
        break;
      }
      await wait(29);
    }
    this.waitingHit = undefined;
    c.IsAbleToHitBack = false;
    if (notif) notif.setActive(false);
    if (lost || !this.hitOk) { c.ChangeTrailImage(''); return false; }

    Audio_.play('Hit1');
    c.ManACurPos = side ? 'A1' : 'A2';
    this.rival.placeManA(c.ManACurPos);
    c.ManASwing();
    const nm = `To-${c.ManACurPos}-B1 Image`;
    if (this.rival.trails[nm]) {
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      for (let i = 0; i < c.BallTrailSequenceTmp.length; i++) {
        if (!alive()) return false;
        c.trailSet(i);
        if (i === c.touchManBTableFrame + 3) c.ManBSwing();
        await wait(29);
      }
    }
    return true;
  }

  /* the tail both TutorialStart and SkipAnim run into */
  async lineUpAndReady(alive) {
    const W_ = async s => { await wait(s * 1000); return alive(); };
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
    await this.TutorialEndAnim(alive);
    if (!alive()) return;
    /* Bridge.BridgeShowWhenEnterGame -> Reset_EnterGame -> BridgeHide */
    this.mgr.onTutorialDone();
  }

  /* <TutorialEndAnim>c__Iterator3 0x3FB08 -- I'M READY clears the stage: the
     four bubbles pop away 0.15 s apart on easeInBack, the rival lines slide
     off to x = 2000, and the table and the player follow them off to -2000. */
  async TutorialEndAnim(alive) {
    const W_ = async t => { await wait(t * 1000); return alive(); };
    for (const n of [this.imReady, this.imReadyShadow]) if (n) LT.alpha(n, 0, 0.25);
    for (const d of [this.hi, this.ppk, this.goal, this.ready]) {
      if (d) LT.scale(d, 0, 0.25).setEase(26);
      if (!await W_(0.15)) return;
    }
    for (const l of this.lines) if (l) LT.moveLocalX(l, 2000, 0.3).setEase(26);
    if (!await W_(0.15)) return;
    const c = this.rival && this.rival.core;
    if (c && c.table) LT.moveLocalX(c.table, -2000, 0.3).setEase(26);
    if (!await W_(0.15)) return;
    if (c && c.manA) LT.moveLocalX(c.manA, -2000, 0.3).setEase(26);
    if (!await W_(0.7)) return;
  }
}

/* ======================================================== RivalModeEnding
 * EndingAnim (iterator 0) -- "Now / You Are / Ping Pong King", the crown, the
 * rotating shine and the dancing champion. */
class EndingView {
  /* mode 1 = the career ending ("Now You Are Ping Pong King"), mode 2 = the
     tournament's, which is a different group in the same prefab */
  constructor(host, mgr, mode) {
    this.mgr = mgr;
    this.mode = mode || 1;
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
    this.uploadShadow = N(this.cfg.UploadBtnShadowImage);
    this.uploadBtn = N(this.cfg.UploadBtnImage);
    /* the tournament half */
    this.tWordGroup = N(this.cfg.Tournament_WordGroup);
    this.tWord11 = N(this.cfg.Tournament_EndingWord1_1Text);
    this.tWord12 = N(this.cfg.Tournament_EndingWord1_2Text);
    this.tWord13 = N(this.cfg.Tournament_EndingWord1_3Text);
    this.tWord2 = N(this.cfg.Tournament_EndingWord2Text);
    this.tWord3 = N(this.cfg.Tournament_EndingWord3Text);
    this.tHeart = N(this.cfg.Tournament_HeartImage);
    this.tPPK = N(this.cfg.Tournament_PingPongKingImage);
    this.tLike = N(this.cfg.Tournament_LikeUsBtnImage);
    this.credits = N(this.cfg.CreditGroup);
    if (this.mode === 2) {
      s.hide('RivalModeEnd Group');
      for (const n of [this.tWord11, this.tHeart]) if (n) n.setLocalScale(0, 0);
      for (const n of [this.tWord12, this.tWord13, this.tWord2, this.tWord3,
                       this.tPPK, this.tLike]) if (n) n.setAlpha(0);
    } else {
      s.hide('TournamentModeEnd Group');
    }
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

  /* <EndingAnim_TournamentMode>c__Iterator3 0x2CFD8 -- the studio's reply, the
     heart, twenty seconds of credits, and "Ping Pong King" with a Like button.
     The BGM is TrueEndingBGM, not the career ending's. */
  async runTournament() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    const W_ = async t => { await wait(t * 1000); return alive(); };
    LT.value(0.15, 0, 0.2, v => Audio_.setBgmVolume(v));
    if (!await W_(0.2)) return;
    if (this.bg) LT.alpha(this.bg, 1, 0.5);
    if (!await W_(2)) return;
    Audio_.setBgmVolume(0);
    Audio_.playBgm('TrueEndingBGM', true);
    LT.value(0, 1, 2, v => Audio_.setBgmVolume(v));
    if (this.tWord11) LT.scale(this.tWord11, 1, 0.5).setEase(30);
    if (!await W_(1.3)) return;
    for (const n of [this.tWord12, this.tWord13]) if (n) LT.alpha(n, 1, 0.5);
    if (!await W_(3.8)) return;
    for (const n of [this.tWord11, this.tWord12, this.tWord13]) if (n) LT.alpha(n, 0, 0.3);
    if (!await W_(0.8)) return;
    if (this.tWord2) LT.alpha(this.tWord2, 1, 0.35);
    if (!await W_(3.8)) return;
    if (this.tWord2) LT.alpha(this.tWord2, 0, 0.3);
    if (!await W_(0.8)) return;
    if (this.tWord3) LT.alpha(this.tWord3, 1, 0.35);
    if (!await W_(0.8)) return;
    if (this.tHeart) LT.scale(this.tHeart, 1, 0.6).setEase(30);
    if (!await W_(3.5)) return;
    if (this.credits) LT.moveLocalY(this.credits, 3611, 20);
    if (this.tHeart) LT.alpha(this.tHeart, 0, 0.3);
    if (this.tWord3) LT.alpha(this.tWord3, 0, 0.3);
    if (!await W_(21)) return;
    if (this.tPPK) {
      LT.alpha(this.tPPK, 1, 0.5);
      LT.moveLocalY(this.tPPK, -478.37, 0.5).setEase(15);
      LT.scale(this.tPPK, 1.013, 1).setLoopPingPong(-1);
    }
    if (this.tLike) {
      LT.alpha(this.tLike, 1, 0.5);
      LT.scale(this.tLike, 1.08, 0.8).setEase(15).setLoopPingPong(-1);
    }
    if (!await W_(0.5)) return;
    /* the two buttons swap sizes for this ending: a small home, a big share */
    if (this.homeShadow) { this.homeShadow.setLocalScale(0.6, 0.6); this.homeShadow.setLocalPos(-174.4, -755.7); }
    if (this.homeBtn && this.cfg.SmallHomeBtnSprite) this.homeBtn.setSprite(this.cfg.SmallHomeBtnSprite);
    if (this.uploadShadow) { this.uploadShadow.setLocalScale(1, 1); this.uploadShadow.setLocalPos(151.376, -682.5); }
    if (this.uploadBtn && this.cfg.BigUploadSprite) this.uploadBtn.setSprite(this.cfg.BigUploadSprite);
    for (const n of [this.homeBtn, this.homeShadow, this.uploadBtn, this.uploadShadow])
      if (n) LT.alpha(n, 1, 0.5);
    if (this.uploadShadow) LT.scale(this.uploadShadow, 1.05, 1).setLoopPingPong(-1);
    if (!await W_(0.35)) return;
    this.homeActive = true;
    if (!await W_(0.65)) return;
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
    c.ShowTossBall();
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
        /* the red quarter of the table lights up on the side the ball is
           going to -- HitOnTableNotificationImage at (-103.6,-37.2) for the
           left, mirrored for the right (TutorialStart, PC 7) */
        if (notif) {                                 // HitOnTableNotificationImage.enabled = 1
          notif.setActive(true);
          notif.setEnabled(true);
          notif.setLocalPos(side ? -103.6 : 103.6, -37.2);
          notif.setAlpha(1);
        }
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
 * "Today's GIF": a panel that slides in after a match, playing one of the
 * animated clips at 0.075 s a frame.  The eight title/blurb pairs and their
 * order are RivalModeScene's, at the switch on RivalMode_CurShareGIFIndex
 * (0x0CA8); SetShareGIF 0x3FF44 turns the index into a prefab.
 *
 * [sic] SetShareGIF only knows indices 0..4 -- four prefabs and the static
 * "Like us?" picture.  Variants 5, 6 and 7 (CatchTheBall, KungFu, Ballet) fall
 * through its switch, and their sprite arrays ship EMPTY in the scene, so all
 * three show a title and a blurb over a blank panel.  Reproduced. */
const GIF_VARIANTS = [
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'This is the Ping Pong King Dance.\nLike it on our Facebook?',
    prefab: 'prefab:ShareGIF001 Group', like: true,
    link: 'https://www.facebook.com/OrangenoseStudio/videos/1747084185327946/' },
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'Share this funny GIF on Facebook.\nYour friends will laugh, I promise.',
    prefab: 'prefab:ShareGIF002 Group', like: false,
    link: 'https://www.facebook.com/OrangenoseStudio/videos/1747081461994885/' },
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'We worked for six sleepless months on the game.\nLike us on Facebook?',
    prefab: 'prefab:ShareGIF003 Group', like: true,
    link: 'https://www.facebook.com/OrangenoseStudio/videos/1747084811994550/' },
  { title: 'Special Move',
    blurb: 'Spread the joy!\nShare this special move to your friends on Facebook!',
    prefab: 'prefab:ShareGIF004 Group', like: false,
    link: 'https://www.facebook.com/OrangenoseStudio/videos/1747082861994745/' },
  { title: '<color="#7FE0EAFF">Like</color> us?',
    blurb: "This is a great game, but we don't have enough players.\nLike us to spread the game to the world?",
    prefab: null, like: true, thumb: true,
    link: 'https://www.facebook.com/OrangenoseStudio/' },
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'I can beat you with my legs anytime.\nCute? Share, please.',
    prefab: null, like: false,
    link: 'https://www.facebook.com/OrangenoseStudio/' },
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'Ping Pong vs Kong Fu.\nShare if you like it.',
    prefab: null, like: false,
    link: 'https://www.facebook.com/OrangenoseStudio/' },
  { title: "Today's <color=\"#FFCB39FF\">GIF</color>",
    blurb: 'Ballet and Ping Pong.\nLove the idea? Share plz.',
    prefab: null, like: false,
    link: 'https://www.facebook.com/OrangenoseStudio/' },
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
    } else if (this.v.thumb && this.shareImg) {
      /* only GIFIndex 4 reaches SetShareGIF's `ShareImage.SetActive(1)` arm;
         5..7 fall off the end of the switch with nothing to show */
      this.shareImg.setActive(true);
      this.gifImg = this.shareImg;
    }
    if (this.shareImg && !this.v.thumb) this.shareImg.setActive(false);
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
    if (this.v.thumb && this.thumb) {
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

/* ==================================================== TournamentInfo 0x451AC
 * The panel that introduces the Orangenose Tournament the first time you beat
 * the career.  It builds itself piece by piece -- line, cup, gift, orange head,
 * crown and badge each pop to 1.15 and settle -- then the eight blinks start
 * pulsing and the button appears.  The button is pressed twice: "Cool" swaps
 * the first block of copy for the second and turns into "OK", and "OK" sweeps
 * the whole panel off to x = -2000. */
class TournamentInfoView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('prefab:Tournament Group', host);
    const s = this.scene;
    const P = 'TournamentInfo Group/';
    this.root = s.n('');
    this.bg = s.n('TournamentInfoBg Image');
    this.group = s.n(P.slice(0, -1));
    this.line = s.n(P + 'TournamentLine Image');
    this.badge = s.n(P + 'TournamentLine Image/TournamentBadge Image');
    this.cup = s.n(P + 'TournamentCup Image');
    this.gift = s.n(P + 'TournamentGift Image');
    this.head = s.n(P + 'TournamentOrangeHead Image');
    this.crown = s.n(P + 'TournamentOrangeHead Image/TournamentCrown Image');
    this.info11 = s.n(P + 'TournamentInfo1-1 Text');
    this.info12 = s.n(P + 'TournamentInfo1-2 Text');
    this.info22 = s.n(P + 'TournamentInfo2-2 Text');
    this.btn = s.n(P + 'TournamentInfoBtn Image');
    this.blinks = [];
    for (let i = 1; i <= 8; i++) { const n = s.n(P + 'Blink' + i + ' Image'); if (n) this.blinks.push(n); }
    this.cfg = s.comp('', 'TournamentInfo') || {};
    this.isCool = false; this.isOK = false;
    if (this.root) this.root.setActive(true);
    if (this.group) { this.group.setActive(false); this.group.setLocalScale(0, 0); }
    if (this.bg) this.bg.setActive(false);
    for (const n of this.blinks) if (n) n.setAlpha(0);
    for (const n of [this.info11, this.info12, this.info22]) if (n) n.setAlpha(0);
    if (this.btn) this.btn.setLocalScale(0, 0);
    /* every piece starts small and below its home; the coroutine pops each one */
    this.homes = new Map();
    for (const n of [this.cup, this.gift, this.head]) if (n) this.homes.set(n, n.localPos.slice());
  }
  destroy() { this.gen = (this.gen | 0) + 1; this.scene.destroy(); }

  hitTest(x, y) {
    if (!this.btn || !this.btn.active) return false;
    const r = this.btn.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  /* OnTounamentInfoBtnClick 0x451DF -- one flag per press, in order */
  onBtn() { if (!this.isCool) this.isCool = true; else if (!this.isOK) this.isOK = true; }

  /* <TournamentInfoShow>c__Iterator0 0x45214 */
  async run() {
    const g = this.gen = (this.gen | 0) + 1;
    const alive = () => g === this.gen;
    const pop = (n, then) => {
      if (!n) return;
      LT.scale(n, 1.15, 0.15).setOnComplete(() => { if (alive()) LT.scale(n, 1, 0.15); });
      if (then) then();
    };
    if (this.group) { this.group.setActive(true); LT.scale(this.group, 1, 0.3).setEase(27); }
    if (this.bg) this.bg.setActive(true);
    await wait(350); if (!alive()) return;
    pop(this.line);
    await wait(50); if (!alive()) return;
    pop(this.cup, () => LT.moveLocalY(this.cup, 762.2, 0.5).setEase(15));
    await wait(50); if (!alive()) return;
    pop(this.gift, () => LT.moveLocalY(this.gift, 753, 0.5).setEase(15));
    await wait(50); if (!alive()) return;
    pop(this.head, () => LT.moveLocalY(this.head, 824, 0.5).setEase(15));
    await wait(50); if (!alive()) return;
    pop(this.crown); pop(this.badge);
    await wait(50); if (!alive()) return;

    for (const n of [this.info11, this.info12]) if (n) { n.setEnabled(true); LT.alpha(n, 1, 0.5); }
    if (this.info11) LT.moveLocalY(this.info11, 111.56, 0.5).setEase(15);
    if (this.info12) LT.moveLocalY(this.info12, 111.57, 0.5).setEase(15);
    /* the eight sparkles each breathe on their own period */
    const per = [0.4, 0.6, 0.45, 0.42, 0.5, 0.51, 0.52, 0.46];
    this.blinks.forEach((n, i) => { if (n) LT.alpha(n, 1, per[i] || 0.5).setEase(15).setLoopPingPong(-1); });
    await wait(600); if (!alive()) return;

    if (this.btn) LT.scale(this.btn, 1, 0.5).setEase(27);
    while (alive() && !this.isCool) await wait(16);
    if (!alive()) return;
    if (this.btn && this.cfg.TournamentInfo_OKBtnSprite) this.btn.setSprite(this.cfg.TournamentInfo_OKBtnSprite);
    for (const n of [this.info11, this.info12]) if (n) { LT.moveLocalX(n, -149.7, 0.3); LT.alpha(n, 0, 0.3); }
    await wait(300); if (!alive()) return;
    if (this.info22) { LT.moveLocalX(this.info22, -7.13, 0.3); LT.alpha(this.info22, 1, 0.3); }
    while (alive() && !this.isOK) await wait(16);
    if (!alive()) return;
    if (this.group) LT.moveLocalX(this.group, -2000, 0.5).setEase(26);
    if (this.bg) LT.alpha(this.bg, 0, 0.5);
    await wait(500); if (!alive()) return;
    if (this.group) this.group.setActive(false);
    if (this.bg) this.bg.setActive(false);
    return true;                                   // HomeScene::OnTournamentInfoClose
  }
}

Object.assign(window, { TournamentInfoView });
