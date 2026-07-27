import 'server-only';
import { env, providerReadiness } from '@/lib/env';
import { GoogleMapsProvider, HaversineMapsProvider, type MapsProvider } from '@/lib/providers/maps';

let cached: MapsProvider | null = null;

/**
 * Falls back to Haversine when `google` is selected without a key, so a missing
 * secret degrades the estimate rather than breaking checkout.
 */
export function getMapsProvider(): MapsProvider {
  if (cached) return cached;
  cached =
    env.MAPS_PROVIDER === 'google' && providerReadiness.maps
      ? new GoogleMapsProvider(env.MAPS_API_KEY)
      : new HaversineMapsProvider();
  return cached;
}
