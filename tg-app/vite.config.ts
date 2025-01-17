import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: 'buffer/',
    },
  },
  define: {
    global: {},
    'process.env': {},
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    },
    include: ['buffer']
  },
  build: {
    commonjsOptions: {
      include: [/buffer/, /node_modules/]
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'abstraxion-vendor': ['@burnt-labs/abstraxion'],
        }
      }
    }
  }
});
