'use client';

import * as React from 'react';

/**
 * The customer's location.
 *
 * Location is what powers distance, "how far away am I" and the travel-time
 * synchronisation, but it is optional everywhere: the app must be fully usable
 * for someone who declines the permission prompt. When there is no fix, we fall
 * back to the launch city centre and say so.
 */

export type Coordinates = { latitude: number; longitude: number };

export type LocationState = {
  coords: Coordinates | null;
  label: string;
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
  request: () => void;
};

/** Launch neighbourhood — used until the customer shares a real position. */
const FALLBACK = { coords: { latitude: 8.7642, longitude: 78.1348 }, label: 'Tuticorin' };

const STORAGE_KEY = 'takeaway.location.v1';

const LocationContext = React.createContext<LocationState | null>(null);

export function useLocation() {
  const ctx = React.useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>.');
  return ctx;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = React.useState<Coordinates | null>(null);
  const [status, setStatus] = React.useState<LocationState['status']>('idle');

  React.useEffect(() => {
    // Restoring a previously granted position from localStorage on mount — see
    // the note in cart-store.tsx for why this cannot be a lazy initialiser.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCoords(JSON.parse(raw) as Coordinates);
        setStatus('granted');
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const request = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCoords(next);
        setStatus('granted');
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const value = React.useMemo<LocationState>(
    () => ({
      coords: coords ?? FALLBACK.coords,
      label: coords ? 'Your location' : FALLBACK.label,
      status,
      request,
    }),
    [coords, status, request],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
