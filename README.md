# Font Editor

A desktop editor for monochrome bitmap fonts — variable or fixed width — aimed at
retro and embedded targets.

- **[User guide](docs/user-guide.md)** — how to use the editor, end to end.
- **[File formats](docs/file-formats.md)** — the exact bytes and JSON it reads and writes.
- **[design/project.md](design/project.md)** — the original brief.

## What it does

- Draw glyphs on a cell up to 32×32 pixels, click or drag to paint and erase.
- Set a per-glyph advance width with the draggable marker. Pixels to its right
  stay put while you work and are only dropped when you export. **Font ▸ Fit
  Width to Ink** snaps it to the artwork, leaving a one-pixel gap so neighbouring
  characters do not touch; a tight variant leaves no gap at all.
- Five guidelines, all draggable by the handles in the margins and settable
  numerically under **Font ▸ Guidelines…**: cap height, x-height and baseline
  horizontally, plus left and right column guides for drawing something like a
  6x8 font on an 8x8 grid. Each has a show/hide tick under **View**; the column
  guides start hidden. They are font-wide metrics — saved and exported, but they
  never alter the bitmap.
- Shift-click any glyph in the character map to pin it as a reference, drawn at
  half opacity behind the one you are editing. Shift-click it again to clear.
- The character map reflows into as many columns as fit; drag the divider to
  resize it.
- Manage which of codepoints 0–255 exist, and what Unicode character each maps to.
  The default set is CP437 with the SAM Coupe substitutions (`£` at 0x60, `©` at 0x7F).
- Undo/redo, plus copy/paste of a whole glyph between codepoints, clear, invert,
  flip and shift.
- Live preview of editable sample text at three zoom levels, in white-on-black or
  black-on-white.

## Running it

```sh
npm install
npm run dev        # dev server + Electron with hot reload
npm test           # unit tests for the model and file formats
npm run typecheck
npm run build      # production bundles into out/
```

## Files

Projects are saved as `.fnt.json`, which round-trips losslessly. **File ▸ Export
Font…** writes the three output files in one go:

| File | Contents |
| --- | --- |
| `<name>.bin` | 1bpp bitmap, glyphs in ascending codepoint order |
| `<name>.widths.json` | advance width per glyph, index-aligned with the binary |
| `<name>.map.json` | codepoint → Unicode character mapping |

To check an export independently of the editor:

```sh
node scripts/decode-font.mjs font.bin font.widths.json
```

## Layout

```text
src/main/       Electron main process — window, native menus, all file I/O
src/preload/    contextBridge surface exposed to the renderer
src/shared/     types shared across processes
src/renderer/
  model/        pure font/glyph/codepage logic (no DOM)
  io/           project and export serialisation
  state/        app state and undo history
  ui/           canvas views and dialogs
test/           Vitest specs for model/ and io/
```

## License

MIT — see [LICENSE](LICENSE).
