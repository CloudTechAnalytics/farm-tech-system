import { defineConfig } from 'vitest/config'

// Database tests run real SQL against the local Supabase stack (`npx supabase start`).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
