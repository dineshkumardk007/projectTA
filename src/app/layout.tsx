import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { PwaInstallBanner } from '@/components/pwa/pwa-install-banner';

/**
 * Plus Jakarta Sans: geometric enough to feel modern, round enough to feel
 * friendly and local. One family — the hierarchy comes from size and weight,
 * not from mixing typefaces.
 */
const appSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-app-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Takeaway — order ahead, pick up without the wait',
    template: '%s · Takeaway',
  },
  description:
    'Pre-order from local tea shops, juice bars, bakeries and food stalls near you. Your order is prepared while you travel — arrive, scan, collect.',
  applicationName: 'Takeaway',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Takeaway' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Takeaway — order ahead, pick up without the wait',
    description: 'Pre-order from local tea shops, juice bars, bakeries and food stalls near you. Arrive, scan, collect.',
    url: 'https://takeaway.example',
    siteName: 'Takeaway',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Takeaway — order ahead, pick up without the wait',
    description: 'Pre-order from local tea shops, juice bars, bakeries and food stalls near you.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f97316' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled — disabling it is an accessibility failure, and the
  // layout is built to tolerate it.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appSans.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only rounded-md bg-brand-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
        <PwaInstallBanner />
      </body>
    </html>
  );
}
