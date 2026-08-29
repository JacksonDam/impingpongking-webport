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
- The design space is **1280 × 2272** — Unity's own, kept verbatim and scaled to
  the viewport rather than re-laid-out.
- **Bug-for-bug faithful.** Mark each one `[sic]` in `app.js` with the address.
- Every constant, timing and coordinate comes from the APK and carries its
  source. If you cannot cite one, you have not finished reading.

## 3. Verification discipline

```sh
./selftest.sh                # 60 assertions, headless
./shot.sh look "auto=1" 5200 # screenshot after 5.2 s of autoplay
```

**Always do the negative check.** After adding an assertion, break the constant
it covers and confirm that assertion — and ideally only that one — fails. Two
assertions in this suite passed vacuously until that was done: the sweet-spot
pair used frame indices that did not straddle the `hitBackStartFrame + 6`
boundary, so changing the window from 6 to 3 left them green.

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

Two readings I got wrong and the oracle corrected: Unity **does** serialize a
public `[Obsolete]` field (`EventTrigger.delegates`), and the standing-table
lookup in `SetToBall` keys on `ManAHitPos`, not `ManACurPos`.

## 5. Soft spots — improvised, not read out of the APK

Fair game to tighten. Everything else carries a source; these don't:

- **LeanTween easing.** ManA's 0.05 s lane change is a jump plus a 50 ms delay
  before the swing. The original eases (`setEase(27)`).
- **The score pads.** Position and art are the scene's; showing the resting
  face rather than running `ScorePad`'s flip is mine.
- **Which nodes start visible.** The scene ships most panels present and the
  mode logic fades them in with LeanTween; `hideChrome()` is my selection of
  what a rally needs. `RivalModeScene::Reset_EnterGame` 0x33C08 has the truth.
- **Game over at 3 lost balls.** The real career flow (revive offer, result
  page, next opponent) lives in `LoseAnim` / `WinAnim` / `OnRetryBtnCLick`.
- **The background flash** on a loss is a CSS transition, not
  `Table_Settings::SetBgColor`.

## 6. Ordered list of what to port next

1. `RivalModeScene::Reset_EnterGame` properly — the real enter/exit visibility,
   Ready/Fight, and the opponent intro (`ManBFirstLook`).
2. The result flow: `LoseAnim`, `WinAnim`, the pause panel, `Revive`.
3. `HomeScene` and the career bridge (`RivalModeBridge`), so stages are chosen
   rather than passed as `?stage=`.
4. The other three modes. They reuse `Core` unchanged — only the scene logic
   differs, and their trails and `Core` config are already in `game.js`.
5. `RivalModeAudiance` — the crowd sprites are extracted and placed but static.
6. `ScorePad` flip and the LeanTween easing curves.

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
