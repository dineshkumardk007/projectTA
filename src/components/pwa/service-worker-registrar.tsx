'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes this installable and resilient on a
 * patchy mobile connection.
 *
 * Registration is deferred until after `load` so it never competes with the
 * first paint — the ordering flow has to feel instant, and a service worker
 * install is not urgent.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    /**
     * Never in development.
     *
     * `sw.js` serves `/_next/static/` cache-first. In production those filenames
     * carry a content hash, so a deploy invalidates them automatically. The dev
     * server reuses stable chunk URLs, so the same rule pins the browser to
     * whatever JavaScript it saw first — you edit a component, reload, and get
     * the old one back, with no indication why.
     *
     * Any worker left over from a previous run is torn down here rather than
     * merely skipped, because an already-installed worker keeps serving stale
     * chunks no matter what this component does next.
     */
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        if (registrations.length === 0) return;
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('takeaway-')).map((key) => caches.delete(key)));
        }
        console.info('[pwa] service worker disabled in development — stale chunk caches cleared');
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('[pwa] service worker registration failed', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
