import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /* 🌍 Inside the built JS and CSS, files refer to each other relatively: wherever the first file came from — the
     site's own address, or on iwopo.com Cloudflare's CDN (cdn.iwopo.com, which nginx swaps into index.html) — every
     chunk, preload and font after it comes from the same place. index.html itself keeps "/assets/…", so staging
     and any server without the CDN work exactly as before (Raj, 2026-11-08). */
  experimental: {
    renderBuiltUrl: (file, { hostType }) => (hostType === 'js' || hostType === 'css' ? { relative: true } : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
