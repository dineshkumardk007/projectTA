import Link from 'next/link';
import { requireUserPage } from '@/lib/auth/guards';
import { AdminNav } from '@/components/admin/admin-nav';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage(['ADMIN'], '/signin?next=/admin');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-lg font-extrabold">
            Takeaway <span className="text-brand-500">Admin</span>
          </Link>
          <div className="flex-1" />
          <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
          <div className="w-28">
            <SignOutButton />
          </div>
        </div>
        <AdminNav />
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
