'use client';

import * as React from 'react';
import { Check, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useLocation } from '@/components/customer/location-store';
import { haversineKm } from '@/lib/providers/maps';

/**
 * "I'm here".
 *
 * Two ways to record arrival, because relying on either alone loses data:
 * a tap works with location switched off, and automatic detection works when
 * the customer forgets to tap. Whichever fires first wins; the server keeps only
 * the first.
 *
 * Recording this is what lets the platform state minutes saved as a measurement
 * rather than an inference — see the note in `transitionOrder`.
 */
export function ArrivalControl({
  orderId,
  shopLatitude,
  shopLongitude,
  initialArrivedAt,
}: {
  orderId: string;
  shopLatitude: number;
  shopLongitude: number;
  initialArrivedAt: string | null;
}) {
  const [arrivedAt, setArrivedAt] = React.useState<string | null>(initialArrivedAt);
  const [pending, setPending] = React.useState(false);
  const { coords, status } = useLocation();
  const { toast } = useToast();

  const report = React.useCallback(
    async (automatic: boolean, position?: { latitude: number; longitude: number }) => {
      const response = await fetch(`/api/orders/${orderId}/arrived`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ automatic, ...position }),
      });
      const data = (await response.json()) as { arrivedAt?: string; error?: string };

      if (!response.ok) {
        // A failed *automatic* attempt is silent — the customer did not ask for
        // it and does not need to know the geofence rejected them.
        if (!automatic) toast(data.error ?? 'We could not record that.', 'error');
        return;
      }

      setArrivedAt(data.arrivedAt ?? new Date().toISOString());
      if (!automatic) toast('The shop knows you are here.');
    },
    [orderId, toast],
  );

  // Automatic detection: once the customer is inside the geofence, record it
  // without waiting for a tap.
  React.useEffect(() => {
    if (arrivedAt || status !== 'granted' || !coords) return;

    const distanceKm = haversineKm(coords, { latitude: shopLatitude, longitude: shopLongitude });
    if (distanceKm > 0.15) return;

    // Reporting arrival to the server — an external system — and `report` is
    // async, so nothing is set synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void report(true, coords);
  }, [arrivedAt, coords, status, shopLatitude, shopLongitude, report]);

  if (arrivedAt) {
    return (
      <Card className="flex items-center gap-3 bg-success-50 p-4 dark:bg-success-500/10">
        <Check aria-hidden className="size-5 shrink-0 text-success-600" />
        <p className="text-sm font-semibold text-success-700 dark:text-success-100">
          The shop knows you have arrived.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-sm font-bold">Reached the shop?</p>
      <p className="mt-0.5 text-sm text-muted">
        Let the counter know you are waiting — it also tells us how much time you really saved.
      </p>
      <Button
        variant="outline"
        className="mt-3 w-full"
        loading={pending}
        onClick={async () => {
          setPending(true);
          await report(false, status === 'granted' && coords ? coords : undefined);
          setPending(false);
        }}
      >
        <MapPin aria-hidden className="size-4" />
        I&rsquo;m here
      </Button>
    </Card>
  );
}
