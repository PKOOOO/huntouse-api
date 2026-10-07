import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { loadOwnListing, MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_TYPES } from '@/lib/listings';
import { prisma } from '@/lib/prisma';
import { listingPhotoUrl, presignUpload } from '@/lib/r2';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  contentType: z.enum(PHOTO_TYPES as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
});

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * POST /api/listings/:id/photos — register a photo (added at the end) and get a presigned upload
 * URL. The app then PUTs the file straight to R2 with the returned headers.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnListing(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;
  const { listing } = loaded;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  if (listing.photos.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: 'too_many_photos', max: MAX_PHOTOS }, { status: 409 });
  }
  const { contentType, sizeBytes } = parsed.data;
  const storageKey = `listings/${listing.id}/${randomUUID()}.${EXT[contentType]}`;
  const position = (listing.photos.at(-1)?.position ?? -1) + 1;
  const photo = await prisma.listingPhoto.create({
    data: { listingId: listing.id, storageKey, contentType, sizeBytes, position },
  });

  return NextResponse.json(
    {
      photo: { id: photo.id, url: listingPhotoUrl(storageKey) },
      uploadUrl: await presignUpload('listings', storageKey, contentType),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    },
    { status: 201 },
  );
}

