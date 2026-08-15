import { describe, expect, it } from 'vitest'
import {
  bitMask,
  clearGlyph,
  createGlyph,
  fittedWidth,
  flipHorizontal,
  flipVertical,
  getBit,
  inkWidth,
  invertGlyph,
  maskRowToWidth,
  setBit,
  shiftGlyph,
  widthMask
} from '../src/renderer/model/glyph'

const glyphOf = (rows: number[], width = 8) => ({ rows: rows.slice(), width })

describe('bit helpers', () => {
  it('builds unsigned masks, including the full 32-bit case', () => {
    expect(widthMask(0)).toBe(0)
    expect(widthMask(1)).toBe(0b1)
    expect(widthMask(8)).toBe(0xff)
    expect(widthMask(32)).toBe(0xffffffff)
  })

  it('puts pixel 0 in the most significant bit of the cell', () => {
    expect(bitMask(8, 0)).toBe(0x80)
    expect(bitMask(8, 7)).toBe(0x01)
    expect(bitMask(32, 0)).toBe(0x80000000)
  })

  it('reads and writes pixels, ignoring out-of-range coordinates', () => {
    const glyph = createGlyph(8, 4)
    setBit(glyph, 8, 3, 1, true)
    expect(getBit(glyph, 8, 3, 1)).toBe(true)
    expect(glyph.rows[1]).toBe(0b00010000)

    setBit(glyph, 8, 3, 1, false)
    expect(getBit(glyph, 8, 3, 1)).toBe(false)

    setBit(glyph, 8, 9, 1, true)
    setBit(glyph, 8, 0, 99, true)
    expect(glyph.rows.every((row) => row === 0)).toBe(true)
    expect(getBit(glyph, 8, -1, 0)).toBe(false)
  })
})

describe('glyph operations', () => {
  it('clears every row', () => {
    const glyph = glyphOf([0xff, 0x81])
    clearGlyph(glyph)
    expect(glyph.rows).toEqual([0, 0])
  })

  it('inverts across the full cell width, not the advance width', () => {
    const glyph = glyphOf([0b10000001, 0x00], 3)
    invertGlyph(glyph, 8)
    expect(glyph.rows).toEqual([0b01111110, 0b11111111])
  })

  it('mirrors horizontally', () => {
    const glyph = glyphOf([0b10000000, 0b11000000])
    flipHorizontal(glyph, 8)
    expect(glyph.rows).toEqual([0b00000001, 0b00000011])
  })

  it('mirrors vertically', () => {
    const glyph = glyphOf([1, 2, 3])
    flipVertical(glyph)
    expect(glyph.rows).toEqual([3, 2, 1])
  })

  it('shifts without wrapping', () => {
    const right = glyphOf([0b10000000])
    shiftGlyph(right, 8, 1, 0)
    expect(right.rows).toEqual([0b01000000])

    // A pixel pushed off the left edge is discarded, not wrapped.
    const left = glyphOf([0b10000001])
    shiftGlyph(left, 8, -1, 0)
    expect(left.rows).toEqual([0b00000010])

    const down = glyphOf([0b1111, 0b0001])
    shiftGlyph(down, 8, 0, 1)
    expect(down.rows).toEqual([0, 0b1111])

    const up = glyphOf([0b1111, 0b0001])
    shiftGlyph(up, 8, 0, -1)
    expect(up.rows).toEqual([0b0001, 0])
  })

  it('masks to the advance width', () => {
    expect(maskRowToWidth(0xff, 8, 3)).toBe(0b11100000)
    expect(maskRowToWidth(0xff, 8, 0)).toBe(0)
    expect(maskRowToWidth(0xff, 8, 8)).toBe(0xff)
    // A width wider than the cell cannot add pixels.
    expect(maskRowToWidth(0xff, 8, 12)).toBe(0xff)
  })

  it('measures the rightmost ink column', () => {
    expect(inkWidth(glyphOf([0b10000000, 0b00001000]), 8)).toBe(5)
    expect(inkWidth(glyphOf([0, 0]), 8)).toBe(0)
    expect(inkWidth(glyphOf([0b00000001]), 8)).toBe(8)
  })

  it('fits the advance width with a one-pixel gap by default', () => {
    // Ink ends at column 4, so the advance leaves column 5 blank.
    const glyph = glyphOf([0b10000000, 0b00001000])
    expect(fittedWidth(glyph, 8)).toBe(6)
    expect(fittedWidth(glyph, 8, 0)).toBe(5)
    expect(fittedWidth(glyph, 8, 2)).toBe(7)
  })

  it('never lets the gap push the advance past the cell', () => {
    const full = glyphOf([0b00000001])
    expect(inkWidth(full, 8)).toBe(8)
    expect(fittedWidth(full, 8)).toBe(8)

    const nearlyFull = glyphOf([0b00000010])
    expect(fittedWidth(nearlyFull, 8)).toBe(8)
  })

  it('leaves a blank glyph alone, so fitting never collapses the space character', () => {
    expect(fittedWidth(glyphOf([0, 0], 3), 8)).toBe(3)
    expect(fittedWidth(glyphOf([0, 0], 8), 8, 0)).toBe(8)
  })
})
