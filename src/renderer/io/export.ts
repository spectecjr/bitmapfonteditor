import type { FontDoc, Glyph } from '@shared/types'
import { bytesPerLine, definedCodepoints } from '../model/font'
import { maskRowToWidth } from '../model/glyph'

/**
 * Export formats (see docs/file-formats.md).
 *
 * `.bin`         glyphs in ascending codepoint order, `height` rows each,
 *                `bytesPerLine` bytes per row, bit 7 of the first byte is the
 *                leftmost pixel. Pixels at or beyond the advance width are zeroed.
 * `.widths.json` index-aligned codepoint/width arrays plus the geometry needed
 *                to walk the binary without any other file.
 * `.map.json`    codepoint -> Unicode character, kept separate from the font data.
 */

export interface WidthsFile {
  version: 1
  width: number
  height: number
  /** Row boundary glyphs sit on — metrics for the consumer, not used by the bitmap. */
  baseline: number
  /** Row boundary where lowercase letters top out. */
  xHeight: number
  /** Row boundary where capitals top out. */
  capHeight: number
  /** Column boundaries of the narrower cell, if the font is designed inside a wider grid. */
  leftColumn: number
  rightColumn: number
  bytesPerLine: number
  bytesPerGlyph: number
  count: number
  codepoints: number[]
  widths: number[]
}

export interface MappingEntry {
  code: number
  char: string
  unicode: string
}

export interface MappingFile {
  version: 1
  entries: MappingEntry[]
}

/** Packs one glyph, left-aligned into `bytesPerLine` bytes per row. */
export function packGlyph(glyph: Glyph, fontWidth: number, height: number): Uint8Array {
  const bpl = bytesPerLine(fontWidth)
  const shift = bpl * 8 - fontWidth
  const out = new Uint8Array(bpl * height)

  for (let y = 0; y < height; y++) {
    const masked = maskRowToWidth(glyph.rows[y] ?? 0, fontWidth, glyph.width)
    const aligned = (masked << shift) >>> 0
    for (let i = 0; i < bpl; i++) {
      out[y * bpl + i] = (aligned >>> ((bpl - 1 - i) * 8)) & 0xff
    }
  }
  return out
}

export function exportBitmap(doc: FontDoc): Uint8Array {
  const codes = definedCodepoints(doc)
  const stride = bytesPerLine(doc.width) * doc.height
  const out = new Uint8Array(stride * codes.length)
  codes.forEach((code, index) => {
    out.set(packGlyph(doc.glyphs[code]!, doc.width, doc.height), index * stride)
  })
  return out
}

export function buildWidths(doc: FontDoc): WidthsFile {
  const codepoints = definedCodepoints(doc)
  const bpl = bytesPerLine(doc.width)
  return {
    version: 1,
    width: doc.width,
    height: doc.height,
    baseline: doc.baseline,
    xHeight: doc.xHeight,
    capHeight: doc.capHeight,
    leftColumn: doc.leftColumn,
    rightColumn: doc.rightColumn,
    bytesPerLine: bpl,
    bytesPerGlyph: bpl * doc.height,
    count: codepoints.length,
    codepoints,
    widths: codepoints.map((code) => doc.glyphs[code]!.width)
  }
}

function unicodeLabel(char: string): string {
  const cp = char.codePointAt(0)
  if (cp === undefined) return ''
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
}

export function buildMapping(codepage: Record<number, string>): MappingFile {
  const entries = Object.keys(codepage)
    .map(Number)
    .sort((a, b) => a - b)
    .map((code) => {
      const char = codepage[code]!
      return { code, char, unicode: unicodeLabel(char) }
    })
  return { version: 1, entries }
}

export function serializeWidths(doc: FontDoc): string {
  return `${JSON.stringify(buildWidths(doc), null, 2)}\n`
}

export function serializeMapping(codepage: Record<number, string>): string {
  return `${JSON.stringify(buildMapping(codepage), null, 2)}\n`
}

export function parseMapping(text: string): Record<number, string> {
  const raw: unknown = JSON.parse(text)
  if (typeof raw !== 'object' || raw === null) throw new Error('expected a JSON object')
  const file = raw as Partial<MappingFile>
  if (file.version !== 1) throw new Error(`unsupported mapping version ${String(file.version)}`)
  if (!Array.isArray(file.entries)) throw new Error('entries must be an array')

  const codepage: Record<number, string> = {}
  for (const entry of file.entries) {
    const code = entry?.code
    if (!Number.isInteger(code) || code < 0 || code > 255) {
      throw new Error(`entry code ${String(code)} is not a codepoint in 0..255`)
    }
    const char =
      typeof entry.char === 'string' && entry.char.length > 0
        ? entry.char
        : fromUnicodeLabel(entry.unicode)
    if (char === null) throw new Error(`entry ${code} has neither a char nor a usable unicode field`)
    codepage[code] = char
  }
  return codepage
}

function fromUnicodeLabel(label: string | undefined): string | null {
  if (!label) return null
  const match = /^U\+([0-9a-fA-F]+)$/.exec(label)
  if (!match) return null
  return String.fromCodePoint(Number.parseInt(match[1]!, 16))
}

/** Renders a packed glyph back to ASCII art — used by tests and the decode script. */
export function unpackGlyphToAscii(
  bytes: Uint8Array,
  offset: number,
  fontWidth: number,
  height: number,
  on = '#',
  off = '.'
): string[] {
  const bpl = bytesPerLine(fontWidth)
  const lines: string[] = []
  for (let y = 0; y < height; y++) {
    let line = ''
    for (let x = 0; x < fontWidth; x++) {
      const byte = bytes[offset + y * bpl + (x >> 3)] ?? 0
      line += (byte & (0x80 >>> (x & 7))) !== 0 ? on : off
    }
    lines.push(line)
  }
  return lines
}
