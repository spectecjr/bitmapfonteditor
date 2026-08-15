import { describe, expect, it } from 'vitest'
import {
  buildMapping,
  buildWidths,
  exportBitmap,
  packGlyph,
  parseMapping,
  serializeMapping,
  unpackGlyphToAscii
} from '../src/renderer/io/export'
import { addCodepoint, createFont } from '../src/renderer/model/font'
import { setBit } from '../src/renderer/model/glyph'

const glyphOf = (rows: number[], width: number) => ({ rows: rows.slice(), width })

describe('packGlyph', () => {
  it('writes the leftmost pixel to bit 7 of the first byte', () => {
    const bytes = packGlyph(glyphOf([0b10000001, 0b01000010], 8), 8, 2)
    expect([...bytes]).toEqual([0x81, 0x42])
  })

  it('left-aligns cells narrower than a byte', () => {
    // 5px cell: pixels 0 and 4 set, packed into one byte as 1000 1000.
    const bytes = packGlyph(glyphOf([0b10001], 5), 5, 1)
    expect([...bytes]).toEqual([0x88])
  })

  it('spreads wide cells over the right number of bytes', () => {
    const twelve = packGlyph(glyphOf([1 << 11], 12), 12, 1)
    expect([...twelve]).toEqual([0x80, 0x00])

    // 32px is the widest cell and exercises the unsigned-shift path.
    const thirtyTwo = packGlyph(glyphOf([0x80000001], 32), 32, 1)
    expect([...thirtyTwo]).toEqual([0x80, 0x00, 0x00, 0x01])
  })

  it('zeroes pixels at or past the advance width', () => {
    const bytes = packGlyph(glyphOf([0xff, 0xff], 3), 8, 2)
    expect([...bytes]).toEqual([0xe0, 0xe0])
  })

  it('round-trips through the ASCII decoder', () => {
    const glyph = glyphOf([0b10010000, 0b01100000], 8)
    const bytes = packGlyph(glyph, 8, 2)
    expect(unpackGlyphToAscii(bytes, 0, 8, 2)).toEqual(['#..#....', '.##.....'])
  })
})

describe('exportBitmap', () => {
  it('emits glyphs in ascending codepoint order at a fixed stride', () => {
    const doc = createFont(8, 2)
    addCodepoint(doc, 66)
    addCodepoint(doc, 65)
    setBit(doc.glyphs[65]!, 8, 0, 0, true)
    setBit(doc.glyphs[66]!, 8, 7, 1, true)

    const bin = exportBitmap(doc)
    expect(bin).toHaveLength(4) // 2 glyphs x 1 byte/line x 2 lines
    expect([...bin]).toEqual([0x80, 0x00, 0x00, 0x01])
  })
})

describe('widths sidecar', () => {
  it('keeps codepoints and widths index-aligned with the binary', () => {
    const doc = createFont(12, 8)
    addCodepoint(doc, 32)
    addCodepoint(doc, 65)
    doc.glyphs[32]!.width = 3
    doc.glyphs[65]!.width = 9

    doc.baseline = 6
    doc.xHeight = 2
    doc.capHeight = 1
    doc.leftColumn = 2
    doc.rightColumn = 10

    const widths = buildWidths(doc)
    expect(widths).toMatchObject({
      version: 1,
      width: 12,
      height: 8,
      baseline: 6,
      xHeight: 2,
      capHeight: 1,
      leftColumn: 2,
      rightColumn: 10,
      bytesPerLine: 2,
      bytesPerGlyph: 16,
      count: 2,
      codepoints: [32, 65],
      widths: [3, 9]
    })
  })
})

describe('mapping sidecar', () => {
  it('labels each entry with its Unicode codepoint', () => {
    const mapping = buildMapping({ 0x60: '£', 0x41: 'A' })
    expect(mapping.entries).toEqual([
      { code: 0x41, char: 'A', unicode: 'U+0041' },
      { code: 0x60, char: '£', unicode: 'U+00A3' }
    ])
  })

  it('round-trips through parseMapping', () => {
    const original = { 0x41: 'A', 0x7f: '©' }
    expect(parseMapping(serializeMapping(original))).toEqual(original)
  })

  it('rejects malformed files', () => {
    expect(() => parseMapping('{"version":2,"entries":[]}')).toThrow(/version/)
    expect(() => parseMapping('{"version":1}')).toThrow(/entries/)
    expect(() => parseMapping('{"version":1,"entries":[{"code":999,"char":"x"}]}')).toThrow(/0\.\.255/)
  })
})
