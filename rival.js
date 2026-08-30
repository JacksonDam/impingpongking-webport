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

  /* Core::ManBMove 0x21AC0.  B1 sits at (543.93, 489.1); B2 and B3 both sit at
     (195, 489.1).  If the rival is already where the ball is going he just
     swings; otherwise he hops there in 0.05 s on easeOutBack and swings on
     arrival.  B3 uses the B3 swing, the others the hard or normal one. */
  ManBMove() {
    const swing = () => {
      if (this.ManBNextPos === 'B3') this.ManBB3Swing();
      else if (this.IsSwingHard) this.ManBSwingHard();
      else this.ManBSwing();
    };
    if (this.ManBCurPos !== this.ManBNextPos) {
      const x = (this.ManBNextPos === 'B1') ? 543.93 : 195;
      if (this.manB) LT.moveLocal(this.manB, x, 489.1, 0.05).setEase(27).setOnComplete(swing);
      else swing();
    } else {
      swing();
    }
  }

  /* Core::ManBSwingHard (iterator 3) -- the same frames, faster */
  async ManBSwingHard() {
    const g = this.gen;
    this.manB.setEnabled(true); this.manBB3.setEnabled(false);
    Audio_.play('Hit2');
    const seq = this.ManBSwingSequenceTmp;
    for (let i = 0; i < seq.length; i++) {
      if (g !== this.gen) return;
      this.manB.setSprite(seq[i]);
      if (!await this.waitP(0.023)) return;
    }
    this.manB.setSprite(seq[0]);
  }

  /* Core::ManBB3Swing (iterator 4) -- the B3 art on its own image */
  async ManBB3Swing() {
    const g = this.gen;
    this.manB.setEnabled(false); this.manBB3.setEnabled(true);
    Audio_.play('Hit2');
    const seq = this.ManBB3SwingSequenceTmp;
    for (let i = 0; i < seq.length; i++) {
      if (g !== this.gen) return;
      this.manBB3.setSprite(seq[i]);
      if (!await this.waitP(CTOR.ManBSwingAnimDelay)) return;
    }
    this.manB.setEnabled(true); this.manBB3.setEnabled(false);
    this.manB.setSprite(this.ManBSwingSequenceTmp[0]);
  }

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
    this.UsedGroupSequence = [];
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
    this.UsedGroupSequence = [];
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
    (this.UsedGroupSequence = this.UsedGroupSequence || []).push(name);
    this.curRoundData = round ? this.nextRoundData : this.BallData(this.firstRoundData, fv, sv);
    this.nextRoundData = this.BallData(this.curRoundData, fv, sv);
    return this.curRoundData;
  }
  Level_GetNextRoundData() { return this.nextRoundData; }

  /* RivalModeModel::RemakeLevelGroupSequence -- a revive puts every ball the
     match has already used back into the bag */
  RemakeLevelGroupSequence() {
    for (const n of (this.UsedGroupSequence || [])) this.CurLevelGroupSequence.push(n);
    this.UsedGroupSequence = [];
  }

  /* RivalModeModel::Init 0x2E9xx -- rebuilds the group dictionary from the two
     baked JSON blobs.  Idempotent; the scenes call it on every entry. */
  Init() {
    this.groups = {};
    for (const g of G.data.groups)
      this.groups[g.GroupName] = { first: g.FirstVariationIndexs, second: g.SecondVariationIndexs };
    this.UsedGroupSequence = [];
  }

  /* RivalModeModel::Endless_MakeBallList 0x2F7xx -- Reverse mode does not read
     the level table at all; it mixes one fixed bag of thirty balls. */
  Endless_MakeBallList() {
    this.groupEasyProb = 20; this.groupNormalProb = 10; this.groupMiddleProb = 20;
    this.groupHardProb = 20; this.groupExpertProb = 10; this.groupExtremeProb = 20;
    this.Goal = 30;
    this.relaxIndex = 0;
    this.enemySideFrameInterval = 0.05;
    this.playerSideFrameInterval = 0.05;
    this.middleFrameInterval = 0.03;
    const S = this.CurLevelGroupSequence = [];
    this.UsedGroupSequence = [];
    const add = (g, n) => { for (let i = 0; i < n; i++) S.push(g); };
    const g = this.Goal;
    const bands = [['Group_Easy', this.groupEasyProb], ['Group_Normal', this.groupNormalProb],
                   ['Group_Middle', this.groupMiddleProb], ['Group_Hard', this.groupHardProb],
                   ['Group_Expert', this.groupExpertProb], ['Group_Extreme', this.groupExtremeProb]];
    let n = 0;
    for (const [name, p] of bands) { const c = Math.trunc(p * g / 100); n += c; add(name, c); }
    const e = this.groupEasyProb, no = this.groupNormalProb, mi = this.groupMiddleProb,
          ha = this.groupHardProb, ex = this.groupExpertProb;
    /* [sic] the loop counter starts from the tally above but is compared with
       Goal, and the Group_Extreme band is again `r >= sum && r < sum`, so it
       never fires -- the same two slips as LoadLevelProb 0x2EAA4. */
    for (; n < g; n++) {
      const r = randRange(0, 100);
      if (r < e) add('Group_Easy', 1);
      else if (r >= e && r < e + no) add('Group_Normal', 1);
      else if (r >= e + no && r < e + no + mi) add('Group_Middle', 1);
      else if (r >= e + no + mi && r < e + no + mi + ha) add('Group_Hard', 1);
      else if (r >= e + no + mi + ha && r < e + no + mi + ha + ex) add('Group_Expert', 1);
    }
    this.Goal = this.CurLevelGroupSequence.length + 1;
  }

  /* RivalModeModel::Endless_GetRoundDataAndDelete 0x2F9EC -- the same body as
     the Level_ version but it also files the group away in UsedGroupSequence */
  Endless_GetRoundDataAndDelete(round) {
    const S = this.CurLevelGroupSequence;
    if (!S.length) { this.curRoundData = this.nextRoundData; return this.curRoundData; }
    const name = S[randRange(0, S.length)];
    const g = this.groups[name];
    const fv = g.first[randRange(0, g.first.length)];
    const sv = g.second[randRange(0, g.second.length)];
    S.splice(S.indexOf(name), 1);
    (this.UsedGroupSequence = this.UsedGroupSequence || []).push(name);
    this.curRoundData = round ? this.nextRoundData : this.BallData(this.firstRoundData, fv, sv);
    this.nextRoundData = this.BallData(this.curRoundData, fv, sv);
    return this.curRoundData;
  }
  Endless_GetNextRoundData() { return this.nextRoundData; }
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
  /* gameMode 1 = the 50-rival career, 2 = the Orangenose Tournament.  The APK
     runs both through this one scene; GameMgr.curGameMode picks the bridge,
     the roster and the background palette. */
  constructor(host, mgr, gameMode) {
    this.mgr = mgr;
    this.gameMode = gameMode || 1;
    this.tour = this.gameMode === 2;
    this.scene = new Scene('RivalModeScene', host);
    const s = this.scene;
    this.cfg = s.comp('', 'RivalModeScene') || {};
    this.bridgeCfg = s.comp(this.tour ? 'Canvas/TournamentBridgeGroup' : 'Canvas/BridgeGroupDavid',
                            this.tour ? 'TournamentBridge' : 'TestBridge') || {};
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

    this.bridge = new BridgeView(s, mgr, this.tour ? 'tournament' : 'test');
    this.revive = new ReviveView(s, mgr);
    this.revive.onReward = () => this.Revive_VideoReward();
    this.revive.onNoThanks = () => this.Revive_NoThanksClick();
    this.hideChrome();
    this.wire();
  }
  destroy() { this.core.StopRun(); this.audiance.Hide(); this.scene.destroy(); }

  hideChrome() {
    const s = this.scene;
    s.hide('Canvas/Bridge Group', 'Canvas/TournamentBridgeGroup',
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

  /* RivalModeScene::ShowHitBtn 0x34B68.  The buttons take
     HitBtnSprites[OutterStageOrder % 5], so they match the stage's background
     colour -- five buttons for the five backgrounds. */
  ShowHitBtn(alpha) {
    const spr = (this.cfg.HitBtnSprites || [])[this.bgIndex(this.stageOrder)];
    if (spr) { if (this.hitL) this.hitL.setSprite(spr); if (this.hitR) this.hitR.setSprite(spr); }
    for (const n of [this.hitL, this.hitR, this.hitLText, this.hitRText]) if (n) n.setEnabled(true);
    for (const n of [this.hitL, this.hitR]) if (n) LT.alpha(n, alpha, 0.5).setEase(14);
    for (const n of [this.hitLShadow, this.hitRShadow]) if (n) LT.alpha(n, 0.2 * alpha, 0.5).setEase(15);
    for (const n of [this.hitLText, this.hitRText]) if (n) LT.alpha(n, alpha, 0.5).setEase(14);
  }
  HideHitBtn() {
    for (const n of [this.hitL, this.hitR, this.hitLShadow, this.hitRShadow,
                     this.hitLText, this.hitRText]) if (n) LT.alpha(n, 0, 0.3);
  }

  /* LeftBtnDownAnim 0x34F1C / RightBtnDownAnim 0x34F74: the button drops 30 px
     over 0.05 s and its shadow goes out -- it is pressed into the page, not
     scaled.  LeftBtnUpAnim 0x34FCB puts it back at (-17.5,-742). */
  btnDown(left) {
    const n = left ? this.hitL : this.hitR;
    const sh = left ? this.hitLShadow : this.hitRShadow;
    if (!n) return;
    if (this._btnTween && this._btnTween[left ? 0 : 1]) this._btnTween[left ? 0 : 1].cancel();
    const t = LT.moveLocalY(n, n.localPos[1] - 30, 0.05);
    this._btnTween = this._btnTween || [];
    this._btnTween[left ? 0 : 1] = t;
    if (sh) sh.setEnabled(false);
    LT.delayedCall(0.12, () => this.btnUp(left));
  }
  btnUp(left) {
    const n = left ? this.hitL : this.hitR;
    const sh = left ? this.hitLShadow : this.hitRShadow;
    if (this._btnTween && this._btnTween[left ? 0 : 1]) this._btnTween[left ? 0 : 1].cancel();
    if (sh) sh.setEnabled(true);
    if (n) n.setLocalPos(left ? -17.5 : 17.5, -742);
  }

  /* three balls win a match for the first five rivals, five after that --
     the rule alerts Reset_EnterGame raises say exactly that.  The tournament
     keeps reading OutterStageOrder for this, so its six bouts inherit whatever
     the career reached (0x0631). */
  get matchGoal() { return (this.tour ? DB.data.OutterStageOrder : this.stageOrder) > 4 ? 5 : 3; }

  /* the tournament's palette starts ten steps along: BgColors[(10 + n) % 5] */
  bgIndex(stage) { return this.tour ? (10 + stage) % 5 : stage % 5; }
  bgHex(stage) { return this.BgColors[this.bgIndex(stage)]; }

  /* the challenger card: TestBridge::BridgeShowWhenEnterGame, then the match */
  async EnterWithBridge(stageOrder) {
    this.stageOrder = stageOrder;
    this.TouchBlockEnable(true);
    await this.bridge.ShowWhenEnterGame(stageOrder, this.bgHex(stageOrder));
    this.bridge.Hide();
    await wait(300);
    this.Reset_EnterGame(stageOrder);
  }

  /* the beaten rival's line, then on to the next challenger */
  async ShowBeatenThenNext(stageOrder) {
    await this.bridge.ShowWhenEnterGame(stageOrder, this.bgHex(stageOrder));
    await this.bridge.ShowBeaten(stageOrder);
    this.bridge.Hide();
    await wait(400);
  }

  /* RivalModeScene::Reset_EnterGame 0x34178 */
  Reset_EnterGame(stageOrder) {
    this.stageOrder = stageOrder;
    this.TouchBlockEnable(true);
    const col = this.hex(this.bgHex(stageOrder));
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

    /* the rival: portrait, rank and name.  The career counts down from the
       roster's end; the tournament indexes its own seven-slot tables from 1. */
    if (this.tour) {
      const R = this.roster;
      const spr = (this.bridgeCfg.TournamentBridgeSprites || [])[stageOrder + 1];
      if (c.manBFirstLook && spr) c.manBFirstLook.setSprite(spr);
      if (c.nameLine1) c.nameLine1.setText((R.OGTournamentEnemyBackText || [])[stageOrder + 1] || '');
      if (c.nameLine2) c.nameLine2.setText((R.OGTournamentEnemyName || [])[stageOrder + 1] || '');
      /* "All staff" is a wider picture -- 0x0553 */
      if (c.manBFirstLook) c.manBFirstLook.setSize(stageOrder === 5 ? 450.36 : 319,
                                                   stageOrder === 5 ? 411.579 : 428);
    } else {
      const total = this.bridgeCfg.totalEnemyNum || 50;
      const idx = total - stageOrder;
      const sprites = (this.bridgeCfg.TestBridgeSprites || []).filter(Boolean);
      const names = this.roster.RivalModeEnemyName || [];
      if (c.manBFirstLook && sprites.length) c.manBFirstLook.setSprite(sprites[idx % sprites.length]);
      if (c.nameLine1) c.nameLine1.setText('#' + idx);
      if (c.nameLine2) c.nameLine2.setText(names[idx] || '');
      if (c.manBFirstLook) c.manBFirstLook.setSize(319, 428);
    }
    if (c.manBFirstLook) c.manBFirstLook.setEnabled(true);
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

    /* [sic] 0x34178 reads OutterStageOrder here even in tournament mode, so a
       tournament match opens on the career's difficulty and only switches to
       50 + OGTournamentStageOrder*5 + PlayerScore after the first point. */
    this.model.Init();
    this.model.LoadLevelProb(DB.data.OutterStageOrder * 5 + this.PlayerScore + 1);
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
      /* the rules are explained once before the first rival and once again
         when the match length changes at rival five (m__16, IL_00A8) */
      const o = DB.data.OutterStageOrder;
      if ((o === 0 && !DB.data.isWin3BallToPassShow) ||
          (o === 5 && !DB.data.isWin5BallToPassShow)) {
        LT.delayedCall(0.8, () => this.ShowRuleAlert(o === 0 ? 3 : 5));
      } else {
        LT.delayedCall(1, () => this.m__1D());
      }
    });
  }

  /* <Reset_EnterGame>m__1C 0x358C4 -- the Rule Group prefab slides in from
     x = -1500, its score pad breathing at 1.2 and its OK button at 1.05. */
  ShowRuleAlert(balls) {
    if (this.rule) this.rule.destroy();
    this.rule = new Scene('prefab:Rule Group', this.scene.root);
    const r = this.rule;
    const root = r.n('');
    if (root) { root.setActive(true); root.setLocalPos(-1500, 0); }
    const text = r.n('Alert Group/Rule Text');
    const pad = r.n('Alert Group/PlayerScorePad Image');
    const score = r.n('Alert Group/PlayerScorePad Image/PlayerScore Text');
    const ok = r.n('Alert Group/OKBtn Image');
    if (text) text.setText(balls === 3 ? 'Win 3 balls to win the game.'
                                       : 'For subsequent levels,\nWin 5 balls to win the game.');
    if (score) score.setText(String(balls));
    this.ruleOk = ok;
    if (root) LT.moveLocalX(root, 0, 0.5).setEase(27);
    if (pad) LT.scale(pad, 1.2, 0.3).setEase(15).setLoopPingPong(-1);
    if (ok) LT.scale(ok, 1.05, 0.8).setEase(15).setLoopPingPong(-1);
    DB.data[balls === 3 ? 'isWin3BallToPassShow' : 'isWin5BallToPassShow'] = true;
    DB.save();
  }

  hitRule(x, y) {
    if (!this.rule || !this.ruleOk) return false;
    const b = this.ruleOk.el.getBoundingClientRect();
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  /* RivalModeScene::RuleAlertOKBtnClick 0x3xxxx */
  RuleAlertOKBtnClick() {
    if (this.rule) { this.rule.destroy(); this.rule = null; this.ruleOk = null; }
    LT.delayedCall(0.3, () => this.m__1D());
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

  /* RivalModeScene/<PlayerScorePadFlip>c__Iterator4 (and its Enemy twin): the
     pad folds shut over 0.12 s on easeInSine, the number changes behind it, and
     it unfolds over 0.12 s on easeOutSine -- a flip-card. */
  async ScorePadFlip(which, fromOverride, toOverride) {
    const P = 'Canvas/Top Group/' + (which === 'player'
      ? 'PlayerScorePad Group' : 'EnemyScorePadTotal Group');
    const longG = this.scene.n(P + (which === 'player' ? '/PlayerScoreLong Group' : '/EnemyScoreLong Group'));
    const topG = this.scene.n(P + (which === 'player' ? '/PlayerScoreTop Group' : '/EnemyScoreTop Group'));
    const botG = this.scene.n(P + (which === 'player' ? '/PlayerScoreBottom Group' : '/EnemyScoreBottom Group'));
    const total = which === 'player' ? this.playerScoreText : this.enemyScoreText;
    const score = (toOverride !== undefined) ? toOverride
                : (which === 'player' ? this.PlayerScore : this.EnemyScore);
    const prev = (fromOverride !== undefined) ? fromOverride : score - 1;
    const topT = this.scene.n(P + (which === 'player'
      ? '/PlayerScoreTop Group/PlayerScorePad Image (2)/PlayerScore Text'
      : '/EnemyScoreTop Group/PlayerScorePad Image (2)/PlayerScore Text'));
    const botT = this.scene.n(P + (which === 'player'
      ? '/PlayerScoreBottom Group/PlayerScorePad Image (2)/PlayerScore Text'
      : '/EnemyScoreBottom Group/PlayerScorePad Image (2)/PlayerScore Text'));
    if (!longG) { if (total) total.setText(String(score)); return; }
    if (topG) topG.setActive(true);
    if (botG) botG.setActive(true);
    if (botT) botT.setText(String(prev));
    if (topT) topT.setText(String(score));
    await wait(16);
    LT.scale(longG, [1, 0], 0.12).setEase(14);
    await wait(120);
    if (total) total.setText(String(score));
    LT.scale(longG, [1, 1], 0.12).setEase(15);
    await wait(140);
    longG.setLocalScale(1, 1);
    if (topG) topG.setActive(false);
    if (botG) botG.setActive(false);
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
    this.ScorePadFlip('player');
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
    this.ScorePadFlip('enemy');
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

  /* LoseAnim 0x0AB7: one ball from losing the match, and you have not already
     used it this match, and you are past the first rival -- the game offers you
     the ball back.  (The APK also requires Ad.HasVideo(); see ReviveView.) */
  get reviveIsDue() {
    if (this.isThisMatchAlreadyRevive) return false;
    if (DB.data.OutterStageOrder <= 0) return false;
    const p = this.PlayerScore;
    return (this.matchGoal === 3) ? (p === 2) : (p === 3 || p === 4);
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
      if (lost && this.EnemyScore >= this.matchGoal) {
        if (this.reviveIsDue) {
          this.isThisMatchAlreadyRevive = true;
          if (this.mgr.settings) this.mgr.settings.SettingBtnHide(0.2);
          this.revive.ShowUpReviveScene();
          return;
        }
        this.mgr.onMatchLost(this.stageOrder);
        return;
      }
      this.Reset_WinBall();
    });
  }

  Revive_NoThanksClick() { LT.delayedCall(0.5, () => this.mgr.onMatchLost(this.stageOrder)); }

  /* RivalModeScene::Revive_VideoReward 0x314xx + <ReviveAnim>c__Iterator2 */
  async Revive_VideoReward() {
    const c = this.core;
    const trail = c.trailNode[c.curTrail];
    if (trail) trail.setActive(false);
    c.SequenceState = SeqState.From;
    if (c.manA) { c.manA.setEnabled(true); c.manA.setSprite(c.cfg.NormalSwingSequence[0]); c.manA.setLocalPos(-387.6, -240); }
    if (c.manB) { c.manB.setEnabled(true); c.manB.setSprite(c.cfg.NormalSwingSequence[0]); c.manB.setLocalPos(543.93, 489.1); }
    if (c.manAWinLose) c.manAWinLose.setEnabled(false);
    if (c.manBWinLose) c.manBWinLose.setEnabled(false);
    c.ManASwingSequenceTmp = c.cfg.NormalSwingSequence;
    if (c.table) c.table.setSprite(c.cfg.NormalTableSprite);
    c.ManACurPos = 'A1'; c.ManBCurPos = 'B1'; c.ManAHitPos = 'A1';
    if (c.missText) c.missText.setColor(this.hex('16161600'));
    const col = this.hex(this.bgHex(this.stageOrder));
    if (this.bg) this.bg.setColor(col);
    for (const n of this.padBgs) n.setColor(col);
    for (const n of [this.playerPad, this.enemyPad, this.playerScoreText,
                     this.enemyScoreText, this.dotText]) if (n) n.setColor(this.hex('161616FF'));
    if (this.winLoseText) this.winLoseText.setColor(this.hex('16161600'));
    await this.ReviveAnim();
  }

  /* <ReviveAnim>c__Iterator2 0x39xxx -- a hand reaches in and flips the last
     point back off the enemy's pad */
  async ReviveAnim() {
    const g = ++this.core.gen; this.core.gen = g - 1;   // do not disturb the rally gen
    const f = this.revive.finger;
    if (f) { f.setActive(true); f.setAsFirstSibling(); LT.moveLocalX(f, 583, 0.7).setEase(15); }
    await wait(750);
    if (f) LT.moveLocalY(f, 940, 0.12);
    this.EnemyScorePadFlipBack();
    await wait(60);
    if (f) f.setAsLastSibling();
    await wait(300);
    if (f) LT.moveLocalX(f, 1500, 0.5).setEase(15)
             .setOnComplete(() => f.setLocalPos(f.localPos[0], 833));
    await wait(500);
    this.EnemyScore--;
    this.RoundCount = 0;
    this.model.RemakeLevelGroupSequence();
    this.core.StopRun();
    this.core.StartRun(true);
    await wait(1750);
    if (f) f.setActive(false);
    if (this.mgr.settings) this.mgr.settings.SettingBtnShow(0.2);
    this.TouchBlockEnable(false);
    this.ShowHitBtn(1);
  }

  /* the enemy pad flips back down a number -- EnemyScorePadFlipBack */
  EnemyScorePadFlipBack() {
    const from = this.EnemyScore, to = this.EnemyScore - 1;
    this._padFlipOverride = [from, to];
    this.ScorePadFlip('enemy', from, to);
    this._padFlipOverride = null;
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
    const col = this.hex(this.bgHex(this.stageOrder));
    if (this.bg) this.bg.setColor(col);
    for (const n of this.padBgs) n.setColor(col);
    const dark = this.hex('161616FF');
    for (const n of [this.playerPad, this.enemyPad]) if (n) n.setColor([1, 1, 1, 1]);
    for (const n of [this.playerScoreText, this.enemyScoreText, this.dotText]) if (n) n.setColor(dark);
    if (this.winLoseText) this.winLoseText.setColor(dark);
    if (this.playerPad) this.playerPad.setLocalScale(1, 1);
    this.RoundCount = 0;
    this.model.LoadLevelProb(this.tour
      ? 50 + this.stageOrder * 5 + this.PlayerScore
      : this.stageOrder * 5 + this.PlayerScore + 1);
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

  /* RivalModeScene::Pause 0x35048 -- the pause screen IS the bridge, and the
     HIT buttons and score pads go away while it is up. */
  Pause(v) {
    this.isGamePause = v;
    this.core.Pause(v);
    this.audiance.Pause(v);
    if (v) this.bridge.ShowPause(this.stageOrder, this.bgHex(this.stageOrder));
    else this.bridge.Hide();
    for (const n of [this.hitL, this.hitR, this.hitLShadow, this.hitRShadow,
                     this.hitLText, this.hitRText, this.playerPad, this.enemyPad,
                     this.playerScoreText, this.enemyScoreText, this.dotText])
      if (n) n.setActive(!v);
  }

  wire() {
    this.onPointer = (x, y) => {
      const st = $('#stage').getBoundingClientRect();
      if (x - st.left < st.width / 2) this.GoLeft(); else this.GoRight();
    };
  }
}


/* ============================================================== TestBridge
 * The rival ladder (`BridgeGroupDavid`).  It is three screens in one: the
 * challenger card before a match, the pause overlay, and the "beaten" card
 * where the rival says his line.  RivalModeScene::Pause 0x35048 activates it,
 * so this is also what a paused rally looks like. */
/* ============================================================ Revive 0x24A37
 * "One More Chance?".  The offer appears when you are one ball from losing a
 * match: a ball bounces in the middle of a black overlay, and a counter runs
 * down from 10 -- one tick per bounce, 0.45 s up and 0.45 s down -- while you
 * decide.  Reaching zero is the same as No Thanks.
 *
 * Deviation, and the only one in this file: the original gates the offer on
 * TechMgr.Ad.HasVideo() and pays it out through a rewarded video.  There is no
 * ad network here, so the port takes IsTestingRevive's branch -- OnWatchVideoUp
 * 0x24CDF calls OnVideoReward directly when that flag is set -- and the offer
 * appears whenever the score condition is met. */
class ReviveView {
  constructor(scene, mgr) {
    this.scene = scene; this.mgr = mgr;
    this.cfg = scene.comp('Canvas/Revive Group', 'Revive') || {};
    const N = r => (r && r.node) ? scene.n(r.node) : null;
    this.group = scene.n('Canvas/Revive Group');
    this.oneMore = N(this.cfg.OneMoreBallText);
    this.countDown = N(this.cfg.CountDownText);
    this.noThanks = N(this.cfg.NoThanksText);
    this.bg = N(this.cfg.BgImage);
    this.ballShadow = N(this.cfg.BallShadowImage);
    this.ball = N(this.cfg.BallImage);
    this.watch = N(this.cfg.WatchVideoImage);
    this.watchShadow = N(this.cfg.WatchVideoShadowImage);
    this.finger = scene.n('Canvas/Top Group/ReviveFinger Image');
    this.counter = 10;
    this.gen = 0;
    if (this.group) this.group.setActive(false);
    if (this.ball) this.ballHome = this.ball.localPos.slice();
    if (this.group) this.groupHome = this.group.localPos.slice();
  }
  get shown() { return !!(this.group && this.group.active); }

  /* Revive::ShowUpReviveScene 0x24BD4 + <ReviveCountDown>c__Iterator0 0x24EAC */
  async ShowUpReviveScene() {
    const g = ++this.gen;
    this.counter = 10;
    if (!this.group) return;
    this.group.setActive(true);
    this.group.setLocalPos(2000, 0);
    if (this.countDown) this.countDown.setText('10');
    if (this.oneMore) this.oneMore.setColor([1, 1, 1, 1]);
    if (this.countDown) this.countDown.setColor([1, 1, 1, 0.3]);
    if (this.noThanks) this.noThanks.setColor([1, 1, 1, 1]);
    if (this.bg) this.bg.setColor([0, 0, 0, 0.85]);
    if (this.ball) this.ball.setColor([1, 1, 1, 1]);
    if (this.ballShadow) this.ballShadow.setColor([1, 1, 1, 0.2]);
    if (this.watch) this.watch.setColor([1, 1, 1, 1]);
    if (this.watchShadow) this.watchShadow.setColor([1, 1, 1, 0.2]);
    await wait(16);
    if (g !== this.gen) return;
    LT.moveLocalX(this.group, 0, 0.35).setEase(12);
    for (;;) {
      /* down 0.45 s on easeInQuad, up 0.45 s on easeOutQuad; the shadow's
         sizeDelta widens as the ball falls */
      if (this.ball) LT.moveLocalY(this.ball, -23, 0.45).setEase(3);
      if (this.ballShadow) LT.value(67.88, 107.93, 0.45, w => this.ballShadow.setSize(w, 32.36)).setEase(3);
      await wait(450);
      if (g !== this.gen) return;
      this.counter--;
      if (this.countDown) this.countDown.setText(String(this.counter));
      if (this.counter === 0) { this.fadeOut(); return; }
      if (this.ball) LT.moveLocalY(this.ball, 496.5, 0.45).setEase(2);
      if (this.ballShadow) LT.value(107.93, 67.88, 0.45, w => this.ballShadow.setSize(w, 32.36)).setEase(2);
      await wait(450);
      if (g !== this.gen) return;
    }
  }

  /* Revive::OnNoThanksClick 0x24D20 and the counter reaching zero share this */
  async fadeOut() {
    const g = this.gen;
    for (const n of [this.oneMore, this.countDown, this.noThanks, this.bg,
                     this.ballShadow, this.ball, this.watch, this.watchShadow])
      if (n) LT.alpha(n, 0, 0.4);
    await wait(400);
    if (g !== this.gen) return;
    this.gen++;
    if (this.group) { this.group.setLocalPos(2000, 0); this.group.setActive(false); }
    if (this.onNoThanks) this.onNoThanks();
  }

  hit(x, y) {
    if (!this.shown) return null;
    for (const [n, id] of [[this.watch, 'watch'], [this.noThanks, 'no']]) {
      if (!n) continue;
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return 'block';
  }
  /* OnWatchVideoDown 0x24CB6 -- the button presses into the page */
  press() { if (this.watch) LT.moveLocalY(this.watch, -497, 0.05); if (this.watchShadow) this.watchShadow.setEnabled(false); }
  take() {
    this.gen++;
    if (this.watchShadow) this.watchShadow.setEnabled(true);
    if (this.group) { this.group.setLocalPos(2000, 0); this.group.setActive(false); }
    if (this.onReward) this.onReward();
  }
  reset() { this.gen++; if (this.group) this.group.setActive(false); }
}

class BridgeView {
  /* kind 'test'       -- TestBridge 0x15AC0, the 50-rival ladder
     kind 'tournament' -- TournamentBridge 0x1D280, the six Orangenose staff.
     The two components are line-for-line the same shape; what differs is the
     length, how a stage indexes the sprite and name tables, and that the
     tournament prints a job title where the ladder prints a number. */
  constructor(scene, mgr, kind) {
    this.scene = scene; this.mgr = mgr;
    this.kind = kind || 'test';
    this.tour = this.kind === 'tournament';
    const path = this.tour ? 'Canvas/TournamentBridgeGroup' : 'Canvas/BridgeGroupDavid';
    this.cfg = scene.comp(path, this.tour ? 'TournamentBridge' : 'TestBridge') || {};
    this.roster = (G.data.arrays && G.data.arrays.TestEnemyDetail) || {};
    const N = r => (r && r.node) ? scene.n(r.node) : null;
    this.group = scene.n(path);
    this.moving = N(this.cfg.BridgeMovingGroup);
    this.left = N(this.cfg.LeftEnemyImage);
    this.middle = N(this.cfg.MiddleEnemyImage);
    this.right = N(this.cfg.RightEnemyImage);
    this.rightRight = N(this.cfg.RightRightEnemyImage);
    this.bg = N(this.cfg.BgImage);
    this.nameText = N(this.cfg.TestNameText);
    this.numberText = N(this.cfg.TestNumberText);
    this.dialog = N(this.cfg.MiddleEnemyDialogImage);
    this.dialogTail = N(this.cfg.MiddleEnemyDialogTailImage);
    this.dialogText = N(this.cfg.MiddleEnemyDialogText);
    this.pauseText = N(this.cfg.PauseText);
    this.resume = N(this.cfg.ResumeBtnImage);
    this.retry = N(this.cfg.BridgeRetryBtn);
    this.homeGroup = N(this.cfg.HomeBtnGroup);
    this.scroll = N(this.cfg.TestBridgeScrollRectGroup);
    this.total = this.cfg.totalEnemyNum || 50;
    this.sprites = (this.tour ? this.cfg.TournamentBridgeSprites : this.cfg.TestBridgeSprites) || [];
    this.unknown = this.cfg.BridgeUnknowSprites || [];
    this.allStaffLose = this.cfg.BridgeAllStaffsLoseSprite;
    this.content = scene.n(path + '/BridgeScrollRect/Viewport/ScrollContent');
    this.entry0 = scene.n(path + '/BridgeScrollRect/Viewport/ScrollContent/Enemy1 Image');
    this.ladder = [];
    this.Init();
    if (this.group) this.group.setActive(false);
    if (this.scroll) this.scroll.setActive(false);
  }

  /* TestBridge::Init 0x15AC0 -- the scrollable ladder of every rival, 650
     apart, each at ImageVec (0.4) scale, with a Defeated stamp that is turned
     on for the ones already beaten. */
  Init() {
    if (!this.content || !this.entry0) return;
    const T = this.total, STEP = 650;
    this.content.setSize((T - 1 + 4) * STEP, H);
    this.content.setLocalPos(((T - 1 + 4) * STEP) / 2 - 325, 0);
    const x0 = -((Math.trunc(T / 2)) - 0.5) * STEP;
    const home = this.entry0.localPos;
    this.entry0.setLocalPos(x0, home[1]);
    this.ladder = [this.entry0];
    const stampSrc = this.entry0.el.querySelector('.n');
    for (let i = 1; i < T; i++) {
      const el = this.entry0.el.cloneNode(true);
      this.entry0.el.parentNode.appendChild(el);
      const n = new Node(this.scene, 'ladder' + i, this.entry0.node, el,
                         { ...this.entry0.rect }, this.entry0.parent);
      n.img = el.querySelector(':scope > .img');
      n.pos = this.entry0.pos.slice();
      n.tint = [1, 1, 1, 1];
      n.setLocalPos(x0 + STEP * i, home[1]);
      n.setLocalScale(0.4, 0.4);
      this.ladder.push(n);
    }
    this.entry0.setLocalScale(0.4, 0.4);
    for (let i = 0; i < T; i++) {
      const n = this.ladder[i];
      n.setSprite(this.sprites[((T - i) % 10 + 10) % 10]);
      n.setEnabled(true);
      const stamp = n.el.querySelector('.n');          // the Defeated stamp
      if (stamp) stamp.style.display = 'none';
      n._stamp = stamp;
    }
  }

  /* the stamps for every rival already beaten */
  markDefeated(stage) {
    for (let i = 0; i < this.ladder.length; i++) {
      const n = this.ladder[i];
      if (!n._stamp) continue;
      n._stamp.style.display = (i < stage) ? '' : 'none';
    }
  }

  /* TestBridge::MoveToCurRival 0x16608 */
  MoveToCurRival(stage, instant) {
    if (!this.content || !this.ladder.length) return;
    const target = this.ladder[Math.min(stage, this.ladder.length - 1)];
    if (!target) return;
    const x = -target.localPos[0];
    if (instant) this.content.setLocalPos(x, this.content.localPos[1]);
    else LT.moveLocalX(this.content, x, 0.15 * Math.abs(stage - (this.centerIndex | 0))).setEase(16);
    this.centerIndex = stage;
  }

  hex(h) { const v = p => parseInt(h.substr(p, 2), 16) / 255;
           return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 1]; }

  /* the ladder counts DOWN from #50 and wraps its ten portraits; the
     tournament indexes its seven-slot tables from 1 with no wrap at all. */
  spriteFor(stage) {
    return this.tour ? this.sprites[stage + 1]
                     : this.sprites[(((this.total - stage) % 10) + 10) % 10];
  }
  unknownFor(stage) {
    return this.tour ? this.unknown[stage + 1]
                     : this.unknown[(((this.total - stage) % 10) + 10) % 10];
  }
  nameFor(stage) {
    return this.tour ? (this.roster.OGTournamentEnemyName || [])[stage + 1] || ''
                     : (this.roster.RivalModeEnemyName || [])[this.total - stage] || '';
  }
  wordsFor(stage) {
    const w = this.tour ? this.roster.OGTournamentEnemyWordsWhenLose
                        : this.roster.RivalModeEnemyWordsWhenLose;
    if (!w) return '';
    return this.tour ? (w[stage + 1] || '')
                     : (w[(((this.total - stage) % 10) + 10) % 10] || '');
  }

  /* TestBridge::SetUpBridge 0x16120 / TournamentBridge::SetUpBridge */
  SetUpBridge(stage) {
    const T = this.total;
    if (this.left) {
      if (stage === 0) this.left.setEnabled(false);
      else { this.left.setEnabled(true); this.left.setSprite(this.spriteFor(stage - 1));
             this.left.setNativeSize(); this.left.setLocalScale(0.4, 0.4); }
    }
    if (this.right) {
      if (stage === T - 1) this.right.setEnabled(false);
      else { this.right.setEnabled(true); this.right.setSprite(this.spriteFor(stage + 1));
             this.right.setNativeSize(); this.right.setLocalScale(0.4, 0.4); }
    }
    if (this.rightRight) {
      /* [sic] the tournament's guard is `OGTournamentStageOrder > 3`, so with
         six staff the unknown silhouette vanishes one slot early */
      const off = this.tour ? (stage > 3) : (stage >= T - 2);
      if (off) this.rightRight.setEnabled(false);
      else { this.rightRight.setEnabled(true); this.rightRight.setSprite(this.unknownFor(stage + 2));
             this.rightRight.setNativeSize(); this.rightRight.setLocalScale(0.4, 0.4); }
    }
    if (this.middle) {
      this.middle.setEnabled(true);
      this.middle.setSprite(this.spriteFor(stage));
      this.middle.setNativeSize();
      this.middle.setLocalScale(1, 1);
    }
    if (this.numberText) {
      if (this.tour) {
        const R = this.roster;
        this.numberText.setText((R.OGTournamentEnemyBackText || [])[stage + 1] || '');
        const fs = (R.OGTournamentTextFontSize || [])[stage + 1];
        if (fs) this.numberText.setFontSize(fs);
        const p = (R.OGTournamentEnemyNumberPos || [])[stage + 1];
        if (p) this.numberText.setLocalPos(p[0], p[1]);
      } else {
        this.numberText.setText(String(T - stage).padStart(2, '0'));
      }
    }
    if (this.nameText) this.nameText.setText(this.nameFor(stage));
  }

  hideAll() {
    for (const n of [this.dialog, this.dialogTail, this.dialogText]) if (n) n.setAlpha(0);
    if (this.pauseText) { this.pauseText.setAlpha(0); this.pauseText.setEnabled(false); }
    for (const n of [this.resume, this.retry, this.homeGroup]) if (n) n.setActive(false);
  }

  /* TestBridge::BridgeShowWhenEnterGame -- the challenger card.  The three
     portraits come in from +500 x and the middle one starts at 0.65 scale. */
  async ShowWhenEnterGame(stage, bgHex) {
    if (!this.group) return;
    this.group.setActive(true);
    this.hideAll();
    if (this.scroll) this.scroll.setActive(false);
    if (this.moving) this.moving.setActive(true);
    if (this.numberText) this.numberText.setFontSize(178);
    this.SetUpBridge(stage);
    const homes = [];
    for (const n of [this.left, this.middle, this.right, this.rightRight]) {
      if (!n) { homes.push(null); continue; }
      const p = n.localPos.slice();
      homes.push(p);
      n.setLocalPos(p[0] + 500, p[1]);
      n.setAlpha(0);
    }
    if (this.middle) this.middle.setLocalScale(0.65, 0.65);
    if (this.bg) { this.bg.setColor(this.hex(bgHex)); this.bg.setAlpha(0); LT.alpha(this.bg, 1, 0.1); }
    if (this.moving) this.moving.setLocalPos(0, 0);
    for (const n of [this.left, this.middle, this.right, this.rightRight]) if (n) LT.alpha(n, 1, 0.1);
    if (this.nameText) { this.nameText.setColor(this.hex('161616FF')); this.nameText.setAlpha(0); LT.alpha(this.nameText, 1, 0.1); }
    if (this.numberText) { this.numberText.setColor(this.hex('161616FF')); this.numberText.setAlpha(0); LT.alpha(this.numberText, 1, 0.1); }
    /* <BridgeShowWhenEnterGame>c__AnonStorey6::<>m__0 at 0.2 s slides them home
       and grows the challenger to full size */
    LT.delayedCall(0.2, () => {
      const t = [this.left, this.middle, this.right, this.rightRight];
      t.forEach((n, i) => { if (n && homes[i]) LT.moveLocal(n, homes[i][0], homes[i][1], 0.35).setEase(27); });
      if (this.middle) LT.scale(this.middle, 1, 0.35).setEase(27);
    });
    await wait(1400);
  }

  /* TestBridge::ChangeMiddleEnemyToLoseSprite 0x163B8 -- the beaten rival drops
     his head and says his line. */
  async ShowBeaten(stage) {
    if (!this.middle) return;
    /* the whole studio shares one "all staff lose" pose for the last bout */
    this.middle.setSprite(this.tour && stage === this.total - 1 && this.allStaffLose
                          ? this.allStaffLose : this.cfg.BridgeEnemyLoseSprite);
    this.middle.setNativeSize();
    const y = this.middle.localPos[1];
    LT.moveLocalY(this.middle, y - 30, 0.07).setLoopPingPong(1);
    if (this.dialogText) this.dialogText.setText(this.wordsFor(stage));
    const dp = this.tour && (this.roster.OGTournamentEnemyDialogPos || [])[stage + 1];
    if (this.dialogTail) {
      if (dp) this.dialogTail.setLocalPos(dp[0], dp[1]);
      else this.dialogTail.setLocalPos(96, -19 + 603);
    }
    await wait(300);                                   // <>m__0
    if (this.dialog) { this.dialog.setColor([1, 1, 1, 0]); LT.alpha(this.dialog, 1, 0.1); }
    if (this.dialogTail) { this.dialogTail.setColor([1, 1, 1, 0]); LT.alpha(this.dialogTail, 1, 0.1); }
    if (this.dialogText) { this.dialogText.setColor([0, 0, 0, 0]); LT.alpha(this.dialogText, 1, 0.1); }
    await wait(1900);
  }

  /* TestBridge/<PauseAnim>c__Iterator4 -- the pause overlay.  The whole
     ladder is on screen and scrollable; ScrollingEffect below is what makes
     the one under the middle stand up. */
  ShowPause(stage, bgHex) {
    if (!this.group) return;
    this.group.setActive(true);
    if (this.scroll) this.scroll.setActive(true);
    /* the pause screen uses the ladder, not the three-portrait card */
    if (this.moving) this.moving.setActive(false);
    this.markDefeated(stage);
    for (const n of this.ladder) n.el.style.display = '';
    this.MoveToCurRival(stage, true);
    if (this.retry) this.retry.setActive(false);
    if (this.bg) { const c = this.hex(bgHex); c[3] = 0.95; this.bg.setColor(c); }
    for (const n of [this.dialog, this.dialogTail, this.dialogText]) if (n) n.setEnabled(false);
    if (this.numberText) {
      if (!this.tour) this.numberText.setFontSize(300);
      this.numberText.setColor(this.hex('FFFFFF00'));
    }
    if (this.nameText) this.nameText.setColor(this.hex('16161600'));
    if (this.homeGroup) {
      this.homeGroup.setActive(true);
      this.homeGroup.setLocalScale(0, 0);
      LT.scale(this.homeGroup, 1, 0.3).setEase(27);
    }
    if (this.resume) {
      this.resume.setActive(true);
      this.resume.setLocalScale(0, 0);
      LT.scale(this.resume, 1, 0.3).setEase(27);
    }
    if (this.pauseText) {                              // PauseText.enabled = 1
      this.pauseText.setEnabled(true);
      this.pauseText.setColor(this.hex('16161600'));
      LT.alpha(this.pauseText, 1, 0.35);
    }
    this.StartScrollingEffect();
    this.ShowScrollFinger();
  }

  /* TestBridge/<ScrollingEffect>c__Iterator0 0x17098 -- one pass a frame.
     Everything within 500 px of the centre grows towards full size and rises
     to y = -214; the nearest one also owns the name and number captions. */
  StartScrollingEffect() {
    this.StopScrollingEffect();
    const step = () => {
      if (!this.content) return;
      const cx = this.content.localPos[0];
      const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
      for (let i = 0; i < this.ladder.length; i++) {
        const n = this.ladder[i];
        const d = Math.abs(n.localPos[0] + cx);
        if (d < 500) {
          n.setLocalScale(lerp(1, 0.4, d / 650), lerp(1, 0.4, d / 650));
          n.setLocalPos(n.localPos[0], lerp(-214, -161, d / 650));
          if (this.nameText) this.nameText.setColor([0.086, 0.086, 0.086, lerp(1, 0, d / 250)]);
          if (this.numberText) this.numberText.setColor([1, 1, 1, lerp(0.65, 0, d / 250)]);
          if (this.tour) {
            const R = this.roster;
            const p = (R.OGTournamentEnemyNumberPos || [])[i + 1];
            if (p && this.numberText) this.numberText.setLocalPos(p[0], p[1]);
            if (this.numberText) this.numberText.setText((R.OGTournamentEnemyBackText || [])[i + 1] || '');
            if (this.nameText) this.nameText.setText(this.nameFor(i));
          } else {
            const p = (this.roster.RivalModeEnemyNumberPos || [])[(this.total - i) % 10];
            if (p && this.numberText) this.numberText.setLocalPos(p[0], p[1]);
            if (this.numberText) this.numberText.setText(String(this.total - i).padStart(2, '0'));
            /* rivals you have not reached yet keep their names hidden */
            if (this.nameText) this.nameText.setText(i > DB.data.OutterStageOrder ? '???' : this.nameFor(i));
          }
        } else {
          n.setLocalScale(0.4, 0.4);
          n.setLocalPos(n.localPos[0], -161);
        }
      }
    };
    /* one pass per Clock tick; Clock is driven from rAF *and* a timer, because
       rAF does not advance under headless Chrome's virtual clock */
    this._scrollTick = step;
    Clock.add(step);
    step();
  }
  StopScrollingEffect() {
    if (this._scrollTick) { Clock.remove(this._scrollTick); this._scrollTick = null; }
  }

  /* TestBridge/<ScrollFingerAnim>c__Iterator5 -- a hand hint until you scroll */
  ShowScrollFinger() {
    const f = this.scene.n((this.tour ? 'Canvas/TournamentBridgeGroup' : 'Canvas/BridgeGroupDavid') + '/Finger Image');
    this.fingerNode = f;
    if (!f) return;
    f.setActive(true);
    this.fingerGen = (this.fingerGen | 0) + 1;
    const g = this.fingerGen;
    const home = f.localPos.slice();
    const loop = async () => {
      while (g === this.fingerGen) {
        if (this.cfg.FingerDownSprite) f.setSprite(this.cfg.FingerDownSprite);
        f.setLocalPos(home[0], home[1]);
        LT.moveLocalX(f, home[0] - 300, 0.8).setEase(16);
        await wait(800);
        if (g !== this.fingerGen) return;
        if (this.cfg.FingerUpSprite) f.setSprite(this.cfg.FingerUpSprite);
        await wait(300);
      }
    };
    loop();
  }
  /* TestBridge::OnScrollRectValueChange 0x16Cxx -- the hint goes the moment
     you touch the ladder */
  HideScrollFinger() {
    this.fingerGen = (this.fingerGen | 0) + 1;
    if (this.fingerNode) this.fingerNode.setActive(false);
  }

  /* ---- dragging the ladder.  RivalModeBridgeScrollRect forwards the drag to
     TestBridge::OnDragEnd 0x15F58, which snaps to whichever rival ended up
     nearest the middle. */
  dragStart(x) {
    if (!this.content) return;
    this.HideScrollFinger();
    if (this._scrollTween) this._scrollTween.cancel();
    this._dragX = x;
    this._dragFrom = this.content.localPos[0];
    this._dragging = true;
  }
  dragMove(x) {
    if (!this._dragging || !this.content) return;
    const st = $('#stage').getBoundingClientRect();
    const k = W / st.width;                            // client px -> canvas units
    this.content.setLocalPos(this._dragFrom + (x - this._dragX) * k, this.content.localPos[1]);
  }
  OnDragEnd() {
    this._dragging = false;
    if (!this.content || !this.ladder.length) return this.centerIndex | 0;
    const cx = this.content.localPos[0];
    let best = 0, bestD = Math.abs(this.ladder[0].localPos[0] + cx);
    for (let i = 0; i < this.ladder.length; i++) {
      const d = Math.abs(this.ladder[i].localPos[0] + cx);
      if (d < bestD) { best = i; bestD = d; }
    }
    this.CurIndex = this.centerIndex = best;
    this._scrollTween = LT.moveLocalX(this.content, -this.ladder[best].localPos[0], 0.2).setEase(27);
    return best;
  }

  /* TestBridge::BridgeHide 0x16698 */
  Hide() {
    this.StopScrollingEffect();
    this.HideScrollFinger();
    for (const n of [this.bg, this.middle, this.left, this.right, this.rightRight,
                     this.nameText, this.numberText, this.pauseText, this.dialog,
                     this.dialogTail, this.dialogText, this.resume])
      if (n) LT.alpha(n, 0, 0.25);
    LT.delayedCall(0.3, () => { if (this.group) this.group.setActive(false); });
  }

  hitResume(x, y) {
    for (const n of [this.resume, this.homeGroup]) {
      if (!n || !n.active) continue;
      const r = n.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return n === this.resume ? 'resume' : 'home';
    }
    return null;
  }
}

Object.assign(window, { Core, RivalModeModel, Audiance, RivalModeSceneView, BridgeView,
                        SeqState, Miss, MovementType, SpeedType, CTOR,
                        STAND_NORMAL, STAND_GALAXY });
