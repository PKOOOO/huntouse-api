import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { loadOwnListing } from '@/lib/listings';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/r2';

type Ctx = { params: Promise<{ id: string; photoId: string }> };

/** DELETE /api/listings/:id/photos/:photoId */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id, photoId } = await params;
  const loaded = await loadOwnListing(user, id, { editable: true });
  if (loaded.response) return loaded.response;

  const photo = loaded.listing.photos.find((p) => p.id === photoId);
  if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.listingPhoto.delete({ where: { id: photo.id } });
  await deleteObject('listings', photo.storageKey);
  return new NextResponse(null, { status: 204 });
}
