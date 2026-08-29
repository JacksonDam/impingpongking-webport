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
step. Tap or press a key once to start (browsers block audio before a gesture).

## What's here

The whole first-run experience, in order:

1. the **Orangenose Studios splash** — its three animation clips decoded out of
   the shipped `AnimationClip` streams, so the finger tap, the head exploding,
   the smoke, the debris, the double blink and the loading bar are the original
   keyframes;
2. the **Ping Pong King title screen** with its bouncing ball, the **hamburger
   menu** that slides out on easeOutElastic, and the menu BGM fading up over 3 s;
3. the **tutorial** — HIT L, HIT R, "Well done!", the ten rivals lining up,
   "Hi Rookie" / "Wanna be our Ping Pong King?" / "Try to beat 10 of us!" /
   "Are you game for it?", and the **I'M READY** button;
4. the **RivalMode career** — 50 rivals counted down from #50 BEST FRIEND to
   #1 PINGPONG KING, READY / FIGHT, HIT L / HIT R, the sweet spot, WIN A POINT
   and LOSE A POINT, the screen inverting to black on a lost ball, the crowd
   rising and cheering on a won match, and a background colour per rival;
5. **Today's GIF** — the five share panels with their animated clips;
6. the ending: **"Now You Are Ping Pong King"**, the crown, the rotating light
   and the champion's three dances.

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

One thing that looks like a bug but is not: a rally is **silent apart from the
hits**. `Audios.BGM` is a null reference in the scene — only the home and ending
scenes have music.

## What is not here

The other three play modes (Eyesight, Concentrate, Invert), the OG tournament,
the endless mode, the rival bridge and the revive offer. All of them are
*extracted* — their scenes, trails and `Core` configuration are in
`assets/data/game.js`, and they reuse `Core` unchanged — but they have no scene
logic yet. The ad, IAP, Facebook, Firebase, GameAnalytics and Crashlytics layers
are inert. See [`docs/SPEC.md`](docs/SPEC.md) §11 for the full list.

## Layout

```
index.html
engine.js    RectTransform resolution, trimmed-sprite drawing, LeanTween, Scene
scenes.js    the splash, the home screen, the settings overlay
rival.js     Core (the ball engine), RivalModeModel, the crowd, RivalModeScene
extra.js     the tutorial, the ending, Today's GIF
app.js       boot and the scene manager
selftest.js  117 in-page assertions
```

## Dev harness

```
?goto=home|rival|tutorial|ending|gif   jump straight to a screen
?stage=N        start on career stage N (0-49)
?gif=N          which share panel (0-4)
?fresh=1        wipe the save
?auto=1         a perfect player, and auto-advance the tutorial
?crowd=1        bring the audience up on its own
?dbg=1          live state overlay
?probe=1        dump what is actually painting, for layout work
?tap=t:x,y;...  scripted taps in canvas coordinates
?selftest=1     run the assertions and print PASS/FAIL into the page
```

```sh
./shot.sh <name> ["<query>"] [ms]    # screenshot -> shots/
./shot2.sh <name> "<query>" <ms>     # the same, without the freeze
./selftest.sh                        # 117 assertions, headless
```

The self-test checks the career and group tables, the rival roster, every
authored hit window, the sprite and atlas tables, the decoded splash curves and
their event times, the tutorial's script, the ending's dance sequences, the five
GIF blurbs, Unity's RectTransform maths (including the localPosition conversion
that an edge-anchored node needs), LeanTween's ease curves, both lane tables,
the `BallData` transitions, the relax-level path, the `Group_Extreme` bug, the
sweet-spot boundary, and a real scored rally with both miss classifications.
Every assertion has been negative-checked: breaking the constant it covers makes
that assertion, and only that assertion, fail.

## Provenance

The game is **I'm Ping Pong King** by Orangenose Studios. Art, audio, fonts,
level tables, dialogue and every constant come out of their APK; this repository
is a preservation port and claims no ownership. The atlases are the shipped
textures with ETC2 decoded to RGBA, the fonts are the shipped `sfnt` data, and
the audio is the shipped FSB5 decoded and re-encoded to MP3 so browsers can
play it.
