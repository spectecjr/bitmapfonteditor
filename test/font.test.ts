import { describe, expect, it } from 'vitest'
import {
  addCodepoint,
  buildFont,
  bytesPerLine,
  clampGuide,
  cloneFont,
  createDefaultMetadata,
  createFont,
  defaultBaseline,
  defaultLeftColumn,
  defaultRightColumn,
  defaultXHeight,
  definedCodepoints,
  isFixedWidth,
  populateFromCodepage,
  removeCodepoint,
  renumberCodepoints,
  resizeFont,
  resizeLosesData,
  trimCodepointRange
} from '../src/renderer/model/font'
import { setBit } from '../src/renderer/model/glyph'

describe('bytesPerLine', () => {
  it('follows the 1/2/3/4-byte bands from the spec', () => {
    expect(bytesPerLine(1)).toBe(1)
    expect(bytesPerLine(8)).toBe(1)
    expect(bytesPerLine(9)).toBe(2)
    expect(bytesPerLine(16)).toBe(2)
    expect(bytesPerLine(17)).toBe(3)
    expect(bytesPerLine(24)).toBe(3)
    expect(bytesPerLine(25)).toBe(4)
    expect(bytesPerLine(32)).toBe(4)
  })
})

describe('codepoint set', () => {
  it('stays sparse and sorted', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    addCodepoint(doc, 32)
    addCodepoint(doc, 200)
    expect(definedCodepoints(doc)).toEqual([32, 65, 200])

    removeCodepoint(doc, 65)
    expect(definedCodepoints(doc)).toEqual([32, 200])
  })

  it('trimCodepointRange discards glyphs outside the inclusive range, leaving the codepage alone', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 32)
    addCodepoint(doc, 65)
    addCodepoint(doc, 200)
    doc.codepage = { 32: ' ', 65: 'A', 200: 'È' }

    trimCodepointRange(doc, 40, 100)
    expect(definedCodepoints(doc)).toEqual([65])
    expect(doc.codepage).toEqual({ 32: ' ', 65: 'A', 200: 'È' })
  })

  it('renumberCodepoints closes gaps into a contiguous run, moving glyphs and mapping together', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 5)
    addCodepoint(doc, 10)
    addCodepoint(doc, 20)
    setBit(doc.glyphs[10]!, 8, 0, 0, true)
    doc.codepage = { 5: 'A', 20: 'B' } // 10 deliberately left unmapped

    renumberCodepoints(doc, 100)

    expect(definedCodepoints(doc)).toEqual([100, 101, 102])
    expect(doc.glyphs[101]!.rows[0]).toBe(0x80) // the glyph that used to be at 10
    expect(doc.codepage).toEqual({ 100: 'A', 102: 'B' })
    expect(doc.glyphs[5]).toBeUndefined()
    expect(doc.codepage[20]).toBeUndefined()
  })

  it('keeps existing artwork when populating from a codepage', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    setBit(doc.glyphs[65]!, 8, 0, 0, true)

    populateFromCodepage(doc, { 65: 'A', 66: 'B' })
    expect(doc.glyphs[65]!.rows[0]).toBe(0x80)
    expect(definedCodepoints(doc)).toEqual([65, 66])
    expect(doc.codepage[66]).toBe('B')
  })
})

describe('guidelines', () => {
  it('defaults to one descender row with a proportional x-height', () => {
    const doc = createFont(8, 8)
    expect(doc.baseline).toBe(7)
    expect(doc.xHeight).toBe(3)
    expect(doc.capHeight).toBe(0)

    expect(defaultBaseline(16)).toBe(15)
    expect(defaultXHeight(16)).toBe(7)
    // Degenerate cells must still produce guides inside the cell.
    expect(defaultBaseline(1)).toBe(0)
    expect(defaultXHeight(1)).toBe(0)
  })

  it('defaults the column guides to trimming one column from each side', () => {
    // The 6x8-on-an-8x8-grid case from the brief.
    const doc = createFont(8, 8)
    expect(doc.leftColumn).toBe(1)
    expect(doc.rightColumn).toBe(7)
    expect(doc.rightColumn - doc.leftColumn).toBe(6)

    expect(defaultLeftColumn(1)).toBe(1)
    expect(defaultRightColumn(1)).toBe(0)
  })

  it('defaults the column guides to hidden, and carries visibility through cloneFont', () => {
    const doc = createFont(8, 8)
    expect(doc.showLeftColumn).toBe(false)
    expect(doc.showRightColumn).toBe(false)

    doc.showLeftColumn = true
    const clone = cloneFont(doc)
    expect(clone.showLeftColumn).toBe(true)
    expect(clone.showRightColumn).toBe(false)
  })

  it('clamps to the cell as a row boundary, so height itself is legal', () => {
    expect(clampGuide(-3, 8)).toBe(0)
    expect(clampGuide(8, 8)).toBe(8) // the bottom edge
    expect(clampGuide(9, 8)).toBe(8)
    expect(clampGuide(3.4, 8)).toBe(3)
  })

  it('keeps its absolute row when the cell grows, and clamps when it shrinks', () => {
    const doc = createFont(8, 8)
    expect(doc.baseline).toBe(7)

    resizeFont(doc, 8, 16)
    expect(doc.baseline).toBe(7) // growth adds space below, it does not move the baseline
    expect(doc.xHeight).toBe(3)

    resizeFont(doc, 8, 4)
    expect(doc.baseline).toBe(4)
    expect(doc.xHeight).toBe(3)
  })

  it('clamps the column guides to the new width', () => {
    const doc = createFont(8, 8)
    expect(doc.rightColumn).toBe(7)

    resizeFont(doc, 4, 8)
    expect(doc.leftColumn).toBe(1)
    expect(doc.rightColumn).toBe(4) // clamped to the narrower cell

    resizeFont(doc, 12, 8)
    expect(doc.rightColumn).toBe(4) // absolute, like every other guide
  })
})

describe('metadata', () => {
  it('defaults to empty, unset dates', () => {
    expect(createDefaultMetadata()).toEqual({
      name: '',
      author: '',
      email: '',
      description: '',
      created: null,
      modified: null
    })
  })

  it('createFont accepts a partial override and fills in the rest', () => {
    const doc = createFont(8, 8, {}, { author: 'Simon', email: 'simon@example.com' })
    expect(doc.metadata).toEqual({ ...createDefaultMetadata(), author: 'Simon', email: 'simon@example.com' })
  })
})

describe('isFixedWidth', () => {
  it('is true for a font with no glyphs at all', () => {
    expect(isFixedWidth(createFont(8, 8))).toBe(true)
  })

  it('is true when every glyph is at the full cell width', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    addCodepoint(doc, 66)
    expect(isFixedWidth(doc)).toBe(true)
  })

  it('is false as soon as one glyph is narrower than the cell', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    addCodepoint(doc, 66)
    doc.glyphs[66]!.width = 5
    expect(isFixedWidth(doc)).toBe(false)
  })

  it('recovers to true once the narrow glyph is reset', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    doc.glyphs[65]!.width = 3
    expect(isFixedWidth(doc)).toBe(false)
    doc.glyphs[65]!.width = 8
    expect(isFixedWidth(doc)).toBe(true)
  })
})

describe('buildFont', () => {
  it('populates every codepoint in the inclusive range', () => {
    const doc = buildFont({ width: 8, height: 8, firstCodepoint: 65, lastCodepoint: 67, codepage: {} })
    expect(definedCodepoints(doc)).toEqual([65, 66, 67])
  })

  it('accepts the range given backwards', () => {
    const doc = buildFont({ width: 8, height: 8, firstCodepoint: 67, lastCodepoint: 65, codepage: {} })
    expect(definedCodepoints(doc)).toEqual([65, 66, 67])
  })

  it('allows a range past the old 255 ceiling', () => {
    const doc = buildFont({ width: 8, height: 8, firstCodepoint: 253, lastCodepoint: 258, codepage: {} })
    expect(definedCodepoints(doc)).toEqual([253, 254, 255, 256, 257, 258])
  })

  it('clips the range at 0 and the highest valid Unicode codepoint', () => {
    const doc = buildFont({ width: 8, height: 8, firstCodepoint: -5, lastCodepoint: 2, codepage: {} })
    expect(definedCodepoints(doc)).toEqual([0, 1, 2])

    const atCeiling = buildFont({
      width: 8,
      height: 8,
      firstCodepoint: 0x10fffe,
      lastCodepoint: 0x110000,
      codepage: {}
    })
    expect(definedCodepoints(atCeiling)).toEqual([0x10fffe, 0x10ffff])
  })

  it('carries the codepage and metadata through', () => {
    const doc = buildFont({
      width: 8,
      height: 8,
      firstCodepoint: 65,
      lastCodepoint: 65,
      codepage: { 65: 'A' },
      metadata: { name: 'Test Font' }
    })
    expect(doc.codepage[65]).toBe('A')
    expect(doc.metadata.name).toBe('Test Font')
  })
})

describe('resizeFont', () => {
  it('pads on the right and bottom when growing, keeping pixel positions', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    const glyph = doc.glyphs[65]!
    setBit(glyph, 8, 0, 0, true)
    setBit(glyph, 8, 7, 1, true)

    resizeFont(doc, 12, 10)

    expect(doc.width).toBe(12)
    expect(doc.height).toBe(10)
    expect(glyph.rows).toHaveLength(10)
    expect(glyph.rows[0]).toBe(1 << 11) // pixel 0 still leftmost
    expect(glyph.rows[1]).toBe(1 << 4) // pixel 7 unchanged
    expect(glyph.rows[9]).toBe(0)
  })

  it('crops from the right and bottom when shrinking', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    const glyph = doc.glyphs[65]!
    setBit(glyph, 8, 0, 0, true)
    setBit(glyph, 8, 7, 0, true)
    setBit(glyph, 8, 0, 7, true)

    resizeFont(doc, 4, 4)

    expect(glyph.rows).toHaveLength(4)
    expect(glyph.rows[0]).toBe(0b1000) // pixel 7 dropped, pixel 0 kept
    expect(glyph.width).toBe(4)
  })

  it('reports whether a resize would discard set pixels', () => {
    const doc = createFont(8, 8)
    addCodepoint(doc, 65)
    setBit(doc.glyphs[65]!, 8, 6, 6, true)

    expect(resizeLosesData(doc, 8, 8)).toBe(false)
    expect(resizeLosesData(doc, 8, 6)).toBe(true)
    expect(resizeLosesData(doc, 6, 8)).toBe(true)
    // The pixel sits at x=6,y=6, so a 7x7 cell still holds it.
    expect(resizeLosesData(doc, 7, 7)).toBe(false)
    expect(resizeLosesData(doc, 16, 16)).toBe(false)
  })
})
