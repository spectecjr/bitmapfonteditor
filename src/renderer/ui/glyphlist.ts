import type { FontDoc } from '@shared/types'
import { definedCodepoints } from '../model/font'
import { displayChar } from '../model/codepage'
import { drawGlyphWithOverflow, prepareCanvas } from './draw'

const THUMB_BOX = 44

/** Dark red, distinct from the app's orange-red accent used for the advance marker itself. */
const OVERFLOW_COLORS = { background: '#3a1414', ink: '#c24545' }

interface Row {
  element: HTMLElement
  canvas: HTMLCanvasElement
  char: HTMLElement
}

export interface GlyphListCallbacks {
  onSelect(code: number): void
  /** Shift-click: pin this glyph as the ghost drawn behind the current one. */
  onToggleReference(code: number): void
  /** Double-click on the codepoint number: open the remapping dialog for that row. */
  onEditMapping(code: number): void
}

/**
 * The character map: every defined codepoint in ascending order, showing the
 * glyph as drawn plus the character it maps to rendered in the system font.
 * The container is a CSS auto-fill grid, so it flows into as many columns as the
 * (resizable) sidebar has room for.
 */
export class GlyphListView {
  private readonly rows = new Map<number, Row>()
  private selected: number | null = null
  private reference: number | null = null

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: GlyphListCallbacks
  ) {
    container.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('.glyph-row')
      if (!target) return
      const code = Number(target.dataset['code'])
      if (event.shiftKey) this.callbacks.onToggleReference(code)
      else this.callbacks.onSelect(code)
    })

    // Double-clicking the number specifically (not the thumbnail or char) opens
    // the remapping dialog — the preceding pair of clicks already selects the
    // row, which is a reasonable side effect rather than something to suppress.
    container.addEventListener('dblclick', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('.glyph-code')
      if (!target) return
      const row = target.closest<HTMLElement>('.glyph-row')
      if (!row) return
      this.callbacks.onEditMapping(Number(row.dataset['code']))
    })
  }

  /** Full rebuild — used whenever the set of codepoints or the geometry changes. */
  rebuild(doc: FontDoc, selected: number | null, reference: number | null): void {
    this.rows.clear()
    this.container.replaceChildren()
    const fragment = document.createDocumentFragment()

    for (const code of definedCodepoints(doc)) {
      const element = document.createElement('div')
      element.className = 'glyph-row'
      element.dataset['code'] = String(code)
      element.title = 'Click to edit · Shift-click to use as a reference · double-click the number to remap'

      // Hex on top, decimal centred below — both full brightness, not dimmed,
      // so the codepoint reads as clearly as the glyph itself.
      const label = document.createElement('div')
      label.className = 'glyph-code'
      const hex = document.createElement('span')
      hex.className = 'glyph-code-hex'
      hex.textContent = code.toString(16).toUpperCase().padStart(2, '0')
      const dec = document.createElement('span')
      dec.className = 'glyph-code-dec'
      dec.textContent = String(code)
      label.append(hex, dec)

      const canvas = document.createElement('canvas')
      canvas.className = 'glyph-thumb'

      const char = document.createElement('span')
      char.className = 'glyph-char'

      element.append(label, canvas, char)
      fragment.append(element)
      this.rows.set(code, { element, canvas, char })
    }

    this.container.append(fragment)
    for (const code of this.rows.keys()) this.paint(doc, code)
    this.setSelected(selected)
    this.setReference(reference)
  }

  /** Cheap path for "the artwork changed but the list structure didn't". */
  updateGlyph(doc: FontDoc, code: number): void {
    if (this.rows.has(code)) this.paint(doc, code)
  }

  setSelected(code: number | null): void {
    if (this.selected !== null) {
      this.rows.get(this.selected)?.element.classList.remove('selected')
    }
    this.selected = code
    if (code === null) return
    const row = this.rows.get(code)
    if (!row) return
    row.element.classList.add('selected')
    row.element.scrollIntoView({ block: 'nearest' })
  }

  setReference(code: number | null): void {
    if (this.reference !== null) {
      this.rows.get(this.reference)?.element.classList.remove('reference')
    }
    this.reference = code
    if (code === null) return
    this.rows.get(code)?.element.classList.add('reference')
  }

  private paint(doc: FontDoc, code: number): void {
    const row = this.rows.get(code)
    if (!row) return
    const glyph = doc.glyphs[code]
    if (!glyph) return

    const ctx = prepareCanvas(row.canvas, THUMB_BOX, THUMB_BOX)
    ctx.clearRect(0, 0, THUMB_BOX, THUMB_BOX)
    const scale = Math.max(1, Math.floor(Math.min(THUMB_BOX / doc.width, THUMB_BOX / doc.height)))
    const offsetX = Math.round((THUMB_BOX - doc.width * scale) / 2)
    const offsetY = Math.round((THUMB_BOX - doc.height * scale) / 2)

    ctx.fillStyle = '#f2f2f0'
    drawGlyphWithOverflow(ctx, glyph, doc.width, offsetX, offsetY, scale, OVERFLOW_COLORS)

    row.char.textContent = displayChar(doc.codepage[code])
    row.char.title = doc.codepage[code] ?? ''
  }
}
