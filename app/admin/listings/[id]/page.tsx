import Link from 'next/link';
import { notFound } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { listingDocumentViewUrls, listingInclude, missingForSubmit } from '@/lib/listings';
import { listingPhotoUrl } from '@/lib/r2';

import { approve, reject, takeDown } from './actions';

const DOC_LABELS: Record<string, string> = {
  OWNERSHIP_PROOF: 'Proof of ownership',
  MANDATE: 'Owner’s mandate',
};

const kes = (n: number | null) => (n === null ? null : `KES ${n.toLocaleString('en-KE')}`);
const label = (v: string | null) => v && v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function ReasonForm({
  action,
  title,
  hint,
  placeholder,
  button,
  showError,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  hint?: string;
  placeholder: string;
  button: string;
  showError: boolean;
}) {
  return (
    <form action={action} className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-sm text-zinc-500">{hint}</p>}
      <textarea
        name="reason"
        required
        minLength={5}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 p-2 text-sm"
      />
      {showError && <p className="text-sm text-red-700">Please give a reason (5+ characters).</p>}
      <button className="rounded-full border border-zinc-300 px-5 py-2 font-medium hover:bg-zinc-100">{button}</button>
    </form>
  );
}

/** One listing: photos, details, private location, documents, and approve / reject. */
export default async function ListingDetail({ params, searchParams }: PageProps<'/admin/listings/[id]'>) {
  const { id } = await params;
  const { error } = await searchParams;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      ...listingInclude,
      lister: true,
      agency: true,
      reviewedBy: { select: { email: true } },
    },
  });
  if (!listing) notFound();

  const [docs, hostVerification, otherListings] = await Promise.all([
    listingDocumentViewUrls(listing),
    prisma.verificationRequest.findFirst({
      where: { userId: listing.listerId, kind: listing.listerType, status: 'APPROVED' },
      select: { id: true },
      orderBy: { reviewedAt: 'desc' },
    }),
    prisma.listing.count({ where: { listerId: listing.listerId, id: { not: listing.id } } }),
  ]);
  const missing = missingForSubmit(listing);
  const listerName = [listing.lister.firstName, listing.lister.lastName].filter(Boolean).join(' ') || 'No name';
  const hasPin = listing.latitude !== null && listing.longitude !== null;

  return (
    <div className="space-y-6">
      <Link href="/admin/listings" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Back to listings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{listing.title ?? 'Untitled'}</h1>
          <p className="text-zinc-500">
            {[listing.area, listing.county].filter(Boolean).join(', ')} · {kes(listing.monthlyRentKes)}/month
          </p>
        </div>
        <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-medium">
          {label(listing.status)} · {label(listing.availability)}
        </span>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Lister</h2>
        <p>
          <span className="font-medium">{listerName}</span>{' '}
          <span className="text-zinc-500">{listing.lister.email}</span>
        </p>
        <p className="text-sm text-zinc-600">
          {listing.listerType === 'OWNER' ? 'Direct owner' : `Agent · ${listing.agency?.name ?? 'no agency'}`} ·{' '}
          {hostVerification ? (
            <Link href={`/admin/verifications/${hostVerification.id}`} className="text-[#EC6846] underline">
              verification
            </Link>
          ) : (
            <span className="font-semibold text-red-700">no approved verification</span>
          )}{' '}
          · {otherListings} other listing{otherListings === 1 ? '' : 's'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Photos ({listing.photos.length})</h2>
        <p className="text-sm text-zinc-500">
          Check the photos are real (not stock or copied from another site), match the description, and show no
          phone numbers or watermarks. The first photo is the cover.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {listing.photos.map((p, i) => (
            <a key={p.id} href={listingPhotoUrl(p.storageKey)} target="_blank" rel="noreferrer" className="relative block">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2 public URL, no optimizer configured */}
              <img src={listingPhotoUrl(p.storageKey)} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-md bg-zinc-100 object-cover" />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">Cover</span>
              )}
            </a>
          ))}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <Field label="Type" value={label(listing.propertyType)} />
        <Field label="Bedrooms" value={listing.bedrooms} />
        <Field label="Bathrooms" value={listing.bathrooms} />
        <Field label="Size" value={listing.sizeSqm && `${listing.sizeSqm} m²`} />
        <Field label="Furnishing" value={label(listing.furnishing)} />
        <Field label="Available from" value={listing.availableFrom?.toLocaleDateString('en-KE') ?? 'Now'} />
        <Field label="Rent" value={kes(listing.monthlyRentKes)} />
        <Field label="Deposit" value={kes(listing.depositKes)} />
        <Field label="Service charge" value={kes(listing.serviceChargeKes)} />
        <div className="col-span-full">
          <Field label="Amenities" value={listing.amenities.map((a) => label(a.toUpperCase())).join(', ') || null} />
        </div>
        <div className="col-span-full">
          <dt className="text-sm text-zinc-500">Description</dt>
          <dd className="whitespace-pre-line">{listing.description ?? '—'}</dd>
        </div>
      </dl>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Exact location (private)</h2>
        <p>{listing.addressLine ?? 'No address line'}</p>
        {hasPin ? (
          <a
            href={`https://www.google.com/maps?q=${listing.latitude},${listing.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#EC6846] underline">
            Open pin in Google Maps ({listing.latitude?.toFixed(5)}, {listing.longitude?.toFixed(5)})
          </a>
        ) : (
          <p className="text-sm text-red-700">No map pin</p>
        )}
        <p className="mt-1 text-sm text-zinc-500">
          Seekers only see “{listing.area}, {listing.county}”. Check the pin matches that area.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-zinc-500">No documents.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-500">
              The name on the document should match the lister ({listerName}) and the property. Links expire in 5
              minutes — reload if needed.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {docs.map((d) => (
                <figure key={d.kind} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  <figcaption className="border-b border-zinc-200 px-3 py-2 text-sm font-medium">
                    {DOC_LABELS[d.kind] ?? d.kind}
                  </figcaption>
                  {d.contentType === 'application/pdf' ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="block p-6 text-center text-[#EC6846] underline">
                      Open PDF
                    </a>
                  ) : (
                    <a href={d.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, can't be optimized */}
                      <img src={d.url} alt={DOC_LABELS[d.kind]} className="h-64 w-full bg-zinc-100 object-contain" />
                    </a>
                  )}
                </figure>
              ))}
            </div>
          </>
        )}
        {missing.length > 0 && <p className="text-sm text-red-700">Missing: {missing.join(', ')}</p>}
      </section>

      {(listing.reviewedAt || listing.rejectionReason) && (
        <dl className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <Field
            label="Last reviewed"
            value={listing.reviewedAt && `${listing.reviewedAt.toLocaleDateString('en-KE')} by ${listing.reviewedBy?.email ?? '—'}`}
          />
          <Field label="Reason" value={listing.rejectionReason} />
        </dl>
      )}

      {listing.status === 'PENDING_REVIEW' && (
        <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2">
          <form action={approve.bind(null, listing.id)} className="space-y-2">
            <h3 className="font-semibold">Approve</h3>
            <p className="text-sm text-zinc-500">Publishes the listing to seekers.</p>
            <button className="rounded-full bg-[#EC6846] px-5 py-2 font-medium text-white hover:opacity-90">
              Approve
            </button>
          </form>
          <ReasonForm
            action={reject.bind(null, listing.id)}
            title="Reject"
            placeholder="Tell the lister what to fix, e.g. 'Photo 3 has a phone number on it — please remove it.'"
            button="Reject"
            showError={error === 'reason'}
          />
        </section>
      )}

      {listing.status === 'LIVE' && (
        <section className="rounded-lg border border-red-200 bg-white p-4">
          <ReasonForm
            action={takeDown.bind(null, listing.id)}
            title="Take down"
            hint="Removes a live listing (e.g. reported as a scam). The lister sees the reason."
            placeholder="Reason for taking this listing down"
            button="Take down"
            showError={error === 'reason'}
          />
        </section>
      )}
    </div>
  );
}
