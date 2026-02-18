import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    // Worker bundles (ELK/YAML) are intentionally large and isolated already.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('monaco-editor')) {
            return 'monaco-editor-vendor';
          }

          if (id.includes('@monaco-editor') || id.includes('monaco-yaml')) {
            return 'monaco-yaml-vendor';
          }

          if (
            id.includes('@xyflow') ||
            id.includes('reactflow')
          ) {
            return 'reactflow-vendor';
          }

          if (id.includes('elkjs') || id.includes('cytoscape')) {
            return 'layout-vendor';
          }

          if (id.includes('d3-force') || id.includes('d3-hierarchy')) {
            return 'd3-vendor';
          }

          if (
            id.includes('@mui') ||
            id.includes('@emotion') ||
            id.includes('@fontsource') ||
            id.includes('@popperjs')
          ) {
            return 'ui-vendor';
          }

          if (id.includes('yaml') || id.includes('ajv')) {
            return 'yaml-vendor';
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
      '@tmfunctions': '/src/tmfunctions',
      '@theme': '/src/theme',
    },
  },
});
