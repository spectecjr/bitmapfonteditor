import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from '../src/renderer/io/project'
import { addCodepoint, createFont } from '../src/renderer/model/font'
import { setBit } from '../src/renderer/model/glyph'

function sampleDoc() {
  const doc = createFont(12, 6, { 65: 'A', 0x60: '£' })
  addCodepoint(doc, 65)
  addCodepoint(doc, 0x60)
  const a = doc.glyphs[65]!
  setBit(a, 12, 0, 0, true)
  setBit(a, 12, 11, 5, true) // deliberately past the advance width set below
  a.width = 5
  return doc
}

describe('project round trip', () => {
  it('restores the document exactly, including pixels past the advance marker', () => {
    const doc = sampleDoc()
    const restored = parseProject(serializeProject(doc))

    expect(restored).toEqual(doc)
    expect(restored.glyphs[65]!.width).toBe(5)
    // Pixel 11 lives beyond the marker and must survive the save.
    expect(restored.glyphs[65]!.rows[5]).toBe(1)
  })

  it('persists every guideline', () => {
    const doc = sampleDoc()
    doc.baseline = 4
    doc.xHeight = 1
    doc.capHeight = 0
    doc.leftColumn = 2
    doc.rightColumn = 10

    const restored = parseProject(serializeProject(doc))
    expect(restored).toMatchObject({
      baseline: 4,
      xHeight: 1,
      capHeight: 0,
      leftColumn: 2,
      rightColumn: 10
    })
  })

  it('defaults each guideline for projects saved before it existed', () => {
    const legacy = JSON.parse(serializeProject(sampleDoc()))
    delete legacy.baseline
    delete legacy.xHeight
    delete legacy.capHeight
    delete legacy.leftColumn
    delete legacy.rightColumn

    // 12x6 cell: one descender row, and one column trimmed from each side.
    const restored = parseProject(JSON.stringify(legacy))
    expect(restored).toMatchObject({
      baseline: 5,
      xHeight: 2,
      capHeight: 0,
      leftColumn: 1,
      rightColumn: 11
    })
  })

  it('rejects guidelines outside the cell', () => {
    const badRow = JSON.parse(serializeProject(sampleDoc()))
    badRow.baseline = 99
    expect(() => parseProject(JSON.stringify(badRow))).toThrow(/baseline/)

    // Column guides are bounded by the width, not the height.
    const badColumn = JSON.parse(serializeProject(sampleDoc()))
    badColumn.rightColumn = 13
    expect(() => parseProject(JSON.stringify(badColumn))).toThrow(/rightColumn/)
  })

  it('writes rows as fixed-width hex sized to bytes-per-line', () => {
    const file = JSON.parse(serializeProject(sampleDoc()))
    expect(file.width).toBe(12)
    expect(file.glyphs[0].rows[0]).toBe('0800') // 2 bytes per line -> 4 hex digits
    expect(file.codepage['96']).toBe('£')
  })
})

describe('project validation', () => {
  const valid = serializeProject(sampleDoc())

  it('rejects non-JSON and wrong versions', () => {
    expect(() => parseProject('not json')).toThrow(/valid JSON/)
    expect(() => parseProject('{"version":9}')).toThrow(/version/)
  })

  it('rejects out-of-range geometry', () => {
    expect(() => parseProject('{"version":1,"width":99,"height":8,"glyphs":[]}')).toThrow(/width/)
    expect(() => parseProject('{"version":1,"width":8,"height":99,"glyphs":[]}')).toThrow(/height/)
  })

  it('rejects glyphs whose row count disagrees with the height', () => {
    const broken = JSON.parse(valid)
    broken.glyphs[0].rows.pop()
    expect(() => parseProject(JSON.stringify(broken))).toThrow(/rows, expected 6/)
  })

  it('rejects non-hex rows and bad codepoints', () => {
    const broken = JSON.parse(valid)
    broken.glyphs[0].rows[0] = 'zz'
    expect(() => parseProject(JSON.stringify(broken))).toThrow(/hex string/)

    const badCode = JSON.parse(valid)
    badCode.glyphs[0].code = 300
    expect(() => parseProject(JSON.stringify(badCode))).toThrow(/glyph code/)
  })
})
