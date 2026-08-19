/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

// SQL integration suite — hits a real Postgres via DATABASE_URL and rolls back
// every transaction. Separate from the fast unit suite (vitest.config.ts) so
// `npm test` never needs a database.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.itest.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20000
  }
})
