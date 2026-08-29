/* In-page assertions.  Run with ?selftest=1 and grep the DOM for ALL PASS.
 * Every expected value here is a number read out of the APK, not out of the
 * port -- the point is to catch the port drifting away from the original.
 */
(function () {
  if (!new URLSearchParams(location.search).get('selftest')) return;
  const R = [];
  const ok = (name, cond, got) => R.push({ name, pass: !!cond, got });
  const eq = (name, a, b) => ok(name, a === b, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  const near = (name, a, b, e = 1e-3) => ok(name, Math.abs(a - b) <= e, `${a} vs ${b}`);

  window.addEventListener('porttest', async () => {
    const g = G.data, S = window.scene, C = S.core;

    /* ---- data the APK states outright */
    eq('reference resolution', JSON.stringify(g.reference), '[1280,2272]');
    eq('career stages', g.levels.length, 80);
    eq('difficulty groups', g.groups.length, 10);
    eq('stage 0 goal', g.levels[0].Goal, '2');
    eq('stage 0 opponent', g.levels[0].EnemyName, 'LITTLE BROTHER');
    eq('stage 0 middle interval', g.levels[0].MiddleFrameInterval, '0.033');
    eq('stage 12 goal', g.levels[12].Goal, '11');
    eq('stage 12 opponent', g.levels[12].EnemyName, 'COUNTRY BEST');
    eq('Group_Easy first variations', JSON.stringify(g.groups[0].FirstVariationIndexs), '[1]');
    eq('Group_Extreme first variations',
       JSON.stringify(g.groups.find(x => x.GroupName === 'Group_Extreme').FirstVariationIndexs),
       '[2,3,4]');

    /* ---- scene-authored ball trails */
    const T = g.trails.RivalModeScene;
    eq('rival trail count', Object.keys(T).length, 27);
    eq('From-B1-A1 hit window start', T['From-B1-A1 Image'].hitStart, 8);
    eq('From-B1-A1 hit window end', T['From-B1-A1 Image'].hitEnd, 18);
    eq('From-B1-A1 touch-table frame', T['From-B1-A1 Image'].touchTable, 6);
    eq('From-B1-A1 frame count', T['From-B1-A1 Image'].frames.length, 19);
    eq('From-B3-A3 hit window', `${T['From-B3-A3 Image'].hitStart}..${T['From-B3-A3 Image'].hitEnd}`, '9..26');
    eq('FirstBallTrail hit window', `${T['FirstBallTrail Image'].hitStart}..${T['FirstBallTrail Image'].hitEnd}`, '9..20');
    ok('every trail frame resolves',
       Object.values(T).every(t => t.frames.every(f => f && g.sprites[f])));

    /* ---- Core's own authored frames */
    const cf = g.core.RivalModeScene.frames;
    eq('Core hitBackStartFrame', cf.hitBackStartFrame, 7);
    eq('Core hitBackEndFrame', cf.hitBackEndFrame, 20);
    eq('Core changeToLoseSequenceFrame', cf.changeToLoseSequenceFrame, 19);
    eq('swing sequence length', g.core.RivalModeScene.NormalSwingSequence.length, 10);
    eq('A3 swing sequence length', g.core.RivalModeScene.NormalA3SwingSequence.length, 13);
    eq('table effect sequence length', g.core.RivalModeScene.TableEffectSpriteSequence.length, 7);

    /* ---- every sprite the port names exists in an atlas that loaded */
    let missingTex = 0, missingSpr = 0;
    for (const [n, s] of Object.entries(g.sprites)) {
      if (!G.tex[s[0]]) missingTex++;
      if (!(s[3] > 0 && s[4] > 0)) missingSpr++;
    }
    eq('atlases all decoded', missingTex, 0);
    eq('sprites all sized', missingSpr, 0);

    /* ---- RectTransform maths, against a rect resolved by hand from the scene:
       ManB Group is anchored dead centre, sizeDelta 100x100, anchoredPosition
       (0,161), pivot (.5,.5) -> bottom-left (590, 1247) in a 1280x2272 canvas. */
    const r = window.__port.resolveRect(
      { aMin: [.5, .5], aMax: [.5, .5], pos: [0, 161], size: [100, 100], pivot: [.5, .5], scale: [1, 1] },
      1280, 2272);
    near('rect x', r.x, 590); near('rect y', r.y, 1247);
    near('rect w', r.w, 100); near('rect h', r.h, 100);
    /* a stretched rect: anchors (0,0)-(1,1), sizeDelta 0 -> the whole parent */
    const r2 = window.__port.resolveRect(
      { aMin: [0, 0], aMax: [1, 1], pos: [0, 0], size: [0, 0], pivot: [.5, .5], scale: [1, 1] },
      1280, 2272);
    near('stretch w', r2.w, 1280); near('stretch h', r2.h, 2272);

    /* ---- the standing tables from Core::.ctor */
    eq('galaxy A1 left', STAND_GALAXY.A1.L, 'B2');
    eq('galaxy A1 right', STAND_GALAXY.A1.R, 'B1');
    eq('galaxy B2 left', STAND_GALAXY.B2.L, 'A1');
    eq('galaxy B2 right', STAND_GALAXY.B2.R, 'A3');
    eq('normal A1 both go to B1', STAND_NORMAL.A1.L + STAND_NORMAL.A1.R, 'B1B1');
    ok('normal table has no A3', STAND_NORMAL.A3 === undefined);

    /* ---- RivalModeModel::BallData transitions */
    const m = new RivalModeModel();
    const slow = { IsFromLeft: false, MovementType: MovementType.Slow, SpeedType: 0 };
    eq('ChangeNothing keeps movement', m.BallData(slow, 1, 1).MovementType, MovementType.Slow);
    eq('ChangeFastSlow flips slow->fast', m.BallData(slow, 2, 1).MovementType, MovementType.Fast);
    eq('ChangeDirection flips side', m.BallData(slow, 3, 1).IsFromLeft, true);
    eq('ChangeDirection keeps movement', m.BallData(slow, 3, 1).MovementType, MovementType.Slow);
    eq('both flips side and movement', JSON.stringify(
       [m.BallData(slow, 4, 1).IsFromLeft, m.BallData(slow, 4, 1).MovementType]), '[true,3]');
    eq('Impulse forces fast', m.BallData(slow, 1, 2).MovementType, MovementType.Fast);
    eq('ImpulseEaseIn forces slow', m.BallData(slow, 1, 4).MovementType, MovementType.Slow);
    eq('SuddenlySlow restores side', m.BallData(slow, 3, 5).IsFromLeft, false);

    /* ---- the shipped Group_Extreme bug: its top-up band is empty, so a level
       whose whole budget is Extreme still fills out with the proportional pass
       only, and never rolls Extreme in the top-up loop. */
    let extremeFromTopUp = 0;
    for (let i = 0; i < 400; i++) {
      const mm = new RivalModeModel();
      mm.levels = [{ StageOrder: '0', Goal: '10', GroupEasyProb: '0', GroupNormalProb: '0',
                     GroupMiddleProb: '0', GroupHardProb: '0', GroupExpertProb: '0',
                     GroupExtremeProb: '55', EnemySideFrameInterval: '0.06',
                     MiddleFrameInterval: '0.03', PlayerSideFrameInterval: '0.06',
                     RelaxIndex: '0', EnemyName: 'T' }];
      mm.LoadLevelProb(0);
      /* trunc(55*10/100) = 5 come from the proportional pass; the loop must add
         the other 5, and with only Extreme configured it can add nothing. */
      if (mm.CurLevelGroupSequence.length !== 5) extremeFromTopUp++;
    }
    eq('Group_Extreme top-up band is unreachable [sic]', extremeFromTopUp, 0);

    /* ---- relax levels bypass the probability table entirely */
    const mr = new RivalModeModel();
    mr.levels = [{ StageOrder: '0', Goal: '6', GroupEasyProb: '100', GroupNormalProb: '0',
                   GroupMiddleProb: '0', GroupHardProb: '0', GroupExpertProb: '0',
                   GroupExtremeProb: '0', EnemySideFrameInterval: '0.06',
                   MiddleFrameInterval: '0.03', PlayerSideFrameInterval: '0.06',
                   RelaxIndex: '2', EnemyName: 'T' }];
    mr.LoadLevelProb(0);
    ok('relax level uses only its relax group',
       mr.CurLevelGroupSequence.every(x => x === 'Group_Relax2'), mr.CurLevelGroupSequence[0]);
    eq('relax level ball count', mr.CurLevelGroupSequence.length, 6);
    eq('relax level leaves Goal untouched', mr.Goal, 6);

    /* ---- goal is ball count + 1 for a normal level */
    const mg = new RivalModeModel();
    mg.LoadLevelProb(0);
    eq('goal is balls+1', mg.Goal, mg.CurLevelGroupSequence.length + 1);

    /* ---- a hit inside the window scores, and one outside does not */
    /* Watch for the transition rather than sampling state: with the sweet spot
       the return can finish inside a sampling delay. */
    const tryRally = () => new Promise(res => {
      const s = window.scene;
      s.enter();
      let returned = false, done = false;
      const realSetToBall = s.SetToBall.bind(s);
      s.SetToBall = () => { returned = true; realSetToBall(); };
      const iv = setInterval(() => {
        if (done) return;
        if (s.core.IsAbleToHitBack && !s.core.IsInSwingColddown) {
          done = true; clearInterval(iv);
          if (s.core.ManAHitPos === 'A1') s.GoLeft(); else s.GoRight();
          setTimeout(() => { s.SetToBall = realSetToBall; res(returned); }, 400);
        }
      }, 8);
      setTimeout(() => { if (!done) { clearInterval(iv); s.SetToBall = realSetToBall; res('timeout'); } }, 9000);
    });
    const hit = await tryRally();
    ok('a swing inside the hit window returns the ball', hit === true, String(hit));

    /* an early swing is classified TooEarly */
    window.scene.enter();
    await new Promise(r => setTimeout(r, 900));
    const c2 = window.scene.core;
    c2.IsAbleToHitBack = false; c2.IsInSwingColddown = false;
    c2.SequenceState = SeqState.From; c2.curSpriteIndex = 0;
    c2.ManACurPos = 'A1'; c2.ManAHitPos = 'A1'; c2.hitBackStartFrame = 8;
    await c2.ManASwingAnim();
    eq('early swing is TooEarly', c2.MissHitInfo, Miss.TooEarly);
    c2.IsInSwingColddown = false;
    c2.ManACurPos = 'A1'; c2.ManAHitPos = 'A2'; c2.IsAbleToHitBack = true;
    await c2.ManASwingAnim();
    eq('swinging on the wrong side is WrongSide', c2.MissHitInfo, Miss.WrongSide);

    /* the sweet spot: meeting the ball early returns it at 0.4x the interval */
    const s3 = window.scene, c3 = s3.core;
    s3.enter();
    await new Promise(r => setTimeout(r, 600));
    /* straddle the boundary exactly: with start 8 the cut is `< 14`, so 13 is
       the last sweet frame and 14 the first late one. */
    c3.hitBackStartFrame = 8; c3.curSpriteIndex = 13;
    c3.ManAHitPos = 'A1'; c3.ManACurPos = 'A1';
    s3.SetToBall();
    near('sweet-spot return interval', c3.ToBallTrailAnimDelay,
         s3.model.middleFrameInterval * 0.4, 1e-6);
    ok('sweet spot flagged', s3.isHitSweetSpot === true);
    c3.curSpriteIndex = 14;                                // first late frame
    c3.ManAHitPos = 'A1'; c3.ManACurPos = 'A1';
    s3.SetToBall();
    near('late return interval', c3.ToBallTrailAnimDelay,
         s3.model.middleFrameInterval * 0.7, 1e-6);
    ok('late hit is not the sweet spot', s3.isHitSweetSpot === false);
    ok('every To trail the standing tables can name exists',
       ['A1', 'A2', 'A3'].every(a => ['B1', 'B2', 'B3'].every(b => {
         const need = (STAND_GALAXY[a] && (STAND_GALAXY[a].L === b || STAND_GALAXY[a].R === b));
         return !need || !!g.trails.RivalModeScene[`To-${a}-${b} Image`];
       })));
    ok('every From trail the standing tables can name exists',
       ['B1', 'B2', 'B3'].every(b => ['A1', 'A2', 'A3'].every(a => {
         const need = (STAND_GALAXY[b] && (STAND_GALAXY[b].L === a || STAND_GALAXY[b].R === a));
         return !need || !!g.trails.RivalModeScene[`From-${b}-${a} Image`];
       })));
    window.scene.core.StopRun();

    /* ---- report */
    const bad = R.filter(x => !x.pass);
    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.style.cssText = 'position:fixed;inset:0;z-index:99;background:#fff;color:#000;font:11px monospace;overflow:auto;padding:8px;white-space:pre';
    pre.textContent = R.map(x => `${x.pass ? 'pass' : 'FAIL'}  ${x.name}${x.pass ? '' : '   got ' + x.got}`).join('\n')
      + `\n\n${bad.length ? bad.length + ' FAILURES' : 'ALL PASS'} (${R.length} assertions)`;
    document.body.appendChild(pre);
  });
})();
