import {
  DEFAULT_FONT_HEIGHT,
  DEFAULT_FONT_WIDTH,
  MAX_BYTES_PER_LINE,
  MAX_FONT_HEIGHT,
  MAX_FONT_WIDTH,
  MIN_FONT_HEIGHT,
  MIN_FONT_WIDTH,
  type FontDoc,
  type Glyph
} from '@shared/types'
import { cloneGlyph, createGlyph, createRows, widthMask } from './glyph'

/** 1-8px wide -> 1 byte per line, 9-16 -> 2, and so on, capped at 4. */
export function bytesPerLine(fontWidth: number): number {
  return Math.min(MAX_BYTES_PER_LINE, Math.max(1, Math.ceil(fontWidth / 8)))
}

export function clampWidth(width: number): number {
  return Math.min(MAX_FONT_WIDTH, Math.max(MIN_FONT_WIDTH, Math.round(width)))
}

export function clampHeight(height: number): number {
  return Math.min(MAX_FONT_HEIGHT, Math.max(MIN_FONT_HEIGHT, Math.round(height)))
}

/** Guides are row boundaries, so 0..height inclusive — height itself is the bottom edge. */
export function clampGuide(row: number, height: number): number {
  return Math.min(height, Math.max(0, Math.round(row)))
}

/** One row of descender space by default. */
export function defaultBaseline(height: number): number {
  return Math.max(0, clampHeight(height) - 1)
}

/** Roughly 55% of the cap height, which is the usual proportion for a text face. */
export function defaultXHeight(height: number): number {
  const baseline = defaultBaseline(height)
  return Math.max(0, baseline - Math.max(1, Math.round(baseline * 0.55)))
}

/** Capitals fill everything above the baseline by default. */
export function defaultCapHeight(_height: number): number {
  return 0
}

/** Trims one column from each side — the 6x8-on-an-8x8-grid case. */
export function defaultLeftColumn(width: number): number {
  return Math.min(1, clampWidth(width))
}

export function defaultRightColumn(width: number): number {
  return Math.max(0, clampWidth(width) - 1)
}

export function createFont(
  width = DEFAULT_FONT_WIDTH,
  height = DEFAULT_FONT_HEIGHT,
  codepage: Record<number, string> = {}
): FontDoc {
  const cellWidth = clampWidth(width)
  const cellHeight = clampHeight(height)
  return {
    version: 1,
    width: cellWidth,
    height: cellHeight,
    baseline: defaultBaseline(cellHeight),
    xHeight: defaultXHeight(cellHeight),
    capHeight: defaultCapHeight(cellHeight),
    leftColumn: defaultLeftColumn(cellWidth),
    rightColumn: defaultRightColumn(cellWidth),
    glyphs: {},
    codepage
  }
}

export function cloneFont(doc: FontDoc): FontDoc {
  const glyphs: Record<number, Glyph> = {}
  for (const [code, glyph] of Object.entries(doc.glyphs)) {
    glyphs[Number(code)] = cloneGlyph(glyph)
  }
  return {
    version: 1,
    width: doc.width,
    height: doc.height,
    baseline: doc.baseline,
    xHeight: doc.xHeight,
    capHeight: doc.capHeight,
    leftColumn: doc.leftColumn,
    rightColumn: doc.rightColumn,
    glyphs,
    codepage: { ...doc.codepage }
  }
}

/** Defined codepoints in ascending order — the sequence used by the exported bitmap. */
export function definedCodepoints(doc: FontDoc): number[] {
  return Object.keys(doc.glyphs)
    .map(Number)
    .sort((a, b) => a - b)
}

export function addCodepoint(doc: FontDoc, code: number): void {
  if (doc.glyphs[code]) return
  doc.glyphs[code] = createGlyph(doc.width, doc.height)
}

export function removeCodepoint(doc: FontDoc, code: number): void {
  delete doc.glyphs[code]
}

/** True when the requested dimensions would discard set pixels. */
export function resizeLosesData(doc: FontDoc, width: number, height: number): boolean {
  const dropped = doc.width - width
  const droppedMask = dropped > 0 ? widthMask(dropped) : 0
  for (const glyph of Object.values(doc.glyphs)) {
    for (let y = 0; y < glyph.rows.length; y++) {
      const row = glyph.rows[y]!
      if (y >= height && row !== 0) return true
      if (dropped > 0 && (row & droppedMask) !== 0) return true
    }
  }
  return false
}

/**
 * Crops or pads every glyph to new dimensions. Growth adds blank rows at the
 * bottom and blank columns at the right; shrinking discards them.
 */
export function resizeFont(doc: FontDoc, width: number, height: number): void {
  const newWidth = clampWidth(width)
  const newHeight = clampHeight(height)
  const delta = newWidth - doc.width
  const mask = widthMask(newWidth)

  for (const glyph of Object.values(doc.glyphs)) {
    const rows = createRows(newHeight)
    const copied = Math.min(newHeight, glyph.rows.length)
    for (let y = 0; y < copied; y++) {
      const row = glyph.rows[y]!
      const aligned = delta >= 0 ? (row << delta) >>> 0 : row >>> -delta
      rows[y] = (aligned & mask) >>> 0
    }
    glyph.rows = rows
    glyph.width = Math.min(glyph.width, newWidth)
  }

  doc.width = newWidth
  doc.height = newHeight
  // Guides keep their absolute position, so growing the cell adds space beyond
  // them rather than dragging them along.
  doc.baseline = clampGuide(doc.baseline, newHeight)
  doc.xHeight = clampGuide(doc.xHeight, newHeight)
  doc.capHeight = clampGuide(doc.capHeight, newHeight)
  doc.leftColumn = clampGuide(doc.leftColumn, newWidth)
  doc.rightColumn = clampGuide(doc.rightColumn, newWidth)
}

/** Populates the document with one blank glyph per codepoint in the map, keeping existing art. */
export function populateFromCodepage(doc: FontDoc, codepage: Record<number, string>): void {
  doc.codepage = { ...codepage }
  for (const key of Object.keys(codepage)) {
    addCodepoint(doc, Number(key))
  }
}
