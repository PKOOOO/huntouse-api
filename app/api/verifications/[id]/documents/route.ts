import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadOwnRequest } from '@/lib/applicant';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteObject, presignUpload } from '@/lib/r2';
import { isAllowedType, MAX_DOCUMENT_BYTES } from '@/lib/verification';

type Ctx = { params: Promise<{ id: string }> };

const KINDS = {
  id_front: 'ID_FRONT',
  id_back: 'ID_BACK',
  selfie: 'SELFIE',
  ownership_proof: 'OWNERSHIP_PROOF',
  agent_license: 'AGENT_LICENSE',
} as const;

const Body = z.object({
  kind: z.enum(['id_front', 'id_back', 'selfie', 'ownership_proof', 'agent_license']),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});

/**
 * POST /api/verifications/:id/documents — register a document and get a presigned upload URL.
 * The app then PUTs the file straight to R2 with the returned headers. Replaces any previous
 * document of the same kind.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnRequest(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const kind = KINDS[parsed.data.kind];
  const { contentType, sizeBytes } = parsed.data;
  if (!isAllowedType(kind, contentType)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }
  if (kind === 'OWNERSHIP_PROOF' && loaded.req.kind !== 'OWNER') {
    return NextResponse.json({ error: 'owners_only' }, { status: 400 });
  }
  if (kind === 'AGENT_LICENSE' && loaded.req.kind !== 'AGENT') {
    return NextResponse.json({ error: 'agents_only' }, { status: 400 });
  }

  const storageKey = `kyc/${user.id}/${loaded.req.id}/${kind.toLowerCase()}-${randomUUID()}`;
  const previous = loaded.req.documents.find((d) => d.kind === kind);
  await prisma.verificationDocument.upsert({
    where: { requestId_kind: { requestId: loaded.req.id, kind } },
    create: { requestId: loaded.req.id, kind, storageKey, contentType, sizeBytes },
    update: { storageKey, contentType, sizeBytes },
  });
  if (previous) await deleteObject(previous.storageKey);

  return NextResponse.json(
    {
      kind: parsed.data.kind,
      uploadUrl: await presignUpload(storageKey, contentType),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    },
    { status: 201 },
  );
}
