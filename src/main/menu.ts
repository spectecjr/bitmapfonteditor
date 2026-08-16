import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { ViewState } from '@shared/api'
import type { HorizontalGuide, VerticalGuide } from '@shared/types'
import { basename } from 'node:path'
import { openDocsWindow } from './docsWindow'
import { sampleFontsDir } from './paths'
import { openPreviewWindow } from './previewWindow'
import { getRecentFiles, pruneMissingRecentFiles } from './settings'

/**
 * View preferences live here rather than in the renderer: the menu ticks are the
 * only way to change them, so main is the single source of truth and pushes the
 * whole object down whenever it changes.
 *
 * The column guides are NOT here — their visibility lives on the FontDoc and is
 * saved with the font (see `syncColumnGuideVisibility` in shared/api.ts), since
 * they only matter to fonts actually using the narrower-cell technique, unlike
 * these three which are relevant to virtually anything you'd draw.
 */
const viewState: ViewState = {
  guides: {
    capHeight: true,
    xHeight: true,
    baseline: true
  },
  previewInverted: false
}

/** Column guide visibility as of the last `syncColumnGuideVisibility` call — starts hidden. */
let columnGuides: Record<VerticalGuide, boolean> = { leftColumn: false, rightColumn: false }

export function currentViewState(): ViewState {
  return viewState
}

export function pushViewState(window: BrowserWindow | null): void {
  window?.webContents.send('view:state', viewState)
}

/**
 * Rebuilds the menu with fresh column-guide checkboxes. Cheap enough to call on
 * every document load (New Font, Open Font, Undo/Redo) — those are the only
 * times the checkboxes could disagree with the document without a click having
 * happened to keep them in sync.
 */
/** Flips the preview background, whether triggered by the View menu checkbox or a click on the preview itself. */
export function togglePreviewInverted(getWindow: () => BrowserWindow | null): void {
  viewState.previewInverted = !viewState.previewInverted
  pushViewState(getWindow())
  buildMenu(getWindow)
}

export function syncColumnGuides(
  getWindow: () => BrowserWindow | null,
  leftColumn: boolean,
  rightColumn: boolean
): void {
  columnGuides = { leftColumn, rightColumn }
  buildMenu(getWindow)
}

/**
 * Every item just forwards a command string to the renderer, which routes it
 * through the same `dispatch()` the keyboard shortcuts use.
 */
function send(getWindow: () => BrowserWindow | null, command: string): () => void {
  return () => getWindow()?.webContents.send('menu:command', command)
}

/**
 * Pruning here (rather than on a dedicated "menu about to open" event, which
 * the native application menu doesn't expose cross-platform) piggybacks on
 * the fact that `buildMenu` already reruns on every state change that could
 * make this list stale — new/open/save/undo/redo — so it stays cheap and
 * never runs on a hot path like typing or painting. `before-quit` in
 * main/index.ts covers the "on app close" half of the spec.
 */
function buildRecentFilesSubmenu(getWindow: () => BrowserWindow | null): MenuItemConstructorOptions[] {
  pruneMissingRecentFiles()
  const files = getRecentFiles()
  if (files.length === 0) return [{ label: 'No Recent Files', enabled: false }]
  return files.map((path) => ({
    label: `${basename(path)} — ${path}`,
    click: () => getWindow()?.webContents.send('menu:openRecent', path)
  }))
}

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const cmd = (command: string): (() => void) => send(getWindow, command)

  /**
   * A menu item whose accelerator collides with a built-in browser editing
   * command. `registerAccelerator: false` shows the shortcut in the menu but
   * leaves the keystroke to the renderer, which is the only place that knows
   * whether the caret is in a text field.
   */
  const textShortcut = (
    label: string,
    accelerator: string,
    command: string
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: cmd(command)
  })

  /** Electron flips `checked` for us before the click handler runs. */
  const guideToggle = (guide: HorizontalGuide, label: string): MenuItemConstructorOptions => ({
    label,
    type: 'checkbox',
    checked: viewState.guides[guide],
    click: (item) => {
      viewState.guides[guide] = item.checked
      pushViewState(getWindow())
    }
  })

  /**
   * Unlike `guideToggle`, the source of truth here is the renderer's FontDoc,
   * not this module — so the click just asks the renderer to flip it and mark
   * the document dirty, and `syncColumnGuides` (called back from there) is what
   * actually keeps this checkbox honest afterward.
   */
  const columnGuideToggle = (guide: VerticalGuide, label: string): MenuItemConstructorOptions => ({
    label,
    type: 'checkbox',
    checked: columnGuides[guide],
    click: cmd(guide === 'leftColumn' ? 'view:toggleLeftColumn' : 'view:toggleRightColumn')
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'New Font', accelerator: 'CmdOrCtrl+N', click: cmd('file:new') },
        { type: 'separator' },
        { label: 'Open Font…', accelerator: 'CmdOrCtrl+O', click: cmd('file:open') },
        { label: 'Recent Files', submenu: buildRecentFilesSubmenu(getWindow) },
        { type: 'separator' },
        { label: 'Save Font', accelerator: 'CmdOrCtrl+S', click: cmd('file:save') },
        { label: 'Save Font As…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('file:saveAs') },
        { type: 'separator' },
        { label: 'Import Raw Font Bitmap…', click: cmd('helpers:importRawFont') },
        { label: 'Export Font…', accelerator: 'CmdOrCtrl+E', click: cmd('file:export') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Alt+F4', click: () => getWindow()?.close() }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        // Chromium claims the standard editing keys for itself before a menu
        // accelerator sees them, so these are displayed but not registered —
        // the renderer matches them on keydown, where it can tell whether a text
        // field has focus. Clicking the menu item still works either way.
        textShortcut('Undo', 'CmdOrCtrl+Z', 'edit:undo'),
        textShortcut('Redo', 'CmdOrCtrl+Y', 'edit:redo'),
        { type: 'separator' },
        textShortcut('Copy Glyph', 'CmdOrCtrl+C', 'edit:copy'),
        textShortcut('Paste Glyph', 'CmdOrCtrl+V', 'edit:paste'),
        { type: 'separator' },
        textShortcut('Clear Glyph', 'CmdOrCtrl+Delete', 'edit:clear'),
        { label: 'Invert Glyph', accelerator: 'CmdOrCtrl+I', click: cmd('edit:invert') },
        { label: 'Flip Horizontal', accelerator: 'CmdOrCtrl+H', click: cmd('edit:flipH') },
        { label: 'Flip Vertical', accelerator: 'CmdOrCtrl+Shift+H', click: cmd('edit:flipV') },
        { type: 'separator' },
        { label: 'Shift Up', accelerator: 'Alt+Up', click: cmd('edit:shiftUp') },
        { label: 'Shift Down', accelerator: 'Alt+Down', click: cmd('edit:shiftDown') },
        { label: 'Shift Left', accelerator: 'Alt+Left', click: cmd('edit:shiftLeft') },
        { label: 'Shift Right', accelerator: 'Alt+Right', click: cmd('edit:shiftRight') },
        { type: 'separator' },
        {
          label: 'Swap With Reference Glyph',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: cmd('edit:swapReference')
        },
        { type: 'separator' },
        {
          label: 'Whole Font',
          submenu: [
            { label: 'Clear', accelerator: 'CmdOrCtrl+Alt+C', click: cmd('edit:whole:clear') },
            { label: 'Invert', accelerator: 'CmdOrCtrl+Alt+I', click: cmd('edit:whole:invert') },
            {
              label: 'Flip Horizontal',
              accelerator: 'CmdOrCtrl+Alt+H',
              click: cmd('edit:whole:flipH')
            },
            {
              label: 'Flip Vertical',
              accelerator: 'CmdOrCtrl+Alt+Shift+H',
              click: cmd('edit:whole:flipV')
            },
            { type: 'separator' },
            {
              label: 'Shift Up',
              accelerator: 'CmdOrCtrl+Shift+Up',
              click: cmd('edit:whole:shiftUp')
            },
            {
              label: 'Shift Down',
              accelerator: 'CmdOrCtrl+Shift+Down',
              click: cmd('edit:whole:shiftDown')
            },
            {
              label: 'Shift Left',
              accelerator: 'CmdOrCtrl+Shift+Left',
              click: cmd('edit:whole:shiftLeft')
            },
            {
              label: 'Shift Right',
              accelerator: 'CmdOrCtrl+Shift+Right',
              click: cmd('edit:whole:shiftRight')
            }
          ]
        }
      ]
    },
    {
      label: 'F&ont',
      submenu: [
        { label: 'Dimensions…', accelerator: 'CmdOrCtrl+D', click: cmd('font:dimensions') },
        { label: 'Guidelines…', accelerator: 'CmdOrCtrl+G', click: cmd('font:guidelines') },
        { type: 'separator' },
        { label: 'Add Codepoint…', accelerator: 'CmdOrCtrl+Shift+A', click: cmd('font:add') },
        { label: 'Add Codepoint Before', accelerator: 'CmdOrCtrl+[', click: cmd('font:addBefore') },
        { label: 'Add Codepoint After', accelerator: 'CmdOrCtrl+]', click: cmd('font:addAfter') },
        { label: 'Remove Codepoint', accelerator: 'CmdOrCtrl+Shift+D', click: cmd('font:remove') },
        { label: 'Renumber Codepoints…', click: cmd('font:renumber') },
        { label: 'Trim to Codepoint Range…', click: cmd('font:trimRange') },
        { type: 'separator' },
        {
          label: 'Fit Width to Ink (1px gap)',
          accelerator: 'CmdOrCtrl+T',
          click: cmd('font:fitWidth')
        },
        {
          label: 'Fit Width to Ink (tight)',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: cmd('font:fitWidthTight')
        },
        { label: 'Reset Width to Maximum', click: cmd('font:resetWidth') },
        { type: 'separator' },
        { label: 'Font Properties…', click: cmd('font:properties') }
      ]
    },
    {
      label: '&Helpers',
      submenu: [
        { label: 'Populate CP437 Table (SAM Coupe)', click: cmd('helpers:cp437Sam') },
        { label: 'Populate CP437 Table (stock)', click: cmd('helpers:cp437') },
        { type: 'separator' },
        { label: 'Populate ASCII 32-127 (SAM Coupe)', click: cmd('helpers:asciiSam') },
        { label: 'Populate ASCII 32-127 (standard)', click: cmd('helpers:ascii') },
        { type: 'separator' },
        { label: 'Edit Mapping for Glyph…', click: cmd('helpers:editMapping') },
        { label: 'Import Mapping…', click: cmd('helpers:importMapping') },
        { label: 'Export Mapping…', click: cmd('helpers:exportMapping') },
        // 'Fill From System Font…' (helpers:fillSystemFont) is disabled for now —
        // Canvas 2D has no access to a font's TrueType hinting, so glyphs
        // rasterised straight from an installed font look rougher than a proper
        // small-bitmap renderer would produce. The command, model/systemFont.ts
        // and ui/systemFontFill.ts are all still in place; re-add the menu item
        // above once there's a better rendering approach.
      ]
    },
    {
      label: '&View',
      submenu: [
        guideToggle('capHeight', 'Show Cap Height Guide'),
        guideToggle('xHeight', 'Show x-height Guide'),
        guideToggle('baseline', 'Show Baseline Guide'),
        { type: 'separator' },
        columnGuideToggle('leftColumn', 'Show Left Column Guide'),
        columnGuideToggle('rightColumn', 'Show Right Column Guide'),
        { type: 'separator' },
        {
          label: 'Preview: Black on White',
          type: 'checkbox',
          checked: viewState.previewInverted,
          click: (item) => {
            viewState.previewInverted = item.checked
            pushViewState(getWindow())
          }
        },
        { type: 'separator' },
        {
          label: 'Magnified Preview…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => openPreviewWindow(getWindow())
        },
        { type: 'separator' },
        { label: 'Previous Glyph', accelerator: 'CmdOrCtrl+Up', click: cmd('view:prev') },
        { label: 'Next Glyph', accelerator: 'CmdOrCtrl+Down', click: cmd('view:next') },
        { label: 'Clear Reference Glyph', click: cmd('view:clearReference') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'H&elp',
      submenu: [
        { label: 'User Guide', click: () => openDocsWindow('user-guide') },
        { label: 'File Formats Reference', click: () => openDocsWindow('file-formats') },
        { type: 'separator' },
        { label: 'Open Sample Fonts Folder', click: () => void shell.openPath(sampleFontsDir()) },
        { type: 'separator' },
        { label: `About ${app.getName()}`, click: cmd('help:about') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
