/**
 * Today's date in a shop's own timezone, as YYYY-MM-DD.
 *
 * Anything that resets "daily" — order-code sequences, today's specials — must
 * turn over on the *shop's* clock, not the server's. A UTC rollover would reset
 * a Tuticorin shop at 5:30 AM local, in the middle of the breakfast rush.
 *
 * `en-CA` is used because it formats as YYYY-MM-DD, which sorts correctly and
 * compares as a plain string.
 */
export function shopLocalDate(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // An invalid zone must never stop someone ordering.
    return at.toISOString().slice(0, 10);
  }
}
