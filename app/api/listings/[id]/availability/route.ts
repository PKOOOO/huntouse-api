import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { listingInclude, loadOwnListing, serializeOwnListing } from '@/lib/listings';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ availability: z.enum(['vacant', 'taken']) });

/** PUT /api/listings/:id/availability — the one-tap Vacant / Taken switch. */
export async function PUT(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id);
  if (loaded.response) return loaded.response;
  if (loaded.listing.status === 'ARCHIVED') {
    return NextResponse.json({ error: 'archived' }, { status: 409 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const updated = await prisma.listing.update({
    where: { id: loaded.listing.id },
    data: {
      availability: parsed.data.availability === 'vacant' ? 'VACANT' : 'TAKEN',
      // Bumped even when unchanged: "still vacant" is a freshness signal too.
      availabilityUpdatedAt: new Date(),
    },
    include: listingInclude,
  });
  return NextResponse.json(serializeOwnListing(updated));
}
