'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-brand-500/30 bg-surface/95 p-3.5 shadow-2xl backdrop-blur flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white font-bold text-lg">
        ⚡
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-bold text-foreground">Install Takeaway App</h4>
        <p className="text-[11px] text-muted truncate">Add to Home Screen for 1-tap fast pre-ordering</p>
      </div>
      <Button size="sm" variant="primary" className="shrink-0 text-xs" onClick={handleInstall}>
        <Download className="h-3.5 w-3.5 mr-1" />
        Install
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-muted hover:text-foreground p-1"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
