import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { listerTypesFor, listingInclude, serializeOwnListing } from '@/lib/listings';
import { prisma } from '@/lib/prisma';

/** GET /api/me/listings — the signed-in host's listings (all statuses, recently edited first). */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const listings = await prisma.listing.findMany({
    where: { listerId: user.id },
    include: listingInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({
    listerTypes: listerTypesFor(user).map((t) => t.toLowerCase()),
    listings: listings.map(serializeOwnListing),
  });
}
