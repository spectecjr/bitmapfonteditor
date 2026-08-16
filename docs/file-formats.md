# File formats

The editor reads and writes one **project** file, and exports three **output** files.
The project format is lossless and meant for editing; the outputs are one-way and
meant for whatever consumes the font.

## Geometry

- Cell width is 1–32 pixels. Bytes per line follows the width: 1–8px → 1 byte,
  9–16px → 2, 17–24px → 3, 25–32px → 4 (the maximum).
- Cell height is 1–32 lines; the default is 8.
- Every glyph in a font shares the same cell. Only the *advance width* varies per
  glyph, which is what makes the font variable-width. A fixed-width font is the
  case where every advance width equals the cell width.
- Five font-wide guidelines. `capHeight`, `xHeight` and `baseline` are **row
  boundaries** in `0..height` measured from the top of the cell: `baseline: 7` in
  an 8-line font means rows 0–6 sit above the line and row 7 is descender space,
  and `height` itself is legal, meaning the bottom edge. `leftColumn` and
  `rightColumn` are **column boundaries** in `0..width`, marking a narrower cell
  inside the cell — `1` and `7` on an 8px cell describe a 6x8 font drawn on an
  8x8 grid, showing exactly which columns get trimmed.
- All five are metrics only. Nothing snaps or clips to them, and they never change
  a single bit of the bitmap — including the columns outside `leftColumn`/
  `rightColumn`, which are still exported in full.

## `<name>.bin` — the font bitmap

Raw 1bpp data, no header.

Glyphs appear in **ascending codepoint order**, each occupying exactly
`bytesPerLine × height` bytes. Within a glyph, rows run top to bottom; within a
row, the **most significant bit of the first byte is the leftmost pixel**. A set
bit is a solid pixel, a clear bit is transparent.

Cells narrower than their byte count are left-aligned: in a 5px font, pixel 0 is
bit 7 of the byte and bits 2–0 are always clear.

Pixels at or beyond a glyph's advance width are written as zero, even if they are
still present in the project file. This is the one place the editor discards data,
and it is deliberate — you can move the width marker around freely while working
without losing the artwork behind it.

## `<name>.widths.json` — the advance widths

```json
{
  "version": 1,
  "width": 8,
  "height": 8,
  "baseline": 7,
  "xHeight": 3,
  "capHeight": 0,
  "leftColumn": 1,
  "rightColumn": 7,
  "bytesPerLine": 1,
  "bytesPerGlyph": 8,
  "count": 2,
  "codepoints": [65, 219],
  "widths": [7, 8]
}
```

`codepoints` and `widths` are index-aligned with each other and with the glyph
sequence in the `.bin`, so this file alone is enough to walk the binary: glyph *i*
starts at `i × bytesPerGlyph` and advances `widths[i]` pixels.

## `<name>.map.json` — the codepoint mapping

```json
{
  "version": 1,
  "entries": [
    { "code": 65, "char": "A", "unicode": "U+0041" },
    { "code": 96, "char": "£", "unicode": "U+00A3" }
  ]
}
```

Which Unicode character each codepoint stands for. This is editor metadata — it
never appears in the bitmap — and it is kept in its own file so a font and a
character set can be recombined freely. Only codepoints that actually have a glyph
are exported. The file can be re-imported via **Helpers ▸ Import Mapping…**.

The default mapping is CP437 with the SAM Coupe substitutions: `£` (U+00A3) at
0x60 instead of a backtick, and `©` (U+00A9) at 0x7F instead of the house glyph.
Everything else matches stock CP437, including the 0x00–0x1F pictographs.

## `<name>.fnt.json` — the project

```json
{
  "version": 1,
  "width": 8,
  "height": 8,
  "baseline": 7,
  "xHeight": 3,
  "capHeight": 0,
  "leftColumn": 1,
  "rightColumn": 7,
  "showLeftColumn": false,
  "showRightColumn": false,
  "glyphs": [{ "code": 65, "width": 7, "rows": ["3C", "42", "..."] }],
  "codepage": { "65": "A" },
  "metadata": {
    "name": "",
    "author": "",
    "email": "",
    "description": "",
    "created": null,
    "modified": null
  }
}
```

Every guideline is optional on read — a project written before a given guide
existed loads with the default for its cell (one descender row, x-height at
roughly 55% of the cap height, cap height at the top, and one column trimmed from
each side).

`showLeftColumn`/`showRightColumn` are the shown/hidden state of the two
column guides — optional on read, defaulting to `false` for a project written
before this existed, and anything other than the literal `true` is treated as
`false` rather than rejected. Cap height, x-height and baseline visibility is
not stored here at all: it's an app-wide preference, not a per-font one.

Rows are hex strings, one per line, sized to `bytesPerLine × 2` digits and holding
the **full cell width** — including pixels past the advance marker. Saving and
reopening a project is exact.

`metadata` is optional as a whole block, and every field within it is optional
too — a project written before it existed, or with any field missing or the
wrong type, loads with `''`/`null` defaults for whatever is absent rather than
failing to parse. `created`/`modified` are ISO 8601 timestamps stamped by the
editor itself on save, not user-editable text. Whether a font is fixed- or
variable-width is not stored here at all — the editor computes it on the fly
from whether every glyph is at the full cell width, so nothing in this file
governs it and a stray `fixedWidth` key from an older build is simply ignored
on read.

## Checking an export

`scripts/decode-font.mjs` re-renders a `.bin` as ASCII art using only the widths
sidecar, sharing no code with the editor:

```sh
node scripts/decode-font.mjs font.bin font.widths.json
node scripts/decode-font.mjs font.bin font.widths.json --code 0x41
```

The `|` in each row marks where the advance width falls, and a dashed rule marks
each guideline:

```text
0x41 (65)  advance 7/8
  ---------  cap height
  ..###..|.
  .#...#.|.
  #.....#|.
  ---------  x-height
  #.....#|.
  #######|.
  #.....#|.
  #.....#|.
  ---------  baseline
  .......|.
```
