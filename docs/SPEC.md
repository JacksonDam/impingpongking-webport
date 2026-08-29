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

## 1. Boot

`level0` is the **Orangenose splash**: a Canvas of eighteen images driven by an
Animator through three clips in `sharedassets0.assets`.
`OGSplashAnimationEvents::Init` 0x6A1D7 waits one second and sets the animator's
`animation` integer to 1; the clips then run in order, and the last one's own
animation events change the scene.

| clip | length | events |
|---|---|---|
| `OGSplash_click` | 0.0833 s | PlayClickSFX @0.0167, StopClickSFX @0.0833 |
| `OGSplash_explosion` | 1.5 s | PlayExplosionSFX @0.0167, StopExplosionSFX @1.4833 |
| `OGSplash_loading` | 2.0 s | LoadScene @0, ActivateScene @1.5, SetDisable @2.0 |

The curves are recovered from the clips' streamed data (see
[TOOLCHAIN.md](TOOLCHAIN.md)), so the port's splash is the shipped keyframes, not
a reconstruction:

- **click** — `Panel/Finger_1` anchoredPosition.y taps −100 → −280 → −100 over
  two frames while `Play_1` and `Play_2` swap.
- **explosion** — at 0.1667 s `Boy_1` goes out and `Boy_2` comes in, `Play_3`
  appears and `Explosion_1` fires; `Explosion_2` at 0.2333; the three smoke
  columns and `Debris` at 0.25, with debris flying −88 → 180 → −90 and the smoke
  growing on scale.y 0 → 0.1 → 1 and fading out by 1.0 s. `Blink` toggles twice
  (1.0/1.1667 and 1.3333/1.5) — the logo blinking.
- **loading** — `Loading_bar` scale.x 0 → 0.8 → 1 while `Loading_text` reads
  "LOADING GAME …".

`SFX_click` is `mouse_click` and `SFX_explosion` is `blast`.

`level1` holds everything else: `HomeScene`, the four mode scenes and a shared
`Top Canvas`. The tutorial, the ending, the rule alert, the share panel and the
tournament screen are **prefabs** in `sharedassets1.assets`, instantiated over
the current scene.

## 2. HomeScene

`HomeScene::OnViewEnable` 0x41A88 sets `curGameMode = RivalMode`, swaps the
settings button to its menu sprite, and starts:

- `HomeTitleShowAnim` — the three title pieces scale from 0 to **1.3** over
  0.5 s on easeOutSine at 0 s, 0.2 s and 0.4 s; the ball on `Title2` is the "o"
  of "Pong" and starts bouncing.
- `PlayBgm(HomeSceneBGM, loop)` with the BGM volume tweened **0 → 1 over 3 s**.

Pressing Let's Fight (`OnLetsFightBtnUp` 0x4256C) stops both coroutines, gives
the ball a 2D impulse of (600, 600) at gravity scale 3.3, hides the title, fades
the music **1 → 0.15 over 4.5 s** and enters the career one second later.

A virgin save shows none of the Tournament, Endless or New-Rivals buttons: each
is gated on `IsRivalModeComplete`, `isEndlessModeShow` or
`FirstTimeOpenAfterUpdate`.

## 3. The settings overlay

`Table_Settings` lives on the shared `Top Canvas` and is the same component in
both places: the **hamburger** on the home screen and the **pause button** in a
rally (`ChangeSettingSpriteToMenuSprite` 0x411A8 /
`ChangeSettingSpriteToPauseSprite` 0x4113B swap `Stage-Menu` for `Stage-Pause`).

`OnSettingBtnDown` 0x40600 branches on `curSceneState`:

- **HomeScene** — the button becomes `Stage-Cross` and the list slides to
  `buttonX + 40` over 0.5 s on **easeOutElastic**; closing slides it to
  `buttonX − 300` over 0.3 s on **easeInBack**.
- **a rally** — `Core.Pause` and `RivalModeScene.Pause` are called, the referee
  ("PAUSE!") slides in, and the button itself hides.

The list holds volume, Facebook, rate-us, no-ads, credits and how-to-play.

## 4. Shape of the game

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

## 5. The rally

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

## 6. The career

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

## 7. A match, end to end

`Reset_EnterGame` 0x34178 dresses the stage:

- the background and all six score-pad backings take
  `BgColors[OutterStageOrder % 5]` — `FFCB39`, `6AEAD1`, `FF9376`, `7FE0EA`,
  `FF8F9F` — so each rival brings a new colour;
- the rival's portrait, rank and name come from index
  `totalEnemyNum − OutterStageOrder`, counting **down** from #50 to #1;
- the difficulty is `LoadLevelProb(OutterStageOrder * 5 + PlayerScore + 1)`, so
  every ball won inside a match steps the level table on as well;
- then a fixed cadence: table in at 0.7 s, rival and player at 0.8 s, the rally
  at 1.8 s, and at 2.35 s the portrait hops 30 px, swaps for the playing figure,
  the score pads fade in and `ShowHitBtn(1)` brings up **HIT L / HIT R**.

A match is three balls for the first five rivals and five after that — the rule
alert `Reset_EnterGame` raises the first time says exactly that
("Win 3 balls to win the game." / "For subsequent levels, Win 5 balls…").

### READY / FIGHT

`BallTrailAnim` opens each rally with two speech bubbles when
`WillReadyFightShow` is set (`<>m__0` … `<>m__8`, 0x23690 on). READY starts at
(384, 735) and FIGHT at (−256, 735):

    0.60  the rival's name fades out over 0.25 s
    0.60  READY slides to x=0 over 0.4 s (easeOutSine)
    0.70  READY and its text fade in over 0.6 s
    1.10  READY slides to x=−100 over 0.3 s
    1.40  READY leaves to x=−2000 over 0.8 s, fading in 0.1 s
    1.80  FIGHT fades in over 0.3 s and slides to x=0 (easeOutQuint)
    2.40  both are cleared and parked back at (384, 735)

### Winning and losing a ball

`Lose` 0x30E2C adds one to `EnemyScore` and plays the `Lose` clip; `LoseAnim`
**inverts the screen** — background and pad backings to `161616`, every pad,
score and label to white — shows `LOSE A POINT` (or `LOSE A MATCH` at the match
goal) at (0, 740.25), plays the surprise mark scaling to (3, 2.4) on easeOutBounce
and shakes the rival's pad.

Winning a ball sets `SequenceState = ManBLose`, adds one to `PlayerScore` and
plays `Herray`; `WinAnim` shows `WIN A POINT` or `WIN A MATCH`, pops the player's
pad to 1.2, and on a **match** win brings the crowd up.

### The crowd

`RivalModeAudiance::SetUpPattern` 0x25474 places three rows, sizes them
(387.8×755.2, 370.5×817, 467.7×811.8) at x = −317 / 0 / 312, and slides them from
y = −1805 up to −1079 / −1000 / −1030 over 0.3 s (easeOutBack, easeOutSine,
easeOutBack). `Audiance1/2/3Anim` then cycle six-frame sequences at 0.04 s.

### Today's GIF

`ShareGIF` slides its panel from x = 2000 to 0 over 0.35 s on easeOutQuint and
plays one of five clips at 0.075 s a frame. The five, in
`RivalMode_CurShareGIFIndex` order (0x0CA8):

| # | title | blurb | button |
|---|---|---|---|
| 0 | Today's GIF | This is the Ping Pong King Dance.\nLike it on our Facebook? | Like |
| 1 | Today's GIF | Share this funny GIF on Facebook.\nYour friends will laugh, I promise. | Share |
| 2 | Today's GIF | We worked for six sleepless months on the game.\nLike us on Facebook? | Like |
| 3 | Special Move | Spread the joy!\nShare this special move to your friends on Facebook! | Share |
| 4 | Like us? | This is a great game, but we don't have enough players.\nLike us to spread the game to the world? | Like |

## 8. The tutorial and the ending

### RivalModeTutorial

A prefab instantiated over a rival scene that has **not** been entered.
`TutorialStart` (iterator 0):

    0.00  the top and bottom bars slide from +/-2000 to +/-1155 (0.8 s, easeOutBack)
    0.80  SKIP fades in over 0.2 s
          the rival serves; at hitBackStartFrame the table light comes on and
          the instruction art slides to x=129.9 while the finger prompts pulse
          -- the player must tap HIT L, then HIT R
          "Well done!" slides to x=0 over 0.4 s, holds 2 s, fades over 0.5 s
    ...   the bars leave; the four rival lines slide from x=1538 to x=201,
          0.08 s apart
          four speech bubbles scale in (easeOutBack): "Hi Rookie" (1.2 s),
          "Wanna be our \"Ping Pong King\"?" (1.75 s), "Try to beat 10 of us!"
          (1.75 s), "Are you game for it?" (1.5 s)
          I'M READY fades in over 0.5 s and pulses to 1.1 forever

Pressing it runs the bridge, calls `Reset_EnterGame`, sets `isTutorialPass` and
destroys the prefab.

### RivalModeEnding — "Now You Are Ping Pong King"

`EndingAnim` (iterator 0), after the last rival falls:

    0.00  the BGM fades 0.15 -> 0 over 1 s
    0.20  the black ground fades in over 0.5 s
    1.20  the crown and "Now" scale in (0.5 s, easeOutElastic); eight light rays
          fade to 0.25 and start rotating +100 degrees every 3 s
    2.10  "Now" fades out over 0.2 s
    2.95  the crown shrinks to 0.76 and rises to y=823.6; the rays to y=801
    3.20  the word becomes "You Are" at (0,351) and scales in;
          FirstEndingSceneBGM starts, volume 0 -> 1 over 3 s
    4.45  it fades out over 0.08 s
    4.95  crown to y=492.6, rays to y=470, the champion rises to y=0.36
    5.95  crown to y=478.8 at scale 0.64, champion to y=75 at scale 0.819
    6.45  "Ping", then "Pong" 0.2 s later, then "King" 0.2 s after that
    7.85  the champion starts dancing -- three motion sets of 10, 12 and 24
          frames at 0.095 s -- and the Home button fades in

## 9. Audio

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

## 10. Bugs in the shipped game

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

## 11. What the port leaves out

Ported: the splash, the home screen and its menu, the tutorial, the RivalMode
career with its rivals and rules, the share panel and the ending.

Not ported:

- **The other three play modes** — `EyesightModeScene`, `ConcentrateModeScene`
  and `InvertModeScene` — plus `TestModeScene`, the OG tournament and the
  endless mode. All of them are *extracted*: their scenes, ball trails and
  `Core` configuration are in `assets/data/game.js`, and they share `Core`
  unchanged, so what is missing is their scene logic.
- **The rival bridge** (the scrolling ladder of opponents between matches) and
  the **Revive** offer.
- **Ads, IAP, Facebook, Firebase, GameAnalytics, Crashlytics, cross-sell** and
  the OGBackdoor debug panel: all inert, none of it gameplay. The share panel's
  buttons show and animate but post nowhere.
- **`ScorePad`'s flip animation**; the resting face is drawn instead.
- **The tutorial's little mission** (the three-ball drill between the two taught
  hits) is shortened to the two taught hits.
