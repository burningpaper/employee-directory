import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        manager: 'manager.html',
        profile: 'profile.html'
      }
    }
  }
});
