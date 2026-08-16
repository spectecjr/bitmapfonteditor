import type { HorizontalGuide } from './types'

/**
 * View preferences. These live in the main process because the menu checkboxes
 * are the only way to change them — keeping one source of truth means the ticks
 * can never disagree with what is drawn.
 *
 * The column guides are deliberately absent here — their visibility is
 * per-document (`FontDoc.showLeftColumn`/`showRightColumn`), not a global app
 * preference, so it can be saved with the font. See `syncColumnGuideVisibility`.
 */
export interface ViewState {
  guides: Record<HorizontalGuide, boolean>
  /** Draw the preview strip as black ink on white rather than white on black. */
  previewInverted: boolean
}

/** The surface the preload exposes to the renderer. All filesystem work happens in main. */

export interface FileResult {
  path: string
  text: string
}

/** Raw bytes rather than text — `FileResult.text` assumes UTF-8, which a binary font dump isn't. */
export interface BinaryFileResult {
  path: string
  bytes: Uint8Array
}

export interface ExportPayload {
  bin: Uint8Array
  widths: string
  mapping: string
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface EditorApi {
  openProject(): Promise<FileResult | null>
  /**
   * Returns the path written, or null if the user cancelled. `fontName`, if
   * given, only ever seeds the save dialog's suggested filename on the very
   * first save — once `currentPath` is set, that always wins instead.
   */
  saveProject(
    text: string,
    currentPath: string | null,
    saveAs: boolean,
    fontName?: string
  ): Promise<string | null>
  /** Picks a base path and writes `<base>.bin`, `<base>.widths.json`, `<base>.map.json`. */
  exportFont(payload: ExportPayload): Promise<string | null>
  /** Opens a file picker and reads it back as raw bytes, for Import Raw Font Bitmap. */
  importRawFont(): Promise<BinaryFileResult | null>
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
  /**
   * Rebuilds the View menu's column-guide checkboxes to match the current
   * document — needed because that visibility now lives on the FontDoc, which
   * can be replaced wholesale (New Font, Open Font, Undo/Redo) independently
   * of the menu.
   */
  syncColumnGuideVisibility(leftColumn: boolean, rightColumn: boolean): void
}

declare global {
  interface Window {
    api: EditorApi
  }
}
