import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') }
    }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          previewWindow: resolve(__dirname, 'src/preload/previewWindow.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          previewWindow: resolve(__dirname, 'src/renderer/previewWindow.html')
        }
      }
    }
  }
})
