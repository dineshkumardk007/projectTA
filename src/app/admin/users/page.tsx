import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge, Card } from '@/components/ui/primitives';
import { UserActiveAction } from '@/components/admin/row-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Users' };

export default async function AdminUsersPage() {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
      loginCount: true,
      customerProfile: {
        select: {
          ordersPlaced: true,
          ordersCompleted: true,
          ordersCancelled: true,
          ordersAbandoned: true,
          isCashOnPickupBlocked: true,
        },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Users</h1>
        <p className="text-sm text-muted">
          Reliability counters are internal only — they are never shown to customers or merchants.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Name</th>
              <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
              <th scope="col" className="px-4 py-3 font-semibold">Role</th>
              <th scope="col" className="px-4 py-3 font-semibold">Reliability</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sign-ins</th>
              <th scope="col" className="px-4 py-3 font-semibold">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    {user.name}
                  </Link>
                  {user.customerProfile?.isCashOnPickupBlocked ? (
                    <p className="mt-0.5 text-xs font-normal text-warning-600">Cash on pickup blocked</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">
                  <p>{user.email}</p>
                  <p className="text-xs">{user.phone ?? '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={user.role === 'ADMIN' ? 'brand' : 'neutral'}>{user.role}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {user.customerProfile ? (
                    <>
                      {user.customerProfile.ordersCompleted}/{user.customerProfile.ordersPlaced} completed
                      {user.customerProfile.ordersCancelled > 0
                        ? ` · ${user.customerProfile.ordersCancelled} cancelled`
                        : ''}
                      {user.customerProfile.ordersAbandoned > 0
                        ? ` · ${user.customerProfile.ordersAbandoned} not collected`
                        : ''}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-muted">
                  {user.loginCount > 0 ? (
                    <>
                      {user.loginCount}
                      <p>
                        last{' '}
                        {user.lastLoginAt
                          ? user.lastLoginAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                      </p>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={user.isActive ? 'success' : 'danger'}>
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </Badge>
                    <UserActiveAction userId={user.id} isActive={user.isActive} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
