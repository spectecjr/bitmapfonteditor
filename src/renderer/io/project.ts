import type { FontDoc, Glyph } from '@shared/types'
import { MAX_FONT_HEIGHT, MAX_FONT_WIDTH } from '@shared/types'
import {
  bytesPerLine,
  defaultBaseline,
  defaultCapHeight,
  defaultLeftColumn,
  defaultRightColumn,
  defaultXHeight
} from '../model/font'
import { widthMask } from '../model/glyph'

/**
 * The editable project format (`.fnt.json`).
 *
 * Lossless by design: rows are stored at full cell width, so pixels sitting to
 * the right of a glyph's advance marker survive a save/load round trip. Only
 * the export path applies the width mask.
 */
export interface ProjectGlyph {
  code: number
  width: number
  rows: string[]
}

export interface ProjectFile {
  version: 1
  width: number
  height: number
  baseline: number
  xHeight: number
  capHeight: number
  leftColumn: number
  rightColumn: number
  glyphs: ProjectGlyph[]
  codepage: Record<string, string>
}

function toHex(row: number, digits: number): string {
  return (row >>> 0).toString(16).toUpperCase().padStart(digits, '0')
}

export function serializeProject(doc: FontDoc): string {
  const digits = bytesPerLine(doc.width) * 2
  const glyphs: ProjectGlyph[] = Object.keys(doc.glyphs)
    .map(Number)
    .sort((a, b) => a - b)
    .map((code) => {
      const glyph = doc.glyphs[code]!
      return {
        code,
        width: glyph.width,
        rows: glyph.rows.map((row) => toHex(row, digits))
      }
    })

  const codepage: Record<string, string> = {}
  for (const [code, char] of Object.entries(doc.codepage)) codepage[code] = char

  const file: ProjectFile = {
    version: 1,
    width: doc.width,
    height: doc.height,
    baseline: doc.baseline,
    xHeight: doc.xHeight,
    capHeight: doc.capHeight,
    leftColumn: doc.leftColumn,
    rightColumn: doc.rightColumn,
    glyphs,
    codepage
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

class ProjectError extends Error {}

function fail(message: string): never {
  throw new ProjectError(message)
}

function readInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max} (got ${JSON.stringify(value)})`)
  }
  return value
}

export function parseProject(text: string): FontDoc {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    fail(`not valid JSON: ${(error as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null) fail('expected a JSON object at the top level')

  const file = raw as Partial<ProjectFile>
  if (file.version !== 1) fail(`unsupported project version ${String(file.version)}`)

  const width = readInt(file.width, 'width', 1, MAX_FONT_WIDTH)
  const height = readInt(file.height, 'height', 1, MAX_FONT_HEIGHT)
  if (!Array.isArray(file.glyphs)) fail('glyphs must be an array')

  // Guides were added after the first projects were written, so each is optional
  // and falls back to the default for the cell.
  const guide = (
    value: number | undefined,
    name: string,
    extent: number,
    fallback: number
  ): number => (value === undefined ? fallback : readInt(value, name, 0, extent))

  const baseline = guide(file.baseline, 'baseline', height, defaultBaseline(height))
  const xHeight = guide(file.xHeight, 'xHeight', height, defaultXHeight(height))
  const capHeight = guide(file.capHeight, 'capHeight', height, defaultCapHeight(height))
  const leftColumn = guide(file.leftColumn, 'leftColumn', width, defaultLeftColumn(width))
  const rightColumn = guide(file.rightColumn, 'rightColumn', width, defaultRightColumn(width))

  const mask = widthMask(width)
  const glyphs: Record<number, Glyph> = {}
  for (const entry of file.glyphs) {
    const code = readInt(entry?.code, 'glyph code', 0, 255)
    const glyphWidth = readInt(entry?.width, `glyph ${code} width`, 0, width)
    if (!Array.isArray(entry?.rows)) fail(`glyph ${code} is missing its rows array`)
    if (entry.rows.length !== height) {
      fail(`glyph ${code} has ${entry.rows.length} rows, expected ${height}`)
    }
    const rows = entry.rows.map((row, y) => {
      if (typeof row !== 'string' || !/^[0-9a-fA-F]+$/.test(row)) {
        fail(`glyph ${code} row ${y} is not a hex string`)
      }
      return (Number.parseInt(row, 16) & mask) >>> 0
    })
    glyphs[code] = { rows, width: glyphWidth }
  }

  const codepage: Record<number, string> = {}
  if (file.codepage) {
    if (typeof file.codepage !== 'object') fail('codepage must be an object')
    for (const [key, char] of Object.entries(file.codepage)) {
      const code = Number(key)
      if (!Number.isInteger(code) || code < 0 || code > 255) {
        fail(`codepage key ${key} is not a codepoint in 0..255`)
      }
      if (typeof char !== 'string') fail(`codepage entry ${key} must be a string`)
      codepage[code] = char
    }
  }

  return {
    version: 1,
    width,
    height,
    baseline,
    xHeight,
    capHeight,
    leftColumn,
    rightColumn,
    glyphs,
    codepage
  }
}
