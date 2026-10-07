import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { listingInclude, loadOwnListing, serializeOwnListing } from '@/lib/listings';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ photoIds: z.array(z.string()).min(1) });

/** PUT /api/listings/:id/photos/order — reorder photos; the first one becomes the cover. */
export async function PUT(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const current = loaded.listing.photos.map((p) => p.id);
  const ids = parsed.success ? parsed.data.photoIds : [];
  // Must be exactly the listing's photos, each once.
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((i) => current.includes(i))) {
    return NextResponse.json({ error: 'invalid_order', photoIds: current }, { status: 400 });
  }
  await prisma.$transaction(
    ids.map((id, position) => prisma.listingPhoto.update({ where: { id }, data: { position } })),
  );
  const updated = await prisma.listing.findUniqueOrThrow({ where: { id: loaded.listing.id }, include: listingInclude });
  return NextResponse.json(serializeOwnListing(updated));
}
