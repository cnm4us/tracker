// Minimal service worker to enable installability and claim clients
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

// Pass-through fetch (no offline caching yet)
self.addEventListener('fetch', () => {})

