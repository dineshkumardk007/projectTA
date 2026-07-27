import { WifiOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';

/** Served by the service worker when a navigation fails offline. */
export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={<WifiOff aria-hidden className="size-7" />}
        title="You are offline"
        description="Takeaway needs a connection to show live preparation times. Your cart is saved on this device."
      />
    </main>
  );
}
