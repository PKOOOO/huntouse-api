import 'server-only';

import { NextResponse } from 'next/server';

import type { ApiUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Loads one of the signed-in user's own verification requests. `editable` additionally
 * requires DRAFT or REJECTED (a rejected request can be fixed and resubmitted).
 */
export async function loadOwnRequest(user: ApiUser, id: string, { editable = false } = {}) {
  const req = await prisma.verificationRequest.findFirst({
    where: { id, userId: user.id },
    include: { documents: true },
  });
  if (!req) {
    return { response: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  if (editable && req.status !== 'DRAFT' && req.status !== 'REJECTED') {
    return {
      response: NextResponse.json({ error: 'not_editable', status: req.status.toLowerCase() }, { status: 409 }),
    } as const;
  }
  return { req } as const;
}
