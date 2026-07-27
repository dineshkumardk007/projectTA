'use client';

import * as React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Opt-in for "your order is ready" push notifications.
 *
 * The permission prompt is only ever triggered by this explicit tap — asking on
 * page load is the fastest way to get permanently blocked.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const { toast } = useToast();
  const [state, setState] = React.useState<'unknown' | 'unsupported' | 'off' | 'on' | 'blocked'>('unknown');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    // Feature-detecting browser push support, which is only knowable on the
    // client after mount — see the note in cart-store.tsx.
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
  }, [vapidPublicKey]);

  async function enable() {
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('blocked');
        toast('Notifications are blocked in your browser settings.', 'error');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });

      if (!response.ok) throw new Error('save failed');
      setState('on');
      toast("You'll be notified the moment an order is ready.");
    } catch {
      toast('We could not turn on notifications.', 'error');
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('off');
      toast('Push notifications turned off.');
    } catch {
      toast('We could not turn off notifications.', 'error');
    } finally {
      setPending(false);
    }
  }

  if (state === 'unknown') return null;

  if (state === 'unsupported') {
    return (
      <Card className="flex items-center gap-3 p-4">
        <BellOff aria-hidden className="size-5 shrink-0 text-muted" />
        <p className="text-sm text-muted">
          Push notifications are not configured on this deployment. You will still see updates in the app.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <Bell aria-hidden className="size-5 shrink-0 text-brand-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Ready notifications</p>
        <p className="text-xs text-muted">
          {state === 'blocked'
            ? 'Blocked in your browser settings.'
            : state === 'on'
              ? 'On — we will alert you the moment your order is ready.'
              : 'Get alerted the moment your order is ready.'}
        </p>
      </div>
      {state !== 'blocked' ? (
        <Button
          size="sm"
          variant={state === 'on' ? 'outline' : 'primary'}
          loading={pending}
          onClick={state === 'on' ? disable : enable}
        >
          {state === 'on' ? 'Turn off' : 'Turn on'}
        </Button>
      ) : null}
    </Card>
  );
}

/** VAPID keys are base64url; PushManager wants raw bytes in a plain ArrayBuffer. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
