import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',          // Make sure index.html in root is served
  server: {
    open: true        // Open browser automatically
  },
  build: {
    outDir: 'dist'    // Production build output folder
  }
});
