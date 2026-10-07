import Link from 'next/link';

import type { ListingStatus } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { listingPhotoUrl } from '@/lib/r2';

const TABS: { status: ListingStatus; label: string }[] = [
  { status: 'PENDING_REVIEW', label: 'Pending' },
  { status: 'LIVE', label: 'Live' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'ARCHIVED', label: 'Archived' },
];

const kes = (n: number | null) => (n === null ? '—' : `KES ${n.toLocaleString('en-KE')}`);

/** Listing review queue. Pending listings oldest-first, so nobody waits longest. */
export default async function ListingsQueue({ searchParams }: PageProps<'/admin/listings'>) {
  const { status: raw } = await searchParams;
  const status = TABS.find((t) => t.status === String(raw ?? '').toUpperCase())?.status ?? 'PENDING_REVIEW';

  const [listings, counts] = await Promise.all([
    prisma.listing.findMany({
      where: { status },
      include: {
        lister: { select: { email: true, firstName: true, lastName: true } },
        photos: { orderBy: { position: 'asc' }, take: 1 },
      },
      orderBy: status === 'PENDING_REVIEW' ? { submittedAt: 'asc' } : { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.listing.groupBy({ by: ['status'], _count: true }),
  ]);
  const countFor = (s: ListingStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Listings</h1>

      <nav className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/admin/listings?status=${t.status.toLowerCase()}`}
            className={`rounded-full px-4 py-1.5 text-sm ${
              t.status === status
                ? 'bg-[#EC6846] text-white'
                : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
            }`}>
            {t.label} ({countFor(t.status)})
          </Link>
        ))}
      </nav>

      {listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
          Nothing here.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {listings.map((l) => (
            <li key={l.id}>
              <Link href={`/admin/listings/${l.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50">
                {l.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- R2 public URL, no optimizer configured
                  <img src={listingPhotoUrl(l.photos[0].storageKey)} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-14 w-20 shrink-0 rounded bg-zinc-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.title ?? 'Untitled'}</p>
                  <p className="truncate text-sm text-zinc-500">
                    {[l.area, l.county].filter(Boolean).join(', ') || '—'} · {kes(l.monthlyRentKes)}/mo ·{' '}
                    {l.listerType === 'OWNER' ? 'Owner' : 'Agent'}{' '}
                    {[l.lister.firstName, l.lister.lastName].filter(Boolean).join(' ') || l.lister.email}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-zinc-500">
                  {(l.submittedAt ?? l.updatedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
