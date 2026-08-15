import { contextBridge, ipcRenderer } from 'electron'
import type {
  EditorApi,
  ExportPayload,
  FileResult,
  UnsavedChoice,
  ViewState
} from '@shared/api'

/** Deliberately narrow: the renderer never sees `fs`, `path` or raw ipcRenderer. */
const api: EditorApi = {
  openProject: () => ipcRenderer.invoke('project:open') as Promise<FileResult | null>,
  saveProject: (text, currentPath, saveAs) =>
    ipcRenderer.invoke('project:save', text, currentPath, saveAs) as Promise<string | null>,
  exportFont: (payload: ExportPayload) =>
    ipcRenderer.invoke('font:export', payload) as Promise<string | null>,
  importMapping: () => ipcRenderer.invoke('mapping:import') as Promise<FileResult | null>,
  exportMapping: (text) => ipcRenderer.invoke('mapping:export', text) as Promise<string | null>,
  askUnsaved: (name) => ipcRenderer.invoke('dialog:unsaved', name) as Promise<UnsavedChoice>,
  error: (message, detail) => ipcRenderer.invoke('dialog:error', message, detail) as Promise<void>,
  setTitle: (title) => ipcRenderer.send('window:title', title),
  setDirty: (dirty) => ipcRenderer.send('window:dirty', dirty),
  forceClose: () => ipcRenderer.send('window:forceClose'),
  onCommand: (handler) => {
    ipcRenderer.on('menu:command', (_event, command: string) => handler(command))
  },
  onViewState: (handler) => {
    ipcRenderer.on('view:state', (_event, state: ViewState) => handler(state))
  }
}

contextBridge.exposeInMainWorld('api', api)
