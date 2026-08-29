# I'm Ping Pong King 2.7 — recovered design spec

Everything here was read out of the shipped APK. Code references are
`Type::Method` plus the method's RVA in `Assembly-CSharp.dll`; data references
name the Unity scene object the value is authored on. See
[TOOLCHAIN.md](TOOLCHAIN.md) for how to re-derive any of it.

| | |
|---|---|
| package | `com.orangenose.tablefull` |
| version | 2.7 (versionCode 25), built Thu 11 Oct 2018 |
| engine | Unity **2018.1.9f1**, **Mono** scripting backend (not IL2CPP) |
| ABIs | `armeabi-v7a`, `x86` — both irrelevant; the game is managed CIL |
| design space | **1280 × 2272** portrait (`CanvasScaler.m_ReferenceResolution`) |
| author | Orangenose Studios |

---

## 1. Shape of the game

`GameMgr` (a `Singleton<GameMgr>`) owns `Scenes`, `Audios`, `Tuner` and
`Table_Settings`, and switches between seven scenes named by `GameMgr/SceneEnum`:

    RivalModeScene 0   HomeScene 1   ...   EyesightModeScene 11
    ConcentrateModeScene 14   InvertModeScene 17   TestModeScene 21

`GameMgr/GameMode` names the play modes: `RivalMode`, `OGTournamentMode`,
`EyesightMode`, `ConcentrateMode`, `InvertMode`, `TemplateMode`, `TestMode`.

All four play modes share one engine — the `Core` MonoBehaviour — and differ
only in the scene logic wrapped around it. **This port implements RivalMode**,
the 80-stage career, which is the game's main line.

### The A/B lane grid

Both players stand in one of three lanes. The player (ManA) uses `A1` (left),
`A2` (centre) and `A3` (right); the opponent (ManB) uses `B1`, `B2`, `B3`. Every
ball in flight is a named sprite sequence for one lane pair — `From-B1-A1`,
`To-A2-B3`, `Lose-B3-A1` and so on.

`Core::.ctor` 0x216C4 holds the two tables that decide where a ball can go:

| from | Normal → L | Normal → R | Galaxy → L | Galaxy → R |
|---|---|---|---|---|
| A1 | B1 | B1 | B2 | B1 |
| A2 | B1 | B1 | B3 | B1 |
| A3 | — | — | B3 | B1 |
| B1 | A1 | A2 | A1 | A2 |
| B2 | — | — | A1 | A3 |
| B3 | — | — | A1 | A3 |

The **Normal** table is used while `OutterStageOrder <= 1` — for the first two
opponents the ball only ever travels B1↔A1/A2, so A3 never comes up. From stage
2 on, the **Galaxy** table opens up the full grid
(`RivalModeScene::SetFromBall` 0x30778).

---

## 2. The rally

`Core::BallTrailAnim` (iterator 1) is the whole rally, one coroutine. A ball is
a flipbook: `BallTrailSequenceTmp` is an array of sprites, and `curSpriteIndex`
walks it with a per-frame delay that the scene keeps changing.

    Ready/Fight (if WillReadyFightShow)  →  wait 2.1 s
    wait 0.5 s
    ManBTossBallAnim                      →  wait 0.2 s
    toss trail, 12 frames @ 0.04 s
    ManBSwing + FirstBallTrail            →  serve, @ 0.028 s a frame
    ── then the rally loop, on SequenceState ──
      From      the ball is coming at the player
      To        the player returned it
      Lose      the player missed
      ManBLose  the opponent missed (the player wins the ball)

### Timings

`Core::.ctor` 0x216C4 sets the defaults; the scene overrides most of them
per ball.

| what | value | source |
|---|---|---|
| ball trail frame | 0.023 s | `BallTrailFrameInterval` |
| ManB swing frame | 0.040 s | `ManBSwingAnimDelay` |
| lose-trail frame | 0.030 s | `LoseBallTrailAnimDelay` |
| to/from trail frame | 0.023 s | `To/FromBallTrailAnimDelay` |
| serve frame | 0.028 s | inline in `BallTrailAnim` |
| ManA swing frame | 0.023 s | `ManASwingAnim` |
| table-effect frame | 0.018 s | `TouchTableEffectAnim` |

### The hit window

Each `From-*` trail carries its own window, authored on the scene object
(`BallTrail_From`, under `Canvas/Core/BallTrail Group`):

| trail | hit window | touch-table frame | → lose at | frames |
|---|---|---|---|---|
| `FirstBallTrail` | 9 … 20 | 0 | 0 | 21 |
| `From-B1-A1` | 8 … 18 | 6 | 17 | 19 |
| `From-B1-A1-Slow` | 16 … 26 | 14 | 25 | 27 |
| `From-B1-A2` | 7 … 20 | 6 | 19 | 21 |
| `From-B1-A2-Slow` | 20 … 34 | 19 | 33 | 35 |
| `From-B2-A1` | 6 … 19 | 6 | 18 | 20 |
| `From-B2-A3` | 7 … 18 | 6 | 17 | 19 |
| `From-B3-A1` | 14 … 24 | 14 | 23 | 26 |
| `From-B3-A3` | 9 … 26 | 5 | 19 | 27 |

At `hitBackStartFrame` the engine sets `IsAbleToHitBack` and starts the table
flash; at `hitBackEndFrame` (serve) or the last frame (rally) an unmet ball
becomes a loss.

### Swinging

Tapping the left or right half of the screen calls `RivalModeScene::GoLeft`
0x33288 / `GoRight` 0x334B8. Both are no-ops while `IsInSwingColddown` is set.
They move ManA to the target lane — `(-387.6, -240)` for A1, `(0, -240)` for A2
and A3, over a 0.05 s LeanTween — and then swing.

`Core::ManASwingAnim` (iterator 5) decides the outcome:

- **hit**: `IsAbleToHitBack && ManACurPos == ManAHitPos`.
- **miss**, classified into `Core/MissHitState`:
  - `WrongSide` — standing in the wrong lane;
  - `TooLate` — the ball is already in a lose sequence;
  - `TooEarly` — `curSpriteIndex < hitBackStartFrame`.

On a hit from **A3**, the remaining flight is compressed: 

    FromBallTrailAnimDelay = 0.207 / (hitBackEndFrame - curSpriteIndex)

so the ball always takes the same 0.207 s to reach the bat however early it was
met, and `IsHitBack` is set on swing frame 6 (with the `Hit1` sfx). From **A1 or
A2** the hit is flagged immediately and no such rescaling happens — see §6.

### The sweet spot

`RivalModeScene::SetToBall` 0x30B60 rewards meeting the ball early:

    if (curSpriteIndex < hitBackStartFrame + 6)
        ToBall interval = middleFrameInterval * 0.4;  isHitSweetSpot = true;  ManAUseForce sfx
    else
        ToBall interval = middleFrameInterval * 0.7;  isHitSweetSpot = false;

`IsSwingHard` is set when the next ball is not `Slow`, or when the opponent is
headed to B3. It shifts where the opponent's bounce lands in the `To-*`
sequence (`length-4` instead of `length-1`).

### Ball speed through a rally

`SetFromBall` 0x30778 picks the incoming trail and its speed:

- opponent at **B2** or **B3** → forced `Fast`/`Nothing`, interval `middle * 0.85`;
- `MovementType == Slow` → the `-Slow` trail, with the interval tweened from
  `middle * 0.4` up to `middle` over `middle * 6` seconds;
- `SpeedType == ImpulseEaseOut` → interval `middle * k`, `k` by stage:
  `0.40` (≤3), `0.30` (4–5), `0.27` (6–7), `0.24` (>7), with the player-side
  interval scaled by 0.7 (0.64 past stage 7);
- otherwise interval `middle * 0.9`, player-side × 0.9.

When the ball bounces on the player's side (`Touch_ManA_Table` 0x30EAC) the
interval switches to `PlayerSideFrameInterval`, multiplied when the player must
reach A3: ×1.0 (B3) or ×1.3 (B2) before stage 8, ×1.1 / ×1.45 after.

---

## 3. The career

`RivalModeModel::.ctor` carries the whole table as a **JSON string literal** —
80 stages at IL_0001, ten difficulty groups at IL_000C. The first fifty carry
opponent names; the rest are unnamed filler reached by the wrap-around below.

    StageOrder  Goal  GroupEasyProb … GroupExtremeProb
    EnemySideFrameInterval  MiddleFrameInterval  PlayerSideFrameInterval
    RelaxIndex  EnemyName

Opening run: LITTLE BROTHER, BEST FRIEND, MATHS TEACHER, BABY SISTER, SCHOOL
BEST, VILLAGE BEST, OUR ARTIST, PROFESSIONAL, TOWN BEST, CITY BEST, … with goals
2, 2, 4, 3, 3, 4, 4, 5, 5, 3, 7, 7, 11, …

`GameMgr::Init` 0x27EC picks the career length from a remote A/B config —
sets "A"/"B"/"C"/"D" give 10/20/30/**50** enemies; a virgin save gets "D".

`RivalModeModel::LoadLevelProb` 0x2EAA4 maps a stage past the table back into
it, for the 50-enemy set:

    25 ≤ o < 75   → random 10…24
    75 ≤ o < 135  → random 25…49
    135 ≤ o < 245 → random 50…74
    o ≥ 245       → o − 170

### Difficulty groups

Ten groups, each a set of variations to draw from (`GroupJson`, IL_000C):

| group | FirstVariation | SecondVariation |
|---|---|---|
| Group_Easy | 1 | 1 |
| Group_Normal | 2, 3 | 1 |
| Group_Middle | 4 | 1 |
| Group_Hard | 1, 3 | 2 |
| Group_Expert | 1 | 5 |
| Group_Extreme | 2, 3, 4 | 3 |
| Group_Relax1 | 2 | 1 |
| Group_Relax2 | 1 | 1 |
| Group_Relax3 | 3 | 1 |
| Group_Relax4 | 1 | 2 |

A level's ball list is built by taking `trunc(prob × Goal / 100)` of each group
and then topping up to `Goal` with single random rolls. A non-zero `RelaxIndex`
skips all of that and fills the level with one relax group. Finally
`Goal = balls + 1`.

`FirstVariation` (1–4) and `SecondVariation` (1–5) turn the previous ball into
the next one in `RivalModeModel::BallData` 0x2F4B0:

| FirstVariation | effect |
|---|---|
| ChangeNothing | keep MovementType |
| ChangeFastSlow | Slow ↔ Fast |
| ChangeDirection | flip side, keep MovementType |
| ChangeFastSlowAndDirection | both |

| SecondVariation | effect |
|---|---|
| Nothing | SpeedType = Nothing |
| Impulse | MovementType = Fast, SpeedType = Impulse |
| ImpulseEaseOut | MovementType = Fast, SpeedType = ImpulseEaseOut |
| ImpulseEaseIn | MovementType = Slow, SpeedType = ImpulseEaseIn |
| SuddenlySlow | restore the previous side, SpeedType = Nothing |

---

## 4. Scoring

`RivalModeScene::Lose` 0x30E2C adds one to `EnemyScore`, plays the `Lose` clip
and flashes the background white over 0.3 s. Winning a ball (the opponent
misses) adds one to `PlayerScore` in `SetFromBall` and plays `Herray`.

---

## 5. Audio

Ten clips ship as FSB5 inside `sharedassets*.resource` — four Vorbis, six
FMOD-ADPCM. The `Audios` component wires them up:

| role | clip |
|---|---|
| `BGM` | **null** — a rally is silent but for the hits |
| `PingPongPlayer` | Hit1 |
| `PingPongEnemy` | Hit2 |
| `TouchTable` | Hit2 |
| `Lose` | Lose |
| `ManAUseForce` | HardHit (the sweet-spot thump) |
| `Herray` | Herray |
| `HomeSceneBGM` | HomeBGM |
| `FirstEndingSceneBGM` / `TrueEndingSceneBGM` | FirstEndingBGM / TrueEndingBGM |

---

## 6. Bugs in the shipped game

Reproduced deliberately; each is marked `[sic]` in `app.js`.

**`Group_Extreme` can never be rolled in the top-up loop.** The cumulative band
test is written

    if (sum >= r) skip;      // sum = easy+normal+middle+hard+expert
    if (r >= sum) skip;      // ← should have been r >= sum + extreme
    add(Group_Extreme);

so the two guards are exact complements and the body is unreachable. Extreme
balls only ever arrive from the proportional pass, which means a level whose
budget is mostly Extreme quietly ends up shorter than its nominal `Goal`.

**The A3 and A1/A2 swing branches classify `TooLate` differently.** A3 tests
`SequenceState > Lose` (i.e. only `ManBLose`), A1/A2 tests `SequenceState ==
Lose`. The same missed ball is therefore labelled differently depending on which
lane you are standing in.

**A3 hits rescale the remaining flight, A1/A2 hits do not.** Only the A3 branch
sets `FromBallTrailAnimDelay = 0.207 / (hitBackEndFrame - curSpriteIndex)`, so
an early A1/A2 hit leaves the ball travelling at whatever interval was in force.

**`ManBSwingSequenceTmp` is assigned twice on a loss**, first to
`BlackB3SwingSequence` and then immediately to `BlackSwingSequence`. The first
assignment is dead, so the opponent never uses the black B3 art after a loss.

**`Touch_ManB_Table` 0x30FD4 branches on `isHitSweetSpot` and then applies the
same `× 1.1` in both arms.** The test has no effect.

---

## 7. What the port leaves out

- **RivalMode only.** `EyesightModeScene`, `ConcentrateModeScene`,
  `InvertModeScene`, `TestModeScene`, the tournament, the endless mode, the
  tutorial and both ending scenes are extracted (their trails and `Core`
  configuration are in `assets/data/game.js`) but have no scene logic yet.
- **No menus.** The port boots straight into a rally.
- **Ads, IAP, Facebook, Firebase, GameAnalytics, Crashlytics, cross-sell and the
  OGBackdoor debug panel** are all inert; none of it is gameplay.
- **LeanTween easing** is not reproduced. ManA's 0.05 s lane change is a jump
  followed by the same 50 ms delay before the swing.
- **`ScorePad`'s flip animation** is not reproduced; the resting face is drawn.
