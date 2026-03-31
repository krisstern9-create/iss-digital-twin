import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

// Plugin for copying Cesium assets to public folder
function cesiumAssetPlugin() {
  return {
    name: 'cesium-asset-plugin',
    configureServer() {
      const cesiumDir = resolve(__dirname, 'node_modules/cesium/Build/Cesium')
      const publicCesiumDir = resolve(__dirname, 'public/cesium')
      if (existsSync(cesiumDir) && !existsSync(publicCesiumDir)) {
        copyDir(cesiumDir, publicCesiumDir)
      }
    },
    buildEnd() {
      const cesiumDir = resolve(__dirname, 'node_modules/cesium/Build/Cesium')
      const publicCesiumDir = resolve(__dirname, 'public/cesium')
      if (existsSync(cesiumDir)) {
        copyDir(cesiumDir, publicCesiumDir)
      }
    }
  }
}

function copyDir(src, dest) {
  if (!existsSync(src)) return
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  for (const item of readdirSync(src)) {
    const srcPath = resolve(src, item)
    const destPath = resolve(dest, item)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export default defineConfig({
  plugins: [react(), cesiumAssetPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'cesium': resolve(__dirname, 'node_modules/cesium')
    }
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/')
  },
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    cors: true,
    // Proxy для обхода CORS при загрузке ресурсов Cesium
    proxy: {
      '/cesium-assets': {
        target: 'https://cesium.com/downloads/cesiumjs/releases/1.139/Build/Cesium',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cesium-assets/, ''),
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'cesium',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          cesium: ['cesium'],
          react: ['react', 'react-dom']
        }
      }
    },
    chunkSizeWarningLimit: 2000
  },
  optimizeDeps: {
    include: ['cesium']
  },
  worker: {
    format: 'es'
  }
})