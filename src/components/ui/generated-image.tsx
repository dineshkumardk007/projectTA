import { cn } from '@/lib/cn';

/**
 * Deterministic placeholder artwork for shops and products that have no
 * uploaded photo yet.
 *
 * A real photo always wins. But a demo — and a newly-onboarded shop that has not
 * uploaded anything — should still look designed rather than broken, and it must
 * work offline, so this generates a stable gradient from the name instead of
 * loading a remote placeholder service.
 */

const PALETTES = [
  ['#fdba74', '#f97316'],
  ['#86efac', '#10b981'],
  ['#93c5fd', '#3b82f6'],
  ['#fca5a5', '#ef4444'],
  ['#c4b5fd', '#8b5cf6'],
  ['#fcd34d', '#f59e0b'],
  ['#5eead4', '#14b8a6'],
  ['#f9a8d4', '#ec4899'],
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function GeneratedImage({
  seed,
  emoji,
  className,
  rounded = 'card',
}: {
  seed: string;
  emoji?: string;
  className?: string;
  rounded?: 'card' | 'field' | 'none';
}) {
  const [from, to] = PALETTES[hash(seed) % PALETTES.length];
  const angle = (hash(seed) % 6) * 30 + 120;

  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center overflow-hidden',
        rounded === 'card' && 'rounded-[var(--radius-card)]',
        rounded === 'field' && 'rounded-[var(--radius-field)]',
        className,
      )}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` }}
    >
      {emoji ? <span className="text-3xl drop-shadow-sm sm:text-4xl">{emoji}</span> : null}
    </div>
  );
}

/**
 * Shows the uploaded image when there is one and falls back to generated
 * artwork otherwise, so no call site has to branch.
 */
export function ImageOrPlaceholder({
  src,
  alt,
  seed,
  emoji,
  className,
  rounded = 'card',
}: {
  src?: string | null;
  alt: string;
  seed: string;
  emoji?: string;
  className?: string;
  rounded?: 'card' | 'field' | 'none';
}) {
  if (!src) return <GeneratedImage seed={seed} emoji={emoji} className={className} rounded={rounded} />;

  // A plain <img>, not next/image: merchant uploads are arbitrary remote or
  // local URLs, and next/image needs a per-host allowlist that a self-serve
  // merchant cannot supply. Revisit once uploads are pinned to one bucket.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(
        'object-cover',
        rounded === 'card' && 'rounded-[var(--radius-card)]',
        rounded === 'field' && 'rounded-[var(--radius-field)]',
        className,
      )}
    />
  );
}
