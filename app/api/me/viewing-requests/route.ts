import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeForHost, viewingInclude } from '@/lib/viewings';

/** GET /api/me/viewing-requests — requests to view the signed-in host's listings (soonest first). */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const viewings = await prisma.viewingRequest.findMany({
    where: { hostId: user.id },
    include: viewingInclude,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  return NextResponse.json({ viewings: viewings.map(serializeForHost) });
}
