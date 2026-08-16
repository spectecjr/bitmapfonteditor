import { join } from 'node:path'
import { app } from 'electron'

/**
 * Where the bundled sample fonts live on disk. In a packaged build,
 * electron-builder's `extraResources` copies sample/ next to app.asar rather
 * than inside it, so it stays a normal, browsable folder a user can point
 * File ▸ Open Font… at directly; in dev it's just the project's own sample/.
 */
export function sampleFontsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'sample') : join(__dirname, '../../sample')
}
