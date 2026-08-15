import type { Glyph } from '@shared/types'

/** Unsigned mask with the low `bits` bits set. `1 << 32` wraps in JS, hence the guard. */
export function widthMask(bits: number): number {
  if (bits <= 0) return 0
  if (bits >= 32) return 0xffffffff
  return ((1 << bits) - 1) >>> 0
}

/** Mask selecting pixel `x` in a `fontWidth`-wide cell (leftmost pixel = most significant bit). */
export function bitMask(fontWidth: number, x: number): number {
  return (1 << (fontWidth - 1 - x)) >>> 0
}

export function createRows(height: number): number[] {
  return new Array<number>(height).fill(0)
}

export function createGlyph(fontWidth: number, height: number): Glyph {
  return { rows: createRows(height), width: fontWidth }
}

export function cloneGlyph(glyph: Glyph): Glyph {
  return { rows: glyph.rows.slice(), width: glyph.width }
}

export function isBlank(glyph: Glyph): boolean {
  return glyph.rows.every((row) => row === 0)
}

export function getBit(glyph: Glyph, fontWidth: number, x: number, y: number): boolean {
  if (x < 0 || x >= fontWidth || y < 0 || y >= glyph.rows.length) return false
  return (glyph.rows[y]! & bitMask(fontWidth, x)) !== 0
}

export function setBit(
  glyph: Glyph,
  fontWidth: number,
  x: number,
  y: number,
  value: boolean
): void {
  if (x < 0 || x >= fontWidth || y < 0 || y >= glyph.rows.length) return
  const mask = bitMask(fontWidth, x)
  const row = glyph.rows[y]!
  glyph.rows[y] = value ? (row | mask) >>> 0 : (row & ~mask) >>> 0
}

export function clearGlyph(glyph: Glyph): void {
  glyph.rows.fill(0)
}

/** Inverts across the full cell width, not just up to the advance marker. */
export function invertGlyph(glyph: Glyph, fontWidth: number): void {
  const mask = widthMask(fontWidth)
  for (let y = 0; y < glyph.rows.length; y++) {
    glyph.rows[y] = (~glyph.rows[y]! & mask) >>> 0
  }
}

export function flipHorizontal(glyph: Glyph, fontWidth: number): void {
  for (let y = 0; y < glyph.rows.length; y++) {
    const row = glyph.rows[y]!
    let flipped = 0
    for (let x = 0; x < fontWidth; x++) {
      if ((row & bitMask(fontWidth, x)) !== 0) {
        flipped = (flipped | bitMask(fontWidth, fontWidth - 1 - x)) >>> 0
      }
    }
    glyph.rows[y] = flipped
  }
}

export function flipVertical(glyph: Glyph): void {
  glyph.rows.reverse()
}

/**
 * Non-wrapping shift. Positive `dx` moves right, positive `dy` moves down;
 * pixels pushed past an edge are lost and the vacated area is cleared.
 */
export function shiftGlyph(glyph: Glyph, fontWidth: number, dx: number, dy: number): void {
  const height = glyph.rows.length
  const mask = widthMask(fontWidth)
  const shifted = createRows(height)

  for (let y = 0; y < height; y++) {
    const sourceY = y - dy
    if (sourceY < 0 || sourceY >= height) continue
    const row = glyph.rows[sourceY]!
    // Pixel x sits at bit (fontWidth-1-x), so moving right lowers the bit index.
    const moved = dx >= 0 ? row >>> dx : (row << -dx) >>> 0
    shifted[y] = (moved & mask) >>> 0
  }

  for (let y = 0; y < height; y++) glyph.rows[y] = shifted[y]!
}

/** Zeroes everything at or beyond the advance marker — used on export only. */
export function maskRowToWidth(row: number, fontWidth: number, glyphWidth: number): number {
  if (glyphWidth <= 0) return 0
  if (glyphWidth >= fontWidth) return (row & widthMask(fontWidth)) >>> 0
  const keep = (widthMask(glyphWidth) << (fontWidth - glyphWidth)) >>> 0
  return (row & keep) >>> 0
}

/** Default blank columns left between the ink and the next character. */
export const DEFAULT_SIDE_BEARING = 1

/**
 * Advance width that leaves `gap` blank columns after the rightmost ink, so
 * neighbouring characters do not touch. A blank glyph has no ink to measure, so
 * its advance is left alone — collapsing the space character to nothing is never
 * what the user meant.
 */
export function fittedWidth(
  glyph: Glyph,
  fontWidth: number,
  gap = DEFAULT_SIDE_BEARING
): number {
  const ink = inkWidth(glyph, fontWidth)
  if (ink === 0) return glyph.width
  return Math.min(fontWidth, ink + Math.max(0, gap))
}

/** Rightmost set pixel + 1, i.e. the tightest advance width that loses nothing. */
export function inkWidth(glyph: Glyph, fontWidth: number): number {
  let widest = 0
  for (const row of glyph.rows) {
    for (let x = fontWidth - 1; x >= widest; x--) {
      if ((row & bitMask(fontWidth, x)) !== 0) {
        widest = x + 1
        break
      }
    }
  }
  return widest
}
