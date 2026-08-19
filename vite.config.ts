// PATH: vite.config.ts
// Web-only build configuration for LedgiProof.
// Used by `npm run dev:web`, `npm run build:web`, `npm run preview:web`.
// The Electron build still uses `electron.vite.config.ts` independently.

import { defineConfig } from 'vite'
import react            from '@vitejs/plugin-react'
import { resolve }      from 'path'

export default defineConfig({
  plugins: [react()],

  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),

  resolve: {
    alias: {
      '@':        resolve(__dirname, 'src'),
      '@assets':  resolve(__dirname, 'src/assets')
    }
  },

  server: {
    port: 5173,
    strictPort: false,
    host:       true
  },

  build: {
    outDir:      resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap:   false,
    target:      'es2020',

    // Actualizado a rolldownOptions para Vite 8
    rolldownOptions: {
      input: resolve(__dirname, 'src/index.html'),
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
  envDir: resolve(__dirname, '.'),

  // Environment variables accessible in browser code
  // Only VITE_* prefixed vars are exposed
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.npm_package_version ?? '0.1.0'
    )
  }
})