import { defineConfig } from 'vite-plus';
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] } },
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    ignorePatterns: ['docs/**', 'blog/**', 'static/**', 'bun.lock'],
  },
  lint: { ignorePatterns: ['docs/**', 'blog/**', 'static/**'] },
});
