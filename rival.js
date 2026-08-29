/* RivalMode: the 80-stage career, its ball engine, its crowd and its rivals.
 *
 * Core (token 0x0200002D) is shared by every play mode; RivalModeScene
 * (0x02000082) is the career wrapped around it.  Method names and RVAs below
 * are the shipped ones.
 */
'use strict';

const SeqState = { From: 0, To: 1, Lose: 2, ManBLose: 3 };          // Core/SequenceStates
const Miss = { TooLate: 0, TooEarly: 1, WrongSide: 2, None: 3 };    // Core/MissHitState
const MovementType = { VerySlow: 0, Slow: 1, VeryFast: 2, Fast: 3, Normal: 4 };
const SpeedType = { Nothing: 0, Impulse: 1, ImpulseEaseIn: 2, ImpulseEaseOut: 3 };

/* Core::.ctor 0x216C4 */
const CTOR = { BallTrailFrameInterval: 0.023, ManBSwingAnimDelay: 0.040,
               LoseBallTrailAnimDelay: 0.030, ToBallTrailAnimDelay: 0.023,
               FromBallTrailAnimDelay: 0.023 };
/* Core::.ctor 0x216C4 -- where a ball may go from each standing position.
   "Normal" is the pre-stage-2 game (A3 never comes up); "Galaxy" is the rest. */
const STAND_NORMAL = { A1: { L: 'B1', R: 'B1' }, A2: { L: 'B1', R: 'B1' },
                       B1: { L: 'A1', R: 'A2' } };
const STAND_GALAXY = { A1: { L: 'B2', R: 'B1' }, A2: { L: 'B3', R: 'B1' },
                       A3: { L: 'B3', R: 'B1' }, B1: { L: 'A1', R: 'A2' },
                       B2: { L: 'A1', R: 'A3' }, B3: { L: 'A1', R: 'A3' } };

/* ================================================================= Core */
class Core {
  constructor(scene, sceneName) {
    this.scene = scene;
    this.cfg = G.data.core[sceneName];
    this.trails = G.data.trails[sceneName];
    this.gen = 0;
    const P = 'Canvas/Core/';
    this.trailNode = {};
    for (const name of Object.keys(this.trails)) {
      const n = scene.n(P + 'BallTrail Group/' + name);
      if (n) { n.setActive(false); this.trailNode[name] = n; }
    }
    this.manA = scene.n(P + 'ManA Group/ManA Image');
    this.manAA3 = scene.n(P + 'ManA Group/ManAA3 Image');
    this.manAWinLose = scene.n(P + 'ManA Group/ManAWinLose Image');
    this.manASurprise = scene.n(P + 'ManA Group/ManA Image/ManASuprise Image');
    this.manB = scene.n(P + 'ManB Group/ManB Image');
    this.manBB3 = scene.n(P + 'ManB Group/ManBB3 Image');
    this.manBFirstLook = scene.n(P + 'ManB Group/ManBFirstLook Image');
    this.manBWinLose = scene.n(P + 'ManB Group/ManBWinLose Image');
    this.manBSurprise = scene.n(P + 'ManB Group/ManB Image/ManBSurprise Image');
    this.table = scene.n(P + 'Table Image');
    this.tableEffect = scene.n(P + 'Table Image/TouchTableEffect Image');
    this.nameLine1 = scene.n(P + 'ManB Group/ManB Image/ManBNameLine1 Text');
    this.nameLine2 = scene.n(P + 'ManB Group/ManB Image/ManBNameLine2 Text');
    this.remainBall = scene.n(P + 'ManB Group/ManB Image/RemainBall Image');
    this.remainBallText = scene.n(P + 'ManB Group/ManB Image/RemainBall Image/NumOfRemainBall Text');
    this.missText = scene.n(P + 'ManA Group/ManA Image/MissHitInInfo Text');
    this.readyDialog = scene.n(P + 'ReadyDialog Image');
    this.fightDialog = scene.n(P + 'FightDialog Image');
    this.reset();
  }

  reset() {
    const f = this.cfg.frames;
    this.IsAbleToHitBack = false; this.IsHitBack = false;
    this.IsInSwingColddown = false; this.IsSwingHard = false;
    this.IsManBLoseAtThisRound = false; this.IsGamePause = false;
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
    for (const n of Object.values(this.trailNode)) n.setActive(false);
  }

  /* the IsGamePause gate the coroutines spin on before every WaitForSeconds */
  async waitP(sec) {
    const g = this.gen;
    await wait(sec * 1000);
    while (this.IsGamePause && g === this.gen) await wait(16);
    return g === this.gen;
  }
  Pause(v) { this.IsGamePause = v; }
  StopRun() { this.gen++; }
  StartRun(willReadyFightShow) {            // Core::StartRun 0x21D89
    this.WillReadyFightShow = willReadyFightShow;
    this.BallTrailAnim();
  }

  /* Core::ChangeTrailImage 0x21DAC */
  ChangeTrailImage(name) {
    const prev = this.curTrail && this.trailNode[this.curTrail];
    if (prev) { prev.setSprite(this.cfg.NothingSprite); prev.setActive(false); }
    const t = this.trails[name];
    if (!t) return;
    this.curTrail = name;
    const n = this.trailNode[name];
    n.setColor([0, 0, 0, 1]);                // BallTrailImageTmp.color = black
    n.setActive(true);
    if (t.kind === 'From' && this.tableEffect) {
      /* TouchEffectPos - (0,102,0) * UIScaleFactor; the port runs at scale 1 */
      this.tableEffect.setLocalPos(t.effect[0], t.effect[1] - 102);
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
      this.LoseBallTrailAnimDelay = t.interval;      // SetLoseBallFrameInterval
    }
  }

  trailSet(i) {
    const n = this.trailNode[this.curTrail];
    if (n) n.setSprite(this.BallTrailSequenceTmp[i]);
  }

  /* Core::TouchTableEffectAnim (iterator 6) -- 0.018 s a frame */
  async TouchTableEffectAnim() {
    const g = this.gen;
    for (const s of this.cfg.TableEffectSpriteSequence) {
      if (g !== this.gen) return;
      if (this.tableEffect) this.tableEffect.setSprite(s);
      await this.waitP(0.018);
    }
    if (this.tableEffect) this.tableEffect.setSprite(this.cfg.NothingSprite);
  }

  ManASwing() { this.ManASwingAnim(); }

  /* Core::ManASwingAnim (iterator 5) */
  async ManASwingAnim() {
    const g = this.gen;
    this.IsInSwingColddown = true;
    const hit = this.IsAbleToHitBack && this.ManACurPos === this.ManAHitPos;

    if (this.ManACurPos === 'A3') {
      if (hit) {
        this.IsAbleToHitBack = false;
        this.MissHitInfo = Miss.None;
        this.manA.setEnabled(false); this.manAA3.setEnabled(true);
        /* the rest of the incoming flight is compressed into 0.207 s */
        this.FromBallTrailAnimDelay = 0.207 / (this.hitBackEndFrame - this.curSpriteIndex);
        const seq = this.ManAA3SwingSequenceTmp;
        for (let i = 0; i < seq.length; i++) {
          if (g !== this.gen) return;
          if (i === 6) { Audio_.play('Hit1'); this.IsHitBack = true; }
          this.manAA3.setSprite(seq[i]);
          if (!await this.waitP(0.023)) return;
        }
        this.IsHitBack = false;
        if (!await this.waitP(0.023)) return;
      } else {
        /* [sic] the A3 branch tests SequenceState > Lose for TooLate, the
           A1/A2 branch below tests == Lose.  0x21A60 vs 0x21C40. */
        if (this.ManACurPos !== this.ManAHitPos) this.MissHitInfo = Miss.WrongSide;
        else if (this.SequenceState > SeqState.Lose) this.MissHitInfo = Miss.TooLate;
        else if (this.curSpriteIndex < this.hitBackStartFrame) this.MissHitInfo = Miss.TooEarly;
        this.manA.setEnabled(false); this.manAA3.setEnabled(true);
        const seq = this.ManAA3SwingSequenceTmp;
        for (let i = 0; i < seq.length; i++) {
          if (g !== this.gen) return;
          this.manAA3.setSprite(seq[i]);
          if (!await this.waitP(0.023)) return;
        }
        this.IsHitBack = false;
        if (!await this.waitP(0.023)) return;
      }
      this.manA.setEnabled(true); this.manAA3.setEnabled(false);
      this.manA.setSprite(this.ManASwingSequenceTmp[0]);
    } else {
      if (hit) {
        /* [sic] unlike A3 this branch flags the hit before the swing plays and
           never rescales FromBallTrailAnimDelay -- 0x21BA0 */
        this.IsHitBack = true;
        this.IsAbleToHitBack = false;
        this.MissHitInfo = Miss.None;
        Audio_.play('Hit1');                          // Audios.PingPongPlayer
      } else {
        if (this.ManACurPos !== this.ManAHitPos) this.MissHitInfo = Miss.WrongSide;
        else if (this.SequenceState === SeqState.Lose) this.MissHitInfo = Miss.TooLate;
        else if (this.curSpriteIndex < this.hitBackStartFrame) this.MissHitInfo = Miss.TooEarly;
      }
      this.manA.setEnabled(true); this.manAA3.setEnabled(false);
      const seq = this.ManASwingSequenceTmp;
      for (let i = 0; i < seq.length; i++) {
        if (g !== this.gen) return;
        this.manA.setSprite(seq[i]);
        if (!await this.waitP(0.023)) return;
      }
      this.manA.setSprite(seq[0]);
    }
    this.IsInSwingColddown = false;
  }

  /* Core::ManBSwing (iterator 2) -- PingPongEnemy then 0.04 s a frame */
  async ManBSwing() {
    const g = this.gen;
    this.manB.setEnabled(true); this.manBB3.setEnabled(false);
    Audio_.play('Hit2');                              // Audios.PingPongEnemy
    const seq = this.ManBSwingSequenceTmp;
    for (let i = 0; i < seq.length; i++) {
      if (g !== this.gen) return;
      this.manB.setSprite(seq[i]);
      if (!await this.waitP(CTOR.ManBSwingAnimDelay)) return;
    }
    this.manB.setSprite(seq[0]);
  }

  /* Core::ManBTossBallAnim (iterator 0) */
  async ManBTossBallAnim() {
    const g = this.gen;
    for (const s of this.cfg.ManBTossBallSequence) {
      if (g !== this.gen) return;
      this.manB.setSprite(s);
      if (!await this.waitP(CTOR.ManBSwingAnimDelay)) return;
    }
  }

  ManBMove() { if (this.onManBMove) this.onManBMove(); }

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
      /* the READY / FIGHT dialogs; the scene wires the choreography */
      if (this.onReadyFight) this.onReadyFight();
      if (!await this.waitP(2.1)) return;
    }
    if (!await this.waitP(0.5)) return;

    this.ManBTossBallAnim();
    if (!await this.waitP(0.2)) return;

    this.ChangeTrailImage('TossBallTrail Image');
    this.BallTrailSequenceTmp = this.cfg.TossBallTrialSequence;
    for (let i = 0; i < this.BallTrailSequenceTmp.length; i++) {
      if (!alive()) return;
      this.trailSet(i);
      if (!await this.waitP(0.04)) return;
    }

    this.ManBSwing();
    this.ChangeTrailImage('FirstBallTrail Image');
    this.ChangeSequence('FirstBallTrail Image');

    for (let i = 0; i < this.BallTrailSequenceTmp.length; i++) {   // the serve
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
          /* [sic] assigned BlackB3 then immediately overwritten -- 0x2032C */
          this.ManBSwingSequenceTmp = this.cfg.BlackB3SwingSequence;
          this.ManBSwingSequenceTmp = this.cfg.BlackSwingSequence;
          this.ChangeSequence('Lose-B1-A1 Image');
          if (this.Lose_Delegate) this.Lose_Delegate();
          this.curSpriteIndex = 0;
        }
      }
      if (this.IsHitBack) {
        this.SequenceState = SeqState.To;
        this.IsHitBack = false;
        if (this.Set_ToBall_Delegate) this.Set_ToBall_Delegate();
        this.curSpriteIndex = 0;
        break;
      }
      if (!await this.waitP(0.028)) return;
    }

    for (;;) {                                            // the rally (IL_0616)
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
          if (this.Set_ToBall_Delegate) this.Set_ToBall_Delegate();
          this.curSpriteIndex = 0;
          if (!await this.waitP(this.FromBallTrailAnimDelay)) return;
          continue;                                   // no index++ on a transition
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
            if (this.Set_ToBall_Delegate) this.Set_ToBall_Delegate();
          } else {
            this.SequenceState = SeqState.Lose;
            this.ManAA3SwingSequenceTmp = this.cfg.BlackA3SwingSequence;
            this.ManASwingSequenceTmp = this.cfg.BlackSwingSequence;
            this.ManBSwingSequenceTmp = this.cfg.BlackB3SwingSequence;    // [sic]
            this.ManBSwingSequenceTmp = this.cfg.BlackSwingSequence;
            this.ChangeSequence(`Lose-${this.ManBCurPos}-${this.ManAHitPos} Image`);
            if (this.Lose_Delegate) this.Lose_Delegate();
          }
          this.curSpriteIndex = 0;
          if (!await this.waitP(this.FromBallTrailAnimDelay)) return;
          continue;
        }
        if (this.curSpriteIndex === this.touchManATableFrame) {
          if (this.Touch_ManA_Table_Delegate) this.Touch_ManA_Table_Delegate();
          Audio_.play('Hit2');                       // Audios.TouchTable
        }
        if (!await this.waitP(this.FromBallTrailAnimDelay)) return;

      } else if (this.SequenceState === SeqState.To) {
        this.trailSet(this.curSpriteIndex);
        if (this.ManBNextPos === 'B3') {
          if (this.curSpriteIndex === seq.length - 15) {
            if (this.Touch_ManB_Table_Delegate) this.Touch_ManB_Table_Delegate();
            this.ManBMove();
          }
        } else if (!this.IsSwingHard) {
          if (this.curSpriteIndex === last) {
            if (this.Touch_ManB_Table_Delegate) this.Touch_ManB_Table_Delegate();
            this.ManBMove();
          }
        } else if (this.curSpriteIndex === seq.length - 4) {
          if (this.Touch_ManB_Table_Delegate) this.Touch_ManB_Table_Delegate();
          this.ManBMove();
        }
        if (this.curSpriteIndex === last) {
          if (this.Set_FromBall_Delegate) this.Set_FromBall_Delegate();
          this.curSpriteIndex = 0;
          if (!await this.waitP(this.ToBallTrailAnimDelay)) return;
          continue;
        }
        if (!await this.waitP(this.ToBallTrailAnimDelay)) return;

      } else {                                          // Lose / ManBLose
        if (this.curSpriteIndex === last) { if (this.onRallyEnd) this.onRallyEnd(); return; }
        this.trailSet(this.curSpriteIndex);
        if (!await this.waitP(this.LoseBallTrailAnimDelay)) return;
      }

      while (this.IsGamePause && alive()) await wait(16);
      if (!alive()) return;
      this.curSpriteIndex++;
    }
  }
}

/* ======================================================== RivalModeModel */
class RivalModeModel {
  constructor() {
    this.levels = G.data.levels;
    this.groups = {};
    for (const g of G.data.groups)
      this.groups[g.GroupName] = { first: g.FirstVariationIndexs, second: g.SecondVariationIndexs };
    this.firstRoundData = { IsFromLeft: false, MovementType: MovementType.Normal, SpeedType: SpeedType.Nothing };
    this.curRoundData = this.firstRoundData;
    this.nextRoundData = this.firstRoundData;
    this.CurLevelGroupSequence = [];
  }

  /* RivalModeModel::LoadLevelProb 0x2EAA4, totalEnemyNum == 50 (a virgin save
     gets remote set "D" -- GameMgr::Init 0x27EC) */
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
    if (this.relaxIndex >= 1 && this.relaxIndex <= 4) { add(`Group_Relax${this.relaxIndex}`, this.Goal); return; }
    const g = this.Goal;
    let n = 0;
    for (const [name, p] of [['Group_Easy', this.groupEasyProb], ['Group_Normal', this.groupNormalProb],
                             ['Group_Middle', this.groupMiddleProb], ['Group_Hard', this.groupHardProb],
                             ['Group_Expert', this.groupExpertProb], ['Group_Extreme', this.groupExtremeProb]]) {
      const c = Math.trunc(p * g / 100); n += c; add(name, c);
    }
    const e = this.groupEasyProb, no = this.groupNormalProb, mi = this.groupMiddleProb,
          ha = this.groupHardProb, ex = this.groupExpertProb;
    for (; n < g; n++) {
      const r = randRange(0, 100);
      if (r < e) add('Group_Easy', 1);
      else if (r >= e && r < e + no) add('Group_Normal', 1);
      else if (r >= e + no && r < e + no + mi) add('Group_Middle', 1);
      else if (r >= e + no + mi && r < e + no + mi + ha) add('Group_Hard', 1);
      else if (r >= e + no + mi + ha && r < e + no + mi + ha + ex) add('Group_Expert', 1);
      /* [sic] the Group_Extreme band is `r >= sum && r < sum` -- its own
         probability was left out of the upper bound, so it never fires. */
    }
    this.Goal = this.CurLevelGroupSequence.length + 1;
  }

  Level_Goal() { return this.Goal; }

  /* RivalModeModel::BallData 0x2F4B0 */
  BallData(prev, fv, sv) {
    const d = { IsFromLeft: false, MovementType: 0, SpeedType: 0 };
    switch (fv) {
      case 1: d.MovementType = prev.MovementType; break;
      case 2:
        if (prev.MovementType === MovementType.Slow) d.MovementType = MovementType.Fast;
        else if (prev.MovementType === MovementType.Fast) d.MovementType = MovementType.Slow;
        break;
      case 3: d.IsFromLeft = !prev.IsFromLeft; d.MovementType = prev.MovementType; break;
      case 4:
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
      case 5: d.IsFromLeft = prev.IsFromLeft; d.SpeedType = SpeedType.Nothing; break;
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
    S.splice(S.indexOf(name), 1);
    this.curRoundData = round ? this.nextRoundData : this.BallData(this.firstRoundData, fv, sv);
    this.nextRoundData = this.BallData(this.curRoundData, fv, sv);
    return this.curRoundData;
  }
  Level_GetNextRoundData() { return this.nextRoundData; }
}

/* ===================================================== RivalModeAudiance
 * The crowd.  SetUpPattern 0x25474 places three rows and slides them up from
 * y = -1805; Audiance1/2/3Anim cycle their six-frame sequences at 0.04 s. */
class Audiance {
  constructor(scene) {
    this.scene = scene;
    this.cfg = scene.comp('Canvas/Audiance Group', 'RivalModeAudiance') || {};
    const N = r => (r && r.node) ? scene.n(r.node) : null;
    this.rows = [
      { seq: this.cfg.AudianceASeq || [], imgs: [N(this.cfg.AudianceA_1Image), N(this.cfg.AudianceA_2Image), N(this.cfg.AudianceA_3Image)] },
      { seq: this.cfg.AudianceBSeq || [], imgs: [N(this.cfg.AudianceB_1Image), N(this.cfg.AudianceB_2Image), N(this.cfg.AudianceB_3Image)] },
      { seq: this.cfg.AudianceCSeq || [], imgs: [N(this.cfg.AudianceC_1Image), N(this.cfg.AudianceC_2Image), N(this.cfg.AudianceC_3Image)] },
    ];
    this.group = scene.n('Canvas/Audiance Group');
    this.hideAll();
    if (this.group) this.group.setActive(false);
    this.gen = 0;
  }
  hideAll() { for (const r of this.rows) for (const i of r.imgs) if (i) i.setEnabled(false); }

  /* SetUpPattern 0x25474, pattern 0: one member per row, sliding up over 0.3 s
     from y = -1805 to -1079 / -1000 / -1030 (the no-banner layout) */
  SetUpPattern() {
    this.hideAll();
    const X = [-317, 0, 312], Y = [-1079, -1000, -1030];
    const SZ = [[387.8, 755.2], [370.5, 817], [467.7, 811.8]];
    const EASE = [27, 15, 27];
    for (let r = 0; r < 3; r++) {
      const img = this.rows[r].imgs[0];
      if (!img) continue;
      img.setEnabled(true);
      img.setColor([1, 1, 1, 1]);
      img.setSize(SZ[r][0], SZ[r][1]);
      img.setLocalPos(X[r], -1805);
      LT.moveLocalY(img, Y[r], 0.3).setEase(EASE[r]);
    }
  }

  Show() {                                          // RivalModeAudiance::Show 0x25B9F
    if (this.group) this.group.setActive(true);
    this.SetUpPattern();
    this.gen++;
    for (let r = 0; r < 3; r++) this.rowAnim(r, this.gen);
  }
  Hide() { this.gen++; if (this.group) this.group.setActive(false); }
  Pause(v) { this.paused = v; }

  async rowAnim(r, g) {
    const row = this.rows[r];
    if (!row.seq.length) return;
    for (;;) {
      for (let i = 0; i < row.seq.length; i++) {
        if (g !== this.gen) return;
        for (const im of row.imgs) if (im) im.setSprite(row.seq[i]);
        await wait(40);
        while (this.paused && g === this.gen) await wait(16);
      }
    }
  }
}

/* ====================================================== RivalModeSceneView
 * RivalModeScene (token 0x02000082).  Reset_EnterGame 0x34178 sets the stage
 * up, StartRun kicks the rally off, and WinAnim / LoseAnim close each ball. */
class RivalModeSceneView {
  constructor(host, mgr) {
    this.mgr = mgr;
    this.scene = new Scene('RivalModeScene', host);
    const s = this.scene;
    this.cfg = s.comp('', 'RivalModeScene') || {};
    this.bridgeCfg = s.comp('Canvas/BridgeGroupDavid', 'TestBridge') || {};
    this.roster = (G.data.arrays && G.data.arrays.TestEnemyDetail) || {};
    this.core = new Core(s, 'RivalModeScene');
    this.model = new RivalModeModel();
    this.audiance = new Audiance(s);
    const N = r => (r && r.node) ? s.n(r.node) : null;
    this.N = N;

    const C = this.cfg;
    this.bg = N(C.BgImage);
    this.hitL = N(C.HitLeftBtnImage);
    this.hitR = N(C.HitRightBtnImage);
    this.hitLShadow = N(C.HitLeftBtnShadowImage);
    this.hitRShadow = N(C.HitRightBtnShadowImage);
    this.hitLText = N(C.HitLeftBtnText);
    this.hitRText = N(C.HitRightBtnText);
    this.playerPad = N(C.PlayerScorePadImage);
    this.enemyPad = N(C.EnemyScorePadImage);
    this.playerScoreText = N(C.PlayerScoreText);
    this.enemyScoreText = N(C.EnemyScoreText);
    this.dotText = N(C.DotText);
    this.winLoseText = N(C.WinLoseBallText);
    this.missText = N(C.MissNotificationText);
    this.padBgs = ['PlayerScoreTopGroupBgImage', 'PlayerScoreBottomGroupBgImage',
                   'PlayerScoreLongGroupBgImage', 'EnemyScoreTopGroupBgImage',
                   'EnemyScoreBottomGroupBgImage', 'EnemyScoreLongGroupBgImage']
                  .map(k => N(C[k])).filter(Boolean);
    this.BgColors = C.BgColors || ['FFCB39'];

    this.hideChrome();
    this.wire();
  }
  destroy() { this.core.StopRun(); this.audiance.Hide(); this.scene.destroy(); }

  hideChrome() {
    const s = this.scene;
    s.hide('Canvas/Bridge Group', 'Canvas/BridgeGroupDavid', 'Canvas/TournamentBridgeGroup',
           'Canvas/Share Group', 'Canvas/Revive Group', 'Canvas/Preview Image',
           'Canvas/FingerTouch Image', 'Canvas/GameHackWin Image', 'Canvas/GameHackLose Image',
           'Canvas/Core/TapToRestart Text', 'Canvas/Core/HitNow Text',
           'Canvas/Core/Table Image/HitOnTableNotification Image',
           'Canvas/Core/ManA Group/ManA Image/SweetSpot Group',
           'Canvas/Top Group/ReviveScorePad Image', 'Canvas/Top Group/ReviveFinger Image',
           'Canvas/Top Group/PlayerScorePad Group/PlayerScoreTop Group',
           'Canvas/Top Group/PlayerScorePad Group/PlayerScoreBottom Group',
           'Canvas/Top Group/EnemyScorePadTotal Group/EnemyScoreTop Group',
           'Canvas/Top Group/EnemyScorePadTotal Group/EnemyScoreBottom Group',
           /* the tap-effect masks, shown only while a touch is being shown */
           'Canvas/Core/LeftTouch Mask', 'Canvas/Core/RightTouch Mask',
           'Canvas/Core/LeftTouchGround Mask', 'Canvas/Core/RightTouchGround Mask',
           'Canvas/Core/ManBLeftTouchGround Mask', 'Canvas/Core/ManBRightTouchGround Mask');
    for (const n of [this.core.manAWinLose, this.core.manBWinLose,
                     this.core.manASurprise, this.core.manBSurprise]) if (n) n.setEnabled(false);
    if (this.core.manAA3) this.core.manAA3.setEnabled(false);
    if (this.core.manBB3) this.core.manBB3.setEnabled(false);
    if (this.core.readyDialog) this.core.readyDialog.setActive(false);
    if (this.core.fightDialog) this.core.fightDialog.setActive(false);
  }

  hex(h) {                                          // OGGameUtil::HexToColor
    const v = p => parseInt(h.substr(p, 2), 16) / 255;
    return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 1];
  }

  TouchBlockEnable(v) { this.touchBlocked = v; }     // 0x3115C
  get trails() { return this.core.trails; }

  /* The tutorial runs over a rival scene that has NOT been entered: the stage
     is dressed but Reset_EnterGame has not fired, so no rally is running. */
  prepareForTutorial() {
    const c = this.core;
    this.stageOrder = 0;
    this.TouchBlockEnable(true);
    const col = this.hex(this.BgColors[0]);
    if (this.bg) this.bg.setColor(col);
    for (const n of this.padBgs) n.setColor(col);
    c.reset();
    if (c.table) { c.table.setColor([1, 1, 1, 1]); c.table.setSprite(c.cfg.NormalTableSprite); }
    if (c.manA) { c.manA.setColor([1, 1, 1, 1]); c.manA.setEnabled(true); c.manA.setSprite(c.cfg.NormalSwingSequence[0]); }
    if (c.manB) { c.manB.setColor([1, 1, 1, 1]); c.manB.setEnabled(true); c.manB.setSprite(c.cfg.NormalSwingSequence[0]); c.manB.setLocalPos(543.93, 489.1); }
    if (c.manBFirstLook) c.manBFirstLook.setEnabled(false);
    if (c.nameLine1) c.nameLine1.setEnabled(false);
    if (c.nameLine2) c.nameLine2.setEnabled(false);
    if (c.remainBall) c.remainBall.setActive(false);
    for (const n of [this.playerPad, this.enemyPad, this.playerScoreText,
                     this.enemyScoreText, this.dotText]) if (n) n.setAlpha(0);
    if (this.winLoseText) this.winLoseText.setEnabled(false);
    this.HideHitBtn();
    this.placeManA('A1');
  }

  /* RivalModeScene::ShowHitBtn 0x33F0C -- the HIT L / HIT R prompts */
  ShowHitBtn(alpha) {
    for (const n of [this.hitL, this.hitR]) if (n) LT.alpha(n, alpha, 0.5).setEase(14);
    for (const n of [this.hitLShadow, this.hitRShadow]) if (n) LT.alpha(n, 0.2 * alpha, 0.5).setEase(15);
    for (const n of [this.hitLText, this.hitRText]) if (n) LT.alpha(n, alpha, 0.5).setEase(14);
  }
  HideHitBtn() {
    for (const n of [this.hitL, this.hitR, this.hitLShadow, this.hitRShadow,
                     this.hitLText, this.hitRText]) if (n) LT.alpha(n, 0, 0.3);
  }
  btnDown(left) {                                    // LeftBtnDownAnim 0x33EA0
    const n = left ? this.hitL : this.hitR;
    if (!n) return;
    LT.scale(n, 0.92, 0.06).setEase(15);
    LT.delayedCall(0.06, () => LT.scale(n, 1, 0.12).setEase(27));
  }

  /* three balls win a match for the first five rivals, five after that --
     the rule alerts Reset_EnterGame raises say exactly that */
  get matchGoal() { return this.stageOrder > 4 ? 5 : 3; }

  /* RivalModeScene::Reset_EnterGame 0x34178 */
  Reset_EnterGame(stageOrder) {
    this.stageOrder = stageOrder;
    this.TouchBlockEnable(true);
    const col = this.hex(this.BgColors[stageOrder % 5]);
    if (this.bg) this.bg.setColor(col);
    for (const n of this.padBgs) n.setColor(col);

    const c = this.core;
    c.reset();
    if (c.manB) { c.manB.setColor([1, 1, 1, 1]); c.manB.setLocalPos(543.93, 489.1); }
    if (c.manA) c.manA.setColor([1, 1, 1, 0]);
    if (c.manBFirstLook) c.manBFirstLook.setColor([1, 1, 1, 0]);
    if (c.table) c.table.setColor([1, 1, 1, 0]);
    if (c.nameLine1) c.nameLine1.setColor(this.hex('16161600'));
    if (c.nameLine2) c.nameLine2.setColor(this.hex('16161600'));

    /* the rival: portrait, rank and name, counted down from the roster's end */
    const total = this.bridgeCfg.totalEnemyNum || 50;
    const idx = total - stageOrder;
    const sprites = (this.bridgeCfg.TestBridgeSprites || []).filter(Boolean);
    const names = this.roster.RivalModeEnemyName || [];
    if (c.manBFirstLook && sprites.length) c.manBFirstLook.setSprite(sprites[idx % sprites.length]);
    if (c.nameLine1) c.nameLine1.setText('#' + idx);
    if (c.nameLine2) c.nameLine2.setText(names[idx] || '');
    if (c.manBFirstLook) { c.manBFirstLook.setSize(319, 428); c.manBFirstLook.setEnabled(true); }
    if (c.manB) c.manB.setEnabled(false);
    if (c.manA) c.manA.setEnabled(true);
    if (c.nameLine1) c.nameLine1.setEnabled(true);
    if (c.nameLine2) c.nameLine2.setEnabled(true);
    c.IsAbleToHitBack = false; c.IsHitBack = false;

    this.PlayerScore = 0; this.EnemyScore = 0; this.RoundCount = 0;
    this.updateScore();
    for (const n of [this.playerPad, this.enemyPad, this.playerScoreText,
                     this.enemyScoreText, this.dotText]) if (n) n.setAlpha(0);
    if (this.winLoseText) this.winLoseText.setEnabled(false);
    if (this.missText) this.missText.setAlpha(0);

    this.model.LoadLevelProb(stageOrder * 5 + this.PlayerScore + 1);
    this.bindCore();
    this.audiance.Hide();

    LT.delayedCall(0.7, () => {                        // <Reset_EnterGame>m__15
      if (c.table) LT.alpha(c.table, 1, 0.2);
    });
    LT.delayedCall(0.8, () => {                        // <Reset_EnterGame>m__16
      if (c.manBFirstLook) LT.alpha(c.manBFirstLook, 1, 0.4);
      if (c.manA) LT.alpha(c.manA, 1, 0.4);
      if (c.nameLine1) LT.alpha(c.nameLine1, 1, 0.4);
      if (c.nameLine2) LT.alpha(c.nameLine2, 1, 0.4);
      LT.delayedCall(1, () => this.m__1D());
    });
  }

  m__1D() {                                            // 0x35A90
    if (this.mgr.settings) this.mgr.settings.SettingBtnShow(0.1);
    this.core.StartRun(true);
    LT.delayedCall(2.35, () => this.m__23());
  }
  m__23() {                                            // 0x35C5C
    const c = this.core;
    if (c.manBFirstLook) {
      const y = c.manBFirstLook.localPos[1];
      LT.moveLocalY(c.manBFirstLook, y + 30, 0.05).setLoopPingPong(1)
        .setOnComplete(() => {                         // <Reset_EnterGame>m__25
          c.manBFirstLook.setEnabled(false);
          if (c.manB) c.manB.setEnabled(true);
        });
    }
    for (const n of [this.playerPad, this.enemyPad, this.playerScoreText,
                     this.enemyScoreText, this.dotText]) if (n) LT.alpha(n, 1, 0.2);
    this.TouchBlockEnable(false);
    this.ShowHitBtn(1);
  }

  bindCore() {
    const c = this.core;
    c.Set_FromBall_Delegate = () => this.SetFromBall();
    c.Set_ToBall_Delegate = () => this.SetToBall();
    c.Lose_Delegate = () => this.Lose();
    c.Touch_ManA_Table_Delegate = () => this.Touch_ManA_Table();
    c.Touch_ManB_Table_Delegate = () => this.Touch_ManB_Table();
    c.onRallyEnd = () => this.onRallyEnd();
    c.onReadyFight = () => this.readyFight();
    c.onManBMove = () => this.ManBMove();
  }

  /* READY / FIGHT -- <BallTrailAnim>c__Iterator1 <>m__0 .. <>m__8, 0x23690 on.
     Ready sits at (384,735), Fight at (-256,735); both ship inactive and are
     parked back at (384,735) when the pair is done. */
  readyFight() {
    const c = this.core;
    const ready = c.readyDialog, fight = c.fightDialog;
    const readyTxt = this.scene.n('Canvas/Core/ReadyDialog Image/Ready Text');
    const fightTxt = this.scene.n('Canvas/Core/FightDialog Image/Fight Text');
    if (!ready || !fight) return;
    ready.setActive(true); fight.setActive(true);
    ready.setLocalPos(384, 735); fight.setLocalPos(-256, 735);
    ready.setAlpha(0); fight.setAlpha(0);
    if (readyTxt) readyTxt.setAlpha(0);
    if (fightTxt) fightTxt.setAlpha(0);

    LT.delayedCall(0.6, () => {                        // <>m__0
      if (c.nameLine1) LT.alpha(c.nameLine1, 0, 0.25);
      if (c.nameLine2) LT.alpha(c.nameLine2, 0, 0.25);
    });
    LT.delayedCall(0.6, () => {                        // <>m__1
      LT.delayedCall(0.1, () => {                      // <>m__2
        LT.alpha(ready, 1, 0.6).setEase(15);
        if (readyTxt) { readyTxt.setText('READY'); LT.alpha(readyTxt, 1, 0.6).setEase(15); }
      });
      LT.moveLocalX(ready, 0, 0.4).setEase(15).setOnComplete(() => {          // <>m__3
        LT.delayedCall(0.1, () => {                                           // <>m__4
          LT.moveLocalX(ready, -100, 0.3).setOnComplete(() => {               // <>m__5
            LT.moveLocalX(ready, -2000, 0.8).setEase(15);
            LT.alpha(ready, 0, 0.1);
            if (readyTxt) LT.alpha(readyTxt, 0, 0.1);
          });
          LT.delayedCall(0.7, () => {                                         // <>m__6
            LT.alpha(fight, 1, 0.3).setEase(15);
            if (fightTxt) LT.alpha(fightTxt, 1, 0.3).setEase(15);
            LT.moveLocalX(fight, 0, 0.3).setEase(12).setOnComplete(() => {     // <>m__7
              LT.delayedCall(0.3, () => {                                      // <>m__8
                fight.setColor(this.hex('FFFFFF00'));
                if (fightTxt) fightTxt.setColor(this.hex('16161600'));
                ready.setLocalPos(384, 735); fight.setLocalPos(384, 735);
                ready.setActive(false); fight.setActive(false);
              });
            });
          });
        });
      });
    });
  }

  standing() { return this.stageOrder > 1 ? STAND_GALAXY : STAND_NORMAL; }

  /* RivalModeScene::SetFromBall 0x30778 */
  SetFromBall() {
    const c = this.core, m = this.model;
    c.ManBCurPos = c.ManBNextPos;
    if (m.Level_Goal() - this.RoundCount === 0) {
      c.SequenceState = SeqState.ManBLose;
      c.ChangeTrailImage(`Lose-${c.ManAHitPos}-${c.ManBNextPos} Image`);
      c.ChangeSequence(`Lose-${c.ManAHitPos}-${c.ManBNextPos} Image`);
      c.LoseBallTrailAnimDelay = 0.04;
      this.PlayerScore++;
      this.won = true;
      this.WinAnim();
      return;
    }
    c.SequenceState = SeqState.From;
    this.CurRoundData = m.Level_GetRoundDataAndDelete(this.RoundCount);
    this.MiddleFrameInterval = m.middleFrameInterval;
    this.PlayerSideFrameInterval = m.playerSideFrameInterval;

    const tbl = this.standing();
    const e = tbl[c.ManBCurPos] || tbl.B1;
    c.ManAHitPos = this.CurRoundData.IsFromLeft ? e.L : e.R;
    if (c.ManBCurPos === 'B2') c.ManAHitPos = (randRange(1, 4) < 2) ? 'A3' : 'A1';
    if (c.ManBCurPos === 'B2' || c.ManBCurPos === 'B3') {
      this.CurRoundData.MovementType = MovementType.Fast;
      this.CurRoundData.SpeedType = SpeedType.Nothing;
      c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.85;
    }
    if (this.CurRoundData.MovementType === MovementType.Slow) {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos}-Slow Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      LT.value(this.MiddleFrameInterval * 0.4, this.MiddleFrameInterval,
               this.MiddleFrameInterval * 6, v => { c.FromBallTrailAnimDelay = v; });
    } else {
      const nm = `From-${c.ManBCurPos}-${c.ManAHitPos} Image`;
      c.ChangeTrailImage(nm); c.ChangeSequence(nm);
      if (this.CurRoundData.SpeedType === SpeedType.ImpulseEaseOut) {
        const o = this.stageOrder;
        let k, ps = 0.7;
        if (o <= 3) k = 0.4; else if (o <= 5) k = 0.3; else if (o <= 7) k = 0.27;
        else { k = 0.24; ps = 0.64; }
        c.FromBallTrailAnimDelay = this.MiddleFrameInterval * k;
        this.PlayerSideFrameInterval *= ps;
      } else {
        c.FromBallTrailAnimDelay = this.MiddleFrameInterval * 0.9;
        this.PlayerSideFrameInterval *= 0.9;
      }
    }
    this.updateRemain();
  }

  /* RivalModeScene::SetToBall 0x30B60 */
  SetToBall() {
    const c = this.core, m = this.model;
    this.RoundCount++;
    this.NextRoundData = m.Level_GetNextRoundData();
    if (m.Level_Goal() - this.RoundCount === 0) c.IsManBLoseAtThisRound = true;
    const v = randRange(0, 2);
    const tbl = this.standing();
    const e = tbl[c.ManAHitPos] || tbl.A1;             // keyed on ManAHitPos (m__8)
    c.ManBNextPos = v === 0 ? e.L : e.R;
    if (c.ManAHitPos === 'A2') c.ManBNextPos = 'B1';
    c.IsSwingHard = (this.NextRoundData.MovementType !== MovementType.Slow) ||
                    (c.ManBNextPos === 'B3');
    const nm = `To-${c.ManAHitPos}-${c.ManBNextPos} Image`;
    c.ChangeTrailImage(nm); c.ChangeSequence(nm);
    /* the sweet spot: meeting the ball in the window's first six frames sends
       it back at 0.4x the interval and thumps */
    if (c.curSpriteIndex < c.hitBackStartFrame + 6) {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.4;
      this.isHitSweetSpot = true;
      Audio_.play('HardHit');                          // Audios.ManAUseForce
    } else {
      c.ToBallTrailAnimDelay = m.middleFrameInterval * 0.7;
      this.isHitSweetSpot = false;
    }
    this.updateRemain();
  }

  /* RivalModeScene::Touch_ManA_Table 0x30EAC */
  Touch_ManA_Table() {
    const c = this.core;
    let k = 1;
    if (c.ManAHitPos === 'A3') {
      if (this.stageOrder < 8) k = c.ManBCurPos === 'B3' ? 1.0 : c.ManBCurPos === 'B2' ? 1.3 : null;
      else                     k = c.ManBCurPos === 'B3' ? 1.1 : c.ManBCurPos === 'B2' ? 1.45 : null;
      if (k === null) return;
    }
    c.FromBallTrailAnimDelay = this.PlayerSideFrameInterval * k;
  }
  /* RivalModeScene::Touch_ManB_Table 0x30FD4 -- [sic] both arms of the
     isHitSweetSpot test apply the same 1.1 */
  Touch_ManB_Table() { this.core.ToBallTrailAnimDelay = this.model.middleFrameInterval * 1.1; }

  /* the opponent hops between B1/B2/B3 */
  ManBMove() {
    const c = this.core;
    if (!c.manB) return;
    const X = { B1: 543.93, B2: 180, B3: 900 };
    const x = X[c.ManBNextPos] !== undefined ? X[c.ManBNextPos] : 543.93;
    LT.moveLocal(c.manB, x, c.manB.localPos[1], 0.18).setEase(15);
  }

  /* RivalModeScene::Lose 0x30E2C */
  Lose() {
    this.EnemyScore++;
    this.lost = true;
    this.LoseAnim();
  }

  updateScore() {
    if (this.playerScoreText) this.playerScoreText.setText(String(this.PlayerScore));
    if (this.enemyScoreText) this.enemyScoreText.setText(String(this.EnemyScore));
  }
  updateRemain() {
    const c = this.core;
    if (c.remainBall) { c.remainBall.setActive(true); c.remainBall.setAlpha(1); }
    if (c.remainBallText) {
      c.remainBallText.setColor(this.hex('161616FF'));
      c.remainBallText.setText('x ' + Math.max(0, this.model.Level_Goal() - this.RoundCount));
    }
  }

  banner(txt) {
    if (!this.winLoseText) return;
    this.winLoseText.setText(txt);
    this.winLoseText.setLocalPos(0, 740.25);
    this.winLoseText.setEnabled(true);
    this.winLoseText.setAlpha(1);
  }

  /* RivalModeScene/<WinAnim>c__Iterator1 */
  WinAnim() {
    const c = this.core;
    Audio_.play('Herray', 0.8);
    if (c.manAWinLose) { c.manAWinLose.setSprite(c.cfg.NormalWinSprite); }
    const matchWon = this.PlayerScore >= this.matchGoal;
    this.banner(matchWon ? 'WIN A MATCH' : 'WIN A POINT');
    this.updateScore();
    if (this.playerPad) LT.scale(this.playerPad, 1.2, matchWon ? 0.6 : 0.1)
      .setEase(matchWon ? 30 : 1).setLoopPingPong(matchWon ? 0 : 1);
    if (matchWon) this.audiance.Show(0);
    if (c.manBSurprise) {
      c.manBSurprise.setEnabled(true);
      c.manBSurprise.setLocalScale(0.2, 0.2);
      LT.scale(c.manBSurprise, [3, 2.4], 0.3).setEase(24);
    }
  }

  /* RivalModeScene/<LoseAnim>c__Iterator0 -- the screen inverts to #161616 */
  LoseAnim() {
    const c = this.core;
    Audio_.play('Lose');
    const black = this.hex('161616FF');
    if (this.bg) this.bg.setColor(black);
    for (const n of this.padBgs) n.setColor(black);
    for (const n of [this.playerPad, this.enemyPad]) if (n) n.setColor([1, 1, 1, 1]);
    for (const n of [this.playerScoreText, this.enemyScoreText, this.dotText])
      if (n) n.setColor([1, 1, 1, 1]);
    this.updateScore();
    const matchLost = this.EnemyScore >= this.matchGoal;
    if (this.winLoseText) this.winLoseText.setColor([1, 1, 1, 1]);
    this.banner(matchLost ? 'LOSE A MATCH' : 'LOSE A POINT');
    if (c.manASurprise) {
      c.manASurprise.setEnabled(true);
      c.manASurprise.setLocalScale(0.2, 0.2);
      LT.scale(c.manASurprise, [3, 2.4], 0.3).setEase(24);
    }
    if (this.missText) {
      const s = ['Tapped too late!', 'Tapped too early!', 'Wrong side!', ''][c.MissHitInfo];
      this.missText.setText(s);
      this.missText.setColor(this.hex('161616FF'));
      LT.alpha(this.missText, 1, 0.2);
      LT.delayedCall(1.0, () => LT.alpha(this.missText, 0, 0.3));
    }
  }

  onRallyEnd() {
    const won = this.won, lost = this.lost;
    this.won = this.lost = false;
    LT.delayedCall(0.9, () => {
      const c = this.core;
      if (c.manASurprise) c.manASurprise.setEnabled(false);
      if (c.manBSurprise) c.manBSurprise.setEnabled(false);
      if (this.winLoseText) this.winLoseText.setEnabled(false);
      if (won && this.PlayerScore >= this.matchGoal) { this.mgr.onMatchWon(this.stageOrder); return; }
      if (lost && this.EnemyScore >= this.matchGoal) { this.mgr.onMatchLost(this.stageOrder); return; }
      this.Reset_WinBall();
    });
  }

  /* RivalModeScene::Reset_WinBall 0x33964 */
  Reset_WinBall() {
    const c = this.core;
    c.ManACurPos = 'A1'; c.ManBCurPos = 'B1'; c.ManAHitPos = 'A1'; c.ManBNextPos = 'B1';
    c.manA.setEnabled(true); c.manAA3.setEnabled(false);
    c.manA.setSprite(c.cfg.NormalSwingSequence[0]);
    c.manB.setSprite(c.cfg.NormalSwingSequence[0]);
    c.manB.setLocalPos(543.93, 489.1);
    this.placeManA('A1');
    /* the colours come back after a lost ball */
    const col = this.hex(this.BgColors[this.stageOrder % 5]);
    if (this.bg) this.bg.setColor(col);
    for (const n of this.padBgs) n.setColor(col);
    const dark = this.hex('161616FF');
    for (const n of [this.playerPad, this.enemyPad]) if (n) n.setColor([1, 1, 1, 1]);
    for (const n of [this.playerScoreText, this.enemyScoreText, this.dotText]) if (n) n.setColor(dark);
    if (this.winLoseText) this.winLoseText.setColor(dark);
    if (this.playerPad) this.playerPad.setLocalScale(1, 1);
    this.RoundCount = 0;
    this.model.LoadLevelProb(this.stageOrder * 5 + this.PlayerScore + 1);
    this.updateScore(); this.updateRemain();
    c.reset();
    this.bindCore();
    c.StartRun(false);
  }

  /* ManA's home positions -- GoLeft 0x33288 / GoRight 0x334B8 */
  placeManA(pos) {
    const n = this.core.manA;
    if (n) n.setLocalPos(pos === 'A1' ? -387.6 : 0, -240);
  }

  GoLeft() {
    const c = this.core;
    if (this.touchBlocked || c.IsInSwingColddown) return;
    c.IsInSwingColddown = true;
    c.ManASwingSequenceTmp = (c.SequenceState === SeqState.Lose)
      ? c.cfg.BlackSwingSequence : c.cfg.NormalSwingSequence;
    const from = c.ManACurPos;
    c.ManACurPos = 'A1';
    this.btnDown(true);
    if (from === 'A1') c.ManASwing();
    else { this.placeManA('A1'); LT.delayedCall(0.05, () => c.ManASwing()); }
  }
  GoRight() {
    const c = this.core;
    if (this.touchBlocked || c.IsInSwingColddown) return;
    c.IsInSwingColddown = true;
    const from = c.ManACurPos;
    this.btnDown(false);
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

  Pause(v) { this.core.Pause(v); this.audiance.Pause(v); }

  wire() {
    this.onPointer = (x, y) => {
      const st = $('#stage').getBoundingClientRect();
      if (x - st.left < st.width / 2) this.GoLeft(); else this.GoRight();
    };
  }
}

Object.assign(window, { Core, RivalModeModel, Audiance, RivalModeSceneView,
                        SeqState, Miss, MovementType, SpeedType, CTOR,
                        STAND_NORMAL, STAND_GALAXY });
