import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { ListingFields, toListingData } from '@/lib/listing-input';
import {
  deleteListingFiles,
  isEditable,
  LIVE_EDITABLE_FIELDS,
  listingInclude,
  loadOwnListing,
  publicInclude,
  serializeOwnListing,
  serializePublicListing,
} from '@/lib/listings';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/listings/:id — the lister gets their full view (any status); everyone else gets the
 * public view of a LIVE listing. Counts a view when someone other than the lister opens it.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { userId: clerkId } = await auth();
  const listing = await prisma.listing.findUnique({ where: { id }, include: publicInclude });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const viewer = clerkId ? await prisma.user.findUnique({ where: { clerkId }, select: { id: true } }) : null;
  if (viewer?.id === listing.listerId) {
    return NextResponse.json(serializeOwnListing(listing));
  }
  if (listing.status !== 'LIVE') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  await prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  return NextResponse.json(serializePublicListing(listing));
}

/**
 * PATCH /api/listings/:id — edit a DRAFT / REJECTED listing freely. A LIVE listing only accepts
 * LIVE_EDITABLE_FIELDS (price, dates, description, extras); anything else needs a new review.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id);
  if (loaded.response) return loaded.response;
  const { listing } = loaded;

  const parsed = ListingFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  if (listing.status === 'LIVE') {
    const locked = Object.keys(parsed.data).filter(
      (k) => !(LIVE_EDITABLE_FIELDS as readonly string[]).includes(k),
    );
    if (locked.length) {
      return NextResponse.json({ error: 'requires_review', fields: locked }, { status: 409 });
    }
  } else if (!isEditable(listing.status)) {
    return NextResponse.json({ error: 'not_editable', status: listing.status.toLowerCase() }, { status: 409 });
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: toListingData(parsed.data),
    include: listingInclude,
  });
  return NextResponse.json(serializeOwnListing(updated));
}

/** DELETE /api/listings/:id — delete a DRAFT (never submitted). Others are archived instead. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id);
  if (loaded.response) return loaded.response;
  if (loaded.listing.status !== 'DRAFT' || loaded.listing.submittedAt) {
    return NextResponse.json({ error: 'archive_instead' }, { status: 409 });
  }
  await prisma.listing.delete({ where: { id: loaded.listing.id } });
  await deleteListingFiles(loaded.listing);
  return new NextResponse(null, { status: 204 });
}
