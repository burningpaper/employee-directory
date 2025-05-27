import { defineConfig } from 'vite'

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        search: './search.html',
        profile: './profile.html',
        manager: './manager.html'
      }
    }
  }
})
