import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — mirrors the path aliases declared in tsconfig.json
 * so unit tests can import from `@/...` like the application does.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@messages': path.resolve(__dirname, './messages')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
