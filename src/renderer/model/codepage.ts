/**
 * CP437 and the SAM Coupe variant of it.
 *
 * Per design/project.md the SAM Coupe set is CP437 with two substitutions:
 * backtick (0x60) becomes a pound sign, and 0x7F becomes a copyright sign.
 * The mapping is display-only metadata — it never appears in the bitmap output.
 */

/** 0x00-0x1F: the CP437 pictographs rather than the C0 control meanings. */
const LOW: readonly number[] = [
  0x0000, 0x263a, 0x263b, 0x2665, 0x2666, 0x2663, 0x2660, 0x2022,
  0x25d8, 0x25cb, 0x25d9, 0x2642, 0x2640, 0x266a, 0x266b, 0x263c,
  0x25ba, 0x25c4, 0x2195, 0x203c, 0x00b6, 0x00a7, 0x25ac, 0x21a8,
  0x2191, 0x2193, 0x2192, 0x2190, 0x221f, 0x2194, 0x25b2, 0x25bc
]

/** 0x80-0xFF: accented Latin, box drawing, blocks, Greek and maths. */
const HIGH: readonly number[] = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192,
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b,
  0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4,
  0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248,
  0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0
]

/** The SAM Coupe departures from stock CP437. */
export const SAM_OVERRIDES: Readonly<Record<number, string>> = {
  0x60: '£', // £ replaces the backtick
  0x7f: '©' // © replaces the house glyph
}

export function buildCp437(): Record<number, string> {
  const map: Record<number, string> = {}
  for (let code = 0; code < 0x20; code++) map[code] = String.fromCodePoint(LOW[code]!)
  for (let code = 0x20; code < 0x7f; code++) map[code] = String.fromCodePoint(code)
  map[0x7f] = '⌂' // ⌂
  for (let code = 0x80; code < 0x100; code++) {
    map[code] = String.fromCodePoint(HIGH[code - 0x80]!)
  }
  return map
}

export function buildCp437Sam(): Record<number, string> {
  return { ...buildCp437(), ...SAM_OVERRIDES }
}

/** Plain 7-bit ASCII, codepoints 0x20-0x7F only — 0x7F is the literal DEL character. */
export function buildAscii(): Record<number, string> {
  const map: Record<number, string> = {}
  for (let code = 0x20; code <= 0x7f; code++) map[code] = String.fromCodePoint(code)
  return map
}

/** The SAM Coupe CP437 variant, restricted to codepoints 0x20-0x7F (£ at 0x60, © at 0x7F). */
export function buildAsciiSam(): Record<number, string> {
  const sam = buildCp437Sam()
  const map: Record<number, string> = {}
  for (let code = 0x20; code <= 0x7f; code++) map[code] = sam[code]!
  return map
}

/** char -> codepoint, for turning preview text into glyph indices. First match wins. */
export function reverseCodepage(codepage: Record<number, string>): Map<string, number> {
  const reverse = new Map<string, number>()
  for (const [code, char] of Object.entries(codepage)) {
    if (!reverse.has(char)) reverse.set(char, Number(code))
  }
  return reverse
}

/** "32 (0x20)" — decimal first, hex in parens, the display convention used everywhere a codepoint is shown. */
export function formatCodepoint(code: number): string {
  return `${code} (0x${code.toString(16).toUpperCase().padStart(2, '0')})`
}

/** Human-readable stand-in for characters that would render as blank or a control code. */
export function displayChar(char: string | undefined): string {
  if (!char) return ''
  const cp = char.codePointAt(0) ?? 0
  if (cp === 0x00) return '␀' // ␀
  if (cp < 0x20) return '□' // □ — CP437 pictograph the system font may not have
  if (cp === 0x20) return '␣' // ␣
  if (cp === 0xa0) return '␣'
  if (cp === 0x7f) return '␡' // ␡ — DEL, from plain ASCII rather than a CP437 pictograph
  return char
}
