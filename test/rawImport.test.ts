import { describe, expect, it } from 'vitest'
import { MAX_CODEPOINT } from '../src/shared/types'
import { estimateImport, importRawFont } from '../src/renderer/io/rawImport'

describe('estimateImport', () => {
  it('divides evenly for a file that is a whole number of characters', () => {
    const est = estimateImport(768, { startCode: 32, linesPerChar: 8, bytesPerLine: 1 })
    expect(est).toEqual({ bytesPerChar: 8, charCount: 96, remainderBytes: 0, lastCodepoint: 127, overflow: 0 })
  })

  it('rounds up and reports the remainder for a short final character', () => {
    const est = estimateImport(20, { startCode: 32, linesPerChar: 8, bytesPerLine: 1 })
    expect(est.bytesPerChar).toBe(8)
    expect(est.charCount).toBe(3) // 16 bytes for 2, 4 left over padded to a 3rd
    expect(est.remainderBytes).toBe(4)
  })

  it('reports overflow once the range runs past the highest valid codepoint', () => {
    const startCode = MAX_CODEPOINT - 99
    const est = estimateImport(8 * 200, { startCode, linesPerChar: 8, bytesPerLine: 1 })
    expect(est.charCount).toBe(200)
    expect(est.lastCodepoint).toBe(MAX_CODEPOINT + 100)
    expect(est.overflow).toBe(100) // 100 characters land past MAX_CODEPOINT
  })

  it('is zero characters for an empty file', () => {
    expect(estimateImport(0, { startCode: 32, linesPerChar: 8, bytesPerLine: 1 })).toEqual({
      bytesPerChar: 8,
      charCount: 0,
      remainderBytes: 0,
      lastCodepoint: 31,
      overflow: 0
    })
  })
})

describe('importRawFont — row layout', () => {
  it('reads bytes MSB-first, matching the app’s own .bin format', () => {
    // A checkmark-ish 8x8: one pixel top-left, one pixel bottom-right.
    const bytes = new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0x01])
    const result = importRawFont(bytes, { startCode: 65, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })

    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    expect(result.glyphs).toHaveLength(1)
    expect(result.glyphs[0]).toEqual({ code: 65, glyph: { rows: [0x80, 0, 0, 0, 0, 0, 0, 0x01], width: 8 } })
  })

  it('packs multi-byte-wide rows in file order, first byte = leftmost 8px', () => {
    const bytes = new Uint8Array([0xff, 0x01]) // one row, 16px wide
    const result = importRawFont(bytes, { startCode: 0, linesPerChar: 1, bytesPerLine: 2, layout: 'row' })
    expect(result.width).toBe(16)
    expect(result.glyphs[0]!.glyph.rows[0]).toBe(0xff01)
  })

  it('assigns sequential codepoints starting at startCode', () => {
    const bytes = new Uint8Array(8 * 3)
    const result = importRawFont(bytes, { startCode: 32, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })
    expect(result.glyphs.map((g) => g.code)).toEqual([32, 33, 34])
  })

  it('pads a short final character with zeroes rather than dropping it', () => {
    const bytes = new Uint8Array([0x80, 0, 0, 0]) // 4 of the 8 bytes a char needs
    const result = importRawFont(bytes, { startCode: 0, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })
    expect(result.paddedWithZeroes).toBe(true)
    expect(result.charCount).toBe(1)
    expect(result.glyphs[0]!.glyph.rows).toEqual([0x80, 0, 0, 0, 0, 0, 0, 0])
  })

  it('does not report padding when the file divides evenly', () => {
    const bytes = new Uint8Array(16)
    const result = importRawFont(bytes, { startCode: 0, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })
    expect(result.paddedWithZeroes).toBe(false)
  })

  it('drops characters that would land past the highest valid codepoint', () => {
    const bytes = new Uint8Array(8 * 3)
    const startCode = MAX_CODEPOINT - 1
    const result = importRawFont(bytes, { startCode, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })
    expect(result.glyphs.map((g) => g.code)).toEqual([MAX_CODEPOINT - 1, MAX_CODEPOINT])
    expect(result.droppedOverflow).toBe(1)
  })
})

describe('importRawFont — column layout', () => {
  it('is identical to row layout when the font is one byte wide', () => {
    const bytes = new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0x01])
    const row = importRawFont(bytes, { startCode: 0, linesPerChar: 8, bytesPerLine: 1, layout: 'row' })
    const column = importRawFont(bytes, { startCode: 0, linesPerChar: 8, bytesPerLine: 1, layout: 'column' })
    expect(column.glyphs).toEqual(row.glyphs)
  })

  it('transposes byte-columns for a multi-byte-wide font', () => {
    // 16px wide, 2 lines tall. Column-major file order: byte-column 0's 2 rows,
    // then byte-column 1's 2 rows.
    const bytes = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])
    const result = importRawFont(bytes, { startCode: 0, linesPerChar: 2, bytesPerLine: 2, layout: 'column' })
    // Row 0 = (byte-col 0 row 0) 0xaa, (byte-col 1 row 0) 0xcc -> 0xaacc
    // Row 1 = (byte-col 0 row 1) 0xbb, (byte-col 1 row 1) 0xdd -> 0xbbdd
    expect(result.glyphs[0]!.glyph.rows).toEqual([0xaacc, 0xbbdd])
  })
})
