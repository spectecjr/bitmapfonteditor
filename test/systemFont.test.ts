import { describe, expect, it } from 'vitest'
import { computeGuides, pickPixelSize, requiredWidth } from '../src/renderer/model/systemFont'

describe('computeGuides', () => {
  it('places the baseline at the ascent and reads cap/x-height up from it', () => {
    const guides = computeGuides({ ascent: 6, descent: 2, capHeight: 5, xHeight: 3 }, 8)
    expect(guides).toEqual({ baseline: 6, capHeight: 1, xHeight: 3 })
  })

  it('clamps every guide into 0..cellHeight even with an oversized font', () => {
    const guides = computeGuides({ ascent: 20, descent: 10, capHeight: 25, xHeight: 22 }, 8)
    expect(guides.baseline).toBe(8)
    expect(guides.capHeight).toBe(0)
    expect(guides.xHeight).toBe(0)
  })

  it('never goes negative for a font with no descent', () => {
    const guides = computeGuides({ ascent: 8, descent: 0, capHeight: 8, xHeight: 8 }, 8)
    expect(guides.capHeight).toBeGreaterThanOrEqual(0)
    expect(guides.xHeight).toBeGreaterThanOrEqual(0)
  })
})

describe('pickPixelSize', () => {
  it('scales proportionally so the natural line height matches the cell', () => {
    // Reference: 100px font measures 90px ascent + 10px descent (100px natural height).
    // An 8-row cell should ask for an 8px font size.
    expect(pickPixelSize({ ascent: 90, descent: 10 }, 100, 8)).toBe(8)
  })

  it('falls back to the cell height if the reference metrics are degenerate', () => {
    expect(pickPixelSize({ ascent: 0, descent: 0 }, 100, 8)).toBe(8)
  })

  it('never returns less than 1px', () => {
    expect(pickPixelSize({ ascent: 1000, descent: 0 }, 1000, 1)).toBeGreaterThanOrEqual(1)
  })
})

describe('requiredWidth', () => {
  it('is the widest measurement, rounded up', () => {
    expect(requiredWidth([3.2, 7.9, 5], 8)).toBe(8)
  })

  it('is never narrower than minWidth even if every glyph is narrower', () => {
    expect(requiredWidth([2, 3], 8)).toBe(8)
  })

  it('widens past minWidth when a glyph needs more room', () => {
    expect(requiredWidth([2, 12.1], 8)).toBe(13)
  })
})
