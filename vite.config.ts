import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build runs from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [
    // Installable app ("Zum Startbildschirm") that opens without browser bars and works offline.
    VitePWA({
      registerType: 'autoUpdate',
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
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
