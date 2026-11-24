import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset URLs relative so the build works from any GitHub Pages sub-path.
// The quiz screen is a lazily loaded chunk (Markdown + KaTeX + highlight.js + dnd-kit); the start page stays small.
export default defineConfig({ base: './', plugins: [react()], build: { chunkSizeWarningLimit: 1100 } })
