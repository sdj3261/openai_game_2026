import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/openai_game_2026/',
  build: {
    sourcemap: true,
    target: 'es2022',
  },
})
