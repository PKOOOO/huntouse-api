import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadOwnRequest } from '@/lib/applicant';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { protectIdNumber, serializeRequest } from '@/lib/verification';

type Ctx = { params: Promise<{ id: string }> };

const ID_TYPES = { national_id: 'NATIONAL_ID', passport: 'PASSPORT', alien_id: 'ALIEN_ID' } as const;

const PatchBody = z.object({
  idType: z.enum(['national_id', 'passport', 'alien_id']).optional(),
  idNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{5,20}$/, 'Expected 5–20 letters or digits')
    .optional(),
  earbNumber: z.string().trim().min(2).max(40).optional(),
  agencyName: z.string().trim().min(2).max(120).optional(),
  agencyLocation: z.string().trim().min(2).max(120).optional(),
});

/** GET /api/verifications/:id */
export async function GET(_req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnRequest(user, (await params).id);
  if (loaded.response) return loaded.response;
  return NextResponse.json(serializeRequest(loaded.req));
}

/** PATCH /api/verifications/:id — update ID / agency details while the request is editable. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { user, response } = await requireUser();
  if (response) return response;
  const loaded = await loadOwnRequest(user, (await params).id, { editable: true });
  if (loaded.response) return loaded.response;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const { idType, idNumber, ...agency } = parsed.data;
  if (loaded.req.kind === 'OWNER' && Object.values(agency).some((v) => v !== undefined)) {
    return NextResponse.json({ error: 'agency_fields_for_agents_only' }, { status: 400 });
  }

  const updated = await prisma.verificationRequest.update({
    where: { id: loaded.req.id },
    data: {
      ...agency,
      ...(idType && { idType: ID_TYPES[idType] }),
      ...(idNumber && protectIdNumber(idNumber)),
    },
    include: { documents: true },
  });
  return NextResponse.json(serializeRequest(updated));
}
