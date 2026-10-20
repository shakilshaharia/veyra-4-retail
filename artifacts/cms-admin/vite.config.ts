import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.CMS_API_URL ?? 'http://127.0.0.1:4000';

// The dashboard is always served under /admin: by this dev server locally,
// and by the CMS API process in production.
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: Number(process.env.PORT ?? 3001),
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/uploads': { target: api, changeOrigin: false },
      // Images and videos that ship with the site build are in the media
      // library too; in production they are same-origin, here they come from
      // the site's dev server.
      ...Object.fromEntries(
        ['/figma', '/media', '/veyra-logo.svg', '/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png', '/og-image.jpg'].map((prefix) => [
          prefix,
          { target: process.env.SITE_DEV_URL ?? 'http://127.0.0.1:3000', changeOrigin: true },
        ]),
      ),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
