/** The subset of KeyboardEvent this needs — a real event satisfies it structurally. */
export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * Editing keys the Edit menu displays but deliberately does not register.
 *
 * Chromium handles Ctrl+C/V/Z/Y and Delete itself before an Electron menu
 * accelerator would see them, so registering those accelerators silently does
 * nothing. The menu shows them for discoverability and the renderer matches them
 * here, where it can tell whether a text field has focus.
 *
 * Returns the command to dispatch, or null for anything the app does not claim.
 */
export function shortcutFor(event: ShortcutEvent): string | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  switch (event.key.toLowerCase()) {
    case 'z':
      return event.shiftKey ? 'edit:redo' : 'edit:undo'
    case 'y':
      return 'edit:redo'
    case 'c':
      return 'edit:copy'
    case 'v':
      return 'edit:paste'
    case 'delete':
      return 'edit:clear'
    default:
      return null
  }
}
