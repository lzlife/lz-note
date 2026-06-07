import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }
          if (
            normalizedId.includes('/node_modules/@base-ui/') ||
            normalizedId.includes('/node_modules/lucide-react/') ||
            normalizedId.includes('/node_modules/next-themes/') ||
            normalizedId.includes('/node_modules/react-resizable-panels/') ||
            normalizedId.includes('/node_modules/sonner/') ||
            normalizedId.includes('/node_modules/zustand/')
          ) {
            return 'vendor-ui'
          }
          if (normalizedId.includes('/node_modules/vditor/')) {
            return 'editor-vditor'
          }
          if (normalizedId.includes('/src/lib/gitSync')) {
            return 'git-sync'
          }
          if (
            normalizedId.includes('/src/lib/exportManager')
          ) {
            return 'note-export'
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: './'
})
