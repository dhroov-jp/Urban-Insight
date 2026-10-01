import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify, file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Proxy to the FastAPI backend (see /server) so the frontend can call
      // /api/construction/... and load /static/thumbnails/... without CORS
      // setup or hardcoding a host. Set VITE_API_BASE_URL to skip the proxy
      // and call an absolute backend URL instead (e.g. in production).
      proxy: env.VITE_API_BASE_URL
        ? undefined
        : {
            '/api': { target: 'http://localhost:8000', changeOrigin: true },
            '/static': { target: 'http://localhost:8000', changeOrigin: true },
          },
    },
  };
});
