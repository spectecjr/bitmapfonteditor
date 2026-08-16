import { contextBridge, ipcRenderer } from 'electron'
import type { FontDoc } from '@shared/types'
import type { PixelAspect, PreviewWindowApi, PreviewWindowSettings, PreviewZoom } from '@shared/previewApi'

/** Deliberately narrower than the main EditorApi — this window only ever displays. */
const api: PreviewWindowApi = {
  getSettings: () => ipcRenderer.invoke('preview:getSettings') as Promise<PreviewWindowSettings>,
  setZoom: (zoom: PreviewZoom) => ipcRenderer.send('preview:setZoom', zoom),
  setPixelAspect: (aspect: PixelAspect) => ipcRenderer.send('preview:setPixelAspect', aspect),
  setWrap: (wrap: boolean) => ipcRenderer.send('preview:setWrap', wrap),
  onData: (handler) => {
    ipcRenderer.on('preview:data', (_event, doc: FontDoc, text: string) => handler(doc, text))
  }
}

contextBridge.exposeInMainWorld('previewApi', api)
