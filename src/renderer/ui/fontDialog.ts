import { MAX_BYTES_PER_LINE, MAX_FONT_HEIGHT, type FontDoc } from '@shared/types'
import { buildCp437Sam } from '../model/codepage'
import { bytesPerLine, buildFont, definedCodepoints, isFixedWidth } from '../model/font'
import { exportBitmap } from '../io/export'
import { showForm } from './dialogs'

export interface LoadMappingResult {
  path: string
  codepage: Record<number, string>
}

function hex2(code: number): string {
  return code.toString(16).toUpperCase().padStart(2, '0')
}

/**
 * File ▸ New Font. Everything here is a creation-time convenience: only the
 * metadata fields (name/author/email/description) survive onto the built
 * FontDoc as durable state. Width, height and the codepoint range are
 * "configurable elsewhere" afterward — Font ▸ Dimensions and Add/Remove
 * Codepoint — so nothing here is re-shown as editable once the font exists.
 * There is no fixed/variable-width choice either: every glyph created here
 * starts at the full cell width, which already reads as fixed-width until you
 * narrow one, and Font Properties reports the true state from the glyphs
 * themselves rather than a declaration made before any of them existed.
 */
export async function showNewFontDialog(
  loadMapping: () => Promise<LoadMappingResult | null>
): Promise<FontDoc | null> {
  let loadedCodepage: Record<number, string> | undefined
  let mappingLabel = 'Default: CP437 (SAM Coupe)'

  const describeRange = (values: Record<string, string>): string => {
    const bytesWide = Math.min(MAX_BYTES_PER_LINE, Math.max(1, Math.round(Number(values['bytesPerLine']) || 1)))
    const height = Math.min(MAX_FONT_HEIGHT, Math.max(1, Math.round(Number(values['heightLines']) || 1)))
    const a = Math.min(255, Math.max(0, Math.round(Number(values['firstCodepoint']) || 0)))
    const b = Math.min(255, Math.max(0, Math.round(Number(values['lastCodepoint']) || 0)))
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return (
      `Cell: ${bytesWide * 8} × ${height} px (${bytesWide} byte${bytesWide === 1 ? '' : 's'}/line). ` +
      `Codepoints 0x${hex2(lo)}–0x${hex2(hi)} = ${hi - lo + 1} characters.`
    )
  }

  const values = await showForm(
    'New Font',
    [
      {
        name: 'name',
        label: 'Font name',
        value: '',
        hint: 'Optional — can differ from the filename.'
      },
      { name: 'author', label: 'Author', value: '' },
      { name: 'email', label: 'Email', value: '' },
      { name: 'description', label: 'Description', value: '', type: 'textarea', rows: 5 },
      {
        name: 'bytesPerLine',
        label: 'Cell width (bytes/line)',
        value: '1',
        type: 'number',
        min: 1,
        max: MAX_BYTES_PER_LINE,
        hint: `1–${MAX_BYTES_PER_LINE}; 1 byte = up to 8px wide.`
      },
      {
        name: 'heightLines',
        label: 'Cell height (lines)',
        value: '8',
        type: 'number',
        min: 1,
        max: MAX_FONT_HEIGHT
      },
      { name: 'firstCodepoint', label: 'First codepoint', value: '32', type: 'number', min: 0, max: 255 },
      { name: 'lastCodepoint', label: 'Last codepoint', value: '127', type: 'number', min: 0, max: 255 },
      {
        name: 'mapping',
        label: 'Codepoint mapping',
        value: '',
        type: 'action',
        buttonLabel: 'Load Mapping From Disk…',
        hint: mappingLabel,
        onAction: async () => {
          const result = await loadMapping()
          if (!result) return null
          loadedCodepage = result.codepage
          const fileName = result.path.split(/[\\/]/).pop() ?? result.path
          mappingLabel = `Loaded ${fileName} (${Object.keys(result.codepage).length} entries)`
          return mappingLabel
        }
      }
    ],
    { okLabel: 'Create', onChange: describeRange }
  )
  if (!values) return null

  const bytesWide = Math.min(MAX_BYTES_PER_LINE, Math.max(1, Math.round(Number(values['bytesPerLine']))))
  const height = Math.min(MAX_FONT_HEIGHT, Math.max(1, Math.round(Number(values['heightLines']))))

  return buildFont({
    width: bytesWide * 8,
    height,
    firstCodepoint: Math.round(Number(values['firstCodepoint'])),
    lastCodepoint: Math.round(Number(values['lastCodepoint'])),
    codepage: loadedCodepage ?? buildCp437Sam(),
    metadata: {
      name: values['name'] ?? '',
      author: values['author'] ?? '',
      email: values['email'] ?? '',
      description: values['description'] ?? ''
    }
  })
}

export interface FontPropertiesEdits {
  name: string
  author: string
  email: string
  description: string
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet saved'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Font ▸ Font Properties…. Same metadata fields as New Font, still editable —
 * there is nowhere else to change them. Everything else is read-only: it is
 * either set via other menus (Dimensions, Guidelines, Add/Remove Codepoint) or,
 * for the projected export size, purely derived from the current glyph set.
 */
export async function showFontPropertiesDialog(doc: FontDoc): Promise<FontPropertiesEdits | null> {
  const codes = definedCodepoints(doc)
  const bpl = bytesPerLine(doc.width)
  // Exact by construction — the same function File ▸ Export Font… uses to write the .bin.
  const projectedBytes = exportBitmap(doc).length
  const range = codes.length === 0 ? 'none' : `0x${hex2(codes[0]!)}–0x${hex2(codes[codes.length - 1]!)}`

  const values = await showForm(
    'Font Properties',
    [
      { name: 'name', label: 'Font name', value: doc.metadata.name },
      { name: 'author', label: 'Author', value: doc.metadata.author },
      { name: 'email', label: 'Email', value: doc.metadata.email },
      { name: 'description', label: 'Description', value: doc.metadata.description, type: 'textarea', rows: 6 },
      {
        name: 'fixedWidth',
        label: 'Fixed width',
        value: isFixedWidth(doc) ? 'Yes' : 'No',
        type: 'static',
        hint: 'Derived from the glyphs: Yes only while every one is at the full cell width.'
      },
      {
        name: 'cellSize',
        label: 'Cell size',
        value: `${doc.width} × ${doc.height} px (${bpl} byte${bpl === 1 ? '' : 's'}/line)`,
        type: 'static'
      },
      {
        name: 'codepoints',
        label: 'Codepoints defined',
        value: `${codes.length} (${range})`,
        type: 'static'
      },
      {
        name: 'created',
        label: 'Created',
        value: formatDate(doc.metadata.created),
        type: 'static',
        hint: 'Set on the first File ▸ Save Font — not by clicking Apply here.'
      },
      {
        name: 'modified',
        label: 'Last modified',
        value: formatDate(doc.metadata.modified),
        type: 'static',
        hint: 'Updated on every save after that.'
      },
      {
        name: 'projected',
        label: 'Projected export size',
        value: `${projectedBytes} byte${projectedBytes === 1 ? '' : 's'}`,
        type: 'static'
      }
    ],
    { okLabel: 'Apply' }
  )
  if (!values) return null

  return {
    name: values['name'] ?? '',
    author: values['author'] ?? '',
    email: values['email'] ?? '',
    description: values['description'] ?? ''
  }
}
