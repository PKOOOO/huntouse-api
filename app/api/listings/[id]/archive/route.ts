import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { listingInclude, loadOwnListing, serializeOwnListing } from '@/lib/listings';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/listings/:id/archive — take a listing down (kept for history and stats). */
export async function POST(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id);
  if (loaded.response) return loaded.response;
  if (loaded.listing.status === 'ARCHIVED') {
    return NextResponse.json(serializeOwnListing(loaded.listing));
  }
  const updated = await prisma.listing.update({
    where: { id: loaded.listing.id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
    include: listingInclude,
  });
  return NextResponse.json(serializeOwnListing(updated));
}
