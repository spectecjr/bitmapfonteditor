import type { FontDoc } from '@shared/types'
import { cloneFont } from '../model/font'

/**
 * Whole-document snapshots. A glyph is at most 32 rows, so even 256 of them
 * clone in well under a millisecond — not worth the complexity of patches.
 *
 * Drag strokes use begin/commit so an entire stroke lands as one undo step, and
 * a stroke that changed nothing is dropped rather than polluting the stack.
 */
export class History {
  private past: FontDoc[] = []
  private future: FontDoc[] = []
  private pending: FontDoc | null = null

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  clear(): void {
    this.past = []
    this.future = []
    this.pending = null
  }

  /** Call immediately before a discrete change. */
  record(doc: FontDoc): void {
    this.past.push(cloneFont(doc))
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  /** Call at the start of a drag; pair with `commit`. */
  begin(doc: FontDoc): void {
    this.pending = cloneFont(doc)
  }

  /** Call at the end of a drag. Returns true if anything actually changed. */
  commit(doc: FontDoc): boolean {
    const before = this.pending
    this.pending = null
    if (!before || sameFont(before, doc)) return false
    this.past.push(before)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    return true
  }

  undo(current: FontDoc): FontDoc | null {
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(cloneFont(current))
    return previous
  }

  redo(current: FontDoc): FontDoc | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(cloneFont(current))
    return next
  }
}

export function sameFont(a: FontDoc, b: FontDoc): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  if (a.baseline !== b.baseline || a.xHeight !== b.xHeight) return false
  if (a.capHeight !== b.capHeight) return false
  if (a.leftColumn !== b.leftColumn || a.rightColumn !== b.rightColumn) return false

  const aCodes = Object.keys(a.glyphs)
  const bCodes = Object.keys(b.glyphs)
  if (aCodes.length !== bCodes.length) return false
  for (const code of aCodes) {
    const left = a.glyphs[Number(code)]
    const right = b.glyphs[Number(code)]
    if (!right || !left) return false
    if (left.width !== right.width || left.rows.length !== right.rows.length) return false
    for (let y = 0; y < left.rows.length; y++) {
      if (left.rows[y] !== right.rows[y]) return false
    }
  }

  const aChars = Object.keys(a.codepage)
  const bChars = Object.keys(b.codepage)
  if (aChars.length !== bChars.length) return false
  for (const code of aChars) {
    if (a.codepage[Number(code)] !== b.codepage[Number(code)]) return false
  }
  return true
}
