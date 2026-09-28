import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://bpickert99.github.io/globalties/
export default defineConfig({
  base: '/globalties/',
  plugins: [react()],
})
