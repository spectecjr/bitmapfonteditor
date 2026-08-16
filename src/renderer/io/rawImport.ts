import { MAX_BYTES_PER_LINE, MAX_FONT_HEIGHT, type Glyph } from '@shared/types'

/**
 * Reading a raw font dump — the reverse of io/export.ts, but for a file this
 * app didn't necessarily produce itself (a ROM extract, another tool's output,
 * ...), so the caller supplies the layout instead of it being self-describing.
 *
 * "Row" is exactly this app's own .bin format: for each of `linesPerChar` rows,
 * `bytesPerLine` consecutive bytes, MSB-first (leftmost pixel = bit 7 of the
 * first byte) — see io/export.ts's packGlyph. "Column" keeps the same byte
 * count per character but sequences it by 8px-wide band instead: for each of
 * `bytesPerLine` byte-columns, `linesPerChar` consecutive bytes top-to-bottom.
 * The two are identical whenever `bytesPerLine` is 1 (an 8px-or-narrower font),
 * and only diverge for wider, multi-byte-per-line fonts — assumption worth
 * confirming against whatever tool actually produced the file being imported.
 */
export type FontByteLayout = 'row' | 'column'

export interface ImportFontOptions {
  /** First codepoint the file's first character lands on. */
  startCode: number
  linesPerChar: number
  bytesPerLine: number
  layout: FontByteLayout
}

export interface ImportEstimate {
  bytesPerChar: number
  /** Characters in the file, counting a short final one padded with zeroes. */
  charCount: number
  /** Bytes left over after the last whole character — 0 if the file divides evenly. */
  remainderBytes: number
  /** Codepoint the last imported character would land on, before clipping to 0-255. */
  lastCodepoint: number
  /** How many characters would land past codepoint 255 and get dropped. */
  overflow: number
}

export function clampBytesPerLine(value: number): number {
  return Math.min(MAX_BYTES_PER_LINE, Math.max(1, Math.round(value)))
}

export function clampLinesPerChar(value: number): number {
  return Math.min(MAX_FONT_HEIGHT, Math.max(1, Math.round(value)))
}

export function estimateImport(
  fileSize: number,
  options: Pick<ImportFontOptions, 'startCode' | 'linesPerChar' | 'bytesPerLine'>
): ImportEstimate {
  const bytesPerLine = clampBytesPerLine(options.bytesPerLine)
  const linesPerChar = clampLinesPerChar(options.linesPerChar)
  const bytesPerChar = bytesPerLine * linesPerChar
  const charCount = fileSize > 0 ? Math.ceil(fileSize / bytesPerChar) : 0
  const remainderBytes = fileSize > 0 ? fileSize % bytesPerChar : 0
  const lastCodepoint = options.startCode + charCount - 1
  return { bytesPerChar, charCount, remainderBytes, lastCodepoint, overflow: Math.max(0, lastCodepoint - 255) }
}

export interface ImportedGlyph {
  code: number
  glyph: Glyph
}

export interface ImportResult {
  width: number
  height: number
  /** Only codepoints 0-255, in ascending order. */
  glyphs: ImportedGlyph[]
  /** Total characters found in the file, before the 0-255 clip. */
  charCount: number
  /** Characters that would have landed past codepoint 255 and were dropped. */
  droppedOverflow: number
  /** True if the file size wasn't an exact multiple of one character's bytes. */
  paddedWithZeroes: boolean
}

function readByte(bytes: Uint8Array, index: number): number {
  return index >= 0 && index < bytes.length ? bytes[index]! : 0
}

export function importRawFont(bytes: Uint8Array, options: ImportFontOptions): ImportResult {
  const bytesPerLine = clampBytesPerLine(options.bytesPerLine)
  const linesPerChar = clampLinesPerChar(options.linesPerChar)
  const startCode = Math.min(255, Math.max(0, Math.round(options.startCode)))
  const bytesPerChar = bytesPerLine * linesPerChar
  const width = bytesPerLine * 8

  const charCount = bytes.length > 0 ? Math.ceil(bytes.length / bytesPerChar) : 0
  const paddedWithZeroes = bytes.length > 0 && bytes.length % bytesPerChar !== 0

  const glyphs: ImportedGlyph[] = []
  let droppedOverflow = 0

  for (let index = 0; index < charCount; index++) {
    const code = startCode + index
    if (code > 255) {
      droppedOverflow++
      continue
    }
    const base = index * bytesPerChar
    const rows = new Array<number>(linesPerChar).fill(0)

    if (options.layout === 'column') {
      for (let c = 0; c < bytesPerLine; c++) {
        for (let y = 0; y < linesPerChar; y++) {
          const byte = readByte(bytes, base + c * linesPerChar + y)
          rows[y] = (rows[y]! | (byte << ((bytesPerLine - 1 - c) * 8))) >>> 0
        }
      }
    } else {
      for (let y = 0; y < linesPerChar; y++) {
        let value = 0
        for (let i = 0; i < bytesPerLine; i++) {
          value = ((value << 8) | readByte(bytes, base + y * bytesPerLine + i)) >>> 0
        }
        rows[y] = value >>> 0
      }
    }

    glyphs.push({ code, glyph: { rows, width } })
  }

  return { width, height: linesPerChar, glyphs, charCount, droppedOverflow, paddedWithZeroes }
}
