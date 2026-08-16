/** Limits from design/project.md: at most 4 bytes per line, at most 32 lines deep. */
export const MIN_FONT_WIDTH = 1
export const MAX_FONT_WIDTH = 32
export const MIN_FONT_HEIGHT = 1
export const MAX_FONT_HEIGHT = 32
export const DEFAULT_FONT_WIDTH = 8
export const DEFAULT_FONT_HEIGHT = 8
export const MAX_BYTES_PER_LINE = 4

/** A font's codepoints (glyph slots) may be any valid Unicode scalar value. */
export const MAX_CODEPOINT = 0x10ffff

/**
 * A single character cell.
 *
 * `rows[y]` is a bitmask over the font's cell width: pixel `x` lives at bit
 * `fontWidth - 1 - x`, so the leftmost pixel is the most significant bit. Masks
 * are kept unsigned (`>>> 0`) so a 32px-wide font behaves like the others.
 *
 * `width` is the advance width — where the draggable marker sits. Pixels to its
 * right are retained here and in the project file, and only dropped at export.
 */
export interface Glyph {
  rows: number[]
  width: number
}

/**
 * Guidelines are font-wide metrics, not per-glyph, and they are guides only:
 * nothing clips or snaps to them, and they never affect the bitmap.
 *
 * Horizontal guides are *row boundaries* in 0..height measured from the top —
 * `baseline: 7` in an 8-line font means rows 0-6 sit above the line and row 7 is
 * descender space. Vertical guides are *column boundaries* in 0..width, and mark
 * a narrower cell inside the cell: with `leftColumn: 1` and `rightColumn: 7` on
 * an 8px cell you can draw a 6x8 font on an 8x8 grid and see exactly which
 * columns get trimmed.
 */
export type HorizontalGuide = 'capHeight' | 'xHeight' | 'baseline'
export type VerticalGuide = 'leftColumn' | 'rightColumn'
export type GuideName = HorizontalGuide | VerticalGuide

export const HORIZONTAL_GUIDES: readonly HorizontalGuide[] = ['capHeight', 'xHeight', 'baseline']
export const VERTICAL_GUIDES: readonly VerticalGuide[] = ['leftColumn', 'rightColumn']

export const GUIDE_LABELS: Readonly<Record<GuideName, string>> = {
  capHeight: 'Cap height',
  xHeight: 'x-height',
  baseline: 'Baseline',
  leftColumn: 'Left column',
  rightColumn: 'Right column'
}

/**
 * Descriptive information about the font, none of it mandatory and none of it
 * affecting the bitmap. `created`/`modified` are set by the save path, not by
 * whoever is editing the fields — first successful save stamps `created`, and
 * every save after that updates `modified`.
 *
 * Whether the font is fixed- or variable-width isn't stored here — it's
 * derived from the glyphs themselves (see `isFixedWidth` in model/font.ts), so
 * it can never drift out of sync with what the font actually is.
 */
export interface FontMetadata {
  name: string
  author: string
  email: string
  description: string
  created: string | null
  modified: string | null
}

/** The whole editable document. `glyphs` is sparse: any codepoint up to `MAX_CODEPOINT` may be absent. */
export interface FontDoc {
  version: 1
  /** Cell width in pixels, 1..32. Drives bytes-per-line for the exported bitmap. */
  width: number
  /** Cell height in lines, 1..32. */
  height: number
  /** Row boundary glyphs sit on. */
  baseline: number
  /** Row boundary where lowercase letters top out. */
  xHeight: number
  /** Row boundary where capitals top out. */
  capHeight: number
  /** Column boundary marking the first kept column of a narrower cell. */
  leftColumn: number
  /** Column boundary marking the end of the last kept column. */
  rightColumn: number
  /**
   * Whether the left/right column guides are currently shown. Saved with the
   * font rather than treated as a global app preference (unlike the three
   * horizontal guides): they only matter to fonts actually using the
   * narrower-cell-inside-a-wider-cell technique, so the setting travels with
   * the specific font it applies to. Defaults to hidden.
   */
  showLeftColumn: boolean
  showRightColumn: boolean
  glyphs: Record<number, Glyph>
  /** codepoint -> the Unicode character it represents, shown in the glyph list. */
  codepage: Record<number, string>
  metadata: FontMetadata
}
