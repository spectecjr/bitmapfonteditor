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
- [Creating a font and Font Properties](#creating-a-font-and-font-properties)
- [Importing a raw font bitmap](#importing-a-raw-font-bitmap)
- [Filling from a system font](#filling-from-a-system-font)
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

**Codepoints** are the slots that make up the font — any integer from 0 up to
0x10FFFF, the highest valid Unicode codepoint. A font does not have to define
all of them, or even a contiguous run: it is entirely up to you whether to
include codes below 32, above 127, or scattered far beyond the old
extended-ASCII range. Glyphs are exported in ascending codepoint order.

Wherever a codepoint is shown, it reads as decimal with hex alongside — `65
(0x41)` in text, or hex on top and decimal below in the character map. Wherever
you type one in, decimal (`65`) and hex (`0x41` or `$41`) both work.

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

The app itself starts on an 8×8 cell with codepoints 0x20–0x7F defined and the
first one selected, with the full SAM Coupe CP437 mapping loaded — the same
defaults **File ▸ New Font…** offers, though its dialog lets you change any of
them before creating anything.

## Drawing a glyph

Click a cell to toggle it. Click and **drag** to paint a run of pixels — the first
cell you touch decides the whole stroke: start on a clear pixel and the stroke
paints, start on a set pixel and it erases. The entire stroke is one undo step.

Whole-glyph operations live under **Edit**: clear, invert, flip horizontally or
vertically, and shift up/down/left/right. Shifting does not wrap — pixels pushed
past an edge are gone, and the vacated row or column comes back blank.

**Edit ▸ Whole Font** applies the same clear/invert/flip/shift operations to
every defined glyph at once, using separate shortcuts from the single-glyph
versions so the two families never collide. It is still one undo step for the
whole font, not one per glyph.

**Edit ▸ Swap With Reference Glyph** (`Ctrl+Shift+X`) exchanges the entire
glyph — bitmap and advance width both — between the current selection and its
pinned [reference glyph](#reference-glyphs). Handy for fixing a font where two
slots were drawn in the wrong place.

**Copy Glyph** and **Paste Glyph** move artwork between slots: select a
codepoint, `Ctrl+C`, select another, `Ctrl+V`. If you resize the cell between
copying and pasting, the pixels are re-aligned rather than smeared.

Undo and redo go back 100 steps and cover everything — pixels, advance widths,
guides, dimensions, codepoints and mapping changes alike.

## Advance width

The red vertical line with the triangle handles is the advance marker. Drag it
anywhere along its length to set where this character ends.

Pixels to the right of the marker are **dimmed but still there**, and still
editable. They survive saving and reloading the font. They are only dropped
when you export. That means you can pull the marker in and out while working
without ever losing the artwork behind it.

- **Fit Width to Ink (1px gap)** (`Ctrl+T`) snaps the advance to the rightmost
  painted pixel plus one blank column, so neighbouring characters do not touch.
- **Fit Width to Ink (tight)** (`Ctrl+Shift+T`) does the same with no gap.
- **Reset Width to Maximum** pushes it back out to the full cell.

Fitting a **blank** glyph leaves its advance alone — otherwise the space
character would collapse to nothing.

**Shift-drag** the marker to set every glyph in the font to the *same* advance
width at once. **Ctrl+Shift-drag** instead applies a *relative* adjustment —
however far you drag, every glyph's advance moves by that same amount, clamped
to the cell — previewing live in the character map as you drag, and only
committing as one undo step once you release.

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

Each guide has a show/hide tick under **View**. Hidden guides are not
draggable. **Font ▸ Guidelines…** (`Ctrl+G`) sets all five numerically.

Cap height, x-height and baseline visibility is a general app preference —
whatever you last set stays that way for every font you open. The **column
guides start hidden and their shown/hidden state is saved with the font**
rather than remembered globally, since they only matter to a font actually
using the narrower-cell technique: switching to a different font can show a
different state for them, and toggling one marks the document as having
unsaved changes, the same as any other property of the font.

## The character map

The panel on the right lists every defined codepoint in ascending order, showing
the codepoint (hex on top, decimal below), a thumbnail of the glyph as drawn,
and the character it maps to rendered in the system font. Click a row to edit
that glyph.

**Double-click the codepoint number** to open the same remapping dialog as
**Helpers ▸ Edit Mapping for Glyph…**, for that row specifically rather than
whatever is currently selected.

It reflows into as many columns as it has room for — **drag the divider** on its
left edge to widen it and it will go to two, three or more columns.

`Ctrl+Up` and `Ctrl+Down` step through the list without using the mouse.

For a variable-width glyph, the thumbnail draws the whole cell rather than
stopping at the advance marker — the columns past it are shown in **dark red**
(brighter red for any pixel that happens to be set there) so it is obvious at a
glance how much of the design surface a glyph isn't actually using. A
fixed-width glyph, whose advance equals the cell width, has nothing to show
there and looks unchanged.

## Reference glyphs

**Shift-click** any row to pin that glyph as a reference. It is drawn at half
opacity behind the glyph you are editing, wherever your glyph is clear, so your
live pixels always read as solid. It is the quickest way to make an `O` and a `Q`
agree, or to line an accent up with its base letter.

Shift-click the same row again to clear it, or use **View ▸ Clear Reference
Glyph**. The reference clears itself if you open another font or delete that
codepoint.

## The preview strip

The text box under the grid is editable — type anything and the strip below
redraws using the live font at 1×, 2× and 4×, honouring each glyph's advance
width. It defaults to a pangram, with every other visible ASCII character
(punctuation, digits, the rest of the uppercase alphabet) appended after the
numbers, so a fresh font exercises the whole printable set at a glance.

Characters with no glyph, or with no mapping, appear as a hollow box, which makes
gaps in the font obvious at a glance.

**View ▸ Preview: Black on White** flips it from white-on-black to black-on-white,
for checking how the font reads as normal body text. **Clicking the preview
strip itself** does the same thing — the menu tick stays in sync either way.

### Magnified Preview window

**View ▸ Magnified Preview…** (`Ctrl+Shift+P`) opens the font in its own
resizable window, magnified. Buttons in its toolbar choose the zoom (1×, 2× or
4×), the pixel shape — **Square** for normal pixels, or **Half-width** for
fonts designed against non-square hardware pixels — and **Wrap**, which wraps
the text at the window edge when on, or lets it run past the edge on one line
when off. All three choices, and the window's size, are remembered the next
time you open it.

Its own text box starts as a copy of the main window's preview text, captured
the moment the window opens — after that the two are independent, so you can
type something different in the magnified window without disturbing the main
preview. The window has no menu of its own beyond **Window ▸ Close**, and it
closes automatically if the main window does.

## Codepoints and character mapping

**Font ▸ Add Codepoint…** (`Ctrl+Shift+A`) creates a new empty slot. The field
accepts decimal (`65`), hex (`0x41` or `$41`), or the character itself (`A`). If
the codepoint already exists it just selects it.

**Font ▸ Add Codepoint Before** / **After** (`Ctrl+[` / `Ctrl+]`) are a
dialog-free shortcut for the common case: they add and select the codepoint
immediately below or above the current selection, skipping the dialog
entirely. Like Add Codepoint, landing on a slot that already exists just
selects it rather than complaining.

**Font ▸ Remove Codepoint** (`Ctrl+Shift+D`) deletes the selected slot and its
artwork, after a confirmation.

**Font ▸ Renumber Codepoints…** asks for a starting codepoint, then reassigns
every defined codepoint to a contiguous run from there, in the same relative
order, closing any gaps — glyph 5 and glyph 20 in a font with nothing between
them become adjacent codepoints if you renumber it. Character mappings travel
with their glyphs. Refused if the new range would run past 0x10FFFF, the
highest valid codepoint.

**Font ▸ Trim to Codepoint Range…** deletes every glyph *outside* a min/max
range you give it, after a confirmation naming how many glyphs would go. The
character mapping is untouched either way — only the glyphs disappear.

**Helpers ▸ Populate CP437 Table** defines all 256 codepoints in one go and loads
the matching mapping. Existing artwork is kept. Two variants:

- **SAM Coupe** — CP437 with `£` (U+00A3) at 0x60 instead of the backtick and `©`
  (U+00A9) at 0x7F instead of the house glyph. This is the default for a new font.
- **stock** — unmodified CP437.

**Helpers ▸ Populate ASCII 32-127** does the same for just the printable ASCII
range instead of the full 256-codepoint table — useful for a font that has no
business defining the 0-31 control range or the 128-255 high half at all. Also
two variants: **SAM Coupe** (the same substitutions as above, restricted to
32-127) and **standard** (plain ASCII, with 0x7F mapped to the literal DEL
character).

**Helpers ▸ Edit Mapping for Glyph…** changes which character the selected
codepoint displays as. The dialog accepts the character itself, or its Unicode
codepoint as decimal or hex (`0x20AC` for `€`) — a radio button records which
one you mean, and typing in either field selects its own radio automatically,
so you can switch back and forth before confirming. **Import Mapping…** and
**Export Mapping…** move the whole table in and out as a `.map.json` file, so a
font and a character set can be recombined freely.

## Font dimensions

**Font ▸ Dimensions…** (`Ctrl+D`) changes the cell for the whole font.

Growing pads every glyph with blank rows at the bottom and blank columns at the
right. Shrinking crops them — and if that would discard any painted pixel, you
get a warning first that names what is about to happen. Guides keep their
absolute position and are clamped to the new cell.

Watch the top bar: the bytes-per-line figure and total export size update as you
change the width, which is the quickest way to see whether a font still fits a
budget.

## Creating a font and Font Properties

**File ▸ New Font** (`Ctrl+N`) opens a dialog rather than resetting the document
outright — cancel it and nothing changes. It asks for:

- **Name, author, email, description** — all optional, and all still editable
  later via Font Properties. The description is a scrollable box with no
  practical length limit.
- **Cell width in bytes/line, cell height in lines, first and last codepoint** —
  these exist only to seed the new font. Afterwards, change them via **Font ▸
  Dimensions…** and **Font ▸ Add/Remove Codepoint** instead — Font Properties
  shows the *current* cell size and codepoint range, not what you originally
  typed here.
- **Load Mapping From Disk…** — optional; if you skip it, the new font starts
  with the default SAM Coupe CP437 mapping, same as before.

A note above the buttons updates live as you change the geometry fields, so you
can see the resulting pixel size and character count before creating anything.
There is no fixed/variable-width choice here — every glyph starts at the full
cell width, which already reads as fixed-width until you narrow one.

**Font ▸ Font Properties…** reopens the name/author/email/description fields for
editing at any time, alongside read-only rows: fixed-width, cell size,
codepoints defined, created/modified dates, and the projected size in bytes of
the exported `.bin` for the font as it stands right now. **Fixed width** is not
a setting — it is computed on the spot from whether every defined glyph is
currently at the full cell width, so it can never fall out of sync with the
font as you're editing it. **Created** is stamped the first time you actually
save the document to disk (`File ▸ Save Font`, by any path, not by clicking
Apply in this dialog), and never changes after that; **modified** updates on
every subsequent save. Both read "Not yet
saved" until the first save happens.

## Importing a raw font bitmap

**Helpers ▸ Import Raw Font Bitmap…** reads glyphs straight out of a raw binary
dump — a ROM extract, another tool's output, anything that isn't already a
`.fnt.json`. Pick a file, then set:

- **Start codepoint** — where the file's first character lands (default 32).
- **Lines per character** and **bytes per line** — the file's own geometry
  (defaults 8 and 1, i.e. plain 8×8/1bpp).
- **Byte layout** — *row-major* reads each byte as 8px across one row of the
  glyph, the same layout this app's own `.bin` export uses. *Column-major*
  keeps the same byte count per character but reads it 8px-wide-band by
  8px-wide-band, top to bottom, instead. The two are identical for any font
  8px or narrower — the choice only matters once a glyph spans more than one
  byte per line. If an import doesn't look right, this is the first thing to
  try flipping.

A note above the buttons shows the resulting character count live, and warns if
the file's size isn't an exact multiple of one character (the short last
character is padded with zeroes, not dropped) or if the codepoint range runs
past 0x10FFFF, the highest valid codepoint (those characters are dropped — only
relevant for a very large file starting near that ceiling). If the imported
geometry differs from the current cell, you get the same "this will discard
pixels" warning as
resizing normally would, and the whole import lands as one undo step.

## Filling from a system font

> **Currently disabled.** This does not appear in the Helpers menu right now.
> Canvas 2D has no access to a font's real TrueType hinting — the instructions
> a font carries to keep its stems and curves crisp at small sizes — so
> rendering straight from an installed font at 8-16px comes out rougher than a
> proper small-bitmap renderer would produce, even with the supersampling
> described below. The feature is switched off until there's a better
> rendering approach; the rest of this section describes what it does once
> it's back.

**Helpers ▸ Fill From System Font…** renders every glyph that has *both* a
defined codepoint and a character mapping, using whatever font family name you
type — the exact installed family name, the same string you'd use in CSS. There
is no dropdown of installed fonts; type it as you would anywhere else.

It measures the font's own metrics to place the baseline, cap height and
x-height guides, then rasterises each mapped character several times larger
than the cell and downsamples it back down before thresholding to 1-bit. That
downsampling step stands in for something the browser genuinely cannot do:
Canvas has no access to a font's TrueType hinting — the instructions a font
carries to keep its stems and curves crisp at small sizes — so rendering
straight at 8-16px would look rougher than the same text on a hinting-aware
renderer. Supersampling narrows that gap but does not close it. Each glyph's
advance width comes from the font's own measured character width, plus one
pixel of gap. If any glyph needs more room than the current cell width, you are
offered the chance to widen the font to fit before anything is drawn — decline,
and the fill does not happen at all, rather than silently clipping glyphs.

This is inherently a rendering operation: results depend entirely on the font
you pick, and are worth a visual check afterwards rather than trusted blindly.

## Saving and exporting

**Font files** (`.fnt.json`) are what you save while working — `Ctrl+S`, or
`Ctrl+Shift+S` for Save As. The format is lossless: it keeps the pixels hidden
past each advance marker, all five guides, the character mapping, and the
[Font Properties](#creating-a-font-and-font-properties) metadata, including the
created/modified dates it stamps on save. Reopening a font puts you back exactly
where you were. Closing with unsaved changes prompts you first, and the title
bar shows a `•` while the document is dirty.

The **title bar** reads `Filename.fnt.json` until the font has a name in Font
Properties, at which point it becomes `Font Name (Filename.fnt.json)` — the
name is display-only and never renames the file underneath it.

The **first** time you save a font that already has a name, the Save dialog
suggests a filename generated from it, with anything your OS doesn't allow in a
filename swapped for an underscore. Every save after that just reuses the
file's actual name, the same as before.

**File ▸ Recent Files** lists fonts you've opened or saved lately — pick one to
load it directly, skipping the file picker. Entries whose file has since been
moved or deleted quietly drop off the list next time it's rebuilt (opening the
app, or after new/open/save/undo/redo); if one is ever clicked before that
cleanup catches it, you'll get a message saying so instead of an error.

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
| New Font… | `Ctrl+N` |
| Open Font… | `Ctrl+O` |
| Recent Files | — (submenu) |
| Save Font | `Ctrl+S` |
| Save Font As… | `Ctrl+Shift+S` |
| Import Raw Font Bitmap… | — |
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
| Swap With Reference Glyph | `Ctrl+Shift+X` |
| Whole Font ▸ Clear | `Ctrl+Alt+C` |
| Whole Font ▸ Invert | `Ctrl+Alt+I` |
| Whole Font ▸ Flip Horizontal / Vertical | `Ctrl+Alt+H` / `Ctrl+Alt+Shift+H` |
| Whole Font ▸ Shift Up / Down / Left / Right | `Ctrl+Shift+↑ ↓ ← →` |

### Font

| Item | Shortcut |
| --- | --- |
| Dimensions… | `Ctrl+D` |
| Guidelines… | `Ctrl+G` |
| Add Codepoint… | `Ctrl+Shift+A` |
| Add Codepoint Before / After | `Ctrl+[` / `Ctrl+]` |
| Remove Codepoint | `Ctrl+Shift+D` |
| Renumber Codepoints… | — |
| Trim to Codepoint Range… | — |
| Fit Width to Ink (1px gap) | `Ctrl+T` |
| Fit Width to Ink (tight) | `Ctrl+Shift+T` |
| Reset Width to Maximum | — |
| Font Properties… | — |

### Helpers

Populate CP437 Table (SAM Coupe), Populate CP437 Table (stock), Populate ASCII
32-127 (SAM Coupe), Populate ASCII 32-127 (standard), Edit Mapping for Glyph…,
Import Mapping…, Export Mapping… — none have shortcuts. Fill From System
Font… is [currently disabled](#filling-from-a-system-font) and does not appear
here.

### View

Show/hide ticks for each of the five guides, the black-on-white preview tick,
**Magnified Preview…** (`Ctrl+Shift+P`), Previous Glyph (`Ctrl+Up`), Next Glyph
(`Ctrl+Down`), Clear Reference Glyph, plus the standard reload, developer
tools, zoom and full-screen items.

## Keyboard reference

| Key | Action |
| --- | --- |
| Drag on grid | Paint or erase, direction set by the first pixel |
| Drag red marker | Advance width |
| Shift-drag red marker | Advance width, applied to every glyph |
| Ctrl+Shift-drag red marker | Advance width, relative adjustment applied to every glyph |
| Drag margin handles | Guides |
| Drag divider | Resize the character map |
| Click map row | Select glyph |
| Shift-click map row | Toggle reference glyph |
| Double-click map row's codepoint | Open the remapping dialog for that glyph |
| Click the preview strip | Toggle black/white background |

`Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+Y` and `Ctrl+Delete` act on the **glyph** when
the grid has focus, and on the **text** when the caret is in the preview box or a
dialog field. Clicking back onto the grid or the character map releases the text
field.

## Things worth knowing

- **Pixels past the advance marker are kept, not deleted.** They live in the
  font file and are only zeroed at export.
- **Guides never affect the bitmap** — including the column guides, which do not
  crop anything.
- **The mapping is not in the font data.** It is a separate file, and only
  codepoints that have glyphs are exported to it.
- **Fitting the width of a blank glyph does nothing**, by design, so spaces keep
  the advance you gave them.
- **Undo covers the whole document**, so a mistaken resize or a stray guide drag
  is one `Ctrl+Z` away.
- **Font Properties only stores name/author/email/description/dates.** The cell
  size, codepoint range and fixed/variable-width state you see there are never
  remembered settings — they're computed fresh from the font every time the
  dialog opens, so they always reflect what the font actually is right now.
