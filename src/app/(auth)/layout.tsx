import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-[14px] bg-brand-500 text-white">
            <Zap aria-hidden className="size-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">Takeaway</span>
        </Link>
        {children}
      </div>
    </main>
  );
}
