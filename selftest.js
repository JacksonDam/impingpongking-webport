/* In-page assertions.  Run ./selftest.sh and grep for ALL PASS.
 * Every expected value here is a number or a string read out of the APK, not
 * out of the port -- the point is to catch the port drifting from the original.
 */
(function () {
  if (!new URLSearchParams(location.search).get('selftest')) return;
  const R = [];
  const ok = (name, cond, got) => R.push({ name, pass: !!cond, got });
  const eq = (name, a, b) => ok(name, a === b, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  const near = (name, a, b, e = 1e-3) => ok(name, Math.abs(a - b) <= e, `${a} vs ${b}`);

  window.addEventListener('porttest', async () => {
    const g = G.data;

    /* ---------------------------------------------- data the APK states */
    eq('reference resolution', JSON.stringify(g.reference), '[1280,2272]');
    eq('career stages', g.levels.length, 80);
    eq('difficulty groups', g.groups.length, 10);
    eq('stage 0 goal', g.levels[0].Goal, '2');
    eq('stage 0 middle interval', g.levels[0].MiddleFrameInterval, '0.033');
    eq('stage 12 goal', g.levels[12].Goal, '11');
    eq('Group_Easy first variations', JSON.stringify(g.groups[0].FirstVariationIndexs), '[1]');
    eq('Group_Extreme first variations',
       JSON.stringify(g.groups.find(x => x.GroupName === 'Group_Extreme').FirstVariationIndexs), '[2,3,4]');

    /* the rival roster, out of TestEnemyDetail::.ctor 0x194E8 */
    const roster = g.arrays.TestEnemyDetail;
    eq('roster length', roster.RivalModeEnemyName.length, 51);
    eq('rival #50 is the first opponent', roster.RivalModeEnemyName[50], 'BEST FRIEND');
    eq('rival #1 is the champion', roster.RivalModeEnemyName[1], 'PINGPONG KING');
    eq('rival #6 is TRUMP', roster.RivalModeEnemyName[6], 'TRUMP');
    eq('lines when beaten', roster.RivalModeEnemyWordsWhenLose.length, 11);
    eq('first losing line', roster.RivalModeEnemyWordsWhenLose[0], 'You Win.');
    eq('taunts when you lose', roster.RivalWinWord.length, 12);
    eq('tournament staff', JSON.stringify(roster.OGTournamentEnemyName.slice(1, 4)),
       '["Jeff","Chelsea","Rose"]');

    /* ---------------------------------------------- scenes and prefabs */
    for (const s of ['OGSplash', 'HomeScene', 'RivalModeScene', 'Top Canvas',
                     'prefab:RivalModeTutorial', 'prefab:EndGame Group',
                     'prefab:ShareGIF001 Group'])
      ok('scene present: ' + s, !!g.scenes[s]);
    eq('rival scene nodes', Object.keys(g.scenes.RivalModeScene).length, 263);
    eq('splash nodes', Object.keys(g.scenes.OGSplash).length, 20);

    /* the five per-stage background colours, RivalModeScene.BgColors */
    const rc = g.scenes.RivalModeScene[''].comp.RivalModeScene;
    eq('background colours', JSON.stringify(rc.BgColors),
       '["FFCB39","6AEAD1","FF9376","7FE0EA","FF8F9F"]');
    eq('hit-button sprites', rc.HitBtnSprites.length, 5);
    eq('HIT L wired', rc.HitLeftBtnImage.node, 'Canvas/HitLeftBtn Image');
    eq('HIT R wired', rc.HitRightBtnImage.node, 'Canvas/HitRightBtn Image');
    eq('opponents in this set',
       g.scenes.RivalModeScene['Canvas/BridgeGroupDavid'].comp.TestBridge.totalEnemyNum, 50);

    /* the crowd */
    const ac = g.scenes.RivalModeScene['Canvas/Audiance Group'].comp.RivalModeAudiance;
    eq('crowd row A frames', ac.AudianceASeq.length, 6);
    eq('crowd row C frames', ac.AudianceCSeq.length, 6);
    eq('crowd first frame', ac.AudianceASeq[0], 'Stage-Audience-A001');

    /* the settings overlay */
    const sc = g.scenes['Top Canvas']['Setting Group'].comp.Table_Settings;
    eq('hamburger sprite', sc.ListSprite, 'Stage-Menu');
    eq('pause sprite', sc.PauseSprite, 'Stage-Pause');
    eq('close sprite', sc.CrossSprite, 'Stage-Cross');

    /* the ending */
    const ec = g.scenes['prefab:EndGame Group'][''].comp.RivalModeEnding;
    eq('ending dance A frames', ec.Dance1Sequence.length, 10);
    eq('ending dance B frames', ec.Dance2Sequence.length, 12);
    eq('ending dance C frames', ec.Dance3Sequence.length, 24);
    eq('ending shine rays', ec.ShineImages.length, 8);
    eq('ending word Now', g.scenes['prefab:EndGame Group']['RivalModeEnd Group/Endinge_now Text'].text.text, 'Now');
    eq('ending word King', g.scenes['prefab:EndGame Group']['RivalModeEnd Group/Endinge_King Text'].text.text, 'King');

    /* the tutorial */
    const T = g.scenes['prefab:RivalModeTutorial'];
    eq('tutorial greeting', T['25PeopleHiDialog Image/Hi Text'].text.text, 'Hi Rookie');
    eq('tutorial goal line', T['25PeopleGoalDialog Image/Goal Text'].text.text, 'Try to beat 10 of us!');
    eq('tutorial ready line', T['25PeopleReadyDialog Image/Ready Text'].text.text, 'Are you game for it?');
    ok("tutorial has an I'm Ready button", !!T['ImReady Image']);
    eq('tutorial bars park off-screen',
       `${T['TopBar Image'].rect.pos[1]},${T['BottomBar Image'].rect.pos[1]}`, '2000,-2000');
    eq('rival lines park off-screen', T['10PeopleLine1 Group'].rect.pos[0], 1538);

    /* today's GIF */
    eq('GIF variants', GIF_VARIANTS.length, 8);
    /* [sic] SetShareGIF 0x3FF44 only maps indices 0..4, so 5..7 have no art */
    eq('GIF variants with a prefab', GIF_VARIANTS.filter(v => v.prefab).length, 4);
    eq('the "Like us?" variant is the only one with the static picture',
       GIF_VARIANTS.findIndex(v => v.thumb), 4);
    eq('GIF 0 blurb', GIF_VARIANTS[0].blurb,
       'This is the Ping Pong King Dance.\nLike it on our Facebook?');
    eq('GIF 3 title', GIF_VARIANTS[3].title, 'Special Move');
    eq('GIF prefab frames',
       g.scenes['prefab:ShareGIF001 Group'][''].comp.GIFComponent.GIFSpriteSequence.length > 8, true);

    /* --------------------------------------- the decoded splash animation */
    const A = g.anim;
    eq('splash clips', Object.keys(A).length, 3);
    near('click clip length', A.OGSplash_click.stopTime, 0.0833, 1e-3);
    near('explosion clip length', A.OGSplash_explosion.stopTime, 1.5);
    near('loading clip length', A.OGSplash_loading.stopTime, 2.0);
    const ev = A.OGSplash_loading.events.map(e => e.fn);
    ok('loading clip drives the scene change',
       ev.includes('LoadScene') && ev.includes('ActivateScene') && ev.includes('SetDisable'), ev.join(','));
    near('SetDisable at 2 s', A.OGSplash_loading.events.find(e => e.fn === 'SetDisable').t, 2.0);
    const finger = A.OGSplash_click.tracks.find(t => t.path === 'Panel/Finger_1');
    eq('the finger taps down and back',
       JSON.stringify(finger.keys.map(k => k.v)), '[-100,-280,-100]');
    const boy1 = A.OGSplash_explosion.tracks.find(t => t.path === 'Panel/Boy_1' && t.attr === 'm_IsActive');
    eq('the head swaps at 0.1667 s', boy1.keys[1].t, 0.16667);
    eq('the head is gone after the swap', boy1.keys[1].v, 0);
    const blink = A.OGSplash_explosion.tracks.find(t => t.path === 'Panel/Blink');
    eq('the logo blinks twice', blink.keys.filter(k => k.v === 1).length, 2);

    /* -------------------------------------------------- engine behaviour */
    /* RectTransform maths, against a rect resolved by hand: ManB Group is
       centre-anchored, sizeDelta 100x100, anchoredPosition (0,161). */
    let r = resolveRect({ aMin: [.5, .5], aMax: [.5, .5], pos: [0, 161], size: [100, 100],
                          pivot: [.5, .5], scale: [1, 1] }, 1280, 2272);
    near('rect x', r.x, 590); near('rect y', r.y, 1247);
    near('rect w', r.w, 100); near('rect h', r.h, 100);
    r = resolveRect({ aMin: [0, 0], aMax: [1, 1], pos: [0, 0], size: [0, 0],
                      pivot: [.5, .5], scale: [1, 1] }, 1280, 2272);
    near('stretch w', r.w, 1280); near('stretch h', r.h, 2272);

    /* the ease curves LeanTween is asked for */
    near('easeOutSine(0.5)', EASE[15](0.5), Math.sin(Math.PI / 4), 1e-6);
    near('easeOutBack overshoots', EASE[27](0.7) > 1 ? 1 : 0, 1, 1e-9);
    near('linear identity', EASE[1](0.37), 0.37, 1e-9);
    near('easeOutBounce ends at 1', EASE[24](1), 1, 1e-6);

    /* the standing tables from Core::.ctor */
    eq('galaxy A1 left', STAND_GALAXY.A1.L, 'B2');
    eq('galaxy A1 right', STAND_GALAXY.A1.R, 'B1');
    eq('galaxy B2 right', STAND_GALAXY.B2.R, 'A3');
    eq('normal A1 both go to B1', STAND_NORMAL.A1.L + STAND_NORMAL.A1.R, 'B1B1');
    ok('normal table has no A3', STAND_NORMAL.A3 === undefined);

    /* ball trails and their authored hit windows */
    const TR = g.trails.RivalModeScene;
    eq('rival trail count', Object.keys(TR).length, 27);
    eq('From-B1-A1 hit window', `${TR['From-B1-A1 Image'].hitStart}..${TR['From-B1-A1 Image'].hitEnd}`, '8..18');
    eq('From-B3-A3 hit window', `${TR['From-B3-A3 Image'].hitStart}..${TR['From-B3-A3 Image'].hitEnd}`, '9..26');
    eq('FirstBallTrail hit window', `${TR['FirstBallTrail Image'].hitStart}..${TR['FirstBallTrail Image'].hitEnd}`, '9..20');
    ok('every trail frame resolves',
       Object.values(TR).every(t => t.frames.every(f => f && g.sprites[f])));
    const cf = g.core.RivalModeScene.frames;
    eq('Core hitBackStartFrame', cf.hitBackStartFrame, 7);
    eq('Core hitBackEndFrame', cf.hitBackEndFrame, 20);
    eq('swing sequence length', g.core.RivalModeScene.NormalSwingSequence.length, 10);
    eq('A3 swing sequence length', g.core.RivalModeScene.NormalA3SwingSequence.length, 13);

    /* every sprite the port names exists in an atlas that loaded */
    let missingTex = 0;
    for (const s of Object.values(g.sprites)) if (!G.tex[s[0]]) missingTex++;
    eq('atlases all decoded', missingTex, 0);
    eq('sprite count', Object.keys(g.sprites).length, 751);

    /* -------------------------------------------- RivalModeModel formulas */
    const m = new RivalModeModel();
    const slow = { IsFromLeft: false, MovementType: MovementType.Slow, SpeedType: 0 };
    eq('ChangeNothing keeps movement', m.BallData(slow, 1, 1).MovementType, MovementType.Slow);
    eq('ChangeFastSlow flips slow->fast', m.BallData(slow, 2, 1).MovementType, MovementType.Fast);
    eq('ChangeDirection flips side', m.BallData(slow, 3, 1).IsFromLeft, true);
    eq('Impulse forces fast', m.BallData(slow, 1, 2).MovementType, MovementType.Fast);
    eq('ImpulseEaseIn forces slow', m.BallData(slow, 1, 4).MovementType, MovementType.Slow);
    eq('SuddenlySlow restores side', m.BallData(slow, 3, 5).IsFromLeft, false);

    /* the shipped Group_Extreme bug: its top-up band is empty */
    let topUps = 0;
    for (let i = 0; i < 400; i++) {
      const mm = new RivalModeModel();
      mm.levels = [{ StageOrder: '0', Goal: '10', GroupEasyProb: '0', GroupNormalProb: '0',
                     GroupMiddleProb: '0', GroupHardProb: '0', GroupExpertProb: '0',
                     GroupExtremeProb: '55', EnemySideFrameInterval: '0.06',
                     MiddleFrameInterval: '0.03', PlayerSideFrameInterval: '0.06',
                     RelaxIndex: '0', EnemyName: 'T' }];
      mm.LoadLevelProb(0);
      if (mm.CurLevelGroupSequence.length !== 5) topUps++;
    }
    eq('Group_Extreme top-up band is unreachable [sic]', topUps, 0);

    const mr = new RivalModeModel();
    mr.levels = [{ StageOrder: '0', Goal: '6', GroupEasyProb: '100', GroupNormalProb: '0',
                   GroupMiddleProb: '0', GroupHardProb: '0', GroupExpertProb: '0',
                   GroupExtremeProb: '0', EnemySideFrameInterval: '0.06',
                   MiddleFrameInterval: '0.03', PlayerSideFrameInterval: '0.06',
                   RelaxIndex: '2', EnemyName: 'T' }];
    mr.LoadLevelProb(0);
    ok('relax level uses only its relax group',
       mr.CurLevelGroupSequence.every(x => x === 'Group_Relax2'));
    eq('relax level ball count', mr.CurLevelGroupSequence.length, 6);
    const mg = new RivalModeModel();
    mg.LoadLevelProb(0);
    eq('goal is balls+1', mg.Goal, mg.CurLevelGroupSequence.length + 1);

    /* ------------------------------------------------- live scene checks */
    const V = window.mgr.view;
    ok('a rival scene is up', V instanceof RivalModeSceneView, V && V.constructor.name);
    if (V instanceof RivalModeSceneView) {
      eq('match goal is 3 for stage 0', V.matchGoal, 3);
      V.stageOrder = 7; eq('match goal is 5 past stage 4', V.matchGoal, 5); V.stageOrder = 0;

      /* localPosition vs anchoredPosition.  For a centre-anchored node under a
         centre-pivoted parent they are equal; for an edge-anchored one they are
         not, and the game moves everything with LeanTween.moveLocal*. */
      const probe = V.scene.n('Canvas/Core/ManA Group/ManA Image');
      probe.setLocalPos(-387.6, -240);
      near('centre-anchored local == anchored', probe.anchoredPos[0], -387.6, 0.01);

      /* Share Group is stretched over the canvas with pivot 0.5, so local 0
         must land on anchored 0 -- which only holds if the driven Canvas is
         treated as centre-pivoted (it serialises a stale (0,0)). */
      const sg = V.scene.n('Canvas/Share Group');
      sg.setLocalPos(0, 0);
      near('stretched node: local 0 is anchored 0', sg.anchoredPos[0], 0, 0.01);
      near('the share panel lands centred', sg.rect.x, 0, 0.01);

      /* the tutorial's instruction is anchored to the left edge with a 0.8816
         pivot: local 129.9 is anchored 769.9, and the art must be on screen. */
      const tut = new Scene('prefab:RivalModeTutorial', document.createElement('div'));
      const ins = tut.n('Instruction Image');
      eq('instruction is edge-anchored', JSON.stringify(ins.node.rect.aMin), '[0,0.5]');
      near('instruction pivot', ins.node.rect.pivot[0], 0.8816, 1e-3);
      ins.setLocalPos(129.9, 638.5);
      near('edge-anchored local -> anchored', ins.anchoredPos[0], 769.9, 0.01);
      ok('the instruction ends up on screen', ins.rect.x > 0 && ins.rect.x + ins.rect.w < 1280,
         `${ins.rect.x.toFixed(1)}..${(ins.rect.x + ins.rect.w).toFixed(1)}`);
      tut.destroy();

      /* a swing inside the hit window returns the ball */
      const hit = await new Promise(res => {
        V.Reset_EnterGame(0);
        let returned = false, done = false;
        const real = V.SetToBall.bind(V);
        V.SetToBall = () => { returned = true; real(); };
        const iv = setInterval(() => {
          if (done) return;
          if (V.core.IsAbleToHitBack && !V.core.IsInSwingColddown) {
            done = true; clearInterval(iv);
            V.TouchBlockEnable(false);
            if (V.core.ManAHitPos === 'A1') V.GoLeft(); else V.GoRight();
            setTimeout(() => { V.SetToBall = real; res(returned); }, 400);
          }
        }, 8);
        setTimeout(() => { if (!done) { clearInterval(iv); V.SetToBall = real; res('timeout'); } }, 14000);
      });
      ok('a swing inside the hit window returns the ball', hit === true, String(hit));

      /* miss classification */
      const c = V.core;
      c.StopRun();
      c.IsAbleToHitBack = false; c.IsInSwingColddown = false;
      c.SequenceState = SeqState.From; c.curSpriteIndex = 0;
      c.ManACurPos = 'A1'; c.ManAHitPos = 'A1'; c.hitBackStartFrame = 8;
      await c.ManASwingAnim();
      eq('early swing is TooEarly', c.MissHitInfo, Miss.TooEarly);
      c.IsInSwingColddown = false;
      c.ManACurPos = 'A1'; c.ManAHitPos = 'A2'; c.IsAbleToHitBack = true;
      await c.ManASwingAnim();
      eq('swinging on the wrong side is WrongSide', c.MissHitInfo, Miss.WrongSide);

      /* the sweet spot: the window's first six frames return at 0.4x */
      c.hitBackStartFrame = 8; c.curSpriteIndex = 13;
      c.ManAHitPos = 'A1'; c.ManACurPos = 'A1';
      V.SetToBall();
      near('sweet-spot return interval', c.ToBallTrailAnimDelay, V.model.middleFrameInterval * 0.4, 1e-6);
      ok('sweet spot flagged', V.isHitSweetSpot === true);
      c.curSpriteIndex = 14;
      c.ManAHitPos = 'A1'; c.ManACurPos = 'A1';
      V.SetToBall();
      near('late return interval', c.ToBallTrailAnimDelay, V.model.middleFrameInterval * 0.7, 1e-6);
      ok('late hit is not the sweet spot', V.isHitSweetSpot === false);
      c.StopRun();
    }

    /* ------------------------------------------- the audit fixes, pinned */
    if (V instanceof RivalModeSceneView) {
      const c = V.core;

      /* Core::ManBMove 0x21AC0: B1 stands at 543.93, B2 AND B3 both at 195 */
      c.ManBCurPos = 'B1'; c.ManBNextPos = 'B2';
      c.manB.setLocalPos(543.93, 489.1);
      c.ManBMove();
      await new Promise(r => setTimeout(r, 140));
      near('rival hops to B2 at x=195', c.manB.localPos[0], 195, 1);
      c.ManBCurPos = 'B2'; c.ManBNextPos = 'B3';
      c.ManBMove();
      await new Promise(r => setTimeout(r, 140));
      near('B3 shares B2\'s spot', c.manB.localPos[0], 195, 1);
      c.ManBCurPos = 'B3'; c.ManBNextPos = 'B1';
      c.ManBMove();
      await new Promise(r => setTimeout(r, 140));
      near('rival returns to B1 at x=543.93', c.manB.localPos[0], 543.93, 1);
      c.StopRun();

      /* ShowHitBtn 0x34B68: the buttons take the stage's own sprite */
      const spr = V.cfg.HitBtnSprites;
      V.stageOrder = 2; V.ShowHitBtn(1);
      eq('HIT button matches the stage colour', V.hitL._spr, spr[2]);
      V.stageOrder = 7; V.ShowHitBtn(1);
      eq('HIT button cycles every five stages', V.hitL._spr, spr[2]);
      V.stageOrder = 3; V.ShowHitBtn(1);
      eq('stage 3 uses its own button', V.hitL._spr, spr[3]);
      V.stageOrder = 0;

      /* LeftBtnDownAnim 0x34F1C: the button drops 30 px, it is not scaled */
      V.btnUp(true);
      const y0 = V.hitL.localPos[1];
      const s0 = V.hitL.localScale[1];
      V.btnDown(true);
      await new Promise(r => setTimeout(r, 90));
      near('pressing HIT L moves it down 30', V.hitL.localPos[1], y0 - 30, 2);
      near('pressing HIT L does not scale it', V.hitL.localScale[1], s0, 1e-6);
      V.btnUp(true);
      near('releasing puts it back at -742', V.hitL.localPos[1], -742, 0.01);
      near('releasing puts it back at x=-17.5', V.hitL.localPos[0], -17.5, 0.01);

      /* the score pad folds shut and unfolds -- <PlayerScorePadFlip>c__Iterator4 */
      const longG = V.scene.n('Canvas/Top Group/PlayerScorePad Group/PlayerScoreLong Group');
      V.PlayerScore = 2;
      let minY = 9, maxY = -9;
      const watch = setInterval(() => {
        const y = longG.localScale[1];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }, 10);
      await V.ScorePadFlip('player');
      clearInterval(watch);
      ok('the score pad folds shut', minY < 0.25, minY.toFixed(3));
      ok('the score pad unfolds again', Math.abs(longG.localScale[1] - 1) < 0.01, longG.localScale[1]);
      eq('the pad shows the new score', V.playerScoreText.txt.textContent, '2');
      V.PlayerScore = 0; V.updateScore();

      /* the ladder TestBridge::Init builds */
      eq('the rival ladder has one entry per rival', V.bridge.ladder.length, 50);
      eq('ladder entries are 650 apart',
         Math.round(V.bridge.ladder[1].localPos[0] - V.bridge.ladder[0].localPos[0]), 650);
      eq('ladder sprite for the first rival', V.bridge.ladder[0]._spr,
         V.bridge.sprites[(50 - 0) % 10]);

      /* the line the beaten rival says */
      const words = g.arrays.TestEnemyDetail.RivalModeEnemyWordsWhenLose;
      eq('rival #50 says You Win.', words[(50 - 0) % 10], 'You Win.');
      /* the line is indexed by (totalEnemyNum - stage) % 10, so stage 48 --
         rival #2 -- draws index 2 */
      eq('rival #2 is impressed', words[(50 - 48) % 10], "You win, I'm impressed.");
      eq('rival #42 is good-natured', words[(50 - 42) % 10], 'You are good');

      /* sizeDelta keeps a centre-pivoted node centred -- the pause glyph bug */
      const btn = mgr.settings.btn;
      btn.setSize(58, 64);                              // the menu glyph's size
      const before = [btn.rect.x + btn.rect.w / 2, btn.rect.y + btn.rect.h / 2];
      ok('the button starts at its full size', Math.round(btn.rect.w) === 58, btn.rect.w);
      btn.setSize(58 * 0.75, 64 * 0.75);                // the pause glyph's size
      ok('the button really did shrink', Math.round(btn.rect.w) === 44, btn.rect.w);
      near('shrinking a centred rect keeps its centre x', btn.rect.x + btn.rect.w / 2, before[0], 0.01);
      near('shrinking a centred rect keeps its centre y', btn.rect.y + btn.rect.h / 2, before[1], 0.01);
      btn.setSize(58, 64);

      /* Unity scales about the pivot, and these rivals pivot at their feet */
      const mid = V.bridge.middle;
      eq('the rival pivots near its feet', Math.round(mid.node.rect.pivot[1] * 1000), 33);
      mid.setLocalScale(0.4, 0.4);
      eq('scale happens about the pivot',
         mid.el.style.transformOrigin, '50% 96.69%');
      mid.setLocalScale(1, 1);

      /* a null-sprite Image is a colour quad; giving it a sprite must clear it */
      const probe2 = V.scene.n('Canvas/BridgeGroupDavid/BridgeScrollRect/Viewport/ScrollContent/Enemy1 Image');
      ok('a sprite clears the quad fill it replaced',
         probe2 && probe2.img && probe2.img.style.backgroundColor === '',
         probe2 && probe2.img && probe2.img.style.backgroundColor);
    }

    /* the tutorial's red table-quarter light exists and ships disabled */
    const notif = g.scenes.RivalModeScene['Canvas/Core/Table Image/HitOnTableNotification Image'];
    eq('the table light is the red quarter', notif.image.sprite, 'Tutorial-Table light');
    eq('the table light ships disabled', notif.image.enabled, false);
    eq('PAUSED ships disabled', g.scenes.RivalModeScene['Canvas/BridgeGroupDavid/Pause Text'].text.enabled, false);
    /* the ScrollRect's own Image is an input target, never drawn */
    eq('the scroll rect image is not drawn',
       g.scenes.RivalModeScene['Canvas/BridgeGroupDavid/BridgeScrollRect'].image.enabled, false);

    /* every To/From trail the standing tables can name must exist */
    ok('every To trail exists', ['A1', 'A2', 'A3'].every(a => ['B1', 'B2', 'B3'].every(b =>
       !(STAND_GALAXY[a] && (STAND_GALAXY[a].L === b || STAND_GALAXY[a].R === b)) ||
       !!TR[`To-${a}-${b} Image`])));
    ok('every From trail exists', ['B1', 'B2', 'B3'].every(b => ['A1', 'A2', 'A3'].every(a =>
       !(STAND_GALAXY[b] && (STAND_GALAXY[b].L === a || STAND_GALAXY[b].R === a)) ||
       !!TR[`From-${b}-${a} Image`])));

    /* --------------------------------------------- atlas paging oracle
     * A SpriteAtlas bigger than one page yields several Texture2Ds sharing a
     * name; if the extractor keeps only the last, sprites from the other pages
     * are drawn from the wrong bitmap.  The tell is cheap and total: two
     * sprites on one page can never overlap. */
    {
      const by = {};
      for (const k in g.sprites) {
        const r = g.sprites[k];
        (by[r[0]] = by[r[0]] || []).push({ x: r[1], y: r[2], w: r[3], h: r[4] });
      }
      let pairs = 0;
      for (const a in by) {
        const r = by[a];
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
          const p = r[i], q = r[j];
          if (p.x < q.x + q.w - 1 && q.x < p.x + p.w - 1 &&
              p.y < q.y + q.h - 1 && q.y < p.y + p.h - 1) pairs++;
        }
      }
      eq('no two sprites share atlas pixels', pairs, 0);
      /* MenuScene_Pack1 really is four pages and EndingScene two */
      const pages = n => Object.keys(by).filter(a => a.indexOf(n) === 0).length;
      eq('MenuScene_Pack1 page count', pages('SpriteAtlasTexture-MenuScene_Pack1-2048x2048-fmt47'), 4);
      eq('EndingScene page count', pages('SpriteAtlasTexture-EndingScene-2048x2048-fmt4'), 2);
      eq('Menu-Opponent01 is on page #17',
         g.sprites['Menu-Opponent01'][0], 'SpriteAtlasTexture-MenuScene_Pack1-2048x2048-fmt47#17');
    }

    /* ------------------------------------------- the numeric APK tables
     * arrays.py originally read only string arrays, so every Vector3[] and
     * int[] in TestEnemyDetail came out empty and the tournament bridge had
     * no font sizes or positions to lay itself out with. */
    {
      const R = g.arrays.TestEnemyDetail;
      eq('tournament roster', JSON.stringify(R.OGTournamentEnemyName),
         '[null,"Jeff","Chelsea","Rose","Tracy","Leon","All staff"]');
      eq('tournament job titles', JSON.stringify(R.OGTournamentEnemyBackText),
         '[null,"Programmer","Artist","Marketing","Manager","Producer","Orangenose"]');
      eq('tournament name font sizes', JSON.stringify(R.OGTournamentTextFontSize),
         '[0,170,250,190,200,190,183]');
      eq('rival dialog positions', R.RivalModeEnemyDialogPos.length, 11);
      eq('rival dialog position 0', JSON.stringify(R.RivalModeEnemyDialogPos[0]), '[96,303,0]');
      eq('tournament number position 1', JSON.stringify(R.OGTournamentEnemyNumberPos[1]), '[6,472,0]');
      eq('Leon says', R.OGTournamentEnemyWordsWhenLose[5], "You've just beaten the No.1");
    }

    /* ------------------------------------------------------- rich text */
    eq('a colour tag becomes a span',
       richText('a <color="#FFCB39FF">b</color> c'),
       'a <span style="color:#ffcb39ff">b</span> c');
    eq('a size tag becomes a span',
       richText('<size=51>x</size>'), '<span style="font-size:51px">x</span>');
    eq('a named colour resolves', richText('<color=red>x</color>'),
       '<span style="color:#ff0000">x</span>');
    eq('plain text is left alone', richText('no tags here'), null);
    eq('markup in the text is escaped', richText('<b>a < b</b>'),
       '<span style="font-weight:bold">a &lt; b</span>');
    /* a trailing newline has to survive, or two layered texts drift half a line */
    eq('a trailing newline is kept', textForDom('a\n'), 'a\n\u200b');
    eq('text without one is untouched', textForDom('a'), 'a');
    eq("the GIF panel's title really is tagged",
       GIF_VARIANTS[0].title, 'Today\'s <color="#FFCB39FF">GIF</color>');

    /* ------------------------------------------------ the tournament */
    {
      const s = new Scene('RivalModeScene', document.createElement('div'));
      const tb = new BridgeView(s, null, 'tournament');
      eq('the tournament has six bouts', tb.total, 6);
      eq('tournament stage 0 is Jeff', tb.nameFor(0), 'Jeff');
      eq('tournament stage 5 is All staff', tb.nameFor(5), 'All staff');
      eq('tournament sprites are indexed from 1', tb.spriteFor(0),
         (tb.cfg.TournamentBridgeSprites || [])[1]);
      eq('the ladder counts down instead',
         new BridgeView(s, null, 'test').nameFor(0), 'BEST FRIEND');
      s.destroy();
    }
    {
      const host = document.createElement('div');
      const v = new RivalModeSceneView(host, { }, 2);
      eq('the tournament palette starts ten steps along', v.bgIndex(0), 0);
      eq('tournament stage 1 background', v.bgIndex(1), 1);
      eq('career stage 1 background',
         new RivalModeSceneView(host, { }, 1).bgIndex(1), 1);
      ok('the tournament reads the tournament bridge',
         v.bridgeCfg.totalEnemyNum === 6, String(v.bridgeCfg.totalEnemyNum));
      v.destroy();
    }

    /* ------------------------------------------- the ladder and revive */
    {
      const host = document.createElement('div');
      const v = new RivalModeSceneView(host, { }, 1);
      const b = v.bridge;
      eq('the ladder has every rival', b.ladder.length, 50);
      /* the ladder is 650 apart, and ScrollingEffect measures against that */
      near('rivals are 650 apart', b.ladder[1].localPos[0] - b.ladder[0].localPos[0], 650, 0.5);
      /* OnDragEnd 0x15F58 snaps to whichever ends up nearest the middle */
      b.MoveToCurRival(10, true);
      eq('the ladder centres on the current rival', b.OnDragEnd(), 10);
      b.content.setLocalPos(b.content.localPos[0] - 650, b.content.localPos[1]);
      eq('a drag of one step moves one rival', b.OnDragEnd(), 11);
      b.content.setLocalPos(b.content.localPos[0] + 650 * 2.4, b.content.localPos[1]);
      eq('a drag snaps to the nearest, not the last', b.OnDragEnd(), 9);

      /* Revive: one ball from losing, past the first rival, once per match */
      v.stageOrder = 3; DB.data.OutterStageOrder = 3;
      v.PlayerScore = 2; v.isThisMatchAlreadyRevive = false;
      ok('the revive offer is due at match point', v.reviveIsDue);
      v.PlayerScore = 1;
      ok('it is not due earlier', !v.reviveIsDue);
      v.PlayerScore = 2; v.isThisMatchAlreadyRevive = true;
      ok('it is offered once a match', !v.reviveIsDue);
      v.isThisMatchAlreadyRevive = false;
      DB.data.OutterStageOrder = 0; v.stageOrder = 0;
      ok('and never on the first rival', !v.reviveIsDue);
      DB.data.OutterStageOrder = 5; v.stageOrder = 5;
      eq('past rival five a match is five balls', v.matchGoal, 5);
      v.PlayerScore = 3;
      ok('so match point moves to three', v.reviveIsDue);
      eq('the revive counter starts at ten', v.revive.counter, 10);
      DB.data.OutterStageOrder = 0;
      v.destroy();
    }

    /* a revive puts every ball the match has used back in the bag */
    {
      const m = new RivalModeModel();
      m.LoadLevelProb(20);
      const n0 = m.CurLevelGroupSequence.length;
      m.Level_GetRoundDataAndDelete(0);
      m.Level_GetRoundDataAndDelete(1);
      eq('drawing a ball takes it out of the bag', m.CurLevelGroupSequence.length, n0 - 2);
      eq('and files it away', m.UsedGroupSequence.length, 2);
      m.RemakeLevelGroupSequence();
      eq('a revive puts them back', m.CurLevelGroupSequence.length, n0);
      eq('and empties the used list', m.UsedGroupSequence.length, 0);
    }

    /* the share panel's real gate, 0x0B38 */
    {
      const db = DB.data, keep = JSON.stringify(db);
      const g = () => mgr.shareIsDue();
      Object.assign(db, { OutterStageOrder: 3, OGTournamentStageOrder: 0,
                          RivalMode_LastShareShowsUp: 0, OutterStageRetryCount: {} });
      ok('three stages without one makes it due', g());
      db.RivalMode_LastShareShowsUp = 2;
      ok('one stage does not', !g());
      db.OutterStageRetryCount = { 3: 5 };
      ok('five retries do', g());
      db.OutterStageOrder = 5; db.RivalMode_LastShareShowsUp = 0; db.OutterStageRetryCount = {};
      ok('stage 5 is reserved', !g());
      db.OutterStageOrder = 9;
      ok('so is stage 9', !g());
      db.OutterStageOrder = 14;
      ok('and stage 14', !g());
      Object.assign(db, JSON.parse(keep));
    }

    /* --------------------------------- text is one flex item, not several
     * .txt is a flex box (that is how Unity's nine TextAnchors are done), so a
     * <color> span inside it used to split the paragraph into three flex items
     * laid out in a ROW.  Everything now goes into one .rt child. */
    {
      const d = document.createElement('div');
      d.className = 'txt';
      setTxtContent(d, 'a <color=#FFCB39FF>b</color> c', 0);
      eq('rich text is one child', d.children.length, 1);
      eq('and it is the .rt span', d.firstChild.className, 'rt');
      eq('the colour survives inside it', d.firstChild.children.length, 1);
      setTxtContent(d, 'plain', 4);
      eq('plain text is wrapped too', d.children.length, 1);
      eq('alignment reaches the span', d.firstChild.style.textAlign, 'center');
    }

    /* --------------------------------------- the Impossible Test card list */
    {
      const host = document.createElement('div');
      const keep = JSON.stringify(DB.data);
      delete DB.data.played_EyesightModeScene;
      let v = new EndlessListView(host, mgr);
      eq('three cards', Object.keys(v.cards).length, 3);
      ok('an unplayed card hides its badge', !v.cards.EyesightModeScene.badgeGroup.active);
      v.destroy();
      DB.data.played_EyesightModeScene = true;
      DB.data.best_EyesightModeScene = 14;
      v = new EndlessListView(host, mgr);
      const c = v.cards.EyesightModeScene;
      ok('a played card shows it', c.badgeGroup.active);
      eq('with the score', c.scoreText.txt.textContent, '14');
      eq('and the class it earned', c.classText.txt.textContent, 'S');
      /* the first press explains the test, the second starts it */
      delete DB.data.introShown_EyesightModeScene;
      ok('the first choice shows the intro', !c.OnModeChoose());
      ok('the intro alert is up', c.introShown);
      eq('OK returns the mode', c.OnOKBtnDown(), 'EyesightModeScene');
      ok('the second choice goes straight in', c.OnModeChoose());
      v.destroy();
      Object.assign(DB.data, JSON.parse(keep));
    }

    /* the drawer's own buttons */
    {
      const st = mgr.settings || new SettingsView(document.createElement('div'), mgr);
      const before = st.IsEnableSfx;
      st.OnVolumeBtnDown();
      eq('mute flips the flag', st.IsEnableSfx, !before);
      eq('and mutes the audio', Audio_.sfxOn, !before);
      eq('and swaps the sprite', st.volumeBtn._spr,
         (!before) ? st.cfg.UnMuteSprite : st.cfg.MuteSprite);
      st.OnVolumeBtnDown();
      eq('and back again', st.IsEnableSfx, before);
      ok('how-to-play and credits panels exist', !!st.howTo && !!st.credits);
    }

    /* ------------------------------------------------ nothing left over
     * The build ships exactly two Unity scenes, OGSplashScene and _Project;
     * every screen is a BaseScene view group inside the latter.  Enumerating
     * the MonoBehaviours actually present is the closing oracle for "is it all
     * ported?", and it is what says TestModeScene and DemoMode are not in this
     * build at all -- the classes are compiled in, but no GameObject carries
     * them, so there is nothing to port. */
    {
      const scripts = new Set();
      for (const sn in g.scenes) for (const k in g.scenes[sn]) {
        const c = g.scenes[sn][k].comp;
        if (c) for (const n in c) scripts.add(n);
      }
      eq('scripts in the shipped scenes', scripts.size, 38);
      for (const dead of ['TestModeScene', 'DemoMode', 'DemoResultPage',
                          'TestModeListComponent', 'DemoModeListComponent'])
        ok(dead + ' is not in this build', !scripts.has(dead));
      /* and every one that IS present has something in the port */
      const covered = new Set([
        'BallTrail_From', 'BallTrail_To', 'BallTrail_Lose',        // trail data
        'Core', 'RivalModeModel', 'RivalModeScene', 'RivalModeAudiance',
        'RivalModeTutorial', 'RivalModeEnding', 'RivalModeRule', 'Revive',
        'ScorePad', 'ShareGIF', 'GIFComponent', 'TouchTableNotification',
        'TestBridge', 'TournamentBridge', 'TournamentInfo', 'TestModeScrollRect',
        'HomeScene', 'Table_Settings', 'HowToPlayInstruction',
        'OGSplashAnimationEvents', 'EndlessController',
        'EyesightModeScene', 'ConcentrateModeScene', 'InvertModeScene',
        'EyesightModeListComponent', 'ConcentrateModeListComponent',
        'InvertModeListComponent', 'PlayerControlBase', 'ConcentratePlayerControl',
        'InvertModePlayerControl', 'PausePageBase', 'ResultPageBase',
        /* present in the scene but unreachable in this build: */
        'RivalModeBridge', 'RivalModeBridgeScrollRect',   // the older 10-rival bridge
        'BannerController',                               // the ad banner
      ]);
      const missing = [...scripts].filter(n => !covered.has(n));
      eq('every shipped script is accounted for', JSON.stringify(missing), '[]');
      /* RivalModeScene.Bridge is a TestBridge; nothing holds the old one */
      ok('the old rival bridge ships switched off',
         !g.scenes.RivalModeScene['Canvas/Bridge Group'].active);
    }

    /* the rule alert */
    {
      const host = document.createElement('div');
      const keep = DB.data.isWin3BallToPassShow;
      DB.data.isWin3BallToPassShow = false;
      const v = new RivalModeSceneView(host, mgr, 1);
      v.ShowRuleAlert(3);
      ok('the rule alert appears', !!v.rule);
      eq('and states the rule', v.rule.n('Alert Group/Rule Text').txt.textContent,
         'Win 3 balls to win the game.');
      eq('with the ball count on the pad',
         v.rule.n('Alert Group/PlayerScorePad Image/PlayerScore Text').txt.textContent, '3');
      ok('and it only shows once', DB.data.isWin3BallToPassShow);
      v.ShowRuleAlert(5);
      eq('the five-ball rule reads differently',
         v.rule.n('Alert Group/Rule Text').txt.textContent,
         'For subsequent levels,\nWin 5 balls to win the game.');
      v.RuleAlertOKBtnClick();
      ok('OK takes it away', !v.rule);
      DB.data.isWin3BallToPassShow = keep;
      v.destroy();
    }

    /* -------------------------------------------- the tutorial's own bits */
    {
      const host = document.createElement('div');
      const rival = new RivalModeSceneView(host, mgr, 1);
      const t = new TutorialView(host, mgr, rival);
      eq('the little mission is three balls', t.remainBalls.length, 3);
      eq('and says so', t.missionText.txt.textContent,
         'Hit 3 balls to complete this\ntutorial.');
      /* GameMgr::Init 0x27EC: setName "Random" matches no set, so a virgin
         save falls to "D" and fifty rivals -- the prefab's "10" is stale */
      eq('the rivals are counted correctly', t.goal3.txt.textContent,
         'Try to beat 50 of us!');
      eq('the skip alert asks first',
         t.skipAlert1.txt.textContent.indexOf('Confirm skip tutorial?') > 0, true);
      ok('and the second half starts invisible', t.skipOk.alpha === 0);
      eq('three alert stages', t.skipStage, 0);
      t.destroy(); rival.destroy();
    }

    /* -------------------------------------------- the two endings */
    {
      const host = document.createElement('div');
      const a = new EndingView(host, mgr, 1);
      ok('the career ending uses its own group',
         !a.scene.n('TournamentModeEnd Group').active);
      eq('and says Now / Ping / Pong / King',
         [a.nowText, a.pingText, a.pongText, a.kingText].map(n => n.txt.textContent).join(' '),
         'Now Ping Pong King');
      a.destroy();
      const b = new EndingView(host, mgr, 2);
      ok('the tournament ending hides the career one',
         !b.scene.n('RivalModeEnd Group').active);
      eq("and opens with the studio's reply",
         b.tWord11.txt.textContent + b.tWord12.txt.textContent + b.tWord13.txt.textContent,
         "Wow, I can't believe you\n\u200bhave beaten our team so easily.");
      eq('then asks you not to tell anyone', b.tWord2.txt.textContent,
         "Please DON'T tell your \nfriends about this game!");
      ok('it has a heart and a credits roll', !!b.tHeart && !!b.credits);
      b.destroy();
    }

    /* ---- report */
    const bad = R.filter(x => !x.pass);
    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.style.cssText = 'position:fixed;inset:0;z-index:99;background:#fff;color:#000;' +
                        'font:11px monospace;overflow:auto;padding:8px;white-space:pre';
    pre.textContent = R.map(x => `${x.pass ? 'pass' : 'FAIL'}  ${x.name}${x.pass ? '' : '   got ' + x.got}`).join('\n')
      + `\n\n${bad.length ? bad.length + ' FAILURES' : 'ALL PASS'} (${R.length} assertions)`;
    document.body.appendChild(pre);
  });
})();
