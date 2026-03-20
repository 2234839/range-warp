import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import { pilot } from 'vite-plugin-pilot'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    watch: {
      ignored: ['**/.pilot/**'],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    process.env.NODE_ENV === 'development' && VueDevTools(),
    process.env.NODE_ENV === 'development' && pilot(),
  ],
})
