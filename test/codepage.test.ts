import { describe, expect, it } from 'vitest'
import {
  buildCp437,
  buildCp437Sam,
  displayChar,
  reverseCodepage,
  SAM_OVERRIDES
} from '../src/renderer/model/codepage'

// Invisible characters are compared by codepoint so the source stays readable.
const cp = (char: string | undefined): number | undefined => char?.codePointAt(0)

describe('CP437', () => {
  it('covers all 256 codepoints', () => {
    const map = buildCp437()
    expect(Object.keys(map)).toHaveLength(256)
    for (let code = 0; code < 256; code++) {
      expect(typeof map[code]).toBe('string')
    }
  })

  it('uses the pictographs for the control range and plain ASCII in the middle', () => {
    const map = buildCp437()
    expect(cp(map[0x00])).toBe(0x0000)
    expect(map[0x01]).toBe('☺')
    expect(map[0x0f]).toBe('☼')
    expect(map[0x41]).toBe('A')
    expect(map[0x7e]).toBe('~')
  })

  it('keeps the box-drawing and Greek blocks intact', () => {
    const map = buildCp437()
    expect(map[0xb0]).toBe('░')
    expect(map[0xc9]).toBe('╔')
    expect(map[0xdb]).toBe('█')
    expect(map[0xe3]).toBe('π')
    expect(cp(map[0xff])).toBe(0x00a0) // non-breaking space
  })
})

describe('SAM Coupe variant', () => {
  it('substitutes only backtick and 0x7F', () => {
    const stock = buildCp437()
    const sam = buildCp437Sam()

    expect(stock[0x60]).toBe('`')
    expect(stock[0x7f]).toBe('⌂')
    expect(sam[0x60]).toBe('£')
    expect(sam[0x7f]).toBe('©')

    const differences = Object.keys(sam).filter((code) => sam[Number(code)] !== stock[Number(code)])
    expect(differences.map(Number).sort((a, b) => a - b)).toEqual([0x60, 0x7f])
    expect(Object.keys(SAM_OVERRIDES).map(Number)).toEqual([0x60, 0x7f])
  })
})

describe('lookup helpers', () => {
  it('inverts the map, keeping the lowest codepoint for duplicates', () => {
    const reverse = reverseCodepage({ 32: ' ', 65: 'A', 200: 'A' })
    expect(reverse.get('A')).toBe(65)
    expect(reverse.get(' ')).toBe(32)
    expect(reverse.get('Z')).toBeUndefined()
  })

  it('substitutes a visible stand-in for blanks and control codes', () => {
    expect(displayChar('A')).toBe('A')
    expect(displayChar(String.fromCodePoint(0x20))).toBe('␣')
    expect(displayChar(String.fromCodePoint(0x00))).toBe('␀')
    expect(displayChar(String.fromCodePoint(0x01))).toBe('□')
    expect(displayChar(String.fromCodePoint(0xa0))).toBe('␣')
    expect(displayChar(undefined)).toBe('')
  })
})
