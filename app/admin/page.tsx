import Link from 'next/link';

import type { VerificationStatus } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';

const TABS: { status: VerificationStatus; label: string }[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'REJECTED', label: 'Rejected' },
];

/** Verification queue. Pending requests oldest-first, so nobody waits longest. */
export default async function AdminHome({ searchParams }: PageProps<'/admin'>) {
  const { status: raw } = await searchParams;
  const status = TABS.find((t) => t.status === String(raw ?? '').toUpperCase())?.status ?? 'PENDING';

  const [requests, counts] = await Promise.all([
    prisma.verificationRequest.findMany({
      where: { status },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { submittedAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
    }),
    prisma.verificationRequest.groupBy({ by: ['status'], _count: true }),
  ]);
  const countFor = (s: VerificationStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Host verifications</h1>

      <nav className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/admin?status=${t.status.toLowerCase()}`}
            className={`rounded-full px-4 py-1.5 text-sm ${
              t.status === status
                ? 'bg-[#EC6846] text-white'
                : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
            }`}>
            {t.label} ({countFor(t.status)})
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
          Nothing here.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/verifications/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50">
                <div>
                  <p className="font-medium">
                    {[r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || 'No name'}
                    <span className="ml-2 text-sm font-normal text-zinc-500">{r.user.email}</span>
                  </p>
                  <p className="text-sm text-zinc-500">
                    {r.kind === 'OWNER' ? 'Direct owner' : `Agent · ${r.agencyName ?? '—'}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-zinc-500">
                  {r.submittedAt?.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) ?? '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
