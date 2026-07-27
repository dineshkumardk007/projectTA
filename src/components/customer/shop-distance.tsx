'use client';

import { useLocation } from '@/components/customer/location-store';
import { formatDistance, haversineKm } from '@/lib/providers/maps';

/** Appends "· 1.2 km away" once the customer's position is known. */
export function ShopDistance({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { coords, status } = useLocation();
  if (status !== 'granted' || !coords) return null;

  return <span> · {formatDistance(haversineKm(coords, { latitude, longitude }))} away</span>;
}
