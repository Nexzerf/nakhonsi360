import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Runs against a real PostGIS database given by TEST_DATABASE_URL.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/sql/**/*.test.ts'], environment: 'node', testTimeout: 30000, fileParallelism: false },
});
