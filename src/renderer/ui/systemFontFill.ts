import { bitMask } from '../model/glyph'
import type { FontMetricsPx } from '../model/systemFont'

/**
 * Canvas mechanics for "Helpers ▸ Fill From System Font…". Rendering an
 * installed system font via `ctx.font` needs no special permission in
 * Electron/Chromium — only *enumerating* family names would (the experimental,
 * permission-gated Local Font Access API) — so this deliberately has no font
 * list: the user types the exact family name, same as they would in any CSS
 * `font-family`. Untested like the rest of ui/* (no jsdom/canvas in this
 * project's Vitest config); the pure geometry this leans on lives in
 * model/systemFont.ts and is tested there.
 */

export interface CharMetrics {
  /** Rightmost ink column, 0-based, or -1 for a glyph with no ink (e.g. space). */
  inkRight: number
  /** Raw measured advance in px, unrounded. */
  advance: number
}

export function createMeasureContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable')
  return ctx
}

/** Best-effort only — a false positive here just means the fill proceeds and Chromium substitutes a fallback font. */
export function isFontAvailable(family: string): boolean {
  try {
    return document.fonts.check(`16px "${family}"`)
  } catch {
    return true
  }
}

export function measureChar(
  ctx: CanvasRenderingContext2D,
  family: string,
  pixelSize: number,
  char: string
): CharMetrics {
  ctx.font = `${pixelSize}px "${family}"`
  ctx.textBaseline = 'alphabetic'
  const metrics = ctx.measureText(char)
  const right = metrics.actualBoundingBoxRight
  return {
    inkRight: Number.isFinite(right) && right > 0 ? Math.ceil(right) - 1 : -1,
    advance: metrics.width
  }
}

/**
 * Everything measured relative to the alphabetic baseline. `Hgy` samples both
 * an ascender and a descender for the font's own line box; `H`/`x` isolate cap
 * height and x-height.
 */
export function measureFontMetrics(
  ctx: CanvasRenderingContext2D,
  family: string,
  pixelSize: number
): FontMetricsPx {
  ctx.font = `${pixelSize}px "${family}"`
  ctx.textBaseline = 'alphabetic'
  const full = ctx.measureText('Hgy')
  const cap = ctx.measureText('H')
  const low = ctx.measureText('x')
  return {
    ascent: full.fontBoundingBoxAscent || cap.actualBoundingBoxAscent || pixelSize * 0.8,
    descent: full.fontBoundingBoxDescent || pixelSize * 0.2,
    capHeight: cap.actualBoundingBoxAscent || pixelSize * 0.7,
    xHeight: low.actualBoundingBoxAscent || pixelSize * 0.5
  }
}

/**
 * Rendered this many times larger than the target cell, then box-filtered back
 * down before thresholding. Canvas 2D has no hinting API at all — `fillText`
 * goes through whatever antialiased, subpixel-positioned path the browser's
 * font stack picks for on-screen text, which is tuned for smooth reading, not
 * for snapping stems to a tiny pixel grid the way a hinting-aware rasterizer
 * would. Supersampling doesn't recover the font's actual hints, but it gives
 * the antialiasing enough resolution to average toward the true coverage of
 * each final pixel instead of guessing from a handful of native-size samples,
 * which is a meaningfully better approximation at 8-16px cells.
 */
const SUPERSAMPLE = 4

/**
 * Draws one character white-on-black at `SUPERSAMPLE`× the target cell size
 * and box-filters it back down to `cellWidth`×`cellHeight`, thresholding the
 * averaged luminance to 1-bit.
 */
export function rasterizeChar(
  ctx: CanvasRenderingContext2D,
  family: string,
  pixelSize: number,
  baselineRow: number,
  cellWidth: number,
  cellHeight: number,
  char: string
): boolean[][] {
  const width = Math.max(1, cellWidth)
  const height = Math.max(1, cellHeight)
  const ssWidth = width * SUPERSAMPLE
  const ssHeight = height * SUPERSAMPLE

  ctx.canvas.width = ssWidth
  ctx.canvas.height = ssHeight
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ssWidth, ssHeight)
  ctx.font = `${pixelSize * SUPERSAMPLE}px "${family}"`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.fillText(char, 0, baselineRow * SUPERSAMPLE)

  const { data } = ctx.getImageData(0, 0, ssWidth, ssHeight)
  const bits: boolean[][] = []
  for (let y = 0; y < height; y++) {
    const row: boolean[] = []
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const sampleRow = (y * SUPERSAMPLE + sy) * ssWidth
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          sum += data[(sampleRow + x * SUPERSAMPLE + sx) * 4]!
        }
      }
      row.push(sum / (SUPERSAMPLE * SUPERSAMPLE) > 128)
    }
    bits.push(row)
  }
  return bits
}

/** Packs a rasterized boolean grid into the app's row-bitmask convention (leftmost pixel = MSB). */
export function bitsToRows(bits: boolean[][], fontWidth: number): number[] {
  return bits.map((row) => {
    let value = 0
    for (let x = 0; x < fontWidth && x < row.length; x++) {
      if (row[x]) value = (value | bitMask(fontWidth, x)) >>> 0
    }
    return value
  })
}
