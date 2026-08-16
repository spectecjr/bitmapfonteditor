import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { PreviewWindowSettings } from '@shared/previewApi'

export interface Settings {
  previewWindow: PreviewWindowSettings
  /** Most-recently-opened first. Pruned lazily — see `pruneMissingRecentFiles`. */
  recentFiles: string[]
}

const MAX_RECENT_FILES = 10

const DEFAULTS: Settings = {
  previewWindow: { width: 512, height: 192, zoom: 2, pixelAspect: 'square', wrap: true },
  recentFiles: []
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cached: Settings | null = null

/**
 * Small, infrequent, and only ever touched from main — a synchronous
 * read/write keeps every caller (menu building included) simple rather than
 * threading promises through code that is otherwise synchronous.
 */
function load(): Settings {
  if (cached) return cached
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<Settings>
    cached = {
      previewWindow: { ...DEFAULTS.previewWindow, ...parsed.previewWindow },
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles.filter((p) => typeof p === 'string') : []
    }
  } catch {
    cached = { previewWindow: { ...DEFAULTS.previewWindow }, recentFiles: [] }
  }
  return cached
}

function save(): void {
  if (!cached) return
  try {
    writeFileSync(settingsPath(), JSON.stringify(cached, null, 2), 'utf8')
  } catch (error) {
    // Best-effort — a failed write just means preferences don't persist this run,
    // but it's still worth surfacing rather than failing silently forever.
    console.error('[settings] failed to save', settingsPath(), error)
  }
}

export function getSettings(): Settings {
  return load()
}

export function updatePreviewWindowSettings(patch: Partial<PreviewWindowSettings>): void {
  const settings = load()
  settings.previewWindow = { ...settings.previewWindow, ...patch }
  save()
}

export function getRecentFiles(): string[] {
  return load().recentFiles
}

export function addRecentFile(path: string): void {
  const settings = load()
  settings.recentFiles = [path, ...settings.recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT_FILES)
  save()
}

export function removeRecentFile(path: string): void {
  const settings = load()
  settings.recentFiles = settings.recentFiles.filter((p) => p !== path)
  save()
}

/** Drops entries whose file no longer exists. Returns whether anything changed. */
export function pruneMissingRecentFiles(): boolean {
  const settings = load()
  const before = settings.recentFiles.length
  settings.recentFiles = settings.recentFiles.filter((p) => existsSync(p))
  const changed = settings.recentFiles.length !== before
  if (changed) save()
  return changed
}
