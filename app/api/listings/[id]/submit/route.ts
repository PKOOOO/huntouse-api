import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import {
  filesNotUploaded,
  listerTypesFor,
  listingInclude,
  loadOwnListing,
  missingForSubmit,
  serializeOwnListing,
} from '@/lib/listings';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/listings/:id/submit — send a DRAFT / REJECTED listing for admin review. */
export async function POST(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;
  const { listing } = loaded;

  if (!listerTypesFor(user).includes(listing.listerType)) {
    return NextResponse.json({ error: 'verification_required' }, { status: 403 });
  }
  const missing = missingForSubmit(listing);
  if (missing.length) {
    return NextResponse.json({ error: 'incomplete', missing }, { status: 422 });
  }
  const notUploaded = await filesNotUploaded(listing);
  if (notUploaded.photos.length || notUploaded.documents.length) {
    return NextResponse.json({ error: 'files_not_uploaded', ...notUploaded }, { status: 422 });
  }

  const submitted = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: 'PENDING_REVIEW',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    },
    include: listingInclude,
  });
  return NextResponse.json(serializeOwnListing(submitted));
}
