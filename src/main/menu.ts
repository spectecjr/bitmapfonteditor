import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { ViewState } from '@shared/api'
import type { GuideName } from '@shared/types'

/**
 * View preferences live here rather than in the renderer: the menu ticks are the
 * only way to change them, so main is the single source of truth and pushes the
 * whole object down whenever it changes.
 *
 * The column guides start hidden — they only matter when you are designing a
 * narrow font inside a wider grid.
 */
const viewState: ViewState = {
  guides: {
    capHeight: true,
    xHeight: true,
    baseline: true,
    leftColumn: false,
    rightColumn: false
  },
  previewInverted: false
}

export function currentViewState(): ViewState {
  return viewState
}

export function pushViewState(window: BrowserWindow | null): void {
  window?.webContents.send('view:state', viewState)
}

/**
 * Every item just forwards a command string to the renderer, which routes it
 * through the same `dispatch()` the keyboard shortcuts use.
 */
function send(getWindow: () => BrowserWindow | null, command: string): () => void {
  return () => getWindow()?.webContents.send('menu:command', command)
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
  const guideToggle = (guide: GuideName, label: string): MenuItemConstructorOptions => ({
    label,
    type: 'checkbox',
    checked: viewState.guides[guide],
    click: (item) => {
      viewState.guides[guide] = item.checked
      pushViewState(getWindow())
    }
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'New Font', accelerator: 'CmdOrCtrl+N', click: cmd('file:new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: cmd('file:open') },
        { type: 'separator' },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: cmd('file:save') },
        { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('file:saveAs') },
        { type: 'separator' },
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
        { label: 'Shift Right', accelerator: 'Alt+Right', click: cmd('edit:shiftRight') }
      ]
    },
    {
      label: 'F&ont',
      submenu: [
        { label: 'Dimensions…', accelerator: 'CmdOrCtrl+D', click: cmd('font:dimensions') },
        { label: 'Guidelines…', accelerator: 'CmdOrCtrl+G', click: cmd('font:guidelines') },
        { type: 'separator' },
        { label: 'Add Codepoint…', accelerator: 'CmdOrCtrl+Shift+A', click: cmd('font:add') },
        { label: 'Remove Codepoint', accelerator: 'CmdOrCtrl+Shift+D', click: cmd('font:remove') },
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
        { label: 'Reset Width to Maximum', click: cmd('font:resetWidth') }
      ]
    },
    {
      label: '&Helpers',
      submenu: [
        { label: 'Populate CP437 Table (SAM Coupe)', click: cmd('helpers:cp437Sam') },
        { label: 'Populate CP437 Table (stock)', click: cmd('helpers:cp437') },
        { type: 'separator' },
        { label: 'Edit Mapping for Glyph…', click: cmd('helpers:editMapping') },
        { label: 'Import Mapping…', click: cmd('helpers:importMapping') },
        { label: 'Export Mapping…', click: cmd('helpers:exportMapping') }
      ]
    },
    {
      label: '&View',
      submenu: [
        guideToggle('capHeight', 'Show Cap Height Guide'),
        guideToggle('xHeight', 'Show x-height Guide'),
        guideToggle('baseline', 'Show Baseline Guide'),
        { type: 'separator' },
        guideToggle('leftColumn', 'Show Left Column Guide'),
        guideToggle('rightColumn', 'Show Right Column Guide'),
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
      submenu: [{ label: `About ${app.getName()}`, click: cmd('help:about') }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
