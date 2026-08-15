import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ExportPayload, FileResult, UnsavedChoice } from '@shared/api'

interface IpcContext {
  getWindow: () => BrowserWindow | null
  setDirty: (dirty: boolean) => void
  approveClose: () => void
}

const PROJECT_FILTERS = [
  { name: 'Font Editor Project', extensions: ['fnt.json', 'json'] },
  { name: 'All Files', extensions: ['*'] }
]

const MAPPING_FILTERS = [
  { name: 'Codepoint Mapping', extensions: ['map.json', 'json'] },
  { name: 'All Files', extensions: ['*'] }
]

/** Strips a trailing `.bin`/`.json` so "myfont.bin" and "myfont" both yield "myfont". */
function stripExtension(path: string): string {
  const ext = extname(path)
  if (!ext) return path
  return join(dirname(path), basename(path, ext))
}

export function registerIpc({ getWindow, setDirty, approveClose }: IpcContext): void {
  ipcMain.handle('project:open', async (): Promise<FileResult | null> => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Font Project',
      properties: ['openFile'],
      filters: PROJECT_FILTERS
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]!
    return { path, text: await readFile(path, 'utf8') }
  })

  ipcMain.handle(
    'project:save',
    async (_event, text: string, currentPath: string | null, saveAs: boolean) => {
      const window = getWindow()
      if (!window) return null
      let path = currentPath
      if (!path || saveAs) {
        const result = await dialog.showSaveDialog(window, {
          title: 'Save Font Project',
          defaultPath: path ?? 'untitled.fnt.json',
          filters: PROJECT_FILTERS
        })
        if (result.canceled || !result.filePath) return null
        path = result.filePath
      }
      await writeFile(path, text, 'utf8')
      return path
    }
  )

  ipcMain.handle('font:export', async (_event, payload: ExportPayload) => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Font',
      defaultPath: 'font.bin',
      filters: [
        { name: '1bpp Bitmap', extensions: ['bin'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return null

    const base = stripExtension(result.filePath)
    await writeFile(`${base}.bin`, Buffer.from(payload.bin))
    await writeFile(`${base}.widths.json`, payload.widths, 'utf8')
    await writeFile(`${base}.map.json`, payload.mapping, 'utf8')
    return base
  })

  ipcMain.handle('mapping:import', async (): Promise<FileResult | null> => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: 'Import Codepoint Mapping',
      properties: ['openFile'],
      filters: MAPPING_FILTERS
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]!
    return { path, text: await readFile(path, 'utf8') }
  })

  ipcMain.handle('mapping:export', async (_event, text: string) => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Codepoint Mapping',
      defaultPath: 'font.map.json',
      filters: MAPPING_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, text, 'utf8')
    return result.filePath
  })

  ipcMain.handle('dialog:unsaved', async (_event, name: string): Promise<UnsavedChoice> => {
    const window = getWindow()
    if (!window) return 'cancel'
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved Changes',
      message: `Save changes to ${name}?`,
      detail: 'Your changes will be lost if you do not save them.'
    })
    if (response === 0) return 'save'
    if (response === 1) return 'discard'
    return 'cancel'
  })

  ipcMain.handle('dialog:error', async (_event, message: string, detail?: string) => {
    const window = getWindow()
    if (!window) return
    await dialog.showMessageBox(window, {
      type: 'error',
      buttons: ['OK'],
      title: 'Font Editor',
      message,
      ...(detail ? { detail } : {})
    })
  })

  ipcMain.on('window:title', (_event, title: string) => {
    getWindow()?.setTitle(title)
  })

  ipcMain.on('window:dirty', (_event, dirty: boolean) => {
    setDirty(Boolean(dirty))
  })

  ipcMain.on('window:forceClose', () => {
    approveClose()
    getWindow()?.close()
  })
}
