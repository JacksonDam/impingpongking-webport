/* Boot and the scene manager.
 *
 * Scenes (token 0x02000053) owns the switch between screens; GameMgr::Init
 * 0x27EC does the first-run setup and shows HomeScene.  This is the port's
 * equivalent, plus the career save that GameDb would hold.
 */
'use strict';

const SceneEnum = {                                     // GameMgr/SceneEnum
  RivalModeScene: 0, HomeScene: 1, HomeScene_AlertShow: 2, HomeScene_Credit: 3,
  HomeScene_HowToPlay: 4, Tutorial_SkipAlert1: 5, Tutorial_SkipAlert2: 6,
  RivalModeScene_GIFShareShow: 7, RivalModeScene_ReviveShow: 8,
  RivalModeScene_RuleShow: 9, RivalModeScene_Retry: 10,
};

/* GameDb, kept where the original keeps it: on the device. */
const DB = {
  key: 'pingpongking.gamedb',
  data: { OutterStageOrder: 0, isTutorialPass: false, IsRivalModeComplete: false,
          IsEnableSfx: true, numOfAttempt: 0 },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(this.key) || '{}')); }
    catch (e) { }
    return this.data;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { } },
};

class GameMgr {
  constructor(stage) {
    this.stage = stage;
    this.curSceneState = SceneEnum.HomeScene;
    this.db = DB.load();
    if (qs.has('stage')) this.db.OutterStageOrder = parseInt(qs.get('stage'), 10) || 0;
    this.settings = null;
    this.view = null;
  }

  trace(m) { if (qs.has('trace')) document.title = (document.title + ' | ' + m).slice(-300); }
  clearView() {
    if (this.tutorial) { this.tutorial.destroy(); this.tutorial = null; }
    if (this.view) { this.view.destroy(); this.view = null; }
    LT.cancelAll();
  }

  async boot() {
    const go = qs.get('goto');
    if (qs.has('fresh')) { this.db.OutterStageOrder = 0; this.db.isTutorialPass = false; DB.save(); }
    if (go === 'home') return this.goHome();
    if (go === 'rival') { this.db.isTutorialPass = true; return this.goRival(); }
    if (go === 'tutorial') { this.db.isTutorialPass = false; return this.goRival(); }
    if (go === 'ending') return this.goEnding();
    if (go === 'gif') return this.goGif(parseInt(qs.get('gif') || '0', 10));
    if (go === 'endless') return this.goEndlessList();
    if (go === 'eyesight') return this.goMode('EyesightModeScene');
    if (go === 'concentrate') return this.goMode('ConcentrateModeScene');
    if (go === 'invert') return this.goMode('InvertModeScene');
    await this.splash();
    this.goHome();
  }

  /* level0 -- the Orangenose logo */
  async splash() {
    const sp = new SplashScene(this.stage);
    this.view = sp;
    await sp.run();
    this.clearView();
  }

  goHome() {
    this.clearView();
    this.curSceneState = SceneEnum.HomeScene;
    if (!this.settings) this.settings = new SettingsView(this.stage, this);
    this.settings.scene.root.style.zIndex = 5;
    this.settings.ChangeSettingSpriteToMenuSprite();
    this.settings.SettingBtnShow(0.1);
    const h = new HomeSceneView(this.stage, this);
    this.stage.insertBefore(h.scene.root, this.settings.scene.root);
    this.view = h;
    h.enter();
  }

  goRival() {
    this.clearView();
    this.curSceneState = SceneEnum.RivalModeScene;
    if (!this.settings) this.settings = new SettingsView(this.stage, this);
    this.settings.scene.root.style.zIndex = 5;
    this.settings.ChangeSettingSpriteToPauseSprite();
    const v = new RivalModeSceneView(this.stage, this);
    this.stage.insertBefore(v.scene.root, this.settings.scene.root);
    this.view = v;
    /* RivalModeScene::OnViewEnable instantiates the tutorial prefab the first
       time through; Reset_EnterGame runs when I'm Ready is pressed. */
    if (!this.db.isTutorialPass && this.db.OutterStageOrder === 0) {
      v.prepareForTutorial();
      this.tutorial = new TutorialView(this.stage, this, v);
      this.stage.insertBefore(this.tutorial.scene.root, this.settings.scene.root);
      this.tutorial.run();
    } else if (qs.has('nobridge')) {
      v.Reset_EnterGame(this.db.OutterStageOrder);
    } else {
      v.EnterWithBridge(this.db.OutterStageOrder);
    }
  }

  onTutorialDone() {
    this.db.isTutorialPass = true; DB.save();
    if (this.tutorial) { this.tutorial.destroy(); this.tutorial = null; }
    if (this.view && this.view.Reset_EnterGame) {
      this.view.TouchBlockEnable(false);
      this.view.Reset_EnterGame(this.db.OutterStageOrder);
    }
  }

  onPause(paused) { if (this.view && this.view.Pause) this.view.Pause(paused); }

  /* HomeScene::OnEndlessModeBtnDown 0x42B4C -> the IMPOSSIBLE TEST list */
  goEndlessList() {
    this.clearView();
    this.curSceneState = SceneEnum.EndlessListShow;
    if (this.settings) { this.settings.SettingBtnHide(0.1); }
    const v = new EndlessListView(this.stage, this);
    this.view = v;
  }

  /* the three Impossible Test modes share Core with RivalMode */
  goMode(sceneName) {
    this.clearView();
    this.curSceneState = sceneName === 'EyesightModeScene' ? SceneEnum.EyesightModeScene
      : sceneName === 'ConcentrateModeScene' ? SceneEnum.ConcentrateModeScene
      : SceneEnum.InvertModeScene;
    if (!this.settings) this.settings = new SettingsView(this.stage, this);
    this.settings.scene.root.style.zIndex = 5;
    this.settings.ChangeSettingSpriteToPauseSprite();
    this.settings.SettingBtnShow(0.1);
    const v = new (MODE_VIEW[sceneName])(this.stage, this, sceneName);
    this.stage.insertBefore(v.scene.root, this.settings.scene.root);
    this.view = v;
    v.enter();
  }

  async onMatchWon(stage) {
    /* the beaten rival says his line on the bridge before the ladder moves on */
    if (this.view && this.view.ShowBeatenThenNext) await this.view.ShowBeatenThenNext(stage);
    this.db.OutterStageOrder = Math.min(49, stage + 1);
    this.db.numOfAttempt = 0;
    DB.save();
    if (stage >= 49) { this.db.IsRivalModeComplete = true; DB.save(); this.goEnding(); return; }
    /* the share panel comes up between matches, as WinAnim does */
    this.db.gifIndex = ((this.db.gifIndex | 0) + 1) % 5;
    DB.save();
    if (stage % 3 === 2) this.goGif(this.db.gifIndex); else this.goRival();
  }
  onMatchLost(stage) {
    this.db.numOfAttempt = (this.db.numOfAttempt || 0) + 1;
    DB.save();
    this.goRival();
  }
  /* RivalModeScene/<WinAnim> activates the share panel after a won match */
  goGif(index) {
    this.clearView();
    if (this.settings) this.settings.SettingBtnHide(0.1);
    const v = new ShareGIFView(this.stage, this, index || 0);
    this.view = v;
    v.run();
  }

  goEnding() {
    this.clearView();
    if (this.settings) this.settings.SettingBtnHide(0.1);
    const e = new EndingView(this.stage, this);
    this.view = e;
    e.run();
  }

  input(x, y) {
    Audio_.unlock();
    if (this.view instanceof EndlessListView) {
      const h = this.view.hit(x, y);
      if (h === 'back') this.goHome();
      else if (h) this.goMode(h);
      return;
    }
    if (this.view instanceof ShareGIFView) {
      if (this.view.hitTest(x, y)) this.goRival();
      return;
    }
    if (this.view instanceof EndingView) {
      if (this.view.homeTap(x, y)) { this.db.OutterStageOrder = 0; DB.save(); this.goHome(); }
      return;
    }
    if (this.tutorial) {
      if (this.tutorial.imReadyTap(x, y)) return;
      const st = $('#stage').getBoundingClientRect();
      if (this.tutorial.onTap(x - st.left < st.width / 2)) return;
      return;
    }
    if (this.settings && this.settings.hitTest(x, y)) {
      this.settings.onSettingBtnDown(this.curSceneState); return;
    }
    if (this.settings && this.settings.IsSettingShow) {
      /* while paused the bridge is up: Resume closes it, Home leaves */
      const v = this.view;
      if (v && v.bridge) {
        const hit = v.bridge.hitResume(x, y);
        if (hit === 'resume') { this.settings.onSettingBtnDown(this.curSceneState); return; }
        if (hit === 'home') { this.settings.IsSettingShow = false; this.goHome(); return; }
      }
      return;
    }
    if (this.view instanceof HomeSceneView) {
      if (this.view.hitTest(x, y)) this.view.onLetsFight();
      return;
    }
    if (this.view && this.view.onPointer) this.view.onPointer(x, y);
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

  Audio_.load(['Hit1', 'Hit2', 'HardHit', 'Lose', 'Herray', 'blast', 'mouse_click']);
  fit();

  /* Browsers will not start audio before a gesture, and the splash's click and
     explosion are the first things the game plays -- so hold the boot behind a
     tap.  The original has no such gate; on a phone the app's own launch is the
     gesture. */
  if (!qs.has('nogate')) {
    const gate = document.createElement('div');
    gate.id = 'gate';
    gate.innerHTML = '<div><b>I\'m Ping Pong King</b><span>tap to start</span></div>';
    document.body.appendChild(gate);
    await new Promise(res => {
      const go = () => {
        Audio_.unlock();
        gate.remove();
        removeEventListener('pointerdown', go);
        removeEventListener('keydown', go);
        res();
      };
      addEventListener('pointerdown', go);
      addEventListener('keydown', go);
      /* the harness has no gesture to give */
      if (qs.has('selftest') || qs.has('auto') || qs.has('tap') || qs.has('goto')) setTimeout(go, 0);
    });
  }

  const stage = $('#stage');
  const mgr = new GameMgr(stage);
  window.mgr = mgr;
  b.classList.add('hide');

  const dn = e => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    mgr.input(x, y);
    e.preventDefault();
  };
  addEventListener('pointerdown', dn, { passive: false });
  addEventListener('keydown', e => {
    Audio_.unlock();
    if (e.repeat) return;
    const v = mgr.view;
    if (e.key === 'ArrowLeft' || e.key === 'a') { if (v && v.GoLeft) v.GoLeft(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { if (v && v.GoRight) v.GoRight(); }
    else if (e.key === 'p') { if (mgr.settings) mgr.settings.onSettingBtnDown(mgr.curSceneState); }
    else if (e.key === ' ') { if (v instanceof HomeSceneView) v.onLetsFight(); }
  });

  /* ?tap=t:x,y;... -- scripted taps in canvas coordinates, for the harness */
  if (qs.get('tap')) {
    for (const part of qs.get('tap').split(';')) {
      const m = /^([\d.]+):(-?[\d.]+),(-?[\d.]+)$/.exec(part.trim());
      if (!m) continue;
      const [, t, cx, cy] = m;
      setTimeout(() => {
        const r = $('#stage').getBoundingClientRect();
        const k = r.width / W;
        mgr.input(r.left + (+cx) * k, r.top + (+cy) * k);
      }, +t * 1000);
    }
  }

  await mgr.boot();


  /* ?crowd=1 -- bring the audience up on its own, for the harness */
  if (qs.get('crowd')) {
    setTimeout(() => { if (mgr.view && mgr.view.audiance) mgr.view.audiance.Show(); }, 3000);
  }
  if (qs.get('auto')) {
    setInterval(() => {
      const v = mgr.view;
      const isMode = v instanceof ModeSceneView;
      if (!(v instanceof RivalModeSceneView) && !isMode) return;
      const c = v.core;
      if (!c.IsAbleToHitBack || c.IsInSwingColddown) return;
      const left = c.ManAHitPos === 'A1';
      if (left) v.GoLeft(); else v.GoRight();
    }, 16);
  }
  if (qs.get('dbg')) {
    const d = document.createElement('div'); d.id = 'dbg'; document.body.appendChild(d);
    setInterval(() => {
      const v = mgr.view;
      if (!(v instanceof RivalModeSceneView)) { d.textContent = 'scene: ' + (v && v.constructor.name); return; }
      const c = v.core;
      d.textContent =
        `stage ${v.stageOrder}  #${(v.bridgeCfg.totalEnemyNum||50) - v.stageOrder} ` +
        `${(v.roster.RivalModeEnemyName||[])[(v.bridgeCfg.totalEnemyNum||50) - v.stageOrder] || ''}\n` +
        `score ${v.PlayerScore}-${v.EnemyScore} to ${v.matchGoal}  round ${v.RoundCount}/${v.model.Goal}\n` +
        `state ${['From','To','Lose','ManBLose'][c.SequenceState]}  idx ${c.curSpriteIndex}/${c.BallTrailSequenceTmp.length}\n` +
        `trail ${c.curTrail}\n` +
        `hit ${c.hitBackStartFrame}..${c.hitBackEndFrame} able=${c.IsAbleToHitBack}\n` +
        `ManA ${c.ManACurPos}->need ${c.ManAHitPos}  ManB ${c.ManBCurPos}->${c.ManBNextPos}\n` +
        `dt from ${c.FromBallTrailAnimDelay.toFixed(4)} to ${c.ToBallTrailAnimDelay.toFixed(4)}`;
    }, 60);
  }
  dispatchEvent(new Event('porttest'));
}
function fail(msg) {
  const b = $('#boot');
  b.classList.remove('hide');
  b.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99;background:#300;color:#fca;' +
                    'font:11px/1.4 monospace;white-space:pre-wrap;padding:8px;text-align:left';
  b.textContent = String(msg);
}
addEventListener('error', e => fail('ERROR ' + e.message + '\n' + (e.error && e.error.stack || '')));
addEventListener('unhandledrejection', e => fail('REJECT ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
boot().catch(e => fail('boot failed: ' + (e.stack || e.message)));
