/**
 * Maps / distance provider abstraction.
 *
 * The app only ever needs two things from a map provider: how far away a
 * customer is, and how long it will take them to get there. Keeping the surface
 * that small means swapping Haversine for Google Distance Matrix (or OSRM, or
 * Mapbox) is a one-file change with no callers to update.
 *
 * Safe to import from client components — the Haversine implementation is pure
 * arithmetic and no secret ever reaches here.
 */

export type LatLng = { latitude: number; longitude: number };

export type TravelMode = 'walking' | 'driving';

export type TravelEstimate = {
  distanceKm: number;
  durationMinutes: number;
  mode: TravelMode;
  /** True when the number came from a real routing service rather than a model. */
  precise: boolean;
};

export interface MapsProvider {
  readonly name: string;
  estimateTravel(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate>;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * No API key, no network call, works offline.
 *
 * Straight-line distance is optimistic on a real street grid, so it is inflated
 * by a detour factor before being converted to time. Speeds are deliberately
 * conservative for dense Indian neighbourhood streets.
 */
export class HaversineMapsProvider implements MapsProvider {
  readonly name = 'haversine';

  private static readonly DETOUR_FACTOR = 1.3;
  private static readonly SPEED_KMH: Record<TravelMode, number> = {
    walking: 4.5,
    driving: 18,
  };

  async estimateTravel(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate> {
    const straightKm = haversineKm(from, to);
    const routeKm = straightKm * HaversineMapsProvider.DETOUR_FACTOR;
    const hours = routeKm / HaversineMapsProvider.SPEED_KMH[mode];

    return {
      distanceKm: Number(straightKm.toFixed(2)),
      durationMinutes: Math.max(1, Math.round(hours * 60)),
      mode,
      precise: false,
    };
  }
}

/**
 * Placeholder for the real integration. It intentionally throws rather than
 * silently returning bad numbers: `getMapsProvider()` only selects it when a key
 * is actually configured, and the implementation should be filled in then.
 */
export class GoogleMapsProvider implements MapsProvider {
  readonly name = 'google';

  constructor(private readonly apiKey: string) {}

  async estimateTravel(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate> {
    void this.apiKey;
    void from;
    void to;
    void mode;
    throw new Error(
      'GoogleMapsProvider is not implemented yet. Set MAPS_PROVIDER=haversine, or implement the Distance Matrix call here.',
    );
  }
}

/** "1.2 km" / "800 m" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
