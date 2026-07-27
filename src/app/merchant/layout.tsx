import { MerchantNav } from '@/components/merchant/merchant-chrome';

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-56">
      <MerchantNav />
      <main id="main" className="mx-auto max-w-3xl px-4 py-5 pb-24 lg:max-w-5xl lg:pb-8">
        {children}
      </main>
    </div>
  );
}
