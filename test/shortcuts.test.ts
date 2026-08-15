import { describe, expect, it } from 'vitest'
import { shortcutFor, type ShortcutEvent } from '../src/renderer/state/shortcuts'

function press(key: string, modifiers: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers }
}

describe('shortcutFor', () => {
  it('claims the glyph clipboard and history keys', () => {
    expect(shortcutFor(press('c', { ctrlKey: true }))).toBe('edit:copy')
    expect(shortcutFor(press('v', { ctrlKey: true }))).toBe('edit:paste')
    expect(shortcutFor(press('z', { ctrlKey: true }))).toBe('edit:undo')
    expect(shortcutFor(press('y', { ctrlKey: true }))).toBe('edit:redo')
    expect(shortcutFor(press('Delete', { ctrlKey: true }))).toBe('edit:clear')
  })

  it('treats Ctrl+Shift+Z as redo', () => {
    expect(shortcutFor(press('z', { ctrlKey: true, shiftKey: true }))).toBe('edit:redo')
  })

  it('accepts either Ctrl or Cmd, and uppercase keys from a held shift', () => {
    expect(shortcutFor(press('c', { metaKey: true }))).toBe('edit:copy')
    expect(shortcutFor(press('C', { ctrlKey: true }))).toBe('edit:copy')
  })

  it('ignores unmodified keys, so typing never triggers a glyph command', () => {
    expect(shortcutFor(press('c'))).toBeNull()
    expect(shortcutFor(press('v'))).toBeNull()
    expect(shortcutFor(press('Delete'))).toBeNull()
  })

  it('ignores Alt combinations, which belong to the registered shift accelerators', () => {
    expect(shortcutFor(press('c', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(shortcutFor(press('ArrowUp', { altKey: true }))).toBeNull()
  })

  it('leaves keys the app does not claim alone', () => {
    // Ctrl+S and friends stay on registered menu accelerators.
    expect(shortcutFor(press('s', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(press('x', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(press('a', { ctrlKey: true }))).toBeNull()
  })
})
