#!/usr/bin/env node
/**
 * Draws the app icon — a capital A on an 8x8 pixel grid with an advance-width
 * marker, in the editor's own palette. Placeholder artwork, but it is at least
 * about bitmap fonts rather than Electron's default logo.
 *
 * Regenerate after editing:
 *
 *   node scripts/make-icon.mjs            # writes assets/icon.png
 *   node scripts/make-icon.mjs out.png    # somewhere else
 *
 * Writes a PNG by hand rather than pulling in an image library: the whole thing
 * is axis-aligned rectangles, so there is nothing to rasterise.
 */
import { deflateSync } from 'node:zlib'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const SIZE = 512
const GRID = 8
const CELL = 52
const PAD = (SIZE - GRID * CELL) / 2

// Straight from src/renderer/styles.css.
const BG = [0x1b, 0x1c, 0x1f]
const LINE = [0x2c, 0x2f, 0x36]
const INK = [0xdf, 0xe1, 0xe6]
const ACCENT = [0xe0, 0x53, 0x3d]

/** The glyph, as the editor would store it: one string per row, X is ink. */
const GLYPH = [
  '.XXX...',
  'X...X..',
  'X...X..',
  'XXXXX..',
  'X...X..',
  'X...X..',
  'X...X..',
  '.......'
]
/** Where the advance-width marker sits, as a column boundary in 0..GRID. */
const ADVANCE = 6

const pixels = new Uint8Array(SIZE * SIZE * 4)

function set(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}

function fillRect(x0, y0, w, h, color, alpha = 255) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) set(x, y, color, alpha)
  }
}

// Rounded-rect ground, so the icon reads as an app tile rather than a sticker.
const RADIUS = 76
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const dx = Math.max(RADIUS - x, x - (SIZE - 1 - RADIUS), 0)
    const dy = Math.max(RADIUS - y, y - (SIZE - 1 - RADIUS), 0)
    const d = Math.hypot(dx, dy)
    if (d <= RADIUS) set(x, y, BG, 255)
    else if (d <= RADIUS + 1) set(x, y, BG, Math.round(255 * (RADIUS + 1 - d)))
  }
}

// Cell grid.
for (let i = 0; i <= GRID; i += 1) {
  fillRect(PAD + i * CELL - 1, PAD, 2, GRID * CELL, LINE)
  fillRect(PAD, PAD + i * CELL - 1, GRID * CELL, 2, LINE)
}

// The glyph's filled cells, inset by the grid line so the pixels read separately.
GLYPH.forEach((row, y) => {
  for (let x = 0; x < GRID; x += 1) {
    if (row[x] !== 'X') continue
    fillRect(PAD + x * CELL + 2, PAD + y * CELL + 2, CELL - 3, CELL - 3, INK)
  }
})

// Advance-width marker: the one thing on screen that is always this colour.
fillRect(PAD + ADVANCE * CELL - 3, PAD - 10, 6, GRID * CELL + 20, ACCENT)

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // truecolour with alpha
ihdr[10] = 0 // deflate
ihdr[11] = 0 // adaptive filtering
ihdr[12] = 0 // no interlace

// One filter byte per scanline, filter type 0 (none).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y += 1) {
  const at = y * (SIZE * 4 + 1)
  raw[at] = 0
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, at + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const target = resolve(process.argv[2] ?? 'assets/icon.png')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, png)
console.log(`wrote ${target} — ${SIZE}x${SIZE}, ${png.length} bytes`)
