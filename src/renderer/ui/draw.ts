import type { Glyph } from '@shared/types'
import { getBit } from '../model/glyph'

/**
 * Blits a glyph at `scale` using the context's current fillStyle.
 * `limitToAdvance` mirrors the export behaviour (pixels past the width marker
 * are dropped), which is what the thumbnails and preview want to show.
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  fontWidth: number,
  x0: number,
  y0: number,
  scale: number,
  limitToAdvance = true
): void {
  const columns = limitToAdvance ? Math.min(glyph.width, fontWidth) : fontWidth
  for (let y = 0; y < glyph.rows.length; y++) {
    for (let x = 0; x < columns; x++) {
      if (getBit(glyph, fontWidth, x, y)) {
        ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale)
      }
    }
  }
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
