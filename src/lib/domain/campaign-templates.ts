/**
 * Ready-made campaign copy for the two rushes this platform exists to serve.
 *
 * Pure and client-safe, so the admin composer can offer them without pulling in
 * the server-only campaign service.
 *
 * These are *starting points*, never sent automatically. The copy still has to
 * be read by someone who knows whether the shops in that area are open this
 * afternoon — an automated 4:30 PM push to a neighbourhood where everything is
 * shut is worse than no push at all.
 */

export type CampaignTemplate = {
  id: string;
  label: string;
  title: string;
  body: string;
  href: string;
};

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [
  {
    id: 'snack-rush',
    label: 'Snack rush (4:30 PM)',
    title: 'Tea time ☕',
    body: 'Order now and skip the 5 PM queue — your snack will be ready when you arrive.',
    href: '/shops?openNow=true',
  },
  {
    id: 'breakfast',
    label: 'Breakfast rush (7:45 AM)',
    title: 'Breakfast without the wait',
    body: 'Pre-order idli, dosa and filter coffee near you. Collect on your way in.',
    href: '/shops?openNow=true',
  },
  {
    id: 'new-shops',
    label: 'New shops nearby',
    title: 'New shops near you',
    body: 'A few new places just opened for pre-orders in your area. Take a look.',
    href: '/shops',
  },
] as const;
