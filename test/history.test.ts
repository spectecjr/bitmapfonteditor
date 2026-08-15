import { describe, expect, it } from 'vitest'
import { History, sameFont } from '../src/renderer/state/history'
import { addCodepoint, createFont } from '../src/renderer/model/font'
import { setBit } from '../src/renderer/model/glyph'

function docWithA() {
  const doc = createFont(8, 8, { 65: 'A' })
  addCodepoint(doc, 65)
  return doc
}

describe('History', () => {
  it('restores the previous document and replays it on redo', () => {
    const history = new History()
    let doc = docWithA()

    history.record(doc)
    setBit(doc.glyphs[65]!, 8, 0, 0, true)
    expect(history.canUndo).toBe(true)

    doc = history.undo(doc)!
    expect(doc.glyphs[65]!.rows[0]).toBe(0)
    expect(history.canRedo).toBe(true)

    doc = history.redo(doc)!
    expect(doc.glyphs[65]!.rows[0]).toBe(0x80)
  })

  it('collapses a drag into one entry and drops strokes that changed nothing', () => {
    const history = new History()
    const doc = docWithA()

    history.begin(doc)
    setBit(doc.glyphs[65]!, 8, 0, 0, true)
    setBit(doc.glyphs[65]!, 8, 1, 0, true)
    expect(history.commit(doc)).toBe(true)

    history.begin(doc)
    expect(history.commit(doc)).toBe(false)

    // Only the one real stroke is on the stack.
    const undone = history.undo(doc)!
    expect(undone.glyphs[65]!.rows[0]).toBe(0)
    expect(history.canUndo).toBe(false)
  })

  it('clears the redo stack once a new change lands', () => {
    const history = new History()
    let doc = docWithA()

    history.record(doc)
    setBit(doc.glyphs[65]!, 8, 0, 0, true)
    doc = history.undo(doc)!
    expect(history.canRedo).toBe(true)

    history.record(doc)
    expect(history.canRedo).toBe(false)
  })

  it('honours the snapshot limit', () => {
    const history = new History(3)
    const doc = docWithA()
    for (let i = 0; i < 10; i++) {
      history.record(doc)
      setBit(doc.glyphs[65]!, 8, i % 8, 0, true)
    }
    let depth = 0
    let current = doc
    while (history.canUndo) {
      current = history.undo(current)!
      depth++
    }
    expect(depth).toBe(3)
  })
})

describe('sameFont', () => {
  it('detects geometry, pixel, width and mapping differences', () => {
    const a = docWithA()
    const b = docWithA()
    expect(sameFont(a, b)).toBe(true)

    setBit(b.glyphs[65]!, 8, 0, 0, true)
    expect(sameFont(a, b)).toBe(false)

    const c = docWithA()
    c.glyphs[65]!.width = 4
    expect(sameFont(a, c)).toBe(false)

    const d = docWithA()
    d.height = 6
    expect(sameFont(a, d)).toBe(false)

    // Guide drags must be undoable, so they have to register as a change.
    const guides = docWithA()
    guides.baseline -= 1
    expect(sameFont(a, guides)).toBe(false)

    const xh = docWithA()
    xh.xHeight += 1
    expect(sameFont(a, xh)).toBe(false)

    const cap = docWithA()
    cap.capHeight += 1
    expect(sameFont(a, cap)).toBe(false)

    const columns = docWithA()
    columns.rightColumn -= 1
    expect(sameFont(a, columns)).toBe(false)

    const e = docWithA()
    e.codepage[65] = 'B'
    expect(sameFont(a, e)).toBe(false)

    const f = docWithA()
    addCodepoint(f, 66)
    expect(sameFont(a, f)).toBe(false)
  })
})
