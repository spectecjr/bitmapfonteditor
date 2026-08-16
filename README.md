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
  resize it. For a variable-width glyph, the columns past its advance marker
  draw in dark red rather than disappearing, so wasted cell space is visible at
  a glance.
- Manage which of codepoints 0–255 exist, and what Unicode character each maps to.
  The default set is CP437 with the SAM Coupe substitutions (`£` at 0x60, `©` at 0x7F).
- Undo/redo, plus copy/paste of a whole glyph between codepoints, clear, invert,
  flip and shift.
- Live preview of editable sample text at three zoom levels, in white-on-black or
  black-on-white.
- **File ▸ New Font…** and **Font ▸ Font Properties…** capture a name, author,
  email and freeform description alongside the font — none of it mandatory, all
  of it optional to fill in later. Fixed-vs-variable-width is shown in
  Properties too, but it's computed from the glyphs, never a setting.
- **Helpers ▸ Import Raw Font Bitmap…** loads glyphs straight out of a raw
  binary dump (start codepoint, geometry and byte layout all configurable),
  padding a short last character with zeroes rather than rejecting the file.
- **Fill From System Font** (currently disabled — see the
  [user guide](docs/user-guide.md#filling-from-a-system-font)) would render an
  installed font straight into the grid, but Canvas 2D has no access to real
  TrueType hinting, so results at small sizes aren't good enough yet.

## Prerequisites

- **Node 18.18 or newer** — Node 20 or 22 for preference — with npm 8+. Earlier
  majors will not work: electron-vite, Vite and Vitest all require
  `^18.18 || >=20`.
- **`npm install` downloads the Electron binary**, around 100 MB, in a
  postinstall step. If that is blocked, point it somewhere else with
  `ELECTRON_MIRROR`, or skip it altogether — nothing in `test/` imports Electron
  and neither the typecheck nor the bundler needs the binary, so
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install` is enough to work on `model/`,
  `io/` and `state/`. You only need the binary to *run* the app.
- **On Linux**, Electron wants the usual GTK stack — on Debian/Ubuntu that is
  `libgtk-3-0`, `libnss3`, `libasound2` and `libgbm1`. Under WSL2 you also need
  WSLg or an X server; if the window comes up blank, force software GL with
  `LIBGL_ALWAYS_SOFTWARE=1 npm run dev`. Note that `electron-vite dev` forwards
  only its own flags to Electron — `--noSandbox`, `--inspect`,
  `--remoteDebuggingPort` and `--rendererOnly` — so arbitrary Chromium switches
  have to go through the environment.

Developed and used on Windows 11. The macOS and Linux paths are ordinary
Electron and should work, but are not regularly exercised.

## Running it

```sh
npm install
npm run dev        # dev server + Electron with hot reload
npm test           # unit tests for the model and file formats
npm run typecheck
npm run build      # production bundles into out/
npm start          # run those bundles — needs npm run build first
```

`out/` is not checked in, which is why `npm start` needs the build: the app's
entry point is `out/main/index.js`. `npm run dev` builds on the fly and needs
nothing beforehand.

### Launching from VS Code

Opening [fonteditor.code-workspace](fonteditor.code-workspace) (or just the
folder) picks up [.vscode/launch.json](.vscode/launch.json), which is tracked
in the repo rather than gitignored like the rest of `.vscode/` — it's a shared
way to run the app, not a personal editor preference. Press **F5** and pick:

- **Electron: Main** — runs `npm run dev` with the debugger attached to the
  main process, so breakpoints in `src/main/` and `src/preload/` work directly.
  This is the one to reach for most of the time; renderer code can already be
  stepped through via the app's own **View ▸ Toggle DevTools**, sourcemapped
  same as any other Vite dev build.
- **Electron: Main + Renderer** — the same, plus a Chrome attach on port 9222
  (the app is started with `--remoteDebuggingPort 9222` for this), so
  breakpoints in `src/renderer/` work from VS Code too, without needing the
  in-app DevTools open.

No terminal typing needed either way — just the `npm run dev` you'd otherwise
run by hand, with a debugger already attached.

## Packaging

```sh
npm run dist       # installer for the platform you are on, into release/
npm run dist:dir   # unpacked app only — faster, for checking what got bundled
```

[electron-builder.yml](electron-builder.yml) targets NSIS on Windows, DMG on
macOS and AppImage on Linux. electron-builder only builds for the platform it
runs on, so a Windows installer needs a Windows machine.

The icon is [assets/icon.png](assets/icon.png) — placeholder artwork, drawn by
[scripts/make-icon.mjs](scripts/make-icon.mjs) so it can be tweaked without an
image editor. Run `node scripts/make-icon.mjs` after changing it.

### Releases

Pushing a `vX.Y.Z` tag runs
[.github/workflows/release.yml](.github/workflows/release.yml), which builds the
AppImage, DMG and Windows installer on their native runners, attaches them and a
`SHA256SUMS` file to a draft release, and publishes it only once all three have
succeeded. The tag must match `version` in package.json; the workflow checks and
stops if it does not. So a release is:

```sh
npm version patch     # or minor/major — commits and tags
git push --follow-tags
```

Nothing is code-signed. Windows shows a SmartScreen warning on the installer, and
macOS needs `xattr -dr com.apple.quarantine` on the app after download. Fixing
either means a paid certificate — an Authenticode one for Windows, and Apple
Developer Program membership for notarisation.

**Building the Windows installer needs symlink privilege.** For the NSIS target
electron-builder unpacks its `winCodeSign` helper, and that archive contains
macOS symlinks; without the privilege to create them the build stops at
`Cannot create symbolic link : A required privilege is not held by the client`.
Turn on **Settings ▸ System ▸ For developers ▸ Developer Mode**, or run
`npm run dist` from an elevated shell.
`npm run dist:dir` does not need any of this — it never signs anything — so it is
the quicker check that the bundle itself is sound.

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
scripts/        standalone tools — export decoder, icon generator
assets/         electron-builder resources (the app icon)
```

## License

MIT — see [LICENSE](LICENSE). That covers the source in this repository.

### Third-party software

Packaged builds are not just this code: they embed Electron, and through it
Chromium, Node.js and ffmpeg, each under its own licence. electron-builder ships
the required notices inside every build, next to the executable —
`LICENSE.electron.txt` for Electron's MIT licence and `LICENSES.chromium.html`
for Chromium and its components. Leave those files in place when you
redistribute a build; that is what satisfies the attribution terms.

Nothing is bundled into the editor's own bundles: every entry in `package.json`
is a devDependency, so `out/` is this repository's code and nothing else.
