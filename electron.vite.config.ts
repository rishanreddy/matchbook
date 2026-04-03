import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  main: {},
  preload: {},
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
      rollupOptions: {
        output: {
          manualChunks(id): string | undefined {
            // Core React ecosystem
            if (id.includes('node_modules/react') || id.includes('react-router-dom')) return 'react'

            // UI libraries
            if (id.includes('@mantine')) return 'mantine'

            // Charts library
            if (id.includes('recharts')) return 'charts'

            // SurveyJS
            if (id.includes('survey-creator-core') || id.includes('survey-creator-react')) {
              return 'survey-creator'
            }
            if (id.includes('survey-react-ui')) return 'survey-react'
            if (id.includes('survey-core')) return 'survey-core'

            // RxDB and persistence layer
            if (id.includes('rxdb') || id.includes('dexie')) return 'database'

            // TBA API client
            if (id.includes('tba-api-v3client') || id.includes('superagent')) return 'tba-api'

            // Icons and state
            if (id.includes('@tabler/icons-react')) return 'icons'
            if (id.includes('zustand')) return 'state'

            return undefined
          },
        },
      },
    },
  },
}))
