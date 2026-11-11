import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/tests/**/*.test.ts',
      'api/**/tests/**/*.test.ts',
      'supabase/tests/**/*.test.ts',
      'scripts/tests/**/*.test.ts',
      'apps/web/tests/**/*.test.ts',
    ],
    globals: false,
  },
});
