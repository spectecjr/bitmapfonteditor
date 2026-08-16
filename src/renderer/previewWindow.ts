import type { FontDoc } from '@shared/types'
import type { PixelAspect, PreviewZoom } from '@shared/previewApi'
import { reverseCodepage } from './model/codepage'
import { drawGlyphScaled, prepareCanvas } from './ui/draw'
import './previewWindowStyles.css'

const GAP = 8
const BACKGROUND = '#17181b'
const INK = '#f2f2f0'

let doc: FontDoc | null = null
let text = ''
let zoom: PreviewZoom = 2
let pixelAspect: PixelAspect = 'square'
let wrap = true
/** Seeded once from the main window's text on the first `preview:data` message, then this window's own. */
let seededText = false

const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement
const host = document.getElementById('preview-host') as HTMLElement
const textInput = document.getElementById('preview-text-input') as HTMLInputElement
const zoomButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-zoom]')]
const aspectButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-aspect]')]
const wrapButton = document.getElementById('wrap-toggle') as HTMLButtonElement

function repaint(): void {
  const cssWidth = Math.max(1, host.clientWidth)
  const cssHeight = Math.max(1, host.clientHeight)
  const ctx = prepareCanvas(canvas, cssWidth, cssHeight)
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, cssWidth, cssHeight)
  if (!doc) return
  ctx.fillStyle = INK

  const scaleY = zoom
  const scaleX = pixelAspect === 'half' ? zoom / 2 : zoom
  const reverse = reverseCodepage(doc.codepage)
  const lineHeight = doc.height * scaleY + GAP

  let x = GAP
  let y = GAP
  for (const char of text) {
    if (char === '\n') {
      x = GAP
      y += lineHeight
      continue
    }
    const code = reverse.get(char)
    const glyph = code === undefined ? undefined : doc.glyphs[code]
    const advance = (glyph ? glyph.width : doc.width) * scaleX
    // Wrap at the cell boundary, like a terminal — mid-word breaks are fine
    // for previewing a bitmap face rather than reading prose. With wrap off,
    // text just runs past the visible edge on one line instead.
    if (wrap && x + advance > cssWidth - GAP && x > GAP) {
      x = GAP
      y += lineHeight
    }
    if (y > cssHeight) break
    if (glyph) drawGlyphScaled(ctx, glyph, doc.width, x, y, scaleX, scaleY)
    x += advance
  }
}

function setZoom(next: PreviewZoom): void {
  zoom = next
  for (const button of zoomButtons) {
    button.classList.toggle('active', Number(button.dataset['zoom']) === zoom)
  }
  repaint()
}

function setPixelAspect(next: PixelAspect): void {
  pixelAspect = next
  for (const button of aspectButtons) {
    button.classList.toggle('active', button.dataset['aspect'] === pixelAspect)
  }
  repaint()
}

function setWrap(next: boolean): void {
  wrap = next
  wrapButton.classList.toggle('active', wrap)
  repaint()
}

for (const button of zoomButtons) {
  button.addEventListener('click', () => {
    const value = Number(button.dataset['zoom']) as PreviewZoom
    setZoom(value)
    window.previewApi.setZoom(value)
  })
}

for (const button of aspectButtons) {
  button.addEventListener('click', () => {
    const value = button.dataset['aspect'] as PixelAspect
    setPixelAspect(value)
    window.previewApi.setPixelAspect(value)
  })
}

wrapButton.addEventListener('click', () => {
  setWrap(!wrap)
  window.previewApi.setWrap(wrap)
})

textInput.addEventListener('input', () => {
  text = textInput.value
  repaint()
})

window.previewApi.onData((nextDoc, nextText) => {
  doc = nextDoc
  // The text field is this window's own once seeded — later doc pushes (from
  // glyph edits, undo/redo, ...) shouldn't overwrite what the user typed here.
  if (!seededText) {
    seededText = true
    text = nextText
    textInput.value = nextText
  }
  repaint()
})

void window.previewApi.getSettings().then((settings) => {
  setZoom(settings.zoom)
  setPixelAspect(settings.pixelAspect)
  setWrap(settings.wrap)
})

new ResizeObserver(() => repaint()).observe(host)
