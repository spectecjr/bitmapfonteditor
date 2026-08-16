/**
 * Turning a font's display name into a suggested filename for its first save.
 * Kept separate from ipc.ts because it's pure — no Electron, no filesystem —
 * and worth testing directly against real platform rules rather than only
 * through a live save dialog.
 */

/** Reserved device names on Windows, case-insensitive, with or without an extension. */
const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

/** Generous, but stops a pathological font name from becoming an unusable path component. */
const MAX_LENGTH = 150

/**
 * A filesystem-safe base name (no extension) derived from a font's display
 * name — suggested only for the very first save, before there is a real
 * filename to prefer instead. Falls back to "untitled" if nothing usable
 * survives sanitising.
 */
export function suggestFileName(name: string, platform: NodeJS.Platform = process.platform): string {
  let candidate = name.trim()

  // The path separator and NUL are invalid on every platform this app runs on.
  candidate = candidate.replace(/[/\0]/g, '_')

  if (platform === 'win32') {
    candidate = candidate.replace(/[<>:"\\|?*\x00-\x1f]/g, '_')
    candidate = candidate.replace(/[. ]+$/, '') // trailing dots/spaces are rejected
    if (WINDOWS_RESERVED.has(candidate.toUpperCase())) candidate += '_'
  }

  candidate = candidate.trim().slice(0, MAX_LENGTH)
  return candidate || 'untitled'
}
