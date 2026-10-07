import Link from 'next/link';
import { notFound } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { documentViewUrls, duplicateIdAccounts, missingForSubmit } from '@/lib/verification';

import { approve, reject } from './actions';

const DOC_LABELS: Record<string, string> = {
  ID_FRONT: 'ID — front',
  ID_BACK: 'ID — back',
  SELFIE: 'Selfie',
  OWNERSHIP_PROOF: 'Proof of ownership',
  AGENT_LICENSE: 'EARB certificate',
};

const ID_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID',
  PASSPORT: 'Passport',
  ALIEN_ID: 'Alien ID',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  );
}

/** One verification request: details, documents (short-lived signed URLs), approve / reject. */
export default async function VerificationDetail({
  params,
  searchParams,
}: PageProps<'/admin/verifications/[id]'>) {
  const { id } = await params;
  const { error } = await searchParams;
  const req = await prisma.verificationRequest.findUnique({
    where: { id },
    include: { documents: true, user: true, reviewedBy: { select: { email: true } } },
  });
  if (!req) notFound();

  const [docs, duplicates] = await Promise.all([documentViewUrls(req), duplicateIdAccounts(req)]);
  const name = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'No name';

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-zinc-500">{req.user.email}</p>
        </div>
        <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-medium">
          {req.kind === 'OWNER' ? 'Direct owner' : 'Agent'} · {req.status.toLowerCase()}
        </span>
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">⚠ This ID number is also used by other accounts:</p>
          <ul className="mt-1 list-inside list-disc text-sm">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/verifications/${d.id}`} className="underline">
                  {d.user.email}
                </Link>{' '}
                ({d.kind.toLowerCase()}, {d.status.toLowerCase()})
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <Field label="ID type" value={req.idType && ID_LABELS[req.idType]} />
        <Field label="ID number (last 4)" value={req.idNumberLast4 && `•••• ${req.idNumberLast4}`} />
        <Field
          label="Submitted"
          value={req.submittedAt?.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
        />
        {req.kind === 'AGENT' && (
          <>
            <Field label="EARB number" value={req.earbNumber} />
            <Field label="Agency" value={req.agencyName} />
            <Field label="Agency location" value={req.agencyLocation} />
          </>
        )}
        {req.reviewedAt && (
          <Field
            label="Reviewed"
            value={`${req.reviewedAt.toLocaleDateString('en-KE')} by ${req.reviewedBy?.email ?? '—'}`}
          />
        )}
        {req.rejectionReason && <Field label="Rejection reason" value={req.rejectionReason} />}
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        <p className="text-sm text-zinc-500">
          Check the selfie matches the ID photo, the name matches the account, and the ID number on
          the card ends in {req.idNumberLast4 ?? '—'}. Links expire in 5 minutes — reload if needed.
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
        {missingForSubmit(req).length > 0 && (
          <p className="text-sm text-red-700">Missing: {missingForSubmit(req).join(', ')}</p>
        )}
      </section>

      {req.status === 'PENDING' && (
        <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2">
          <form action={approve.bind(null, req.id)} className="space-y-2">
            <h3 className="font-semibold">Approve</h3>
            <p className="text-sm text-zinc-500">
              Grants the {req.kind === 'OWNER' ? 'owner' : 'agent'} role and unlocks hosting in the app.
            </p>
            <button className="rounded-full bg-[#EC6846] px-5 py-2 font-medium text-white hover:opacity-90">
              Approve
            </button>
          </form>
          <form action={reject.bind(null, req.id)} className="space-y-2">
            <h3 className="font-semibold">Reject</h3>
            <textarea
              name="reason"
              required
              minLength={5}
              rows={3}
              placeholder="Tell the applicant what to fix, e.g. 'ID photo is blurry — please retake it.'"
              className="w-full rounded-md border border-zinc-300 p-2 text-sm"
            />
            {error === 'reason' && <p className="text-sm text-red-700">Please give a reason (5+ characters).</p>}
            <button className="rounded-full border border-zinc-300 px-5 py-2 font-medium hover:bg-zinc-100">
              Reject
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
