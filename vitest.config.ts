import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'tests/**/*.test.ts',
      'apps/web/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  },
});
