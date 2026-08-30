# I'm Ping Pong King — web port

[The recovered design spec](docs/SPEC.md) · [how it was reverse-engineered](docs/TOOLCHAIN.md)

A port of *I'm Ping Pong King* 2.7 (`com.orangenose.tablefull`, Orangenose
Studios, 2018) to plain HTML/CSS/JS. Every number, timing, coordinate, string
and formula was read out of the shipped APK — the CIL in `Assembly-CSharp.dll`
for behaviour, the Unity scenes and prefabs for geometry, the animation clips
for the splash — and the source comment beside each one says where to re-check
it against [`docs/SPEC.md`](docs/SPEC.md).

## Run it

Open `index.html` in any modern browser. `file://` works, no server and no build
step. There is a **tap-to-start** screen first: browsers refuse to play audio
before a gesture, and the very first thing the game plays is the splash's click
and explosion. The original has no such gate — on a phone, launching the app is
the gesture.

## What's here

The whole first-run experience, in order:

1. the **Orangenose Studios splash** — its three animation clips decoded out of
   the shipped `AnimationClip` streams, so the finger tap, the head exploding,
   the smoke, the debris, the double blink and the loading bar are the original
   keyframes;
2. the **Ping Pong King title screen** with its bouncing ball, the **hamburger
   menu** that slides out on easeOutElastic, and the menu BGM fading up over 3 s;
3. the **tutorial** — HIT L, HIT R, the three-ball little mission ("Hit 3
   balls to complete this tutorial."), "Well done!", the ten rivals lining up,
   "Hi Rookie" / "Wanna be our Ping Pong King?" / "Try to beat 50 of us!" /
   "Are you game for it?", and the **I'M READY** button — with SKIP and both
   of its alerts;
4. the **RivalMode career** — 50 rivals counted down from #50 BEST FRIEND to
   #1 PINGPONG KING, each introduced on the ladder card and each with a line
   when you beat him ("You Win.", "You win, I'm impressed."); READY / FIGHT,
   HIT L / HIT R in the stage's own colour, the sweet spot, WIN A POINT and
   LOSE A POINT on flip-card score pads, the screen inverting to black on a
   lost ball, the crowd rising on a won match, and the pause screen — which is
   the rival ladder with PAUSED and RESUME;
5. **Today's GIF** — the eight share panels with their animated clips;
6. the ending: **"Now You Are Ping Pong King"**, the crown, the rotating light
   and the champion's three dances;
7. the **Orangenose Tournament** — its introduction panel, then six bouts
   against the studio (Jeff the programmer, Chelsea the artist, Rose,
   Tracy, Leon, and All staff) on their own palette and their own bridge, and
   its own ending: "Wow, I can't believe you have beaten our team so easily.
   Please DON'T tell your friends about this game!", the heart, twenty seconds
   of credits and the whole studio holding up a LOVE placard;
8. the **PPK Impossible Test** — three endless modes with their own intro
   alerts, score classes and result pages. Its button on the home screen
   unlocks exactly as the APK's does: the day *after* you first ran the game
   (`numOfDaysInstalled >= EndlessModeShowFromDay`), once the tutorial is past.
   `?days=1` skips the wait, and `?goto=endless` goes straight there.
   **Eyesight**, where every point you win shrinks the whole play area by 15%;
   **Concentration**, one button, every ball to the same place, scored in
   seconds survived; and **Reverse**, where two seconds in a pair of hands
   reaches on screen, picks up HIT L and HIT R and swaps them over;
9. **Revive** — "One More Chance?" when you are one ball from losing a match,
   with the ball bouncing against a ten-second counter.

## Controls

| | |
|---|---|
| Swing left (lane A1) | tap the left half of the screen, or **←** / **A** |
| Swing right (lane A2/A3) | tap the right half, or **→** / **D** |
| Menu / pause | the button in the top corner, or **P** |
| Start | tap the play button, or **space** |

Meet the ball in the lane it is coming to, during that ball's hit window.
Meeting it in the **first six frames of the window** is the sweet spot — the
return flies back at 0.4× the frame interval instead of 0.7×, and thumps.

## Fidelity

The game's own numbers, not approximations:

- the **80-stage career table** and the **ten difficulty groups**, lifted whole
  out of the JSON string literals baked into `RivalModeModel::.ctor`;
- the **51 rival names**, the lines each says when beaten and the taunts when
  you lose, recovered from the IL of `TestEnemyDetail::.ctor`;
- every **hit window**, touch-table frame and sprite sequence, read off the
  `BallTrail_From` / `_To` / `_Lose` components authored in the Unity scene;
- the **A/B lane tables** from `Core::.ctor`, including the fact that the first
  two rivals use a reduced table where lane A3 never comes up;
- the **adaptive difficulty** the game never tells you about: the level table's
  frame intervals are thrown away every ball and recomputed from a running
  measure of how well you are playing. Winning a ball raises
  `BiasPercentagePivot`; a higher pivot means a lower bias, and a lower bias a
  shorter frame interval — a faster ball. Every launch of the app gives five of
  that streak back, and how many retries the *tutorial* took you picks which of
  four curves you are on for the whole career;
- the whole **rally coroutine** — `Core::BallTrailAnim` — transcribed state for
  state, including the 0.207 s flight compression on an A3 hit;
- the **splash's animation curves**, decoded from the streamed clip data;
- **all 751 sprites**, sliced out of the 132 shipped atlases (ETC2, RGBA32 and
  RGB24) at their exact packed rects and drawn with Unity's own trimmed-sprite
  and RectTransform maths;
- the **fonts** (`Oduda-Bold`, `MSYI`) extracted from the Unity `Font` assets;
- the **audio**, decoded out of its FSB5 containers.

Faithful **bug for bug**. Everything reproduced deliberately is marked `[sic]`
in the source and explained in [`docs/SPEC.md`](docs/SPEC.md) §10:

- `Group_Extreme` can never be rolled in the level top-up loop — its cumulative
  band was written with the same sum on both sides of the test, so the branch is
  unreachable and Extreme-heavy levels quietly come out short.
- The A3 and A1/A2 swing branches classify a late miss differently
  (`SequenceState > Lose` vs `== Lose`).
- Only the A3 branch rescales the remaining flight after a hit.
- On a loss, `ManBSwingSequenceTmp` is assigned twice; the first assignment is
  dead, so the rival never uses its black B3 art.
- `Touch_ManB_Table` branches on `isHitSweetSpot` and applies the same ×1.1
  either way.
- Three of the eight share panels (CatchTheBall, KungFu, Ballet) fall off the
  end of `SetShareGIF`'s switch and ship with empty sprite arrays, so they are
  a title and a blurb over a blank panel — and the index that selects them
  wraps before it ever reaches them.
- A tournament match opens on the *career's* difficulty: `Reset_EnterGame`
  reads `OutterStageOrder` in both game modes.
- `GetScoreClass` grades a score past the last bound "S" rather than clamping.
- Reverse mode resets its round counter instead of clamping it, so its
  difficulty saws; Concentration, the same code, clamps.

One thing that looks like a bug but is not: a rally is **silent apart from the
hits**. `Audios.BGM` is a null reference in the scene — only the home and ending
scenes have music.

## What is not here

Every screen the game ships. The build contains exactly two Unity scenes,
`OGSplashScene` and `_Project`, and the self-test enumerates all 38
MonoBehaviours present in them and fails if one is unaccounted for.

Three of those 38 have no counterpart, and none of them is unfinished work:

- `RivalModeBridge` / `RivalModeBridgeScrollRect` — the older ten-rival bridge.
  It is still in the scene, but it ships switched off and nothing references it;
  `RivalModeScene.Bridge` is a `TestBridge`.
- `BannerController` — the ad banner. There is no ad network here.

Two more classes are compiled into `Assembly-CSharp.dll` but are **not in the
build at all** — no GameObject carries them and the Impossible Test list has no
card for either, so there is nothing to port: `TestModeScene` and `DemoMode`
(with their list components and `DemoResultPage`).

The ad, IAP, Facebook, Firebase, GameAnalytics and Crashlytics layers are inert.
Revive's rewarded video is replaced by the branch the original already has for
its own test flag; the settings drawer's No Ads and Restore take the
already-purchased path. See [`HANDOFF.md`](HANDOFF.md) §6 for the full list of
deviations and §7 for the coverage argument.

## Layout

```
index.html
engine.js    RectTransform resolution, trimmed-sprite drawing, rich text,
             LeanTween, Scene
scenes.js    the splash, the home screen, the settings drawer and its
             How To Play and Credits panels
rival.js     Core (the ball engine), RivalModeModel, the crowd, the bridge
             (career ladder and tournament), Revive, RivalModeScene
extra.js     the tutorial, the ending, Today's GIF, the tournament panel
modes.js     the three Impossible Test modes and their card list
app.js       boot and the scene manager
selftest.js  277 in-page assertions
```

## Dev harness

```
?goto=home|rival|tutorial|ending|gif|endless|tournament|
      tournamentinfo|tournamentend|eyesight|concentrate|invert
?nogate=1       skip the tap-to-start gate
?nobridge=1     skip the challenger card and go straight to the rally
?stage=N        start on career stage N (0-49)
?gif=N          which share panel (0-7)
?fresh=1        wipe the save
?complete=1     mark the career finished (unlocks the tournament)
?days=N         pretend the game was installed N days ago -- the Impossible
                Test needs 1, exactly as the APK does
?revive=1       raise the revive offer a second into a rally
?drag=t:a,b     a scripted ladder drag, in canvas x
?auto=1         a perfect player, and auto-advance the tutorial
?crowd=1        bring the audience up on its own
?dbg=1          live state overlay
?tap=t:x,y;...  scripted taps in canvas coordinates
?selftest=1     run the assertions and print PASS/FAIL into the page
```

```sh
./shot.sh <name> ["<query>"] [ms]    # screenshot -> shots/
./shot2.sh <name> "<query>" <ms>     # the same, without the freeze
./selftest.sh                        # 277 assertions, headless
./errs.sh "<query>" <ms>             # dump every uncaught error the page hit
```

The self-test checks the career and group tables, the rival roster and the lines
each rival says, every authored hit window, the sprite and atlas tables, the
decoded splash curves and their event times, the tutorial's script, the ending's
dance sequences, the five GIF blurbs, Unity's RectTransform maths (the
localPosition conversion an edge-anchored node needs, scaling about the pivot,
and `sizeDelta` keeping a centred rect centred), LeanTween's ease curves, both
lane tables, the `BallData` transitions, the relax-level path, the
`Group_Extreme` bug, the sweet-spot boundary, where the rival stands for each
of B1/B2/B3, the per-stage HIT button sprite, the button press moving down
rather than scaling, the ladder's fifty entries and where a drag snaps to, the
tournament's six bouts and its 1-indexed tables, the three modes' score classes
and difficulty bounds, when the revive offer is due, when the share panel is,
Unity's rich text, and a real scored rally with both miss classifications.
It ends with a coverage oracle over every script in the shipped scenes.
Every assertion has been negative-checked: breaking the constant it covers makes
that assertion, and only that assertion, fail.

## Provenance

The game is **I'm Ping Pong King** by Orangenose Studios. Art, audio, fonts,
level tables, dialogue and every constant come out of their APK; this repository
is a preservation port and claims no ownership. The atlases are the shipped
textures with ETC2 decoded to RGBA, the fonts are the shipped `sfnt` data, and
the audio is the shipped FSB5 decoded and re-encoded to MP3 so browsers can
play it.
