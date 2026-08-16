import type { FontDoc } from './types'

export type PreviewZoom = 1 | 2 | 4
/** Square pixels, or half-width — for fonts designed against non-square hardware pixels. */
export type PixelAspect = 'square' | 'half'

export interface PreviewWindowSettings {
  width: number
  height: number
  zoom: PreviewZoom
  pixelAspect: PixelAspect
  /** Wrap the preview text at the window edge, rather than running off it on one line. */
  wrap: boolean
}

/** The surface the preview window's own preload exposes — deliberately separate from EditorApi. */
export interface PreviewWindowApi {
  getSettings(): Promise<PreviewWindowSettings>
  setZoom(zoom: PreviewZoom): void
  setPixelAspect(aspect: PixelAspect): void
  setWrap(wrap: boolean): void
  onData(handler: (doc: FontDoc, text: string) => void): void
}

declare global {
  interface Window {
    previewApi: PreviewWindowApi
  }
}
