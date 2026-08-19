/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

// Node-environment unit tests for the pure money/tax math. No DOM, no plugins —
// these are deterministic calculation checks, the safety net for the ledger.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false
  }
})
