import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The dev API listens on IPv4 loopback. Using `localhost` can resolve to IPv6 on
// Windows, causing Vite's proxy to fail even while the server is healthy on 4822.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4822';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // `SlotGallery` is the dev-only `?dev=gallery` inspector — kept in the build so it works
        // on a deployed demo, but no reason to precache it into every install.
        globIgnores: ['**/SlotGallery-*.js'],
      },
      manifest: {
        name: 'Nohm',
        short_name: 'Nohm',
        description: 'Votre centre de contrôle personnel, local et rapide',
        lang: 'fr',
        display: 'standalone',
        background_color: '#05070d',
        theme_color: '#111119',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // React and the animation library are large and change far less often than app code —
        // giving each its own chunk keeps a normal deploy from busting their cache for every
        // returning PWA client (the service worker re-downloads only what actually changed).
        manualChunks(id) {
          if (/node_modules[/\\](motion|motion-dom|motion-utils|framer-motion)[/\\]/.test(id)) {
            return 'motion';
          }
          if (/node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    // Tailscale Serve forwards the dashboard's HTTPS hostname to this local dev server.
    // Vite otherwise rejects that Host header before the app or API proxy can respond.
    // A leading-dot entry allows any MagicDNS hostname, so no edit per machine/tailnet.
    allowedHosts: ['.ts.net'],
    proxy: {
      // Dev server only — kept on a different port than the launchd-managed production
      // `npm start` instance (4821) so a dev session never fights it for the port.
      '/api': apiProxyTarget,
    },
  },
});
