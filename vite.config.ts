import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build runs from any sub-path (e.g. GitHub Pages).
  base: './',
  server: {
    // `npm run api` serves the API locally on 8081.
    proxy: { '/api': 'http://127.0.0.1:8081' },
  },
  define: {
    // Release tag from bin/release.sh (Docker build arg), shown in the app.
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? 'dev'),
  },
  plugins: [
    // Installable app ("Zum Startbildschirm") that opens without browser bars and works offline.
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/shared/update.ts, which also reloads into new versions.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Leonies Lernwelt',
        short_name: 'Lernwelt',
        description: 'Bunte Lern-App für Grundschulkinder – Modul 1: die Uhr lesen lernen.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#fdf6ec',
        theme_color: '#dbeafe',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/healthz/],
        // The plugin sets these for autoUpdate only with injectRegister 'auto';
        // without them a new version waits until every tab is closed.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
