import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const vendorChunk = (id: string) => {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('radix') || id.includes('cmdk')) return 'radix'
  if (id.includes('lucide')) return 'icons'
  if (id.includes('/three/')) return 'three'
  return 'vendor'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { output: { manualChunks: vendorChunk } } },
})
