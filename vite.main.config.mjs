import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['vigemclient'],
    },
  },
  optimizeDeps: {
    exclude: ['vigemclient'],
  },
});
