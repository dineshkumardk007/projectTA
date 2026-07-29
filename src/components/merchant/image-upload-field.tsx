'use client';

import * as React from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/primitives';
import { ImageOrPlaceholder } from '@/components/ui/generated-image';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * Photo picker for a shop or product.
 *
 * Uploads immediately on selection rather than on form submit. A merchant
 * photographing their counter on a phone wants to see whether the picture is
 * any good straight away, and a failed upload should not also lose the rest of
 * the form they had filled in.
 *
 * The resulting URL rides along in a hidden input, so the surrounding form keeps
 * working exactly as it did — no submit handler needs to know about this.
 */
export function ImageUploadField({
  name,
  label,
  hint,
  shopId,
  folder,
  initialUrl,
  seed,
  emoji,
  aspect = 'wide',
}: {
  /** Form field name carrying the stored URL. */
  name: string;
  label: string;
  hint?: string;
  shopId: string;
  folder: 'shops' | 'products';
  initialUrl?: string | null;
  /** Seed for the placeholder artwork shown before anything is uploaded. */
  seed: string;
  emoji?: string;
  aspect?: 'wide' | 'square';
}) {
  const [url, setUrl] = React.useState<string | null>(initialUrl ?? null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fieldId = `${name}-file`;

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('shopId', shopId);
      body.append('folder', folder);

      const response = await fetch('/api/uploads', { method: 'POST', body });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        toast(data.error ?? 'That image could not be uploaded.', 'error');
        return;
      }

      setUrl(data.url);
      toast('Photo uploaded. Remember to save.');
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setBusy(false);
      // Clear the picker so choosing the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>

      {/* The URL, not the file, is what the form submits. */}
      <input type="hidden" name={name} value={url ?? ''} />

      <div className="flex items-start gap-3">
        <ImageOrPlaceholder
          src={url}
          alt={url ? `Current ${label.toLowerCase()}` : ''}
          seed={seed}
          emoji={emoji}
          rounded="field"
          className={cn('shrink-0 border border-border', aspect === 'wide' ? 'h-20 w-32' : 'size-20')}
        />

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={fieldId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className={cn(
              'block w-full text-sm text-muted',
              'file:mr-3 file:rounded-[var(--radius-field)] file:border-0 file:bg-surface-muted',
              'file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground',
              'hover:file:bg-ink-200/70 disabled:opacity-60',
            )}
          />

          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
            {busy ? (
              <span className="flex items-center gap-1.5 font-semibold text-brand-600">
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                Uploading…
              </span>
            ) : (
              <span>{hint ?? 'JPEG, PNG or WebP, up to 5 MB.'}</span>
            )}

            {url && !busy ? (
              <button
                type="button"
                onClick={() => setUrl(null)}
                className="flex items-center gap-1 font-semibold text-danger-600 hover:underline"
              >
                <Trash2 aria-hidden className="size-3.5" />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!url && !busy ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <ImagePlus aria-hidden className="size-3.5" />
          Without a photo, customers see the coloured placeholder shown here.
        </p>
      ) : null}
    </div>
  );
}
