#!/usr/bin/env node
/**
 * Prints an exported font as ASCII art, straight from the .bin and its widths
 * sidecar. Deliberately standalone — it shares no code with the editor, so it
 * independently proves the bit packing is what the format claims.
 *
 *   node scripts/decode-font.mjs font.bin font.widths.json
 *   node scripts/decode-font.mjs font.bin font.widths.json --code 0x41
 */
import { readFile } from 'node:fs/promises'

const [, , binPath, widthsPath, ...rest] = process.argv

if (!binPath || !widthsPath) {
  console.error('usage: decode-font.mjs <font.bin> <font.widths.json> [--code <codepoint>]')
  process.exit(1)
}

let only = null
const codeIndex = rest.indexOf('--code')
if (codeIndex !== -1) {
  const value = rest[codeIndex + 1] ?? ''
  only = value.startsWith('0x') ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value, 10)
}

const bin = new Uint8Array(await readFile(binPath))
const meta = JSON.parse(await readFile(widthsPath, 'utf8'))
const { width, height, bytesPerLine, codepoints, widths } = meta
const { baseline, xHeight, capHeight, leftColumn, rightColumn } = meta
const stride = bytesPerLine * height

const expected = stride * codepoints.length
if (bin.length !== expected) {
  console.error(`size mismatch: ${binPath} is ${bin.length} bytes, sidecar implies ${expected}`)
  process.exit(2)
}

console.log(
  `${codepoints.length} glyphs, ${width}x${height}px, ${bytesPerLine} byte(s)/line` +
    (baseline === undefined
      ? ''
      : `, cap ${capHeight}, x-height ${xHeight}, baseline ${baseline}` +
        `, columns ${leftColumn}-${rightColumn}`) +
    '\n'
)

/** Horizontal guides sit on row boundaries, so they print as a rule between rows. */
function guideRule(y) {
  const names = []
  if (y === capHeight) names.push('cap height')
  if (y === xHeight) names.push('x-height')
  if (y === baseline) names.push('baseline')
  if (names.length === 0) return null
  return `  ${'-'.repeat(width + 1)}  ${names.join(' + ')}`
}

codepoints.forEach((code, index) => {
  if (only !== null && code !== only) return
  const advance = widths[index]
  const offset = index * stride
  const hex = code.toString(16).toUpperCase().padStart(2, '0')
  console.log(`0x${hex} (${code})  advance ${advance}/${width}`)

  for (let y = 0; y < height; y++) {
    const rule = guideRule(y)
    if (rule) console.log(rule)

    let line = ''
    for (let x = 0; x < width; x++) {
      // Bit 7 of the first byte is the leftmost pixel.
      const byte = bin[offset + y * bytesPerLine + (x >> 3)] ?? 0
      const on = (byte & (0x80 >>> (x & 7))) !== 0
      // A bar marks where the advance width falls.
      if (x === advance) line += '|'
      line += on ? '#' : '.'
    }
    if (advance >= width) line += '|'
    console.log(`  ${line}`)
  }
  const bottomRule = guideRule(height)
  if (bottomRule) console.log(bottomRule)
  console.log('')
})
