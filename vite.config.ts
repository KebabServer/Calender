import { defineConfig } from 'vite'
import { randomUUID } from 'node:crypto'
import react from '@vitejs/plugin-react'

const version = `${process.env.GITHUB_SHA?.slice(0, 12) || 'local'}-${randomUUID()}`

// Set VITE_BASE_PATH=/your-repo/ in GitHub Actions for project sites.
export default defineConfig({
  plugins: [react(), {
    name: 'daymark-release-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) })
    },
  }],
  define: { __DAYMARK_BUILD_ID__: JSON.stringify(version) },
  base: process.env.VITE_BASE_PATH || '/',
})
