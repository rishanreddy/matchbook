import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  main: {},
  // Sandboxed Electron preload scripts execute as CommonJS. Loading an ESM `.mjs`
  // file here causes Electron to reject it before the context bridge is available.
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        querystring: 'querystring-es3',
      },
    },
    plugins: [react()],
    build: {
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
    },
  },
}))
