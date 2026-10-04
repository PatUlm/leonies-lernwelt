import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build runs from any sub-path (e.g. GitHub Pages).
  base: './',
  test: {
    include: ['test/**/*.test.ts'],
  },
});
