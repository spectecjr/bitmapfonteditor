import {
  DEFAULT_FONT_HEIGHT,
  DEFAULT_FONT_WIDTH,
  HORIZONTAL_GUIDES,
  MAX_CODEPOINT,
  MAX_FONT_HEIGHT,
  MAX_FONT_WIDTH,
  VERTICAL_GUIDES,
  type FontDoc,
  type GuideName,
  type Glyph,
  type HorizontalGuide
} from '@shared/types'

const GUIDE_NAMES: readonly GuideName[] = [...HORIZONTAL_GUIDES, ...VERTICAL_GUIDES]
const INVALID_CODEPOINT_MESSAGE = `That is not a codepoint in the range 0–0x${MAX_CODEPOINT.toString(16).toUpperCase()}.`
import type { FileResult } from '@shared/api'
import {
  buildAscii,
  buildAsciiSam,
  buildCp437,
  buildCp437Sam,
  displayChar,
  formatCodepoint
} from './model/codepage'
import {
  addCodepoint,
  buildFont,
  bytesPerLine,
  clampGuide,
  clampHeight,
  clampWidth,
  definedCodepoints,
  populateFromCodepage,
  removeCodepoint,
  renumberCodepoints,
  resizeFont,
  resizeLosesData,
  trimCodepointRange
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
import { computeGuides, pickPixelSize, requiredWidth } from './model/systemFont'
import { exportBitmap, parseMapping, serializeMapping, serializeWidths } from './io/export'
import { parseProject, serializeProject } from './io/project'
import { clampBytesPerLine, clampLinesPerChar, estimateImport, importRawFont } from './io/rawImport'
import { History } from './state/history'
import { shortcutFor } from './state/shortcuts'
import { Store } from './state/store'
import {
  parseCodepoint,
  parseUnicodeCodepoint,
  showConfirm,
  showForm,
  showMappingDialog,
  showMessage
} from './ui/dialogs'
import { showFontPropertiesDialog, showNewFontDialog, type LoadMappingResult } from './ui/fontDialog'
import { GlyphListView } from './ui/glyphlist'
import { MatrixView } from './ui/matrix'
import { PreviewView } from './ui/preview'
import {
  bitsToRows,
  createMeasureContext,
  isFontAvailable,
  measureChar,
  measureFontMetrics,
  rasterizeChar
} from './ui/systemFontFill'
import './styles.css'

/** A fresh font: printable ASCII defined, but the full SAM CP437 map available. */
function createDefaultDoc(): FontDoc {
  return buildFont({
    width: DEFAULT_FONT_WIDTH,
    height: DEFAULT_FONT_HEIGHT,
    firstCodepoint: 0x20,
    lastCodepoint: 0x7f,
    codepage: buildCp437Sam()
  })
}

const store = new Store({
  doc: createDefaultDoc(),
  selected: 0x20,
  reference: null,
  projectPath: null,
  dirty: false,
  clipboard: null,
  // The pangram plus every other visible ASCII character not already in it
  // (digits, punctuation, the rest of the uppercase alphabet), appended after
  // the numbers, so a fresh font's preview exercises the whole printable set.
  previewText:
    "Sphinx of black quartz, judge my vow. 0123456789 !\"#$%&'()*+-/:;<=>?@ABCDEFGHIJKLMNOPQRTUVWXYZ[\\]^_`s{|}~"
})
const history = new History()

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const fontInfo = $('font-info')
const glyphInfo = $('glyph-info')
const statusLine = $('status')
const previewInput = $<HTMLInputElement>('preview-text')

/**
 * Each affected glyph's width when the current Ctrl+Shift (whole-font
 * relative) width drag started — captured lazily on the drag's first
 * `setWidth` call, since `matrix.ts` reports a running delta from drag start
 * on every move, not a per-move increment. Cleared once the drag ends.
 */
let wholeWidthOriginal: Record<number, number> | null = null

const matrix = new MatrixView($<HTMLCanvasElement>('matrix'), {
  beginEdit: () => history.begin(store.doc),
  setPixel: (x, y, value) => {
    const glyph = store.glyph
    if (!glyph) return
    setBit(glyph, store.doc.width, x, y, value)
    matrix.render()
  },
  setWidth: (value, mode) => {
    const doc = store.doc
    if (mode === 'single') {
      const glyph = store.glyph
      if (!glyph) return
      glyph.width = value
      matrix.render()
      updateInfo()
      return
    }
    if (mode === 'wholeAbsolute') {
      for (const glyph of Object.values(doc.glyphs)) glyph.width = value
    } else {
      wholeWidthOriginal ??= Object.fromEntries(
        Object.entries(doc.glyphs).map(([code, glyph]) => [Number(code), glyph.width])
      )
      for (const [code, glyph] of Object.entries(doc.glyphs)) {
        const original = wholeWidthOriginal[Number(code)] ?? glyph.width
        glyph.width = Math.max(0, Math.min(doc.width, original + value))
      }
    }
    matrix.render()
    refreshAllThumbnails()
    updateInfo()
  },
  setGuide: (guide, position) => {
    store.doc[guide] = position
    matrix.render()
    updateInfo()
  },
  endEdit: () => {
    wholeWidthOriginal = null
    if (!history.commit(store.doc)) return
    markDirty()
    refresh()
  }
})

const glyphList = new GlyphListView($('glyph-list'), {
  onSelect: (code) => selectCodepoint(code),
  onToggleReference: (code) => toggleReference(code),
  onEditMapping: (code) => void editMappingCommand(code)
})
const preview = new PreviewView($<HTMLCanvasElement>('preview-canvas'))
// Clicking the preview strip toggles the same black/white background as the
// View menu checkbox — main owns the setting, so this just asks it to flip.
$<HTMLCanvasElement>('preview-canvas').addEventListener('click', () => {
  window.api.togglePreviewInverted()
})

/** Renders the in-app preview strip and relays the same data to the Magnified Preview window, if open. */
function renderPreview(doc: FontDoc, text: string): void {
  preview.render(doc, text)
  window.api.pushPreviewData(doc, text)
}

// --- rendering -------------------------------------------------------------

/**
 * Cap height/x-height/baseline visibility, as last pushed from main — a global
 * app preference. Left/right column visibility is NOT here: it lives on the
 * FontDoc itself (see `applyGuideVisibility`), so it travels with the file.
 */
let horizontalGuideVisibility: Record<HorizontalGuide, boolean> = {
  capHeight: true,
  xHeight: true,
  baseline: true
}

/** Merges the global horizontal-guide prefs with the current doc's column-guide state. */
function applyGuideVisibility(): void {
  const doc = store.doc
  matrix.setGuideVisibility({
    ...horizontalGuideVisibility,
    leftColumn: doc.showLeftColumn,
    rightColumn: doc.showRightColumn
  })
}

/** Keeps the View menu's column-guide checkboxes honest after the document changes underneath them. */
function syncColumnGuideMenu(): void {
  const doc = store.doc
  window.api.syncColumnGuideVisibility(doc.showLeftColumn, doc.showRightColumn)
}

/** `structure` rebuilds the whole sidebar; otherwise only the current row repaints. */
function refresh(structure = false): void {
  const state = store.get()
  matrix.setGlyph(state.doc, store.glyph, store.referenceGlyph)
  if (structure) {
    glyphList.rebuild(state.doc, state.selected, state.reference)
    applyGuideVisibility()
    syncColumnGuideMenu()
  } else {
    if (state.selected !== null) glyphList.updateGlyph(state.doc, state.selected)
    glyphList.setSelected(state.selected)
    glyphList.setReference(state.reference)
  }
  renderPreview(state.doc, state.previewText)
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
    glyphInfo.textContent =
      `${formatCodepoint(selected)}  ${displayChar(doc.codepage[selected])}  ` +
      `· advance ${glyph.width}/${doc.width} px`
    const ghost = reference
    statusLine.textContent =
      'Drag to paint · drag the red marker for advance width ' +
      '(Shift = whole font, Ctrl+Shift = whole font relative) · drag the margin handles for guides · ' +
      (ghost === null || ghost === selected
        ? 'shift-click a glyph in the map to show it as a reference.'
        : `reference: ${formatCodepoint(ghost)} (shift-click it again to clear).`)
  }
  updateTitle()
}

function documentName(): string {
  const path = store.get().projectPath
  if (!path) return 'Untitled'
  return path.split(/[\\/]/).pop() ?? 'Untitled'
}

/** "Font Name (filename.fnt.json)" once the font has a name, otherwise just the filename. */
function windowCaption(): string {
  const name = store.doc.metadata.name.trim()
  const file = documentName()
  return name ? `${name} (${file})` : file
}

function updateTitle(): void {
  const dirty = store.get().dirty ? ' •' : ''
  window.api.setTitle(`${windowCaption()}${dirty} — Font Editor`)
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

/** Repaints every thumbnail's artwork without touching the sidebar's DOM structure. */
function refreshAllThumbnails(): void {
  const doc = store.doc
  for (const code of definedCodepoints(doc)) glyphList.updateGlyph(doc, code)
}

/** Edit ▸ Whole Font: applies a per-glyph transform to every defined glyph as one undo step. */
function editWholeFont(fn: (glyph: Glyph, doc: FontDoc) => void): void {
  const doc = store.doc
  if (definedCodepoints(doc).length === 0) return
  history.record(doc)
  for (const glyph of Object.values(doc.glyphs)) fn(glyph, doc)
  markDirty()
  matrix.setGlyph(doc, store.glyph, store.referenceGlyph)
  refreshAllThumbnails()
  renderPreview(doc, store.get().previewText)
  updateInfo()
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

/** Swaps the whole glyph (bitmap and advance width) between the selection and its pinned reference. */
function swapWithReference(): void {
  const state = store.get()
  const { selected, reference } = state
  if (selected === null || reference === null || selected === reference) return
  const a = state.doc.glyphs[selected]
  const b = state.doc.glyphs[reference]
  if (!a || !b) return
  editDoc((doc) => {
    doc.glyphs[selected] = b
    doc.glyphs[reference] = a
  })
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
  statusLine.textContent = `Copied glyph ${formatCodepoint(state.selected)} — select another codepoint and press Ctrl+V to paste.`
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
  // Stamped here, not through history — like the dirty flag, save bookkeeping
  // isn't something undo should be able to rewind.
  const now = new Date().toISOString()
  if (!state.doc.metadata.created) state.doc.metadata.created = now
  state.doc.metadata.modified = now

  const path = await window.api.saveProject(
    serializeProject(state.doc),
    state.projectPath,
    saveAs,
    state.doc.metadata.name
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

/** The New Font dialog's "load mapping from disk" button — reuses the existing mapping IPC/parser. */
async function loadMappingForNewFont(): Promise<LoadMappingResult | null> {
  const file = await window.api.importMapping()
  if (!file) return null
  try {
    return { path: file.path, codepage: parseMapping(file.text) }
  } catch (error) {
    await window.api.error('Could not read that mapping file.', (error as Error).message)
    return null
  }
}

async function newFont(): Promise<void> {
  if (!(await confirmDiscard())) return
  const doc = await showNewFontDialog(loadMappingForNewFont)
  if (!doc) return
  const state = store.get()
  state.doc = doc
  state.selected = definedCodepoints(doc)[0] ?? null
  state.reference = null
  state.projectPath = null
  history.clear()
  markDirty(false)
  refresh(true)
}

function loadProjectFile(file: FileResult): void {
  const doc = parseProject(file.text)
  const state = store.get()
  state.doc = doc
  state.selected = definedCodepoints(doc)[0] ?? null
  state.reference = null
  state.projectPath = file.path
  history.clear()
  markDirty(false)
  refresh(true)
}

async function openProject(): Promise<void> {
  if (!(await confirmDiscard())) return
  const file = await window.api.openProject()
  if (!file) return
  try {
    loadProjectFile(file)
  } catch (error) {
    await window.api.error('Could not open that font.', (error as Error).message)
  }
}

/** File ▸ Recent Files: reads a specific path directly, bypassing the picker. */
async function openRecentFile(path: string): Promise<void> {
  if (!(await confirmDiscard())) return
  const file = await window.api.openProjectPath(path)
  if (!file) return
  try {
    loadProjectFile(file)
  } catch (error) {
    await window.api.error('Could not open that font.', (error as Error).message)
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
    await window.api.error(INVALID_CODEPOINT_MESSAGE)
    return
  }
  if (store.doc.glyphs[code]) {
    selectCodepoint(code)
    return
  }
  editDoc((doc) => addCodepoint(doc, code))
  selectCodepoint(code)
}

/** Font ▸ Add Codepoint Before/After: a quick, dialog-free neighbour of the selection. */
function addAdjacentCodepoint(direction: 1 | -1): void {
  const selected = store.get().selected
  if (selected === null) return
  const target = selected + direction
  if (target < 0 || target > MAX_CODEPOINT) return
  if (!store.doc.glyphs[target]) {
    editDoc((doc) => addCodepoint(doc, target))
  }
  selectCodepoint(target)
}

async function removeCodepointCommand(): Promise<void> {
  const selected = store.get().selected
  if (selected === null) return
  const ok = await showConfirm(
    'Remove Codepoint',
    `Remove ${formatCodepoint(selected)} and its artwork from the font?`,
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

async function trimCodepointRangeCommand(): Promise<void> {
  const values = await showForm('Trim to Codepoint Range', [
    {
      name: 'min',
      label: 'Minimum codepoint',
      value: '0',
      hint: 'Decimal (32) or hex (0x20). Codepoints below this are discarded.'
    },
    {
      name: 'max',
      label: 'Maximum codepoint',
      value: String(MAX_CODEPOINT),
      hint: 'Decimal or hex (0xNN). Codepoints above this are discarded.'
    }
  ])
  if (!values) return
  const min = parseCodepoint(values['min'] ?? '')
  const max = parseCodepoint(values['max'] ?? '')
  if (min === null || max === null) {
    await window.api.error(INVALID_CODEPOINT_MESSAGE)
    return
  }
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const discarded = definedCodepoints(store.doc).filter((code) => code < lo || code > hi).length
  if (discarded === 0) return

  const ok = await showConfirm(
    'Trim to Codepoint Range',
    `Discard ${discarded} glyph${discarded === 1 ? '' : 's'} outside ${formatCodepoint(lo)} to ${formatCodepoint(hi)}?`,
    'Discard'
  )
  if (!ok) return

  editDoc((doc) => trimCodepointRange(doc, lo, hi))
  const remaining = definedCodepoints(store.doc)
  const state = store.get()
  if (state.selected !== null && !remaining.includes(state.selected)) {
    state.selected = remaining[0] ?? null
  }
  if (state.reference !== null && !remaining.includes(state.reference)) {
    state.reference = null
  }
  refresh(true)
}

async function renumberCodepointsCommand(): Promise<void> {
  const codes = definedCodepoints(store.doc)
  if (codes.length === 0) return
  const maxStart = MAX_CODEPOINT - (codes.length - 1)

  const values = await showForm('Renumber Codepoints', [
    {
      name: 'start',
      label: 'Starting codepoint',
      value: String(codes[0]),
      hint:
        `Decimal or hex (0xNN). ${codes.length} defined glyph${codes.length === 1 ? '' : 's'} ` +
        `will be renumbered in order, one codepoint apart, closing any gaps.`
    }
  ])
  if (!values) return
  const start = parseCodepoint(values['start'] ?? '')
  if (start === null) {
    await window.api.error(INVALID_CODEPOINT_MESSAGE)
    return
  }
  if (start > maxStart) {
    await window.api.error(
      `Renumbering ${codes.length} glyphs starting at ${formatCodepoint(start)} would run past the highest ` +
        `valid codepoint, ${formatCodepoint(MAX_CODEPOINT)}.`,
      `Choose a starting value of ${formatCodepoint(maxStart)} or lower.`
    )
    return
  }

  const oldToNew = new Map(codes.map((code, index) => [code, start + index]))
  const state = store.get()
  const newSelected = state.selected === null ? null : (oldToNew.get(state.selected) ?? null)
  const newReference = state.reference === null ? null : (oldToNew.get(state.reference) ?? null)

  editDoc((doc) => renumberCodepoints(doc, start))
  state.selected = newSelected
  state.reference = newReference
  refresh(true)
}

/** Also reachable by double-clicking a codepoint number in the character map, for any row — not just the selection. */
async function editMappingCommand(code?: number): Promise<void> {
  const target = code ?? store.get().selected
  if (target === null) return
  if (code !== undefined && code !== store.get().selected) selectCodepoint(code)
  const result = await showMappingDialog(`Mapping for ${formatCodepoint(target)}`, store.doc.codepage[target] ?? '')
  if (!result) return

  let char: string
  if (result.mode === 'code') {
    const text = result.code.trim()
    if (!text) {
      char = ''
    } else {
      const codePoint = parseUnicodeCodepoint(text)
      if (codePoint === null) {
        await window.api.error('That is not a valid Unicode codepoint — use decimal (8364) or hex (0x20AC).')
        return
      }
      char = String.fromCodePoint(codePoint)
    }
  } else {
    char = result.char.length > 0 ? [...result.char][0]! : ''
  }

  editDoc((doc) => {
    if (char) doc.codepage[target] = char
    else delete doc.codepage[target]
  })
}

async function populateCodepage(message: string, codepage: Record<number, string>): Promise<void> {
  const ok = await showConfirm('Populate Codepoints', message, 'Populate')
  if (!ok) return
  editDoc((doc) => populateFromCodepage(doc, codepage))
  if (store.get().selected === null) store.get().selected = definedCodepoints(store.doc)[0] ?? null
  refresh(true)
}

async function showFontPropertiesCommand(): Promise<void> {
  const doc = store.doc
  const edits = await showFontPropertiesDialog(doc)
  if (!edits) return
  const meta = doc.metadata
  if (
    edits.name === meta.name &&
    edits.author === meta.author &&
    edits.email === meta.email &&
    edits.description === meta.description
  ) {
    return
  }
  editDoc((target) => {
    target.metadata = { ...target.metadata, ...edits }
  }, false)
}

async function importRawFontCommand(): Promise<void> {
  const file = await window.api.importRawFont()
  if (!file) return

  const values = await showForm(
    'Import Raw Font Bitmap',
    [
      {
        name: 'startCode',
        label: 'Start codepoint',
        value: '32',
        hint: 'Decimal (32) or hex (0x20).'
      },
      {
        name: 'linesPerChar',
        label: 'Lines per character',
        value: '8',
        type: 'number',
        min: 1,
        max: MAX_FONT_HEIGHT
      },
      {
        name: 'bytesPerLine',
        label: 'Bytes per line',
        value: '1',
        type: 'number',
        min: 1,
        max: MAX_FONT_WIDTH / 8
      },
      {
        name: 'layout',
        label: 'Byte layout',
        value: 'row',
        type: 'select',
        options: [
          { value: 'row', label: 'Row-major (each byte spans 8px across one row)' },
          { value: 'column', label: 'Column-major (each 8px-wide band, top to bottom)' }
        ],
        hint: 'Only matters for fonts wider than 8px — an 8px font reads the same either way.'
      }
    ],
    {
      okLabel: 'Import',
      onChange: (values) => {
        const startCode = parseCodepoint(values['startCode'] ?? '') ?? 0
        const linesPerChar = Number(values['linesPerChar']) || 8
        const bytesPerLine = Number(values['bytesPerLine']) || 1
        const est = estimateImport(file.bytes.length, { startCode, linesPerChar, bytesPerLine })
        const parts = [
          `File is ${file.bytes.length} bytes → ${est.bytesPerChar} bytes/char → ${est.charCount} character(s).`
        ]
        if (est.remainderBytes > 0) {
          parts.push(`The last character is short by ${est.bytesPerChar - est.remainderBytes} byte(s) — padded with zeroes.`)
        }
        if (est.overflow > 0) {
          parts.push(`${est.overflow} character(s) past ${formatCodepoint(MAX_CODEPOINT)} will be dropped.`)
        }
        return parts.join(' ')
      }
    }
  )
  if (!values) return

  const options = {
    startCode: parseCodepoint(values['startCode'] ?? '') ?? 32,
    linesPerChar: clampLinesPerChar(Number(values['linesPerChar'])),
    bytesPerLine: clampBytesPerLine(Number(values['bytesPerLine'])),
    layout: values['layout'] === 'column' ? ('column' as const) : ('row' as const)
  }
  const result = importRawFont(file.bytes, options)
  if (result.glyphs.length === 0) {
    await window.api.error('Nothing to import.', 'That file produced no characters with these settings.')
    return
  }

  const doc = store.doc
  const resizing = result.width !== doc.width || result.height !== doc.height
  if (resizing && resizeLosesData(doc, result.width, result.height)) {
    const ok = await showConfirm(
      'Discard pixels?',
      `Importing at ${result.width} × ${result.height} will permanently remove pixels that fall outside the new cell.`,
      'Import'
    )
    if (!ok) return
  }

  editDoc((target) => {
    if (resizing) resizeFont(target, result.width, result.height)
    for (const { code, glyph } of result.glyphs) target.glyphs[code] = glyph
  })
  selectCodepoint(result.glyphs[0]!.code)

  const notes: string[] = [`Imported ${result.glyphs.length} glyph(s) from ${file.path.split(/[\\/]/).pop()}.`]
  if (result.paddedWithZeroes) notes.push('The last character was padded with zeroes.')
  if (result.droppedOverflow > 0) {
    notes.push(`${result.droppedOverflow} character(s) past ${formatCodepoint(MAX_CODEPOINT)} were dropped.`)
  }
  statusLine.textContent = notes.join(' ')
}

async function fillFromSystemFontCommand(): Promise<void> {
  const doc = store.doc
  const targets = definedCodepoints(doc).filter((code) => doc.codepage[code] !== undefined)
  if (targets.length === 0) {
    await window.api.error('Nothing to fill.', 'No defined codepoint has a character mapping to render from.')
    return
  }

  const values = await showForm(
    'Fill From System Font',
    [
      {
        name: 'family',
        label: 'Font family',
        value: '',
        hint: 'The exact installed family name, e.g. "Consolas" or "Segoe UI". Every defined, mapped codepoint is redrawn.'
      }
    ],
    { okLabel: 'Fill' }
  )
  const family = values?.['family']?.trim()
  if (!family) return

  if (!isFontAvailable(family)) {
    const proceed = await showConfirm(
      'Font not found',
      `"${family}" does not look like it's installed — Canvas may fall back to a default font instead. Continue anyway?`,
      'Continue'
    )
    if (!proceed) return
  }

  const ctx = createMeasureContext()
  const reference = measureFontMetrics(ctx, family, 100)
  const pixelSize = pickPixelSize(reference, 100, doc.height)
  const metrics = measureFontMetrics(ctx, family, pixelSize)
  const guides = computeGuides(metrics, doc.height)

  const perChar = targets.map((code) => {
    const char = doc.codepage[code]!
    const measured = measureChar(ctx, family, pixelSize, char)
    // "a single line space for the advance" — one pixel of gap past the ink/metric width.
    const advance = Math.max(0, Math.round(measured.advance) + 1)
    const needed = Math.max(advance, measured.inkRight + 1)
    return { code, char, advance, needed }
  })

  const originalWidth = doc.width
  const neededWidth = requiredWidth(
    perChar.map((c) => c.needed),
    originalWidth
  )
  let targetWidth = originalWidth
  if (neededWidth > originalWidth) {
    const widen = await showConfirm(
      'Widen the font?',
      `"${family}" needs up to ${neededWidth}px per glyph, wider than the current ${originalWidth}px cell. Widen the font to fit?`,
      'Widen'
    )
    if (!widen) return
    targetWidth = clampWidth(neededWidth)
  }

  editDoc((target) => {
    if (targetWidth !== target.width) resizeFont(target, targetWidth, target.height)
    target.baseline = guides.baseline
    target.capHeight = guides.capHeight
    target.xHeight = guides.xHeight
    for (const { code, char, advance } of perChar) {
      const bits = rasterizeChar(ctx, family, pixelSize, guides.baseline, target.width, target.height, char)
      target.glyphs[code] = { rows: bitsToRows(bits, target.width), width: Math.min(target.width, advance) }
    }
  })

  const widened = targetWidth !== originalWidth ? ` (widened to ${targetWidth}px)` : ''
  statusLine.textContent = `Filled ${perChar.length} glyph(s) from "${family}"${widened}.`
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
    case 'edit:swapReference':
      swapWithReference()
      break

    case 'edit:whole:clear':
      editWholeFont((glyph) => clearGlyph(glyph))
      break
    case 'edit:whole:invert':
      editWholeFont((glyph, doc) => invertGlyph(glyph, doc.width))
      break
    case 'edit:whole:flipH':
      editWholeFont((glyph, doc) => flipHorizontal(glyph, doc.width))
      break
    case 'edit:whole:flipV':
      editWholeFont((glyph) => flipVertical(glyph))
      break
    case 'edit:whole:shiftUp':
      editWholeFont((glyph, doc) => shiftGlyph(glyph, doc.width, 0, -1))
      break
    case 'edit:whole:shiftDown':
      editWholeFont((glyph, doc) => shiftGlyph(glyph, doc.width, 0, 1))
      break
    case 'edit:whole:shiftLeft':
      editWholeFont((glyph, doc) => shiftGlyph(glyph, doc.width, -1, 0))
      break
    case 'edit:whole:shiftRight':
      editWholeFont((glyph, doc) => shiftGlyph(glyph, doc.width, 1, 0))
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
    case 'font:addBefore':
      addAdjacentCodepoint(-1)
      break
    case 'font:addAfter':
      addAdjacentCodepoint(1)
      break
    case 'font:remove':
      await removeCodepointCommand()
      break
    case 'font:renumber':
      await renumberCodepointsCommand()
      break
    case 'font:trimRange':
      await trimCodepointRangeCommand()
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
    case 'font:properties':
      await showFontPropertiesCommand()
      break

    case 'helpers:cp437Sam':
      await populateCodepage(
        'Define all 256 CP437 codepoints (SAM Coupe variant: £ at 0x60, © at 0x7F). Existing artwork is kept.',
        buildCp437Sam()
      )
      break
    case 'helpers:cp437':
      await populateCodepage('Define all 256 stock CP437 codepoints. Existing artwork is kept.', buildCp437())
      break
    case 'helpers:asciiSam':
      await populateCodepage(
        'Define codepoints 32-127 with the SAM Coupe character set (£ at 0x60, © at 0x7F). Existing artwork is kept.',
        buildAsciiSam()
      )
      break
    case 'helpers:ascii':
      await populateCodepage(
        'Define codepoints 32-127 with standard ASCII. Existing artwork is kept.',
        buildAscii()
      )
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
    case 'helpers:importRawFont':
      await importRawFontCommand()
      break
    case 'helpers:fillSystemFont':
      await fillFromSystemFontCommand()
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
    case 'view:toggleLeftColumn':
      store.doc.showLeftColumn = !store.doc.showLeftColumn
      markDirty()
      applyGuideVisibility()
      syncColumnGuideMenu()
      break
    case 'view:toggleRightColumn':
      store.doc.showRightColumn = !store.doc.showRightColumn
      markDirty()
      applyGuideVisibility()
      syncColumnGuideMenu()
      break

    case 'help:about':
      await showMessage(
        'Font Editor',
        'Monochrome bitmap font editor for the SAM Coupé. Supports variable and fixed-width fonts, 1bpp output with separate width and codepoint-mapping sidecars.\n\nCopyright © 2026 Simon Cooke, released under MIT License. Developed by Simon Cooke, and Claude.'
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
window.api.onOpenRecent((path) => void openRecentFile(path))

// Main owns the horizontal-guide and preview-inversion preferences and pushes
// them whenever a tick changes; column-guide visibility is folded in from the
// current doc rather than coming from this message at all.
window.api.onViewState((view) => {
  horizontalGuideVisibility = view.guides
  applyGuideVisibility()
  preview.setInverted(view.previewInverted)
})

previewInput.value = store.get().previewText
previewInput.addEventListener('input', () => {
  store.get().previewText = previewInput.value
  renderPreview(store.doc, previewInput.value)
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
      // Matches the clamp in the stylesheet, so the drag stops where the
      // rendered sidebar stops rather than a little past it.
      const max = Math.max(MIN, window.innerWidth * 0.6)
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
