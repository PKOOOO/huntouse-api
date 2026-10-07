import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  addDays,
  MAX_DAYS_AHEAD,
  MAX_REQUESTS_PER_DAY,
  serializeForSeeker,
  SLOTS,
  todayInKenya,
  viewingInclude,
} from '@/lib/viewings';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  date: z.iso.date(),
  slot: z.enum(['morning', 'afternoon', 'evening']),
  message: z.string().trim().max(500).optional(),
});

/** POST /api/listings/:id/viewings — a renter asks to view a live, vacant listing. */
export async function POST(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const { date, slot, message } = parsed.data;
  const today = todayInKenya();
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) {
    return NextResponse.json({ error: 'invalid_date', maxDaysAhead: MAX_DAYS_AHEAD }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.status !== 'LIVE') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (listing.listerId === user.id) {
    return NextResponse.json({ error: 'own_listing' }, { status: 400 });
  }
  if (listing.availability !== 'VACANT') {
    return NextResponse.json({ error: 'not_vacant' }, { status: 409 });
  }

  // One open request per renter per listing: return it instead of creating a duplicate.
  const open = await prisma.viewingRequest.findFirst({
    where: {
      listingId: id,
      seekerId: user.id,
      status: { in: ['REQUESTED', 'ACCEPTED'] },
      date: { gte: new Date(`${today}T00:00:00Z`) },
    },
    include: viewingInclude,
  });
  if (open) {
    return NextResponse.json({ error: 'already_requested', viewing: serializeForSeeker(open) }, { status: 409 });
  }
  const recent = await prisma.viewingRequest.count({
    where: { seekerId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recent >= MAX_REQUESTS_PER_DAY) {
    return NextResponse.json({ error: 'too_many_requests', max: MAX_REQUESTS_PER_DAY }, { status: 429 });
  }

  const [viewing] = await prisma.$transaction([
    prisma.viewingRequest.create({
      data: {
        listingId: id,
        seekerId: user.id,
        hostId: listing.listerId,
        date: new Date(`${date}T00:00:00Z`),
        slot: SLOTS[slot],
        message: message || null,
      },
      include: viewingInclude,
    }),
    prisma.listing.update({ where: { id }, data: { viewingRequestCount: { increment: 1 } } }),
  ]);
  return NextResponse.json(serializeForSeeker(viewing), { status: 201 });
}
