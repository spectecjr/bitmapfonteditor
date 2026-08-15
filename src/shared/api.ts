import type { GuideName } from './types'

/**
 * View preferences. These live in the main process because the menu checkboxes
 * are the only way to change them — keeping one source of truth means the ticks
 * can never disagree with what is drawn.
 */
export interface ViewState {
  guides: Record<GuideName, boolean>
  /** Draw the preview strip as black ink on white rather than white on black. */
  previewInverted: boolean
}

/** The surface the preload exposes to the renderer. All filesystem work happens in main. */

export interface FileResult {
  path: string
  text: string
}

export interface ExportPayload {
  bin: Uint8Array
  widths: string
  mapping: string
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface EditorApi {
  openProject(): Promise<FileResult | null>
  /** Returns the path written, or null if the user cancelled. */
  saveProject(text: string, currentPath: string | null, saveAs: boolean): Promise<string | null>
  /** Picks a base path and writes `<base>.bin`, `<base>.widths.json`, `<base>.map.json`. */
  exportFont(payload: ExportPayload): Promise<string | null>
  importMapping(): Promise<FileResult | null>
  exportMapping(text: string): Promise<string | null>
  askUnsaved(name: string): Promise<UnsavedChoice>
  error(message: string, detail?: string): Promise<void>
  setTitle(title: string): void
  /** Lets main know whether closing the window needs a prompt. */
  setDirty(dirty: boolean): void
  /** Close the window without the unsaved-changes prompt. */
  forceClose(): void
  onCommand(handler: (command: string) => void): void
  onViewState(handler: (state: ViewState) => void): void
}

declare global {
  interface Window {
    api: EditorApi
  }
}
