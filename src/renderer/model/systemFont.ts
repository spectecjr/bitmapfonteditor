/**
 * Pure math for "Helpers ▸ Fill From System Font…" — turning font metrics
 * (measured by the DOM-touching code in ui/systemFontFill.ts, via Canvas
 * `measureText`) into the same row-boundary guides the rest of the app uses.
 * Kept separate from the Canvas work so the geometry is unit-testable without a
 * DOM.
 */

/** Everything measured in the same px units the glyphs are about to be rasterised at. */
export interface FontMetricsPx {
  /** Height above the baseline of the font's own line box (includes internal leading). */
  ascent: number
  /** Depth below the baseline of the font's own line box. */
  descent: number
  /** Height above the baseline of a capital letter's ink. */
  capHeight: number
  /** Height above the baseline of a lowercase x's ink. */
  xHeight: number
}

export interface ComputedGuides {
  baseline: number
  capHeight: number
  xHeight: number
}

function clampGuideRow(row: number, height: number): number {
  return Math.max(0, Math.min(height, Math.round(row)))
}

/**
 * Places the baseline at the font's own ascent (rows above it), then reads cap
 * height and x-height as offsets up from that baseline — the same row-boundary
 * convention as the hand-drawn guides (`baseline: 7` in an 8-line font means row
 * 7 is descender space).
 */
export function computeGuides(metrics: FontMetricsPx, cellHeight: number): ComputedGuides {
  const baseline = clampGuideRow(metrics.ascent, cellHeight)
  return {
    baseline,
    capHeight: clampGuideRow(baseline - metrics.capHeight, cellHeight),
    xHeight: clampGuideRow(baseline - metrics.xHeight, cellHeight)
  }
}

/**
 * Picks a font-size in px so the font's own line box (ascent + descent) lands
 * on `cellHeight` — a plain `cellHeight`-px font size usually overshoots, since
 * most fonts carry internal leading above the cap height and below the
 * baseline. `referenceMetrics` is measured at `referenceSize`; scaling
 * proportionally from a real sample beats guessing a fixed ratio per font.
 */
export function pickPixelSize(
  referenceMetrics: Pick<FontMetricsPx, 'ascent' | 'descent'>,
  referenceSize: number,
  cellHeight: number
): number {
  const naturalHeight = referenceMetrics.ascent + referenceMetrics.descent
  if (naturalHeight <= 0) return Math.max(1, Math.round(cellHeight))
  return Math.max(1, Math.round((cellHeight / naturalHeight) * referenceSize))
}

/** The narrowest cell width (px) that fits every measured glyph, never below `minWidth`. */
export function requiredWidth(measurements: readonly number[], minWidth: number): number {
  return measurements.reduce((max, value) => Math.max(max, Math.ceil(value)), minWidth)
}
