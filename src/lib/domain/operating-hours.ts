import type { ShopStatus } from '@prisma/client';

export type OperatingHourRule = {
  dayOfWeek: number; // 0 = Sun, 6 = Sat
  opensAt: number;   // Minutes past midnight (e.g. 510 = 8:30 AM)
  closesAt: number;  // Minutes past midnight (e.g. 1260 = 9:00 PM)
  isClosed: boolean;
};

export function formatTimeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMins = mins < 10 ? `0${mins}` : mins;
  return `${displayHours}:${displayMins} ${period}`;
}

export function getSmartShopStatus({
  status,
  operatingHours,
}: {
  status: ShopStatus;
  operatingHours?: OperatingHourRule[];
}): { label: string; isOpen: boolean } {
  if (status === 'PAUSED' || status === 'BUSY' || status === 'VERY_BUSY') {
    return { label: `Rush Mode (${status})`, isOpen: true };
  }

  if (status === 'CLOSED') {
    return { label: 'Closed for today', isOpen: false };
  }

  if (!operatingHours || operatingHours.length === 0) {
    return { label: 'Open Now', isOpen: true };
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todayRule = operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!todayRule || todayRule.isClosed) {
    return { label: 'Closed today', isOpen: false };
  }

  if (currentMinutes < todayRule.opensAt) {
    return { label: `Closed • Opens at ${formatTimeFromMinutes(todayRule.opensAt)}`, isOpen: false };
  }

  if (currentMinutes >= todayRule.closesAt) {
    return { label: 'Closed for the night', isOpen: false };
  }

  return { label: `Open • Closes at ${formatTimeFromMinutes(todayRule.closesAt)}`, isOpen: true };
}
