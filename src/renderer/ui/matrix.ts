import {
  HORIZONTAL_GUIDES,
  VERTICAL_GUIDES,
  type FontDoc,
  type GuideName,
  type Glyph,
  type HorizontalGuide,
  type VerticalGuide
} from '@shared/types'
import { getBit } from '../model/glyph'

export interface MatrixCallbacks {
  /** Fired once at the start of a drag, before anything is mutated. */
  beginEdit(): void
  setPixel(x: number, y: number, value: boolean): void
  setWidth(width: number): void
  setGuide(guide: GuideName, position: number): void
  /** Fired once when the drag ends. */
  endEdit(): void
}

/** Room reserved outside the grid for the marker handles, on all four sides. */
const MARKER_BAND = 16
const PADDING = 12
const MIN_CELL = 5
const MAX_CELL = 56
const MARKER_GRAB = 7
const TRIANGLE = 7

const COLORS = {
  background: '#17181b',
  cellOn: '#f2f2f0',
  cellOff: '#26282d',
  cellOnPast: '#6f7075',
  cellOffPast: '#1f2024',
  ghost: 'rgba(242, 242, 240, 0.42)',
  grid: '#3a3d44',
  border: '#5a5e68',
  marker: '#e0533d'
}

const GUIDE_STYLE: Record<GuideName, { color: string; dash: number[] }> = {
  capHeight: { color: '#d9a441', dash: [2, 3] },
  xHeight: { color: '#54b98a', dash: [5, 4] },
  baseline: { color: '#4a9ee0', dash: [] },
  leftColumn: { color: '#9b7fd4', dash: [4, 4] },
  rightColumn: { color: '#9b7fd4', dash: [4, 4] }
}

const ALL_VISIBLE: Record<GuideName, boolean> = {
  capHeight: true,
  xHeight: true,
  baseline: true,
  leftColumn: true,
  rightColumn: true
}

type DragMode = 'none' | 'paint' | 'width' | GuideName

/**
 * The NxM editing grid.
 *
 * Markers around it: the advance width (vertical, per glyph), three horizontal
 * guides and two column guides (font-wide). The advance marker is grabbed
 * anywhere along its line, but the guides are grabbed only by their handles in
 * the margins — full-length grab bands across the grid would have made the rows
 * and columns they sit on awkward to paint. Hidden guides are not grabbable.
 */
export class MatrixView {
  private readonly ctx: CanvasRenderingContext2D
  private doc: FontDoc | null = null
  private glyph: Glyph | null = null
  /** Drawn at half opacity behind the current glyph. */
  private reference: Glyph | null = null
  private visible: Record<GuideName, boolean> = { ...ALL_VISIBLE }
  private cell = 24
  private originX = PADDING
  private originY = MARKER_BAND
  private mode: DragMode = 'none'
  private paintValue = false
  private lastCell = { x: -1, y: -1 }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: MatrixCallbacks
  ) {
    this.ctx = canvas.getContext('2d')!
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    const observer = new ResizeObserver(() => {
      this.layout()
      this.render()
    })
    observer.observe(canvas.parentElement ?? canvas)
  }

  setGlyph(doc: FontDoc, glyph: Glyph | null, reference: Glyph | null = null): void {
    this.doc = doc
    this.glyph = glyph
    this.reference = reference
    this.layout()
    this.render()
  }

  setGuideVisibility(visible: Record<GuideName, boolean>): void {
    this.visible = { ...visible }
    this.render()
  }

  /** Sizes the backing store for the display DPI and centres the grid. */
  private layout(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    const cssWidth = Math.max(1, parent.clientWidth)
    const cssHeight = Math.max(1, parent.clientHeight)
    const dpr = window.devicePixelRatio || 1

    this.canvas.width = Math.round(cssWidth * dpr)
    this.canvas.height = Math.round(cssHeight * dpr)
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!this.doc) return
    // Every side loses a band so the handles always have somewhere to sit.
    const inset = (MARKER_BAND + PADDING) * 2
    const cell = Math.floor(
      Math.min((cssWidth - inset) / this.doc.width, (cssHeight - inset) / this.doc.height)
    )
    this.cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell))
    this.originX = Math.round((cssWidth - this.cell * this.doc.width) / 2)
    this.originY = Math.round((cssHeight - this.cell * this.doc.height) / 2)
  }

  private get gridRight(): number {
    return this.originX + (this.doc?.width ?? 0) * this.cell
  }

  private get gridBottom(): number {
    return this.originY + (this.doc?.height ?? 0) * this.cell
  }

  render(): void {
    const { ctx } = this
    const dpr = window.devicePixelRatio || 1
    const cssWidth = this.canvas.width / dpr
    const cssHeight = this.canvas.height / dpr
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, cssWidth, cssHeight)
    if (!this.doc) return

    const { width, height } = this.doc
    const { cell, originX, originY } = this
    const advance = this.glyph?.width ?? width

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const on = this.glyph ? getBit(this.glyph, width, x, y) : false
        const past = x >= advance
        ctx.fillStyle = on
          ? past
            ? COLORS.cellOnPast
            : COLORS.cellOn
          : past
            ? COLORS.cellOffPast
            : COLORS.cellOff
        ctx.fillRect(originX + x * cell, originY + y * cell, cell, cell)

        // The reference glyph shows through wherever the current glyph is clear.
        if (!on && this.reference && getBit(this.reference, width, x, y)) {
          ctx.fillStyle = COLORS.ghost
          ctx.fillRect(originX + x * cell, originY + y * cell, cell, cell)
        }
      }
    }

    // Dotted rules on every row and column boundary.
    ctx.save()
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    for (let x = 1; x < width; x++) {
      const px = originX + x * cell + 0.5
      ctx.moveTo(px, originY)
      ctx.lineTo(px, this.gridBottom)
    }
    for (let y = 1; y < height; y++) {
      const py = originY + y * cell + 0.5
      ctx.moveTo(originX, py)
      ctx.lineTo(this.gridRight, py)
    }
    ctx.stroke()
    ctx.restore()

    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 1
    ctx.strokeRect(originX + 0.5, originY + 0.5, width * cell - 1, height * cell - 1)

    for (const guide of VERTICAL_GUIDES) this.renderVerticalGuide(guide)
    for (const guide of HORIZONTAL_GUIDES) this.renderHorizontalGuide(guide)
    this.renderWidthMarker(advance)
  }

  private renderWidthMarker(advance: number): void {
    const { ctx } = this
    const x = this.originX + advance * this.cell
    const top = this.originY
    const bottom = this.gridBottom

    ctx.save()
    ctx.fillStyle = COLORS.marker
    ctx.strokeStyle = COLORS.marker
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    this.verticalHandles(x, top, bottom)
    ctx.restore()
  }

  private renderVerticalGuide(guide: VerticalGuide): void {
    if (!this.doc || !this.visible[guide]) return
    const { ctx } = this
    const x = this.originX + this.doc[guide] * this.cell
    const top = this.originY
    const bottom = this.gridBottom
    const style = GUIDE_STYLE[guide]

    ctx.save()
    ctx.fillStyle = style.color
    ctx.strokeStyle = style.color
    ctx.lineWidth = 2
    ctx.setLineDash(style.dash)
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.setLineDash([])
    this.verticalHandles(x, top, bottom)
    ctx.restore()
  }

  private renderHorizontalGuide(guide: HorizontalGuide): void {
    if (!this.doc || !this.visible[guide]) return
    const { ctx } = this
    const y = this.originY + this.doc[guide] * this.cell
    const left = this.originX
    const right = this.gridRight
    const style = GUIDE_STYLE[guide]

    ctx.save()
    ctx.fillStyle = style.color
    ctx.strokeStyle = style.color
    ctx.lineWidth = 2
    ctx.setLineDash(style.dash)
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    ctx.setLineDash([])

    // Right-facing triangle to the left of the grid, left-facing to the right.
    this.triangle(left - TRIANGLE - 2, y - TRIANGLE, left - TRIANGLE - 2, y + TRIANGLE, left - 2, y)
    this.triangle(right + TRIANGLE + 2, y - TRIANGLE, right + TRIANGLE + 2, y + TRIANGLE, right + 2, y)
    ctx.restore()
  }

  /** Downward-facing triangle above the grid, upward-facing below. */
  private verticalHandles(x: number, top: number, bottom: number): void {
    this.triangle(x - TRIANGLE, top - TRIANGLE - 2, x + TRIANGLE, top - TRIANGLE - 2, x, top - 2)
    this.triangle(
      x - TRIANGLE,
      bottom + TRIANGLE + 2,
      x + TRIANGLE,
      bottom + TRIANGLE + 2,
      x,
      bottom + 2
    )
  }

  private triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineTo(x3, y3)
    ctx.closePath()
    ctx.fill()
  }

  private toLocal(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private toCell(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.floor((point.x - this.originX) / this.cell),
      y: Math.floor((point.y - this.originY) / this.cell)
    }
  }

  /**
   * Guides are grabbable only outside the grid, in the handle margins, so the
   * cells they cross stay paintable. Ties go to whichever line is nearer.
   */
  private hitGuide(point: { x: number; y: number }): GuideName | null {
    if (!this.doc) return null
    const doc = this.doc

    const inSideMargin = point.x < this.originX || point.x > this.gridRight
    const inEndMargin = point.y < this.originY || point.y > this.gridBottom

    const candidates: Array<[GuideName, number]> = []
    if (inSideMargin) {
      for (const guide of HORIZONTAL_GUIDES) {
        if (!this.visible[guide]) continue
        candidates.push([guide, Math.abs(point.y - (this.originY + doc[guide] * this.cell))])
      }
    }
    if (inEndMargin) {
      for (const guide of VERTICAL_GUIDES) {
        if (!this.visible[guide]) continue
        candidates.push([guide, Math.abs(point.x - (this.originX + doc[guide] * this.cell))])
      }
    }
    if (candidates.length === 0) return null

    const [name, distance] = candidates.sort((a, b) => a[1] - b[1])[0]!
    return distance <= MARKER_GRAB ? name : null
  }

  /** The advance marker is grabbable anywhere along its line. */
  private hitsWidthMarker(point: { x: number; y: number }): boolean {
    if (!this.glyph) return false
    const markerX = this.originX + this.glyph.width * this.cell
    return Math.abs(point.x - markerX) <= MARKER_GRAB
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.doc || event.button !== 0) return
    const point = this.toLocal(event)

    // Guide handles win in the margins, so a column guide sitting under the
    // advance marker's line is still reachable.
    const guide = this.hitGuide(point)
    if (guide) {
      this.canvas.setPointerCapture(event.pointerId)
      this.mode = guide
      this.callbacks.beginEdit()
      this.applyGuide(guide, point)
      return
    }

    if (!this.glyph) return
    this.canvas.setPointerCapture(event.pointerId)

    if (this.hitsWidthMarker(point)) {
      this.mode = 'width'
      this.callbacks.beginEdit()
      this.applyWidth(point.x)
      return
    }

    const cell = this.toCell(point)
    if (!this.inBounds(cell)) return

    this.mode = 'paint'
    // The first cell decides whether this stroke paints or erases.
    this.paintValue = !getBit(this.glyph, this.doc.width, cell.x, cell.y)
    this.callbacks.beginEdit()
    this.lastCell = cell
    this.callbacks.setPixel(cell.x, cell.y, this.paintValue)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.doc) return
    const point = this.toLocal(event)

    if (this.mode === 'none') {
      this.updateCursor(point)
      return
    }
    if (this.mode === 'width') {
      this.applyWidth(point.x)
      return
    }
    if (this.mode !== 'paint') {
      this.applyGuide(this.mode, point)
      return
    }

    const cell = this.toCell(point)
    if (!this.inBounds(cell)) return
    if (cell.x === this.lastCell.x && cell.y === this.lastCell.y) return
    this.lastCell = cell
    this.callbacks.setPixel(cell.x, cell.y, this.paintValue)
  }

  private onPointerUp = (): void => {
    if (this.mode === 'none') return
    this.mode = 'none'
    this.lastCell = { x: -1, y: -1 }
    this.callbacks.endEdit()
  }

  /** Handles sit in the margins, so the cursor is the main hint that they are there. */
  private updateCursor(point: { x: number; y: number }): void {
    const guide = this.hitGuide(point)
    if (guide) {
      this.canvas.style.cursor = HORIZONTAL_GUIDES.includes(guide as HorizontalGuide)
        ? 'ns-resize'
        : 'ew-resize'
    } else if (this.hitsWidthMarker(point)) this.canvas.style.cursor = 'ew-resize'
    else if (this.inBounds(this.toCell(point))) this.canvas.style.cursor = 'crosshair'
    else this.canvas.style.cursor = 'default'
  }

  private applyWidth(px: number): void {
    if (!this.doc) return
    const snapped = Math.round((px - this.originX) / this.cell)
    this.callbacks.setWidth(Math.max(0, Math.min(this.doc.width, snapped)))
  }

  private applyGuide(guide: GuideName, point: { x: number; y: number }): void {
    if (!this.doc) return
    const vertical = VERTICAL_GUIDES.includes(guide as VerticalGuide)
    const extent = vertical ? this.doc.width : this.doc.height
    const offset = vertical ? point.x - this.originX : point.y - this.originY
    const snapped = Math.round(offset / this.cell)
    this.callbacks.setGuide(guide, Math.max(0, Math.min(extent, snapped)))
  }

  private inBounds(cell: { x: number; y: number }): boolean {
    if (!this.doc) return false
    return cell.x >= 0 && cell.x < this.doc.width && cell.y >= 0 && cell.y < this.doc.height
  }
}
