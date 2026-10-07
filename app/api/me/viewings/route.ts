import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeForSeeker, viewingInclude } from '@/lib/viewings';

/** GET /api/me/viewings[?listingId=] — viewings the signed-in renter asked for (newest first). */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const listingId = new URL(req.url).searchParams.get('listingId') ?? undefined;
  const viewings = await prisma.viewingRequest.findMany({
    where: { seekerId: user.id, ...(listingId && { listingId }) },
    include: viewingInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ viewings: viewings.map(serializeForSeeker) });
}
