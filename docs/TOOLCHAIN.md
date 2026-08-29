# How this was reverse-engineered

The APK is a Unity **Mono** build, so unlike a stripped native binary there is
nothing to guess: the game logic is ECMA-335 CIL in `Assembly-CSharp.dll` with
every type, method, field and parameter name intact, and the art, audio and
scene are Unity serialized files. The problem is not *recovering* the
information, it is *reading* it — no `mono`, `ikdasm`, `ilspycmd`, AssetStudio
or UnityPy were available, so the toolchain in [`tools/`](tools) is hand-rolled
and stdlib-only apart from two image helpers.

Nothing here is guesswork that was left unchecked. Each stage has an **oracle** —
a property the data itself must satisfy if the reading is right — and each one is
stated below.

## Layout

    PingPongKing/
      work/                                    the analysis workspace  [not in git]
        extracted/        unzipped APK
        rebuilt/          split .assets files concatenated, plus the rest of Data/
        analysis/         classdump.cs, src/ (44k lines of pseudo-C#), sprites.json,
                          scene.json, behaviours.json, data/*.json
        assets/           tex/ (138 PNG), snd/ (10 WAV), fsb/, font/
        tools/            the toolchain — mirrored to port/docs/tools
      PingPongKing-webport/                    THIS REPO

## Rebuilding from nothing but the APK

```sh
mkdir -p work && cd work
cp -r ../PingPongKing-webport/docs/tools tools
unzip -q ../I-m-Ping-Pong-King-v2-7-pdalife.ru.apk -d extracted

# Unity splits big .assets across .splitN parts; put them back together
D=extracted/assets/bin/Data
mkdir -p rebuilt analysis assets
for b in sharedassets0.assets sharedassets1.assets; do
  ls $D/$b.split* | sed 's/.*split//' | sort -n | while read i; do cat "$D/$b.split$i"; done > rebuilt/$b
done
for f in $(ls $D | grep -vE '\.split[0-9]+$|^Managed$|^Resources$|\.resource$|boot.config'); do
  [ -f "$D/$f" ] && cp "$D/$f" rebuilt/
done

python3 tools/classdump.py            > analysis/classdump.cs   # structure
python3 tools/dumpall.py                                        # analysis/src/*.cs
python3 tools/strs.py -l 400          > analysis/bigstrings.txt # the baked JSON
python3 tools/sprites.py                                        # analysis/sprites.json
python3 tools/mono.py                                           # analysis/behaviours.json
python3 tools/scene.py                                          # analysis/scene.json
python3 tools/textures.py rebuilt/sharedassets1.assets $D assets/tex
python3 tools/audio.py                                          # assets/fsb/*.fsb
python3 tools/export.py                                         # the port's payload
```

`textures.py` needs `texture2ddecoder` and `pillow` (`pip install
texture2ddecoder pillow`) for the ETC2 atlases; everything else is stdlib.
`audio.py` only cuts the FSB5 blobs out — turning them into WAV needs
`vgmstream-cli` (`brew install vgmstream`), and `ffmpeg` makes the MP3s.

## The pieces

### `dnmeta.py` — PE + CLI metadata

An ECMA-335 reader: PE headers, the CLI header from data directory 14, the
`BSJB` metadata root, the `#~` / `#Strings` / `#US` / `#Blob` / `#GUID` heaps and
all 45 metadata tables with their coded-index encodings.

*Gotchas that cost real time:* the data directories sit at optional-header
offset **0x60 for PE32 and 0x70 for PE32+** (not the other way round), and the
stream-header count is at `root + 16 + versionLen + 2` — the two bytes before it
are `Flags`, and reading them as the count yields zero streams and a very
confusing silence.

### `dnsig.py`, `dnasm.py` — signatures and CIL

`dnsig.py` decodes signature blobs into C# type names. `dnasm.py` builds the
type/method/field graph, resolves every metadata token to a readable name —
including `#US` string literals, inlined at the `ldstr` — and disassembles
method bodies (tiny and fat headers, all one- and two-byte opcodes, `switch`
tables).

*Gotcha:* a generic base type is a `TypeSpec`, not a `TypeDef`/`TypeRef`. Leaving
it as `TypeSpec#N` hides that `GameMgr : Singleton<GameMgr>` and that
`TriggerEvent : UnityEvent<BaseEventData>`; the latter silently breaks
MonoBehaviour deserialization further down.

### `decomp.py`, `dumpall.py` — CIL → pseudo-C#

CIL is a stack machine, and 4,433 methods of it are not readable by hand. This
simulates the evaluation stack per basic block, spilling to named temporaries at
every branch target, and prints expressions and `goto`s. No loop or `if`/`else`
structuring — but that is enough to read the game, and every line keeps its IL
offset so a reading can be checked against the raw disassembly.

*Gotcha:* `st[-0:]` is the whole stack, not nothing — a zero-argument call
happily swallowed the entire stack until `P(0)` was special-cased.

*Note:* coroutines compile to nested iterator classes, so the body of
`Core::BallTrailAnim` is the `MoveNext` of `Core/<BallTrailAnim>c__Iterator1`.
`dumpall.py` emits nested types with their outer type.

### `strs.py` — the string heap

Dumping every `ldstr` longer than 400 characters immediately produced the
game's whole design table: `RivalModeModel::.ctor` carries the 80-stage career
and the ten difficulty groups as **JSON string literals**, and `Tuner::.ctor`
carries two more tables of 250 and 50 entries.

This is the single highest-value step, and it took a minute. Read the data
before the code.

### `unityfs.py` — Unity SerializedFile

Header, metadata, the type table and the object table for format **v17**. Type
trees are **stripped** in a player build, so every class layout below is written
out by hand for Unity 2018.1 and checked against the object size.

### `textures.py` — 138 atlases

Texture2D for 2018.1: `m_Name`, forced fallback format, downscale flag, size,
`m_CompleteImageSize`, format, mips, the readable/preprocessed bool pair,
image count, dimension, `GLTextureSettings`, lightmap format, colour space,
then the pixels (or a `StreamingInfo` pointing into `sharedassets*.resource`).
Formats present are RGBA32 (21), RGB24 (92) and ETC2_RGBA8 (25).

**Oracle:** the texture names themselves end in `-fmt4` / `-fmt47`, and
`m_CompleteImageSize` must equal `w*h*4` for RGBA32.

### `sprites.py` — 751 sprites

The hard one. `m_Rect`, offset, border, pixels-per-unit, pivot, extrude, polygon
flag, render-data key, atlas tags, the SpriteAtlas pointer, then
`SpriteRenderData`: two texture pointers, submeshes, index buffer, vertex data,
**`m_Bindpose` and `m_SourceSkin`** — the second exists only in Unity 2018.1 and
was removed in 2018.2 — and finally `textureRect`, its offset, the atlas offset,
`settingsRaw`, `uvTransform` and `downscaleMultiplier`.

**Oracle:** sprites are packed *trimmed*, so `textureRect` must lie inside the
atlas and `textureRectOffset + textureRect.size` must fit inside `m_Rect`.
Getting `m_SourceSkin` wrong put every rect 8 bytes early and the oracle caught
all 751 at once. It now passes **751/751**.

### `mono.py`, `scene.py` — the scene

MonoBehaviour blobs have no type tree, so the layout is derived from the C#
field list plus Unity's serialization rules: public or `[SerializeField]`, not
`static`/`const`/`readonly`/`[NonSerialized]`, base class fields first, one
`align(4)` after every sub-word field, and `List<T>`/`T[]` as a count followed
by elements. `[Serializable]` is the type flag `0x2000`, not an attribute.

Native classes (`GameObject`, `Transform`, `RectTransform`) and the UI
components (`Image`, `Text`, `UnityEvent`) are written out by hand.

**Oracle:** byte-exact consumption. If a layout is right, reading a component
consumes exactly its object size. That test found, in order: that
`UnityEngine.UI.*` lives in a different assembly; that `Graphic`'s fields are
reached only by walking through `UnityEngine.UI` base classes; that
`UnityEvent` ends with an `m_TypeName` string (the missing 128 bytes on every
`Image`); that `Image`'s bools each carry their own `align(4)` and that
`m_UseSpriteMesh` does not exist in 2018.1; that `GameObject` has no trailing
align; and — settling a question I had guessed wrong — that Unity **does**
serialize a public `[Obsolete]` field. It now passes **3288/3288**.

### `export.py` — the port's payload

Resolves sprite and sequence pointers to names, walks the RectTransform tree,
and emits `assets/data/game.js`. It is a `.js` assignment rather than `.json`
because the port has to run from `file://`, where `fetch` of a sibling file is
blocked.

## Answering a new question

```sh
python3 tools/decomp.py 'RivalModeScene::SetFromBall'   # pseudo-C# for one method
python3 tools/decomp.py 'Core::'                        # every method on a type
python3 tools/strs.py -l 200 'Group_'                   # find a literal
python3 tools/q.py level1 BallTrail_From                # scene components by script
grep -n 'hitBackStartFrame' analysis/src/*.cs           # every site touching a field
```

## Things that would have gone wrong quietly

- The **Canvas** RectTransform serializes with `sizeDelta` 0 **and**
  `localScale` 0 — Unity drives both at runtime from the CanvasScaler. Resolve
  the tree against it literally and the whole scene collapses to nothing.
- Every mode scene ships with its Canvas **deactivated**; `GameMgr` turns one on.
- A UI `Image` with a null sprite is not invisible — it draws a solid quad in
  `m_Color`. That is the game's gold background.
- `Image.m_Color` is a multiply tint. The ball trails are white streak art
  painted `Color.black` by `Core::ChangeTrailImage`; ignore the tint and the
  ball is invisible on a light background.
- Sibling index is paint order. Sorting the scene tree by name instead layers
  the table over the players.
