import { describe, expect, it } from 'vitest'
import { suggestFileName } from '../src/main/fileNaming'

describe('suggestFileName', () => {
  it('passes an already-safe name straight through', () => {
    expect(suggestFileName('SAM Basic 8x8', 'win32')).toBe('SAM Basic 8x8')
  })

  it('falls back to "untitled" for an empty or whitespace-only name', () => {
    expect(suggestFileName('', 'win32')).toBe('untitled')
    expect(suggestFileName('   ', 'linux')).toBe('untitled')
  })

  it('replaces the path separator and NUL on every platform', () => {
    expect(suggestFileName('a/b', 'linux')).toBe('a_b')
    expect(suggestFileName('a\0b', 'darwin')).toBe('a_b')
  })

  describe('on Windows', () => {
    it('replaces every reserved character', () => {
      expect(suggestFileName('My:Font*Name?"<>|\\', 'win32')).toBe('My_Font_Name______')
    })

    it('strips trailing dots and spaces', () => {
      expect(suggestFileName('Trailing... ', 'win32')).toBe('Trailing')
    })

    it('suffixes a reserved device name', () => {
      expect(suggestFileName('CON', 'win32')).toBe('CON_')
      expect(suggestFileName('con', 'win32')).toBe('con_')
      expect(suggestFileName('LPT1', 'win32')).toBe('LPT1_')
    })

    it('does not flag a name that only starts with a reserved word', () => {
      expect(suggestFileName('CONcorde', 'win32')).toBe('CONcorde')
    })
  })

  describe('off Windows', () => {
    it('leaves characters that are only reserved on Windows untouched', () => {
      expect(suggestFileName('My:Font*Name?', 'linux')).toBe('My:Font*Name?')
      expect(suggestFileName('My:Font*Name?', 'darwin')).toBe('My:Font*Name?')
    })

    it('does not touch trailing dots or spaces', () => {
      expect(suggestFileName('Trailing. ', 'linux')).toBe('Trailing.')
    })
  })

  it('truncates a pathologically long name', () => {
    const long = 'x'.repeat(500)
    const result = suggestFileName(long, 'win32')
    expect(result.length).toBe(150)
  })
})
