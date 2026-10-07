import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { DOCUMENT_TYPES, loadOwnListing, MAX_DOCUMENT_BYTES } from '@/lib/listings';
import { prisma } from '@/lib/prisma';
import { deleteObject, presignUpload } from '@/lib/r2';

type Ctx = { params: Promise<{ id: string }> };

const KINDS = { ownership_proof: 'OWNERSHIP_PROOF', mandate: 'MANDATE' } as const;

const Body = z.object({
  kind: z.enum(['ownership_proof', 'mandate']),
  contentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});

/**
 * POST /api/listings/:id/documents — register a private document (e.g. proof of ownership of
 * this property) and get a presigned upload URL to the PRIVATE bucket. Replaces any previous
 * document of the same kind.
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
  const kind = KINDS[parsed.data.kind];
  if (kind === 'OWNERSHIP_PROOF' && listing.listerType !== 'OWNER') {
    return NextResponse.json({ error: 'owners_only' }, { status: 400 });
  }
  if (kind === 'MANDATE' && listing.listerType !== 'AGENT') {
    return NextResponse.json({ error: 'agents_only' }, { status: 400 });
  }
  const { contentType, sizeBytes } = parsed.data;
  const storageKey = `listing-docs/${user.id}/${listing.id}/${kind.toLowerCase()}-${randomUUID()}`;
  const previous = listing.documents.find((d) => d.kind === kind);
  await prisma.listingDocument.upsert({
    where: { listingId_kind: { listingId: listing.id, kind } },
    create: { listingId: listing.id, kind, storageKey, contentType, sizeBytes },
    update: { storageKey, contentType, sizeBytes },
  });
  if (previous) await deleteObject('kyc', previous.storageKey);

  return NextResponse.json(
    {
      kind: parsed.data.kind,
      uploadUrl: await presignUpload('kyc', storageKey, contentType),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    },
    { status: 201 },
  );
}
