import type { FontDoc, Glyph } from '@shared/types'

/**
 * Copied glyph art. The cell width it was copied at travels with it so a paste
 * after a font resize can re-align the bits instead of smearing them.
 */
export interface ClipboardEntry {
  rows: number[]
  width: number
  fontWidth: number
}

export interface AppState {
  doc: FontDoc
  /** Selected codepoint, or null when the font has no glyphs at all. */
  selected: number | null
  /** Shift-clicked codepoint drawn as a ghost behind the selection, if any. */
  reference: number | null
  projectPath: string | null
  dirty: boolean
  clipboard: ClipboardEntry | null
  previewText: string
}

/**
 * Deliberately tiny. The document is mutated in place and the views are
 * repainted explicitly by `refresh()`; undo is handled by snapshots in History
 * rather than by immutable state, so there is nothing here to diff.
 */
export class Store {
  constructor(private readonly state: AppState) {}

  get(): AppState {
    return this.state
  }

  get doc(): FontDoc {
    return this.state.doc
  }

  /** The glyph for the current selection, or null if nothing is selected. */
  get glyph(): Glyph | null {
    const { doc, selected } = this.state
    if (selected === null) return null
    return doc.glyphs[selected] ?? null
  }

  /** The ghost glyph, or null when unset or pointing at the selection itself. */
  get referenceGlyph(): Glyph | null {
    const { doc, reference, selected } = this.state
    if (reference === null || reference === selected) return null
    return doc.glyphs[reference] ?? null
  }
}
