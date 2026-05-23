import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/artist-app/' : '/',
  build: {
    target: ['es2019', 'safari13'],
  },
  plugins: [react()],
}));
