import {
  DEFAULT_FONT_HEIGHT,
  DEFAULT_FONT_WIDTH,
  HORIZONTAL_GUIDES,
  MAX_FONT_HEIGHT,
  MAX_FONT_WIDTH,
  VERTICAL_GUIDES,
  type FontDoc,
  type GuideName,
  type Glyph
} from '@shared/types'

const GUIDE_NAMES: readonly GuideName[] = [...HORIZONTAL_GUIDES, ...VERTICAL_GUIDES]
import { buildCp437, buildCp437Sam, displayChar } from './model/codepage'
import {
  addCodepoint,
  bytesPerLine,
  clampGuide,
  clampHeight,
  clampWidth,
  createFont,
  definedCodepoints,
  populateFromCodepage,
  removeCodepoint,
  resizeFont,
  resizeLosesData
} from './model/font'
import {
  clearGlyph,
  fittedWidth,
  flipHorizontal,
  flipVertical,
  invertGlyph,
  setBit,
  shiftGlyph,
  widthMask
} from './model/glyph'
import { exportBitmap, parseMapping, serializeMapping, serializeWidths } from './io/export'
import { parseProject, serializeProject } from './io/project'
import { History } from './state/history'
import { shortcutFor } from './state/shortcuts'
import { Store } from './state/store'
import { parseCodepoint, showConfirm, showForm, showMessage } from './ui/dialogs'
import { GlyphListView } from './ui/glyphlist'
import { MatrixView } from './ui/matrix'
import { PreviewView } from './ui/preview'
import './styles.css'

/** A fresh font: printable ASCII defined, but the full SAM CP437 map available. */
function createDefaultDoc(): FontDoc {
  const doc = createFont(DEFAULT_FONT_WIDTH, DEFAULT_FONT_HEIGHT, buildCp437Sam())
  for (let code = 0x20; code <= 0x7f; code++) addCodepoint(doc, code)
  return doc
}

const store = new Store({
  doc: createDefaultDoc(),
  selected: 0x20,
  reference: null,
  projectPath: null,
  dirty: false,
  clipboard: null,
  previewText: 'Sphinx of black quartz, judge my vow. 0123456789'
})
const history = new History()

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const fontInfo = $('font-info')
const glyphInfo = $('glyph-info')
const statusLine = $('status')
const previewInput = $<HTMLInputElement>('preview-text')

const matrix = new MatrixView($<HTMLCanvasElement>('matrix'), {
  beginEdit: () => history.begin(store.doc),
  setPixel: (x, y, value) => {
    const glyph = store.glyph
    if (!glyph) return
    setBit(glyph, store.doc.width, x, y, value)
    matrix.render()
  },
  setWidth: (width) => {
    const glyph = store.glyph
    if (!glyph) return
    glyph.width = width
    matrix.render()
    updateInfo()
  },
  setGuide: (guide, position) => {
    store.doc[guide] = position
    matrix.render()
    updateInfo()
  },
  endEdit: () => {
    if (!history.commit(store.doc)) return
    markDirty()
    refresh()
  }
})

const glyphList = new GlyphListView($('glyph-list'), {
  onSelect: (code) => selectCodepoint(code),
  onToggleReference: (code) => toggleReference(code)
})
const preview = new PreviewView($<HTMLCanvasElement>('preview-canvas'))

// --- rendering -------------------------------------------------------------

/** `structure` rebuilds the whole sidebar; otherwise only the current row repaints. */
function refresh(structure = false): void {
  const state = store.get()
  matrix.setGlyph(state.doc, store.glyph, store.referenceGlyph)
  if (structure) {
    glyphList.rebuild(state.doc, state.selected, state.reference)
  } else {
    if (state.selected !== null) glyphList.updateGlyph(state.doc, state.selected)
    glyphList.setSelected(state.selected)
    glyphList.setReference(state.reference)
  }
  preview.render(state.doc, state.previewText)
  updateInfo()
}

function updateInfo(): void {
  const { doc, selected, reference } = store.get()
  const codes = definedCodepoints(doc)
  const stride = bytesPerLine(doc.width) * doc.height
  const bytesWord = bytesPerLine(doc.width) === 1 ? 'byte' : 'bytes'
  fontInfo.textContent =
    `${doc.width} × ${doc.height} px · ${bytesPerLine(doc.width)} ${bytesWord}/line · ` +
    `cap ${doc.capHeight} · x-height ${doc.xHeight} · baseline ${doc.baseline} · ` +
    `cols ${doc.leftColumn}–${doc.rightColumn} · ` +
    `${codes.length} glyphs · ${codes.length * stride} bytes`

  const glyph = store.glyph
  if (selected === null || !glyph) {
    glyphInfo.textContent = 'No glyph selected'
    statusLine.textContent = 'Use Font ▸ Add Codepoint… to start a glyph.'
  } else {
    const hex = selected.toString(16).toUpperCase().padStart(2, '0')
    glyphInfo.textContent =
      `0x${hex} (${selected})  ${displayChar(doc.codepage[selected])}  ` +
      `· advance ${glyph.width}/${doc.width} px`
    const ghost = reference
    statusLine.textContent =
      'Drag to paint · drag the red marker for advance width · drag the margin handles for guides · ' +
      (ghost === null || ghost === selected
        ? 'shift-click a glyph in the map to show it as a reference.'
        : `reference: 0x${ghost.toString(16).toUpperCase().padStart(2, '0')} ` +
          `(shift-click it again to clear).`)
  }
  updateTitle()
}

function documentName(): string {
  const path = store.get().projectPath
  if (!path) return 'Untitled'
  return path.split(/[\\/]/).pop() ?? 'Untitled'
}

function updateTitle(): void {
  const dirty = store.get().dirty ? ' •' : ''
  window.api.setTitle(`${documentName()}${dirty} — Font Editor`)
}

function markDirty(dirty = true): void {
  store.get().dirty = dirty
  window.api.setDirty(dirty)
  updateTitle()
}

// --- editing ---------------------------------------------------------------

/** Wraps a discrete (non-drag) change: one undo entry, then a repaint. */
function editGlyph(fn: (glyph: Glyph, doc: FontDoc) => void, structure = false): void {
  const glyph = store.glyph
  if (!glyph) return
  history.record(store.doc)
  fn(glyph, store.doc)
  markDirty()
  refresh(structure)
}

function editDoc(fn: (doc: FontDoc) => void, structure = true): void {
  history.record(store.doc)
  fn(store.doc)
  markDirty()
  refresh(structure)
}

function selectCodepoint(code: number): void {
  store.get().selected = code
  refresh()
}

/** Shift-click pins a glyph as a ghost behind the current one; clicking it again clears it. */
function toggleReference(code: number): void {
  const state = store.get()
  state.reference = state.reference === code ? null : code
  refresh()
}

function stepSelection(delta: number): void {
  const codes = definedCodepoints(store.doc)
  if (codes.length === 0) return
  const current = store.get().selected
  const index = current === null ? -1 : codes.indexOf(current)
  const next = Math.max(0, Math.min(codes.length - 1, index + delta))
  selectCodepoint(codes[next]!)
}

function copyGlyph(): void {
  const state = store.get()
  const glyph = store.glyph
  if (!glyph || state.selected === null) return
  state.clipboard = {
    rows: glyph.rows.slice(),
    width: glyph.width,
    fontWidth: store.doc.width
  }
  // Copying changes nothing on screen, so say so or it looks like a dead key.
  const hex = state.selected.toString(16).toUpperCase().padStart(2, '0')
  statusLine.textContent = `Copied glyph 0x${hex} — select another codepoint and press Ctrl+V to paste.`
}

function pasteGlyph(): void {
  const entry = store.get().clipboard
  if (!entry) return
  editGlyph((glyph, doc) => {
    // Re-align if the font has been resized since the copy.
    const delta = doc.width - entry.fontWidth
    const mask = widthMask(doc.width)
    for (let y = 0; y < doc.height; y++) {
      const row = entry.rows[y] ?? 0
      const aligned = delta >= 0 ? (row << delta) >>> 0 : row >>> -delta
      glyph.rows[y] = (aligned & mask) >>> 0
    }
    glyph.width = Math.min(entry.width, doc.width)
  })
}

function applyUndo(redo: boolean): void {
  const state = store.get()
  const restored = redo ? history.redo(state.doc) : history.undo(state.doc)
  if (!restored) return
  state.doc = restored
  if (state.selected !== null && !restored.glyphs[state.selected]) {
    state.selected = definedCodepoints(restored)[0] ?? null
  }
  markDirty()
  refresh(true)
}

// --- files -----------------------------------------------------------------

function mappingForDefinedGlyphs(doc: FontDoc): Record<number, string> {
  const out: Record<number, string> = {}
  for (const code of definedCodepoints(doc)) {
    const char = doc.codepage[code]
    if (char !== undefined) out[code] = char
  }
  return out
}

async function saveProject(saveAs: boolean): Promise<boolean> {
  const state = store.get()
  const path = await window.api.saveProject(
    serializeProject(state.doc),
    state.projectPath,
    saveAs
  )
  if (!path) return false
  state.projectPath = path
  markDirty(false)
  return true
}

/** Returns false if the user cancelled out of an action that would lose changes. */
async function confirmDiscard(): Promise<boolean> {
  if (!store.get().dirty) return true
  const choice = await window.api.askUnsaved(documentName())
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  return saveProject(false)
}

async function newFont(): Promise<void> {
  if (!(await confirmDiscard())) return
  const state = store.get()
  state.doc = createDefaultDoc()
  state.selected = 0x20
  state.reference = null
  state.projectPath = null
  history.clear()
  markDirty(false)
  refresh(true)
}

async function openProject(): Promise<void> {
  if (!(await confirmDiscard())) return
  const file = await window.api.openProject()
  if (!file) return
  try {
    const doc = parseProject(file.text)
    const state = store.get()
    state.doc = doc
    state.selected = definedCodepoints(doc)[0] ?? null
    state.reference = null
    state.projectPath = file.path
    history.clear()
    markDirty(false)
    refresh(true)
  } catch (error) {
    await window.api.error('Could not open that project.', (error as Error).message)
  }
}

async function exportFont(): Promise<void> {
  const doc = store.doc
  if (definedCodepoints(doc).length === 0) {
    await window.api.error('Nothing to export.', 'The font has no glyphs defined.')
    return
  }
  const base = await window.api.exportFont({
    bin: exportBitmap(doc),
    widths: serializeWidths(doc),
    mapping: serializeMapping(mappingForDefinedGlyphs(doc))
  })
  if (base) {
    statusLine.textContent = `Exported ${base}.bin, ${base}.widths.json and ${base}.map.json`
  }
}

async function importMapping(): Promise<void> {
  const file = await window.api.importMapping()
  if (!file) return
  try {
    const codepage = parseMapping(file.text)
    editDoc((doc) => {
      doc.codepage = { ...doc.codepage, ...codepage }
    })
  } catch (error) {
    await window.api.error('Could not read that mapping file.', (error as Error).message)
  }
}

// --- dialog-backed commands ------------------------------------------------

async function changeDimensions(): Promise<void> {
  const doc = store.doc
  const values = await showForm('Font Dimensions', [
    {
      name: 'width',
      label: 'Cell width (pixels)',
      value: String(doc.width),
      type: 'number',
      min: 1,
      max: MAX_FONT_WIDTH,
      hint: `1–${MAX_FONT_WIDTH}; 1–8 packs to 1 byte per line, 9–16 to 2, and so on.`
    },
    {
      name: 'height',
      label: 'Cell height (lines)',
      value: String(doc.height),
      type: 'number',
      min: 1,
      max: MAX_FONT_HEIGHT,
      hint: `1–${MAX_FONT_HEIGHT}.`
    }
  ])
  if (!values) return

  const width = clampWidth(Number(values['width']))
  const height = clampHeight(Number(values['height']))
  if (!Number.isFinite(width) || !Number.isFinite(height)) return
  if (width === doc.width && height === doc.height) return

  if (resizeLosesData(doc, width, height)) {
    const ok = await showConfirm(
      'Discard pixels?',
      `Resizing to ${width} × ${height} will permanently remove pixels that fall outside the new cell.`,
      'Resize'
    )
    if (!ok) return
  }
  editDoc((target) => resizeFont(target, width, height))
}

async function changeGuidelines(): Promise<void> {
  const doc = store.doc
  const values = await showForm('Guidelines', [
    {
      name: 'capHeight',
      label: 'Cap height (row)',
      value: String(doc.capHeight),
      type: 'number',
      min: 0,
      max: doc.height,
      hint: `0–${doc.height}, measured from the top of the cell.`
    },
    {
      name: 'xHeight',
      label: 'x-height (row)',
      value: String(doc.xHeight),
      type: 'number',
      min: 0,
      max: doc.height,
      hint: 'Where lowercase letters top out.'
    },
    {
      name: 'baseline',
      label: 'Baseline (row)',
      value: String(doc.baseline),
      type: 'number',
      min: 0,
      max: doc.height,
      hint: `${doc.height} is the bottom edge, so a lower number leaves descender space.`
    },
    {
      name: 'leftColumn',
      label: 'Left column (column)',
      value: String(doc.leftColumn),
      type: 'number',
      min: 0,
      max: doc.width,
      hint: `0–${doc.width}. Marks a narrower cell inside this one — 1 trims the first column.`
    },
    {
      name: 'rightColumn',
      label: 'Right column (column)',
      value: String(doc.rightColumn),
      type: 'number',
      min: 0,
      max: doc.width,
      hint: 'Guides are metrics only — they never alter the exported bitmap.'
    }
  ])
  if (!values) return

  const next = {
    capHeight: clampGuide(Number(values['capHeight']), doc.height),
    xHeight: clampGuide(Number(values['xHeight']), doc.height),
    baseline: clampGuide(Number(values['baseline']), doc.height),
    leftColumn: clampGuide(Number(values['leftColumn']), doc.width),
    rightColumn: clampGuide(Number(values['rightColumn']), doc.width)
  }
  if (Object.values(next).some((value) => !Number.isFinite(value))) return
  if (GUIDE_NAMES.every((name) => next[name] === doc[name])) return

  editDoc((target) => Object.assign(target, next), false)
}

async function addCodepointCommand(): Promise<void> {
  const values = await showForm('Add Codepoint', [
    {
      name: 'code',
      label: 'Codepoint',
      value: '',
      hint: 'Decimal (65), hex (0x41 or $41), or the character itself (A).'
    }
  ])
  if (!values) return
  const code = parseCodepoint(values['code'] ?? '')
  if (code === null) {
    await window.api.error('That is not a codepoint in the range 0–255.')
    return
  }
  if (store.doc.glyphs[code]) {
    selectCodepoint(code)
    return
  }
  editDoc((doc) => addCodepoint(doc, code))
  selectCodepoint(code)
}

async function removeCodepointCommand(): Promise<void> {
  const selected = store.get().selected
  if (selected === null) return
  const hex = selected.toString(16).toUpperCase().padStart(2, '0')
  const ok = await showConfirm(
    'Remove Codepoint',
    `Remove 0x${hex} and its artwork from the font?`,
    'Remove'
  )
  if (!ok) return

  const codes = definedCodepoints(store.doc)
  const index = codes.indexOf(selected)
  editDoc((doc) => removeCodepoint(doc, selected))
  const remaining = definedCodepoints(store.doc)
  const state = store.get()
  state.selected = remaining[Math.min(index, remaining.length - 1)] ?? null
  if (state.reference === selected) state.reference = null
  refresh(true)
}

async function editMappingCommand(): Promise<void> {
  const selected = store.get().selected
  if (selected === null) return
  const hex = selected.toString(16).toUpperCase().padStart(2, '0')
  const values = await showForm(`Mapping for 0x${hex}`, [
    {
      name: 'char',
      label: 'Character',
      value: store.doc.codepage[selected] ?? '',
      hint: 'The Unicode character this codepoint represents. Display only — never exported in the bitmap.'
    }
  ])
  if (!values) return
  const char = values['char'] ?? ''
  editDoc((doc) => {
    if (char) doc.codepage[selected] = char
    else delete doc.codepage[selected]
  })
}

async function populateCp437(sam: boolean): Promise<void> {
  const ok = await showConfirm(
    'Populate CP437',
    sam
      ? 'Define all 256 CP437 codepoints (SAM Coupe variant: £ at 0x60, © at 0x7F). Existing artwork is kept.'
      : 'Define all 256 stock CP437 codepoints. Existing artwork is kept.',
    'Populate'
  )
  if (!ok) return
  editDoc((doc) => populateFromCodepage(doc, sam ? buildCp437Sam() : buildCp437()))
  if (store.get().selected === null) store.get().selected = definedCodepoints(store.doc)[0] ?? null
  refresh(true)
}

// --- command routing -------------------------------------------------------

function isTypingInField(): boolean {
  const active = document.activeElement
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
}

function isModalOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}

async function dispatch(command: string): Promise<void> {
  // A modal owns the app until it is dismissed; only the close request gets through.
  if (isModalOpen() && command !== 'app:closeRequest') return

  switch (command) {
    case 'file:new':
      await newFont()
      break
    case 'file:open':
      await openProject()
      break
    case 'file:save':
      await saveProject(false)
      break
    case 'file:saveAs':
      await saveProject(true)
      break
    case 'file:export':
      await exportFont()
      break

    case 'edit:undo':
      applyUndo(false)
      break
    case 'edit:redo':
      applyUndo(true)
      break
    case 'edit:copy':
      copyGlyph()
      break
    case 'edit:paste':
      pasteGlyph()
      break
    case 'edit:clear':
      editGlyph((glyph) => clearGlyph(glyph))
      break
    case 'edit:invert':
      editGlyph((glyph, doc) => invertGlyph(glyph, doc.width))
      break
    case 'edit:flipH':
      editGlyph((glyph, doc) => flipHorizontal(glyph, doc.width))
      break
    case 'edit:flipV':
      editGlyph((glyph) => flipVertical(glyph))
      break
    case 'edit:shiftUp':
      editGlyph((glyph, doc) => shiftGlyph(glyph, doc.width, 0, -1))
      break
    case 'edit:shiftDown':
      editGlyph((glyph, doc) => shiftGlyph(glyph, doc.width, 0, 1))
      break
    case 'edit:shiftLeft':
      editGlyph((glyph, doc) => shiftGlyph(glyph, doc.width, -1, 0))
      break
    case 'edit:shiftRight':
      editGlyph((glyph, doc) => shiftGlyph(glyph, doc.width, 1, 0))
      break

    case 'font:dimensions':
      await changeDimensions()
      break
    case 'font:guidelines':
      await changeGuidelines()
      break
    case 'font:add':
      await addCodepointCommand()
      break
    case 'font:remove':
      await removeCodepointCommand()
      break
    case 'font:fitWidth':
      editGlyph((glyph, doc) => {
        glyph.width = fittedWidth(glyph, doc.width)
      })
      break
    case 'font:fitWidthTight':
      editGlyph((glyph, doc) => {
        glyph.width = fittedWidth(glyph, doc.width, 0)
      })
      break
    case 'font:resetWidth':
      editGlyph((glyph, doc) => {
        glyph.width = doc.width
      })
      break

    case 'helpers:cp437Sam':
      await populateCp437(true)
      break
    case 'helpers:cp437':
      await populateCp437(false)
      break
    case 'helpers:editMapping':
      await editMappingCommand()
      break
    case 'helpers:importMapping':
      await importMapping()
      break
    case 'helpers:exportMapping':
      await window.api.exportMapping(serializeMapping(mappingForDefinedGlyphs(store.doc)))
      break

    case 'view:prev':
      stepSelection(-1)
      break
    case 'view:next':
      stepSelection(1)
      break
    case 'view:clearReference':
      if (store.get().reference !== null) {
        store.get().reference = null
        refresh()
      }
      break

    case 'help:about':
      await showMessage(
        'Font Editor',
        'Monochrome bitmap font editor — variable and fixed width, 1bpp output with separate width and codepoint-mapping sidecars.'
      )
      break

    case 'app:closeRequest':
      if (await confirmDiscard()) window.api.forceClose()
      break

    default:
      break
  }
}

// --- boot ------------------------------------------------------------------

window.api.onCommand((command) => void dispatch(command))

// Main owns the view preferences and pushes the whole set whenever a tick changes.
window.api.onViewState((view) => {
  matrix.setGuideVisibility(view.guides)
  preview.setInverted(view.previewInverted)
})

previewInput.value = store.get().previewText
previewInput.addEventListener('input', () => {
  store.get().previewText = previewInput.value
  preview.render(store.doc, previewInput.value)
})

// A focused text field keeps Chromium's own clipboard behaviour; everywhere else
// these keys belong to the glyph.
window.addEventListener('keydown', (event) => {
  if (isTypingInField() || isModalOpen()) return
  const command = shortcutFor(event)
  if (!command) return
  event.preventDefault()
  void dispatch(command)
})

setupSplitter()
releaseFocusOnOutsideClick()

refresh(true)
markDirty(false)

/**
 * The canvas is not focusable, so clicking from the preview box back onto the
 * grid used to leave focus in the input — and every glyph shortcut kept going to
 * the text field instead of the glyph.
 */
function releaseFocusOnOutsideClick(): void {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, dialog')) return
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.blur()
    }
  })
}

/** Drag the divider to resize the character map; it reflows into more columns as it widens. */
function setupSplitter(): void {
  const splitter = $('splitter')
  const layout = document.querySelector('main')!
  const MIN = 180

  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    splitter.setPointerCapture(event.pointerId)
    splitter.classList.add('dragging')

    const onMove = (move: PointerEvent): void => {
      const max = Math.max(MIN, window.innerWidth * 0.7)
      const width = Math.min(max, Math.max(MIN, window.innerWidth - move.clientX))
      layout.style.setProperty('--sidebar-width', `${Math.round(width)}px`)
    }
    const onUp = (): void => {
      splitter.classList.remove('dragging')
      splitter.removeEventListener('pointermove', onMove)
      splitter.removeEventListener('pointerup', onUp)
    }

    splitter.addEventListener('pointermove', onMove)
    splitter.addEventListener('pointerup', onUp)
  })
}
