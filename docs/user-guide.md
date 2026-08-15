# User guide

A walkthrough of the font editor, from a blank grid to exported files.

- [Concepts](#concepts)
- [The window](#the-window)
- [Drawing a glyph](#drawing-a-glyph)
- [Advance width](#advance-width)
- [Guidelines](#guidelines)
- [The character map](#the-character-map)
- [Reference glyphs](#reference-glyphs)
- [The preview strip](#the-preview-strip)
- [Codepoints and character mapping](#codepoints-and-character-mapping)
- [Font dimensions](#font-dimensions)
- [Saving and exporting](#saving-and-exporting)
- [Checking an export](#checking-an-export)
- [Menu reference](#menu-reference)
- [Keyboard reference](#keyboard-reference)
- [Things worth knowing](#things-worth-knowing)

## Concepts

**The cell** is the fixed box every glyph is drawn in — up to 32×32 pixels. All
glyphs in a font share one cell size. It decides how the font is packed: a cell
1–8px wide takes 1 byte per line, 9–16px takes 2, 17–24px takes 3, and 25–32px
takes 4, which is the maximum.

**The advance width** is per glyph, and it is what makes a font variable-width:
it says how far the cursor moves after drawing this character, which is usually
narrower than the cell. A fixed-width font is simply one where every glyph's
advance equals the cell width.

**Codepoints** are the slots 0–255 that make up the font. A font does not have to
define all of them — it is entirely up to you whether to include codes below 32 or
above 128. Glyphs are exported in ascending codepoint order.

**The character mapping** records which Unicode character each codepoint stands
for. It exists so the character map can show you a recognisable `A` next to slot
0x41. It is metadata: it lives in its own file and never appears in the bitmap.

**Guidelines** are font-wide metrics — cap height, x-height, baseline, and left
and right column guides. They are drawing aids only. Nothing snaps to them and
they never change a single exported bit.

## The window

| Area | What it is |
| --- | --- |
| Top bar | Cell size, bytes per line, guide positions, glyph count and total exported size on the left; the selected codepoint and its advance width on the right |
| Grid | The glyph you are editing, with the advance marker and guides around it |
| Status bar | What you can do right now, and confirmations like "Copied glyph 0x41" |
| Character map | Every defined codepoint, on the right |
| Preview | Editable sample text drawn with the live font |

A new font starts as an 8×8 cell with codepoints 0x20–0x7F defined and the first
one selected, with the full SAM Coupe CP437 mapping loaded.

## Drawing a glyph

Click a cell to toggle it. Click and **drag** to paint a run of pixels — the first
cell you touch decides the whole stroke: start on a clear pixel and the stroke
paints, start on a set pixel and it erases. The entire stroke is one undo step.

Whole-glyph operations live under **Edit**: clear, invert, flip horizontally or
vertically, and shift up/down/left/right. Shifting does not wrap — pixels pushed
past an edge are gone, and the vacated row or column comes back blank.

**Copy Glyph** and **Paste Glyph** move artwork between slots: select a
codepoint, `Ctrl+C`, select another, `Ctrl+V`. If you resize the cell between
copying and pasting, the pixels are re-aligned rather than smeared.

Undo and redo go back 100 steps and cover everything — pixels, advance widths,
guides, dimensions, codepoints and mapping changes alike.

## Advance width

The red vertical line with the triangle handles is the advance marker. Drag it
anywhere along its length to set where this character ends.

Pixels to the right of the marker are **dimmed but still there**, and still
editable. They survive saving and reloading the project. They are only dropped
when you export. That means you can pull the marker in and out while working
without ever losing the artwork behind it.

- **Fit Width to Ink (1px gap)** (`Ctrl+T`) snaps the advance to the rightmost
  painted pixel plus one blank column, so neighbouring characters do not touch.
- **Fit Width to Ink (tight)** (`Ctrl+Shift+T`) does the same with no gap.
- **Reset Width to Maximum** pushes it back out to the full cell.

Fitting a **blank** glyph leaves its advance alone — otherwise the space
character would collapse to nothing.

## Guidelines

Five guides, all font-wide. Drag any of them by the **triangle handles in the
margins** just outside the grid: horizontal guides from the left and right
margins, column guides from above and below. They are not grabbable across the
grid itself, so the rows and columns they cross stay fully paintable. The cursor
changes over a handle.

| Guide | Meaning | Default on an 8×8 cell |
| --- | --- | --- |
| Cap height | Where capitals top out | 0 (the top edge) |
| x-height | Where lowercase letters top out | 3 |
| Baseline | The line glyphs sit on | 7, leaving one descender row |
| Left column | First kept column of a narrower cell | 1 |
| Right column | End of the last kept column | 7 |

Horizontal guides are **row boundaries** in `0..height` measured from the top;
`height` itself is legal and means the bottom edge. Column guides are **column
boundaries** in `0..width`.

The column guides exist for designing a narrow font inside a wider grid — with
them at 1 and 7 on an 8×8 cell you can draw a 6×8 font and see exactly which
columns get trimmed. They do **not** crop anything on export; every column is
still written out, and the guide positions are simply recorded in the sidecar.

Each guide has a show/hide tick under **View**. The column guides start hidden.
Hidden guides are not draggable. **Font ▸ Guidelines…** (`Ctrl+G`) sets all five
numerically.

## The character map

The panel on the right lists every defined codepoint in ascending order, showing
the hex code, a thumbnail of the glyph as drawn, and the character it maps to
rendered in the system font. Click a row to edit that glyph.

It reflows into as many columns as it has room for — **drag the divider** on its
left edge to widen it and it will go to two, three or more columns.

`Ctrl+Up` and `Ctrl+Down` step through the list without using the mouse.

## Reference glyphs

**Shift-click** any row to pin that glyph as a reference. It is drawn at half
opacity behind the glyph you are editing, wherever your glyph is clear, so your
live pixels always read as solid. It is the quickest way to make an `O` and a `Q`
agree, or to line an accent up with its base letter.

Shift-click the same row again to clear it, or use **View ▸ Clear Reference
Glyph**. The reference clears itself if you open another project or delete that
codepoint.

## The preview strip

The text box under the grid is editable — type anything and the strip below
redraws using the live font at 1×, 2× and 4×, honouring each glyph's advance
width. It defaults to a pangram so you can see most of the alphabet at once.

Characters with no glyph, or with no mapping, appear as a hollow box, which makes
gaps in the font obvious at a glance.

**View ▸ Preview: Black on White** flips it from white-on-black to black-on-white,
for checking how the font reads as normal body text.

## Codepoints and character mapping

**Font ▸ Add Codepoint…** (`Ctrl+Shift+A`) creates a new empty slot. The field
accepts decimal (`65`), hex (`0x41` or `$41`), or the character itself (`A`). If
the codepoint already exists it just selects it.

**Font ▸ Remove Codepoint** (`Ctrl+Shift+D`) deletes the selected slot and its
artwork, after a confirmation.

**Helpers ▸ Populate CP437 Table** defines all 256 codepoints in one go and loads
the matching mapping. Existing artwork is kept. Two variants:

- **SAM Coupe** — CP437 with `£` (U+00A3) at 0x60 instead of the backtick and `©`
  (U+00A9) at 0x7F instead of the house glyph. This is the default for a new font.
- **stock** — unmodified CP437.

**Helpers ▸ Edit Mapping for Glyph…** changes which character the selected
codepoint displays as. **Import Mapping…** and **Export Mapping…** move the whole
table in and out as a `.map.json` file, so a font and a character set can be
recombined freely.

## Font dimensions

**Font ▸ Dimensions…** (`Ctrl+D`) changes the cell for the whole font.

Growing pads every glyph with blank rows at the bottom and blank columns at the
right. Shrinking crops them — and if that would discard any painted pixel, you
get a warning first that names what is about to happen. Guides keep their
absolute position and are clamped to the new cell.

Watch the top bar: the bytes-per-line figure and total export size update as you
change the width, which is the quickest way to see whether a font still fits a
budget.

## Saving and exporting

**Projects** (`.fnt.json`) are what you save while working — `Ctrl+S`, or
`Ctrl+Shift+S` for Save As. The format is lossless: it keeps the pixels hidden
past each advance marker, all five guides, and the character mapping. Reopening a
project puts you back exactly where you were. Closing with unsaved changes
prompts you first, and the title bar shows a `•` while the document is dirty.

**Export** (`File ▸ Export Font…`, `Ctrl+E`) is one-way and writes three files
from one base name you choose:

| File | Contents |
| --- | --- |
| `<name>.bin` | The 1bpp bitmap: glyphs in ascending codepoint order, `bytesPerLine × height` bytes each, most significant bit of the first byte being the leftmost pixel |
| `<name>.widths.json` | Cell geometry, guide positions, and index-aligned `codepoints` and `widths` arrays — enough on its own to walk the binary |
| `<name>.map.json` | Codepoint → Unicode character, for the codepoints that actually have glyphs |

Export is the only place the editor discards data: pixels at or beyond a glyph's
advance width are written as zero. See [file-formats.md](file-formats.md) for the
byte-level specification.

## Checking an export

`scripts/decode-font.mjs` re-renders an exported `.bin` as ASCII art using only
the widths sidecar. It shares no code with the editor, so it is an independent
check that the packing is what the format claims:

```sh
node scripts/decode-font.mjs font.bin font.widths.json
node scripts/decode-font.mjs font.bin font.widths.json --code 0x41
```

`|` marks the advance width and a dashed rule marks each horizontal guide:

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

## Menu reference

### File

| Item | Shortcut |
| --- | --- |
| New Font | `Ctrl+N` |
| Open Project… | `Ctrl+O` |
| Save Project | `Ctrl+S` |
| Save Project As… | `Ctrl+Shift+S` |
| Export Font… | `Ctrl+E` |
| Exit | `Alt+F4` |

### Edit

| Item | Shortcut |
| --- | --- |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Copy Glyph / Paste Glyph | `Ctrl+C` / `Ctrl+V` |
| Clear Glyph | `Ctrl+Delete` |
| Invert Glyph | `Ctrl+I` |
| Flip Horizontal / Vertical | `Ctrl+H` / `Ctrl+Shift+H` |
| Shift Up / Down / Left / Right | `Alt+↑ ↓ ← →` |

### Font

| Item | Shortcut |
| --- | --- |
| Dimensions… | `Ctrl+D` |
| Guidelines… | `Ctrl+G` |
| Add Codepoint… | `Ctrl+Shift+A` |
| Remove Codepoint | `Ctrl+Shift+D` |
| Fit Width to Ink (1px gap) | `Ctrl+T` |
| Fit Width to Ink (tight) | `Ctrl+Shift+T` |
| Reset Width to Maximum | — |

### Helpers

Populate CP437 Table (SAM Coupe), Populate CP437 Table (stock), Edit Mapping for
Glyph…, Import Mapping…, Export Mapping… — none have shortcuts.

### View

Show/hide ticks for each of the five guides, the black-on-white preview tick,
Previous Glyph (`Ctrl+Up`), Next Glyph (`Ctrl+Down`), Clear Reference Glyph, plus
the standard reload, developer tools, zoom and full-screen items.

## Keyboard reference

| Key | Action |
| --- | --- |
| Drag on grid | Paint or erase, direction set by the first pixel |
| Drag red marker | Advance width |
| Drag margin handles | Guides |
| Drag divider | Resize the character map |
| Click map row | Select glyph |
| Shift-click map row | Toggle reference glyph |

`Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+Y` and `Ctrl+Delete` act on the **glyph** when
the grid has focus, and on the **text** when the caret is in the preview box or a
dialog field. Clicking back onto the grid or the character map releases the text
field.

## Things worth knowing

- **Pixels past the advance marker are kept, not deleted.** They live in the
  project file and are only zeroed at export.
- **Guides never affect the bitmap** — including the column guides, which do not
  crop anything.
- **The mapping is not in the font data.** It is a separate file, and only
  codepoints that have glyphs are exported to it.
- **Fitting the width of a blank glyph does nothing**, by design, so spaces keep
  the advance you gave them.
- **Undo covers the whole document**, so a mistaken resize or a stray guide drag
  is one `Ctrl+Z` away.
