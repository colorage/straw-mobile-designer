import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Site is served from the custom domain root (spider.siaroza.com), not the
// /straw-mobile-designer/ project-pages path — base must be '/' or JS/CSS 404.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
