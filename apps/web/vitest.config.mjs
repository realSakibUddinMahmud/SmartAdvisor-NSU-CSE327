import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false
  },
  resolve: {
    alias: [
      { find: /^@\/app\/(.*)$/, replacement: path.resolve(__dirname, './app/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './src/$1') }
    ]
  }
});
