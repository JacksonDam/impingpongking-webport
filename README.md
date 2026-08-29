# I'm Ping Pong King — web port

[The recovered design spec](docs/SPEC.md) · [how it was reverse-engineered](docs/TOOLCHAIN.md)

A port of the **RivalMode career** of *I'm Ping Pong King* 2.7
(`com.orangenose.tablefull`, Orangenose Studios, 2018) to plain HTML/CSS/JS.
Every number, timing, coordinate and formula was read out of the shipped APK —
the CIL in `Assembly-CSharp.dll` for behaviour, the Unity scene for geometry —
and the source comment beside each one says where to re-check it against
[`docs/SPEC.md`](docs/SPEC.md).

## Run it

Open `index.html` in any modern browser. `file://` works, no server and no build
step. Tap or press a key once to start (browsers block audio before a gesture).

## Controls

| | |
|---|---|
| Swing left (lane A1) | tap the left half of the screen, or **←** / **A** |
| Swing right (lane A2/A3) | tap the right half, or **→** / **D** |
| Pause | **P** |

You are the player at the bottom. The opponent serves; meet the ball in the lane
it is coming to, during that ball's hit window. Meeting it in the **first six
frames of the window** is the sweet spot — the return flies back at 0.4× the
frame interval instead of 0.7×, and thumps.

## Fidelity

The game's own numbers, not approximations:

- the **80-stage career table** and the **ten difficulty groups**, lifted whole
  out of the JSON string literals baked into `RivalModeModel::.ctor`;
- every **hit window**, touch-table frame and sprite sequence, read off the
  `BallTrail_From` / `_To` / `_Lose` components authored in the Unity scene;
- the **A/B lane tables** from `Core::.ctor`, including the fact that the first
  two opponents use a reduced table where lane A3 never comes up;
- the whole **rally coroutine** — `Core::BallTrailAnim` — transcribed state for
  state, including the 0.207 s flight compression on an A3 hit;
- **all 478 sprites** the mode uses, sliced out of the 30 shipped atlases (ETC2
  and RGBA32) at their exact packed rects, and drawn with Unity's own trimmed
  sprite maths;
- the **fonts** (`Oduda-Bold`, `MSYI`) extracted from the Unity `Font` assets;
- the **audio**, decoded out of its FSB5 containers.

Faithful **bug for bug**. Everything reproduced deliberately is marked `[sic]`
in `app.js` and explained in [`docs/SPEC.md`](docs/SPEC.md) §6:

- `Group_Extreme` can never be rolled in the level top-up loop — its cumulative
  band was written with the same sum on both sides of the test, so the branch is
  unreachable and Extreme-heavy levels quietly come out short.
- The A3 and A1/A2 swing branches classify a late miss differently
  (`SequenceState > Lose` vs `== Lose`).
- Only the A3 branch rescales the remaining flight after a hit.
- On a loss, `ManBSwingSequenceTmp` is assigned twice; the first assignment is
  dead, so the opponent never uses its black B3 art.
- `Touch_ManB_Table` branches on `isHitSweetSpot` and applies the same ×1.1
  either way.

One thing that looks like a bug but is not: a rally is **silent apart from the
hits**. `Audios.BGM` is a null reference in the scene — only the home and ending
scenes have music.

## What is not here

RivalMode only. The other four play modes, the tournament, endless, the
tutorial, the menus and both ending scenes are **extracted** — their trails,
`Core` configuration and full scene geometry are in `assets/data/game.js` — but
have no scene logic yet. The ad, IAP, Facebook, Firebase, GameAnalytics and
Crashlytics layers are inert; none of it was gameplay. See
[`docs/SPEC.md`](docs/SPEC.md) §7 for the full list.

## Dev harness

```
?stage=N      start on career stage N (0-79)
?auto=1       a perfect player, for watching a rally
?dbg=1        live state overlay: sequence state, frame index, hit window, lanes
?probe=1      dump what is actually painting, for layout work
?selftest=1   run the assertions and print PASS/FAIL into the page
```

```sh
./shot.sh <name> ["<query>"] [ms]   # screenshot -> shots/
./selftest.sh                       # 60 assertions, headless
```

The self-test checks the career table, the group table, every authored hit
window, the sprite and atlas tables, Unity's RectTransform maths against a rect
resolved by hand, both lane tables, all twenty `BallData` transitions, the
relax-level path, the `Group_Extreme` bug, the sweet-spot boundary, and a real
scored rally plus both miss classifications. Every assertion has been
negative-checked: breaking the constant it covers makes that assertion, and
only that assertion, fail.

## Provenance

The game is **I'm Ping Pong King** by Orangenose Studios. Art, audio, fonts,
level tables and every constant come out of their APK; this repository is a
preservation port and claims no ownership. The atlases are the shipped textures
with ETC2 decoded to RGBA, the fonts are the shipped `sfnt` data, and the audio
is the shipped FSB5 decoded and re-encoded to MP3 so browsers can play it.
