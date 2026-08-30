# Handoff

Working notes for picking this up on another machine. Not documentation for
readers — that's [`README.md`](README.md), [`docs/SPEC.md`](docs/SPEC.md) and
[`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md).

## 1. What you need to carry over

Cloning this repo gets you the finished port and the whole toolchain. It does
**not** let you answer new questions about the game. For that you need one file
that is deliberately not in git:

| file | md5 | size |
|---|---|---|
| `I-m-Ping-Pong-King-v2-7-pdalife.ru.apk` | `9226156571add1d6a0d8abc7888b525c` | 42,787,349 |

Everything else — `work/extracted`, `work/rebuilt`, `work/analysis`,
`work/assets`, `shots/` — is derived. `docs/TOOLCHAIN.md` §"Rebuilding" has the
recipe; it takes a couple of minutes.

`work/tools/` and `docs/tools/` are copies of each other. If you change one,
copy it across; the repo copy is the one people read.

## 2. Ground rules for this port

- **Plain HTML/CSS/JS**, must run from `file://`. No build step, no deps.
  That is why `assets/data/game.js` is a `.js` assignment and not `.json`, and
  why audio goes through `HTMLAudioElement` rather than `decodeAudioData`.
- **Nothing is hand-placed.** Every screen is rebuilt from the exported scene
  tree; if something is in the wrong place the fix is in the rect maths or the
  export, not a magic number in the view.
- The design space is **1280 × 2272** — Unity's own, kept verbatim and scaled to
  the viewport rather than re-laid-out.
- **Bug-for-bug faithful.** Mark each one `[sic]` in `app.js` with the address.
- Every constant, timing and coordinate comes from the APK and carries its
  source. If you cannot cite one, you have not finished reading.

## 3. Verification discipline

```sh
./selftest.sh                  # 117 assertions, headless
./shot2.sh look "auto=1" 9000  # screenshot 9 s in
```

**Always do the negative check.** After adding an assertion, break the constant
it covers and confirm that assertion — and ideally only that one — fails. Four
assertions in this suite passed vacuously until that was done:

- the sweet-spot pair used frame indices that did not straddle the
  `hitBackStartFrame + 6` boundary, so changing the window from 6 to 3 left
  them green;
- the geometry pair only probed a centre-anchored node, where localPosition and
  anchoredPosition are equal either way — so both the localPosition conversion
  and the driven-Canvas pivot could be deleted with the suite still passing.
  They now probe an edge-anchored node and a stretched one.

## 4. Bugs found and fixed while porting (don't re-litigate)

| symptom | cause |
|---|---|
| whole scene invisible | the Canvas RectTransform serializes `sizeDelta` 0 and `localScale` 0; Unity drives both from the CanvasScaler |
| still invisible after that | every mode scene ships with its Canvas **deactivated** |
| gold background missing | a UI `Image` with a null sprite still draws — a solid quad in `m_Color` |
| ball invisible | trails are white art tinted `Color.black` by `ChangeTrailImage`; the tint has to be applied |
| sprites drawn at the node origin | `.img` needs `position:absolute` for `drawSprite`'s left/top |
| table painted over the players | sibling index is paint order; the tree was being sorted by name |
| all sprite rects 8 bytes early | `m_SourceSkin` exists in Unity 2018.1 only |
| every `Image` 128 bytes short | `UnityEvent` ends with an `m_TypeName` string |
| stage off-centre | `place-items:center` centres inside a content-sized grid track, which is the item itself |
| tutorial text half off-screen | `moveLocalX` sets **localPosition**, not anchoredPosition; they differ for an edge-anchored node |
| share panel half a screen left | a driven Canvas serialises a stale pivot — RivalModeScene's is (0,0), Unity drives it at (0.5,0.5) |
| nothing animated in a screenshot | `requestAnimationFrame` does not advance under `--virtual-time-budget`; the clock needs a timer too |
| crash on leaving a scene | `LT.cancelAll()` runs inside a tween's own callback, so the ticker must step a snapshot |
| splash tracks mixed together | a Transform binding is 3–4 curve slots, not 1, and its attribute is a small enum rather than a CRC |
| the rival walked off screen | ManBMove sends B2 **and** B3 to x=195; I had invented 180/900 |
| the ball seemed to vanish | it did not — the rival had walked off screen and the ball was flying to him |
| a blurry blob on pause | the referee is activated and immediately swept off by SettingBtnHide; the pause screen is the bridge |
| bridge rivals stacked on each other | Unity scales about the pivot, and they pivot at their feet (y=0.033) |
| white rectangles on the bridge | `enabled: false` Images that only code turns on, and null-sprite quads not cleared when a sprite arrives |
| the pause glyph sat left of its circle | `sizeDelta` must re-resolve the rect, not just resize the box |
| no audio at all until the first click | browsers block audio before a gesture; the port needs a tap-to-start gate the original does not |

Three readings I got wrong and an oracle corrected: Unity **does** serialize a
public `[Obsolete]` field (`EventTrigger.delegates`); the standing-table lookup
in `SetToBall` keys on `ManAHitPos`, not `ManACurPos`; and the level index fed
to `LoadLevelProb` is `OutterStageOrder * 5 + PlayerScore + 1`, not the stage
number — every ball won inside a match steps the difficulty on.

## 5. Soft spots — improvised, not read out of the APK

Fair game to tighten. Everything else carries a source; these don't:

- **ManA's lane change.** A jump plus a 50 ms delay before the swing; the
  original tweens it over 0.05 s on `setEase(27)`.
- **The score pads.** Position and art are the scene's; showing the resting face
  rather than running `ScorePad`'s flip is mine.
- **Which nodes start visible.** The scenes ship most panels present and fade
  them in; `hideChrome()` is my selection of what a rally needs.
  `RivalModeScene::Reset_EnterGame` 0x34178 has the truth.
- **The home ball's bounce** while the title is up: the impulse after Let's
  Fight is the real one (600,600 at gravity scale 3.3), the idle bounce is mine.
- **The tutorial's little mission** — the three-ball drill between the two
  taught hits — is left out; the rest of `TutorialStart`'s beats are the real
  waits.
- **The match flow between rivals.** The port shows the bridge card and the
  beaten rival's line, then goes on (via the share panel every third win); the
  original also offers Revive and a result page.
- **The ladder does not drag.** `TestBridge::OnDragEnd` and `ScrollingEffect`
  are not ported; the ladder is built and centred but not scrollable by touch.

## 6. Ordered list of what to port next

1. **The rival bridge** (`RivalModeBridge`) — the scrolling ladder of opponents
   between matches, with the defeated marks. Its sprites and node wiring are
   already in `game.js`.
2. **Revive** and the pause/result panels (`Revive`, `PausePageBase`,
   `ResultPageBase`).
3. **The other three modes.** They reuse `Core` unchanged — only the scene logic
   differs, and their trails and `Core` config are already in `game.js`.
   `EyesightModeScene` is the closest to RivalMode.
4. The tutorial's **little mission** (the three-ball drill) and its skip alerts.
5. `ScorePad`'s flip, and easing on ManA's lane change.
6. The **OG tournament** and the **endless mode**, both of which have their own
   ending branch in `RivalModeEnding`.

## 7. Environment notes

Tools used: `python3` (3.12), `node`, `ffmpeg`, ImageMagick (`magick`),
`vgmstream-cli` (brew), Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and
`pip install texture2ddecoder pillow` for the ETC2 atlases. **Absent:** `mono`,
`ikdasm`, `ilspycmd`, radare2, Ghidra, AssetStudio, UnityPy — hence the
hand-rolled toolchain.

Headless Chrome needs `--allow-file-access-from-files` for `file://` pages here.

Shell gotcha: the Bash tool runs zsh and resets the working directory between
calls — start every command with an explicit `cd`.
