// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Точка входа для попапа
        popup: resolve(__dirname, 'index.html'),
        // Точка входа для фонового скрипта
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        // Заставляем файлы называться предсказуемо: background.js, а не background-x82z.js
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});