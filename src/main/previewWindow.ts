import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import type { FontDoc } from '@shared/types'
import type { PixelAspect, PreviewZoom } from '@shared/previewApi'
import { getSettings, updatePreviewWindowSettings } from './settings'

/**
 * View ▸ Magnified Preview — a separate window showing the same preview text
 * at a user-chosen zoom and pixel aspect, sized and positioned independently
 * of the main editor. Only one is ever open at a time.
 */
let previewWin: BrowserWindow | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

/** The last data pushed from the editor, resent to a freshly (re)opened window. */
let latestDoc: FontDoc | null = null
let latestText = ''

export function openPreviewWindow(parent: BrowserWindow | null): void {
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.focus()
    return
  }

  const { width, height } = getSettings().previewWindow
  const window = new BrowserWindow({
    width,
    height,
    minWidth: 160,
    minHeight: 96,
    show: false,
    backgroundColor: '#17181b',
    title: 'Magnified Preview — Font Editor',
    // A child of the main window, not modal — it can lose focus and stay open,
    // but it's never orphaned: closing the main window takes this with it (see
    // both the `parent` relationship here and the explicit close forced from
    // main/index.ts, since relying on `parent` alone isn't cross-platform sure).
    ...(parent ? { parent, modal: false } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/previewWindow.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // Nothing here duplicates the main window's menu — just a way to close it
  // without reaching for the mouse.
  window.setMenu(Menu.buildFromTemplate([{ label: '&Window', submenu: [{ role: 'close' }] }]))
  previewWin = window

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    previewWin = null
  })

  window.webContents.on('did-finish-load', () => {
    if (latestDoc) window.webContents.send('preview:data', latestDoc, latestText)
  })

  // Debounced so dragging the window edge doesn't hammer disk with every pixel.
  window.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const [w, h] = window.getContentSize()
      updatePreviewWindowSettings({ width: w, height: h })
    }, 400)
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(`${devServerUrl}/previewWindow.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/previewWindow.html'))
  }
}

/** Called when the main window closes, so the preview never outlives it. */
export function closePreviewWindow(): void {
  if (previewWin && !previewWin.isDestroyed()) previewWin.close()
}

/** Called from the main window's IPC whenever the font or preview text changes. */
export function pushPreviewData(doc: FontDoc, text: string): void {
  latestDoc = doc
  latestText = text
  previewWin?.webContents.send('preview:data', doc, text)
}

export function registerPreviewWindowIpc(): void {
  ipcMain.handle('preview:getSettings', () => getSettings().previewWindow)
  ipcMain.on('preview:setZoom', (_event, zoom: PreviewZoom) => {
    updatePreviewWindowSettings({ zoom })
  })
  ipcMain.on('preview:setPixelAspect', (_event, aspect: PixelAspect) => {
    updatePreviewWindowSettings({ pixelAspect: aspect })
  })
  ipcMain.on('preview:setWrap', (_event, wrap: boolean) => {
    updatePreviewWindowSettings({ wrap })
  })
  ipcMain.on('preview:push', (_event, doc: FontDoc, text: string) => {
    pushPreviewData(doc, text)
  })
}
