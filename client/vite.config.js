import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: '../content/images/*', dest: 'images' }
      ]
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.jsx', '.js', '.ts', '.tsx'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      },
      '/images': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})
