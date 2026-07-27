/**
 * Money is always integer paise. `formatMinor(8000)` → "₹80".
 * Shared by client and server, so no `server-only` import here.
 */

export function formatMinor(minor: number): string {
  const rupees = minor / 100;
  const hasPaise = minor % 100 !== 0;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function rupees(amount: number): number {
  return Math.round(amount * 100);
}
