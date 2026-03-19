import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import { autoSaveLogsPlugin } from './vite-plugin-auto-save-logs'

// https://vite.dev/config/
export default defineConfig({
  base: '/range-warp/',
  plugins: [
    vue(),
    tailwindcss(),
    process.env.NODE_ENV === 'development' && VueDevTools(),
    process.env.NODE_ENV === 'development' && autoSaveLogsPlugin(),
  ],
})
