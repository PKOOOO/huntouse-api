import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeForSeeker, viewingInclude } from '@/lib/viewings';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/viewings/:id/cancel — the renter withdraws a request (or an accepted viewing). */
export async function POST(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id } = await params;

  const viewing = await prisma.viewingRequest.findFirst({ where: { id, seekerId: user.id } });
  if (!viewing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (viewing.status !== 'REQUESTED' && viewing.status !== 'ACCEPTED') {
    return NextResponse.json({ error: 'not_cancellable', status: viewing.status.toLowerCase() }, { status: 409 });
  }
  const updated = await prisma.viewingRequest.update({
    where: { id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
    include: viewingInclude,
  });
  return NextResponse.json(serializeForSeeker(updated));
}
