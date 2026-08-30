/* Splash, home and the settings overlay. */
'use strict';

/* ---------------------------------------------------------------- Animator
 * Plays a decoded Unity AnimationClip against a built Scene.  Tracks are one
 * float each (a transform binding is three or four of them), keys are the
 * streamed clip's own, and steps are held between keys the way Unity's
 * constant-tangent keys behave for m_IsActive.  Animation events fire at the
 * clip's own times. */
class Animator {
  constructor(scene, base) { this.scene = scene; this.base = base || ''; this.stop(); }
  stop() { this.clip = null; this.t0 = 0; this.onEvent = null; this.onDone = null; }

  play(clipName, opts = {}) {
    const c = G.data.anim[clipName];
    if (!c) return Promise.resolve();
    this.clip = c;
    this.t0 = performance.now();
    this.fired = new Set();
    this.onEvent = opts.onEvent || null;
    return new Promise(res => {
      this.onDone = res;
      this._pump = () => this._tick();
      Clock.add(this._pump);
      this._tick();
    });
  }

  _node(path) {
    return this.scene.n(this.base ? this.base + '/' + path : path);
  }

  _tick() {
    if (!this.clip) return;
    const t = (performance.now() - this.t0) / 1000;
    for (const tr of this.clip.tracks) this._apply(tr, t);
    for (const e of this.clip.events || []) {
      if (t >= e.t && !this.fired.has(e.fn + e.t)) {
        this.fired.add(e.fn + e.t);
        if (this.onEvent) this.onEvent(e.fn);
      }
    }
    if (t >= this.clip.stopTime) {
      const done = this.onDone;
      this.clip = null; this.onDone = null;
      if (this._pump) { Clock.remove(this._pump); this._pump = null; }
      if (done) done();
    }
  }

  _apply(tr, t) {
    const n = this._node(tr.path);
    if (!n) return;
    const ks = tr.keys;
    let v = ks[0].v, i = 0;
    for (; i < ks.length; i++) {
      if (ks[i].t > t) break;
      v = ks[i].v;
    }
    /* linear between keys for continuous properties; a hold for m_IsActive,
       whose keys Unity writes with constant tangents */
    const cont = tr.attr !== 'm_IsActive';
    if (cont && i > 0 && i < ks.length) {
      const a = ks[i - 1], b = ks[i];
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      v = a.v + (b.v - a.v) * k;
    }
    switch (tr.attr) {
      case 'm_IsActive': n.setActive(v >= 0.5); break;
      case 'm_AnchoredPosition.x': n.setLocalPos(v, n.localPos[1]); break;
      case 'm_AnchoredPosition.y': n.setLocalPos(n.localPos[0], v); break;
      case 'm_LocalPosition.x': n.setLocalPos(v, n.localPos[1]); break;
      case 'm_LocalPosition.y': n.setLocalPos(n.localPos[0], v); break;
      case 'm_Color.a': n.setAlpha(v); break;
      case 'scale': {
        const s = n.localScale;
        if (tr.comp === 0) n.setLocalScale(v, s[1]);
        else if (tr.comp === 1) n.setLocalScale(s[0], v);
        break;
      }
      case 'position': {
        const p = n.localPos;
        if (tr.comp === 0) n.setLocalPos(v, p[1]);
        else if (tr.comp === 1) n.setLocalPos(p[0], v);
        break;
      }
      default: break;
    }
  }
}

/* ------------------------------------------------------------ OGSplash
 * level0.  OGSplashAnimationEvents 0x6A1AC: Init waits one second, then sets
 * the animator's "animation" integer to 1; the controller runs click ->
 * explosion -> loading, and the loading clip's own events drive the scene
 * change (LoadScene at 0 s, ActivateScene at 1.5 s, SetDisable at 2 s). */
class SplashScene {
  constructor(host) {
    this.scene = new Scene('OGSplash', host);
    this.anim = new Animator(this.scene, 'View');
  }
  destroy() { this.scene.destroy(); }

  async run() {
    const ev = fn => {
      /* OGSplashAnimationEvents 0x6A1F8 .. 0x6A25E */
      if (fn === 'PlayClickSFX') Audio_.play('mouse_click');
      else if (fn === 'PlayExplosionSFX') Audio_.play('blast');
      else if (fn === 'StopClickSFX' || fn === 'StopExplosionSFX') { /* one-shots */ }
    };
    await wait(1000);                                   // waitForOneSecond
    await this.anim.play('OGSplash_click', { onEvent: ev });
    await this.anim.play('OGSplash_explosion', { onEvent: ev });
    await this.anim.play('OGSplash_loading', { onEvent: ev });
  }
}

/* ------------------------------------------------------------- HomeScene
 * HomeScene (token 0x0200004E).  A virgin save has no tournament and no endless
 * mode, so OnViewEnable's three conditional button layouts collapse to the
 * plain one: the three title pieces, the bouncing ball and Let's Fight. */
class HomeSceneView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('HomeScene', host);
    const s = this.scene;
    const P = 'Canvas/Home Group/';
    this.title1 = s.n(P + 'Title1 Image');
    this.title2 = s.n(P + 'Title2 Image');
    this.title3 = s.n(P + 'Title3 Image');
    this.ball = s.n(P + 'Title2 Image/Ball Image');
    this.ballShadow = s.n(P + 'Title2 Image/BallShadow Image');
    this.playShadow = s.n(P + 'PlayBtnShadow Image');
    this.playBtn = s.n(P + 'PlayBtnShadow Image/Play Btn');
    this.endlessShadow = s.n(P + 'EndlessModeBtnShadow Image');
    this.endlessBtn = s.n(P + 'EndlessModeBtnShadow Image/EndlessModeBtn Image');
    this.tourShadow = s.n(P + 'OrangenoseTournamentShadow Image');
    this.tourBtn = s.n(P + 'OrangenoseTournamentShadow Image/OrangenoseTournamentBtn Image');
    this.newRivals = s.n(P + 'NewRivalsAlert Group');
    this.newRivalsBg = s.n(P + 'NewRivalsAlert Group/AlertBg Image');
    this.newRivalsOk = s.n(P + 'NewRivalsAlert Group/AlertBg Image/OKBtn Image');
    this.endlessIntro = s.n(P + 'EndlessIntroAlert Group');
    this.endlessIntroBg = s.n(P + 'EndlessIntroAlert Group/AlertBg Image');
    this.endlessIntroOk = s.n(P + 'EndlessIntroAlert Group/AlertBg Image/OKBtn Image');
    this.gameAlert = s.n(P + 'GameAlert Group');
    this.gameAlertBtn = s.n(P + 'GameAlert Group/AlertPanel Image/AlertBtn Image');
    s.hide(P + 'NewRivalsAlert Group', P + 'GameAlert Group',
           P + 'EndlessIntroAlert Group',
           P + 'PlayBtnShadow Image/Play Btn/New Image');
    /* OnViewEnable 0x41A88 lays the bottom row out three ways, and each button
       it turns on gets raycastTarget and a 1.02x breathing pulse. */
    const db = DB.data;
    this.showEndless = !!db.isEndlessModeShow;
    this.showTour = !!db.IsRivalModeComplete;
    if (this.showTour && !this.showEndless) {
      if (this.endlessShadow) this.endlessShadow.setActive(false);
      if (this.playShadow) this.playShadow.setLocalPos(-140, -753);
    } else if (this.showTour && this.showEndless) {
      if (this.tourShadow) this.tourShadow.setLocalPos(353.4, -724.6);
      if (this.endlessShadow) this.endlessShadow.setLocalPos(-358, -726.8);
      if (this.playShadow) this.playShadow.setLocalPos(0, -753);
    } else if (!this.showTour && this.showEndless) {
      if (this.tourShadow) this.tourShadow.setActive(false);
      if (this.endlessShadow) this.endlessShadow.setLocalPos(-205, -726.8);
      if (this.playShadow) this.playShadow.setLocalPos(134, -753);
    } else {
      if (this.tourShadow) this.tourShadow.setActive(false);
      if (this.endlessShadow) this.endlessShadow.setActive(false);
    }
    for (const n of [this.showTour ? this.tourShadow : null,
                     this.showEndless ? this.endlessShadow : null]) {
      if (!n) continue;
      n.setLocalScale(1, 1);
      LT.scale(n, 1.02, 0.6).setEase(15).setLoopPingPong(-1);
    }
    if (this.playBtn) this.playBtn.el.style.cursor = 'pointer';
  }

  /* HomeScene::OnNewRivalsAlertBtnDown 0x42F22 and the two intro alerts.  Each
     alert scales its panel in from 0 over 0.2 s on easeOutBack. */
  showAlert(group, panel) {
    if (!group) return;
    group.setActive(true);
    if (panel) { panel.setLocalScale(0, 0); LT.scale(panel, 1, 0.2).setEase(27); }
    this.alert = group;
  }
  hideAlert() { if (this.alert) this.alert.setActive(false); this.alert = null; }
  destroy() { this.scene.destroy(); }

  inside(n, x, y) {
    if (!n || !n.active) return false;
    const r = n.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  hitTest(x, y) { return this.inside(this.playShadow, x, y); }

  /* -> 'play' | 'endless' | 'tournament' | 'alert' | null */
  hit(x, y) {
    if (this.alert) {
      const ok = this.alert === this.endlessIntro ? this.endlessIntroOk
               : this.alert === this.newRivals ? this.newRivalsOk : this.gameAlertBtn;
      if (this.inside(ok, x, y)) {
        const wasIntro = this.alert === this.endlessIntro;
        this.hideAlert();
        return wasIntro ? 'endless-ok' : 'alert';
      }
      return 'alert';                       // the panel eats everything else
    }
    if (this.inside(this.playShadow, x, y)) return 'play';
    if (this.showEndless && this.inside(this.endlessShadow, x, y)) return 'endless';
    if (this.showTour && this.inside(this.tourShadow, x, y)) return 'tournament';
    return null;
  }

  /* HomeScene::OnViewEnable 0x41A88 */
  enter() {
    Audio_.setBgmVolume(0);
    Audio_.playBgm('HomeBGM', true);
    LT.value(0, 1, 3, v => Audio_.setBgmVolume(v));      // <OnViewEnable>m__3
    this.HomeTitleShowAnim();
    this.HomeBallAnimation();
    /* FirstTimeOpenAfterUpdate raises the "New rivals added" alert once */
    if (DB.data.FirstTimeOpenAfterUpdate) {
      DB.data.FirstTimeOpenAfterUpdate = false; DB.save();
      this.showAlert(this.newRivals, this.newRivalsBg);
    }
  }

  /* HomeScene::OnEndlessModeBtnDown 0x42944 -- the first press shows the
     PPK IMPOSSIBLE TEST intro (EnableImpossibleTestIntro defaults to 1). */
  onEndlessBtn() {
    if (DB.data.isEndlessModeEnter) return true;
    this.showAlert(this.endlessIntro, this.endlessIntroBg);
    return false;
  }

  /* HomeScene/<HomeTitleShowAnim>c__Iterator1: the three title pieces pop in
     at 0 s, 0.2 s and 0.4 s, each scaling to 1.3 over 0.5 s on easeOutSine. */
  HomeTitleShowAnim() {
    const pop = n => { if (!n) return; n.setLocalScale(0, 0); LT.scale(n, 1.3, 0.5).setEase(15); };
    pop(this.title1);
    if (this.ball) this.ball.setActive(true);
    LT.delayedCall(0.2, () => pop(this.title2));
    LT.delayedCall(0.4, () => pop(this.title3));
  }

  /* the ball sits on the title and bounces until the button is pressed */
  HomeBallAnimation() {
    if (!this.ball) return;
    const base = this.ball.localPos.slice();
    this.ballBase = base;
    this.ballTween = LT.value(0, 1, 0.62, k => {
      const y = base[1] + Math.abs(Math.sin(k * Math.PI)) * 150;
      this.ball.setLocalPos(base[0], y);
      if (this.ballShadow) this.ballShadow.setAlpha(0.35 + 0.35 * (1 - Math.abs(Math.sin(k * Math.PI))));
    }).setLoopClamp();
  }

  /* HomeScene::OnLetsFightBtnUp 0x4256C */
  onLetsFight() {
    if (this.leaving) return;
    this.leaving = true;
    if (this.ballTween) this.ballTween.cancel();
    Audio_.play('mouse_click');
    /* BGM 1 -> 0.15 over 4.5 s, then stop  (<OnLetsFightBtnUp>m__7/m__8) */
    LT.value(1, 0.15, 4.5, v => Audio_.setBgmVolume(v)).setOnComplete(() => Audio_.stopBgm());
    this.HomeTitleHideAnim();
    /* Home_BallRig2d.AddForce((600,600)) with gravityScale 3.3 */
    if (this.ball) {
      const p0 = this.ball.localPos, t0 = performance.now();
      LT.value(0, 1, 1.2, () => {
        const t = (performance.now() - t0) / 1000;
        this.ball.setLocalPos(p0[0] + 600 * t, p0[1] + 600 * t - 0.5 * 9.81 * 3.3 * 100 * t * t);
      });
    }
    if (this.ballShadow) LT.value(this.ballShadow.alpha, 0, 0.1, v => this.ballShadow.setAlpha(v));
    LT.delayedCall(1, () => this.mgr.goRival());          // <OnLetsFightBtnUp>m__9
  }

  /* HomeScene/<HomeTitleHideAnim>c__Iterator3 */
  HomeTitleHideAnim() {
    for (const t of [this.title1, this.title2, this.title3, this.playShadow]) {
      if (t) LT.scale(t, 0, 0.3).setEase(26);
    }
  }
}

/* ------------------------------------------------- Table_Settings overlay
 * The hamburger in the corner of the home screen and the pause button in a
 * rally are the same component, living on the shared Top Canvas.
 * Table_Settings::OnSettingBtnDown 0x40600. */
class SettingsView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('Top Canvas', host);
    const s = this.scene;
    s.hide('EndlessModeList Group', 'BannerControll Group');
    this.cfg = s.comp('Setting Group', 'Table_Settings') || {};
    const N = ref => (ref && ref.node) ? s.n(ref.node) : null;
    this.btn = N(this.cfg.SettingBtnImage);
    this.btnBg = N(this.cfg.SettingBtnBgImage);
    this.btnShadow = N(this.cfg.SettingBtnShadowImage);
    this.list = N(this.cfg.SettingListGroup);
    this.restore = N(this.cfg.RestoreBtnShadowImage);
    this.coach = N(this.cfg.CoachImage);
    this.bg = N(this.cfg.BgImage);
    this.volume = N(this.cfg.VolumeBtnImage);
    this.howTo = N(this.cfg.HowToPlayPanel);
    this.credits = N(this.cfg.CreditPanel);
    this.IsSettingShow = false;
    this.IsEnableSfx = true;
    if (this.list) { this.listHome = this.list.localPos.slice(); this.list.setActive(false); }
    if (this.restore) { this.restoreHome = this.restore.localPos.slice(); this.restore.setActive(false); }
    if (this.coach) { this.coachHome = this.coach.localPos.slice(); this.coach.setActive(false); }
    if (this.bg) this.bg.setActive(false);
    if (this.howTo) this.howTo.setActive(false);
    if (this.credits) this.credits.setActive(false);
    for (const n of [this.btn, this.btnBg, this.btnShadow]) if (n) n.setAlpha(0);
  }
  destroy() { this.scene.destroy(); }

  /* Table_Settings::SettingBtnShow 0x40C88 */
  SettingBtnShow(time) {
    if (this.btn) LT.alpha(this.btn, 1, time);
    if (this.btnBg) LT.alpha(this.btnBg, 1, time);
    if (this.btnShadow) LT.alpha(this.btnShadow, 0.25, time);
    this.touchEnabled = true;
  }
  /* Table_Settings::SettingBtnHide 0x40D3C */
  SettingBtnHide(time) {
    if (this.btn) LT.alpha(this.btn, 0, time);
    if (this.btnBg) LT.alpha(this.btnBg, 0, time);
    if (this.btnShadow) LT.alpha(this.btnShadow, 0, time);
    this.touchEnabled = false;
  }
  ChangeSettingSpriteToMenuSprite() {      // 0x411A8
    if (this.btn) { this.btn.setSize(58, 64); this.btn.setSprite(this.cfg.MenuSprite); }
  }
  ChangeSettingSpriteToPauseSprite() {     // 0x4113B
    if (this.btn) { this.btn.setSize(58 * 0.75, 64 * 0.75); this.btn.setSprite(this.cfg.PauseSprite); }
  }

  hitTest(x, y) {
    if (!this.touchEnabled || !this.btn) return false;
    const r = this.btn.el.getBoundingClientRect();
    const pad = 40;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  }

  /* Table_Settings::OnSettingBtnDown 0x40600 */
  onSettingBtnDown(sceneState) {
    this.IsSettingShow = !this.IsSettingShow;
    Audio_.play('mouse_click');
    if (sceneState === 1) {                                   // HomeScene
      if (this.btn) this.btn.setSize(58, 64);
      const bx = this.btn ? this.btn.localPos[0] : 0;
      if (this.IsSettingShow) {
        if (this.btn) this.btn.setSprite(this.cfg.CrossSprite);
        if (this.list) { this.list.setActive(true); LT.moveLocalX(this.list, bx + 40, 0.5).setEase(30); }
        if (this.restore) this.restore.setActive(true);
      } else {
        if (this.btn) this.btn.setSprite(this.cfg.ListSprite);
        if (this.list) LT.moveLocalX(this.list, bx - 300, 0.3).setEase(26)
          .setOnComplete(() => this.list.setActive(false));
        if (this.restore) LT.moveLocalX(this.restore, this.restoreHome[0] + 600, 0.3).setEase(26)
          .setOnComplete(() => this.restore.setActive(false));
      }
    } else {                                                  // a rally: pause
      if (this.btn) this.btn.setSize(58 * 0.75, 64 * 0.75);
      if (this.mgr.onPause) this.mgr.onPause(this.IsSettingShow);
      if (this.IsSettingShow) {
        /* 0x01B4: the scene is paused and the list comes up; the referee is
           activated and then immediately swept off by SettingBtnHide, so he
           never actually appears -- the pause screen is the bridge. */
        if (this.list) { this.list.setActive(true); LT.moveLocalX(this.list, (this.btn ? this.btn.localPos[0] : 0) + 40, 0.5).setEase(30); }
        if (this.coach) this.coach.setActive(false);
        this.SettingBtnHide(0.05);
        LT.delayedCall(0.5, () => this.SettingBtnShow(0.05));
      } else {
        if (this.btn) this.btn.setSprite(this.cfg.PauseSprite);
        if (this.list) LT.moveLocalX(this.list, this.listHome[0] - 300, 0.3).setEase(26)
          .setOnComplete(() => this.list.setActive(false));
        this.SettingBtnShow(0.05);
      }
    }
  }

  /* Table_Settings::OnVolumeBtnDown 0x40E94 */
  onVolumeBtnDown() {
    this.IsEnableSfx = !this.IsEnableSfx;
    Audio_.sfxOn = Audio_.bgmOn = this.IsEnableSfx;
    Audio_.setBgmVolume(Audio_.bgmVol);
    if (this.volume) this.volume.setSprite(this.IsEnableSfx ? this.cfg.UnMuteSprite : this.cfg.MuteSprite);
  }
}

Object.assign(window, { Animator, SplashScene, HomeSceneView, SettingsView });
