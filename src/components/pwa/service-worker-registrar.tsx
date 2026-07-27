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
