import type { Glyph } from '@shared/types'
import { getBit } from '../model/glyph'

/**
 * Blits a glyph with independent horizontal/vertical pixel scale, using the
 * context's current fillStyle. `limitToAdvance` mirrors the export behaviour
 * (pixels past the width marker are dropped), which is what the thumbnails
 * and preview want to show.
 */
export function drawGlyphScaled(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  fontWidth: number,
  x0: number,
  y0: number,
  scaleX: number,
  scaleY: number,
  limitToAdvance = true
): void {
  const columns = limitToAdvance ? Math.min(glyph.width, fontWidth) : fontWidth
  for (let y = 0; y < glyph.rows.length; y++) {
    for (let x = 0; x < columns; x++) {
      if (getBit(glyph, fontWidth, x, y)) {
        ctx.fillRect(x0 + x * scaleX, y0 + y * scaleY, scaleX, scaleY)
      }
    }
  }
}

/** Square-pixel convenience wrapper around `drawGlyphScaled`. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  fontWidth: number,
  x0: number,
  y0: number,
  scale: number,
  limitToAdvance = true
): void {
  drawGlyphScaled(ctx, glyph, fontWidth, x0, y0, scale, scale, limitToAdvance)
}

export interface OverflowColors {
  /** Background for every cell past the advance width, on or off. */
  background: string
  /** A set pixel past the advance width — brighter than `background` so it still reads as ink. */
  ink: string
}

/**
 * Like `drawGlyph`, but instead of stopping at the advance width it keeps going
 * to `fontWidth` and tints everything past the marker dark red — the character
 * map wants the whole design surface visible, with the part export throws away
 * clearly marked, rather than silently blank like the live preview strip.
 *
 * `drawGlyph` itself never touches `ctx.fillStyle` — callers set the ink color
 * first — so this reads that caller-set color, uses it for the live region same
 * as always, and only swaps in the overflow colors for the region past advance.
 */
export function drawGlyphWithOverflow(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  fontWidth: number,
  x0: number,
  y0: number,
  scale: number,
  colors: OverflowColors
): void {
  const advance = Math.min(glyph.width, fontWidth)
  const inkColor = ctx.fillStyle

  if (advance < fontWidth) {
    ctx.fillStyle = colors.background
    ctx.fillRect(x0 + advance * scale, y0, (fontWidth - advance) * scale, glyph.rows.length * scale)

    ctx.fillStyle = colors.ink
    for (let y = 0; y < glyph.rows.length; y++) {
      for (let x = advance; x < fontWidth; x++) {
        if (getBit(glyph, fontWidth, x, y)) ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale)
      }
    }
  }

  ctx.fillStyle = inkColor
  drawGlyph(ctx, glyph, fontWidth, x0, y0, scale, true)
}

/** Sets up a canvas for the current DPI and returns its CSS-pixel size. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssWidth * dpr))
  canvas.height = Math.max(1, Math.round(cssHeight * dpr))
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
