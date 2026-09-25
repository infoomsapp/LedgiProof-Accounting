// PATH: vite.config.mts
// Web build configuration for LedgiProof (`npm run dev` / `build` / `preview`).
// Renamed .ts -> .mts 2026-09-24 so Node loads it as a real ES module
// (uses import.meta.dirname rather than the CommonJS-only import.meta.dirname).

import { defineConfig } from 'vite'
import react            from '@vitejs/plugin-react'
import { resolve }      from 'path'

export default defineConfig({
  plugins: [react()],

  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),

  resolve: {
    alias: {
      '@':        resolve(import.meta.dirname, 'src'),
      '@assets':  resolve(import.meta.dirname, 'src/assets')
    }
  },

  server: {
    port: 5173,
    strictPort: false,
    host:       true
  },

  build: {
    outDir:      resolve(import.meta.dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap:   false,
    target:      'es2020',

    // Actualizado a rolldownOptions para Vite 8
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'src/index.html'),
      output: {
        // manualChunks transformado en función para compatibilidad con Rolldown
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@supabase/supabase-js')) {
              return 'supabase';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query';
            }
            if (id.includes('zustand')) {
              return 'zustand';
            }
          }
        }
      }
    },

    // Chunk size warning threshold
    chunkSizeWarningLimit: 900
  },

  // env files live at project root, not inside src/
  envDir: resolve(import.meta.dirname, '.'),

  // Environment variables accessible in browser code
  // Only VITE_* prefixed vars are exposed
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.npm_package_version ?? '0.1.0'
    )
  }
})