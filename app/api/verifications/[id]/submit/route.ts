import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadOwnRequest } from '@/lib/applicant';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { documentsUploaded, missingForSubmit, serializeRequest } from '@/lib/verification';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** The applicant agreed to Huntouse processing their identity documents for verification. */
  consent: z.literal(true),
});

/** POST /api/verifications/:id/submit — send the request for admin review. */
export async function POST(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnRequest(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;

  if (!Body.safeParse(await req.json().catch(() => null)).success) {
    return NextResponse.json({ error: 'consent_required' }, { status: 400 });
  }
  const missing = missingForSubmit(loaded.req);
  if (missing.length) {
    return NextResponse.json({ error: 'incomplete', missing }, { status: 422 });
  }
  const notUploaded = await documentsUploaded(loaded.req);
  if (notUploaded.length) {
    return NextResponse.json(
      { error: 'documents_not_uploaded', documents: notUploaded.map((k) => k.toLowerCase()) },
      { status: 422 },
    );
  }

  const submitted = await prisma.verificationRequest.update({
    where: { id: loaded.req.id },
    data: {
      status: 'PENDING',
      consentAt: new Date(),
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    },
    include: { documents: true },
  });
  return NextResponse.json(serializeRequest(submitted));
}
