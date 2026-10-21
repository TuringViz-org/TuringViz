import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Keep the generated WASM glue inside the module layout worker.
  worker: { format: 'es' },
  build: {
    // Worker bundles (ELK/Monaco) are intentionally large and isolated already.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Shared helpers must not pull a lazy layout backend into initial load.
          if (id.includes('commonjsHelpers') || id.includes('vite/preload-helper'))
            return 'vendor';
          if (!id.includes('node_modules')) return;

          // Keep the legacy backend out of the eagerly loaded general vendor.
          if (id.includes('/elkjs/')) return 'elk-legacy-vendor';

          if (id.includes('monaco-editor')) {
            return 'monaco-editor-vendor';
          }

          if (id.includes('@monaco-editor')) {
            return 'monaco-react-vendor';
          }

          if (id.includes('@xyflow')) {
            return 'reactflow-vendor';
          }

          if (id.includes('cytoscape')) {
            return 'layout-vendor';
          }

          if (
            id.includes('@mui') ||
            id.includes('@emotion') ||
            id.includes('@fontsource') ||
            id.includes('@popperjs')
          ) {
            return 'ui-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@components': '/src/components',
      '@services': '/src/services',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils',
      '@zustands': '/src/zustands',
      '@mytypes': '/src/mytypes',
      '@tmLanguage': '/src/tmLanguage',
      '@tmfunctions': '/src/tmfunctions',
      '@theme': '/src/theme',
    },
  },
});
