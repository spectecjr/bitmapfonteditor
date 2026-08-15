import type { FontDoc } from '@shared/types'
import { reverseCodepage } from '../model/codepage'
import { drawGlyph, prepareCanvas } from './draw'

/** Sample text rendered at three zooms, using each glyph's advance width. */
const SCALES = [1, 2, 4]
const ROW_GAP = 10

const THEMES = {
  onBlack: { background: '#17181b', ink: '#f2f2f0', placeholder: '#4a4d55' },
  onWhite: { background: '#f4f4f2', ink: '#141518', placeholder: '#b9bcc4' }
}

export class PreviewView {
  private doc: FontDoc | null = null
  private text = ''
  private inverted = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    // The sidebar splitter changes our width without firing a window resize.
    const observer = new ResizeObserver(() => this.repaint())
    observer.observe(canvas.parentElement ?? canvas)
  }

  render(doc: FontDoc, text: string): void {
    this.doc = doc
    this.text = text
    this.repaint()
  }

  /** Black ink on white, rather than the editor's white on black. */
  setInverted(inverted: boolean): void {
    this.inverted = inverted
    this.repaint()
  }

  private repaint(): void {
    const doc = this.doc
    if (!doc) return
    const theme = this.inverted ? THEMES.onWhite : THEMES.onBlack

    const cssWidth = Math.max(1, this.canvas.parentElement?.clientWidth ?? 400)
    const totalScale = SCALES.reduce((sum, scale) => sum + scale, 0)
    const cssHeight = doc.height * totalScale + ROW_GAP * (SCALES.length + 1)
    const ctx = prepareCanvas(this.canvas, cssWidth, cssHeight)

    ctx.fillStyle = theme.background
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    const reverse = reverseCodepage(doc.codepage)
    let y = ROW_GAP

    for (const scale of SCALES) {
      let x = ROW_GAP
      for (const char of this.text) {
        const code = reverse.get(char)
        const glyph = code === undefined ? undefined : doc.glyphs[code]
        if (!glyph) {
          // Unmapped or undefined: show a hollow box so the gap is obvious.
          ctx.strokeStyle = theme.placeholder
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, doc.width * scale - 1, doc.height * scale - 1)
          x += doc.width * scale + scale
          continue
        }
        ctx.fillStyle = theme.ink
        drawGlyph(ctx, glyph, doc.width, x, y, scale)
        x += glyph.width * scale
        if (x > cssWidth) break
      }
      y += doc.height * scale + ROW_GAP
    }
  }
}
